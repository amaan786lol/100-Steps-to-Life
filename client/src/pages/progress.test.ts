import { describe, expect, it } from "vitest";
import { COMBO_STRIKE_CAP, COMBO_STRIKE_EVERY, calculateAccuracy, completeDay, newlyUnlocked, recallStrength, recordAnswer, strikeValue, weakestDays } from "./Home";
import { getLesson, selectReview, totalQuestionsForDay } from "../data/course";

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
  trialsPassed: [] as number[],
  recall: {} as Record<number, { seen: number; missed: number; lastReviewedDay?: number }>,
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
    const dayOne = totalQuestionsForDay(1);
    const perfect = { ...blank, quizHistory: { 1: { score: dayOne, passed: true, perfect: true } } };
    expect(calculateAccuracy(perfect)).toBe(100);

    // Two different lessons, each answered exactly half right.
    const dayTwo = totalQuestionsForDay(2);
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
    const short = totalQuestionsForDay(1);
    const long = totalQuestionsForDay(100);
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

describe("adaptive review", () => {
  const journal = (over: Partial<typeof blank> = {}) => ({ ...blank, ...over });
  const completed = Array.from({ length: 12 }, (_, i) => i + 1);

  it("brings back the days that were missed before the days that were not", () => {
    const data = journal({
      completedDays: completed,
      recall: {
        3: { seen: 4, missed: 0 },        // strong
        7: { seen: 3, missed: 3 },        // never held
        9: { seen: 2, missed: 0 },        // fine
      },
    });
    const picked = selectReview(13, 4, data.recall, data.completedDays);
    const days = picked.map((question) => question.fromDay);
    expect(days).toContain(7);
    expect(days).not.toContain(3);
  });

  it("asks each chosen day at most once in a check", () => {
    const picked = selectReview(13, 6, {}, completed);
    expect(new Set(picked.map((question) => question.fromDay)).size).toBe(picked.length);
  });

  it("only reaches for days already completed, and never the current one", () => {
    const picked = selectReview(6, 8, {}, [1, 2, 3, 4, 5]);
    for (const question of picked) {
      expect(question.fromDay).toBeLessThan(6);
      expect([1, 2, 3, 4, 5]).toContain(question.fromDay);
    }
  });

  it("returns nothing when there is nothing behind you", () => {
    expect(selectReview(1, 5, {}, [])).toEqual([]);
    expect(selectReview(2, 0, {}, [1])).toEqual([]);
  });

  it("is stable for the same journal", () => {
    const first = selectReview(13, 5, {}, completed).map((q) => q.question);
    const second = selectReview(13, 5, {}, completed).map((q) => q.question);
    expect(first).toEqual(second);
  });

  it("marks what it returns as review, and says which day it came from", () => {
    for (const question of selectReview(13, 5, {}, completed)) {
      expect(question.scope).toBe("review");
      expect(typeof question.fromDay).toBe("number");
    }
  });
});

describe("recall strength", () => {
  it("reads an unseen day as unseen, not as weak", () => {
    expect(recallStrength(undefined)).toBe("unseen");
    expect(recallStrength({ seen: 0, missed: 0 })).toBe("unseen");
  });

  it("calls a day shaky once half of its returns were missed", () => {
    expect(recallStrength({ seen: 2, missed: 1 })).toBe("shaky");
    expect(recallStrength({ seen: 4, missed: 2 })).toBe("shaky");
  });

  it("only calls a day strong after several clean returns", () => {
    expect(recallStrength({ seen: 2, missed: 0 })).toBe("holding");
    expect(recallStrength({ seen: 3, missed: 0 })).toBe("strong");
    expect(recallStrength({ seen: 9, missed: 1 })).toBe("holding");
  });

  it("lists the weakest days first, and leaves strong ones out", () => {
    const data = { ...blank, completedDays: [1, 2, 3, 4], recall: {
      1: { seen: 5, missed: 0 },
      2: { seen: 4, missed: 3 },
      3: { seen: 2, missed: 2 },
    } };
    const weak = weakestDays(data);
    expect(weak.map((entry) => entry.day)).not.toContain(1);
    expect(weak[0].day).toBe(2);            // most misses first
    expect(weak.map((entry) => entry.day)).toContain(4);  // never revisited
  });
});

describe("recordAnswer and recall", () => {
  it("records how a returning day answered", () => {
    const missed = recordAnswer(blank, false, { fromDay: 7, onDay: 20 });
    expect(missed.recall[7]).toEqual({ seen: 1, missed: 1, lastReviewedDay: 20 });
    const thenRight = recordAnswer(missed, true, { fromDay: 7, onDay: 21 });
    expect(thenRight.recall[7]).toEqual({ seen: 2, missed: 1, lastReviewedDay: 21 });
  });

  it("leaves recall alone for a question that is not a review", () => {
    expect(recordAnswer(blank, true).recall).toEqual({});
  });
});
