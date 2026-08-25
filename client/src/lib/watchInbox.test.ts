import { describe, expect, it } from "vitest";
import type { DailyScreenTime } from "./screenTimeUsage";
import type { WatchReport } from "./watchSession";
import {
  WATCH_CONSUMED_KEY,
  WATCH_INBOX_KEY,
  drainInbox,
  ingestReports,
  readConsumed,
  readInbox,
  shortsOn,
} from "./watchInbox";

const report = (over: Partial<WatchReport> = {}): WatchReport => ({
  id: "r1",
  date: "2026-03-10",
  minutes: 20,
  shorts: 6,
  endedBy: "done",
  ...over,
});

const measured = (date: string, minutes: number): DailyScreenTime =>
  ({ date, minutes, measuredAt: `${date}T20:00:00.000Z` });

/** A localStorage stand-in that records what was written. */
const store = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return {
    data,
    getItem: (key: string) => data[key] ?? null,
    setItem: (key: string, value: string) => { data[key] = value; },
  };
};

describe("reading what the script left", () => {
  it("reads well-formed reports", () => {
    const storage = store({ [WATCH_INBOX_KEY]: JSON.stringify([report()]) });
    expect(readInbox(storage)).toHaveLength(1);
  });

  it("drops malformed reports rather than repairing them", () => {
    // The other half of this contract is a hand-edited userscript, so bad
    // shapes are expected. A repaired number would look just as trustworthy
    // as a real one.
    const storage = store({
      [WATCH_INBOX_KEY]: JSON.stringify([
        report(),
        { id: "", date: "2026-03-10", minutes: 5, shorts: 1 },
        { id: "x", date: "not-a-date", minutes: 5, shorts: 1 },
        { id: "y", date: "2026-03-10", minutes: -5, shorts: 1 },
        { id: "z", date: "2026-03-10", minutes: 5 },
        { id: "w", date: "2026-03-10", minutes: Number.NaN, shorts: 1 },
        "nonsense",
        null,
      ]),
    });
    expect(readInbox(storage).map((item) => item.id)).toEqual(["r1"]);
  });

  it("survives unreadable storage", () => {
    expect(readInbox(store({ [WATCH_INBOX_KEY]: "not json" }))).toEqual([]);
    expect(readInbox(store())).toEqual([]);
    expect(readConsumed(store({ [WATCH_CONSUMED_KEY]: "{}" }))).toEqual([]);
  });
});

describe("folding sessions into the record", () => {
  it("records a day the phone never measured", () => {
    const { history } = ingestReports([], [report()]);
    expect(history[0]).toMatchObject({ date: "2026-03-10", watchMinutes: 20, shorts: 6, minutes: 0 });
  });

  it("adds several sessions in one day", () => {
    // An evening is rarely one sitting.
    const { history, added } = ingestReports([], [
      report({ id: "a", minutes: 20, shorts: 6 }),
      report({ id: "b", minutes: 35, shorts: 11 }),
    ]);
    expect(history[0]).toMatchObject({ watchMinutes: 55, shorts: 17 });
    expect(added).toBe(2);
  });

  it("never counts the same session twice", () => {
    const first = ingestReports([], [report()]);
    const second = ingestReports(first.history, [report()], first.consumed);
    expect(second.history[0].watchMinutes).toBe(20);
    expect(second.added).toBe(0);
  });

  it("leaves the phone's own measurement alone", () => {
    // The two measure different things and must not contaminate each other.
    const { history } = ingestReports([measured("2026-03-10", 300)], [report()]);
    expect(history[0]).toMatchObject({ minutes: 300, watchMinutes: 20 });
  });

  it("keeps a correction the learner already made", () => {
    const day = { ...measured("2026-03-10", 360), discounted: 150, note: "Left playing" };
    const { history } = ingestReports([day], [report()]);
    expect(history[0]).toMatchObject({ discounted: 150, note: "Left playing", watchMinutes: 20 });
  });

  it("keeps days apart", () => {
    const { history } = ingestReports([], [
      report({ id: "a", date: "2026-03-09", minutes: 40, shorts: 3 }),
      report({ id: "b", date: "2026-03-10", minutes: 25, shorts: 9 }),
    ]);
    expect(history).toHaveLength(2);
    expect(shortsOn(history, "2026-03-09")).toBe(3);
    expect(shortsOn(history, "2026-03-10")).toBe(9);
  });

  it("reports no shorts figure for a day nothing was said about", () => {
    // null, not zero: nothing was reported, which is not the same as none.
    expect(shortsOn([measured("2026-03-10", 120)], "2026-03-10")).toBeNull();
  });
});

describe("draining the inbox", () => {
  it("takes the reports and empties what it took", () => {
    const storage = store({ [WATCH_INBOX_KEY]: JSON.stringify([report({ id: "a" }), report({ id: "b" })]) });
    const result = drainInbox(storage, []);
    expect(result.added).toBe(2);
    expect(JSON.parse(storage.data[WATCH_INBOX_KEY])).toEqual([]);
    expect(JSON.parse(storage.data[WATCH_CONSUMED_KEY])).toEqual(["a", "b"]);
  });

  it("does nothing, loudly, when there is nothing to take", () => {
    const storage = store();
    const result = drainInbox(storage, [measured("2026-03-10", 120)]);
    expect(result.added).toBe(0);
    expect(result.history).toHaveLength(1);
    expect(storage.data[WATCH_INBOX_KEY]).toBeUndefined();
  });

  it("does not re-count reports already drained", () => {
    const storage = store({ [WATCH_INBOX_KEY]: JSON.stringify([report()]) });
    const once = drainInbox(storage, []);
    // The script writes the same report again — a retry, or a bad edit.
    storage.data[WATCH_INBOX_KEY] = JSON.stringify([report()]);
    const twice = drainInbox(storage, once.history);
    expect(twice.added).toBe(0);
    expect(twice.history[0].watchMinutes).toBe(20);
  });

  it("keeps a report that arrived while it was draining", () => {
    const storage = store({ [WATCH_INBOX_KEY]: JSON.stringify([report({ id: "a" })]) });
    const original = storage.getItem;
    let call = 0;
    // Second read sees a newly arrived report the drain did not take.
    storage.getItem = (key: string) => {
      if (key === WATCH_INBOX_KEY && ++call === 2) {
        return JSON.stringify([report({ id: "a" }), report({ id: "late" })]);
      }
      return original(key);
    };
    drainInbox(storage, []);
    expect(JSON.parse(storage.data[WATCH_INBOX_KEY]).map((r: WatchReport) => r.id)).toEqual(["late"]);
  });
});
