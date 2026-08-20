import { describe, expect, it } from "vitest";
import { COMBO_STRIKE_CAP, COMBO_STRIKE_EVERY, calculateAccuracy, completeDay, newlyUnlocked, recordAnswer, strikeValue } from "./Home";
import { getLesson } from "../data/course";

const blank = {
  currentDay: 1,
  completedDays: [] as number[],
  xp: 0,
  streak: 0,
  quizHistory: {} as Record<number, { score: number; passed: boolean; perfect: boolean }>,
  actions: {} as Record<number, string>,
  takeaways: {} as Record<number, string>,
  bonusDays: [] as number[],
  rechecks: {} as Record<number, { score: number; passed: boolean }>,
  combo: 0,
  bestCombo: 0,
  finalTestComplete: false,
};

const daysAgo = (count: number) => {
  const date = new Date();
  date.setDate(date.getDate() - count);
  return date;
};

const day = (over: Partial<Parameters<typeof completeDay>[1]> = {}) => ({
  day: 1,
  action: "Sleep before midnight tonight.",
  takeaway: "",
  bonus: false,
  ...over,
});

describe("completeDay", () => {
  it("advances the route and records the action", () => {
    const next = completeDay(blank, day());
    expect(next.completedDays).toEqual([1]);
    expect(next.currentDay).toBe(2);
    expect(next.actions[1]).toBe("Sleep before midnight tonight.");
    expect(next.xp).toBe(20);
  });

  it("awards the bonus only the first time a day claims it", () => {
    const once = completeDay(blank, day({ bonus: true }));
    expect(once.xp).toBe(80);
    expect(once.bonusDays).toEqual([1]);
    // Re-completing the same day must not pay out again.
    expect(completeDay(once, day({ bonus: true }))).toBe(once);
  });

  it("leaves an already completed day untouched", () => {
    const once = completeDay(blank, day());
    expect(completeDay(once, day({ action: "Something else entirely." }))).toBe(once);
  });

  it("starts a return count, and continues it the next day", () => {
    const first = completeDay(blank, day());
    expect(first.streak).toBe(1);
    const second = completeDay({ ...first, lastCompletionDate: daysAgo(1).toISOString() }, day({ day: 2 }));
    expect(second.streak).toBe(2);
  });

  it("restarts the count after a gap rather than punishing it", () => {
    const first = completeDay(blank, day());
    const afterGap = completeDay({ ...first, streak: 9, lastCompletionDate: daysAgo(4).toISOString() }, day({ day: 2 }));
    expect(afterGap.streak).toBe(1);
    expect(afterGap.completedDays).toEqual([1, 2]);
  });

  it("does not raise the count twice on the same calendar day", () => {
    const first = completeDay(blank, day());
    const sameDayAgain = completeDay(first, day({ day: 2 }));
    expect(sameDayAgain.streak).toBe(1);
  });

  it("keeps the route within the hundred days", () => {
    const atEnd = completeDay({ ...blank, currentDay: 100 }, day({ day: 100 }));
    expect(atEnd.currentDay).toBe(100);
  });

  it("only stores a takeaway when one was written", () => {
    expect(completeDay(blank, day()).takeaways).toEqual({});
    expect(completeDay(blank, day({ takeaway: "Noticed the pattern." })).takeaways[1]).toBe("Noticed the pattern.");
  });
});

describe("newlyUnlocked", () => {
  it("reports only achievements gained by this step", () => {
    const next = completeDay(blank, day());
    expect(newlyUnlocked(blank, next)).toContain("First Step");
    // Nothing new the second time around.
    expect(newlyUnlocked(next, next)).toEqual([]);
  });
});

describe("calculateAccuracy", () => {
  it("is zero before any quiz is taken", () => {
    expect(calculateAccuracy(blank)).toBe(0);
  });

  it("scores against the number of questions each lesson actually asks", () => {
    const dayOne = getLesson(1).quiz.length;
    const perfect = { ...blank, quizHistory: { 1: { score: dayOne, passed: true, perfect: true } } };
    expect(calculateAccuracy(perfect)).toBe(100);

    // Two different lessons, each answered exactly half right.
    const dayTwo = getLesson(2).quiz.length;
    const half = {
      ...blank,
      quizHistory: {
        1: { score: dayOne / 2, passed: false, perfect: false },
        2: { score: dayTwo / 2, passed: false, perfect: false },
      },
    };
    expect(calculateAccuracy(half)).toBe(50);
  });

  it("stays correct when lessons have different quiz lengths", () => {
    // Day 1 sits on island one, day 100 on island ten, which ask different
    // numbers of questions — a fixed denominator would mis-score this.
    const short = getLesson(1).quiz.length;
    const long = getLesson(100).quiz.length;
    expect(long).toBeGreaterThan(short);
    const data = {
      ...blank,
      quizHistory: {
        1: { score: short, passed: true, perfect: true },
        100: { score: 0, passed: false, perfect: false },
      },
    };
    expect(calculateAccuracy(data)).toBe(Math.round((short / (short + long)) * 100));
  });
});

describe("recordAnswer", () => {
  const runOf = (count: number, from = blank) => {
    let state = from;
    for (let i = 0; i < count; i++) state = recordAnswer(state, true);
    return state;
  };

  it("counts a run of correct answers", () => {
    expect(runOf(3).combo).toBe(3);
    expect(runOf(3).bestCombo).toBe(3);
  });

  it("charges a bolt every fifth correct answer, and only then", () => {
    for (let i = 1; i < COMBO_STRIKE_EVERY; i++) expect(runOf(i).xp).toBe(0);
    expect(runOf(COMBO_STRIKE_EVERY).xp).toBe(strikeValue(COMBO_STRIKE_EVERY));
    // The extra answer past a bolt pays nothing more until the next one.
    expect(runOf(COMBO_STRIKE_EVERY + 1).xp).toBe(strikeValue(COMBO_STRIKE_EVERY));
  });

  it("pays more the longer the run gets, up to a cap", () => {
    const first = strikeValue(COMBO_STRIKE_EVERY);
    const second = strikeValue(COMBO_STRIKE_EVERY * 2);
    const third = strikeValue(COMBO_STRIKE_EVERY * 3);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
    expect(strikeValue(COMBO_STRIKE_EVERY * 50)).toBe(COMBO_STRIKE_CAP);
    expect(strikeValue(0)).toBe(0);
    expect(strikeValue(COMBO_STRIKE_EVERY - 1)).toBe(0);
  });

  it("resets the run on a miss without taking anything away", () => {
    const missed = recordAnswer(runOf(7), false);
    expect(missed.combo).toBe(0);
    expect(missed.xp).toBe(strikeValue(COMBO_STRIKE_EVERY));  // the bolt earned stays
    expect(missed.bestCombo).toBe(7);                         // and so does the best run
  });

  it("carries the run across lessons", () => {
    // Four right at the end of one lesson, one right at the start of the next.
    const carried = recordAnswer(runOf(4), true);
    expect(carried.combo).toBe(COMBO_STRIKE_EVERY);
    expect(carried.xp).toBe(strikeValue(COMBO_STRIKE_EVERY));
  });

  it("never lets one bolt outweigh naming a real action", () => {
    // The course rewards application first: no run length may make a quiz
    // answer worth more than the twenty XP for a real step.
    const oneAction = completeDay(blank, day()).xp;
    for (const run of [5, 10, 25, 100, 500]) expect(strikeValue(run)).toBeLessThan(oneAction);
  });
});
