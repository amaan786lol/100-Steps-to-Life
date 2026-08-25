/**
 * Sly — the fox who interrupts.
 *
 * A work/break cycle with a character attached: after a stretch of unbroken
 * use, Sly steps in front of the screen and asks for a break, and stays there
 * until the break is over or the learner deliberately dismisses him.
 *
 * The rules follow the rest of the course. Sly is an interruption, not a
 * punishment: he can always be sent away, sending him away is never recorded
 * against the learner, and nothing here is a score. The one thing he will not
 * do is pretend a break happened when it did not.
 *
 * Everything is derived from timestamps rather than counted by a ticking
 * variable, so closing the app, sleeping the phone, or leaving the tab in the
 * background cannot quietly earn credit for a break that was never taken.
 */

export type SlySettings = {
  /** Minutes of use before Sly interrupts. */
  workMinutes: number;
  /** Minutes the break should last. */
  breakMinutes: number;
  /** Whether Sly is watching at all. */
  enabled: boolean;
};

export const defaultSlySettings: SlySettings = { workMinutes: 30, breakMinutes: 15, enabled: true };

export type SlyState = {
  /** When the current stretch of use began. */
  stretchStartedAt: number;
  /** When the current break began, if one is running. */
  breakStartedAt?: number;
  /** When Sly was last sent away, so he does not reappear immediately. */
  snoozedUntil?: number;
};

export const freshState = (now = Date.now()): SlyState => ({ stretchStartedAt: now });

export type SlyPhase =
  | { phase: "working"; usedMs: number; untilBreakMs: number }
  | { phase: "due"; usedMs: number }
  | { phase: "resting"; remainingMs: number }
  | { phase: "off" };

const minutes = (value: number) => Math.max(1, value) * 60_000;

/**
 * Where the cycle stands right now. Pure, so the interface can simply render
 * the answer and the tests can drive the clock.
 */
export function slyPhase(state: SlyState, settings: SlySettings, now = Date.now()): SlyPhase {
  if (!settings.enabled) return { phase: "off" };

  if (state.breakStartedAt) {
    const remainingMs = state.breakStartedAt + minutes(settings.breakMinutes) - now;
    // A break that has run its course is over, whether or not anyone was looking.
    if (remainingMs > 0) return { phase: "resting", remainingMs };
    return { phase: "working", usedMs: 0, untilBreakMs: minutes(settings.workMinutes) };
  }

  const usedMs = Math.max(0, now - state.stretchStartedAt);
  const untilBreakMs = state.stretchStartedAt + minutes(settings.workMinutes) - now;
  if (untilBreakMs > 0) return { phase: "working", usedMs, untilBreakMs };
  if (state.snoozedUntil && now < state.snoozedUntil) return { phase: "working", usedMs, untilBreakMs: state.snoozedUntil - now };
  return { phase: "due", usedMs };
}

/** Begin the break Sly asked for. */
export const startBreak = (state: SlyState, now = Date.now()): SlyState =>
  ({ ...state, breakStartedAt: now, snoozedUntil: undefined });

/**
 * End a break and start a fresh stretch. Used both when the break runs out and
 * when the learner comes back early — coming back early is allowed, and is not
 * recorded as a failure anywhere.
 */
export const endBreak = (state: SlyState, now = Date.now()): SlyState =>
  ({ stretchStartedAt: now });

/** Send Sly away for a while without taking the break. */
export const snooze = (state: SlyState, forMinutes = 5, now = Date.now()): SlyState =>
  ({ ...state, snoozedUntil: now + minutes(forMinutes) });

/**
 * Bring the state forward after time away from the app. A gap at least as long
 * as the break counts as a break already taken — the learner did stop looking
 * at the screen, which is the whole point.
 */
export function resume(state: SlyState, settings: SlySettings, lastSeenAt: number, now = Date.now()): SlyState {
  const away = now - lastSeenAt;
  if (away >= minutes(settings.breakMinutes)) return freshState(now);
  if (state.breakStartedAt) return state;
  // A shorter absence is not a break, but it is not screen time either.
  return { ...state, stretchStartedAt: state.stretchStartedAt + Math.max(0, away) };
}

/** mm:ss, for a countdown that has to be read at a glance. */
export function countdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** What Sly says. Kept short, and never scolding. */
export function slyLine(phase: SlyPhase): string {
  switch (phase.phase) {
    case "due":
      return "That is a long stretch. Put it down for a bit — I will still be here.";
    case "resting":
      return "Break time. Look at something further away than this.";
    case "working":
      return phase.untilBreakMs < 5 * 60_000 ? "Nearly time for a break." : "Carry on. I am watching the clock.";
    default:
      return "I am off duty.";
  }
}
