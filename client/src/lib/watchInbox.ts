/**
 * How a browsing session gets from the watch page into the course.
 *
 * The userscript runs on two kinds of page: the sites where watching happens,
 * and the course itself. On a watch page it counts; on the course page it
 * writes what it counted into this inbox — an ordinary localStorage key on the
 * course's own origin. The course drains the inbox on load.
 *
 * That is the whole bridge. No server, no messaging, no shared origin needed:
 * the one script is a member of both pages, so it can carry the numbers across
 * itself.
 *
 * The contract is deliberately small, because the other half of it lives in a
 * userscript that is edited by hand:
 *
 *   key:   hundred-steps-watch-inbox-v1
 *   value: WatchReport[]   — append-only; the course removes what it consumes
 *
 * Browser watching is kept as its own figure rather than folded into the
 * phone's total. They measure different things — one is every app on the
 * device, the other is one browser — and adding them would double-count the
 * overlap while hiding what neither can see.
 */

import {
  findDay,
  recordDay,
  type DailyScreenTime,
} from "./screenTimeUsage";
import type { WatchReport } from "./watchSession";

export const WATCH_INBOX_KEY = "hundred-steps-watch-inbox-v1";
export const WATCH_CONSUMED_KEY = "hundred-steps-watch-consumed-v1";

/** Ids are remembered so a report cannot be counted twice. */
const CONSUMED_LIMIT = 300;

const isReport = (value: unknown): value is WatchReport => {
  const report = value as WatchReport | null;
  return Boolean(
    report &&
      typeof report.id === "string" && report.id.length > 0 &&
      typeof report.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(report.date) &&
      typeof report.minutes === "number" && Number.isFinite(report.minutes) && report.minutes >= 0 &&
      typeof report.shorts === "number" && Number.isFinite(report.shorts) && report.shorts >= 0,
  );
};

/**
 * Read what the script left. Anything malformed is dropped rather than
 * repaired: the other half of this contract is hand-edited, so bad shapes are
 * expected, and a repaired number would look exactly as trustworthy as a real
 * one.
 */
export function readInbox(storage: Pick<Storage, "getItem">, key = WATCH_INBOX_KEY): WatchReport[] {
  try {
    const raw = JSON.parse(storage.getItem(key) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter(isReport) : [];
  } catch {
    return [];
  }
}

export function readConsumed(storage: Pick<Storage, "getItem">, key = WATCH_CONSUMED_KEY): string[] {
  try {
    const raw = JSON.parse(storage.getItem(key) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export type IngestResult = {
  history: DailyScreenTime[];
  /** Ids now accounted for, newest last, trimmed. */
  consumed: string[];
  /** How many reports actually counted, for the interface to mention. */
  added: number;
};

/**
 * Fold finished sessions into the daily record.
 *
 * Several sessions in a day add up — an evening is rarely one sitting — but the
 * same session arriving twice must not. Reports already seen are skipped on
 * their id.
 */
export function ingestReports(
  history: DailyScreenTime[],
  reports: WatchReport[],
  consumed: string[] = [],
): IngestResult {
  const seen = new Set(consumed);
  let next = history;
  let added = 0;

  for (const report of reports) {
    if (seen.has(report.id)) continue;
    seen.add(report.id);
    added += 1;

    const existing = findDay(next, report.date);
    next = recordDay(next, {
      // A day that only the browser has seen still needs a record to live in.
      // `minutes` stays whatever the phone said — 0 until it says otherwise —
      // so the two measurements never contaminate each other.
      date: report.date,
      minutes: existing?.minutes ?? 0,
      measuredAt: existing?.measuredAt ?? new Date().toISOString(),
      ...(existing?.discounted !== undefined ? { discounted: existing.discounted } : {}),
      ...(existing?.note !== undefined ? { note: existing.note } : {}),
      watchMinutes: (existing?.watchMinutes ?? 0) + Math.round(report.minutes),
      shorts: (existing?.shorts ?? 0) + Math.round(report.shorts),
    });
  }

  return {
    history: next,
    consumed: [...consumed, ...reports.map((report) => report.id).filter((id) => !consumed.includes(id))]
      .slice(-CONSUMED_LIMIT),
    added,
  };
}

/**
 * Drain the inbox into the record and clear it, in one call.
 *
 * The inbox is emptied only for what was actually taken, so a report that
 * arrives while this is running is not lost.
 */
export function drainInbox(
  storage: Pick<Storage, "getItem" | "setItem">,
  history: DailyScreenTime[],
): IngestResult {
  const reports = readInbox(storage);
  if (!reports.length) return { history, consumed: readConsumed(storage), added: 0 };

  const taken = new Set(reports.map((report) => report.id));
  const result = ingestReports(history, reports, readConsumed(storage));

  try {
    const remaining = readInbox(storage).filter((report) => !taken.has(report.id));
    storage.setItem(WATCH_INBOX_KEY, JSON.stringify(remaining));
    storage.setItem(WATCH_CONSUMED_KEY, JSON.stringify(result.consumed));
  } catch {
    /* A full store should not cost the numbers already folded in. */
  }
  return result;
}

/** Shorts watched on a day, or null when nothing has ever been reported. */
export const shortsOn = (history: DailyScreenTime[], date: string) =>
  findDay(history, date)?.shorts ?? null;
