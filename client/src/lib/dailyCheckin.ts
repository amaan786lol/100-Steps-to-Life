export function currentLocalDay(date = new Date()): string {
  return date.toLocaleDateString("en-CA");
}

export function shouldResetDailyCheckin(savedDate: string | undefined, today = currentLocalDay()): boolean {
  return savedDate !== today;
}

export type StoredHabit = { id: string; name: string; mode: "build" | "reduce"; done: boolean };
export type StoredDailyCheckin = { date?: string; habits?: StoredHabit[]; stepTarget?: number; stepsSoFar?: number; sleepHours?: number; priority?: string; steps?: number };

export function prepareDailyCheckin(saved: StoredDailyCheckin, today = currentLocalDay()): Required<Pick<StoredDailyCheckin, "date" | "habits" | "priority">> & Omit<StoredDailyCheckin, "date" | "habits" | "priority"> {
  const reset = shouldResetDailyCheckin(saved.date, today);
  return {
    date: today,
    habits: (saved.habits ?? []).map(habit => ({ ...habit, done: reset ? false : habit.done })),
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
