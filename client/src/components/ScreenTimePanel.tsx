import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CircleAlert, RefreshCw, Smartphone } from "lucide-react";

import { SlyFox } from "@/components/Sly";
import { bridgeState, explainState, readTodayMinutes, type BridgeState } from "@/lib/screenTimeBridge";
import {
  SCREEN_TIME_KEY,
  defaultGoal,
  describeGoal,
  evaluateGoal,
  formatDuration,
  localDayKey,
  readHistory,
  recentHistory,
  recordDay,
  type DailyScreenTime,
  type ScreenTimeGoal,
} from "@/lib/screenTimeUsage";

const GOAL_KEY = "hundred-steps-screen-time-goal-v1";

function loadGoal(): ScreenTimeGoal {
  try {
    const raw = JSON.parse(localStorage.getItem(GOAL_KEY) ?? "null") as ScreenTimeGoal | null;
    return raw && typeof raw.target === "number" ? { ...defaultGoal, ...raw } : defaultGoal;
  } catch {
    return defaultGoal;
  }
}

/**
 * Today's screen time, when the device will say.
 *
 * In a plain browser this is not a broken feature, it is an impossible one, and
 * it says so rather than showing a permission button that could never work. The
 * numbers themselves are computed by `screenTimeUsage.ts` from raw intervals —
 * nothing here does arithmetic on a duration.
 */
export function ScreenTimePanel() {
  const [state, setState] = useState<BridgeState>(() => bridgeState());
  const [minutes, setMinutes] = useState<number | null>(null);
  const [history, setHistory] = useState<DailyScreenTime[]>(() => readHistory(localStorage));
  const [goal, setGoal] = useState<ScreenTimeGoal>(loadGoal);

  const refresh = useCallback(() => {
    const next = bridgeState();
    setState(next);
    if (next.kind !== "ready") {
      setMinutes(null);
      return;
    }
    const today = readTodayMinutes();
    setMinutes(today);
    if (today === null) return;
    // Record it so a week's shape survives closing the app.
    setHistory((current) => {
      const updated = recordDay(current, { date: localDayKey(), minutes: today, measuredAt: new Date().toISOString() });
      try {
        localStorage.setItem(SCREEN_TIME_KEY, JSON.stringify(updated));
      } catch {
        /* A full store should not take the panel down. */
      }
      return updated;
    });
  }, []);

  useEffect(() => {
    refresh();
    // Coming back from the Settings screen is exactly when access has changed.
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const status = useMemo(() => evaluateGoal(minutes, goal), [minutes, goal]);
  const week = useMemo(() => recentHistory(history, 7), [history]);
  const busiest = useMemo(() => Math.max(60, ...week.map((day) => day.minutes ?? 0)), [week]);

  function changeGoal(target: number) {
    const next = { ...goal, target: Math.max(15, Math.min(960, target)) };
    setGoal(next);
    try {
      localStorage.setItem(GOAL_KEY, JSON.stringify(next));
    } catch {
      /* Nothing here is worth failing over. */
    }
  }

  return (
    <article className="paper-card screen-time-card">
      <span className="eyebrow">SLY WATCHES THE PHONE</span>
      <h2>Today on this device.</h2>

      {state.kind === "ready" ? (
        <>
          <div className="screen-time-figure">
            <strong>{minutes === null ? "—" : formatDuration(minutes)}</strong>
            <div>
              <span>{status.label} · target {describeGoal(goal)}</span>
              <i className="screen-time-bar" aria-hidden="true">
                <em className={status.met ? "met" : "over"} style={{ width: `${Math.round(status.progress * 100)}%` }} />
              </i>
            </div>
            <button className="plain-icon" aria-label="Read the figure again" onClick={refresh}><RefreshCw /></button>
          </div>

          <div className="screen-time-week" role="img" aria-label={`The last seven days: ${week.map(d => `${d.date} ${d.minutes === null ? "not measured" : formatDuration(d.minutes)}`).join(", ")}`}>
            {week.map((day) => (
              <span key={day.date} className={day.minutes === null ? "gap" : ""}>
                <i style={{ height: `${day.minutes === null ? 3 : Math.max(3, Math.round((day.minutes / busiest) * 46))}px` }} />
              </span>
            ))}
          </div>

          <label className="screen-time-goal">
            <span>DAILY LIMIT</span>
            <input
              inputMode="numeric"
              value={String(goal.target)}
              onChange={(event) => changeGoal(Number(event.target.value.replace(/\D/g, "")) || 0)}
              aria-label="Daily screen time limit in minutes"
            />
            <small>minutes</small>
          </label>
        </>
      ) : (
        <div className="screen-time-empty">
          <SlyFox mood={state.kind === "needs-permission" ? "asking" : "watching"} />
          <div>
            <p>{explainState(state)}</p>
            {state.kind === "needs-permission" && (
              <button className="primary-button" onClick={() => { window.HundredStepsScreenTime?.requestPermission?.(); }}>
                Open Usage Access settings
              </button>
            )}
          </div>
        </div>
      )}

      <small><CircleAlert /> Read on this device and kept on it. Nothing here is sent anywhere, and there is no server to send it to.</small>
      <Smartphone aria-hidden="true" className="screen-time-mark" />
    </article>
  );
}
