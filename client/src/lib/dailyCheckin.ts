export function currentLocalDay(date = new Date()): string {
  return date.toLocaleDateString("en-CA");
}

export function shouldResetDailyCheckin(savedDate: string | undefined, today = currentLocalDay()): boolean {
  return savedDate !== today;
}

export type StoredHabit = {
  id: string;
  name: string;
  mode: "build" | "reduce";
  done: boolean;
  /** Days this habit was kept, as YYYY-MM-DD keys. The record that survives. */
  log?: Record<string, true>;
};
export type StoredDailyCheckin = { date?: string; habits?: StoredHabit[]; stepTarget?: number; stepsSoFar?: number; sleepHours?: number; priority?: string; steps?: number };

export function prepareDailyCheckin(saved: StoredDailyCheckin, today = currentLocalDay()): Required<Pick<StoredDailyCheckin, "date" | "habits" | "priority">> & Omit<StoredDailyCheckin, "date" | "habits" | "priority"> {
  const reset = shouldResetDailyCheckin(saved.date, today);
  return {
    date: today,
    // "done" is a view of the log, not a separate fact: a new day simply has no
    // entry yet, and a day already marked stays marked if the app is reopened.
    habits: (saved.habits ?? []).map(habit => ({ ...habit, log: habit.log ?? {}, done: reset ? Boolean(habit.log?.[today]) : habit.done })),
    stepTarget: reset ? undefined : saved.stepTarget ?? saved.steps,
    stepsSoFar: reset ? undefined : saved.stepsSoFar,
    sleepHours: reset ? undefined : saved.sleepHours,
    priority: reset ? "" : saved.priority ?? "",
  };
}

export type StorageReader = { getItem(key: string): string | null };

export function loadDailyCheckin(storage: StorageReader, key: string, today = currentLocalDay()) {
  try {
    return prepareDailyCheckin(JSON.parse(storage.getItem(key) ?? "{}") as StoredDailyCheckin, today);
  } catch {
    return prepareDailyCheckin({}, today);
  }
}

/* --- The record behind the habits ----------------------------------------
 * Marking a habit used to be forgotten by the next morning. The log keeps it,
 * which is what makes a run, a keep rate and a week strip possible.
 * ---------------------------------------------------------------------- */

export const dayKeyOffset = (offset: number, from = new Date()) => {
  const date = new Date(from);
  date.setDate(date.getDate() + offset);
  return currentLocalDay(date);
};

/** The last `count` days, oldest first, ending today. */
export const recentDays = (count: number, from = new Date()) =>
  Array.from({ length: count }, (_, index) => dayKeyOffset(index - (count - 1), from));

/** Record or clear today against a habit, keeping `done` and the log in step. */
export function markHabit(habit: StoredHabit, kept: boolean, day = currentLocalDay()): StoredHabit {
  const log = { ...(habit.log ?? {}) };
  if (kept) log[day] = true;
  else delete log[day];
  return { ...habit, log, done: kept };
}

/**
 * Consecutive kept days ending today — or yesterday, because the day is not
 * over yet and an unmarked today is not a broken run.
 */
export function habitRun(habit: StoredHabit, from = new Date()) {
  const log = habit.log ?? {};
  let run = 0;
  const start = log[currentLocalDay(from)] ? 0 : -1;
  for (let offset = start; offset > -400; offset--) {
    if (!log[dayKeyOffset(offset, from)]) break;
    run += 1;
  }
  return run;
}

/** Kept days across the last `window` days, as a percentage. */
export function habitKeepRate(habit: StoredHabit, window = 7, from = new Date()) {
  const log = habit.log ?? {};
  const days = recentDays(window, from);
  return Math.round((days.filter(day => log[day]).length / days.length) * 100);
}
