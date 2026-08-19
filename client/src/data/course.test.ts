import { describe, expect, it } from "vitest";
import { RECHECK_LENGTH, buildRecheck, getLesson, lessons, lessonsForPhase, passMark, phases, questionCountForPhase } from "./course";

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

describe("quiz depth", () => {
  it("gets longer as the islands get harder", () => {
    expect(questionCountForPhase(1)).toBe(10);
    expect(questionCountForPhase(10)).toBe(15);
    for (let phaseId = 2; phaseId <= 10; phaseId++) {
      expect(questionCountForPhase(phaseId)).toBeGreaterThanOrEqual(questionCountForPhase(phaseId - 1));
    }
  });

  it("gives every lesson the length its island calls for", () => {
    for (const lesson of lessons) {
      expect(lesson.quiz).toHaveLength(questionCountForPhase(lesson.phase.id));
    }
  });

  it("builds well-formed questions with no repeats inside a quiz", () => {
    for (const lesson of lessons) {
      const prompts = new Set(lesson.quiz.map((question) => question.question));
      expect(prompts.size).toBe(lesson.quiz.length);
      for (const question of lesson.quiz) {
        expect(question.options).toHaveLength(4);
        expect(new Set(question.options).size).toBe(4);
        expect(question.answer).toBeGreaterThanOrEqual(0);
        expect(question.answer).toBeLessThan(question.options.length);
        expect(question.explanation.length).toBeGreaterThan(0);
      }
    }
  });

  it("does not leave the correct answer sitting in one position", () => {
    // A learner who always picks A must not be able to pass on that alone.
    const counts = [0, 0, 0, 0];
    for (const lesson of lessons) for (const question of lesson.quiz) counts[question.answer]++;
    const total = counts.reduce((sum, count) => sum + count, 0);
    for (const count of counts) expect(count / total).toBeLessThan(0.35);
  });

  it("is stable, so returning to a day shows the same quiz", () => {
    expect(getLesson(37).quiz).toEqual(getLesson(37).quiz);
    expect(getLesson(37).quiz[2].options).toEqual(getLesson(37).quiz[2].options);
  });

  it("asks for roughly seven in ten to pass, whatever the length", () => {
    expect(passMark(10)).toBe(7);
    expect(passMark(15)).toBe(11);
  });
});

describe("island recheck", () => {
  it("draws its questions from across the island it closes", () => {
    for (const phase of phases) {
      const recheck = buildRecheck(phase.id);
      expect(recheck).toHaveLength(RECHECK_LENGTH);
      const islandQuestions = new Set(lessonsForPhase(phase.id).flatMap((lesson) => lesson.quiz.map((question) => question.question)));
      for (const question of recheck) expect(islandQuestions.has(question.question)).toBe(true);
    }
  });

  it("never repeats a question within one recheck", () => {
    for (const phase of phases) {
      const recheck = buildRecheck(phase.id);
      expect(new Set(recheck.map((question) => question.question)).size).toBe(recheck.length);
    }
  });

  it("is stable between attempts", () => {
    expect(buildRecheck(4).map((question) => question.question)).toEqual(buildRecheck(4).map((question) => question.question));
  });

  it("differs from island to island", () => {
    const first = buildRecheck(1).map((question) => question.question).join("|");
    const second = buildRecheck(2).map((question) => question.question).join("|");
    expect(first).not.toBe(second);
  });
});
