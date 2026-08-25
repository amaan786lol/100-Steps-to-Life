/**
 * The code Sly hands over when the lesson is passed.
 *
 * Finish the lesson at or above the bar, and the course shows a six-character
 * code. Type it into the script on YouTube and the day opens. Nothing has to
 * talk to anything: the learner carries the code across, the same way they
 * carry the browsing report back.
 *
 * The script can actually check the code rather than accepting any six
 * characters, because both sides derive it from a secret paired once at setup —
 * the same idea as an authenticator app. It is bound to the date and the course
 * day, so yesterday's code is no use today, and a code for day 12 will not open
 * day 13.
 *
 * What this is, plainly: a commitment device, not security. The secret lives in
 * the learner's own userscript, so anyone determined can read it out and skip
 * the lesson entirely. It is not trying to stop a determined person — it is
 * trying to make skipping a deliberate act rather than something that happens
 * by drift. Those are different problems and only the second one is solvable
 * here.
 */

/**
 * Crockford-ish: no I, L, O or U. Removes the 0/O and 1/I confusions, and the
 * U removes the main way six random characters spell something unfortunate.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 6;

/** The share of a lesson's questions that must be right to earn a code. */
export const DEFAULT_BAR = 0.75;

export type LessonResult = { score: number; outOf: number };

/** Whether a result clears the bar. An empty test never counts as passed. */
export function meetsBar(result: LessonResult, bar = DEFAULT_BAR): boolean {
  if (!Number.isFinite(result.score) || !Number.isFinite(result.outOf) || result.outOf <= 0) return false;
  return result.score / result.outOf >= bar;
}

/** A fresh pairing secret. Shown once at setup and pasted into the script. */
export function newSecret(random: Crypto = globalThis.crypto): string {
  const bytes = new Uint8Array(20);
  random.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

const encoder = new TextEncoder();

/**
 * Derive the day's code. Async because it uses the platform's own SHA-256
 * rather than a hand-rolled hash — this runs on YouTube's origin, where
 * crypto.subtle is available, and in the course page.
 */
export async function codeFor(
  secret: string,
  date: string,
  courseDay: number,
  subtle: SubtleCrypto = globalThis.crypto.subtle,
): Promise<string> {
  const material = `${secret}|${date}|${courseDay}`;
  const digest = new Uint8Array(await subtle.digest("SHA-256", encoder.encode(material)));
  let code = "";
  for (let index = 0; index < CODE_LENGTH; index++) code += ALPHABET[digest[index] % ALPHABET.length];
  return code;
}

/**
 * Tidy what someone typed. Codes get read off one screen and typed into
 * another, so spaces, dashes and case are all forgiven, and the two characters
 * most often misread are folded to what they were meant to be.
 */
export const normalise = (input: string) =>
  input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");

/** Whether what was typed is today's code. */
export async function verifyCode(
  input: string,
  secret: string,
  date: string,
  courseDay: number,
  subtle: SubtleCrypto = globalThis.crypto.subtle,
): Promise<boolean> {
  const typed = normalise(input);
  if (typed.length !== CODE_LENGTH) return false;
  return typed === normalise(await codeFor(secret, date, courseDay, subtle));
}

/* --- What the gate knows -------------------------------------------------- */

export type GateState = {
  /** The date the code was accepted for, if it has been. */
  openedFor?: string;
  /** How many wrong codes since the last good one, for gentle wording only. */
  misses?: number;
};

export const GATE_KEY = "hundred-steps-gate-v1";

/** Whether the day has been opened. Codes expire with the date, not a timer. */
export const gateIsOpen = (state: GateState, date: string) => state.openedFor === date;

export const openGate = (date: string): GateState => ({ openedFor: date, misses: 0 });

export const noteMiss = (state: GateState): GateState =>
  ({ ...state, misses: (state.misses ?? 0) + 1 });

/**
 * What Sly says at the door. He is holding the learner to their own rule, so
 * he states it rather than judging it — and after a few wrong tries he points
 * at the likely cause instead of repeating himself.
 */
export function gateLine(state: GateState, date: string, courseDay: number): string {
  if (gateIsOpen(state, date)) return "Open for today. Enjoy it — you earned this one.";
  const misses = state.misses ?? 0;
  if (misses >= 3) {
    return `Still not it. Codes are for one day only, so an old one will not work — finish day ${courseDay} and I will give you today's.`;
  }
  if (misses > 0) return "Not that one. Check it against the course screen.";
  return `Finish day ${courseDay} and I will give you the code.`;
}
