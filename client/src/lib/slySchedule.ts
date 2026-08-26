/**
 * Today's structured day, built by Sly from yesterday's measured screen time.
 *
 * This exists because the AI planner cannot run inside the Android app: those
 * endpoints need a signed-in user, sign-in is OAuth, and the redirect URI is
 * built from the page's origin — which in the app is the asset loader's
 * placeholder domain. So the plan that matters most in the app is the one that
 * needs nothing but the device.
 *
 * It is not a worse version of the AI plan. It is a different one, and on the
 * single question of "what did yesterday actually cost me" it is strictly
 * better informed: it works from a measured number rather than from a
 * photograph of one.
 *
 * The rules Sly speaks under hold here too. Yesterday is evidence, never a
 * verdict; a heavy day changes the shape of today's plan rather than earning a
 * telling-off; and nothing is invented — an unmeasured yesterday is said to be
 * unmeasured rather than guessed at.
 */

import { bookedHours, commitmentsAt, describeCommitment, firstFreeHour, type Commitment } from "./commitments";
import { currentLocalDay, habitRun, type StoredHabit } from "./dailyCheckin";
import { formatDuration, type ScreenTimeGoal } from "./screenTimeUsage";
import { SALAH_MINUTES, clock as salahClock, hourIsClear, salahLine, type SalahTime } from "./salah";
import { needsAttention, stillOpen } from "./slyVoice";

export type ScheduleBlock = {
  /** Wall-clock time, e.g. "07:30". */
  time: string;
  action: string;
  /** Why this block, in Sly's voice. */
  reason: string;
  /** What this block serves, so the interface can mark the lesson step. */
  kind: "lesson" | "habit" | "boundary" | "check" | "salah";
};

export type SlyPlan = {
  /** The one thing today is arranged around. */
  focus: string;
  /** What yesterday showed, stated plainly. */
  reading: string;
  blocks: ScheduleBlock[];
  /** One way to make the thing you want less of harder to reach. */
  friction: string;
  /** One thing to do instead. */
  replacement: string;
  /** The evening question. */
  checkIn: string;
};

export type ScheduleInput = {
  lesson?: { day: number; title: string; actionPrompt: string } | null;
  habits: StoredHabit[];
  /** Yesterday's total, or null when the device could not say. */
  yesterdayMinutes: number | null;
  goal: ScreenTimeGoal;
  /** Hours already spoken for — madressa, school, work. */
  commitments?: Commitment[];
  /** The five prayers. The day is arranged around these, not beside them. */
  salah?: SalahTime[];
  now?: Date;
};

/** How yesterday sat against the limit. The plan's shape follows from this. */
export type Weight = "unmeasured" | "under" | "over" | "well-over";

export function weighYesterday(minutes: number | null, goal: ScreenTimeGoal): Weight {
  if (minutes === null) return "unmeasured";
  const over = minutes - goal.target;
  if (over <= 0) return "under";
  return over >= 60 ? "well-over" : "over";
}

const clock = (hour: number, minute = 0) => `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

/**
 * When to put the phone down. A heavier yesterday brings the boundary earlier,
 * which is the one lever that reliably moves the next day's total — but never
 * before 20:00, because a boundary nobody will keep is worse than none.
 */
const boundaryHour = (weight: Weight) => (weight === "well-over" ? 20 : weight === "over" ? 21 : 22);

function readingFor(minutes: number | null, goal: ScreenTimeGoal, weight: Weight): string {
  if (minutes === null || weight === "unmeasured") {
    return "Yesterday was not measured, so today is built on the lesson and your habits alone. No guessing from me.";
  }
  const total = formatDuration(minutes);
  const target = formatDuration(goal.target);
  if (weight === "under") return `Yesterday came to ${total}, inside your ${target}. Today keeps that rather than chasing it lower.`;
  const over = formatDuration(minutes - goal.target);
  return weight === "well-over"
    ? `Yesterday came to ${total} — ${over} past your ${target}. That is most of an evening. Today is arranged to give that time somewhere else to go.`
    : `Yesterday came to ${total}, ${over} past your ${target}. Not a disaster, and worth a small change today.`;
}

/**
 * Build the day.
 *
 * The lesson step always gets its own block and always comes before the
 * evening, because a step left until late is a step that competes with being
 * tired. Habits follow it. The boundary and the check-in close the day.
 */
export function slySchedule(input: ScheduleInput): SlyPlan {
  const { lesson, habits, yesterdayMinutes, goal } = input;
  const now = input.now ?? new Date();
  const commitments = input.commitments ?? [];
  const weight = weighYesterday(yesterdayMinutes, goal);
  const blocks: ScheduleBlock[] = [];

  const heavy = weight === "well-over" || weight === "over";
  const booked = bookedHours(commitments, now);
  const boundary = boundaryHour(weight);

  const salah = input.salah ?? [];

  /**
   * The next hour that is free of a commitment, clear of a prayer, and before
   * the day closes. Work goes in the gaps between fixed points, not on top of
   * them.
   */
  const freeFrom = (hour: number) => {
    for (let candidate = hour; candidate < boundary; candidate++) {
      const free = firstFreeHour(commitments, now, candidate, boundary);
      if (free === null) break;
      if (hourIsClear(salah, free)) return free;
      candidate = free;
    }
    return firstFreeHour(commitments, now, hour, boundary) ?? hour;
  };

  // After a heavy day the lesson goes early, before the day fills up again —
  // but never on top of something already booked. A step scheduled into a room
  // the learner is already sitting in is a step that will not happen.
  const lessonHour = freeFrom(heavy ? 9 : 10);

  if (lesson) {
    const moved = booked.has(heavy ? 9 : 10);
    blocks.push({
      time: clock(lessonHour),
      action: lesson.actionPrompt,
      reason: `Day ${lesson.day}, ${lesson.title}. This is the one block worth protecting${
        moved
          ? `, moved clear of ${commitmentsAt(commitments, now, heavy ? 9 : 10).map((item) => item.name).join(" and ")}`
          : heavy ? " — and early, before yesterday's shape repeats itself" : ""
      }.`,
      kind: "lesson",
    });
  }

  // currentLocalDay(now), not the wall clock: every other reading here is
  // taken from `now`, and one of them quietly disagreeing is how a plan ends
  // up listing a habit that was already marked.
  const open = stillOpen(habits, currentLocalDay(now));
  const slipping = needsAttention(habits, now);
  // The slipping habit first: it is the one least likely to happen by itself.
  const ordered = slipping ? [slipping, ...open.filter((habit) => habit.id !== slipping.id)] : open;

  // Habits you are cutting down are not hour-long jobs — "leave scrolling
  // alone at 15:00" is nonsense. They belong to the evening, and they are
  // named at the boundary instead of given a block of their own.
  const toDo = ordered.filter((habit) => habit.mode === "build");
  const toAvoid = ordered.filter((habit) => habit.mode === "reduce");

  let nextHabitHour = lessonHour;
  toDo.slice(0, 3).forEach((habit) => {
    const run = habitRun(habit, now);
    nextHabitHour = freeFrom(nextHabitHour + 3);
    blocks.push({
      time: clock(nextHabitHour),
      action: habit.name,
      reason: habit === slipping
        ? "This one has gone quiet. Putting it at a fixed time is usually what restarts it."
        : run >= 2
          ? `${run} days running. Keep it where it already works.`
          : "Small, and on the list because you put it there.",
      kind: "habit",
    });
  });

  for (const prayer of salah) {
    blocks.push({
      time: salahClock(prayer.at),
      action: prayer.name,
      reason: salahLine(prayer),
      kind: "salah",
    });
  }

  blocks.push({
    time: clock(boundary),
    action: toAvoid.length
      ? `Phone down for the night — and ${toAvoid.map((habit) => habit.name.toLowerCase()).join(", ")} with it`
      : "Phone down for the night",
    reason: weight === "well-over"
      ? "Earlier than you will want. It is the one lever that actually moves tomorrow's number."
      : weight === "over"
        ? "An hour earlier than yesterday ended, which is enough to change the total."
        : weight === "under"
          ? "Yesterday was already inside your limit. This just holds it there."
          : "A fixed end to the day, measured or not.",
    kind: "boundary",
  });

  blocks.push({
    time: clock(boundary + 1),
    action: "Mark today off",
    reason: "Whatever happened. The record is only useful if it is honest.",
    kind: "check",
  });

  blocks.sort((a, b) => a.time.localeCompare(b.time));

  const todaysCommitments = commitments.filter((item) => item.days.length === 0 || item.days.includes(now.getDay()));

  return {
    focus: lesson ? lesson.actionPrompt : open[0]?.name ?? "Pick one thing worth protecting today.",
    reading: readingFor(yesterdayMinutes, goal, weight)
      + (todaysCommitments.length
        ? ` Today already holds ${todaysCommitments.map(describeCommitment).join(" and ")}, so this fits around it.`
        : ""),
    blocks,
    friction: heavy
      ? "Charge the phone outside the room you sleep in tonight. Distance does more than willpower."
      : "Put the one app you reach for without deciding on the last home screen, in a folder.",
    replacement: slipping
      ? `When you reach for the phone out of habit, do ${slipping.name} instead. It is already on your list.`
      : lesson
        ? "When you reach for the phone out of habit, do today's lesson step instead."
        : "Have one thing ready to do instead, decided now rather than in the moment.",
    checkIn: weight === "unmeasured"
      ? "Tonight: did the lesson step happen, and did the phone go down when you said?"
      : `Tonight: is today's total under ${formatDuration(goal.target)}, and did the lesson step happen?`,
  };
}
