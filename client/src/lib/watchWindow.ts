/**
 * When watching is allowed, according to the day Sly planned.
 *
 * The schedule already exists — slySchedule builds it from yesterday's real
 * screen time — so this does not invent a second set of hours. It reads the
 * plan and derives the windows: the evening boundary closes the day, and each
 * scheduled block holds its own hour.
 *
 * Everything here is pure and hour-based, so the userscript can ask "is this
 * allowed right now" on every navigation without doing any thinking of its own.
 *
 * A note on what this is. A userscript cannot actually stop anyone: the
 * extension can be disabled, another browser opened, the native app used. This
 * is a friction and a record, not a wall, and the code says so rather than
 * pretending otherwise. What makes it work is the learner reporting their
 * screen time afterwards — the lock is the speed bump, the record is the
 * accountability.
 */

import { commitmentsAt, describeCommitment, type Commitment } from "./commitments";
import type { ScheduleBlock, SlyPlan } from "./slySchedule";

export type WatchWindow = {
  /** Hour the window opens, inclusive. */
  from: number;
  /** Hour it closes, exclusive. */
  to: number;
};

export type WindowVerdict =
  | { allowed: true; until: number }
  | { allowed: false; reason: "boundary" | "block" | "night" | "commitment"; detail: string; opensAt: number | null };

/** The hour the day closes, taken from the plan's own boundary block. */
export function boundaryHourOf(plan: SlyPlan): number {
  const boundary = plan.blocks.find((block) => block.kind === "boundary");
  return boundary ? Number(boundary.time.slice(0, 2)) : 22;
}

/** The hour each scheduled block occupies. */
export const blockHours = (plan: SlyPlan): Array<{ hour: number; block: ScheduleBlock }> =>
  plan.blocks
    .filter((block) => block.kind === "lesson" || block.kind === "habit")
    .map((block) => ({ hour: Number(block.time.slice(0, 2)), block }));

/** Nothing before this counts as morning; the small hours are always closed. */
export const DAY_OPENS = 5;

/**
 * Whether watching is allowed at a given moment, and if not, why and when it
 * opens again. `opensAt` is null when nothing more opens today.
 */
export function watchVerdict(plan: SlyPlan, now = new Date(), commitments: Commitment[] = []): WindowVerdict {
  const hour = now.getHours();
  const boundary = boundaryHourOf(plan);
  const blocked = blockHours(plan);

  // Somewhere to be beats everything else: this is not free time being spent
  // badly, it is time that belongs to something already.
  const booked = commitmentsAt(commitments, now, hour);
  if (booked.length) {
    return {
      allowed: false,
      reason: "commitment",
      detail: `${booked.map(describeCommitment).join(" and ")}. You are meant to be somewhere.`,
      opensAt: Math.max(...booked.map((item) => item.toHour)),
    };
  }

  // The small hours are closed regardless of the plan. Nothing good is being
  // planned for 3am, and the whole point of the boundary is that it holds.
  if (hour < DAY_OPENS) {
    return {
      allowed: false,
      reason: "night",
      detail: "It is the middle of the night. Whatever this is, it will still be there tomorrow.",
      opensAt: DAY_OPENS,
    };
  }

  if (hour >= boundary) {
    return {
      allowed: false,
      reason: "boundary",
      detail: `You put the phone down at ${String(boundary).padStart(2, "0")}:00 today. That was the plan, and it is the one thing that moves tomorrow's number.`,
      opensAt: null,
    };
  }

  const busy = blocked.find((item) => item.hour === hour);
  if (busy) {
    return {
      allowed: false,
      reason: "block",
      detail: `This hour is for: ${busy.block.action}`,
      opensAt: nextOpenHour(plan, hour + 1),
    };
  }

  return { allowed: true, until: nextClosedHour(plan, hour) };
}

/** The next hour at which watching closes, from `fromHour` onwards. */
export function nextClosedHour(plan: SlyPlan, fromHour: number): number {
  const boundary = boundaryHourOf(plan);
  const busy = blockHours(plan).map((item) => item.hour).filter((item) => item >= fromHour);
  return Math.min(boundary, ...(busy.length ? busy : [boundary]));
}

/** The next hour at which watching opens again, or null if not today. */
export function nextOpenHour(plan: SlyPlan, fromHour: number): number | null {
  const boundary = boundaryHourOf(plan);
  const busy = new Set(blockHours(plan).map((item) => item.hour));
  for (let hour = Math.max(fromHour, DAY_OPENS); hour < boundary; hour++) {
    if (!busy.has(hour)) return hour;
  }
  return null;
}

/** The day's open windows, for showing the whole shape at once. */
export function openWindows(plan: SlyPlan): WatchWindow[] {
  const boundary = boundaryHourOf(plan);
  const busy = new Set(blockHours(plan).map((item) => item.hour));
  const windows: WatchWindow[] = [];

  for (let hour = DAY_OPENS; hour < boundary; hour++) {
    if (busy.has(hour)) continue;
    const last = windows[windows.length - 1];
    if (last && last.to === hour) last.to = hour + 1;
    else windows.push({ from: hour, to: hour + 1 });
  }
  return windows;
}

const clock = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

export const describeWindows = (windows: WatchWindow[]) =>
  windows.length ? windows.map((w) => `${clock(w.from)}–${clock(w.to)}`).join(", ") : "nothing open today";

/* --- What Sly says at the door -------------------------------------------- */

/**
 * The line on the lockout screen. Firm about the plan, because that is what was
 * asked for, but it states a fact rather than passing judgement — the learner
 * decided these hours, and this is only holding them to their own decision.
 */
export function lockoutLine(verdict: WindowVerdict): string {
  if (verdict.allowed) return "";
  const opens = verdict.opensAt === null
    ? "Nothing else opens today."
    : `Opens again at ${clock(verdict.opensAt)}.`;
  return `${verdict.detail} ${opens}`;
}

/**
 * Time spent watching when the plan said otherwise. Recorded rather than
 * punished: the record is the thing that holds, and a number nobody argues
 * with is worth more than a telling-off.
 */
export type OffPlanEntry = {
  date: string;
  hour: number;
  minutes: number;
  /** Which rule was crossed: "boundary", "block" or "night". */
  reason: string;
};

export const OFF_PLAN_KEY = "hundred-steps-off-plan-v1";

export function recordOffPlan(entries: OffPlanEntry[], entry: OffPlanEntry, keep = 200): OffPlanEntry[] {
  const existing = entries.find((item) => item.date === entry.date && item.hour === entry.hour);
  const merged = existing
    ? entries.map((item) => (item === existing ? { ...item, minutes: item.minutes + entry.minutes } : item))
    : [...entries, entry];
  return merged.slice(-keep);
}

/** How many separate off-plan hours in the last `days` days. */
export function offPlanCount(entries: OffPlanEntry[], days: number, from = new Date()): number {
  const cutoff = new Date(from);
  cutoff.setDate(cutoff.getDate() - (days - 1));
  cutoff.setHours(0, 0, 0, 0);
  const key = cutoff.toLocaleDateString("en-CA");
  return entries.filter((entry) => entry.date >= key).length;
}
