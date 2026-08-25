import { describe, expect, it } from "vitest";
import { dayKeyOffset, type StoredHabit } from "./dailyCheckin";
import { defaultGoal } from "./screenTimeUsage";
import { slySchedule, weighYesterday, type ScheduleInput } from "./slySchedule";

const now = new Date(2026, 2, 10, 7, 30);
const day = (offset: number) => dayKeyOffset(offset, now);

const habit = (name: string, keptOn: number[], mode: "build" | "reduce" = "build"): StoredHabit => ({
  id: name,
  name,
  mode,
  done: keptOn.includes(0),
  log: Object.fromEntries(keptOn.map((offset) => [day(offset), true as const])),
});

const lesson = { day: 12, title: "The Quiet Hour", actionPrompt: "Put the phone in another room for one hour." };

const build = (over: Partial<ScheduleInput> = {}) =>
  slySchedule({ lesson, habits: [], yesterdayMinutes: null, goal: defaultGoal, now, ...over });

describe("weighing yesterday", () => {
  it("knows the difference between unmeasured and fine", () => {
    // These must never collapse into each other: one is a fact, one is silence.
    expect(weighYesterday(null, defaultGoal)).toBe("unmeasured");
    expect(weighYesterday(0, defaultGoal)).toBe("under");
  });

  it("separates a small overshoot from a lost evening", () => {
    expect(weighYesterday(179, defaultGoal)).toBe("under");
    expect(weighYesterday(200, defaultGoal)).toBe("over");
    expect(weighYesterday(240, defaultGoal)).toBe("well-over");
  });

  it("counts exactly the limit as under, matching the goal's own rule", () => {
    expect(weighYesterday(180, defaultGoal)).toBe("under");
  });
});

describe("what yesterday did to today", () => {
  it("says plainly when it was not measured, and guesses nothing", () => {
    const plan = build();
    expect(plan.reading).toMatch(/not measured/i);
    expect(plan.reading).toMatch(/No guessing/i);
  });

  it("reports the real figure and the overshoot", () => {
    const plan = build({ yesterdayMinutes: 262 });
    expect(plan.reading).toContain("4h 22m");
    expect(plan.reading).toContain("1h 22m");
    expect(plan.reading).toContain("3h 00m");
  });

  it("brings the evening boundary earlier the heavier yesterday was", () => {
    const at = (minutes: number | null) =>
      build({ yesterdayMinutes: minutes }).blocks.find((block) => block.kind === "boundary")!.time;
    expect(at(120)).toBe("22:00");
    expect(at(200)).toBe("21:00");
    expect(at(300)).toBe("20:00");
  });

  it("never sets a boundary so early that nobody would keep it", () => {
    const plan = build({ yesterdayMinutes: 900 });
    const boundary = plan.blocks.find((block) => block.kind === "boundary")!;
    expect(Number(boundary.time.slice(0, 2))).toBeGreaterThanOrEqual(20);
  });

  it("moves the lesson earlier after a heavy day", () => {
    expect(build({ yesterdayMinutes: 60 }).blocks[0].time).toBe("10:00");
    expect(build({ yesterdayMinutes: 300 }).blocks[0].time).toBe("09:00");
  });

  it("asks for real distance from the phone only when the day earned it", () => {
    expect(build({ yesterdayMinutes: 300 }).friction).toMatch(/outside the room/i);
    expect(build({ yesterdayMinutes: 60 }).friction).not.toMatch(/outside the room/i);
  });

  it("checks against the limit once there is one to check", () => {
    expect(build({ yesterdayMinutes: 200 }).checkIn).toContain("3h 00m");
    expect(build().checkIn).not.toContain("3h 00m");
  });
});

describe("the shape of the day", () => {
  it("gives the lesson its own block, first", () => {
    const plan = build({ yesterdayMinutes: 100 });
    expect(plan.blocks[0].kind).toBe("lesson");
    expect(plan.blocks[0].action).toBe(lesson.actionPrompt);
    expect(plan.focus).toBe(lesson.actionPrompt);
  });

  it("always ends with a boundary and a check, in that order", () => {
    const plan = build({ yesterdayMinutes: 100, habits: [habit("walk", []), habit("read", [])] });
    expect(plan.blocks.map((block) => block.kind).slice(-2)).toEqual(["boundary", "check"]);
  });

  it("puts the slipping habit before the ones already running", () => {
    // The one least likely to happen on its own goes first.
    const plan = build({ habits: [habit("read", [0, -1, -2]), habit("walk", [-5])] });
    const habits = plan.blocks.filter((block) => block.kind === "habit");
    expect(habits[0].action).toBe("walk");
    expect(habits[0].reason).toMatch(/gone quiet/i);
  });

  it("words a habit you are cutting down as leaving it alone", () => {
    const plan = build({ habits: [habit("late scrolling", [], "reduce")] });
    expect(plan.blocks.find((block) => block.kind === "habit")!.action).toBe("Leave late scrolling alone");
  });

  it("does not stack the whole list into one day", () => {
    const many = ["a", "b", "c", "d", "e"].map((name) => habit(name, []));
    expect(build({ habits: many }).blocks.filter((block) => block.kind === "habit")).toHaveLength(2);
  });

  it("leaves habits already marked today out of the plan", () => {
    const plan = build({ habits: [habit("done already", [0])] });
    expect(plan.blocks.filter((block) => block.kind === "habit")).toHaveLength(0);
  });

  it("still produces a usable day with no lesson and no habits", () => {
    const plan = slySchedule({ habits: [], yesterdayMinutes: null, goal: defaultGoal, now });
    expect(plan.blocks.length).toBeGreaterThanOrEqual(2);
    expect(plan.focus.length).toBeGreaterThan(0);
    expect(plan.replacement.length).toBeGreaterThan(0);
  });

  it("keeps the blocks in chronological order", () => {
    const plan = build({ yesterdayMinutes: 300, habits: [habit("walk", []), habit("read", [])] });
    const times = plan.blocks.map((block) => block.time);
    expect([...times].sort()).toEqual(times);
  });

  it("offers the slipping habit as the thing to do instead", () => {
    const plan = build({ habits: [habit("walk", [-6])] });
    expect(plan.replacement).toContain("walk");
  });
});

describe("Sly's rules still hold here", () => {
  it("never scolds, however heavy yesterday was", () => {
    const states: Array<Partial<ScheduleInput>> = [
      { yesterdayMinutes: 900 },
      { yesterdayMinutes: 300, habits: [habit("walk", [-9])] },
      { yesterdayMinutes: null },
      { yesterdayMinutes: 0 },
      { yesterdayMinutes: 240, habits: [habit("scroll", [-4], "reduce")] },
    ];
    for (const state of states) {
      const plan = build(state);
      const words = [plan.focus, plan.reading, plan.friction, plan.replacement, plan.checkIn,
        ...plan.blocks.map((block) => `${block.action} ${block.reason}`)].join(" ");
      expect(words).not.toMatch(/fail|lazy|wasted|should have|bad|shame|excuse|disappoint|addict/i);
    }
  });

  it("treats a good day as worth holding, not as licence to push further", () => {
    const plan = build({ yesterdayMinutes: 90 });
    expect(plan.reading).toMatch(/rather than chasing it lower/i);
  });
});
