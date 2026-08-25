import React, { useMemo, useRef, useState } from "react";
import { Check, ChevronRight, CircleAlert, ImageUp, Minus, Plus, RotateCcw, Sparkles, Trash2, Watch, X } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { currentLocalDay, dayKeyOffset, habitKeepRate, habitRun, loadDailyCheckin, markHabit, recentDays } from "@/lib/dailyCheckin";
import { findPriorScreenshotUse, recordScreenshotUse, reviewSubmissionState, type ScreenshotUse } from "@/lib/screenTime";

type Habit = { id: string; name: string; mode: "build" | "reduce"; done: boolean; log?: Record<string, true> };
type LocalPlan = { date?: string; habits: Habit[]; stepTarget?: number; stepsSoFar?: number; sleepHours?: number; priority: string; steps?: number };
type DailyPlan = { focus: string; honestOverview: string; schedule: Array<{ time: string; action: string; reason: string }>; friction: string; replacement: string; checkIn: string; note: string };
type YesterdayReview = { overview: string; evidence: string; oneChange: string; note: string };
const KEY = "hundred-steps-habit-studio-v1";
const SCREENSHOT_KEY = "hundred-steps-screen-time-hashes-v1";
const REVIEW_KEY = "hundred-steps-yesterday-review-v1";

type StoredReview = { review: YesterdayReview; reviewedOn: string };

function loadStoredReview(): StoredReview | null {
  try {
    const raw = JSON.parse(localStorage.getItem(REVIEW_KEY) ?? "null") as StoredReview | null;
    // A review older than a couple of days is no longer "yesterday".
    if (!raw?.reviewedOn) return null;
    return raw.reviewedOn >= dayKeyOffset(-2) ? raw : null;
  } catch {
    return null;
  }
}

function load(): LocalPlan {
  return loadDailyCheckin(localStorage, KEY) as LocalPlan;
}

export function HabitPlanner() {
  const initial = useMemo(load, []);
  const { isAuthenticated } = useAuth();
  const [habits, setHabits] = useState<Habit[]>(initial.habits ?? []);
  const [priority, setPriority] = useState(initial.priority ?? "");
  const [stepTarget, setStepTarget] = useState(initial.stepTarget?.toString() ?? "");
  const [stepsSoFar, setStepsSoFar] = useState(initial.stepsSoFar?.toString() ?? "");
  const [sleepHours, setSleepHours] = useState(initial.sleepHours?.toString() ?? "");
  const [newHabit, setNewHabit] = useState("");
  const [mode, setMode] = useState<"build" | "reduce">("build");
  const [screenshot, setScreenshot] = useState<string | undefined>();
  const [screenshotHash, setScreenshotHash] = useState<string | undefined>();
  const [reusedScreenshot, setReusedScreenshot] = useState<string | undefined>();
  const [fileName, setFileName] = useState("");
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const carried = useMemo(loadStoredReview, []);
  const [review, setReview] = useState<YesterdayReview | null>(carried?.review ?? null);
  const [carriedInto, setCarriedInto] = useState<StoredReview | null>(carried);
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const watchRef = useRef<HTMLInputElement>(null);
  const generate = trpc.planner.create.useMutation({ onSuccess: (data) => setPlan(data.plan as DailyPlan), onError: () => setMessage("The morning planner could not respond right now. Your local check-in is still saved.") });
  const reviewYesterday = trpc.planner.reviewYesterday.useMutation({ onSuccess: (data) => { const next = data.review as YesterdayReview; setReview(next); const stored = { review: next, reviewedOn: currentLocalDay() }; localStorage.setItem(REVIEW_KEY, JSON.stringify(stored)); setCarriedInto(stored); saveScreenshotUse(screenshotHash); }, onError: () => setMessage("The Screen Time review could not respond right now. Try again later.") });

  const readWatch = trpc.planner.readWatch.useMutation({
    onSuccess: (data) => {
      const reading = data.reading;
      // Only fill what was actually read; a null means it could not be seen.
      if (reading.steps !== null) setStepsSoFar(String(reading.steps));
      if (reading.stepTarget !== null) setStepTarget(String(reading.stepTarget));
      if (reading.sleepHours !== null) setSleepHours(String(reading.sleepHours));
      const found = [reading.steps !== null && "steps", reading.stepTarget !== null && "goal", reading.sleepHours !== null && "sleep"].filter(Boolean);
      setMessage(found.length
        ? `Read ${found.join(", ")} from the screenshot. Check the figures before you plan. ${reading.note}`
        : `Nothing could be read from that screenshot with confidence. ${reading.note}`);
      window.setTimeout(() => persist(), 0);
    },
    onError: () => setMessage("The screenshot could not be read right now. Type the figures in instead."),
  });

  async function chooseWatchImage(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 3_000_000) {
      setMessage("Use an image under 3 MB. The screenshot is sent only to read these figures, and is not stored.");
      return;
    }
    if (!requireSignIn()) return;
    const reader = new FileReader();
    reader.onload = () => readWatch.mutate({ watchImage: String(reader.result) });
    reader.readAsDataURL(file);
  }

  function snapshot(next: Partial<LocalPlan> = {}) { return { date: currentLocalDay(), habits, priority, stepTarget: stepTarget ? Number(stepTarget) : undefined, stepsSoFar: stepsSoFar ? Number(stepsSoFar) : undefined, sleepHours: sleepHours ? Number(sleepHours) : undefined, ...next }; }
  function persist(next: Partial<LocalPlan> = {}) { localStorage.setItem(KEY, JSON.stringify(snapshot(next))); }
  function addHabit() { const name = newHabit.trim(); if (!name) return; const next = [...habits, { id: crypto.randomUUID(), name, mode, done: false }]; setHabits(next); setNewHabit(""); persist({ habits: next }); }
  function screenshotHistory(): ScreenshotUse[] { try { return JSON.parse(localStorage.getItem(SCREENSHOT_KEY) ?? "[]") as ScreenshotUse[]; } catch { return []; } }
  function saveScreenshotUse(hash?: string) { if (hash) localStorage.setItem(SCREENSHOT_KEY, JSON.stringify(recordScreenshotUse(screenshotHistory(), hash, new Date().toISOString()))); }
  async function fingerprint(file: File) { const bytes = await file.arrayBuffer(); if (!crypto.subtle) return `${file.name}-${file.size}-${file.lastModified}`; const digest = await crypto.subtle.digest("SHA-256", bytes); return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join(""); }
  async function chooseImage(file?: File) { if (!file) return; if (!file.type.startsWith("image/") || file.size > 3_000_000) { setMessage("Use an image under 3 MB. The screenshot stays on your device until you request a review."); return; } const hash = await fingerprint(file); const prior = findPriorScreenshotUse(screenshotHistory(), hash); const reader = new FileReader(); reader.onload = () => { setScreenshot(String(reader.result)); setScreenshotHash(hash); setFileName(file.name); setReusedScreenshot(prior?.usedAt); setMessage(prior ? "This exact screenshot was already reviewed. Choose a newer screenshot." : "Yesterday’s Screen Time screenshot is ready for review."); }; reader.readAsDataURL(file); }
  function requireSignIn() { if (isAuthenticated) return true; setMessage("Sign in to request a private AI plan or review. Your daily check-in remains local either way."); startLogin(); return false; }
  function requestPlan() { persist(); if (!requireSignIn()) return; if (priority.trim().length < 3) { setMessage("Write one honest priority for today first." ); return; } generate.mutate({ priority, habits: habits.map(({ name, mode }) => ({ name, mode })), stepTarget: stepTarget ? Number(stepTarget) : undefined, stepsSoFar: stepsSoFar ? Number(stepsSoFar) : undefined, sleepHours: sleepHours ? Number(sleepHours) : undefined, yesterday: carriedInto ? { overview: carriedInto.review.overview, oneChange: carriedInto.review.oneChange, reviewedOn: carriedInto.reviewedOn } : undefined }); }
  function requestReview() { const state = reviewSubmissionState(screenshot, reusedScreenshot); if (!state.allowed || !screenshot) { setMessage(state.message); return; } if (!requireSignIn()) return; reviewYesterday.mutate({ screenTimeImage: screenshot, priority: priority || undefined }); }

  return <div className="view-stack habit-studio">
    <section className="habit-hero"><div><span className="eyebrow-light"><Sparkles /> MORNING CHECK-IN</span><h1>Choose today.<br/><em>Then make it easier to follow.</em></h1><p>A local-first daily check-in. Set today’s step target and habits in the morning; review yesterday’s Screen Time later, once the day is over.</p></div><Watch aria-hidden="true" /></section>
    <section className="habit-grid">
      <article className="paper-card habit-card"><span className="eyebrow">TODAY’S PRACTICES</span><h2>One honest list.</h2><div className="habit-add"><input value={newHabit} onChange={e => setNewHabit(e.target.value)} placeholder="e.g. phone-free wind-down" aria-label="New habit"/><button className="mode-button" aria-pressed={mode === "build"} onClick={() => setMode(mode === "build" ? "reduce" : "build")}>{mode === "build" ? <Plus/> : <Minus/>}{mode === "build" ? "Build" : "Reduce"}</button><button className="icon-button" aria-label="Add habit" onClick={addHabit}><Plus/></button></div><div className="habit-list">{habits.length ? habits.map(h => <div className={"habit-row " + (h.done ? "done" : "")} key={h.id}><button aria-label={`Mark ${h.name} ${h.done ? "not done" : "done"}`} onClick={() => { const next = habits.map(item => item.id === h.id ? markHabit(item, !item.done) : item); setHabits(next); persist({ habits: next }); }}><Check/></button><span className={h.mode}>{h.mode === "build" ? "BUILD" : "REDUCE"}</span><div className="habit-body"><p>{h.name}</p><span className="habit-record">{habitRun(h) > 0 ? <b>{habitRun(h)}-day run</b> : <b className="quiet">No run yet</b>}<i className="habit-week" aria-label={`Kept ${habitKeepRate(h)}% of the last seven days`}>{recentDays(7).map(day => <em key={day} className={h.log?.[day] ? "kept" : ""} />)}</i><small>{habitKeepRate(h)}% this week</small></span></div><button className="plain-icon" aria-label={`Delete ${h.name}`} onClick={() => { const next = habits.filter(item => item.id !== h.id); setHabits(next); persist({ habits: next }); }}><Trash2/></button></div>) : <p className="empty-note">Start with one habit worth protecting or one pattern you want to reduce—just for today.</p>}</div></article>
      <article className="paper-card wellbeing-card"><span className="eyebrow">GALAXY WATCH MORNING CHECK-IN</span><h2>Set a realistic target.</h2><p>Use last night’s sleep to choose today’s effort. Compare your progress with Samsung Health later today.</p><div className="wellbeing-inputs"><label><span>TODAY’S STEP TARGET</span><input inputMode="numeric" value={stepTarget} onChange={e => setStepTarget(e.target.value.replace(/\D/g, ""))} onBlur={() => persist()} placeholder="e.g. 6400"/></label><label><span>STEPS SO FAR</span><input inputMode="numeric" value={stepsSoFar} onChange={e => setStepsSoFar(e.target.value.replace(/\D/g, ""))} onBlur={() => persist()} placeholder="e.g. 1200"/></label><label><span>SLEEP LAST NIGHT</span><input inputMode="decimal" value={sleepHours} onChange={e => setSleepHours(e.target.value)} onBlur={() => persist()} placeholder="e.g. 7.5 hours"/></label></div><div className="watch-import"><input ref={watchRef} type="file" accept="image/*" aria-label="Samsung Health screenshot" onChange={e => { void chooseWatchImage(e.target.files?.[0]); e.currentTarget.value = ""; }}/><button className="upload-trigger" disabled={readWatch.isPending} onClick={() => watchRef.current?.click()}><ImageUp/> {readWatch.isPending ? "Reading the screenshot…" : "Fill these from a Samsung Health screenshot"}</button><p>Open Samsung Health, screenshot your steps and sleep, and drop it here. The figures are read and typed in for you; the image is not stored.</p></div><details className="connect-guide"><summary>Why not connect the watch directly?</summary><p>Samsung Health shares data through Health Connect, which only an installed Android app can read. This is a web page, so it cannot reach it — no permission you grant in Samsung Health will change that.</p><p>Until there is an Android companion app, a screenshot is the honest way across. Reading one takes a moment and needs you signed in; typing the numbers yourself always works and needs nothing.</p></details><small><CircleAlert/> These are wellbeing cues, not medical advice or a score of your worth.</small></article>
    </section>
    <section className="planner-card"><div className="planner-copy"><span className="eyebrow">TODAY’S MORNING PLAN</span><h2>What matters<br/><em>today?</em></h2><textarea value={priority} onChange={e => setPriority(e.target.value)} onBlur={() => persist()} placeholder="Example: I will protect my evening by putting my phone away after dinner."/>{carriedInto && <div className="carried-review"><RotateCcw aria-hidden="true" /><div><span>CARRIED IN FROM YESTERDAY</span><p>{carriedInto.review.oneChange}</p></div><button className="plain-icon" aria-label="Do not use yesterday’s review for today" onClick={() => { localStorage.removeItem(REVIEW_KEY); setCarriedInto(null); setMessage("Today’s plan will be built without yesterday’s review."); }}><X /></button></div>}<button className="primary-button" disabled={generate.isPending} onClick={requestPlan}>{generate.isPending ? "Building today’s plan…" : "Create today’s plan"}<ChevronRight/></button>{message && <p className="planner-message">{message}</p>}</div>{plan && <div className="plan-output"><span className="eyebrow-light">HONEST OVERVIEW</span><p className="honest-overview">{plan.honestOverview}</p><span className="eyebrow-light">TODAY’S PLAN</span><h3>{plan.focus}</h3><div className="schedule-list">{plan.schedule.map((item, index) => <article key={index}><span>{item.time}</span><strong>{item.action}</strong><p>{item.reason}</p></article>)}</div><div className="plan-notes"><p><b>Make it harder:</b> {plan.friction}</p><p><b>Use instead:</b> {plan.replacement}</p><p><b>Check in:</b> {plan.checkIn}</p></div><small>{plan.note}</small></div>}</section>
    <section className="paper-card yesterday-review"><span className="eyebrow">LATER · YESTERDAY REVIEW</span><h2>Look back without drama.</h2><p>When you are ready, add <b>yesterday’s</b> Screen Time screenshot. What it finds is carried into your next morning plan, so the observation turns into something you actually do.</p><div className={"screen-upload " + (reusedScreenshot ? "duplicate" : "")}><input ref={inputRef} type="file" accept="image/*" aria-label="Yesterday’s Screen Time screenshot" onChange={e => { void chooseImage(e.target.files?.[0]); e.currentTarget.value = ""; }}/><button className="upload-trigger" onClick={() => inputRef.current?.click()}><ImageUp/> {fileName ? "Replace yesterday’s screenshot" : "Add yesterday’s Screen Time screenshot"}</button>{fileName && <span><Check/> {fileName}</span>}{reusedScreenshot && <strong><CircleAlert/> This exact screenshot was already reviewed. Pick a newer one.</strong>}<p>The app remembers only an unreadable fingerprint and date, not the screenshot itself. The image is sent only when you tap “Review yesterday.”</p></div><button className="backup-secondary" disabled={reviewYesterday.isPending} onClick={requestReview}>{reviewYesterday.isPending ? "Reviewing…" : "Review yesterday"}<ChevronRight/></button>{review && <div className="yesterday-output"><span>HONEST YESTERDAY REVIEW</span><p>{review.overview}</p><p><b>Evidence:</b> {review.evidence}</p><p><b>Tomorrow’s change:</b> {review.oneChange}</p><small>{review.note}</small></div>}</section>
  </div>;
}
