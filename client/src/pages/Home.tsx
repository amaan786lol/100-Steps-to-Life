/**
 * Hundred Steps to Life — Field Notes design reminder:
 * A mobile field journal, not a dashboard. Warm discipline, one clear next step,
 * route-like progress, and calm non-shaming feedback throughout.
 */
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  Award,
  BookOpen,
  Cloud,
  Check,
  ChevronRight,
  CircleHelp,
  Compass,
  Download,
  Flame,
  Footprints,
  Home as HomeIcon,
  Lock,
  LogIn,
  Map,
  Menu,
  MoreHorizontal,
  Moon,
  Mountain,
  PencilLine,
  RotateCcw,
  Sparkles,
  Sprout,
  Sun,
  Target,
  KeyRound,
  Trophy,
  Upload,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { HabitPlanner } from "@/components/HabitPlanner";
import { SlyCompanion } from "@/components/Sly";
import { VaultView } from "../components/VaultView";
import { bankRecheckHold } from "../lib/vaultStore";
import { HOLD_DAYS } from "../lib/vault";
import { localDayKey } from "../lib/screenTimeUsage";
import { RECHECK_LENGTH, buildRecheck, buildTrial, finalTrials, getLesson, lessons, passMark, phases, reviewSlotsFor, selectReview, totalQuestionsForDay, type CoursePhase, type Lesson, type QuizQuestion, type RecallRecord } from "../data/course";

const STORAGE_KEY = "hundred-steps-to-life-v1";
const THEME_STORAGE_KEY = "hundred-steps-to-life-theme";
const LOGO_URL = "/media/100-steps-to-life-app-icon.svg";
const FULL_LOGO_URL = "/media/100-steps-to-life-logo.svg";
const HERO_URL = "/media/hero-path.jpg";
const MAP_URL = "/media/course-map-landscape.jpg";
const BADGE_URL = "/media/achievement-badge.jpg";
const CONNECTED_WORLD_URL = "/media/connected-world.svg";
const ISLAND_IMAGES: Record<number, string> = {
  1: "/media/island-firstlight-cove.svg",
  2: "/media/island-lantern-gardens.svg",
  3: "/media/island-training-ridge.svg",
  4: "/media/island-masjid.svg",
  5: "/media/island-bridgehaven.svg",
  6: "/media/island-wildwood-valley.svg",
  7: "/media/island-makers-quay.svg",
  8: "/media/island-value-harbour.svg",
  9: "/media/island-common-ground.svg",
  10: "/media/island-summit.svg",
};

type View = "today" | "map" | "habits" | "achievements" | "progress" | "takeaways" | "vault" | "lesson" | "recheck" | "practice" | "final";
type LessonStage = "read" | "quiz" | "action" | "complete";
type QuizResult = {
  score: number;
  passed: boolean;
  perfect: boolean;
  /**
   * How long the check actually was. Recorded rather than recomputed: a day's
   * nominal length includes review slots, and early days have fewer earlier
   * days to draw them from, so the two do not always agree. Optional because
   * journals written before this existed do not have it.
   */
  outOf?: number;
};
type Theme = "morning" | "night" | "green";
type TravelTransition = { from: CoursePhase; to: CoursePhase };

function getPreviewTheme(): Theme | undefined {
  const requested = new URLSearchParams(window.location.search).get("theme");
  return requested === "morning" || requested === "night" || requested === "green" ? requested : undefined;
}

function getPreviewView(): View | undefined {
  const requested = new URLSearchParams(window.location.search).get("view");
  return requested === "today" || requested === "map" || requested === "habits" || requested === "achievements" || requested === "progress" || requested === "takeaways" || requested === "vault" || requested === "lesson" || requested === "final" ? requested : undefined;
}

type AppData = {
  currentDay: number;
  completedDays: number[];
  xp: number;
  streak: number;
  lastCompletionDate?: string;
  quizHistory: Record<number, QuizResult>;
  actions: Record<number, string>;
  takeaways: Record<number, string>;
  bonusDays: number[];
  /** Island rechecks passed, keyed by phase id. */
  rechecks: Record<number, { score: number; passed: boolean }>;
  /** Consecutive correct answers, carried across lessons until one is missed. */
  combo: number;
  bestCombo: number;
  /** Summit trials passed, by index. */
  trialsPassed: number[];
  /** How well each earlier day's material has held up when it came back. */
  recall: Record<number, RecallRecord>;
  finalTestComplete: boolean;
};

const defaultData: AppData = {
  currentDay: 1,
  completedDays: [],
  xp: 0,
  streak: 0,
  quizHistory: {},
  actions: {},
  takeaways: {},
  bonusDays: [],
  rechecks: {},
  combo: 0,
  bestCombo: 0,
  trialsPassed: [],
  recall: {},
  finalTestComplete: false,
};

const cn = (...values: Array<string | false | undefined>) => values.filter(Boolean).join(" ");

const sameDay = (first: Date, second: Date) => first.toDateString() === second.toDateString();
const yesterday = (date: Date) => {
  const previous = new Date();
  previous.setDate(previous.getDate() - 1);
  return sameDay(date, previous);
};

const clampDay = (day: number) => Math.min(100, Math.max(1, day));

const phaseCompleteCount = (data: AppData, start: number) =>
  data.completedDays.filter((day) => day >= start && day < start + 10).length;

const phaseIdForDay = (day: number) => Math.floor((day - 1) / 10) + 1;

/**
 * A run of correct answers charges a bolt every fifth one, and the run carries
 * across lessons. The reward is deliberately small beside the twenty XP for
 * naming a real action: the course rewards application, and a clean run is a
 * nice thing to notice, not the point of the exercise.
 */
export const COMBO_STRIKE_EVERY = 5;
const COMBO_STRIKE_BASE = 8;
const COMBO_STRIKE_STEP = 2;
/** No single bolt may outweigh naming a real action, which is worth 20. */
export const COMBO_STRIKE_CAP = 18;

/** What the bolt charged at this run length is worth. Later bolts pay more. */
export function strikeValue(combo: number) {
  const tier = Math.floor(combo / COMBO_STRIKE_EVERY);
  if (tier < 1) return 0;
  return Math.min(COMBO_STRIKE_BASE + (tier - 1) * COMBO_STRIKE_STEP, COMBO_STRIKE_CAP);
}

/** Fold one answer into the journal: combo, best run and any bolt it charges. */
export function recordAnswer(previous: AppData, correct: boolean, source?: { fromDay?: number; onDay?: number }): AppData {
  const combo = correct ? previous.combo + 1 : 0;
  const struck = correct && combo % COMBO_STRIKE_EVERY === 0;
  const next: AppData = {
    ...previous,
    combo,
    bestCombo: Math.max(previous.bestCombo ?? 0, combo),
    xp: previous.xp + (struck ? strikeValue(combo) : 0),
  };
  // A question that came back from an earlier day tells us how that day is
  // holding up, which is what decides when it comes back again.
  if (source?.fromDay) {
    const before = previous.recall?.[source.fromDay] ?? { seen: 0, missed: 0 };
    next.recall = {
      ...(previous.recall ?? {}),
      [source.fromDay]: {
        seen: before.seen + 1,
        missed: before.missed + (correct ? 0 : 1),
        lastReviewedDay: source.onDay ?? before.lastReviewedDay,
      },
    };
  }
  return next;
}

/** An island is travelled once all ten of its days are recorded. */
/** Marks for passing a day's check. */
export const RECHECK_MARKS = 60;
export const CHECK_MARKS = 10;
/** What a perfect check pays instead. Deliberately several times the pass. */
export const PERFECT_MARKS = 40;
/** Added per consecutive perfect day before this one, up to the cap. */
export const PERFECT_RUN_MARKS = 10;
export const PERFECT_RUN_CAP = 5;

/**
 * How many days in a row ending just before `day` were answered perfectly.
 * Derived from the record rather than stored, so it cannot drift out of step
 * with the days it is counting.
 */
export function perfectRun(data: AppData, day: number): number {
  let run = 0;
  for (let earlier = day - 1; earlier >= 1; earlier--) {
    if (!data.quizHistory[earlier]?.perfect) break;
    run++;
  }
  return run;
}

/**
 * What a check is worth. A perfect one pays several times a pass, and a run of
 * them pays more again — the reward is for the standard held, not for a day
 * missed later.
 */
export function checkMarks(data: AppData, day: number, perfect: boolean): number {
  if (!perfect) return CHECK_MARKS;
  return PERFECT_MARKS + Math.min(perfectRun(data, day), PERFECT_RUN_CAP) * PERFECT_RUN_MARKS;
}

export const islandTravelled = (data: AppData, phaseId: number) =>
  phaseCompleteCount(data, (phaseId - 1) * 10 + 1) === 10;

export const recheckPassed = (data: AppData, phaseId: number) => Boolean(data.rechecks?.[phaseId]?.passed);

/** The recheck standing between the learner and the rest of the route, if any. */
export const dueRecheck = (data: AppData, forDay: number) => {
  const target = phaseIdForDay(forDay);
  return phases.find((phase) => phase.id < target && islandTravelled(data, phase.id) && !recheckPassed(data, phase.id));
};

export function calculateAccuracy(data: AppData) {
  const entries = Object.entries(data.quizHistory);
  if (!entries.length) return 0;
  // Ask each lesson how many questions it holds rather than assuming a fixed
  // number, so a lesson with a longer or shorter quiz still scores correctly.
  const asked = entries.reduce((total, [day]) => total + totalQuestionsForDay(Number(day)), 0);
  if (!asked) return 0;
  const correct = entries.reduce((total, [, result]) => total + result.score, 0);
  return Math.round((correct / asked) * 100);
}

/**
 * Record a completed day. Pure so that the streak, XP and bonus rules can be
 * tested directly, and so the React state updater stays free of side effects.
 * Returns the journal unchanged when the day is already complete.
 */
export function completeDay(
  previous: AppData,
  input: { day: number; action: string; takeaway: string; bonus: boolean; now?: Date },
): AppData {
  if (previous.completedDays.includes(input.day)) return previous;
  const now = input.now ?? new Date();
  const last = previous.lastCompletionDate ? new Date(previous.lastCompletionDate) : undefined;
  const nextStreak = !last || !sameDay(last, now) ? (last && yesterday(last) ? previous.streak + 1 : 1) : previous.streak;
  const receivedBonus = input.bonus && !previous.bonusDays.includes(input.day);
  return {
    ...previous,
    currentDay: input.day === previous.currentDay ? clampDay(previous.currentDay + 1) : previous.currentDay,
    completedDays: [...previous.completedDays, input.day].sort((a, b) => a - b),
    xp: previous.xp + 20 + (receivedBonus ? 60 : 0),
    streak: nextStreak,
    lastCompletionDate: now.toISOString(),
    actions: { ...previous.actions, [input.day]: input.action },
    takeaways: input.takeaway ? { ...previous.takeaways, [input.day]: input.takeaway } : previous.takeaways,
    bonusDays: receivedBonus ? [...previous.bonusDays, input.day] : previous.bonusDays,
  };
}

/**
 * How well an earlier day is holding up, from how it has answered when it came
 * back. Deliberately coarse: this is meant to point at what to practise, not to
 * grade the learner.
 */
export type Strength = "unseen" | "shaky" | "holding" | "strong";

export function recallStrength(record: RecallRecord | undefined): Strength {
  if (!record || record.seen === 0) return "unseen";
  const hits = record.seen - record.missed;
  if (record.missed > 0 && record.missed * 2 >= record.seen) return "shaky";
  if (hits >= 3 && record.missed === 0) return "strong";
  return "holding";
}

export const strengthLabel: Record<Strength, string> = {
  unseen: "Not revisited yet",
  shaky: "Needs another pass",
  holding: "Holding",
  strong: "Strong",
};

/** Days that have come back and not held, weakest first. */
export function weakestDays(data: AppData, limit = 12) {
  return data.completedDays
    .map((day) => ({ day, strength: recallStrength(data.recall?.[day]), record: data.recall?.[day] }))
    .filter((entry) => entry.strength === "shaky" || entry.strength === "unseen")
    .sort((a, b) => (b.record?.missed ?? 0) - (a.record?.missed ?? 0) || a.day - b.day)
    .slice(0, limit);
}

/** Titles of achievements unlocked by moving from one journal state to the next. */
export function newlyUnlocked(previous: AppData, next: AppData) {
  const before = new Set(achievementList(previous).filter((achievement) => achievement.unlocked).map((achievement) => achievement.id));
  return achievementList(next).filter((achievement) => achievement.unlocked && !before.has(achievement.id)).map((achievement) => achievement.title);
}

function achievementList(data: AppData) {
  const accuracy = calculateAccuracy(data);
  const complete = data.completedDays.length;
  return [
    { id: "first", icon: Sprout, title: "First Step", detail: "Complete Day 1.", unlocked: data.completedDays.includes(1) },
    { id: "week", icon: Flame, title: "Week One", detail: "Complete 7 days.", unlocked: complete >= 7 },
    { id: "quick", icon: Zap, title: "Quick Learner", detail: "Pass a quiz perfectly.", unlocked: Object.values(data.quizHistory).some((result) => result.perfect) },
    { id: "momentum", icon: Footprints, title: "Momentum", detail: "Complete 14 days.", unlocked: complete >= 14 },
    { id: "quarter", icon: Mountain, title: "Quarter Way", detail: "Complete 25 days.", unlocked: complete >= 25 },
    { id: "halfway", icon: Trophy, title: "Halfway", detail: "Complete 50 days.", unlocked: complete >= 50 },
    { id: "thinker", icon: Sparkles, title: "Deep Thinker", detail: "Complete 8 hard bonus challenges.", unlocked: data.bonusDays.length >= 8 },
    { id: "hundred", icon: Award, title: "100 Days", detail: "Complete the full course.", unlocked: complete === 100 },
    { id: "steady", icon: Target, title: "Grounded", detail: "Reach 80% quiz accuracy after 10 lessons.", unlocked: Object.keys(data.quizHistory).length >= 10 && accuracy >= 80 },
  ];
}

function initials(title: string) {
  return title.split(" ").map((word) => word[0]).join("").slice(0, 2);
}

export default function Home() {
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();

  const [data, setData] = useState<AppData>(defaultData);
  const [view, setView] = useState<View>(() => getPreviewView() ?? "today");
  const [selectedDay, setSelectedDay] = useState(1);
  const [stage, setStage] = useState<LessonStage>("read");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [quizStatus, setQuizStatus] = useState<"idle" | "failed" | "passed">("idle");
  const [recheckPhaseId, setRecheckPhaseId] = useState<number | null>(null);
  const [recheckAnswers, setRecheckAnswers] = useState<Record<number, number>>({});
  const [recheckStatus, setRecheckStatus] = useState<"idle" | "failed" | "passed">("idle");
  const [actionText, setActionText] = useState("");
  const [takeawayText, setTakeawayText] = useState("");
  const [bonusDone, setBonusDone] = useState(false);
  const [bonusNote, setBonusNote] = useState("");
  const [celebration, setCelebration] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => getPreviewTheme() ?? "morning");
  const [travelTransition, setTravelTransition] = useState<TravelTransition | null>(null);
  const [finalAnswers, setFinalAnswers] = useState<Record<number, number>>({});
  const [finalStatus, setFinalStatus] = useState<"idle" | "failed" | "passed">("idle");
  const [activeTrial, setActiveTrial] = useState<number | null>(null);
  const [activeQuiz, setActiveQuiz] = useState<QuizQuestion[]>([]);
  const [practiceQuiz, setPracticeQuiz] = useState<QuizQuestion[]>([]);
  const [practiceAnswers, setPracticeAnswers] = useState<Record<number, number>>({});
  const [practiceDone, setPracticeDone] = useState(false);
  const backupQuery = trpc.progress.get.useQuery(undefined, { enabled: isAuthenticated, retry: false });
  const backupMutation = trpc.progress.save.useMutation({
    onSuccess: () => {
      backupQuery.refetch();
      setNotice("A private backup of this device’s journal was saved. Your local copy still works offline.");
    },
    onError: () => setNotice("Your local journal is safe. The online backup could not be saved right now."),
  });

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AppData;
        setData({ ...defaultData, ...parsed, currentDay: clampDay(parsed.currentDay ?? 1) });
      }
    } catch {
      setNotice("Your previous progress could not be read, so a fresh journal has been opened.");
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    if (getPreviewTheme()) return;
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (storedTheme === "morning" || storedTheme === "night" || storedTheme === "green") setTheme(storedTheme);
  }, []);

  useEffect(() => {
    if (getPreviewTheme()) return;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  const lesson = getLesson(selectedDay);
  const todayLesson = getLesson(data.currentDay);
  const achievements = useMemo(() => achievementList(data), [data]);
  const coursePercent = Math.round((data.completedDays.length / 100) * 100);
  const accuracy = calculateAccuracy(data);
  // The vault only cares about today's own check: passing yesterday does not
  // open today. quizHistory keeps the count right; the length comes from the
  // day itself, since it grows with the island.
  const vaultResult = useMemo(() => {
    const record = data.quizHistory[data.currentDay];
    if (!record) return undefined;
    // Older journals did not record the length; the day's nominal count is the
    // best available fallback for those.
    return { score: record.score, outOf: record.outOf ?? totalQuestionsForDay(data.currentDay) };
  }, [data.quizHistory, data.currentDay]);
  const completedCurrent = data.completedDays.includes(selectedDay);
  const canOpenDay = (day: number) => day <= data.currentDay || data.completedDays.includes(day);

  function chooseView(next: View) {
    setMenuOpen(false);
    setView(next);
    if (next !== "lesson") setNotice("");
  }

  function openLesson(day: number) {
    const blocking = dueRecheck(data, day);
    if (blocking) {
      setNotice(`${blocking.island} has a recheck waiting. Pass it and the route opens onward.`);
      openRecheck(blocking.id);
      return;
    }
    if (!canOpenDay(day)) {
      setNotice("This waypoint unlocks after you complete the current day. Take one real step first.");
      return;
    }
    const previousQuiz = data.quizHistory[day];
    const lessonForDay = getLesson(day);
    setActiveQuiz([
      ...lessonForDay.quiz,
      ...selectReview(day, reviewSlotsFor(day, lessonForDay.phase.id), data.recall ?? {}, data.completedDays),
    ]);
    setSelectedDay(day);
    setStage(data.completedDays.includes(day) ? "complete" : previousQuiz?.passed ? "action" : "read");
    setAnswers({});
    setQuizStatus("idle");
    setActionText(data.actions[day] ?? "");
    setTakeawayText(data.takeaways[day] ?? "");
    setBonusDone(data.bonusDays.includes(day));
    setBonusNote("");
    setCelebration([]);
    setView("lesson");
  }

  function answerRecorded(correct: boolean, question?: QuizQuestion) {
    setData((previous) => recordAnswer(previous, correct, { fromDay: question?.fromDay, onDay: selectedDay }));
  }

  function openPractice() {
    const weakest = weakestDays(data);
    const questions = selectReview(
      Math.max(2, data.currentDay),
      Math.min(8, Math.max(1, weakest.length || data.completedDays.length)),
      data.recall ?? {},
      data.completedDays,
    );
    if (!questions.length) {
      setNotice("Complete a day first — practice draws on the route you have already travelled.");
      return;
    }
    setPracticeQuiz(questions);
    setPracticeAnswers({});
    setPracticeDone(false);
    setMenuOpen(false);
    setView("practice");
  }

  function openRecheck(phaseId: number) {
    setRecheckPhaseId(phaseId);
    setRecheckAnswers({});
    setRecheckStatus(recheckPassed(data, phaseId) ? "passed" : "idle");
    setMenuOpen(false);
    setView("recheck");
  }

  function submitRecheck() {
    if (recheckPhaseId === null) return;
    const questions = buildRecheck(recheckPhaseId);
    const score = questions.reduce((total, question, index) => total + (recheckAnswers[index] === question.answer ? 1 : 0), 0);
    if (score < passMark(questions.length)) {
      setRecheckStatus("failed");
      setNotice("Not yet. Look again at what this island was teaching, then run the recheck.");
      return;
    }
    setRecheckStatus("passed");
    setNotice("");
    if (!recheckPassed(data, recheckPhaseId)) {
      setData({ ...data, xp: data.xp + RECHECK_MARKS, rechecks: { ...data.rechecks, [recheckPhaseId]: { score, passed: true } } });
      bankRecheckHold(localDayKey());
    }
    if (recheckPhaseId < 10) {
      setTravelTransition({ from: phases[recheckPhaseId - 1], to: phases[recheckPhaseId] });
      window.setTimeout(() => setTravelTransition(null), 1800);
    }
  }

  function startToday() {
    openLesson(data.currentDay);
  }

  function submitQuiz() {
    if (Object.keys(answers).length !== lesson.quiz.length) {
      setQuizStatus("failed");
      setNotice("Answer every question before checking your understanding.");
      return;
    }
    const score = activeQuiz.reduce((total, question, index) => total + (answers[index] === question.answer ? 1 : 0), 0);
    const passed = score >= passMark(activeQuiz.length);
    const perfect = score === activeQuiz.length;
    if (!passed) {
      setQuizStatus("failed");
      setNotice("Not quite. Review the key idea and example, then try again. Understanding comes first.");
      return;
    }
    setQuizStatus("passed");
    setNotice(perfect
      ? `Every one right. ${HOLD_DAYS.perfect} days of vault cover banked, and the marks to match.`
      : "You understood the core idea. Now put it to work.");
    setData((previous) => {
      if (previous.quizHistory[lesson.day]?.passed) return previous;
      return {
        ...previous,
        xp: previous.xp + checkMarks(previous, lesson.day, perfect),
        quizHistory: { ...previous.quizHistory, [lesson.day]: { score, passed, perfect, outOf: activeQuiz.length } },
      };
    });
    setStage("action");
  }

  function finishDay() {
    if (actionText.trim().length < 8) {
      setNotice("Write the small, real action you will take. A few honest words are enough.");
      return;
    }
    if (bonusDone && bonusNote.trim().length < 8 && !data.bonusDays.includes(lesson.day)) {
      setNotice("Add a short note about how you applied the hard bonus challenge, or leave it unchecked. The bonus is optional.");
      return;
    }

    const next = completeDay(data, {
      day: lesson.day,
      action: actionText.trim(),
      takeaway: takeawayText.trim(),
      bonus: bonusDone,
    });
    if (next !== data) {
      setCelebration(newlyUnlocked(data, next));
      setData(next);
    }
    setStage("complete");
    setNotice(lesson.day % 10 === 0
      ? "Island complete. One recheck now covers the whole stretch you have just travelled."
      : "Day recorded. What matters is the action you carry into real life.");
  }

  function openFinalTest() {
    if (data.completedDays.length < 100) {
      setNotice("The Final Test appears after the full route has been travelled.");
      return;
    }
    setFinalAnswers({});
    setFinalStatus(data.finalTestComplete ? "passed" : "idle");
    chooseView("final");
  }

  function openTrial(trial: number) {
    setActiveTrial(trial);
    setFinalAnswers({});
    setFinalStatus(data.trialsPassed?.includes(trial) ? "passed" : "idle");
    setNotice("");
  }

  function submitTrial() {
    if (activeTrial === null) return;
    const questions = buildTrial(activeTrial);
    const score = questions.reduce((total, question, index) => total + (finalAnswers[index] === question.answer ? 1 : 0), 0);
    if (score < passMark(questions.length)) {
      setFinalStatus("failed");
      setNotice("Not yet. Read what each one was pointing at, then take the trial again.");
      return;
    }
    setFinalStatus("passed");
    const already = data.trialsPassed?.includes(activeTrial) ?? false;
    const passedTrials = already ? data.trialsPassed : [...(data.trialsPassed ?? []), activeTrial];
    const questComplete = finalTrials.every((trial) => passedTrials.includes(trial.id));
    setData({
      ...data,
      trialsPassed: passedTrials,
      xp: data.xp + (already ? 0 : 60) + (questComplete && !data.finalTestComplete ? 100 : 0),
      finalTestComplete: data.finalTestComplete || questComplete,
    });
    setNotice(questComplete
      ? "The Summit quest is complete. The route is one connected world."
      : `${finalTrials[activeTrial].name} passed: ${score}/${questions.length}. One trial remains.`);
    setActiveTrial(null);
  }

  function resetProgress() {
    const shouldReset = window.confirm("Reset all locally stored progress? This cannot be undone.");
    if (!shouldReset) return;
    window.localStorage.removeItem(STORAGE_KEY);
    setData(defaultData);
    setSelectedDay(1);
    setStage("read");
    setView("today");
    setNotice("Your field journal has been reset. Day 1 is ready when you are.");
  }

  function saveBackup() {
    if (!isAuthenticated) {
      startLogin();
      return;
    }
    backupMutation.mutate({ data: JSON.parse(JSON.stringify(data)) as Record<string, unknown> });
  }

  function restoreBackup() {
    const saved = backupQuery.data?.data;
    if (!saved || typeof saved.currentDay !== "number" || !Array.isArray(saved.completedDays)) {
      setNotice("There is no usable backup to restore yet.");
      return;
    }
    if (!window.confirm("Restore the saved journal to this device? It will replace the current local progress.")) return;
    setData({ ...defaultData, ...(saved as Partial<AppData>), currentDay: clampDay(saved.currentDay) });
    setSelectedDay(clampDay(saved.currentDay));
    setStage("read");
    setView("today");
    setNotice("Your saved journal is now restored on this device.");
  }

  return (
    <main className={cn("field-app", `theme-${theme}`)}>
      <a className="skip-link" href="#main-content">Skip to today’s content</a>
      {/* Sly rides along on every view: a long stretch at the screen is a long
          stretch wherever you happen to be standing in the course. */}
      <SlyCompanion />
      <div className="sky" aria-hidden="true">
        <div className="sky-body" />
        <div className="sky-glow" />
        <div className="sky-stars" />
        <div className="sky-quasars"><i /><i /><i /></div>
        <div className="sky-clouds" />
        <div className="sky-canopy" />
      </div>
      <aside className="desktop-rail" aria-label="Primary navigation">
        <Brand />
        <nav className="rail-nav">
          <NavButton icon={HomeIcon} label="Today" active={view === "today"} onClick={() => chooseView("today")} />
          <NavButton icon={Map} label="Course map" active={view === "map"} onClick={() => chooseView("map")} />
          <NavButton icon={Sprout} label="Habits" active={view === "habits"} onClick={() => chooseView("habits")} />
          <NavButton icon={Award} label="Achievements" active={view === "achievements"} onClick={() => chooseView("achievements")} />
          <NavButton icon={Target} label="Progress" active={view === "progress"} onClick={() => chooseView("progress")} />
          <NavButton icon={PencilLine} label="Takeaways" active={view === "takeaways"} onClick={() => chooseView("takeaways")} />
          <NavButton icon={KeyRound} label="Vault" active={view === "vault"} onClick={() => chooseView("vault")} />
        </nav>
        <div className="rail-bottom-note">
          <span className="note-pin">FIELD NOTE</span>
          <p>“Do what matters when it is time to do it. If you slip, return without drama.”</p>
        </div>
      </aside>

      <section className="app-shell">
        <header className="topbar">
          <div className="mobile-brand"><Brand compact /></div>
          <div className="topbar-spacer" />
          <div className="desktop-theme-control"><ThemeSelector theme={theme} onChange={setTheme} /></div>
          <div className="topbar-stats" aria-label="Your current progress">
            <div className="top-stat"><Flame aria-hidden="true" className={cn(data.streak > 0 && "ember")} /><span className="stat-pop" key={`streak-${data.streak}`}>{data.streak}</span><span className="stat-word">returns</span></div>
            <div className="top-stat xp"><Zap aria-hidden="true" /><span className="stat-pop" key={`xp-${data.xp}`}>{data.xp}</span><span className="stat-word">practice marks</span></div>
          </div>
          <div className="mobile-menu-wrap">
            <button className="icon-button mobile-menu-button" aria-label="Open menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>
              {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
            </button>
            {menuOpen && (
              <div className="mobile-popover" role="menu">
                <div className="mobile-theme-control"><span>APPEARANCE</span><ThemeSelector theme={theme} onChange={setTheme} compact /></div>
                <button role="menuitem" onClick={() => chooseView("achievements")}>Achievements</button>
                <button role="menuitem" onClick={() => chooseView("takeaways")}>Takeaways</button>
                <button role="menuitem" onClick={resetProgress}>Reset local progress</button>
              </div>
            )}
          </div>
        </header>

        <div id="main-content" className="main-content" tabIndex={-1}>
          {notice && <div className="notice" role="status"><CircleHelp aria-hidden="true" />{notice}</div>}
          {view === "today" && <TodayView data={data} lesson={todayLesson} coursePercent={coursePercent} onStart={startToday} onMap={() => chooseView("map")} onAchievements={() => chooseView("achievements")} account={{ loading: authLoading, signedIn: isAuthenticated, name: user?.name ?? undefined, hasBackup: Boolean(backupQuery.data), saving: backupMutation.isPending }} onSignIn={() => startLogin()} onSaveBackup={saveBackup} onRestoreBackup={restoreBackup} onLogout={logout} />}
          {view === "map" && <CourseMap data={data} onOpen={openLesson} onFinal={openFinalTest} onRecheck={openRecheck} />}
          {view === "habits" && <HabitPlanner />}
          {view === "achievements" && <AchievementsView achievements={achievements} data={data} />}
          {view === "progress" && <ProgressView data={data} coursePercent={coursePercent} accuracy={accuracy} onPractise={openPractice} />}
          {view === "takeaways" && <TakeawaysView data={data} onStart={startToday} />}
          {view === "vault" && <VaultView xp={data.xp} courseDay={data.currentDay} result={vaultResult} />}
          {view === "lesson" && (
            <LessonView
              lesson={lesson}
              quiz={activeQuiz}
              stage={stage}
              answers={answers}
              setAnswers={setAnswers}
              quizStatus={quizStatus}
              onTakeQuiz={() => { setStage("quiz"); setNotice(""); }}
              onSubmitQuiz={submitQuiz}
              onRetryQuiz={() => { setAnswers({}); setQuizStatus("idle"); setNotice(""); }}
              onAnswer={answerRecorded}
              combo={data.combo}
              actionText={actionText}
              setActionText={setActionText}
              takeawayText={takeawayText}
              setTakeawayText={setTakeawayText}
              bonusDone={bonusDone}
              setBonusDone={setBonusDone}
              bonusNote={bonusNote}
              setBonusNote={setBonusNote}
              completed={completedCurrent}
              celebration={celebration}
              onFinish={finishDay}
              onBack={() => chooseView("today")}
              onNext={() => selectedDay % 10 === 0 && islandTravelled(data, phaseIdForDay(selectedDay)) && !recheckPassed(data, phaseIdForDay(selectedDay)) ? openRecheck(phaseIdForDay(selectedDay)) : selectedDay === 100 && data.completedDays.includes(100) ? openFinalTest() : selectedDay < data.currentDay ? openLesson(selectedDay + 1) : chooseView("today")}
            />
          )}
          {view === "recheck" && recheckPhaseId !== null && (
            <RecheckView
              phase={phases[recheckPhaseId - 1]}
              data={data}
              answers={recheckAnswers}
              setAnswers={setRecheckAnswers}
              status={recheckStatus}
              onSubmit={submitRecheck}
              onAnswer={answerRecorded}
              combo={data.combo}
              onRetry={() => { setRecheckAnswers({}); setRecheckStatus("idle"); setNotice(""); }}
              onBack={() => chooseView("map")}
              onContinue={() => { const next = recheckPhaseId * 10 + 1; if (next <= 100) openLesson(next); else chooseView("map"); }}
            />
          )}
          {view === "practice" && (
            <PracticeView
              questions={practiceQuiz}
              answers={practiceAnswers}
              setAnswers={setPracticeAnswers}
              done={practiceDone}
              onSubmit={() => setPracticeDone(true)}
              onAgain={openPractice}
              onAnswer={answerRecorded}
              combo={data.combo}
              onBack={() => chooseView("progress")}
            />
          )}
          {view === "final" && <SummitQuest data={data} activeTrial={activeTrial} answers={finalAnswers} setAnswers={setFinalAnswers} status={finalStatus} onOpenTrial={openTrial} onSubmit={submitTrial} onRetry={() => { setFinalAnswers({}); setFinalStatus("idle"); setNotice(""); }} onAnswer={answerRecorded} combo={data.combo} onLeaveTrial={() => { setActiveTrial(null); setFinalStatus("idle"); }} onBack={() => chooseView("map")} />}
        </div>

        <nav className="mobile-tabbar" aria-label="Mobile primary navigation">
          <MobileNavButton icon={HomeIcon} label="Today" active={view === "today"} onClick={() => chooseView("today")} />
          <MobileNavButton icon={Map} label="Journey" active={view === "map"} onClick={() => chooseView("map")} />
          <MobileNavButton icon={Sprout} label="Habits" active={view === "habits"} onClick={() => chooseView("habits")} />
          <MobileNavButton icon={Target} label="Progress" active={view === "progress"} onClick={() => chooseView("progress")} />
        </nav>
      </section>
      {travelTransition && <IslandTravelTransition transition={travelTransition} onSkip={() => setTravelTransition(null)} />}
    </main>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("brand", compact && "brand-compact")}>
      <img src={LOGO_URL} alt="" className="brand-mark" />
      {!compact && <img src={FULL_LOGO_URL} alt="100 Steps to Life" className="brand-full-logo" />}
      {compact && <span className="sr-only">Hundred Steps to Life</span>}
    </div>
  );
}

function NavButton({ icon: Icon, label, active, onClick }: { icon: typeof HomeIcon; label: string; active: boolean; onClick: () => void }) {
  return <button className={cn("rail-link", active && "active")} onClick={onClick}><Icon aria-hidden="true" /><span>{label}</span>{active && <span className="active-dot" />}</button>;
}

function MobileNavButton({ icon: Icon, label, active, onClick }: { icon: typeof HomeIcon; label: string; active: boolean; onClick: () => void }) {
  return <button className={cn("mobile-nav-link", active && "active")} onClick={onClick}><Icon aria-hidden="true" /><span>{label}</span></button>;
}

function ThemeSelector({ theme, onChange, compact = false }: { theme: Theme; onChange: (theme: Theme) => void; compact?: boolean }) {
  return (
    <div className={cn("theme-picker", compact && "compact")} aria-label="Appearance mode">
      <button className={cn("theme-choice", theme === "morning" && "selected")} aria-pressed={theme === "morning"} onClick={() => onChange("morning")}><Sun aria-hidden="true" /><span>Morning</span></button>
      <button className={cn("theme-choice", theme === "night" && "selected")} aria-pressed={theme === "night"} onClick={() => onChange("night")}><Moon aria-hidden="true" /><span>Night</span></button>
      <button className={cn("theme-choice", theme === "green" && "selected")} aria-pressed={theme === "green"} onClick={() => onChange("green")}><Sprout aria-hidden="true" /><span>Green</span></button>
    </div>
  );
}

type AccountState = { loading: boolean; signedIn: boolean; name?: string; hasBackup: boolean; saving: boolean };

function TodayView({ data, lesson, coursePercent, onStart, onMap, onAchievements, account, onSignIn, onSaveBackup, onRestoreBackup, onLogout }: { data: AppData; lesson: Lesson; coursePercent: number; onStart: () => void; onMap: () => void; onAchievements: () => void; account: AccountState; onSignIn: () => void; onSaveBackup: () => void; onRestoreBackup: () => void; onLogout: () => void }) {
  const isFirstStep = data.completedDays.length === 0;
  return (
    <div className="view-stack today-view">
      <section className="today-hero" style={{ backgroundImage: `linear-gradient(98deg, rgba(16, 31, 39, .92) 0%, rgba(16, 31, 39, .62) 45%, rgba(16, 31, 39, .16) 100%), url(${HERO_URL})` }}>
        <div className="hero-content">
          <div className="eyebrow-light"><Compass aria-hidden="true" /> {isFirstStep ? "YOUR FIELD GUIDE BEGINS" : "TODAY’S WAYPOINT"}</div>
          <p className="hero-day">DAY <span>{String(lesson.day).padStart(2, "0")}</span> <i /> {lesson.phase.shortTitle.toUpperCase()}</p>
          <h1>{lesson.title}</h1>
          <p className="hero-copy">{lesson.why}</p>
          <button className="primary-button hero-button" onClick={onStart}><BookOpen aria-hidden="true" /> {isFirstStep ? "Begin Day 1" : "Open today’s lesson"}<ChevronRight aria-hidden="true" /></button>
        </div>
        <div className="hero-footer"><span>THE COURSE METHOD</span><p>Learn. Understand. Apply. Reflect.</p></div>
      </section>

      <section className="today-grid">
        <article className="paper-card lesson-preview-card">
          <div className="card-heading"><div><span className="eyebrow">TODAY’S FOCUS</span><h2>One step, then the next.</h2></div><span className="day-stamp">{String(lesson.day).padStart(2, "0")}</span></div>
          <div className="lesson-preview">
            <p className="label">KEY IDEA</p><p>{lesson.keyIdea}</p>
          </div>
          <div className="today-action-preview"><div className="action-icon"><Target aria-hidden="true" /></div><div><span className="label">TODAY’S ACTION</span><p>{lesson.actionPrompt}</p></div></div>
          <button className="text-button" onClick={onStart}>Learn, understand, then act <ChevronRight aria-hidden="true" /></button>
        </article>

        <aside className="journey-card">
          <div className="journey-head"><div><span className="eyebrow-light">ROUTE SO FAR</span><h2>{data.completedDays.length} <small>steps travelled</small></h2></div><Footprints aria-hidden="true" /></div>
          <div className="journey-meter" aria-label={`${coursePercent}% of course complete`}><span style={{ width: `${Math.max(coursePercent, 2)}%` }} /></div>
          <div className="journey-route" aria-hidden="true"><span className="route-node done" /><span className="route-line" /><span className={cn("route-node", data.currentDay > 1 && "done")} /><span className="route-line" /><span className="route-node current" /><span className="route-line" /><span className="route-node" /></div>
          <p>{coursePercent === 0 ? "Your first honest step is waiting." : `${coursePercent}% travelled. The path does not need solving today.`}</p>
          <button className="secondary-dark-button" onClick={onMap}>View course map <ChevronRight aria-hidden="true" /></button>
        </aside>
      </section>

      <section className="today-lower-grid field-notes-row">
        <article className="mini-paper-card"><div className="mini-icon moss"><Flame aria-hidden="true" /></div><div><span className="label">RETURN RHYTHM</span><h3>{data.streak} return{data.streak === 1 ? "" : "s"}</h3><p>The route accepts an honest return.</p></div></article>
        <article className="mini-paper-card"><div className="mini-icon gold"><Zap aria-hidden="true" /></div><div><span className="label">PRACTICE MARKS</span><h3>{data.xp}</h3><p>Evidence of learning put into action.</p></div></article>
        <article className="mini-paper-card achievement-teaser"><img src={BADGE_URL} alt="" /><div><span className="label">MILESTONES</span><h3>{achievementList(data).filter((item) => item.unlocked).length} unlocked</h3><button className="text-button compact" onClick={onAchievements}>See achievements <ChevronRight aria-hidden="true" /></button></div></article>
      </section>

      {isFirstStep && <FirstlightCove onStart={onStart} />}
      <CourseMethod />
      <CoursePsychology />
      <AccountBackup account={account} onSignIn={onSignIn} onSaveBackup={onSaveBackup} onRestoreBackup={onRestoreBackup} onLogout={onLogout} />
      {isFirstStep && <section className="course-threshold"><div><span className="eyebrow-light">THE START OF THE COURSE</span><h2>Start improving<br /><em>your life.</em></h2><p>Begin at Firstlight Cove. You only need to take the first honest step.</p></div><button className="hero-button primary-button" onClick={onStart}>Start improving your life. <ChevronRight aria-hidden="true" /></button></section>}
    </div>
  );
}

// Where each of the ten Firstlight Cove waypoints sits on the route. Held here
// rather than in CSS sibling selectors so adding scenery to the map can never
// shift the route out from under the markers.
const coveRoute = [
  { left: "3%", bottom: "103px" },
  { left: "12%", bottom: "29px" },
  { left: "32%", bottom: "91px" },
  { left: "47%", bottom: "123px" },
  { left: "61%", bottom: "108px" },
  { left: "73%", bottom: "72px" },
  { left: "68%", bottom: "35px" },
  { left: "51%", bottom: "21px" },
  { left: "36%", bottom: "31px" },
  { left: "24%", bottom: "60px" },
];

function FirstlightCove({ onStart }: { onStart: () => void }) {
  return <section className="cove-entry">
    <div className="cove-copy"><span className="eyebrow">YOUR OPENING ISLAND</span><h2>Firstlight<br /><em>Cove.</em></h2><p>A calm place to begin: notice where you are, choose a direction, and take one honest step inland.</p><div className="cove-meta"><span>FOUNDATION</span><i /> <span>DAYS 1–10</span></div></div>
    <div className="cove-map" aria-label="Firstlight Cove route with Day 1 active">
      <div className="cove-water" aria-hidden="true" /><div className="cove-stars" aria-hidden="true" /><div className="cove-sun" aria-hidden="true" /><div className="cove-clouds" aria-hidden="true" /><div className="cove-shore" aria-hidden="true" /><div className="cove-trees" aria-hidden="true" /><div className="cove-trail" aria-hidden="true" />
      {coveRoute.map((spot, index) => index === 0 ? <button className="cove-waypoint current" key={index} style={spot} onClick={onStart} aria-label={`Open Day 1: ${getLesson(1).title}`}><span>01</span><small>{getLesson(1).title.split(",")[0]}</small></button> : <span className="cove-waypoint locked" key={index} style={spot} aria-label={`Day ${index + 1}, locked`}><span>{String(index + 1).padStart(2, "0")}</span></span>)}
    </div>
  </section>;
}

function CourseMethod() {
  return <section className="course-method"><div className="method-heading"><span className="eyebrow">HOW THIS COURSE IS MADE</span><h2>Useful ideas are only the<br /><em>beginning.</em></h2><p>Hundred Steps to Life is shaped by the One Percent Philosophy: a small, meaningful improvement becomes powerful when it is understood, applied, and returned to.</p></div><div className="method-rules"><article><span>01</span><h3>Learn the idea</h3><p>Each lesson gives one practical idea, not a pile of vague motivation.</p></article><article><span>02</span><h3>Check understanding</h3><p>A short knowledge check separates recognition from real understanding.</p></article><article><span>03</span><h3>Use it in life</h3><p>The day only becomes complete when you name a small, real action.</p></article><article><span>04</span><h3>Return with honesty</h3><p>Missed steps are information. The route asks for a return, not a performance.</p></article></div><div className="method-boundary"><Compass aria-hidden="true" /><p>Modules use Islamic principles, careful historical thought, and practical disciplines to support a responsible life. This course is a guide for reflection and action—not a substitute for qualified religious, medical, legal, or mental-health advice.</p></div></section>;
}

// Sits on the home screen only. The lessons themselves stay practical; anyone
// who wants the reasoning behind the course's shape can open it here.
const psychologyPoints = [
  { icon: CircleHelp, title: "Recalling beats re-reading", detail: "Reading an idea again makes it feel familiar. Being asked to retrieve it shows whether you actually hold it. That is why understanding is checked before a day can be completed." },
  { icon: Target, title: "A named action is a kept action", detail: "A general intention to improve rarely survives a busy day. A specific step, tied to a real moment, is far easier to carry out — so the day asks what you will do, and when." },
  { icon: Footprints, title: "Beginning is the expensive part", detail: "Most effort is spent starting, not continuing. Each day asks for one honest step rather than an overhaul, because a small start is a step you will actually take." },
  { icon: Map, title: "Places make memories findable", detail: "Ideas learned in one undifferentiated stream blur together. Ten distinct islands give each phase its own landscape, landmark and cue, so a lesson has somewhere to live." },
  { icon: RotateCcw, title: "Shame ends courses, not missed days", detail: "A missed day is rarely what stops someone. Deciding they have failed is. Returns are counted instead of unbroken streaks, so a gap is information to act on, not a verdict." },
  { icon: Sparkles, title: "Signals help, scores mislead", detail: "Progress markers make effort visible, but they measure activity — never worth, character or faith. They are called practice marks and returns because that is all they describe." },
];

function CoursePsychology() {
  return <section className="course-psychology">
    <details className="psychology-panel">
      <summary>
        <div><span className="eyebrow">WHY THE COURSE IS SHAPED THIS WAY</span><h2>Explain the <em>psychology.</em></h2></div>
        <i aria-hidden="true"><ChevronRight /></i>
      </summary>
      <div className="psychology-body">
        <p className="psychology-lede">Every rule in Hundred Steps to Life exists for a reason. Here is the reasoning, in plain terms, so you can judge the method rather than take it on trust.</p>
        <div className="psychology-points">
          {psychologyPoints.map(({ icon: Icon, title, detail }) => (
            <article key={title}><span><Icon aria-hidden="true" /></span><h3>{title}</h3><p>{detail}</p></article>
          ))}
        </div>
        <p className="psychology-note">These are design principles, not clinical claims, and the course is not a substitute for professional mental-health care.</p>
      </div>
    </details>
  </section>;
}

function AccountBackup({ account, onSignIn, onSaveBackup, onRestoreBackup, onLogout }: { account: AccountState; onSignIn: () => void; onSaveBackup: () => void; onRestoreBackup: () => void; onLogout: () => void }) {
  return <section className="account-backup"><div className="backup-icon"><WifiOff aria-hidden="true" /></div><div className="backup-copy"><span className="eyebrow">YOUR JOURNAL, YOUR DEVICE</span><h2>Works offline.<br /><em>Back up when ready.</em></h2><p>Your progress, actions, and reflections save on this device first. Sign in only when you want a private backup to restore on another device.</p></div><div className="backup-actions">{account.loading ? <span className="backup-status">Checking your journal…</span> : !account.signedIn ? <><button className="primary-button" onClick={onSignIn}><LogIn aria-hidden="true" /> Sign in to back up</button><small><Cloud aria-hidden="true" /> Offline progress stays available either way.</small></> : <><span className="backup-status"><Check aria-hidden="true" /> Signed in{account.name ? ` as ${account.name}` : ""}</span><button className="primary-button" onClick={onSaveBackup} disabled={account.saving}><Upload aria-hidden="true" /> {account.saving ? "Saving backup…" : "Save private backup"}</button>{account.hasBackup && <button className="backup-secondary" onClick={onRestoreBackup}><Download aria-hidden="true" /> Restore saved journal</button>}<button className="backup-text" onClick={onLogout}>Sign out</button></>}</div></section>;
}

function CourseMap({ data, onOpen, onFinal, onRecheck }: { data: AppData; onOpen: (day: number) => void; onFinal: () => void; onRecheck: (phaseId: number) => void }) {
  const fullRouteComplete = data.completedDays.length === 100;
  const activeIslandId = Math.min(10, Math.floor((Math.max(1, data.currentDay) - 1) / 10) + 1);
  return (
    <div className="view-stack">
      <section className="view-heading map-heading">
        <div><span className="eyebrow">THE ISLAND JOURNEY</span><h1>Ten places to<br /><em>remember what matters.</em></h1><p>Each island holds ten lessons. Its landscape is a memory cue; its waypoints are the real work.</p></div>
        <div className="map-count"><strong>{data.completedDays.length}</strong><span>steps travelled</span></div>
      </section>
      <section className={cn("island-world", fullRouteComplete && "world-complete")} aria-label="Ten-island course map">
        <div className="world-horizon" aria-hidden="true"><span /></div>
        {fullRouteComplete ? <section className="connected-world-stage" style={{ backgroundImage: `linear-gradient(90deg, rgba(10,33,42,.18), rgba(10,33,42,.03)), url(${CONNECTED_WORLD_URL})` }}><div className="connected-world-copy"><span className="eyebrow-light">THE ISLANDS CONNECT</span><h2>One world.<br /><em>One next choice.</em></h2><p>The separate places were always parts of one life. The route now asks you to use what you learned without a lesson telling you what to do next.</p></div><button className={cn("final-quest", data.finalTestComplete && "complete")} onClick={onFinal}><span className="final-star">✦</span><div><span className="eyebrow-light">THE CENTRE QUEST</span><h2>{data.finalTestComplete ? "Final Test recorded" : "The Final Test"}</h2><p>{data.finalTestComplete ? "Return to the route whenever you need to choose the next honest action." : "Ten scenario choices. One question: can you use the whole course when life does not give you a script?"}</p></div><ChevronRight aria-hidden="true" /></button></section> : phases.map((phase, phaseIndex) => {
          const start = phaseIndex * 10 + 1;
          const count = phaseCompleteCount(data, start);
          const complete = count === 10;
          const active = phase.id === activeIslandId && !complete;
          const visible = phase.id <= activeIslandId || complete || fullRouteComplete;
          return <article className={cn("island-card", `island-${phase.id}`, active && "active", complete && "complete", !visible && "mist")} key={phase.id}>
            <div className="island-art" style={{ backgroundImage: `linear-gradient(90deg, rgba(10,33,42,.68), rgba(10,33,42,.05)), url(${ISLAND_IMAGES[phase.id]})` }}>
              <div className="island-art-label"><span>{String(phase.id).padStart(2, "0")}</span><small>{phase.range}</small></div>
              <div className="island-identity"><p>{phase.landscape}</p><h2>{phase.island}</h2><span>{phase.landmark}</span></div>
              <div className="island-progress"><span>{count}/10</span><i style={{ width: `${count * 10}%` }} /></div>
            </div>
            <div className="island-route"><div className="route-copy"><span className="eyebrow">{phase.title}</span><p>{phase.memoryCue}</p></div><div className="island-waypoints" aria-label={`${phase.island} lesson waypoints`}>{Array.from({ length: 10 }, (_, index) => { const day = start + index; const done = data.completedDays.includes(day); const current = day === data.currentDay && !done; const unlocked = day <= data.currentDay || done; const className = cn("island-waypoint", done && "done", current && "current", !unlocked && "locked"); const label = `Day ${day}: ${getLesson(day).title}${done ? ", complete" : current ? ", current" : !unlocked ? ", locked" : ""}`; return unlocked ? <button key={day} className={className} onClick={() => onOpen(day)} aria-label={label}><span>{done ? <Check aria-hidden="true" /> : String(day).padStart(2, "0")}</span>{current && <small>{getLesson(day).title}</small>}</button> : <span key={day} className={className} aria-label={label}><span><Lock aria-hidden="true" /></span></span>; })}</div></div>
            {complete && (recheckPassed(data, phase.id)
              ? <div className="island-passage"><Check aria-hidden="true" /><span>{phase.id < 10 ? "Passage charted" : "Island secured"}</span></div>
              : <button className="island-passage pending" onClick={() => onRecheck(phase.id)}><Zap aria-hidden="true" /><span>Recheck waiting — {RECHECK_LENGTH} questions to open the passage</span><ChevronRight aria-hidden="true" /></button>)}
          </article>;
        })}
      </section>
    </div>
  );
}

function IslandTravelTransition({ transition, onSkip }: { transition: TravelTransition; onSkip: () => void }) {
  return <aside className="island-travel" role="status" aria-live="polite"><div className="travel-card"><div className="travel-place" style={{ backgroundImage: `url(${ISLAND_IMAGES[transition.from.id]})` }}><span>{transition.from.island}</span></div><div className="travel-line"><Footprints aria-hidden="true" /><span>Passage charted</span></div><div className="travel-place arrival" style={{ backgroundImage: `url(${ISLAND_IMAGES[transition.to.id]})` }}><span>{transition.to.island}</span></div><button onClick={onSkip}>Continue</button></div></aside>;
}

/**
 * Practice. Not a gate and not worth XP of its own: it exists so the material
 * that has not held can be worked on deliberately, rather than only when a
 * lesson happens to serve it.
 */
function PracticeView({ questions, answers, setAnswers, done, onSubmit, onAgain, onAnswer, combo, onBack }: {
  questions: QuizQuestion[];
  answers: Record<number, number>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  done: boolean;
  onSubmit: () => void;
  onAgain: () => void;
  onAnswer: (correct: boolean, question?: QuizQuestion) => void;
  combo: number;
  onBack: () => void;
}) {
  const right = questions.filter((question, index) => answers[index] === question.answer).length;
  const days = Array.from(new Set(questions.map((question) => question.fromDay).filter((day): day is number => typeof day === "number"))).sort((a, b) => a - b);
  return (
    <div className="final-test-shell">
      <section className="trial-run-head">
        <button className="back-button" onClick={onBack}><ArrowLeft aria-hidden="true" /> Back to progress</button>
        <span className="eyebrow">PRACTICE · NO SCORE KEPT</span>
        <h1>Strengthen what slipped.</h1>
        <p>{questions.length} questions from the days that have not held: {days.map((day) => `Day ${day}`).join(", ")}. Nothing here is graded — it is here to be got wrong until it is not.</p>
      </section>
      <section className="recheck-body">
        {done ? (
          <div className="recheck-complete">
            <div className="recheck-seal"><RotateCcw aria-hidden="true" /></div>
            <span className="eyebrow">PRACTICE DONE</span>
            <h2>{right} of {questions.length} came back.</h2>
            <p>Every answer here updated how soon this material returns in your daily checks. What you missed will come back sooner.</p>
            <div className="practice-actions">
              <button className="primary-button" onClick={onAgain}>Practise again <ChevronRight aria-hidden="true" /></button>
              <button className="quiz-step" onClick={onBack}>Back to progress</button>
            </div>
          </div>
        ) : (
          <QuizRunner
            questions={questions}
            answers={answers}
            setAnswers={setAnswers}
            status="idle"
            onSubmit={onSubmit}
            onRetry={() => undefined}
            onAnswer={onAnswer}
            combo={combo}
            submitLabel="Finish practice"
          />
        )}
      </section>
    </div>
  );
}

/**
 * The Summit quest. Two trials taken in order: recall across every island,
 * then judgment with no lesson in front of you. Both run through the same
 * paginated check the rest of the course uses, so the capstone behaves like
 * everything that led to it.
 */
function SummitQuest({ data, activeTrial, answers, setAnswers, status, onOpenTrial, onSubmit, onRetry, onAnswer, combo, onLeaveTrial, onBack }: {
  data: AppData;
  activeTrial: number | null;
  answers: Record<number, number>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  status: "idle" | "failed" | "passed";
  onOpenTrial: (trial: number) => void;
  onSubmit: () => void;
  onRetry: () => void;
  onAnswer: (correct: boolean, question?: QuizQuestion) => void;
  combo: number;
  onLeaveTrial: () => void;
  onBack: () => void;
}) {
  const passed = data.trialsPassed ?? [];
  const questions = useMemo(() => (activeTrial === null ? [] : buildTrial(activeTrial)), [activeTrial]);
  const complete = data.finalTestComplete;

  if (activeTrial !== null) {
    const trial = finalTrials[activeTrial];
    return (
      <div className="final-test-shell">
        <section className="trial-run-head">
          <button className="back-button" onClick={onLeaveTrial}><ArrowLeft aria-hidden="true" /> Back to the Summit</button>
          <span className="eyebrow">TRIAL {String(activeTrial + 1).padStart(2, "0")} OF {String(finalTrials.length).padStart(2, "0")}</span>
          <h1>{trial.name}</h1>
          <p>{trial.blurb}</p>
          <span className="trial-bar"><Target aria-hidden="true" /> {passMark(questions.length)} of {questions.length} to pass</span>
        </section>
        <section className="recheck-body">
          <QuizRunner
            questions={questions}
            answers={answers}
            setAnswers={setAnswers}
            status={status}
            onSubmit={onSubmit}
            onRetry={onRetry}
            onAnswer={onAnswer}
            combo={combo}
            submitLabel={`Complete the ${trial.name}`}
          />
        </section>
      </div>
    );
  }

  return (
    <div className="final-test-shell">
      <section className="final-test-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(10,28,38,.86), rgba(10,28,38,.22)), url(${ISLAND_IMAGES[10]})` }}>
        <button className="back-button light" onClick={onBack}><ArrowLeft aria-hidden="true" /> Back to the world</button>
        <span className="eyebrow-light">THE CONNECTED WORLD</span>
        <h1>The Summit<br /><em>Quest.</em></h1>
        <p>Not a memory exam. Two trials stand at the end of the route: one asks whether the hundred days are still within reach, the other whether they changed how you decide.</p>
        <div className="final-progress">
          <span>{complete ? "QUEST COMPLETE" : `${passed.length} / ${finalTrials.length} TRIALS PASSED`}</span>
          <i style={{ width: `${(passed.length / finalTrials.length) * 100}%` }} />
        </div>
      </section>

      {complete ? (
        <section className="final-complete">
          <div className="summit-mark">✦</div>
          <span className="eyebrow">ROUTE INTEGRATED</span>
          <h2>The map is one world now.</h2>
          <p>You travelled a hundred days, held them together at the Summit, and showed sound judgment where no lesson was in front of you. Keep the route open: notice, choose, act, reflect, return.</p>
          <button className="primary-button" onClick={onBack}>Return to the connected world <ChevronRight aria-hidden="true" /></button>
        </section>
      ) : (
        <section className="trial-list">
          {finalTrials.map((trial, index) => {
            const done = passed.includes(trial.id);
            const locked = index > 0 && !passed.includes(finalTrials[index - 1].id);
            return (
              <article className={cn("trial-card", done && "done", locked && "locked")} key={trial.id}>
                <div className="trial-mark">{done ? <Check aria-hidden="true" /> : locked ? <Lock aria-hidden="true" /> : <Mountain aria-hidden="true" />}</div>
                <div className="trial-copy">
                  <span className="eyebrow">TRIAL {String(index + 1).padStart(2, "0")} · {trial.length} QUESTIONS</span>
                  <h2>{trial.name}</h2>
                  <p>{trial.blurb}</p>
                </div>
                {done
                  ? <span className="trial-state"><Check aria-hidden="true" /> Passed</span>
                  : locked
                    ? <span className="trial-state muted"><Lock aria-hidden="true" /> Opens after the first trial</span>
                    : <button className="primary-button" onClick={() => onOpenTrial(trial.id)}>Begin <ChevronRight aria-hidden="true" /></button>}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}

function AchievementsView({ achievements, data }: { achievements: ReturnType<typeof achievementList>; data: AppData }) {
  const earned = achievements.filter((achievement) => achievement.unlocked).length;
  return (
    <div className="view-stack">
      <section className="achievement-hero">
        <div><span className="eyebrow-light">MILESTONES, NOT A SCORECARD</span><h1>Notice the<br /><em>real work.</em></h1><p>Achievements mark meaningful learning and follow-through. They do not measure your worth.</p></div>
        <div className="badge-orbit"><img src={BADGE_URL} alt="" /><span>{earned}<small> / {achievements.length}</small></span></div>
      </section>
      <section className="achievement-grid" aria-label="Achievements">
        {achievements.map((achievement) => {
          const Icon = achievement.icon;
          return <article key={achievement.id} className={cn("achievement-card", achievement.unlocked && "earned")}><div className="achievement-icon"><Icon aria-hidden="true" /></div><div><span>{achievement.unlocked ? "EARNED" : "LOCKED"}</span><h2>{achievement.title}</h2><p>{achievement.detail}</p></div>{achievement.unlocked && <Check className="earned-check" aria-label="Earned" />}</article>;
        })}
      </section>
      <aside className="field-note-wide"><span>FIELD NOTE</span><p>“A kept small promise is stronger than an impressive broken one.”</p><i>Current accuracy: {calculateAccuracy(data)}%</i></aside>
    </div>
  );
}

function ProgressView({ data, coursePercent, accuracy, onPractise }: { data: AppData; coursePercent: number; accuracy: number; onPractise: () => void }) {
  const stats = [
    { label: "Steps travelled", value: `${data.completedDays.length}`, sub: "of 100 days", icon: Footprints, tone: "moss" },
    { label: "Understanding", value: `${accuracy}%`, sub: "quiz accuracy", icon: BookOpen, tone: "sky" },
    { label: "Actions named", value: `${Object.keys(data.actions).length}`, sub: "real-life steps", icon: Target, tone: "clay" },
    { label: "Hard bonuses", value: `${data.bonusDays.length}`, sub: "optional challenges", icon: Sparkles, tone: "gold" },
    { label: "Best run", value: `${data.bestCombo ?? 0}`, sub: "answers in a row", icon: Zap, tone: "gold" },
    { label: "Islands secured", value: `${Object.values(data.rechecks ?? {}).filter((entry) => entry.passed).length}`, sub: "rechecks passed", icon: Mountain, tone: "moss" },
  ];
  return (
    <div className="view-stack">
      <section className="view-heading progress-title"><div><span className="eyebrow">YOUR FIELD RECORD</span><h1>Progress that<br /><em>means something.</em></h1><p>The important number is not XP. It is how often learning became a useful action.</p></div><div className="course-ring" style={{ "--progress": `${coursePercent * 3.6}deg` } as React.CSSProperties}><strong>{coursePercent}%</strong><span>course</span></div></section>
      <section className="stat-grid">{stats.map(({ label, value, sub, icon: Icon, tone }) => <article className="stat-card" key={label}><div className={cn("mini-icon", tone)}><Icon aria-hidden="true" /></div><p>{label}</p><h2>{value}</h2><span>{sub}</span></article>)}</section>
      <section className="paper-card phase-progress-card"><div className="card-heading"><div><span className="eyebrow">TEN PHASES</span><h2>Your route through the course</h2></div><span className="route-small-label">{data.completedDays.length}/100</span></div><div className="phase-bars">{phases.map((phase, index) => { const count = phaseCompleteCount(data, index * 10 + 1); return <div className="phase-bar-row" key={phase.id}><div><span className={cn("phase-dot", phase.color)} /><p>{phase.shortTitle}</p></div><div className="phase-progress-track"><span className={cn("phase-progress-fill", phase.color)} style={{ width: `${count * 10}%` }} /></div><small>{count}/10</small></div>; })}</div></section>
      <RetentionRecord data={data} onPractise={onPractise} />
      <section className="reflection-card"><div><span className="eyebrow-light">REMEMBER</span><h2>“The route line moves because you moved.”</h2><p>If a day was missed, return to the current waypoint. Your path has not disappeared.</p></div><RotateCcw aria-hidden="true" /></section>
    </div>
  );
}

/**
 * What the hundred days actually left behind. Built from how earlier material
 * answered when it came back, not from how many days were ticked off.
 */
function RetentionRecord({ data, onPractise }: { data: AppData; onPractise: () => void }) {
  const days = data.completedDays;
  const counts = { strong: 0, holding: 0, shaky: 0, unseen: 0 } as Record<Strength, number>;
  for (const day of days) counts[recallStrength(data.recall?.[day])] += 1;
  const weak = weakestDays(data, 4);

  return (
    <section className="paper-card retention-card">
      <div className="card-heading">
        <div><span className="eyebrow">WHAT HAS HELD</span><h2>Retention, not completion</h2></div>
        <span className="route-small-label">{days.length} days behind you</span>
      </div>

      {days.length === 0 ? (
        <p className="retention-empty">Complete a day, and the material will start coming back in later checks. What you remember then is what shows up here.</p>
      ) : (
        <>
          <div className="retention-legend">
            {(["strong", "holding", "shaky", "unseen"] as Strength[]).map((key) => (
              <span key={key} className={cn("retention-key", key)}><i /> {strengthLabel[key]} · {counts[key]}</span>
            ))}
          </div>
          <div className="retention-grid" aria-label="Recall strength for each completed day">
            {days.map((day) => {
              const strength = recallStrength(data.recall?.[day]);
              return <span key={day} className={cn("retention-cell", strength)} title={`Day ${day}: ${strengthLabel[strength]}`}>{day}</span>;
            })}
          </div>
          {weak.length > 0 && (
            <div className="retention-weak">
              <p><strong>{weak.map((entry) => entry.day).sort((a, b) => a - b).map((day) => `Day ${day}`).join(", ")}</strong> {weak.length === 1 ? "has" : "have"} not held so far. They will come back sooner in your daily checks.</p>
              <button className="primary-button" onClick={onPractise}><RotateCcw aria-hidden="true" /> Practise these now</button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function TakeawaysView({ data, onStart }: { data: AppData; onStart: () => void }) {
  const items = Object.entries(data.takeaways).sort(([a], [b]) => Number(b) - Number(a));
  return (
    <div className="view-stack">
      <section className="view-heading"><div><span className="eyebrow">YOUR OWN WORDS</span><h1>Things worth<br /><em>carrying forward.</em></h1><p>Short reflections are not proof of learning. They are a place to keep what you want to remember.</p></div></section>
      {items.length ? <section className="takeaway-list">{items.map(([day, takeaway]) => <article className="takeaway-card" key={day}><div className="takeaway-day">{String(day).padStart(2, "0")}</div><div><span>{getLesson(Number(day)).title}</span><p>“{takeaway}”</p></div></article>)}</section> : <section className="empty-paper"><PencilLine aria-hidden="true" /><h2>Your margin notes will gather here.</h2><p>After you pass a lesson’s quiz, you can write one short thing you want to remember.</p><button className="primary-button" onClick={onStart}>Begin today’s lesson <ChevronRight aria-hidden="true" /></button></section>}
    </div>
  );
}

/**
 * The gate at the end of an island: eight questions drawn across its ten days,
 * so moving on takes the whole stretch rather than the most recent lesson.
 */
function RecheckView({ phase, data, answers, setAnswers, status, onSubmit, onRetry, onAnswer, combo, onBack, onContinue }: {
  phase: CoursePhase;
  data: AppData;
  answers: Record<number, number>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  status: "idle" | "failed" | "passed";
  onSubmit: () => void;
  onRetry: () => void;
  onAnswer: (correct: boolean, question?: QuizQuestion) => void;
  combo: number;
  onBack: () => void;
  onContinue: () => void;
}) {
  const questions = useMemo(() => buildRecheck(phase.id), [phase.id]);
  const alreadyPassed = recheckPassed(data, phase.id);
  const isLastIsland = phase.id === 10;

  return (
    <div className="recheck-shell">
      <section className="recheck-hero" style={{ backgroundImage: `linear-gradient(90deg, rgba(10,28,38,.86), rgba(10,28,38,.28)), url(${ISLAND_IMAGES[phase.id]})` }}>
        <button className="back-button light" onClick={onBack}><ArrowLeft aria-hidden="true" /> Back to the map</button>
        <span className="eyebrow-light">ISLAND {String(phase.id).padStart(2, "0")} RECHECK · {phase.range.toUpperCase()}</span>
        <h1>{phase.island}<br /><em>revisited.</em></h1>
        <p>Ten days are behind you. This recheck draws {RECHECK_LENGTH} questions from across the whole island, not just the last thing you read.</p>
        <div className="recheck-meta">
          <span><Mountain aria-hidden="true" /> {phase.landmark}</span>
          <span><Target aria-hidden="true" /> {passMark(questions.length)} of {questions.length} to pass</span>
        </div>
      </section>

      <section className="recheck-body">
        {status === "passed" || alreadyPassed ? (
          <div className="recheck-complete">
            <div className="recheck-seal"><Check aria-hidden="true" /></div>
            <span className="eyebrow">ISLAND SECURED</span>
            <h2>{phase.island} holds.</h2>
            <p>You carried {phase.title.toLowerCase()} across ten days and can still use it. The route runs on.</p>
            <button className="primary-button" onClick={onContinue}>
              {isLastIsland ? "Return to the world" : "Travel to the next island"} <ChevronRight aria-hidden="true" />
            </button>
          </div>
        ) : (
          <QuizRunner
            questions={questions}
            answers={answers}
            setAnswers={setAnswers}
            status={status}
            onSubmit={onSubmit}
            onRetry={onRetry}
            onAnswer={onAnswer}
            combo={combo}
            submitLabel="Complete the recheck"
          />
        )}
      </section>
    </div>
  );
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * One question at a time, with a route-shaped progress track. Shared by the
 * daily knowledge check and the island recheck, which differ only in length
 * and wording.
 */
function QuizRunner({ questions, answers, setAnswers, status, onSubmit, onRetry, onAnswer, combo, submitLabel }: {
  questions: QuizQuestion[];
  answers: Record<number, number>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  status: "idle" | "failed" | "passed";
  onSubmit: () => void;
  onRetry: () => void;
  onAnswer: (correct: boolean, question?: QuizQuestion) => void;
  combo: number;
  submitLabel: string;
}) {
  const [index, setIndex] = useState(0);
  const [strike, setStrike] = useState<number | null>(null);
  const [pulse, setPulse] = useState(0);
  const total = questions.length;
  const question = questions[index];
  const chosen = answers[index];
  const revealed = chosen !== undefined;
  const answeredCount = questions.filter((_, position) => answers[position] !== undefined).length;
  const correctCount = questions.filter((item, position) => answers[position] === item.answer).length;
  const isLast = index === total - 1;
  const allAnswered = answeredCount === total;

  if (status === "failed") {
    const missed = questions.map((item, position) => ({ item, position })).filter(({ item, position }) => answers[position] !== item.answer);
    return (
      <div className="quiz-review">
        <div className="quiz-review-head">
          <span className="eyebrow">REVIEW BEFORE YOU CONTINUE</span>
          <h3>{missed.length} of {total} need another look.</h3>
          <p>Understanding comes first. Read what each one was pointing at, then run the check again.</p>
        </div>
        <ol className="quiz-review-list">
          {missed.map(({ item, position }) => (
            <li key={item.question} style={{ animationDelay: `${Math.min(position, 8) * 45}ms` }}>
              <p className="review-question">{item.question}</p>
              <p className="review-answer"><Check aria-hidden="true" /> {item.options[item.answer]}</p>
              <p className="review-why">{item.explanation}</p>
            </li>
          ))}
        </ol>
        <button className="primary-button" onClick={() => { onRetry(); setIndex(0); }}>
          <RotateCcw aria-hidden="true" /> Run the check again
        </button>
      </div>
    );
  }

  function choose(optionIndex: number) {
    if (revealed) return;
    const correct = optionIndex === question.answer;
    setAnswers((current) => ({ ...current, [index]: optionIndex }));
    onAnswer(correct, question);
    setPulse((current) => current + 1);

    const nextCombo = correct ? combo + 1 : 0;
    const calm = prefersReducedMotion();
    if (correct && nextCombo > 0 && nextCombo % COMBO_STRIKE_EVERY === 0) {
      setStrike(nextCombo);
      window.setTimeout(() => setStrike(null), calm ? 900 : 1500);
    }
    if (!isLast) {
      // A miss lingers, so the explanation can actually be read.
      const wait = calm ? 400 : correct ? 950 : 2400;
      window.setTimeout(() => setIndex((current) => (current === index ? Math.min(total - 1, current + 1) : current)), wait);
    }
  }

  return (
    <div className={cn("quiz-runner", strike !== null && "striking")}>
      {strike !== null && (
        <div className="combo-strike" role="status">
          <svg viewBox="0 0 40 64" aria-hidden="true"><path d="M23 2 6 36h11l-4 26 21-36H23l4-24z" /></svg>
          <span>{strike} in a row</span>
          <small>+{strikeValue(strike)} XP</small>
        </div>
      )}

      <div className="quiz-track" aria-hidden="true">
        {questions.map((item, position) => (
          <i
            key={item.question}
            className={cn(
              "quiz-pip",
              answers[position] !== undefined && (answers[position] === item.answer ? "right" : "wrong"),
              position === index && "current",
            )}
          />
        ))}
      </div>

      <div className="quiz-counter">
        <span>Question {String(index + 1).padStart(2, "0")} of {String(total).padStart(2, "0")}</span>
        <span className={cn("combo-meter", combo > 0 && "lit", combo >= COMBO_STRIKE_EVERY && "hot")} key={pulse}>
          <Zap aria-hidden="true" /> {combo > 0 ? `${combo} in a row` : "no run yet"}
        </span>
      </div>

      <fieldset className="quiz-question" key={index}>
        {question.scope === "review" && <span className="review-flag"><RotateCcw aria-hidden="true" /> Back from an earlier day</span>}
        <legend>{question.question}</legend>
        <div className="quiz-options">
          {question.options.map((option, optionIndex) => (
            <label
              className={cn(
                "answer-option",
                chosen === optionIndex && "selected",
                revealed && optionIndex === question.answer && "is-right",
                revealed && chosen === optionIndex && optionIndex !== question.answer && "is-wrong",
                revealed && "locked",
              )}
              key={option}
              style={{ animationDelay: `${optionIndex * 55}ms` }}
            >
              <input
                type="radio"
                name={`question-${index}`}
                checked={chosen === optionIndex}
                disabled={revealed}
                onChange={() => choose(optionIndex)}
              />
              <span>{revealed && optionIndex === question.answer ? <Check aria-hidden="true" /> : revealed && chosen === optionIndex ? <X aria-hidden="true" /> : String.fromCharCode(65 + optionIndex)}</span>
              <p>{option}</p>
            </label>
          ))}
        </div>
        {revealed && (
          <p className={cn("answer-verdict", chosen === question.answer ? "right" : "wrong")}>
            {question.explanation}
          </p>
        )}
      </fieldset>

      <div className="quiz-controls">
        <button className="quiz-step" onClick={() => setIndex((current) => Math.max(0, current - 1))} disabled={index === 0}>
          <ArrowLeft aria-hidden="true" /> Back
        </button>
        {allAnswered ? (
          <button className="primary-button" onClick={onSubmit}>
            {submitLabel} · {correctCount}/{total} <ChevronRight aria-hidden="true" />
          </button>
        ) : (
          <button className="quiz-step forward" onClick={() => setIndex((current) => Math.min(total - 1, current + 1))} disabled={isLast}>
            Next <ChevronRight aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}
function LessonView({ lesson, quiz, stage, answers, setAnswers, quizStatus, onTakeQuiz, onSubmitQuiz, onRetryQuiz, onAnswer, combo, actionText, setActionText, takeawayText, setTakeawayText, bonusDone, setBonusDone, bonusNote, setBonusNote, completed, celebration, onFinish, onBack, onNext }: {
  lesson: Lesson; quiz: QuizQuestion[]; stage: LessonStage; answers: Record<number, number>; setAnswers: React.Dispatch<React.SetStateAction<Record<number, number>>>; quizStatus: "idle" | "failed" | "passed"; onTakeQuiz: () => void; onSubmitQuiz: () => void; onRetryQuiz: () => void; onAnswer: (correct: boolean, question?: QuizQuestion) => void; combo: number; actionText: string; setActionText: (value: string) => void; takeawayText: string; setTakeawayText: (value: string) => void; bonusDone: boolean; setBonusDone: (value: boolean) => void; bonusNote: string; setBonusNote: (value: string) => void; completed: boolean; celebration: string[]; onFinish: () => void; onBack: () => void; onNext: () => void;
}) {
  const quizOpen = stage === "quiz" || stage === "action" || stage === "complete";
  // The check is a retrieval test. While it is open the lesson is off the page,
  // because a question you can scroll up and answer proves nothing.
  const bookOpen = stage !== "quiz";
  const actionOpen = stage === "action" || stage === "complete";
  return (
    <div className="lesson-shell" key={lesson.day}>
      <div className="lesson-topline"><button className="back-button" onClick={onBack}><ArrowLeft aria-hidden="true" /> Back to today</button><span>DAY {String(lesson.day).padStart(2, "0")} / 100</span></div>
      <ol className="day-steps" aria-label="Today’s sequence">
        {([
          { key: "read", label: "Read", note: "Take in the idea" },
          { key: "quiz", label: "Recall", note: "Closed book" },
          { key: "action", label: "Apply", note: "Name a real step" },
          { key: "complete", label: "Reflect", note: "Carry it forward" },
        ] as { key: LessonStage; label: string; note: string }[]).map((step, index) => {
          const order: LessonStage[] = ["read", "quiz", "action", "complete"];
          const at = order.indexOf(stage);
          const here = order.indexOf(step.key);
          return (
            <li key={step.key} className={cn("day-step", here < at && "done", here === at && "current")}>
              <span className="day-step-mark">{here < at ? <Check aria-hidden="true" /> : index + 1}</span>
              <span className="day-step-label">{step.label}</span>
              <small>{step.note}</small>
            </li>
          );
        })}
      </ol>
      <section className="lesson-header"><div><p className="eyebrow">{lesson.phase.shortTitle.toUpperCase()} · {lesson.phase.range.toUpperCase()}</p><h1>{lesson.title}</h1>{bookOpen ? <p>{lesson.why}</p> : <p className="header-withheld">Answering from memory — the lesson returns when the check is done.</p>}</div><div className="lesson-waypoint"><span>{String(lesson.day).padStart(2, "0")}</span><i /></div></section>
      <div className="lesson-layout">
        <article className="lesson-page">
          {bookOpen && <><section className="lesson-section"><span className="section-index">01</span><div><p className="section-label">THE LESSON</p><p className="lesson-body">{lesson.lesson}</p></div></section>
          <section className="key-idea-block"><span className="section-label">KEY IDEA</span><p>{lesson.keyIdea}</p></section>
          <section className="lesson-section example-section"><span className="section-index">02</span><div><p className="section-label">IN REAL LIFE</p><p className="lesson-body">{lesson.example}</p></div></section></>}
          {stage === "quiz" && <section className="closed-book"><div className="closed-book-mark"><BookOpen aria-hidden="true" /></div><div><span className="eyebrow">BOOK CLOSED</span><h2>From memory now.</h2><p>The lesson is put away while you answer. If a question does not come back to you, that is the useful information — the review afterwards will show you what it was pointing at.</p></div></section>}
          {stage === "read" && <section className="understood-card"><div><span className="eyebrow">READY TO CONTINUE?</span><h2>You’ve learned it.<br />Now prove it.</h2><p>The quiz checks understanding before the day’s action unlocks.</p></div><button className="primary-button" onClick={onTakeQuiz}>Understood — take the quiz <ChevronRight aria-hidden="true" /></button></section>}

          {quizOpen && <section className="quiz-area" aria-labelledby="quiz-heading"><div className="quiz-heading"><div><span className="eyebrow">KNOWLEDGE CHECK · +10 XP</span><h2 id="quiz-heading">You’ve learned it. Now prove it.</h2></div>{stage !== "quiz" && <span className="passed-tag"><Check aria-hidden="true" /> Passed</span>}</div>
            {stage === "quiz" && <QuizRunner questions={quiz} answers={answers} setAnswers={setAnswers} status={quizStatus} onSubmit={onSubmitQuiz} onRetry={onRetryQuiz} onAnswer={onAnswer} combo={combo} submitLabel="Check my understanding" />}
          </section>}

          {actionOpen && <section className="action-area" aria-labelledby="action-heading"><div className="action-heading"><div className="action-icon"><Target aria-hidden="true" /></div><div><span className="eyebrow">TODAY’S ACTION · +20 XP</span><h2 id="action-heading">Now use it.</h2></div></div><p className="action-prompt">{lesson.actionPrompt}</p><p className="action-hint">{lesson.actionHint}</p>{!completed ? <textarea value={actionText} onChange={(event) => setActionText(event.target.value.slice(0, 300))} placeholder="Write the small action you will actually take…" aria-label="Today’s action" maxLength={300} /> : <div className="saved-note"><Check aria-hidden="true" /><p>{actionText}</p></div>}
            <div className="takeaway-row"><label htmlFor="takeaway"><span>OPTIONAL MARGIN NOTE</span><small>What will you remember?</small></label>{!completed ? <textarea id="takeaway" value={takeawayText} onChange={(event) => setTakeawayText(event.target.value.slice(0, 300))} placeholder="One sentence in your own words…" maxLength={300} /> : takeawayText ? <div className="saved-takeaway">“{takeawayText}”</div> : <p className="empty-note">No margin note recorded for this step.</p>}</div>
          </section>}

          {actionOpen && <section className="bonus-area"><div><span className="eyebrow">OPTIONAL HARD BONUS · +60 XP</span><h2>Push the idea into real life.</h2><p>{lesson.bonus}</p></div>{!completed ? <label className="bonus-toggle"><input type="checkbox" checked={bonusDone} onChange={(event) => setBonusDone(event.target.checked)} /><span><Check aria-hidden="true" /></span>I completed the hard bonus</label> : bonusDone ? <span className="bonus-earned"><Sparkles aria-hidden="true" /> Hard bonus recorded</span> : <span className="bonus-skip">Bonus skipped — the core day still counts.</span>}{bonusDone && !completed && <textarea value={bonusNote} onChange={(event) => setBonusNote(event.target.value.slice(0, 180))} placeholder="How did you apply the challenge?" aria-label="Hard bonus reflection" maxLength={180} />}</section>}
          {actionOpen && !completed && <button className="complete-button" onClick={onFinish}><span><Check aria-hidden="true" /></span> Complete Day {lesson.day}<small>Quiz + action required</small></button>}
          {completed && <section className="completion-card"><div className="completion-stamp"><Check aria-hidden="true" /></div><div><span className="eyebrow">DAY RECORDED</span><h2>{lesson.day === 100 ? "100 days complete. Your practice continues." : "One honest step travelled."}</h2><p>{lesson.day === 100 ? "Keep the method: learn, prove, act, reflect, and return." : "The reward is not the points—it is the part you carry into your real life."}</p>{celebration.map((item, position) => <span className="unlocked-line" key={item} style={{ animationDelay: `${240 + position * 160}ms` }}><Award aria-hidden="true" /> Achievement unlocked: {item}</span>)}</div><button className="primary-button" onClick={onNext}>{lesson.day === 100 ? "Return to your field guide" : "Continue the journey"}<ChevronRight aria-hidden="true" /></button></section>}
        </article>
        <aside className="lesson-margin"><div className="margin-progress"><span>DAY {String(lesson.day).padStart(2, "0")}</span><div><i style={{ height: `${Math.max(8, lesson.day)}%` }} /></div><span>100</span></div><div className="margin-note"><span>REMEMBER</span><p>Learning only matters when it changes how you live.</p></div><div className="xp-note"><Zap aria-hidden="true" /><span><strong>+{lesson.quiz.length ? 10 : 0} XP</strong> for understanding<br /><strong>+20 XP</strong> for action</span></div></aside>
      </div>
    </div>
  );
}
