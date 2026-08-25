import React, { useMemo } from "react";
import { Clock } from "lucide-react";

import { SlyFox } from "@/components/Sly";
import { dayKeyOffset, loadDailyCheckin, type StoredHabit } from "@/lib/dailyCheckin";
import { getLesson } from "@/data/course";
import { defaultGoal, findDay, readHistory, type ScreenTimeGoal } from "@/lib/screenTimeUsage";
import { slySchedule } from "@/lib/slySchedule";
import { readCommitments } from "@/lib/commitments";
import { readSalahTimes } from "@/lib/salah";

const HABITS_KEY = "hundred-steps-habit-studio-v1";
const COURSE_KEY = "hundred-steps-to-life-v1";
const GOAL_KEY = "hundred-steps-screen-time-goal-v1";

function loadGoal(): ScreenTimeGoal {
  try {
    const raw = JSON.parse(localStorage.getItem(GOAL_KEY) ?? "null") as ScreenTimeGoal | null;
    return raw && typeof raw.target === "number" ? { ...defaultGoal, ...raw } : defaultGoal;
  } catch {
    return defaultGoal;
  }
}

function loadLesson() {
  try {
    const journal = JSON.parse(localStorage.getItem(COURSE_KEY) ?? "null") as { currentDay?: number } | null;
    const lesson = getLesson(Math.min(100, Math.max(1, Math.round(journal?.currentDay ?? 1))));
    return { day: lesson.day, title: lesson.title, actionPrompt: lesson.actionPrompt };
  } catch {
    return null;
  }
}

function loadHabits(): StoredHabit[] {
  try {
    return loadDailyCheckin(localStorage, HABITS_KEY).habits;
  } catch {
    return [];
  }
}

/**
 * The structured day Sly builds on the device.
 *
 * This needs no server and no sign-in, which is the point: the AI planner
 * cannot run inside the Android app, and the app is where the real screen-time
 * figure lives. Yesterday's measured total is what shapes it.
 */
export function SlyDayPlan({ revision = 0 }: { revision?: number }) {
  const plan = useMemo(() => {
    const now = new Date();
    const yesterdayKey = dayKeyOffset(-1, now);
    const yesterday = findDay(readHistory(localStorage), yesterdayKey);
    return slySchedule({
      lesson: loadLesson(),
      habits: loadHabits(),
      commitments: readCommitments(localStorage),
      salah: readSalahTimes(localStorage),
      // undefined means the day was never recorded — the same "not known" the
      // panel shows as a gap, not a zero.
      yesterdayMinutes: yesterday?.minutes ?? null,
      goal: loadGoal(),
      now,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revision signals storage moved
  }, [revision]);

  return (
    <article className="paper-card sly-plan">
      <span className="eyebrow">SLY'S PLAN FOR TODAY</span>
      <div className="sly-plan-head">
        <SlyFox mood="watching" />
        <p>{plan.reading}</p>
      </div>

      <h3>{plan.focus}</h3>

      <ol className="sly-plan-blocks">
        {plan.blocks.map((block, index) => (
          <li key={`${block.time}-${index}`} className={`block-${block.kind}`}>
            <span><Clock aria-hidden="true" />{block.time}</span>
            <div>
              <strong>{block.action}</strong>
              <p>{block.reason}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="sly-plan-notes">
        <p><b>Make it harder:</b> {plan.friction}</p>
        <p><b>Do instead:</b> {plan.replacement}</p>
        <p><b>Tonight:</b> {plan.checkIn}</p>
      </div>

      <small>Built on this device from yesterday's measured screen time. No sign-in, no server, works offline.</small>
    </article>
  );
}
