import { describe, expect, it } from "vitest";
import {
  activeMinutes,
  clipToWindow,
  describeGoal,
  evaluateGoal,
  findDay,
  formatDuration,
  dayWindow,
  localDayKey,
  mergeIntervals,
  readHistory,
  recentHistory,
  recordDay,
  startOfLocalDay,
  todayWindow,
  type UsageInterval,
} from "./screenTimeUsage";

const at = (hour: number, minute = 0) => new Date(2026, 2, 10, hour, minute, 0, 0).getTime();
const span = (fromHour: number, fromMin: number, toHour: number, toMin: number): UsageInterval =>
  ({ start: at(fromHour, fromMin), end: at(toHour, toMin) });
const day = { start: at(0), end: at(23, 59) };

describe("merging usage intervals", () => {
  it("adds separate sessions", () => {
    expect(activeMinutes([span(9, 0, 9, 30), span(14, 0, 14, 15)], day)).toBe(45);
  });

  it("does not double-count two apps used in the same minutes", () => {
    // The trap this whole module exists for: UsageStatsManager reports time per
    // package, so a hand-off or an overlay makes one real hour look like two.
    const overlapping = [span(9, 0, 10, 0), span(9, 30, 10, 30)];
    expect(activeMinutes(overlapping, day)).toBe(90);
  });

  it("does not double-count a session fully inside another", () => {
    expect(activeMinutes([span(9, 0, 11, 0), span(9, 30, 10, 0)], day)).toBe(120);
  });

  it("treats a hand-off at the same instant as continuous, not as a gap", () => {
    expect(activeMinutes([span(9, 0, 9, 30), span(9, 30, 10, 0)], day)).toBe(60);
  });

  it("collapses a long chain of overlaps into one stretch", () => {
    const chain = [span(8, 0, 9, 0), span(8, 45, 10, 0), span(9, 50, 11, 0), span(10, 30, 11, 30)];
    expect(mergeIntervals(chain)).toHaveLength(1);
    expect(activeMinutes(chain, day)).toBe(210);
  });

  it("is not fooled by intervals arriving out of order", () => {
    expect(activeMinutes([span(14, 0, 14, 15), span(9, 0, 9, 30)], day)).toBe(45);
  });

  it("discards reversed, empty and non-finite intervals rather than trusting them", () => {
    const rubbish = [
      { start: at(10, 0), end: at(9, 0) },
      { start: at(10, 0), end: at(10, 0) },
      { start: Number.NaN, end: at(11, 0) },
      { start: at(12, 0), end: Number.POSITIVE_INFINITY },
    ];
    expect(mergeIntervals(rubbish)).toEqual([]);
    expect(activeMinutes(rubbish, day)).toBe(0);
  });

  it("counts nothing when there was no usage", () => {
    expect(activeMinutes([], day)).toBe(0);
  });
});

describe("the day boundary", () => {
  it("splits a session that ran through midnight", () => {
    // Yesterday 23:00 to today 00:40 gives today forty minutes, not a hundred.
    const overnight = [{ start: new Date(2026, 2, 9, 23, 0).getTime(), end: at(0, 40) }];
    expect(activeMinutes(overnight, day)).toBe(40);
  });

  it("ignores usage that belongs entirely to another day", () => {
    const yesterday = [{ start: new Date(2026, 2, 9, 10, 0).getTime(), end: new Date(2026, 2, 9, 12, 0).getTime() }];
    expect(activeMinutes(yesterday, day)).toBe(0);
  });

  it("clips to the window rather than dropping a straddling session", () => {
    const clipped = clipToWindow([span(0, 0, 6, 0)], { start: at(5, 0), end: at(23, 0) });
    expect(clipped).toEqual([{ start: at(5, 0), end: at(6, 0) }]);
  });

  it("starts the day at local midnight, and asks only up to now", () => {
    const now = new Date(2026, 2, 10, 14, 30);
    expect(startOfLocalDay(now)).toBe(at(0));
    const window = todayWindow(now);
    expect(window.start).toBe(at(0));
    expect(window.end).toBe(now.getTime());
  });

  it("covers a whole day, midnight to midnight", () => {
    const window = dayWindow(new Date(2026, 2, 9, 15, 0), new Date(2026, 2, 10, 14, 0));
    expect(window.start).toBe(new Date(2026, 2, 9).getTime());
    expect(window.end).toBe(new Date(2026, 2, 10).getTime());
  });

  it("does not ask about a day that has not finished", () => {
    const now = new Date(2026, 2, 10, 14, 30);
    expect(dayWindow(now, now).end).toBe(now.getTime());
  });

  it("steps the date rather than adding 24 hours, for clock changes", () => {
    // A local day either side of a clock change is 23 or 25 hours long, so a
    // fixed 86,400,000 spills into the neighbouring day or cuts one short.
    // Whatever this machine's zone does, the end must be the next midnight.
    for (const day of [new Date(2026, 2, 29), new Date(2026, 9, 25), new Date(2026, 6, 1)]) {
      const window = dayWindow(day, new Date(2027, 0, 1));
      const nextMidnight = new Date(day);
      nextMidnight.setHours(0, 0, 0, 0);
      nextMidnight.setDate(nextMidnight.getDate() + 1);
      expect(window.end).toBe(nextMidnight.getTime());
    }
  });

  it("names the day by local date, not UTC", () => {
    // Late evening must not roll forward, early morning must not roll back.
    expect(localDayKey(new Date(2026, 2, 10, 23, 30))).toBe("2026-03-10");
    expect(localDayKey(new Date(2026, 2, 10, 0, 15))).toBe("2026-03-10");
  });
});

describe("formatting", () => {
  it("matches the shapes the interface asks for", () => {
    expect(formatDuration(42)).toBe("42m");
    expect(formatDuration(137)).toBe("2h 17m");
    expect(formatDuration(303)).toBe("5h 03m");
  });

  it("handles nothing, an exact hour, and nonsense", () => {
    expect(formatDuration(0)).toBe("0m");
    expect(formatDuration(60)).toBe("1h 00m");
    expect(formatDuration(-5)).toBe("0m");
  });
});

describe("the daily record", () => {
  const entry = (date: string, minutes: number) => ({ date, minutes, measuredAt: `${date}T12:00:00.000Z` });

  it("replaces the figure for a day rather than appending a second one", () => {
    const history = recordDay([entry("2026-03-10", 120)], entry("2026-03-10", 154));
    expect(history).toHaveLength(1);
    expect(findDay(history, "2026-03-10")?.minutes).toBe(154);
  });

  it("keeps days in order and trims to the retention limit", () => {
    let history: ReturnType<typeof entry>[] = [];
    for (let d = 1; d <= 40; d++) history = recordDay(history, entry(`2026-03-${String(d).padStart(2, "0")}`, d));
    expect(history).toHaveLength(30);
    expect(history[0].date).toBe("2026-03-11");
    expect(history[history.length - 1].date).toBe("2026-03-40");
  });

  it("survives unreadable or foreign stored data", () => {
    expect(readHistory({ getItem: () => "not json" })).toEqual([]);
    expect(readHistory({ getItem: () => null })).toEqual([]);
    expect(readHistory({ getItem: () => JSON.stringify([{ nope: true }]) })).toEqual([]);
  });

  it("reports a week with gaps left as gaps, not as zero", () => {
    const history = [entry("2026-03-09", 134), entry("2026-03-10", 182)];
    const week = recentHistory(history, 3, new Date(2026, 2, 10, 9, 0));
    expect(week).toEqual([
      { date: "2026-03-08", minutes: null },
      { date: "2026-03-09", minutes: 134 },
      { date: "2026-03-10", minutes: 182 },
    ]);
  });
});

describe("the screen-time goal", () => {
  const under3h = { target: 180, direction: "below" as const, daily: true };

  it("completes while under the limit and fails once over", () => {
    expect(evaluateGoal(157, under3h)).toMatchObject({ met: true, label: "Completed" });
    expect(evaluateGoal(222, under3h)).toMatchObject({ met: false, label: "Not completed" });
  });

  it("treats exactly the limit as over, for a 'below' goal", () => {
    expect(evaluateGoal(180, under3h).met).toBe(false);
  });

  it("supports a goal that asks for at least so much", () => {
    const atLeast30 = { target: 30, direction: "above" as const, daily: true };
    expect(evaluateGoal(45, atLeast30).met).toBe(true);
    expect(evaluateGoal(30, atLeast30).met).toBe(true);
    expect(evaluateGoal(12, atLeast30).met).toBe(false);
  });

  it("does not claim a result before anything has been measured", () => {
    expect(evaluateGoal(null, under3h)).toMatchObject({ met: false, label: "Not measured yet" });
  });

  it("caps progress once the target is passed", () => {
    expect(evaluateGoal(90, under3h).progress).toBeCloseTo(0.5);
    expect(evaluateGoal(400, under3h).progress).toBe(1);
  });

  it("describes itself the way the interface shows it", () => {
    expect(describeGoal(under3h)).toBe("< 3h 00m");
    expect(describeGoal({ target: 45, direction: "above", daily: true })).toBe("≥ 45m");
  });
});
