import { describe, expect, it } from "vitest";
import type { Commitment } from "./commitments";
import { defaultGoal } from "./screenTimeUsage";
import { slySchedule, type SlyPlan } from "./slySchedule";
import {
  DAY_OPENS,
  boundaryHourOf,
  describeWindows,
  lockoutLine,
  nextOpenHour,
  offPlanCount,
  openWindows,
  recordOffPlan,
  watchVerdict,
  type OffPlanEntry,
} from "./watchWindow";

const lesson = { day: 12, title: "The Quiet Hour", actionPrompt: "Put the phone in another room for one hour." };
const planFor = (yesterdayMinutes: number | null): SlyPlan =>
  slySchedule({
    lesson,
    habits: [],
    yesterdayMinutes,
    goal: defaultGoal,
    now: new Date(2026, 2, 10, 7, 0),
  });

/** A light day: lesson 10:00, boundary 22:00. */
const light = planFor(90);
/** A heavy day: lesson 09:00, boundary 20:00. */
const heavy = planFor(300);

const at = (hour: number) => new Date(2026, 2, 10, hour, 30);

describe("reading the plan's own hours", () => {
  it("takes the boundary from the plan rather than inventing one", () => {
    expect(boundaryHourOf(light)).toBe(22);
    expect(boundaryHourOf(heavy)).toBe(20);
  });

  it("closes the day earlier when yesterday was heavy", () => {
    // The lockout tightens itself off the real measurement. That is the point.
    expect(watchVerdict(light, at(21)).allowed).toBe(true);
    expect(watchVerdict(heavy, at(21)).allowed).toBe(false);
  });
});

describe("when the door is shut", () => {
  it("shuts after the boundary, with nothing else opening today", () => {
    const verdict = watchVerdict(light, at(23));
    expect(verdict).toMatchObject({ allowed: false, reason: "boundary", opensAt: null });
  });

  it("shuts in the small hours whatever the plan says", () => {
    const verdict = watchVerdict(light, at(3));
    expect(verdict).toMatchObject({ allowed: false, reason: "night" });
    expect(verdict.allowed === false && verdict.opensAt).toBe(DAY_OPENS);
  });

  it("holds the hour a scheduled block occupies, and names what for", () => {
    const verdict = watchVerdict(light, at(10));
    expect(verdict).toMatchObject({ allowed: false, reason: "block" });
    expect(verdict.allowed === false && verdict.detail).toContain(lesson.actionPrompt);
  });

  it("opens again the hour after a block", () => {
    const verdict = watchVerdict(light, at(10));
    expect(verdict.allowed === false && verdict.opensAt).toBe(11);
  });

  it("is open in an ordinary hour between blocks", () => {
    expect(watchVerdict(light, at(15)).allowed).toBe(true);
  });
});

describe("the shape of the day", () => {
  it("joins consecutive open hours into one window", () => {
    const windows = openWindows(light);
    // 05-10 open, 10 held by the lesson, 11-22 open again.
    expect(windows).toEqual([{ from: 5, to: 10 }, { from: 11, to: 22 }]);
  });

  it("shrinks when the day is heavier", () => {
    expect(openWindows(heavy)).toEqual([{ from: 5, to: 9 }, { from: 10, to: 20 }]);
  });

  it("describes itself the way the lockout screen shows it", () => {
    expect(describeWindows(openWindows(light))).toBe("05:00–10:00, 11:00–22:00");
    expect(describeWindows([])).toBe("nothing open today");
  });

  it("finds nothing open once the boundary has passed", () => {
    expect(nextOpenHour(light, 22)).toBeNull();
  });
});

describe("what the lockout screen says", () => {
  it("states the rule and when it lifts", () => {
    const line = lockoutLine(watchVerdict(light, at(10)));
    expect(line).toContain(lesson.actionPrompt);
    expect(line).toContain("11:00");
  });

  it("says plainly when nothing else opens today", () => {
    expect(lockoutLine(watchVerdict(light, at(23)))).toContain("Nothing else opens today");
  });

  it("holds the learner to their own decision without passing judgement", () => {
    for (const hour of [2, 10, 22, 23]) {
      const line = lockoutLine(watchVerdict(light, at(hour)));
      expect(line).not.toMatch(/fail|lazy|wasted|should have|bad|shame|addict|weak|pathetic/i);
    }
  });

  it("says nothing at all when watching is allowed", () => {
    expect(lockoutLine(watchVerdict(light, at(15)))).toBe("");
  });
});

describe("the off-plan record", () => {
  const entry = (over: Partial<OffPlanEntry> = {}): OffPlanEntry =>
    ({ date: "2026-03-10", hour: 23, minutes: 12, reason: "boundary", ...over });

  it("records time watched when the plan said otherwise", () => {
    expect(recordOffPlan([], entry())).toEqual([entry()]);
  });

  it("adds to the same hour rather than filling the record with rows", () => {
    const once = recordOffPlan([], entry({ minutes: 12 }));
    const twice = recordOffPlan(once, entry({ minutes: 8 }));
    expect(twice).toHaveLength(1);
    expect(twice[0].minutes).toBe(20);
  });

  it("keeps separate hours apart", () => {
    const record = recordOffPlan(recordOffPlan([], entry({ hour: 22 })), entry({ hour: 23 }));
    expect(record).toHaveLength(2);
  });

  it("counts the recent ones, which is what gets reported", () => {
    const record = [
      entry({ date: "2026-03-01", hour: 23 }),
      entry({ date: "2026-03-09", hour: 22 }),
      entry({ date: "2026-03-10", hour: 23 }),
    ];
    expect(offPlanCount(record, 7, new Date(2026, 2, 10, 9, 0))).toBe(2);
  });

  it("counts a seven-day window inclusive of its first day", () => {
    // Seven days back from the 10th reaches the 4th, and the 4th is in it.
    const record = [entry({ date: "2026-03-03" }), entry({ date: "2026-03-04" })];
    expect(offPlanCount(record, 7, new Date(2026, 2, 10, 9, 0))).toBe(1);
  });
});

describe("hours that are already spoken for", () => {
  const madressa: Commitment[] = [{ name: "Madressa", days: [], fromHour: 8, toHour: 11 }];
  const withMadressa = slySchedule({
    lesson,
    habits: [],
    yesterdayMinutes: 300,
    goal: defaultGoal,
    commitments: madressa,
    now: new Date(2026, 2, 10, 7, 0),
  });

  it("does not schedule the lesson into an hour already booked", () => {
    // A heavy day wants 09:00, which is madressa. It has to move.
    const lessonBlock = withMadressa.blocks.find((block) => block.kind === "lesson")!;
    expect(lessonBlock.time).toBe("11:00");
    expect(lessonBlock.reason).toContain("moved clear of Madressa");
  });

  it("says what the day already holds", () => {
    expect(withMadressa.reading).toContain("Madressa, 08:00–11:00");
  });

  it("shuts the door during a commitment, and names it", () => {
    const verdict = watchVerdict(withMadressa, at(9), madressa);
    expect(verdict).toMatchObject({ allowed: false, reason: "commitment" });
    expect(verdict.allowed === false && verdict.detail).toContain("Madressa");
    expect(verdict.allowed === false && verdict.opensAt).toBe(11);
  });

  it("opens again the moment it finishes", () => {
    // 11:00 is the lesson block now, so it shuts for that instead — but not
    // for madressa, which is over.
    const verdict = watchVerdict(withMadressa, at(12), madressa);
    expect(verdict.allowed).toBe(true);
  });

  it("only applies on the days it runs", () => {
    const weekdaysOnly: Commitment[] = [{ name: "School", days: [1, 2, 3, 4, 5], fromHour: 9, toHour: 15 }];
    // 2026-03-10 is a Tuesday; 2026-03-08 is a Sunday.
    const tuesday = new Date(2026, 2, 10, 12, 30);
    const sunday = new Date(2026, 2, 8, 12, 30);
    expect(watchVerdict(light, tuesday, weekdaysOnly).allowed).toBe(false);
    expect(watchVerdict(light, sunday, weekdaysOnly).allowed).toBe(true);
  });

  it("does not scold about it", () => {
    const line = lockoutLine(watchVerdict(withMadressa, at(9), madressa));
    expect(line).not.toMatch(/fail|lazy|wasted|should have|bad|shame|skiving|bunking/i);
  });
});

describe("hours that are already spoken for", () => {
  // Whatever this person happens to have booked — nothing here is a default.
  const booked: Commitment[] = [{ name: "Madressa", days: [], fromHour: 8, toHour: 11 }];
  const around = slySchedule({
    lesson,
    habits: [],
    yesterdayMinutes: 300,
    goal: defaultGoal,
    commitments: booked,
    now: new Date(2026, 2, 10, 7, 0),
  });

  it("does not schedule the lesson into an hour already taken", () => {
    // A heavy day wants 09:00, which is booked. It has to move.
    const lessonBlock = around.blocks.find((block) => block.kind === "lesson")!;
    expect(lessonBlock.time).toBe("11:00");
    expect(lessonBlock.reason).toContain("moved clear of Madressa");
  });

  it("says what the day already holds", () => {
    expect(around.reading).toContain("Madressa, 08:00–11:00");
  });

  it("shuts the door during a commitment, and names it", () => {
    const verdict = watchVerdict(around, at(9), booked);
    expect(verdict).toMatchObject({ allowed: false, reason: "commitment" });
    expect(verdict.allowed === false && verdict.detail).toContain("Madressa");
    expect(verdict.allowed === false && verdict.opensAt).toBe(11);
  });

  it("only applies on the days it runs", () => {
    const weekdays: Commitment[] = [{ name: "School", days: [1, 2, 3, 4, 5], fromHour: 12, toHour: 15 }];
    const tuesday = new Date(2026, 2, 10, 13, 30);
    const sunday = new Date(2026, 2, 8, 13, 30);
    expect(watchVerdict(light, tuesday, weekdays).allowed).toBe(false);
    expect(watchVerdict(light, sunday, weekdays).allowed).toBe(true);
  });

  it("changes nothing when nothing was set up", () => {
    // The common case: someone who has not filled anything in.
    expect(watchVerdict(light, at(9), []).allowed).toBe(true);
  });

  it("does not scold about being somewhere else", () => {
    const line = lockoutLine(watchVerdict(around, at(9), booked));
    expect(line).not.toMatch(/fail|lazy|wasted|should have|bad|shame|skiving|bunking/i);
  });
});
