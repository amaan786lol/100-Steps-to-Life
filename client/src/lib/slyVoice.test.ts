import { describe, expect, it } from "vitest";
import { dayKeyOffset, type StoredHabit } from "./dailyCheckin";
import { freshState, slyPhase, startBreak, type SlySettings } from "./sly";
import {
  daysSinceKept,
  isSlipping,
  lastKept,
  needsAttention,
  slyBriefing,
  slyGreeting,
  slyNote,
  slyOnMark,
  slySays,
  stillOpen,
} from "./slyVoice";

const now = new Date(2026, 2, 10, 9, 0, 0);
const day = (offset: number) => dayKeyOffset(offset, now);

/** A habit kept on the given day offsets — 0 is today, -1 yesterday. */
const habit = (name: string, keptOn: number[], mode: "build" | "reduce" = "build"): StoredHabit => ({
  id: name,
  name,
  mode,
  done: keptOn.includes(0),
  log: Object.fromEntries(keptOn.map((offset) => [day(offset), true as const])),
});

const settings: SlySettings = { workMinutes: 30, breakMinutes: 15, enabled: true };

describe("what Sly can see in the log", () => {
  it("finds the last day a habit was kept", () => {
    expect(lastKept(habit("read", [-3, -4]), now)).toBe(day(-3));
    expect(lastKept(habit("read", []), now)).toBeNull();
  });

  it("counts the gap in days, with today as zero", () => {
    expect(daysSinceKept(habit("read", [0]), now)).toBe(0);
    expect(daysSinceKept(habit("read", [-1]), now)).toBe(1);
    expect(daysSinceKept(habit("read", [-6]), now)).toBe(6);
    expect(daysSinceKept(habit("read", []), now)).toBeNull();
  });

  it("does not call an unmarked today a slip", () => {
    // The day is not over. Yesterday kept is still a live habit.
    expect(isSlipping(habit("read", [-1]), now)).toBe(false);
    expect(isSlipping(habit("read", [-2]), now)).toBe(true);
  });

  it("does not call a habit that never started a slip either", () => {
    // Nothing has slipped; it has not begun. Sly words that case differently.
    expect(isSlipping(habit("read", []), now)).toBe(false);
  });

  it("points at the longest gap first", () => {
    const habits = [habit("walk", [-2]), habit("read", [-9]), habit("sleep", [0])];
    expect(needsAttention(habits, now)?.name).toBe("read");
  });

  it("points at nothing when everything is current", () => {
    expect(needsAttention([habit("walk", [0]), habit("read", [-1])], now)).toBeNull();
  });

  it("lists what is still unmarked today, in written order", () => {
    const habits = [habit("walk", [0]), habit("read", [-1]), habit("sleep", [])];
    expect(stillOpen(habits, day(0)).map((item) => item.name)).toEqual(["read", "sleep"]);
  });
});

describe("what Sly says about one habit", () => {
  it("names the run once there is one", () => {
    expect(slyNote(habit("read", [0, -1, -2]), now)).toMatch(/3 days running/);
    expect(slyNote(habit("read", [0, -1, -2, -3, -4, -5, -6]), now)).toMatch(/yours now/);
  });

  it("says a day, not days, for one", () => {
    expect(slyNote(habit("read", [-3]), now)).toContain("3 days since");
    expect(slyNote(habit("read", [-2]), now)).toContain("2 days since");
    expect(slyOnMark(habit("read", [0]), true, now)).not.toMatch(/1 days/);
  });

  it("marks a start as a start rather than a failure", () => {
    expect(slyNote(habit("read", []), now)).toMatch(/not started/i);
  });

  it("answers when you tick something", () => {
    expect(slyOnMark(habit("read", [0, -1]), true, now)).toMatch(/two in a row/i);
    expect(slyOnMark(habit("read", [0, -1, -2, -3]), true, now)).toMatch(/4 days/);
    expect(slyOnMark(habit("scroll", [0], "reduce"), true, now)).toMatch(/left alone/i);
  });

  it("accepts an unmark without argument", () => {
    expect(slyOnMark(habit("read", []), false, now)).toMatch(/should match the day/i);
  });
});

describe("what Sly leads with", () => {
  const lesson = { day: 12, title: "The Quiet Hour", actionPrompt: "Put the phone in another room for one hour." };

  it("asks for the break before anything else", () => {
    const due = slyPhase(freshState(now.getTime() - 40 * 60_000), settings, now.getTime());
    const speech = slySays({ habits: [habit("read", [-9])], phase: due, lesson, now });
    expect(speech.topic).toBe("break");
  });

  it("says the break is running while it runs", () => {
    const resting = slyPhase(startBreak(freshState(now.getTime()), now.getTime()), settings, now.getTime() + 60_000);
    expect(slySays({ habits: [], phase: resting, now }).topic).toBe("break");
  });

  it("invites a first habit when the list is empty, using the lesson", () => {
    const speech = slySays({ habits: [], lesson, now });
    expect(speech.topic).toBe("empty");
    expect(speech.detail).toContain("put the phone in another room");
  });

  it("has nothing else to add when the list is empty", () => {
    // No point discussing runs and priorities before there is a single habit.
    expect(slyBriefing({ habits: [], lesson, carriedChange: "Start earlier.", now })).toHaveLength(1);
  });

  it("raises a slipping habit above the lesson and the plan", () => {
    const speech = slySays({ habits: [habit("walk", [-4]), habit("read", [0])], lesson, now });
    expect(speech.topic).toBe("slipping");
    expect(speech.subject).toBe("walk");
    expect(speech.detail).toContain("4 days");
  });

  it("uses the right verb for a habit you are cutting down", () => {
    const speech = slySays({ habits: [habit("late scrolling", [-3], "reduce")], now });
    expect(speech.detail).toMatch(/stayed off/);
    expect(speech.detail).toMatch(/leave alone/);
  });

  it("carries yesterday's change through in his own briefing", () => {
    const briefing = slyBriefing({ habits: [habit("read", [0])], carriedChange: "Move the charger out of the bedroom.", now });
    expect(briefing.find((item) => item.topic === "carried")?.detail).toBe("Move the charger out of the bedroom.");
  });

  it("stops talking once the list is done", () => {
    const speech = slySays({ habits: [habit("read", [0]), habit("walk", [0])], now });
    expect(speech.topic).toBe("done");
    expect(speech.detail).toContain("2 habits");
  });

  it("names what is next while anything is open", () => {
    const speech = slySays({ habits: [habit("read", [0]), habit("walk", [-1])], now });
    expect(speech.topic).toBe("next");
    expect(speech.subject).toBe("walk");
    expect(speech.headline).toContain("1 thing");
  });

  it("never scolds, in any state he can reach", () => {
    const states: Parameters<typeof slyBriefing>[0][] = [
      { habits: [], now },
      { habits: [], lesson, now },
      { habits: [habit("read", [])], now },
      { habits: [habit("read", [-30])], now },
      { habits: [habit("scroll", [-5], "reduce")], lesson, now },
      { habits: [habit("read", [0])], lesson, carriedChange: "Sleep earlier.", now },
      { habits: [habit("read", [0, -1, -2, -3, -4, -5, -6, -7])], now },
      { habits: [habit("read", [-9])], phase: slyPhase(freshState(0), settings, now.getTime()), now },
    ];
    for (const state of states) {
      for (const line of slyBriefing(state)) {
        expect(`${line.headline} ${line.detail}`).not.toMatch(/fail|lazy|wasted|should have|bad|shame|excuse|disappoint/i);
      }
    }
  });

  it("never leaves the learner without a line", () => {
    expect(slySays({ habits: [], now }).headline.length).toBeGreaterThan(0);
  });
});

describe("his greeting", () => {
  it("matches the hour", () => {
    expect(slyGreeting(new Date(2026, 2, 10, 8, 0))).toMatch(/morning/i);
    expect(slyGreeting(new Date(2026, 2, 10, 14, 0))).toMatch(/afternoon/i);
    expect(slyGreeting(new Date(2026, 2, 10, 21, 0))).toMatch(/evening/i);
    expect(slyGreeting(new Date(2026, 2, 10, 2, 0))).toMatch(/up late/i);
  });
});
