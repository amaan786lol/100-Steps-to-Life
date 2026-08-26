import { describe, expect, it } from "vitest";
import {
  PASS_RULES,
  buyPass,
  emptyPassState,
  isQualifyingDay,
  passLine,
  passProgress,
  passUsedOn,
  qualifyingDays,
  totalXp,
  usePass,
  xpFor,
  type DayResult,
} from "./earning";

const day = (over: Partial<DayResult> = {}): DayResult => ({
  date: "2026-03-10",
  lessonProven: true,
  lessonScore: { score: 10, outOf: 10 },
  goalsSet: 1,
  goalsCompleted: 1,
  withinScreenGoal: true,
  offPlanMinutes: 0,
  ...over,
});

/** `count` perfect days, each on its own date. */
const goodDays = (count: number, over: Partial<DayResult> = {}) =>
  Array.from({ length: count }, (_, index) =>
    day({ date: `2026-03-${String(index + 1).padStart(2, "0")}`, ...over }));

describe("what a day earns", () => {
  it("pays for the lesson, the goals, the limit and the score", () => {
    expect(xpFor(day())).toBe(10 + 5 + 5 + 10);
  });

  it("pays less for a weaker score, but still pays", () => {
    expect(xpFor(day({ lessonScore: { score: 5, outOf: 10 } }))).toBe(10 + 5 + 5 + 5);
  });

  it("pays nothing for a lesson that was not done", () => {
    expect(xpFor(day({ lessonProven: false, lessonScore: undefined, goalsSet: 0, goalsCompleted: 0, withinScreenGoal: false })))
      .toBe(0);
  });

  it("never subtracts, even for an off-plan day", () => {
    // Off-plan time stops a day counting towards a pass. Taking XP away as
    // well would be a punishment rather than a price.
    expect(xpFor(day({ offPlanMinutes: 90 }))).toBe(xpFor(day()));
  });

  it("does not pay for more goals than were set", () => {
    expect(xpFor(day({ goalsSet: 1, goalsCompleted: 9 }))).toBe(xpFor(day()));
  });

  it("adds up across days", () => {
    expect(totalXp(goodDays(3))).toBe(xpFor(day()) * 3);
  });
});

describe("which days count towards a pass", () => {
  const short = PASS_RULES.short;

  it("counts a day where everything was done", () => {
    expect(isQualifyingDay(day(), short)).toBe(true);
  });

  it("does not count a day the lesson was skipped", () => {
    expect(isQualifyingDay(day({ lessonProven: false }), short)).toBe(false);
  });

  it("does not count a day a goal was left undone", () => {
    expect(isQualifyingDay(day({ goalsSet: 2, goalsCompleted: 1 }), short)).toBe(false);
  });

  it("does not count a day that went over the screen goal", () => {
    expect(isQualifyingDay(day({ withinScreenGoal: false }), short)).toBe(false);
  });

  it("holds the score bar for the tier", () => {
    expect(isQualifyingDay(day({ lessonScore: { score: 8, outOf: 10 } }), short)).toBe(true);
    expect(isQualifyingDay(day({ lessonScore: { score: 7, outOf: 10 } }), short)).toBe(false);
    // The evening tier asks for more.
    expect(isQualifyingDay(day({ lessonScore: { score: 8, outOf: 10 } }), PASS_RULES.evening)).toBe(false);
    expect(isQualifyingDay(day({ lessonScore: { score: 9, outOf: 10 } }), PASS_RULES.evening)).toBe(true);
  });

  it("counts a day with no marked test, if the rest holds", () => {
    // Written and action goals are evidenced, not scored.
    expect(isQualifyingDay(day({ lessonScore: undefined }), short)).toBe(true);
  });

  it("only the evening tier demands a completely clean day", () => {
    expect(isQualifyingDay(day({ offPlanMinutes: 20 }), short)).toBe(true);
    expect(isQualifyingDay(day({ offPlanMinutes: 20 }), PASS_RULES.evening)).toBe(false);
  });
});

describe("days accumulate and are never wiped", () => {
  it("keeps the good days when a bad one lands in the middle", () => {
    // The course says missed steps are information and asks for a return, not
    // a performance. A streak that resets teaches the opposite.
    const days = [...goodDays(5), day({ date: "2026-03-06", lessonProven: false }), ...goodDays(3).map((d, i) => ({ ...d, date: `2026-03-1${i}` }))];
    expect(qualifyingDays(days, PASS_RULES.short)).toBe(8);
  });

  it("costs a bad day, and only that day", () => {
    const withMiss = [...goodDays(6), day({ date: "2026-03-07", withinScreenGoal: false })];
    expect(qualifyingDays(withMiss, PASS_RULES.short)).toBe(6);
  });

  it("does not care what order the days arrive in", () => {
    const shuffled = [...goodDays(7)].reverse();
    expect(qualifyingDays(shuffled, PASS_RULES.short)).toBe(7);
  });
});

describe("progress towards a pass", () => {
  it("is not ready on days alone", () => {
    // Seven perfect days is 175 XP, which clears the short pass's 150.
    const progress = passProgress(goodDays(7), "short");
    expect(progress).toMatchObject({ days: 7, daysNeeded: 7, ready: true });
  });

  it("is not ready without the days, however much XP", () => {
    const progress = passProgress(goodDays(3), "short");
    expect(progress.ready).toBe(false);
    expect(progress.shortfall).toContain("4 more good days");
  });

  it("names the XP when only that is missing", () => {
    // Enough days, but the evening tier costs far more XP.
    const progress = passProgress(goodDays(14), "evening");
    expect(progress.days).toBe(14);
    expect(progress.ready).toBe(false);
    expect(progress.shortfall).toMatch(/more XP/);
  });

  it("says days and XP together when both are short", () => {
    expect(passProgress(goodDays(2), "evening").shortfall).toMatch(/more good days and .* XP/);
  });

  it("counts one day in the singular", () => {
    expect(passProgress(goodDays(6), "short").shortfall).toContain("1 more good day.");
  });

  it("subtracts what has already been spent", () => {
    const days = goodDays(7);
    const afterBuying = passProgress(days, "short", PASS_RULES.short.xp);
    expect(afterBuying.ready).toBe(false);
  });
});

describe("holding and spending", () => {
  it("will not sell a pass that has not been earned", () => {
    const state = buyPass(emptyPassState(), goodDays(3), "short");
    expect(state.held).toEqual([]);
    expect(state.spent).toBe(0);
  });

  it("sells one that has", () => {
    const state = buyPass(emptyPassState(), goodDays(7), "short");
    expect(state.held).toEqual(["short"]);
    expect(state.spent).toBe(PASS_RULES.short.xp);
  });

  it("will not sell the same pass twice on the same XP", () => {
    const days = goodDays(7);
    const once = buyPass(emptyPassState(), days, "short");
    expect(buyPass(once, days, "short").held).toEqual(["short"]);
  });

  it("records a pass being used rather than spending it silently", () => {
    // Using one is a legitimate choice. The record just says it was made.
    const held = buyPass(emptyPassState(), goodDays(7), "short");
    const used = usePass(held, "short", "2026-03-11");
    expect(used.held).toEqual([]);
    expect(passUsedOn(used, "2026-03-11")).toMatchObject({ tier: "short" });
  });

  it("cannot use one that is not held", () => {
    const state = usePass(emptyPassState(), "evening", "2026-03-11");
    expect(state.used).toEqual([]);
  });
});

describe("what Sly says about it", () => {
  it("describes a balance, not an approval", () => {
    for (const days of [0, 3, 7, 14]) {
      for (const tier of ["short", "evening"] as const) {
        const line = passLine(passProgress(goodDays(days), tier));
        expect(line).not.toMatch(/fail|lazy|wasted|should have|shame|disappoint|earned nothing/i);
      }
    }
  });

  it("says plainly when it is there to be taken", () => {
    expect(passLine(passProgress(goodDays(7), "short"))).toMatch(/earned 45 minutes/i);
  });

  it("shows the count and the shortfall while it is not", () => {
    const line = passLine(passProgress(goodDays(4), "short"));
    expect(line).toContain("4 of 7 good days");
    expect(line).toContain("3 more good days");
  });
});
