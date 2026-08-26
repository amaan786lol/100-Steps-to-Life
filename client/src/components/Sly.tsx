import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import {
  countdown,
  defaultSlySettings,
  endBreak,
  freshState,
  resume,
  slyPhase,
  snooze,
  startBreak,
  type SlyPhase,
  type SlySettings,
  type SlyState,
} from "@/lib/sly";
import { slyGreeting } from "@/lib/slyVoice";
import type { SlySpeech } from "@/lib/slyVoice";
import { useSlyBriefing } from "@/lib/slyContext";

/* --- The fox -------------------------------------------------------------- */

/**
 * Sly, drawn rather than fetched — one less asset to load, and he can take the
 * page's own colours. `mood` only changes his ears and eyes; the shape stays
 * the same so he reads as the same character throughout.
 */
export function SlyFox({ mood = "watching" }: { mood?: "watching" | "asking" | "resting" | "pleased" }) {
  return (
    <svg className={`sly-fox mood-${mood}`} viewBox="0 0 64 64" role="img" aria-label="Sly the fox">
      <g className="sly-ears">
        <path d="M13 26 L11 8 L27 18 Z" fill="var(--sly-coat)" />
        <path d="M15 23 L14 13 L23 19 Z" fill="var(--sly-inner)" />
        <path d="M51 26 L53 8 L37 18 Z" fill="var(--sly-coat)" />
        <path d="M49 23 L50 13 L41 19 Z" fill="var(--sly-inner)" />
      </g>
      <path d="M32 15 C46 15 53 25 53 36 C53 48 44 56 32 56 C20 56 11 48 11 36 C11 25 18 15 32 15 Z" fill="var(--sly-coat)" />
      <path d="M32 34 C40 34 45 39 45 45 C45 52 39 56 32 56 C25 56 19 52 19 45 C19 39 24 34 32 34 Z" fill="var(--sly-face)" />
      <g className="sly-eyes">
        <ellipse cx="24" cy="33" rx="3.4" ry="3.8" fill="var(--sly-eye)" />
        <ellipse cx="40" cy="33" rx="3.4" ry="3.8" fill="var(--sly-eye)" />
        <circle cx="25.2" cy="31.6" r="1.15" fill="#fff" />
        <circle cx="41.2" cy="31.6" r="1.15" fill="#fff" />
      </g>
      <path d="M32 42 L28.5 45 L32 47.5 L35.5 45 Z" fill="var(--sly-eye)" />
      <path className="sly-mouth" d="M32 47.5 L32 50 M32 50 C29 50 27.5 48.6 27 47.4 M32 50 C35 50 36.5 48.6 37 47.4" stroke="var(--sly-eye)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/* --- Keeping his state between visits ------------------------------------- */

const STATE_KEY = "hundred-steps-sly-state-v1";
const SETTINGS_KEY = "hundred-steps-sly-settings-v1";
const SPOT_KEY = "hundred-steps-sly-spot-v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? ({ ...fallback, ...(JSON.parse(raw) as object) } as T) : fallback;
  } catch {
    return fallback;
  }
}

const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* A full or blocked store is not worth interrupting anyone over. */
  }
};

type Stored = SlyState & { lastSeenAt?: number };

/**
 * Load the cycle and bring it forward over however long the app was closed.
 * `resume` is what stops a closed tab from quietly earning a break: time away
 * counts as time away from the screen, and only a long enough gap resets it.
 */
function loadState(settings: SlySettings, now = Date.now()): SlyState {
  const stored = read<Stored>(STATE_KEY, { stretchStartedAt: now });
  if (!Number.isFinite(stored.stretchStartedAt)) return freshState(now);
  return resume(stored, settings, stored.lastSeenAt ?? stored.stretchStartedAt, now);
}

/* --- The companion -------------------------------------------------------- */

const moodFor = (phase: SlyPhase, speech: SlySpeech): "watching" | "asking" | "resting" | "pleased" => {
  if (phase.phase === "resting") return "resting";
  if (phase.phase === "due") return "asking";
  if (speech.topic === "done") return "pleased";
  if (speech.topic === "slipping") return "asking";
  return "watching";
};

/**
 * Sly on the page: a fox you can drag anywhere, who says one thing at a time,
 * and who steps in front of the screen when a stretch has run long.
 *
 * He is draggable because he covers content and people's thumbs live in
 * different places; where he is put is remembered, and clamped back into view
 * if the window changes size under him.
 */
export function SlyCompanion() {
  const [settings, setSettings] = useState<SlySettings>(() => read(SETTINGS_KEY, defaultSlySettings));
  const [state, setState] = useState<SlyState>(() => loadState(read(SETTINGS_KEY, defaultSlySettings)));
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(false);
  const [spot, setSpot] = useState<{ x: number; y: number } | null>(() => read<{ x: number; y: number } | null>(SPOT_KEY, null));
  const dragging = useRef<{ dx: number; dy: number; fromX: number; fromY: number; moved: boolean } | null>(null);
  const holder = useRef<HTMLDivElement>(null);
  // Where he is, readable synchronously: the drag ends in a different event
  // from the one that moved him, and state read there can lag a frame behind.
  const spotNow = useRef(spot);
  // Set when a drag ends, so the click that follows it does not also toggle.
  const justDragged = useRef(false);

  const phase = useMemo(() => slyPhase(state, settings, now), [state, settings, now]);

  // A second is plenty: the only thing that moves is a countdown in mm:ss.
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => write(STATE_KEY, { ...state, lastSeenAt: now }), [state, now]);
  useEffect(() => write(SETTINGS_KEY, settings), [settings]);

  // What he has to say about the habits, read straight from where they live.
  const briefing = useSlyBriefing(phase);
  const speech: SlySpeech = briefing[0] ?? { topic: "empty", headline: "Nothing on the list yet.", detail: "Start with one thing. One is enough." };

  // Coming back to the tab is the moment the away-time question matters.
  useEffect(() => {
    const wake = () => {
      const at = Date.now();
      const stored = read<Stored>(STATE_KEY, { stretchStartedAt: at });
      setState(resume(stored, settings, stored.lastSeenAt ?? at, at));
      setNow(at);
    };
    const onVisible = () => document.visibilityState === "visible" && wake();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", wake);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", wake);
    };
  }, [settings]);

  const clamp = useCallback((x: number, y: number) => {
    const size = holder.current?.getBoundingClientRect();
    const width = size?.width ?? 74;
    const height = size?.height ?? 74;
    return {
      x: Math.min(Math.max(8, x), Math.max(8, window.innerWidth - width - 8)),
      y: Math.min(Math.max(8, y), Math.max(8, window.innerHeight - height - 8)),
    };
  }, []);

  // A window that shrinks under him must not strand him off-screen.
  useEffect(() => {
    const settle = () => {
      const current = spotNow.current;
      if (!current) return;
      const next = clamp(current.x, current.y);
      spotNow.current = next;
      setSpot(next);
    };
    window.addEventListener("resize", settle);
    return () => window.removeEventListener("resize", settle);
  }, [clamp]);

  function onPointerDown(event: React.PointerEvent) {
    const box = event.currentTarget.getBoundingClientRect();
    dragging.current = {
      dx: event.clientX - box.left,
      dy: event.clientY - box.top,
      fromX: event.clientX,
      fromY: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent) {
    const drag = dragging.current;
    if (!drag) return;
    // A few pixels of travel is a tap with an unsteady thumb, not a drag. Until
    // that threshold is passed he must not move, or tapping him jitters him.
    const travelled = Math.abs(event.clientX - drag.fromX) + Math.abs(event.clientY - drag.fromY);
    if (!drag.moved && travelled < 5) return;
    drag.moved = true;
    const next = clamp(event.clientX - drag.dx, event.clientY - drag.dy);
    spotNow.current = next;
    setSpot(next);
  }

  function onPointerUp(event: React.PointerEvent) {
    const drag = dragging.current;
    dragging.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag?.moved) {
      justDragged.current = true;
      if (spotNow.current) write(SPOT_KEY, spotNow.current);
    }
  }

  /**
   * Opening the bubble hangs off click rather than pointerup so that Enter and
   * Space reach it: a keyboard press fires click with no pointer sequence at
   * all, and a fox that only answers a thumb is a fox half the people using
   * this cannot talk to. A drag ends in a click too, so that one is swallowed.
   */
  function onClick() {
    if (justDragged.current) {
      justDragged.current = false;
      return;
    }
    setOpen((value) => !value);
  }

  // Arrow keys move him too, so he is not stuck for anyone using a keyboard.
  function onKeyDown(event: React.KeyboardEvent) {
    const step = event.shiftKey ? 40 : 12;
    const nudge: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step],
    };
    const move = nudge[event.key];
    if (!move) return;
    event.preventDefault();
    const box = holder.current?.getBoundingClientRect();
    const from = spotNow.current ?? { x: box?.left ?? 0, y: box?.top ?? 0 };
    const next = clamp(from.x + move[0], from.y + move[1]);
    spotNow.current = next;
    setSpot(next);
    write(SPOT_KEY, next);
  }

  const take = () => setState((current) => startBreak(current));
  const back = () => setState((current) => endBreak(current));
  const later = () => setState((current) => snooze(current, 5));

  const line = phase.phase === "due"
    ? "That is a long stretch. Put it down for a bit — I will still be here."
    : phase.phase === "resting"
      ? "Break is running. Look at something further away than this."
      : speech.headline;

  const placed = spot ? { left: spot.x, top: spot.y, right: "auto", bottom: "auto" } : undefined;
  // The bubble is wider than he is, so it hangs off whichever side of him has
  // the room — otherwise a fox parked on the left edge speaks off the screen.
  const below = spot !== null && spot.y < 230;
  const alignStart = spot !== null && spot.x < window.innerWidth / 2;

  // Rendered out of place, but into the app shell rather than the body.
  //
  // Out of place because `position: fixed` is measured against the nearest
  // ancestor carrying a transform, filter or animation, and the habit page has
  // an entry animation — nested there, Sly scrolled away with the page instead
  // of floating above it.
  //
  // Into the shell rather than the body because the theme variables are
  // declared on `.field-app.theme-*`. A fox parented to the body sits outside
  // that rule and keeps the morning palette on a night-mode page — a white
  // patch in the corner of a dark screen. The shell itself sets only
  // `position: relative` and `isolation`, neither of which captures a fixed
  // child, so this costs nothing and inherits everything.
  return createPortal(
    <>
      {phase.phase === "due" && (
        <div className="sly-interrupt" role="dialog" aria-modal="false" aria-label="Sly is asking for a break">
          <div className="sly-interrupt-card">
            <SlyFox mood="asking" />
            <div>
              <span className="eyebrow">SLY</span>
              <h3>That is {settings.workMinutes} minutes straight.</h3>
              <p>Put it down for {settings.breakMinutes}. Nothing here expires, and I will still be here when you come back.</p>
              <div className="sly-interrupt-actions">
                <button className="primary-button" onClick={take}>Start the {settings.breakMinutes}-minute break</button>
                <button className="plain-button" onClick={later}>Five more minutes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div ref={holder} className={`sly-holder ${open ? "open" : ""} ${below ? "below" : ""} ${alignStart ? "start" : ""} phase-${phase.phase}`} style={placed}>
        {(open || phase.phase === "resting") && (
          <div className="sly-bubble" role="status">
            {phase.phase === "resting" ? (
              <>
                <strong>Break — {countdown(phase.remainingMs)}</strong>
                <p>Look at something further away than this. Coming back early is allowed; I just will not pretend it was a break.</p>
                <button className="plain-button" onClick={back}>I am back</button>
              </>
            ) : (
              <>
                <strong>{speech.headline}</strong>
                <p>{speech.detail}</p>
                <small>{slyGreeting()}</small>
                <button
                  className="plain-button"
                  onClick={() => setSettings((current) => ({ ...current, enabled: !current.enabled }))}
                >
                  {settings.enabled ? "Stop watching the clock" : "Watch the clock again"}
                </button>
              </>
            )}
          </div>
        )}
        <button
          type="button"
          className="sly-handle"
          aria-label={`Sly: ${line}`}
          aria-expanded={open}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={onClick}
          onKeyDown={onKeyDown}
        >
          <SlyFox mood={moodFor(phase, speech)} />
          {phase.phase === "working" && phase.untilBreakMs < 5 * 60_000 && (
            <em className="sly-timer">{countdown(phase.untilBreakMs)}</em>
          )}
        </button>
      </div>
    </>,
    document.querySelector("main.field-app") ?? document.body,
  );
}
