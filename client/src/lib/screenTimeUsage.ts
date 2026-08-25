/**
 * Screen time: turning raw Android foreground intervals into a day's total.
 *
 * The native side deliberately does as little as possible — it reads
 * UsageStatsManager events and hands over raw {start, end} intervals. All the
 * arithmetic lives here, in TypeScript, where it can be tested.
 *
 * That split matters because of one specific trap. UsageStatsManager exposes
 * `totalTimeInForeground` per package, and summing those across packages
 * double-counts: the same wall-clock minute can appear against two packages
 * when one hands over to another, and split-screen or overlay apps overlap
 * outright. A device used for two hours can easily report three. So intervals
 * are merged before they are added, and the merge is tested.
 */

export type UsageInterval = { start: number; end: number };

export type DailyScreenTime = {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  /** Whole minutes the device measured. Never edited. */
  minutes: number;
  /** When this figure was last recalculated. */
  measuredAt: string;
  /**
   * Minutes the learner said were not really use — a video left playing, a
   * screen that stayed on in a pocket. Held separately from `minutes` rather
   * than subtracted from it, so the measurement stays what the device said and
   * the correction stays visible and reversible.
   */
  discounted?: number;
  /** Why, in their own words. */
  note?: string;
  /**
   * Minutes spent watching in a browser, reported by the userscript. Kept
   * apart from `minutes` on purpose: that figure is every app on the device,
   * this one is a single browser, and adding them would double-count the
   * overlap while hiding what neither of them can see.
   */
  watchMinutes?: number;
  /** Shorts counted in the browser that day. */
  shorts?: number;
};

/**
 * The figure to plan from: measured, less anything disowned.
 *
 * A phone cannot tell watching from not-watching. It knows the screen was on
 * and which app was in front, and a video playing to an empty room looks
 * exactly like one being watched. The learner is the only one who knows, so
 * they are allowed to say — and the raw reading is kept either way.
 */
export const effectiveMinutes = (day: DailyScreenTime) =>
  Math.max(0, day.minutes - Math.max(0, day.discounted ?? 0));

export const localDayKey = (date = new Date()) => date.toLocaleDateString("en-CA");

/** Local midnight at the start of the day containing `date`. */
export function startOfLocalDay(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

/** The window to ask the device about: local midnight until now. */
export function todayWindow(now = new Date()) {
  return { start: startOfLocalDay(now), end: now.getTime() };
}

/**
 * The window covering one whole local day, never running past `now`.
 *
 * The end is found by stepping the date forward and taking local midnight
 * again, rather than adding 24 hours: on the days either side of a clock
 * change a local day is 23 or 25 hours long, and adding a fixed 86,400,000
 * would spill an hour into the neighbouring day or cut one off.
 */
export function dayWindow(date: Date, now = new Date()) {
  const start = startOfLocalDay(date);
  const next = new Date(start);
  next.setDate(next.getDate() + 1);
  return { start, end: Math.min(startOfLocalDay(next), now.getTime()) };
}

/**
 * An interval is only usable if both ends are real numbers and it moves
 * forwards. This is checked before any clamping: clamping an infinite end to
 * "now" would turn a broken reading into a plausible-looking twelve hours.
 */
const isUsable = (item: UsageInterval) =>
  Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start;

/** Merge overlapping and touching intervals into a flat, ordered set. */
export function mergeIntervals(intervals: UsageInterval[]): UsageInterval[] {
  const clean = intervals.filter(isUsable).sort((a, b) => a.start - b.start);

  const merged: UsageInterval[] = [];
  for (const item of clean) {
    const last = merged[merged.length - 1];
    // Touching counts as continuous: a hand-off at the same millisecond is not
    // a gap in usage.
    if (last && item.start <= last.end) last.end = Math.max(last.end, item.end);
    else merged.push({ ...item });
  }
  return merged;
}

/** Trim intervals to a window, so a session spanning midnight splits correctly. */
export function clipToWindow(intervals: UsageInterval[], window: { start: number; end: number }): UsageInterval[] {
  return intervals
    .filter(isUsable)
    .map((item) => ({ start: Math.max(item.start, window.start), end: Math.min(item.end, window.end) }))
    .filter((item) => item.end > item.start);
}

/** Active milliseconds in a window, counting no moment twice. */
export function activeMs(intervals: UsageInterval[], window: { start: number; end: number }) {
  return mergeIntervals(clipToWindow(intervals, window)).reduce((total, item) => total + (item.end - item.start), 0);
}

/** Whole minutes of use, rounded down — 59 seconds is not a minute yet. */
export const activeMinutes = (intervals: UsageInterval[], window: { start: number; end: number }) =>
  Math.floor(activeMs(intervals, window) / 60_000);

/** "42m", "2h 17m", "5h 03m". Minutes pad to two digits once hours appear. */
export function formatDuration(minutes: number) {
  const safe = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  if (hours === 0) return `${rest}m`;
  return `${hours}h ${String(rest).padStart(2, "0")}m`;
}

/* --- The daily record ----------------------------------------------------- */

export const SCREEN_TIME_KEY = "hundred-steps-screen-time-daily-v1";
const HISTORY_DAYS = 30;

export function readHistory(storage: Pick<Storage, "getItem">, key = SCREEN_TIME_KEY): DailyScreenTime[] {
  try {
    const raw = JSON.parse(storage.getItem(key) ?? "[]") as DailyScreenTime[];
    return Array.isArray(raw) ? raw.filter((item) => typeof item?.date === "string" && typeof item?.minutes === "number") : [];
  } catch {
    return [];
  }
}

/** Record a day's figure, replacing any earlier figure for that same day. */
export function recordDay(history: DailyScreenTime[], entry: DailyScreenTime, keep = HISTORY_DAYS): DailyScreenTime[] {
  return [...history.filter((item) => item.date !== entry.date), entry]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-keep);
}

export const findDay = (history: DailyScreenTime[], date: string) => history.find((item) => item.date === date);

/**
 * Record that some of a day was not really use.
 *
 * Capped at what was measured: disowning more than the device saw would make
 * the day negative, which is not a thing that can have happened. Passing 0
 * clears the correction, so it can always be taken back.
 */
export function discountDay(
  history: DailyScreenTime[],
  date: string,
  minutes: number,
  note?: string,
): DailyScreenTime[] {
  return history.map((day) => {
    if (day.date !== date) return day;
    const discounted = Math.min(Math.max(0, Math.round(minutes)), day.minutes);
    if (discounted === 0) {
      const { discounted: _dropped, note: _droppedNote, ...rest } = day;
      return rest;
    }
    return { ...day, discounted, note: note?.trim() || undefined };
  });
}

/** The last `count` days, oldest first, with gaps left as null. */
export function recentHistory(history: DailyScreenTime[], count = 7, from = new Date()) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(from);
    date.setDate(date.getDate() - (count - 1 - index));
    const key = localDayKey(date);
    const day = findDay(history, key);
    return { date: key, minutes: day ? effectiveMinutes(day) : null };
  });
}

/* --- The habit ------------------------------------------------------------ */

export type ScreenTimeGoal = {
  /** Minutes. */
  target: number;
  /** "below" keeps use under the target; "above" is for deliberate use. */
  direction: "below" | "above";
  /** Whether the goal is checked every day. */
  daily: boolean;
};

export const defaultGoal: ScreenTimeGoal = { target: 180, direction: "below", daily: true };

export type GoalStatus = {
  met: boolean;
  /** 0-1, how far through the target the day has gone. */
  progress: number;
  label: string;
};

/** Compare a day's figure against the goal. `null` means nothing measured yet. */
export function evaluateGoal(minutes: number | null, goal: ScreenTimeGoal): GoalStatus {
  if (minutes === null) return { met: false, progress: 0, label: "Not measured yet" };
  const target = Math.max(1, goal.target);
  const progress = Math.min(1, minutes / target);
  const met = goal.direction === "below" ? minutes < goal.target : minutes >= goal.target;
  return { met, progress, label: met ? "Completed" : "Not completed" };
}

export const describeGoal = (goal: ScreenTimeGoal) =>
  `${goal.direction === "below" ? "<" : "≥"} ${formatDuration(goal.target)}`;
