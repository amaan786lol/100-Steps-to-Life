/**
 * The hours that are already spoken for.
 *
 * Madressa, school, work — time that exists whether or not an app knows about
 * it. Without this the planner cheerfully schedules a lesson step at 09:00 for
 * someone who is sitting in madressa until eleven, and the lockout treats those
 * same hours as free time being wasted.
 *
 * Kept as plain data rather than hardcoded, because a term starting or a
 * timetable changing should be one edit, not a code change.
 */

export type Commitment = {
  name: string;
  /**
   * Weekdays this applies to, 0 = Sunday through 6 = Saturday.
   * An empty list means every day.
   */
  days: number[];
  /** Hour it starts, inclusive. */
  fromHour: number;
  /** Hour it ends, exclusive. 11 means it finishes at 11:00. */
  toHour: number;
};

export const COMMITMENTS_KEY = "hundred-steps-commitments-v1";

export const WEEKDAYS = [1, 2, 3, 4, 5];
export const WEEKEND = [0, 6];

/**
 * Nothing, by default.
 *
 * Deliberately empty. One person's madressa is another's school run, shift or
 * nothing at all, and an app that assumes a timetable it was never told is an
 * app that plans someone else's day. These are collected at setup instead, and
 * the planner simply has fewer hours to avoid until then.
 */
export const defaultCommitments: Commitment[] = [];

/** Offered at setup as a starting point, not applied until chosen. */
export const commitmentSuggestions: Array<Omit<Commitment, "days"> & { days: number[] }> = [
  { name: "School", days: WEEKDAYS, fromHour: 9, toHour: 15 },
  { name: "Madressa", days: [], fromHour: 17, toHour: 19 },
  { name: "Work", days: WEEKDAYS, fromHour: 9, toHour: 17 },
];

const isCommitment = (value: unknown): value is Commitment => {
  const item = value as Commitment | null;
  return Boolean(
    item &&
      typeof item.name === "string" && item.name.trim().length > 0 &&
      Array.isArray(item.days) && item.days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) &&
      Number.isInteger(item.fromHour) && item.fromHour >= 0 && item.fromHour <= 24 &&
      Number.isInteger(item.toHour) && item.toHour > item.fromHour && item.toHour <= 24,
  );
};

export function readCommitments(storage: Pick<Storage, "getItem">, key = COMMITMENTS_KEY): Commitment[] {
  try {
    const raw = JSON.parse(storage.getItem(key) ?? "null") as unknown;
    // An empty list is a real answer — "nothing is booked" — and is kept as
    // one. Malformed entries are dropped rather than guessed at.
    return Array.isArray(raw) ? raw.filter(isCommitment) : defaultCommitments;
  } catch {
    return defaultCommitments;
  }
}

/**
 * Whether this person has been through setup.
 *
 * Distinct from having no commitments: "I have nothing booked" is an answer,
 * and someone who gave it should not be asked again every time they open the
 * page. The key existing at all is the signal.
 */
export const isSetUp = (storage: Pick<Storage, "getItem">, key = COMMITMENTS_KEY) =>
  storage.getItem(key) !== null;

/** Whether a commitment applies on a given date. */
export const appliesOn = (commitment: Commitment, date: Date) =>
  commitment.days.length === 0 || commitment.days.includes(date.getDay());

/** The commitments covering a given hour of a given day. */
export const commitmentsAt = (commitments: Commitment[], date: Date, hour = date.getHours()) =>
  commitments.filter((item) => appliesOn(item, date) && hour >= item.fromHour && hour < item.toHour);

/** Every hour spoken for on a given date. */
export function bookedHours(commitments: Commitment[], date: Date): Set<number> {
  const booked = new Set<number>();
  for (const item of commitments) {
    if (!appliesOn(item, date)) continue;
    for (let hour = item.fromHour; hour < item.toHour; hour++) booked.add(hour);
  }
  return booked;
}

/**
 * The first free hour at or after `fromHour`, skipping anything booked.
 * Returns null if the day runs out before one is found.
 */
export function firstFreeHour(
  commitments: Commitment[],
  date: Date,
  fromHour: number,
  untilHour = 24,
): number | null {
  const booked = bookedHours(commitments, date);
  for (let hour = Math.max(0, fromHour); hour < untilHour; hour++) {
    if (!booked.has(hour)) return hour;
  }
  return null;
}

const clock = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

export const describeCommitment = (commitment: Commitment) =>
  `${commitment.name}, ${clock(commitment.fromHour)}–${clock(commitment.toHour)}`;
