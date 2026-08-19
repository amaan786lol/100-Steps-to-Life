import { describe, expect, it } from "vitest";
import { getLesson, lessons, phases } from "./course";

describe("Hundred Steps island course map", () => {
  it("has ten distinct island learning environments", () => {
    expect(phases).toHaveLength(10);
    expect(new Set(phases.map((phase) => phase.island)).size).toBe(10);
    expect(phases.every((phase) => phase.landmark && phase.memoryCue && phase.routeCue)).toBe(true);
  });

  it("keeps all one hundred lessons reachable from their numbered waypoints", () => {
    expect(lessons).toHaveLength(100);
    expect(getLesson(1).title).toBe("Arrival");
    expect(getLesson(100).day).toBe(100);
    expect(lessons.every((lesson) => lesson.phase.id >= 1 && lesson.phase.id <= 10)).toBe(true);
  });
});
