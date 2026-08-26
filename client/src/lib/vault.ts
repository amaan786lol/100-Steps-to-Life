/**
 * The key to the blocker, held behind the day's lesson.
 *
 * The blocking is done by a separate app whose password is fixed and short:
 * four to eight letters, no digits. That constraint decides the whole design.
 *
 * A thirty-character key would work as a gate because nobody memorises one.
 * Eight letters is a different problem — it gets typed after every lesson, and
 * within a week or two it is known by heart, at which point the gate is
 * decoration. So the key is not the defence here. Rotation is. Every week a new
 * one is generated, someone else carries it into the blocker, and whatever was
 * memorised last week stops working.
 *
 * Letters are drawn from consonants only. Not for entropy — twenty letters over
 * eight places is far past anything that gets guessed — but because a string
 * with no vowels forms no word, and words are what get remembered.
 *
 * Two keys exist during a handover: the one the blocker currently holds, and
 * the one waiting to replace it. They are tracked separately because the app
 * cannot see the blocker. Until someone confirms the new key has been entered,
 * the old one is still the password, and showing the new one early would lock
 * the learner out of a thing they earned.
 *
 * What this is, plainly: friction that works because the learner wants it to.
 * Once a key has been shown it can be written down, and nothing here stops
 * that. Rotation is what keeps the copy stale.
 */

/** Consonants only: no vowels, so a key spells nothing and reads as noise. */
const ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";

/** What the blocker accepts. Eight is the ceiling, and worth using in full. */
export const MIN_LENGTH = 4;
export const MAX_LENGTH = 8;
export const DEFAULT_LENGTH = 8;

/** The share of a lesson's questions that must be right to open the vault. */
export const DEFAULT_BAR = 0.75;

/**
 * A week. Short enough that memorising the key buys little, long enough that
 * whoever enters it is not being asked for a daily favour.
 */
export const DEFAULT_ROTATION_DAYS = 7;

export type LessonResult = { score: number; outOf: number };

/** Whether a result clears the bar. An empty or impossible test never passes. */
export function meetsBar(result: LessonResult | undefined, bar = DEFAULT_BAR): boolean {
  if (!result) return false;
  const { score, outOf } = result;
  if (!Number.isFinite(score) || !Number.isFinite(outOf) || outOf <= 0) return false;
  if (score < 0 || score > outOf) return false;
  return score / outOf >= bar;
}

export const clampLength = (length: number) =>
  Math.max(MIN_LENGTH, Math.min(MAX_LENGTH, Math.round(length)));

export function makeKey(length = DEFAULT_LENGTH, random: Crypto = globalThis.crypto): string {
  const size = clampLength(length);
  const bytes = new Uint8Array(size);
  random.getRandomValues(bytes);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
}

/* --- The vault ------------------------------------------------------------ */

export type Vault = {
  /** The key the blocker holds right now. */
  key: string;
  /** The date that key was carried into the blocker. */
  since: string;
  /** A replacement that has been generated but not yet entered. */
  next: string | null;
  /** Days between replacements, or null to keep one key indefinitely. */
  rotationDays: number | null;
  /** How long a generated key is, within what the blocker accepts. */
  length: number;
  /** Dates the key was handed over. An honesty record, nothing more. */
  openedOn: string[];
  /** Super keys banked, from days answered perfectly. */
  supers: number;
  /** Dates a super key was earned, so one perfect day banks exactly one. */
  superEarnedOn: string[];
  /** Dates opened by spending a super rather than by passing that day. */
  superSpentOn: string[];
};

/**
 * How many super keys can be held at once. Uncapped, a strong fortnight would
 * bank enough opens to remove the gate for a month, which is the opposite of
 * what they are for. Three is a cushion, not a bypass.
 */
export const SUPER_CAP = 3;

export const VAULT_STORAGE_KEY = "hundred-steps-vault-v1";

export function newVault(
  today: string,
  rotationDays: number | null = DEFAULT_ROTATION_DAYS,
  length = DEFAULT_LENGTH,
  random: Crypto = globalThis.crypto,
): Vault {
  const size = clampLength(length);
  return {
    key: makeKey(size, random), since: today, next: null, rotationDays, length: size,
    openedOn: [], supers: 0, superEarnedOn: [], superSpentOn: [],
  };
}

const DAY_MS = 86_400_000;

/** Whole days between two YYYY-MM-DD dates. Negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((end - start) / DAY_MS);
}

/** The date the current key is due to be replaced, or null if it never is. */
export function dueOn(vault: Vault): string | null {
  if (vault.rotationDays === null) return null;
  return new Date(Date.parse(`${vault.since}T00:00:00Z`) + vault.rotationDays * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

export function isDue(vault: Vault, today: string): boolean {
  const due = dueOn(vault);
  return due !== null && daysBetween(due, today) >= 0;
}

/** Days until the next replacement. Null when rotation is off. */
export function daysUntilDue(vault: Vault, today: string): number | null {
  const due = dueOn(vault);
  return due === null ? null : daysBetween(today, due);
}

/**
 * Generate the replacement. Idempotent: calling it twice on the same vault
 * keeps the key already waiting, so a re-render never invalidates one that has
 * been written down ready to enter.
 */
export function prepareNext(vault: Vault, random: Crypto = globalThis.crypto): Vault {
  if (vault.next) return vault;
  return { ...vault, next: makeKey(vault.length, random) };
}

/**
 * Confirm the waiting key has been entered into the blocker. Only now does it
 * become the password, because until someone typed it there the old one is
 * still what opens the app.
 */
export function carryOver(vault: Vault, today: string): Vault {
  if (!vault.next) return vault;
  return { ...vault, key: vault.next, since: today, next: null };
}

/** Abandon a waiting key without using it — the handover did not happen. */
export const cancelNext = (vault: Vault): Vault => (vault.next ? { ...vault, next: null } : vault);

/* --- Opening it ----------------------------------------------------------- */

/** Whether today's own result clears the bar. */
export const canOpen = (result: LessonResult | undefined, bar = DEFAULT_BAR): boolean =>
  meetsBar(result, bar);

/* --- Super keys ----------------------------------------------------------- */

/** Every question right, on a check that actually had questions. */
export const isPerfect = (result: LessonResult | undefined): boolean =>
  Boolean(result) && result!.outOf > 0 && result!.score === result!.outOf;

/**
 * Bank a super key for a day answered perfectly. One per day at most, and only
 * up to the cap — beyond that a perfect day is its own reward, which is the
 * right answer anyway.
 */
export function awardSuper(vault: Vault, date: string, result: LessonResult | undefined): Vault {
  if (!isPerfect(result) || vault.superEarnedOn.includes(date)) return vault;
  return {
    ...vault,
    superEarnedOn: [...vault.superEarnedOn, date],
    supers: Math.min(SUPER_CAP, vault.supers + 1),
  };
}

/**
 * Spend one to open a day that was not passed. Refused when the day is already
 * open, so a super is never burned on something that was free.
 */
export function spendSuper(vault: Vault, date: string, result?: LessonResult, bar = DEFAULT_BAR): Vault {
  if (vault.supers <= 0) return vault;
  if (canOpen(result, bar) || vault.superSpentOn.includes(date)) return vault;
  return { ...vault, supers: vault.supers - 1, superSpentOn: [...vault.superSpentOn, date] };
}

/** Whether the vault is open today, by passing or by a super already spent. */
export const isOpen = (vault: Vault, result: LessonResult | undefined, date: string, bar = DEFAULT_BAR): boolean =>
  canOpen(result, bar) || vault.superSpentOn.includes(date);

/** Whether spending one would achieve anything right now. */
export const canSpendSuper = (vault: Vault, result: LessonResult | undefined, date: string, bar = DEFAULT_BAR): boolean =>
  vault.supers > 0 && !isOpen(vault, result, date, bar);

/** Record that the key was shown. The same date is never counted twice. */
export function noteOpened(vault: Vault, date: string): Vault {
  if (vault.openedOn.includes(date)) return vault;
  return { ...vault, openedOn: [...vault.openedOn, date] };
}

export const openedOn = (vault: Vault, date: string) => vault.openedOn.includes(date);

/** How many of the last `window` days the key was handed over on. */
export function opensInLast(vault: Vault, today: string, window = 7): number {
  return vault.openedOn.filter((date) => {
    const ago = daysBetween(date, today);
    return ago >= 0 && ago < window;
  }).length;
}

/**
 * What Sly says at the vault. He is holding the learner to a rule they set for
 * themselves, so he states it plainly rather than praising or scolding, and
 * when the day is not passed he names what would open it instead of repeating
 * that it is shut.
 */
export function vaultLine(
  vault: Vault,
  result: LessonResult | undefined,
  today: string,
  courseDay: number,
  bar = DEFAULT_BAR,
): string {
  if (vault.next) {
    return "There is a new key waiting. Until someone puts it into the blocker, the old one is still the password.";
  }
  if (isDue(vault, today)) {
    return "This key is due to be replaced. Whatever you have memorised is about to stop working, which is the point of it.";
  }
  if (vault.superSpentOn.includes(today) && !canOpen(result, bar)) {
    return "Opened on a super key. You earned that on a day you got everything right — spend it and it is gone.";
  }
  if (canOpen(result, bar)) {
    const opens = opensInLast(vault, today);
    if (isPerfect(result)) return "Every one right. That banks a super key as well — here it is.";
    if (opens >= 5) return `Here it is. That is ${opens} days this week — worth knowing, not worth a lecture.`;
    return "Here it is. You did the day first, which was the whole deal.";
  }
  if (result && result.outOf > 0) {
    const needed = Math.ceil(result.outOf * bar);
    const spare = vault.supers > 0 ? ` You are holding ${vault.supers}, if you would rather spend one.` : "";
    return `${result.score} out of ${result.outOf}. ${needed} would open it — the check can be taken again.${spare}`;
  }
  return `Day ${courseDay} first. Pass the check and the key is yours.`;
}
