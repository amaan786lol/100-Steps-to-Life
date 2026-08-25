/**
 * A browsing session, as Sly counts it.
 *
 * This is the logic behind the userscript: it runs on the watch page, counts
 * shorts, decides when Sly interrupts, and closes the session when the learner
 * says they are done. No DOM, no browser APIs, no userscript globals — so it
 * runs as ordinary tests here, and the script itself stays a thin shell around
 * it.
 *
 * Two rules exist because of a real day that went wrong:
 *
 *   - A session ends when the learner presses "done browsing", not when the
 *     screen goes dark. The phone can only see that a screen was on, and it
 *     counts a video playing to an empty room exactly like one being watched.
 *   - A session nobody closed does not bill hours. Forgetting the button is
 *     the normal case, not the exception, so idle time past a cutoff is
 *     dropped rather than counted — the session is treated as having ended at
 *     the last thing the learner actually did.
 *
 * Between them, time is only counted when there is evidence someone was there.
 */

export type WatchSettings = {
  /** How many shorts before Sly steps in front of the screen. */
  shortsPerInterruption: number;
  /** How long he stays there. */
  interruptionSeconds: number;
  /**
   * Minutes of no activity after which a session is assumed abandoned. The
   * session then counts only up to the last real activity.
   */
  idleCutoffMinutes: number;
};

export const defaultWatchSettings: WatchSettings = {
  shortsPerInterruption: 5,
  interruptionSeconds: 15,
  idleCutoffMinutes: 5,
};

export type WatchSession = {
  startedAt: number;
  /** The last moment the learner demonstrably did something. */
  lastActivityAt: number;
  /** Set when "done browsing" is pressed, or when idle time closed it. */
  endedAt?: number;
  /** How the session finished, so the record can be honest about it. */
  endedBy?: "done" | "idle";
  /** Distinct shorts seen, by their own ids. */
  shortIds: string[];
  /** Interruptions already delivered, so the fifth short only fires once. */
  interruptionsShown: number;
};

export const startSession = (now = Date.now()): WatchSession => ({
  startedAt: now,
  lastActivityAt: now,
  shortIds: [],
  interruptionsShown: 0,
});

const minutes = (value: number) => Math.max(0, value) * 60_000;

/**
 * Note that something happened — a scroll, a tap, a new video. This is what
 * keeps a session alive; without it the session is assumed abandoned.
 */
export const noteActivity = (session: WatchSession, now = Date.now()): WatchSession =>
  session.endedAt ? session : { ...session, lastActivityAt: Math.max(session.lastActivityAt, now) };

/**
 * Count a short, identified by its own id so the same one scrolled back to is
 * not counted twice. Counting is activity in itself.
 */
export function countShort(session: WatchSession, id: string, now = Date.now()): WatchSession {
  if (session.endedAt || !id) return session;
  const seen = session.shortIds.includes(id);
  return {
    ...session,
    lastActivityAt: Math.max(session.lastActivityAt, now),
    shortIds: seen ? session.shortIds : [...session.shortIds, id],
  };
}

export const shortsWatched = (session: WatchSession) => session.shortIds.length;

/** Close the session deliberately. */
export const endSession = (session: WatchSession, now = Date.now()): WatchSession =>
  session.endedAt ? session : { ...session, endedAt: now, endedBy: "done" };

/**
 * Whether the session has been abandoned rather than finished, and if so close
 * it at the last real activity. A forgotten button must not cost an evening.
 */
export function settleIdle(session: WatchSession, settings: WatchSettings, now = Date.now()): WatchSession {
  if (session.endedAt) return session;
  if (now - session.lastActivityAt < minutes(settings.idleCutoffMinutes)) return session;
  return { ...session, endedAt: session.lastActivityAt, endedBy: "idle" };
}

/** Whole minutes this session should be charged, counted to its real end. */
export function sessionMinutes(session: WatchSession, settings: WatchSettings, now = Date.now()): number {
  const settled = settleIdle(session, settings, now);
  const end = settled.endedAt ?? now;
  return Math.max(0, Math.floor((end - settled.startedAt) / 60_000));
}

/* --- When Sly steps in ----------------------------------------------------- */

export type Interruption = { due: boolean; shortsSoFar: number; seconds: number };

/**
 * Sly appears once per block of shorts — at the fifth, the tenth, and so on —
 * and only once for each. He is an interruption, not a wall: the caller shows
 * him for the given seconds and then gets out of the way.
 */
export function interruptionDue(session: WatchSession, settings: WatchSettings): Interruption {
  const per = Math.max(1, Math.round(settings.shortsPerInterruption));
  const earned = Math.floor(shortsWatched(session) / per);
  return {
    due: !session.endedAt && earned > session.interruptionsShown,
    shortsSoFar: shortsWatched(session),
    seconds: Math.max(1, Math.round(settings.interruptionSeconds)),
  };
}

/** Record that an interruption was delivered, so it does not repeat. */
export const markInterruptionShown = (session: WatchSession): WatchSession =>
  ({ ...session, interruptionsShown: session.interruptionsShown + 1 });

/** What Sly says when he lands on a shorts feed. Never scolding. */
export function interruptionLine(shorts: number): string {
  if (shorts >= 20) return `${shorts} shorts. Not a telling-off — just so the number is in front of you.`;
  if (shorts >= 10) return `That is ${shorts}. Still your call, but worth knowing.`;
  return `${shorts} shorts. Fifteen seconds, then it is yours again.`;
}

/* --- What the session reports back ----------------------------------------- */

export type WatchReport = {
  date: string;
  minutes: number;
  shorts: number;
  /** Whether the learner closed it or it timed out. */
  endedBy: "done" | "idle";
};

/**
 * Turn a finished session into something the course can record. Returns null
 * while the session is still open — an unfinished session has no total yet.
 */
export function reportOf(
  session: WatchSession,
  settings: WatchSettings,
  now = Date.now(),
  localDay: (date: Date) => string = (date) => date.toLocaleDateString("en-CA"),
): WatchReport | null {
  const settled = settleIdle(session, settings, now);
  if (!settled.endedAt) return null;
  return {
    date: localDay(new Date(settled.startedAt)),
    minutes: sessionMinutes(settled, settings, now),
    shorts: shortsWatched(settled),
    endedBy: settled.endedBy ?? "done",
  };
}

/**
 * Time the phone measured that no browsing session accounts for.
 *
 * This is the honesty check on the whole arrangement. The userscript only sees
 * a browser; anything watched in a native app is invisible to it. Rather than
 * let that time quietly vanish and leave a day looking clean, the difference is
 * named. Never negative: the two are measured differently and a small overlap
 * either way means nothing.
 */
export const unaccountedMinutes = (measuredTotal: number | null, sessionTotal: number) =>
  measuredTotal === null ? null : Math.max(0, measuredTotal - sessionTotal);
