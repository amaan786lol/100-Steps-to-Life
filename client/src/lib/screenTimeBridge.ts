/**
 * Talking to the Android companion app, when there is one.
 *
 * A web page cannot read system-wide screen time. No permission, no API and no
 * amount of JavaScript changes that — the numbers can only come from an
 * installed Android app holding Usage Access. So this module has exactly two
 * jobs: use the native bridge when the course is running inside that app, and
 * say plainly that it is not available when it is not.
 *
 * The bridge is `window.HundredStepsScreenTime`, bound by the WebView. It hands
 * over raw [start, end] pairs; the merging, clipping and day arithmetic all
 * live in `screenTimeUsage.ts`, which is tested independently of any of this.
 */

import { activeMinutes, todayWindow, type UsageInterval } from "./screenTimeUsage";

/** What the Kotlin side exposes. Every method is synchronous across the bridge. */
type NativeScreenTime = {
  hasPermission(): boolean;
  requestPermission(): void;
  readUsage(start: number, end: number): string;
};

declare global {
  interface Window {
    HundredStepsScreenTime?: Partial<NativeScreenTime>;
  }
}

export type BridgeState =
  /** A plain browser. Nothing to grant, nothing to fix. */
  | { kind: "unavailable" }
  /** In the app, but Usage Access has not been granted yet. */
  | { kind: "needs-permission" }
  | { kind: "ready" };

const bridge = (): Partial<NativeScreenTime> | undefined =>
  typeof window === "undefined" ? undefined : window.HundredStepsScreenTime;

/**
 * Whether the full bridge is present. Each method is checked rather than the
 * object alone: a partially injected bridge should read as absent rather than
 * fail later, mid-call.
 */
export function isNativeAvailable(): boolean {
  const native = bridge();
  return Boolean(
    native &&
      typeof native.hasPermission === "function" &&
      typeof native.readUsage === "function" &&
      typeof native.requestPermission === "function",
  );
}

export function bridgeState(): BridgeState {
  if (!isNativeAvailable()) return { kind: "unavailable" };
  try {
    return bridge()!.hasPermission!() ? { kind: "ready" } : { kind: "needs-permission" };
  } catch {
    // A bridge that throws is a bridge that cannot be relied on.
    return { kind: "unavailable" };
  }
}

/** Send the learner to the Settings screen where Usage Access is granted. */
export function requestPermission(): boolean {
  if (!isNativeAvailable()) return false;
  try {
    bridge()!.requestPermission!();
    return true;
  } catch {
    return false;
  }
}

/**
 * Parse what the bridge returns: `[[start,end],...]`.
 *
 * Anything malformed is dropped rather than repaired. A usage figure built from
 * a guess is worse than no figure, because it looks exactly as trustworthy as a
 * real one.
 */
export function parseIntervals(raw: string): UsageInterval[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((pair): pair is [number, number] =>
        Array.isArray(pair) &&
        pair.length === 2 &&
        typeof pair[0] === "number" &&
        typeof pair[1] === "number" &&
        Number.isFinite(pair[0]) &&
        Number.isFinite(pair[1]))
      .map(([start, end]) => ({ start, end }));
  } catch {
    return [];
  }
}

/** Raw intervals for a window, or null when they cannot be read at all. */
export function readUsage(window: { start: number; end: number }): UsageInterval[] | null {
  if (bridgeState().kind !== "ready") return null;
  try {
    return parseIntervals(bridge()!.readUsage!(window.start, window.end));
  } catch {
    return null;
  }
}

/**
 * Today's total in whole minutes, or null when it is not measurable.
 *
 * null and 0 mean different things and are kept apart deliberately: null is
 * "this device will not tell us", 0 is "you have not picked up your phone".
 */
export function readTodayMinutes(now = new Date()): number | null {
  const window = todayWindow(now);
  const intervals = readUsage(window);
  return intervals === null ? null : activeMinutes(intervals, window);
}

/** What to tell the learner about why there is no figure. */
export function explainState(state: BridgeState): string {
  switch (state.kind) {
    case "ready":
      return "Reading this device's screen time.";
    case "needs-permission":
      return "Grant Usage Access and the figure appears here. Nothing leaves the device.";
    default:
      return "Screen time can only be read by the Android app. A web page has no way to see it, whatever permissions you grant elsewhere.";
  }
}
