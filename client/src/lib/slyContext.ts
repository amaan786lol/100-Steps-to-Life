/**
 * Where Sly gets what he knows.
 *
 * Sly floats above the whole app, because the break he asks for is not a habit
 * page concern — a long stretch is a long stretch wherever you are standing.
 * But what he *says* comes from the habits, which are edited on one page and
 * stored on the device.
 *
 * Rather than thread that state through the app, this reads it back out of
 * storage and re-reads on a change. It is the same data either way: the habit
 * page has always written every edit to localStorage immediately, so there is
 * no second source of truth being introduced here — only a second reader.
 */

import { useEffect, useMemo, useState } from "react";

import { getLesson } from "@/data/course";
import { loadDailyCheckin, type StoredHabit } from "./dailyCheckin";
import { slyBriefing, type SlySpeech } from "./slyVoice";
import type { SlyPhase } from "./sly";

const HABITS_KEY = "hundred-steps-habit-studio-v1";
const REVIEW_KEY = "hundred-steps-yesterday-review-v1";
const COURSE_KEY = "hundred-steps-to-life-v1";

/** Fired when the habit page changes something Sly should know about. */
export const SLY_CHANGED = "sly:habits-changed";

export const announceHabitChange = () => {
  try {
    window.dispatchEvent(new CustomEvent(SLY_CHANGED));
  } catch {
    /* Nothing here is worth failing a habit edit over. */
  }
};

function readLesson() {
  try {
    const journal = JSON.parse(localStorage.getItem(COURSE_KEY) ?? "null") as { currentDay?: number } | null;
    const lesson = getLesson(Math.min(100, Math.max(1, Math.round(journal?.currentDay ?? 1))));
    return { day: lesson.day, title: lesson.title, actionPrompt: lesson.actionPrompt };
  } catch {
    return null;
  }
}

function readCarriedChange() {
  try {
    const raw = JSON.parse(localStorage.getItem(REVIEW_KEY) ?? "null") as
      | { review?: { oneChange?: string } }
      | null;
    return raw?.review?.oneChange ?? null;
  } catch {
    return null;
  }
}

function readHabits(): { habits: StoredHabit[]; priority: string } {
  try {
    const saved = loadDailyCheckin(localStorage, HABITS_KEY);
    return { habits: saved.habits, priority: saved.priority };
  } catch {
    return { habits: [], priority: "" };
  }
}

/**
 * Everything Sly has noticed, kept current. `phase` is passed in rather than
 * read here because the companion owns the clock.
 */
export function useSlyBriefing(phase?: SlyPhase): SlySpeech[] {
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const bump = () => setRevision((value) => value + 1);
    window.addEventListener(SLY_CHANGED, bump);
    // Another tab editing the same habits should not leave him out of date.
    window.addEventListener("storage", bump);
    return () => {
      window.removeEventListener(SLY_CHANGED, bump);
      window.removeEventListener("storage", bump);
    };
  }, []);

  // Only the phase name matters to what he says, and the companion recomputes
  // the phase every second — depending on the object itself would rebuild this
  // once a second for a sentence that did not change.
  const phaseName = phase?.phase;

  return useMemo(() => {
    const { habits, priority } = readHabits();
    return slyBriefing({
      habits,
      phase: phaseName === "due" ? { phase: "due", usedMs: 0 } : phaseName === "resting" ? { phase: "resting", remainingMs: 0 } : undefined,
      lesson: readLesson(),
      carriedChange: readCarriedChange(),
      priority,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision is the signal that storage moved
  }, [revision, phaseName]);
}
