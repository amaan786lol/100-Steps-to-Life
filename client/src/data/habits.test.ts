import { describe, expect, it } from "vitest";
import {
  activeHabits,
  createHabit,
  currentRun,
  dayKeyOffset,
  keepRate,
  longestRun,
  recentDays,
  todayKey,
  todaySummary,
  toggleDay,
  type Habit,
} from "./habits";

const at = (day: number) => new Date(`2026-03-${String(day).padStart(2, "0")}T12:00:00`);

const habit = (log: string[] = [], over: Partial<Habit> = {}): Habit => ({
  ...createHabit("Read after Maghrib", "build"),
  log: Object.fromEntries(log.map((day) => [day, true])),
  ...over,
});

describe("day keys", () => {
  it("reads a date as its own local day, not the day before", () => {
    // A late evening in a positive-offset zone must not roll back a day.
    expect(todayKey(new Date("2026-03-10T23:30:00"))).toBe("2026-03-10");
    expect(todayKey(new Date("2026-03-10T00:15:00"))).toBe("2026-03-10");
  });

  it("walks backwards and forwards across a month boundary", () => {
    expect(dayKeyOffset(-1, at(1))).toBe("2026-02-28");
    expect(dayKeyOffset(1, new Date("2026-02-28T12:00:00"))).toBe("2026-03-01");
  });

  it("lists a window of days oldest first, ending today", () => {
    const days = recentDays(3, at(10));
    expect(days).toEqual(["2026-03-08", "2026-03-09", "2026-03-10"]);
  });
});

describe("runs", () => {
  it("counts consecutive kept days up to today", () => {
    expect(currentRun(habit(["2026-03-08", "2026-03-09", "2026-03-10"]), at(10))).toBe(3);
  });

  it("still counts a run that ends yesterday, so today is not yet a failure", () => {
    // The day is not over; an unmarked today must not wipe the run.
    expect(currentRun(habit(["2026-03-08", "2026-03-09"]), at(10))).toBe(2);
  });

  it("breaks the run on a genuine gap", () => {
    expect(currentRun(habit(["2026-03-05", "2026-03-06"]), at(10))).toBe(0);
  });

  it("is zero for a habit with nothing logged", () => {
    expect(currentRun(habit([]), at(10))).toBe(0);
  });

  it("finds the longest run anywhere in the log", () => {
    const kept = ["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-07", "2026-03-08"];
    expect(longestRun(habit(kept))).toBe(3);
  });
});

describe("keep rate", () => {
  it("measures kept days across the window", () => {
    expect(keepRate(habit(["2026-03-09", "2026-03-10"]), 4, at(10))).toBe(50);
    expect(keepRate(habit([]), 4, at(10))).toBe(0);
  });

  it("ignores days outside the window", () => {
    expect(keepRate(habit(["2026-01-01"]), 7, at(10))).toBe(0);
  });
});

describe("marking a day", () => {
  it("marks and unmarks without leaving a false entry behind", () => {
    const once = toggleDay(habit(), "2026-03-10");
    expect(once.log["2026-03-10"]).toBe(true);
    const off = toggleDay(once, "2026-03-10");
    expect("2026-03-10" in off.log).toBe(false);
  });

  it("does not touch the habit it was given", () => {
    const original = habit();
    toggleDay(original, "2026-03-10");
    expect(original.log).toEqual({});
  });
});

describe("the list", () => {
  it("keeps both kinds apart and drops archived ones", () => {
    const build = createHabit("Walk", "build");
    const leave = createHabit("Late scrolling", "leave");
    const gone = createHabit("Old one", "build", { archivedAt: new Date().toISOString() });
    expect(activeHabits([build, leave, gone])).toHaveLength(2);
    expect(leave.kind).toBe("leave");
  });

  it("summarises today without claiming success when there is nothing to keep", () => {
    expect(todaySummary([], at(10))).toEqual({ total: 0, kept: 0, allKept: false });
    const one = habit(["2026-03-10"]);
    expect(todaySummary([one], at(10))).toEqual({ total: 1, kept: 1, allKept: true });
  });
});
