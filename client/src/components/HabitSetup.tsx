import React, { useState } from "react";
import { Check, ChevronLeft, ChevronRight, Minus, Plus, Trash2, X } from "lucide-react";

import { SlyFox } from "@/components/Sly";
import {
  COMMITMENTS_KEY,
  SETUP_DISMISSED_KEY,
  WEEKDAYS,
  commitmentSuggestions,
  describeCommitment,
  readCommitments,
  type Commitment,
} from "@/lib/commitments";
import { currentLocalDay, type StoredHabit } from "@/lib/dailyCheckin";
import { SALAH_KEY, clock as salahClock, readSalahTimes, type SalahTime } from "@/lib/salah";

const COURSE_KEY = "hundred-steps-to-life-v1";
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type SetupResult = {
  habits: StoredHabit[];
  commitments: Commitment[];
  courseDay: number;
  salah: SalahTime[];
};

/**
 * Setting up the habit side.
 *
 * Shown in full the first time someone opens Habits, and reachable from the
 * settings icon afterwards. Two modes, because they are two different jobs: a
 * first-timer is making decisions and gets one at a time; someone coming back
 * knows what they want to change and gets it all on one screen.
 *
 * It can always be skipped. A wall on first open is how you lose someone before
 * anything has worked once, and everything here has a sane answer without it —
 * no commitments, day one, no habits until there are.
 */
export function HabitSetup({
  mode,
  habits,
  courseDay,
  onSave,
  onSkip,
  onClose,
}: {
  /** "steps" walks through it; "all" is the settings view. */
  mode: "steps" | "all";
  habits: StoredHabit[];
  courseDay: number;
  onSave: (result: SetupResult) => void;
  onSkip?: () => void;
  onClose?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [draftHabits, setDraftHabits] = useState<StoredHabit[]>(habits);
  const [draftCommitments, setDraftCommitments] = useState<Commitment[]>(() => readCommitments(localStorage));
  const [day, setDay] = useState(courseDay);
  const [habitName, setHabitName] = useState("");
  const [habitMode, setHabitMode] = useState<"build" | "reduce">("build");
  const [salah, setSalah] = useState<SalahTime[]>(() => readSalahTimes(localStorage));

  const addHabit = () => {
    const name = habitName.trim();
    if (!name) return;
    setDraftHabits([...draftHabits, { id: crypto.randomUUID(), name, mode: habitMode, done: false, log: {} }]);
    setHabitName("");
  };

  const addCommitment = (commitment: Commitment) =>
    setDraftCommitments([...draftCommitments, { ...commitment }]);

  const updateCommitment = (index: number, patch: Partial<Commitment>) =>
    setDraftCommitments(draftCommitments.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const toggleDay = (index: number, weekday: number) => {
    const current = draftCommitments[index];
    const days = current.days.includes(weekday)
      ? current.days.filter((d) => d !== weekday)
      : [...current.days, weekday].sort();
    updateCommitment(index, { days });
  };

  const save = () => onSave({ habits: draftHabits, commitments: draftCommitments, courseDay: day, salah });

  /* --- The three pieces, shared by both modes --------------------------- */

  const habitsStep = (
    <div className="setup-step">
      <h3>What are you working on?</h3>
      <p>One thing to build, or one to do less of. One is enough to start — you can add more whenever.</p>
      <div className="habit-add">
        <input
          value={habitName}
          onChange={(e) => setHabitName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addHabit()}
          placeholder="e.g. phone-free wind-down"
          aria-label="New habit"
        />
        <button
          className="mode-button"
          aria-pressed={habitMode === "build"}
          onClick={() => setHabitMode(habitMode === "build" ? "reduce" : "build")}
        >
          {habitMode === "build" ? <Plus /> : <Minus />}{habitMode === "build" ? "Build" : "Reduce"}
        </button>
        <button className="icon-button" aria-label="Add habit" onClick={addHabit}><Plus /></button>
      </div>
      <ul className="setup-list">
        {draftHabits.map((habit) => (
          <li key={habit.id}>
            <span className={habit.mode}>{habit.mode === "build" ? "BUILD" : "REDUCE"}</span>
            <strong>{habit.name}</strong>
            <button
              className="plain-icon"
              aria-label={`Remove ${habit.name}`}
              onClick={() => setDraftHabits(draftHabits.filter((item) => item.id !== habit.id))}
            ><Trash2 /></button>
          </li>
        ))}
        {!draftHabits.length && <li className="setup-empty">Nothing yet.</li>}
      </ul>
    </div>
  );

  const commitmentsStep = (
    <div className="setup-step">
      <h3>When are you already busy?</h3>
      <p>School, madressa, work — anything that already owns part of your day. Sly plans around these instead of on top of them, and will not ask you to be on your phone during one.</p>

      <div className="setup-suggestions">
        {commitmentSuggestions.map((suggestion) => (
          <button key={suggestion.name} onClick={() => addCommitment(suggestion)}>
            <Plus /> {suggestion.name}
          </button>
        ))}
        <button onClick={() => addCommitment({ name: "", days: [], fromHour: 9, toHour: 10 })}>
          <Plus /> Something else
        </button>
      </div>

      <ul className="setup-list commitments">
        {draftCommitments.map((commitment, index) => (
          <li key={index} className="setup-commitment">
            <div className="setup-commitment-top">
              <input
                value={commitment.name}
                onChange={(e) => updateCommitment(index, { name: e.target.value })}
                placeholder="Name"
                aria-label={`Name of commitment ${index + 1}`}
              />
              <label>
                <span className="sr-only">Start hour</span>
                <input
                  inputMode="numeric"
                  value={String(commitment.fromHour)}
                  aria-label={`${commitment.name || "Commitment"} start hour`}
                  onChange={(e) => updateCommitment(index, { fromHour: clampHour(e.target.value, commitment.fromHour) })}
                />
              </label>
              <i aria-hidden="true">–</i>
              <label>
                <span className="sr-only">End hour</span>
                <input
                  inputMode="numeric"
                  value={String(commitment.toHour)}
                  aria-label={`${commitment.name || "Commitment"} end hour`}
                  onChange={(e) => updateCommitment(index, { toHour: clampHour(e.target.value, commitment.toHour) })}
                />
              </label>
              <button
                className="plain-icon"
                aria-label={`Remove ${commitment.name || "commitment"}`}
                onClick={() => setDraftCommitments(draftCommitments.filter((_, i) => i !== index))}
              ><Trash2 /></button>
            </div>
            <div className="setup-days" role="group" aria-label={`Days ${commitment.name || "commitment"} runs`}>
              {DAY_NAMES.map((name, weekday) => (
                <button
                  key={weekday}
                  aria-pressed={commitment.days.length === 0 || commitment.days.includes(weekday)}
                  onClick={() => toggleDay(index, weekday)}
                >{name}</button>
              ))}
            </div>
            {commitment.days.length === 0 && <small>Every day</small>}
            {commitment.toHour <= commitment.fromHour && (
              <small className="setup-warning">The end needs to be after the start.</small>
            )}
          </li>
        ))}
        {!draftCommitments.length && <li className="setup-empty">Nothing booked. That is a fine answer.</li>}
      </ul>
    </div>
  );

  const dayStep = (
    <div className="setup-step">
      <h3>Where are you in the course?</h3>
      <p>Day one if you are starting. Sly uses this to know which lesson today's plan should be built around.</p>
      <div className="setup-day">
        <button aria-label="Previous day" onClick={() => setDay(Math.max(1, day - 1))}><ChevronLeft /></button>
        <strong>Day {day}</strong>
        <button aria-label="Next day" onClick={() => setDay(Math.min(100, day + 1))}><ChevronRight /></button>
      </div>
    </div>
  );

  const salahStep = (
    <div className="setup-step">
      <h3>Your salah times</h3>
      <p>
        Sly builds the day around these rather than beside them. These are rough starting times — real ones depend on
        where you are and which calculation you follow, so correct them here and they will stay corrected.
      </p>
      <ul className="setup-list salah-list">
        {salah.map((prayer, index) => (
          <li key={prayer.name}>
            <strong>{prayer.name}</strong>
            <input
              type="time"
              value={salahClock(prayer.at)}
              aria-label={`${prayer.name} time`}
              onChange={(e) => {
                const [hours, minutes] = e.target.value.split(":").map(Number);
                if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return;
                setSalah(salah.map((item, i) => (i === index ? { ...item, at: hours * 60 + minutes } : item)));
              }}
            />
          </li>
        ))}
      </ul>
      <small>Sly never claims to know whether you prayed. He only knows when to leave you alone.</small>
    </div>
  );

  const steps = [habitsStep, salahStep, commitmentsStep, dayStep];

  if (mode === "all") {
    return (
      <section className="paper-card habit-setup all">
        <div className="setup-head">
          <SlyFox mood="watching" />
          <div>
            <span className="eyebrow">SETTINGS</span>
            <h2>Your setup.</h2>
          </div>
          {onClose && <button className="plain-icon" aria-label="Close settings" onClick={onClose}><X /></button>}
        </div>
        {steps}
        <button className="primary-button" onClick={save}>Save<Check /></button>
      </section>
    );
  }

  const last = step === steps.length - 1;

  return (
    <section className="paper-card habit-setup">
      <div className="setup-head">
        <SlyFox mood="watching" />
        <div>
          <span className="eyebrow">STEP {step + 1} OF {steps.length}</span>
          <h2>Let us set this up.</h2>
        </div>
      </div>

      <p className="setup-intro">
        “Tell me what you are working on and when you are already busy. Then I can plan a day that fits round your
        life instead of one that ignores it.”
      </p>

      {steps[step]}

      <div className="setup-actions">
        {step > 0 && <button className="plain-button" onClick={() => setStep(step - 1)}><ChevronLeft /> Back</button>}
        {last
          ? <button className="primary-button" onClick={save}>Done<Check /></button>
          : <button className="primary-button" onClick={() => setStep(step + 1)}>Next<ChevronRight /></button>}
        {onSkip && <button className="plain-button quiet" onClick={onSkip}>Skip for now</button>}
      </div>

      <small>Nothing here is required. Skip it and Sly works with what he can see; you can fill it in any time from the settings icon.</small>
    </section>
  );
}

/** Keep an hour in range, and leave the old value alone if the input is junk. */
function clampHour(raw: string, fallback: number) {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return 0;
  const value = Number(digits);
  return Number.isFinite(value) ? Math.min(24, Math.max(0, value)) : fallback;
}

/** Persist what setup produced. */
export function saveSetup(result: SetupResult, habitsKey: string) {
  try {
    localStorage.setItem(SALAH_KEY, JSON.stringify(result.salah));
    localStorage.setItem(COMMITMENTS_KEY, JSON.stringify(result.commitments.filter((c) => c.name.trim() && c.toHour > c.fromHour)));
    const existing = JSON.parse(localStorage.getItem(habitsKey) ?? "{}") as Record<string, unknown>;
    localStorage.setItem(habitsKey, JSON.stringify({ ...existing, date: currentLocalDay(), habits: result.habits }));
    const journal = JSON.parse(localStorage.getItem(COURSE_KEY) ?? "{}") as Record<string, unknown>;
    localStorage.setItem(COURSE_KEY, JSON.stringify({ ...journal, currentDay: result.courseDay }));
  } catch {
    /* A full store should not lose the rest of the answers. */
  }
}

export const dismissSetup = () => {
  try {
    localStorage.setItem(SETUP_DISMISSED_KEY, currentLocalDay());
  } catch {
    /* Nothing here is worth failing over. */
  }
};

export { WEEKDAYS, describeCommitment };
