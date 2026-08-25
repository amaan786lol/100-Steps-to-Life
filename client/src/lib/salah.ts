/**
 * The five prayers, as the day's backbone.
 *
 * Everything else in this course is arranged around them rather than beside
 * them. A schedule for a Muslim day that treats salah as one more item on a
 * list has the shape wrong: the prayers are the fixed points, and work, study
 * and rest fit between them.
 *
 * On the times themselves, plainly: these are estimates and they drift. Real
 * prayer times depend on latitude, longitude, the date and which calculation
 * method a person follows, and none of that is known here. So the defaults are
 * a reasonable UK starting point, they are meant to be corrected in settings,
 * and nothing in this file pretends otherwise — a time shown as exact when it
 * is a guess is worse than one openly labelled a guess.
 */

export type SalahName = "Fajr" | "Dhuhr" | "Asr" | "Maghrib" | "Isha";

export type SalahTime = {
  name: SalahName;
  /** Minutes since local midnight, so arithmetic stays simple. */
  at: number;
};

export const SALAH_KEY = "hundred-steps-salah-v1";

/** How long each prayer holds the day. Enough to pray without rushing. */
export const SALAH_MINUTES = 15;

const hm = (hour: number, minute: number) => hour * 60 + minute;

/**
 * A rough late-summer UK day. Openly approximate — the interface says so, and
 * settings exist to fix them.
 */
export const defaultSalahTimes: SalahTime[] = [
  { name: "Fajr", at: hm(4, 45) },
  { name: "Dhuhr", at: hm(13, 15) },
  { name: "Asr", at: hm(17, 0) },
  { name: "Maghrib", at: hm(20, 15) },
  { name: "Isha", at: hm(21, 45) },
];

export const SALAH_ORDER: SalahName[] = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];

const isSalahTime = (value: unknown): value is SalahTime => {
  const item = value as SalahTime | null;
  return Boolean(
    item &&
      SALAH_ORDER.includes(item.name) &&
      Number.isFinite(item.at) && item.at >= 0 && item.at < 24 * 60,
  );
};

export function readSalahTimes(storage: Pick<Storage, "getItem">, key = SALAH_KEY): SalahTime[] {
  try {
    const raw = JSON.parse(storage.getItem(key) ?? "null") as unknown;
    if (!Array.isArray(raw)) return defaultSalahTimes;
    const clean = raw.filter(isSalahTime);
    return clean.length ? sortByTime(clean) : defaultSalahTimes;
  } catch {
    return defaultSalahTimes;
  }
}

export const sortByTime = (times: SalahTime[]) => [...times].sort((a, b) => a.at - b.at);

export const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes();

export const clock = (minutes: number) =>
  `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(Math.round(minutes) % 60).padStart(2, "0")}`;

/** The prayer currently in its window, if any. */
export function salahNow(times: SalahTime[], now = new Date(), window = SALAH_MINUTES): SalahTime | null {
  const minute = minutesOf(now);
  return times.find((time) => minute >= time.at && minute < time.at + window) ?? null;
}

/** The next prayer due, wrapping to tomorrow's Fajr after Isha. */
export function nextSalah(times: SalahTime[], now = new Date()): { time: SalahTime; inMinutes: number } | null {
  if (!times.length) return null;
  const sorted = sortByTime(times);
  const minute = minutesOf(now);
  const upcoming = sorted.find((time) => time.at > minute);
  if (upcoming) return { time: upcoming, inMinutes: upcoming.at - minute };
  // Past Isha: the next one is the first prayer of tomorrow.
  const first = sorted[0];
  return { time: first, inMinutes: 24 * 60 - minute + first.at };
}

/** The prayer most recently passed, which is the one the day sits after. */
export function lastSalah(times: SalahTime[], now = new Date()): SalahTime | null {
  const sorted = sortByTime(times);
  const minute = minutesOf(now);
  const passed = sorted.filter((time) => time.at <= minute);
  return passed.length ? passed[passed.length - 1] : null;
}

/**
 * The stretch of free time between two prayers that contains a given minute.
 * This is where work actually goes — the day is not a blank sheet, it is the
 * gaps between fixed points.
 */
export function gapAround(times: SalahTime[], minute: number): { from: number; to: number } {
  const sorted = sortByTime(times);
  const before = sorted.filter((time) => time.at + SALAH_MINUTES <= minute).pop();
  const after = sorted.find((time) => time.at > minute);
  return {
    from: before ? before.at + SALAH_MINUTES : 0,
    to: after ? after.at : 24 * 60,
  };
}

/** Whether a whole hour is clear of every prayer window. */
export const hourIsClear = (times: SalahTime[], hour: number) =>
  !times.some((time) => time.at < (hour + 1) * 60 && time.at + SALAH_MINUTES > hour * 60);

export const describeSalah = (time: SalahTime) => `${time.name}, ${clock(time.at)}`;

/**
 * What Sly says about a prayer. Never a nag and never a claim about whether it
 * was prayed — the app has no way of knowing that, and pretending otherwise
 * would be the worst thing it could do here.
 */
export function salahLine(time: SalahTime): string {
  switch (time.name) {
    case "Fajr":
      return "Fajr. The whole day is easier from here.";
    case "Dhuhr":
      return "Dhuhr. Put it down for ten minutes.";
    case "Asr":
      return "Asr. The afternoon has a hinge in it.";
    case "Maghrib":
      return "Maghrib. The day is turning over.";
    default:
      return "Isha. Last one — then the phone goes down.";
  }
}
