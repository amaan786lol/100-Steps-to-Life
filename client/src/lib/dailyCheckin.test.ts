import { describe, expect, it } from "vitest";
import { loadDailyCheckin, prepareDailyCheckin, shouldResetDailyCheckin } from "./dailyCheckin";

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
