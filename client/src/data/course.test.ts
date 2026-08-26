import { describe, expect, it } from "vitest";
import { FINAL_RECALL_LENGTH, reviewSlotsFor, totalQuestionsForDay, RECHECK_LENGTH, buildFinalRecall, buildRecheck, buildTrial, finalScenarios, finalTrials, getLesson, lessons, lessonsForPhase, passMark, phases, questionCountForPhase } from "./course";

describe("Hundred Steps island course map", () => {
  it("has ten distinct island learning environments", () => {
    expect(phases).toHaveLength(10);
    expect(new Set(phases.map((phase) => phase.island)).size).toBe(10);
    expect(phases.every((phase) => phase.landmark && phase.memoryCue && phase.routeCue)).toBe(true);
  });

  it("keeps all one hundred lessons reachable from their numbered waypoints", () => {
    expect(lessons).toHaveLength(100);
    expect(getLesson(1).title).toBe("Start Small, Start Today");
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

  it("gives every day the length its island calls for, once review is added", () => {
    for (const lesson of lessons) {
      // lesson.quiz holds the fixed part; review is chosen at run time from
      // whatever the learner has actually forgotten.
      expect(totalQuestionsForDay(lesson.day)).toBe(questionCountForPhase(lesson.phase.id));
      expect(lesson.quiz.length).toBe(questionCountForPhase(lesson.phase.id) - reviewSlotsFor(lesson.day, lesson.phase.id));
    }
  });

  it("brings back more of the course as it goes on", () => {
    expect(reviewSlotsFor(1, 1)).toBe(0);
    expect(reviewSlotsFor(2, 1)).toBeGreaterThan(0);
    expect(reviewSlotsFor(100, 10)).toBeGreaterThan(reviewSlotsFor(2, 1));
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

describe("the Summit quest", () => {
  it("has two trials, taken in order", () => {
    expect(finalTrials).toHaveLength(2);
    expect(finalTrials[0].name).toBe("Trial of Recall");
    expect(finalTrials[1].name).toBe("Trial of Judgment");
  });

  it("builds each trial at the length it advertises", () => {
    for (const trial of finalTrials) expect(buildTrial(trial.id)).toHaveLength(trial.length);
  });

  it("draws recall from every island, never twice", () => {
    const recall = buildFinalRecall();
    expect(recall).toHaveLength(FINAL_RECALL_LENGTH);
    expect(new Set(recall.map((question) => question.question)).size).toBe(recall.length);
    // Fifteen questions across ten islands: every island must be represented.
    // Only lesson-specific questions belong to one island; method questions
    // recur across the whole course and would make this claim meaningless.
    expect(recall.every((question) => question.scope !== "method")).toBe(true);
    const islandsSeen = new Set(
      recall.map((question) => phases.find((phase) =>
        lessonsForPhase(phase.id).some((lesson) => lesson.quiz.some((item) => item.question === question.question)))?.id),
    );
    expect(islandsSeen.size).toBe(10);
  });

  it("puts one judgment scenario on each island, in route order", () => {
    expect(finalScenarios).toHaveLength(10);
    expect(finalScenarios.map((scenario) => scenario.cue)).toEqual(phases.map((phase) => phase.island));
  });

  it("gives every scenario a real answer and an explanation", () => {
    for (const scenario of finalScenarios) {
      expect(scenario.options).toHaveLength(4);
      expect(scenario.answer).toBeGreaterThanOrEqual(0);
      expect(scenario.answer).toBeLessThan(4);
      expect(scenario.explanation.length).toBeGreaterThan(30);
    }
  });

  it("is stable between attempts", () => {
    expect(buildTrial(0).map((q) => q.question)).toEqual(buildTrial(0).map((q) => q.question));
  });
});
