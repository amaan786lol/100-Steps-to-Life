/**
 * Habits — the part of the course that lives between the daily lessons.
 *
 * Two kinds, deliberately kept apart. A habit you are *building* is marked on
 * the days you did it. A habit you are *leaving* is marked on the days you
 * stayed clear of it. They are counted the same way but read very differently,
 * and the wording throughout follows the course's rule that a missed day is
 * information rather than a verdict.
 */

export type HabitKind = "build" | "leave";

export type Habit = {
  id: string;
  name: string;
  kind: HabitKind;
  /** When and where it happens — the cue that makes it easy to begin. */
  cue?: string;
  /** For a habit being left: what to do instead when the pull arrives. */
  instead?: string;
  createdAt: string;
  archivedAt?: string;
  /** ISO date (YYYY-MM-DD) -> kept that day. */
  log: Record<string, boolean>;
};

export const todayKey = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
};

export const dayKeyOffset = (offset: number, from = new Date()) => {
  const date = new Date(from);
  date.setDate(date.getDate() + offset);
  return todayKey(date);
};

/** The last `count` days, oldest first. */
export const recentDays = (count: number, from = new Date()) =>
  Array.from({ length: count }, (_, index) => dayKeyOffset(index - (count - 1), from));

export const isKept = (habit: Habit, day: string) => habit.log[day] === true;

/** Consecutive kept days ending today (or yesterday, if today is not marked). */
export function currentRun(habit: Habit, from = new Date()) {
  let run = 0;
  const start = isKept(habit, todayKey(from)) ? 0 : -1;
  for (let offset = start; offset > -400; offset--) {
    if (!isKept(habit, dayKeyOffset(offset, from))) break;
    run += 1;
  }
  return run;
}

export function longestRun(habit: Habit) {
  const days = Object.keys(habit.log).filter((day) => habit.log[day]).sort();
  let best = 0;
  let run = 0;
  let previous: string | undefined;
  for (const day of days) {
    const expected = previous ? dayKeyOffset(1, new Date(`${previous}T12:00:00`)) : undefined;
    run = expected === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return best;
}

/** Kept days out of the last `window` days, as a percentage. */
export function keepRate(habit: Habit, window = 14, from = new Date()) {
  const days = recentDays(window, from);
  const kept = days.filter((day) => isKept(habit, day)).length;
  return Math.round((kept / days.length) * 100);
}

export const activeHabits = (habits: Habit[]) => habits.filter((habit) => !habit.archivedAt);

export function toggleDay(habit: Habit, day: string): Habit {
  const log = { ...habit.log };
  if (log[day]) delete log[day];
  else log[day] = true;
  return { ...habit, log };
}

export function createHabit(name: string, kind: HabitKind, extra: Partial<Habit> = {}): Habit {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
    kind,
    createdAt: new Date().toISOString(),
    log: {},
    ...extra,
  };
}

/** How today's habits stand, for the line shown on the Today screen. */
export function todaySummary(habits: Habit[], from = new Date()) {
  const active = activeHabits(habits);
  const day = todayKey(from);
  const kept = active.filter((habit) => isKept(habit, day)).length;
  return { total: active.length, kept, allKept: active.length > 0 && kept === active.length };
}
