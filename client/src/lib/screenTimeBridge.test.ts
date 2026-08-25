// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bridgeState,
  explainState,
  isNativeAvailable,
  parseIntervals,
  readTodayMinutes,
  readUsage,
  requestPermission,
} from "./screenTimeBridge";

type Native = NonNullable<Window["HundredStepsScreenTime"]>;

const install = (native: Native) => {
  window.HundredStepsScreenTime = native;
};

const working = (usage: string, granted = true): Native => ({
  hasPermission: () => granted,
  requestPermission: vi.fn(),
  readUsage: () => usage,
});

afterEach(() => {
  delete window.HundredStepsScreenTime;
});

describe("finding the bridge", () => {
  it("is absent in a plain browser", () => {
    expect(isNativeAvailable()).toBe(false);
    expect(bridgeState()).toEqual({ kind: "unavailable" });
  });

  it("treats a half-injected bridge as absent", () => {
    // Better to read as "not available" now than to fail mid-call later.
    install({ hasPermission: () => true } as Native);
    expect(isNativeAvailable()).toBe(false);
    expect(bridgeState()).toEqual({ kind: "unavailable" });
  });

  it("treats a bridge that throws as absent", () => {
    install({ hasPermission: () => { throw new Error("gone"); }, requestPermission: vi.fn(), readUsage: () => "[]" });
    expect(bridgeState()).toEqual({ kind: "unavailable" });
  });

  it("separates 'no permission yet' from 'no bridge'", () => {
    install(working("[]", false));
    expect(bridgeState()).toEqual({ kind: "needs-permission" });
  });

  it("is ready once access is granted", () => {
    install(working("[]"));
    expect(bridgeState()).toEqual({ kind: "ready" });
  });
});

describe("asking for access", () => {
  it("opens the settings screen when it can", () => {
    const native = working("[]", false);
    install(native);
    expect(requestPermission()).toBe(true);
    expect(native.requestPermission).toHaveBeenCalled();
  });

  it("reports honestly when there is nothing to ask", () => {
    expect(requestPermission()).toBe(false);
  });
});

describe("parsing what comes back", () => {
  it("reads pairs into intervals", () => {
    expect(parseIntervals("[[10,20],[30,45]]")).toEqual([{ start: 10, end: 20 }, { start: 30, end: 45 }]);
  });

  it("reads an empty result as no usage", () => {
    expect(parseIntervals("[]")).toEqual([]);
  });

  it("drops malformed pairs rather than repairing them", () => {
    // A figure built from a guess looks exactly as trustworthy as a real one,
    // which is what makes guessing worse than reporting nothing.
    const raw = JSON.stringify([[10, 20], [30], ["a", "b"], [null, 5], [1, 2, 3], { start: 1, end: 2 }, [40, 50]]);
    expect(parseIntervals(raw)).toEqual([{ start: 10, end: 20 }, { start: 40, end: 50 }]);
  });

  it("survives outright rubbish", () => {
    expect(parseIntervals("not json")).toEqual([]);
    expect(parseIntervals("null")).toEqual([]);
    expect(parseIntervals('{"nope":true}')).toEqual([]);
    expect(parseIntervals("")).toEqual([]);
  });

  it("rejects non-finite numbers", () => {
    expect(parseIntervals('[[1,null],[2,"x"]]')).toEqual([]);
  });
});

describe("reading a window", () => {
  it("returns null rather than zero when it cannot read", () => {
    // null is "this device will not tell us"; 0 is "you did not pick it up".
    expect(readUsage({ start: 0, end: 100 })).toBeNull();
    install(working("[]", false));
    expect(readUsage({ start: 0, end: 100 })).toBeNull();
  });

  it("returns intervals when it can", () => {
    install(working("[[10,20]]"));
    expect(readUsage({ start: 0, end: 100 })).toEqual([{ start: 10, end: 20 }]);
  });

  it("returns null if the call itself fails", () => {
    install({ hasPermission: () => true, requestPermission: vi.fn(), readUsage: () => { throw new Error("revoked"); } });
    expect(readUsage({ start: 0, end: 100 })).toBeNull();
  });
});

describe("today's total", () => {
  const nineAm = new Date(2026, 2, 10, 9, 0, 0);
  const at = (hour: number, minute = 0) => new Date(2026, 2, 10, hour, minute).getTime();

  it("is null with no bridge", () => {
    expect(readTodayMinutes(nineAm)).toBeNull();
  });

  it("adds the day's intervals", () => {
    install(working(JSON.stringify([[at(7), at(7, 30)], [at(8), at(8, 15)]])));
    expect(readTodayMinutes(nineAm)).toBe(45);
  });

  it("does not double-count two apps in the same minutes", () => {
    // The whole reason the native side sends raw intervals rather than totals.
    install(working(JSON.stringify([[at(7), at(8)], [at(7, 30), at(8, 30)]])));
    expect(readTodayMinutes(nineAm)).toBe(90);
  });

  it("counts only the part of an overnight session that falls today", () => {
    const lastNight = new Date(2026, 2, 9, 23, 0).getTime();
    install(working(JSON.stringify([[lastNight, at(0, 40)]])));
    expect(readTodayMinutes(nineAm)).toBe(40);
  });

  it("reports a genuine zero as zero, not as unknown", () => {
    install(working("[]"));
    expect(readTodayMinutes(nineAm)).toBe(0);
  });
});

describe("what the learner is told", () => {
  it("does not pretend a web page could ever read this", () => {
    const message = explainState({ kind: "unavailable" });
    expect(message).toMatch(/Android app/);
    expect(message).toMatch(/no way to see it/i);
  });

  it("says what to do when access is only ungranted", () => {
    expect(explainState({ kind: "needs-permission" })).toMatch(/Usage Access/);
    expect(explainState({ kind: "needs-permission" })).toMatch(/leaves the device/);
  });
});
