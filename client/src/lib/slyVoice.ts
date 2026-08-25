/**
 * What Sly says about your habits.
 *
 * Sly runs the habit side of the course now: the headings, the nudges and the
 * verdicts are all him talking, rather than an interface making neutral
 * statements at you. That is a deliberate choice — a named character can say
 * "this one has gone quiet" without it landing as a mark against you, where the
 * same sentence in system voice reads like a report card.
 *
 * The rules he speaks under are the same rules the rest of the course keeps:
 *
 *   - He never scolds. Not once, in any branch. There is a test for this.
 *   - He never invents a fact. If a habit was missed, he says so; if nothing
 *     has been measured, he says that instead of guessing.
 *   - He says one thing at a time. He notices plenty; he leads with whichever
 *     is most useful right now and lets the rest wait.
 *
 * All of it is pure. The component renders whatever this returns, and the
 * tests drive the clock and the habit log directly.
 */

import { currentLocalDay, dayKeyOffset, habitKeepRate, habitRun, type StoredHabit } from "./dailyCheckin";
import type { SlyPhase } from "./sly";

export type SlyTopic = "break" | "empty" | "slipping" | "carried" | "lesson" | "done" | "next";

export type SlySpeech = {
  /** What he leads with. One sentence, plain. */
  headline: string;
  /** The reason behind it, or what to do about it. */
  detail: string;
  /** The habit he is pointing at, when he is pointing at one. */
  subject?: string;
  /** Which of his concerns this is, so the interface can place it. */
  topic: SlyTopic;
};

export type SlyContext = {
  habits: StoredHabit[];
  /** The work/break cycle, when it is running. */
  phase?: SlyPhase;
  /** The course day the learner is standing on. */
  lesson?: { day: number; title: string; actionPrompt: string } | null;
  /** The one change carried in from yesterday's review. */
  carriedChange?: string | null;
  /** Today's written priority, if there is one yet. */
  priority?: string;
  now?: Date;
};

/* --- What he can see ------------------------------------------------------ */

/** The most recent day a habit was kept, or null if it never has been. */
export function lastKept(habit: StoredHabit, from = new Date()): string | null {
  const log = habit.log ?? {};
  for (let offset = 0; offset > -400; offset--) {
    const day = dayKeyOffset(offset, from);
    if (log[day]) return day;
  }
  return null;
}

/** Days since it was last kept. 0 means today, null means never. */
export function daysSinceKept(habit: StoredHabit, from = new Date()): number | null {
  const last = lastKept(habit, from);
  if (!last) return null;
  for (let offset = 0; offset > -400; offset--) {
    // Math.abs, not -offset: negating zero gives -0, which prints as "-0 days".
    if (dayKeyOffset(offset, from) === last) return Math.abs(offset);
  }
  return null;
}

/**
 * A habit is slipping when it was going and then stopped — missed for two days
 * or more, having been kept at some point. A habit that has never started is
 * not slipping; it is just new, and gets said differently.
 */
export function isSlipping(habit: StoredHabit, from = new Date()) {
  const since = daysSinceKept(habit, from);
  return since !== null && since >= 2;
}

/** The habit most worth mentioning: longest gap first, then weakest week. */
export function needsAttention(habits: StoredHabit[], from = new Date()): StoredHabit | null {
  const slipping = habits
    .filter((habit) => isSlipping(habit, from))
    .sort((a, b) => (daysSinceKept(b, from) ?? 0) - (daysSinceKept(a, from) ?? 0) || habitKeepRate(a, 7, from) - habitKeepRate(b, 7, from));
  return slipping[0] ?? null;
}

/** Habits not yet marked today, in the order they were written. */
export const stillOpen = (habits: StoredHabit[], today = currentLocalDay()) =>
  habits.filter((habit) => !(habit.log ?? {})[today]);

/* --- How he words it ------------------------------------------------------ */

/** "kept" reads wrong for a habit you are trying to drop. */
const keptWord = (habit: StoredHabit) => (habit.mode === "reduce" ? "stayed off" : "kept");
const doWord = (habit: StoredHabit) => (habit.mode === "reduce" ? "leave alone" : "do");

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * The line under a single habit — what Sly makes of that one on its own. Short,
 * because it sits in a row, and factual, because the run is the record.
 */
export function slyNote(habit: StoredHabit, from = new Date()): string {
  const run = habitRun(habit, from);
  const since = daysSinceKept(habit, from);
  if (since === null) return `Not started yet. First one is the whole trick.`;
  if (since >= 2) return `${plural(since, "day")} since this one. Worth picking back up.`;
  if (run >= 7) return `${plural(run, "day")} running. This one is yours now.`;
  if (run >= 2) return `${plural(run, "day")} running.`;
  return `Going again.`;
}

/** What he says the moment you mark something, or unmark it. */
export function slyOnMark(habit: StoredHabit, kept: boolean, from = new Date()): string {
  if (!kept) return `Taken back off. The record should match the day.`;
  const run = habitRun(habit, from);
  if (run >= 7) return `${plural(run, "day")}. I stopped counting this one as an experiment a while ago.`;
  if (run >= 3) return `${plural(run, "day")} running now.`;
  if (run === 2) return `Two in a row. That is the hard one done.`;
  return habit.mode === "reduce" ? `Left alone today. Noted.` : `Marked. That is today handled.`;
}

/* --- What he leads with --------------------------------------------------- */

/**
 * Everything Sly has noticed, most useful first. The interface shows the head
 * of this list and can offer the rest; nothing here is urgent enough to shout.
 */
export function slyBriefing(context: SlyContext): SlySpeech[] {
  const now = context.now ?? new Date();
  const today = currentLocalDay(now);
  const { habits, phase, lesson, carriedChange, priority } = context;
  const speech: SlySpeech[] = [];

  // The break beats everything else. It is the one thing he interrupts for.
  if (phase?.phase === "due") {
    speech.push({
      topic: "break",
      headline: "That is a long stretch at the screen.",
      detail: "Put it down for a bit. Nothing here expires, and I will still be here when you come back.",
    });
  } else if (phase?.phase === "resting") {
    speech.push({
      topic: "break",
      headline: "Break is running.",
      detail: "Look at something further away than this. I will tell you when it is up.",
    });
  }

  if (!habits.length) {
    speech.push({
      topic: "empty",
      headline: "Nothing on the list yet.",
      detail: lesson
        ? `Start with one thing. Today's lesson asks you to ${asClause(lesson.actionPrompt)} — that is a fine first habit.`
        : "Start with one thing worth protecting, or one pattern you would rather do less of. One is enough.",
    });
    return speech;
  }

  const slipping = needsAttention(habits, now);
  if (slipping) {
    const since = daysSinceKept(slipping, now) ?? 0;
    speech.push({
      topic: "slipping",
      subject: slipping.name,
      headline: `${slipping.name} has gone quiet.`,
      detail: `${plural(since, "day")} since you ${keptWord(slipping)} it. No verdict from me — but if you only ${doWord(slipping)} one thing today, I would make it this one.`,
    });
  }

  if (carriedChange) {
    speech.push({
      topic: "carried",
      headline: "Yesterday left you something.",
      detail: carriedChange,
    });
  }

  if (lesson) {
    speech.push({
      topic: "lesson",
      headline: `Day ${lesson.day} is ${lesson.title}.`,
      detail: priority?.trim()
        ? `You have written your priority already. Keep the lesson's step near it: ${lesson.actionPrompt}`
        : `The step is: ${lesson.actionPrompt} Build today around that and the plan writes itself.`,
    });
  }

  const open = stillOpen(habits, today);
  if (!open.length) {
    speech.push({
      topic: "done",
      headline: "Everything on the list is marked.",
      detail: `${plural(habits.length, "habit")}, all handled. That is the whole job — I have nothing else for you today.`,
    });
  } else {
    const next = open[0];
    speech.push({
      topic: "next",
      subject: next.name,
      headline: `${plural(open.length, "thing")} left today.`,
      detail: `Next up: ${next.name}. ${habitKeepRate(next, 7, now)}% of the last week, if you want the honest number.`,
    });
  }

  return speech;
}

/** The one thing he leads with. */
export const slySays = (context: SlyContext): SlySpeech =>
  slyBriefing(context)[0] ?? {
    topic: "empty",
    headline: "Nothing on the list yet.",
    detail: "Start with one thing. One is enough.",
  };

/** A greeting that matches the hour, so the morning check-in reads like morning. */
export function slyGreeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) return "You are up late. I will keep this short.";
  if (hour < 12) return "Morning. Let us choose today before it chooses you.";
  if (hour < 18) return "Afternoon. Here is where the day stands.";
  return "Evening. Time to look back at it honestly.";
}

/**
 * Fold a sentence into the middle of one of Sly's. Lowercases the first letter
 * and drops the full stop, so splicing a lesson prompt in does not produce
 * "...matters to you. — that is a fine first habit."
 */
const asClause = (text: string) => {
  const trimmed = text.trim().replace(/[.!]+$/, "");
  return trimmed ? trimmed[0].toLowerCase() + trimmed.slice(1) : trimmed;
};
