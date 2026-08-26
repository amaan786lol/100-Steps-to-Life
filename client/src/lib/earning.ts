/**
 * What the work earns.
 *
 * XP for doing the day properly, and two passes that open the lockout when
 * enough good days have accumulated.
 *
 * One rule shapes all of this, and it comes from the course rather than from
 * game design. The fourth principle says: *missed steps are information; the
 * route asks for a return, not a performance.* So qualifying days **accumulate
 * and never reset**. Miss a Tuesday and it costs you that Tuesday — not the
 * fortnight behind it.
 *
 * That is deliberately not the usual streak mechanic. A streak that wipes on
 * one bad day teaches that a slip erases the work, which is the opposite of
 * returning, and it is the exact thing this course argues against. The bar is
 * kept high by requiring more days, not by threatening to delete them.
 *
 * Every threshold lives in PASS_RULES so it can be retuned in one line once
 * there is real experience of whether it is too mean or too easy. The numbers
 * are a first guess and are not pretending otherwise.
 */

export type DayResult = {
  date: string;
  /** The lesson was passed and the code issued. */
  lessonProven: boolean;
  /** The lesson's own score, when it was a marked test. */
  lessonScore?: { score: number; outOf: number };
  /** Break goals Sly set, and how many came back done. */
  goalsSet: number;
  goalsCompleted: number;
  /** Whether the day's screen time stayed inside the goal. */
  withinScreenGoal: boolean;
  /** Minutes watched when the plan said otherwise. */
  offPlanMinutes: number;
};

export type PassTier = "short" | "evening";

export type PassRule = {
  /** Qualifying days needed. Cumulative, never reset. */
  days: number;
  xp: number;
  /** Share of a marked test that must be right for the day to qualify. */
  scoreBar: number;
  /** Whether every counted day must have no off-plan minutes at all. */
  demandsCleanDays: boolean;
  /** Minutes the pass opens for; null means until the evening boundary. */
  minutes: number | null;
  label: string;
};

/** A first guess. Tunable here, in one place, once it has been lived with. */
export const PASS_RULES: Record<PassTier, PassRule> = {
  short: { days: 7, xp: 150, scoreBar: 0.8, demandsCleanDays: false, minutes: 45, label: "45 minutes" },
  evening: { days: 14, xp: 500, scoreBar: 0.9, demandsCleanDays: true, minutes: null, label: "the evening" },
};

/* --- XP -------------------------------------------------------------------- */

export const XP = {
  lesson: 10,
  perGoal: 5,
  withinScreenGoal: 5,
  /** Up to this much more, in proportion to the test score. */
  scoreBonus: 10,
};

/**
 * What a day earned. Nothing is ever subtracted: an off-plan hour stops a day
 * counting towards a pass, which is consequence enough, and taking XP away for
 * it would be a punishment rather than a price.
 */
export function xpFor(day: DayResult): number {
  let earned = 0;
  if (day.lessonProven) earned += XP.lesson;
  earned += Math.max(0, Math.min(day.goalsCompleted, day.goalsSet)) * XP.perGoal;
  if (day.withinScreenGoal) earned += XP.withinScreenGoal;
  if (day.lessonScore && day.lessonScore.outOf > 0) {
    earned += Math.round((day.lessonScore.score / day.lessonScore.outOf) * XP.scoreBonus);
  }
  return earned;
}

export const totalXp = (days: DayResult[]) => days.reduce((sum, day) => sum + xpFor(day), 0);

/* --- Which days count ------------------------------------------------------ */

/**
 * A day counts towards a pass when the lesson was proven, every goal Sly set
 * came back done, and screen time stayed inside the goal — plus the tier's own
 * demands on score and off-plan time.
 */
export function isQualifyingDay(day: DayResult, rule: PassRule): boolean {
  if (!day.lessonProven) return false;
  if (day.goalsCompleted < day.goalsSet) return false;
  if (!day.withinScreenGoal) return false;
  if (rule.demandsCleanDays && day.offPlanMinutes > 0) return false;
  if (day.lessonScore && day.lessonScore.outOf > 0) {
    if (day.lessonScore.score / day.lessonScore.outOf < rule.scoreBar) return false;
  }
  return true;
}

export const qualifyingDays = (days: DayResult[], rule: PassRule) =>
  days.filter((day) => isQualifyingDay(day, rule)).length;

/* --- Progress towards a pass ----------------------------------------------- */

export type PassProgress = {
  tier: PassTier;
  days: number;
  daysNeeded: number;
  xp: number;
  xpNeeded: number;
  ready: boolean;
  /** The one thing still missing, for Sly to name. */
  shortfall: string;
};

export function passProgress(days: DayResult[], tier: PassTier, spentXp = 0): PassProgress {
  const rule = PASS_RULES[tier];
  const counted = qualifyingDays(days, rule);
  const xp = Math.max(0, totalXp(days) - spentXp);
  const ready = counted >= rule.days && xp >= rule.xp;

  const missingDays = Math.max(0, rule.days - counted);
  const missingXp = Math.max(0, rule.xp - xp);
  const shortfall = ready
    ? "Ready."
    : missingDays && missingXp
      ? `${missingDays} more good ${missingDays === 1 ? "day" : "days"} and ${missingXp} XP.`
      : missingDays
        ? `${missingDays} more good ${missingDays === 1 ? "day" : "days"}.`
        : `${missingXp} more XP.`;

  return { tier, days: counted, daysNeeded: rule.days, xp, xpNeeded: rule.xp, ready, shortfall };
}

/* --- Holding and spending -------------------------------------------------- */

export type PassState = {
  /** XP already spent on passes. */
  spent: number;
  /** Passes bought and not yet used. */
  held: PassTier[];
  /** date -> tier, so a used pass is visible in the record. */
  used: Array<{ date: string; tier: PassTier }>;
};

export const EARNING_KEY = "hundred-steps-earning-v1";

export const emptyPassState = (): PassState => ({ spent: 0, held: [], used: [] });

/** Buy a pass, if it has been earned. Returns the state unchanged if not. */
export function buyPass(state: PassState, days: DayResult[], tier: PassTier): PassState {
  if (!passProgress(days, tier, state.spent).ready) return state;
  return { ...state, spent: state.spent + PASS_RULES[tier].xp, held: [...state.held, tier] };
}

/** Spend one, recording it. Never silent — using one is a choice, not a secret. */
export function usePass(state: PassState, tier: PassTier, date: string): PassState {
  const index = state.held.indexOf(tier);
  if (index === -1) return state;
  return {
    ...state,
    held: state.held.filter((_, i) => i !== index),
    used: [...state.used, { date, tier }],
  };
}

export const passUsedOn = (state: PassState, date: string) =>
  state.used.find((entry) => entry.date === date) ?? null;

/**
 * What Sly says about the pass. He is describing a price and a balance, not
 * awarding or withholding approval.
 */
export function passLine(progress: PassProgress): string {
  const rule = PASS_RULES[progress.tier];
  if (progress.ready) return `You have earned ${rule.label}. It is there when you want it.`;
  return `${rule.label}: ${progress.days} of ${progress.daysNeeded} good days, ${progress.xp} of ${rule.xp} XP. ${progress.shortfall}`;
}
