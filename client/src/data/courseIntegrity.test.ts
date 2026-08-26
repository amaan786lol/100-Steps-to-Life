import { describe, expect, it } from "vitest";
import { lessons, questionCountForPhase, reviewSlotsFor } from "./course";

/**
 * The course must always have exactly one hundred days.
 *
 * This file exists because an edit to one section once removed ten lessons and
 * nothing noticed. Content edits are hand-made and easy to get wrong by a
 * bracket, so the shape of the data is asserted here rather than trusted.
 *
 * These tests are about structure, not wording. They should keep passing
 * through any amount of rewriting, and fail loudly the moment a day goes
 * missing, doubles up, or loses a field.
 */

const PHASES = 10;
const DAYS_PER_PHASE = 10;
const TOTAL = PHASES * DAYS_PER_PHASE;

describe("the course is one hundred days", () => {
  it("has exactly one hundred lessons", () => {
    expect(lessons).toHaveLength(TOTAL);
  });

  it("has every day from 1 to 100, exactly once", () => {
    const days = lessons.map((lesson) => lesson.day).sort((a, b) => a - b);
    expect(days).toEqual(Array.from({ length: TOTAL }, (_, index) => index + 1));
  });

  it("has ten lessons on each of the ten islands", () => {
    for (let phase = 1; phase <= PHASES; phase++) {
      expect(lessons.filter((lesson) => lesson.phase.id === phase)).toHaveLength(DAYS_PER_PHASE);
    }
  });

  it("keeps each island's days contiguous and in order", () => {
    for (let phase = 1; phase <= PHASES; phase++) {
      const days = lessons.filter((lesson) => lesson.phase.id === phase).map((lesson) => lesson.day);
      expect(days).toEqual(Array.from({ length: DAYS_PER_PHASE }, (_, i) => (phase - 1) * DAYS_PER_PHASE + i + 1));
    }
  });
});

describe("every day is complete", () => {
  it("has all of its written fields, with nothing left empty", () => {
    for (const lesson of lessons) {
      for (const field of ["title", "why", "lesson", "keyIdea", "example", "actionPrompt", "actionHint", "bonus"] as const) {
        expect(typeof lesson[field], `day ${lesson.day} ${field}`).toBe("string");
        expect((lesson[field] as string).trim().length, `day ${lesson.day} ${field} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it("has a usable quiz on every day", () => {
    for (const lesson of lessons) {
      expect(lesson.quiz.length, `day ${lesson.day} has no questions`).toBeGreaterThan(0);
      for (const question of lesson.quiz) {
        expect(question.options, `day ${lesson.day}`).toHaveLength(4);
        expect(question.answer, `day ${lesson.day}`).toBeGreaterThanOrEqual(0);
        expect(question.answer, `day ${lesson.day}`).toBeLessThan(4);
        expect(question.explanation.trim().length, `day ${lesson.day} explanation`).toBeGreaterThan(0);
        // A question whose options repeat has more than one right answer.
        expect(new Set(question.options).size, `day ${lesson.day} repeats an option`).toBe(4);
      }
    }
  });

  it("gives every day the number of questions its island asks for", () => {
    for (const lesson of lessons) {
      const target = questionCountForPhase(lesson.phase.id) - reviewSlotsFor(lesson.day, lesson.phase.id);
      expect(lesson.quiz.length, `day ${lesson.day}`).toBe(target);
    }
  });

  it("has a distinct title for every day", () => {
    expect(new Set(lessons.map((lesson) => lesson.title)).size).toBe(TOTAL);
  });
});

describe("the later sections are still there", () => {
  /** Named so a deletion reports which stretch of the course went missing. */
  const sections: Array<[string, number, number]> = [
    ["Foundation", 1, 10],
    ["Mindset & Deen", 11, 20],
    ["Discipline & Habits", 21, 30],
    ["Deen \u0026 Worship", 31, 40],
    ["Character & Relationships", 41, 50],
    ["Health & Energy", 51, 60],
    ["Skills & Creativity", 61, 70],
    ["Money & Creating Value", 71, 80],
    ["Leadership & Responsibility", 81, 90],
    ["Integration & Long-Term Life", 91, 100],
  ];

  it.each(sections)("%s (days %i-%i) still has ten lessons", (_name, from, to) => {
    const found = lessons.filter((lesson) => lesson.day >= from && lesson.day <= to);
    expect(found).toHaveLength(10);
    for (const lesson of found) expect(lesson.title.trim().length).toBeGreaterThan(0);
  });
});

/**
 * Two stretches of the course teach social and speaking skill by practice:
 * days 41-50, and days 72-80. Both are held to the same bar — real missions,
 * scenario questions, and presentation kept away from appearance.
 */
describe.each([
  ["Character & Relationships", 41, 50],
  ["Speaking & Presence", 72, 80],
])("%s teaches doing, not only reflecting", (_name, from, to) => {
  const section = lessons.filter((lesson) => lesson.day >= from && lesson.day <= to);

  it("asks the learner to do something real on every day", () => {
    for (const lesson of section) {
      expect(lesson.actionPrompt.trim().length, `day ${lesson.day}`).toBeGreaterThan(20);
    }
  });

  it("does not fall back on passive questions", () => {
    // "What did you learn?" and "which idea is at its heart?" test recall of a
    // page just read. These days are meant to test what to actually do.
    // The generated prompts all quote the lesson by title, e.g.
    // Why does “Speak Up” matter?  — which is what makes them recall
    // questions about a page just read. A scenario question that happens to
    // ask "why does this matter?" is a different thing entirely.
    const passive = /which idea is at its heart|\u201c[^\u201d]+\u201d\s*(matter|at work|actually ask)|which optional challenge belongs|which answer best captures/i;
    for (const lesson of section) {
      for (const question of lesson.quiz) {
        expect(question.question, `day ${lesson.day}`).not.toMatch(passive);
      }
    }
  });

  it("puts the learner in a situation on most questions", () => {
    // A scenario question describes a moment: "you walk into a room…".
    const scenario = /\byou\b|\bsomeone\b|\bthey\b|\bfriend\b/i;
    for (const lesson of section) {
      const situational = lesson.quiz.filter((question) => scenario.test(question.question));
      expect(situational.length, `day ${lesson.day}`).toBeGreaterThanOrEqual(Math.ceil(lesson.quiz.length * 0.6));
    }
  });

  it("keeps presentation about preparation, never about attractiveness", () => {
    // The section teaches hygiene, tidiness and dressing for the occasion. It
    // must never drift into ranking how people look.
    // The body-shape words are anchored on both sides: without a leading
    // boundary, "slim" matches inside "Muslim" and this guard would quietly
    // push the word out of an Islamic course.
    const appearance = /attractive|good-?looking|prettier|handsome|ugly|better looking|body ?type|\bslim\b|\bfat\b|beauty standard/i;
    for (const lesson of section) {
      const text = [lesson.title, lesson.why, lesson.lesson, lesson.keyIdea, lesson.example, lesson.actionPrompt,
        lesson.actionHint, lesson.bonus,
        ...lesson.quiz.flatMap((question) => [question.question, ...question.options, question.explanation])].join(" ");
      // Where such a word appears at all, it must sit inside an explicit
      // denial that it is what matters.
      const offending = text.match(appearance) ?? [];
      for (const hit of offending) {
        expect(text, `day ${lesson.day} uses "${hit}"`).toMatch(
          new RegExp(`(not about|never about|nobody is being asked)[^.]*${hit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|${hit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^.]*(than other people|is not the same|should not)`, "i"),
        );
      }
    }
  });
});
