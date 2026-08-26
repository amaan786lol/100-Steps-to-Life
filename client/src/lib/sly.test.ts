import { describe, expect, it } from "vitest";
import {
  countdown,
  defaultSlySettings,
  endBreak,
  freshState,
  resume,
  slyLine,
  slyPhase,
  snooze,
  startBreak,
  type SlySettings,
} from "./sly";

const settings: SlySettings = { workMinutes: 30, breakMinutes: 15, enabled: true };
const t0 = new Date(2026, 2, 10, 9, 0, 0).getTime();
const after = (ms: number) => t0 + ms;
const mins = (n: number) => n * 60_000;

describe("the working stretch", () => {
  it("counts up while there is still time to go", () => {
    const phase = slyPhase(freshState(t0), settings, after(mins(10)));
    expect(phase).toMatchObject({ phase: "working" });
    if (phase.phase === "working") {
      expect(phase.usedMs).toBe(mins(10));
      expect(phase.untilBreakMs).toBe(mins(20));
    }
  });

  it("asks for a break once the stretch is up", () => {
    expect(slyPhase(freshState(t0), settings, after(mins(30))).phase).toBe("due");
    expect(slyPhase(freshState(t0), settings, after(mins(31))).phase).toBe("due");
  });

  it("says nothing at all when Sly is switched off", () => {
    expect(slyPhase(freshState(t0), { ...settings, enabled: false }, after(mins(90))).phase).toBe("off");
  });
});

describe("the break", () => {
  it("runs for the configured length, then hands the time back", () => {
    const resting = startBreak(freshState(t0), after(mins(30)));
    const midway = slyPhase(resting, settings, after(mins(35)));
    expect(midway).toMatchObject({ phase: "resting" });
    if (midway.phase === "resting") expect(midway.remainingMs).toBe(mins(10));

    // Once it has run out the stretch begins again, whether or not anyone looked.
    expect(slyPhase(resting, settings, after(mins(46))).phase).toBe("working");
  });

  it("is over when it is over, even if the app was closed throughout", () => {
    const resting = startBreak(freshState(t0), after(mins(30)));
    expect(slyPhase(resting, settings, after(mins(300))).phase).toBe("working");
  });

  it("lets the learner come back early without it counting against them", () => {
    const resting = startBreak(freshState(t0), after(mins(30)));
    const back = endBreak(resting, after(mins(38)));
    expect(back.breakStartedAt).toBeUndefined();
    expect(slyPhase(back, settings, after(mins(38))).phase).toBe("working");
  });
});

describe("sending Sly away", () => {
  it("holds him off for a while, then he asks again", () => {
    const due = freshState(t0);
    expect(slyPhase(due, settings, after(mins(30))).phase).toBe("due");

    const quiet = snooze(due, 5, after(mins(30)));
    expect(slyPhase(quiet, settings, after(mins(32))).phase).toBe("working");
    expect(slyPhase(quiet, settings, after(mins(36))).phase).toBe("due");
  });

  it("does not start a break, because no break was taken", () => {
    const quiet = snooze(freshState(t0), 5, after(mins(30)));
    expect(quiet.breakStartedAt).toBeUndefined();
  });
});

describe("coming back to the app", () => {
  it("counts a long absence as the break already taken", () => {
    // Twenty minutes away from the screen is a break, whatever the app thinks.
    const state = resume(freshState(t0), settings, after(mins(25)), after(mins(45)));
    expect(slyPhase(state, settings, after(mins(45))).phase).toBe("working");
    expect(state.stretchStartedAt).toBe(after(mins(45)));
  });

  it("does not count a short absence as screen time either", () => {
    // Two minutes away is not a break, but it should not age the stretch.
    const state = resume(freshState(t0), settings, after(mins(20)), after(mins(22)));
    const phase = slyPhase(state, settings, after(mins(22)));
    if (phase.phase === "working") expect(phase.usedMs).toBe(mins(20));
  });

  it("leaves a running break running", () => {
    const resting = startBreak(freshState(t0), after(mins(30)));
    expect(resume(resting, settings, after(mins(31)), after(mins(33)))).toEqual(resting);
  });
});

describe("what the learner sees", () => {
  it("counts down in minutes and seconds", () => {
    expect(countdown(mins(15))).toBe("15:00");
    expect(countdown(65_000)).toBe("1:05");
    expect(countdown(0)).toBe("0:00");
    expect(countdown(-500)).toBe("0:00");
  });

  it("warns before it interrupts, and never scolds", () => {
    const soon = slyPhase(freshState(t0), settings, after(mins(27)));
    expect(slyLine(soon)).toMatch(/nearly/i);
    expect(slyLine(slyPhase(freshState(t0), settings, after(mins(31))))).toMatch(/still be here/i);
    for (const at of [5, 27, 31, 40]) {
      expect(slyLine(slyPhase(freshState(t0), settings, after(mins(at))))).not.toMatch(/fail|wasted|should have|bad/i);
    }
  });
});

describe("the defaults", () => {
  it("are the thirty and fifteen asked for", () => {
    expect(defaultSlySettings).toMatchObject({ workMinutes: 30, breakMinutes: 15, enabled: true });
  });
});
