import { describe, expect, it } from "vitest";
import { dayKeyOffset, habitKeepRate, habitRun, loadDailyCheckin, markHabit, prepareDailyCheckin, recentDays, shouldResetDailyCheckin } from "./dailyCheckin";

describe("daily check-in reset", () => {
  it("keeps today’s state and resets a prior day", () => {
    expect(shouldResetDailyCheckin("2026-08-25", "2026-08-25")).toBe(false);
    expect(shouldResetDailyCheckin("2026-08-24", "2026-08-25")).toBe(true);
    expect(shouldResetDailyCheckin(undefined, "2026-08-25")).toBe(true);
  });

  it("clears daily fields and completion marks from a prior-day check-in", () => {
    const priorDay = prepareDailyCheckin({ date: "2026-08-24", priority: "Old priority", stepTarget: 8000, stepsSoFar: 7300, sleepHours: 6.5, habits: [{ id: "1", name: "Walk", mode: "build", done: true }] }, "2026-08-25");
    expect(priorDay).toMatchObject({ date: "2026-08-25", priority: "", habits: [{ done: false }] });
    expect(priorDay.stepTarget).toBeUndefined();
    expect(priorDay.stepsSoFar).toBeUndefined();
    expect(priorDay.sleepHours).toBeUndefined();
  });

  it("uses the real storage load path to reset a persisted prior-day check-in", () => {
    const storage = { getItem: () => JSON.stringify({ date: "2026-08-24", priority: "Old", stepTarget: 8000, habits: [{ id: "1", name: "Walk", mode: "build", done: true }] }) };
    expect(loadDailyCheckin(storage, "habit-studio", "2026-08-25")).toMatchObject({ priority: "", habits: [{ done: false }] });
  });
});

describe("the habit record", () => {
  const at = (day: number) => new Date(`2026-03-${String(day).padStart(2, "0")}T12:00:00`);
  const withLog = (days: string[]) => ({ id: "1", name: "Walk", mode: "build" as const, done: false, log: Object.fromEntries(days.map(d => [d, true as const])) });

  it("keeps a day once it is marked, and lets it be unmarked", () => {
    const kept = markHabit(withLog([]), true, "2026-03-10");
    expect(kept.log?.["2026-03-10"]).toBe(true);
    expect(kept.done).toBe(true);
    const cleared = markHabit(kept, false, "2026-03-10");
    expect("2026-03-10" in (cleared.log ?? {})).toBe(false);
    expect(cleared.done).toBe(false);
  });

  it("does not mutate the habit it was given", () => {
    const original = withLog([]);
    markHabit(original, true, "2026-03-10");
    expect(original.log).toEqual({});
  });

  it("survives the daily reset instead of being forgotten", () => {
    // The whole point: yesterday's mark is still there this morning.
    const prepared = prepareDailyCheckin({ date: "2026-03-09", habits: [withLog(["2026-03-09"])] }, "2026-03-10");
    expect(prepared.habits[0].log?.["2026-03-09"]).toBe(true);
    expect(prepared.habits[0].done).toBe(false);   // today is not marked yet
  });

  it("shows today as done when the log already holds it", () => {
    const prepared = prepareDailyCheckin({ date: "2026-03-09", habits: [withLog(["2026-03-10"])] }, "2026-03-10");
    expect(prepared.habits[0].done).toBe(true);
  });

  it("counts a run, and does not break it on an unmarked today", () => {
    expect(habitRun(withLog(["2026-03-08", "2026-03-09", "2026-03-10"]), at(10))).toBe(3);
    expect(habitRun(withLog(["2026-03-08", "2026-03-09"]), at(10))).toBe(2);
    expect(habitRun(withLog(["2026-03-05"]), at(10))).toBe(0);
    expect(habitRun(withLog([]), at(10))).toBe(0);
  });

  it("measures the week without counting days outside it", () => {
    expect(habitKeepRate(withLog(["2026-03-09", "2026-03-10"]), 4, at(10))).toBe(50);
    expect(habitKeepRate(withLog(["2026-01-01"]), 7, at(10))).toBe(0);
  });

  it("lists the week oldest first, ending today", () => {
    expect(recentDays(3, at(10))).toEqual(["2026-03-08", "2026-03-09", "2026-03-10"]);
    expect(dayKeyOffset(-1, at(1))).toBe("2026-02-28");
  });
});
