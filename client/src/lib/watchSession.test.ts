import { describe, expect, it } from "vitest";
import {
  countShort,
  defaultWatchSettings,
  endSession,
  interruptionDue,
  interruptionLine,
  markInterruptionShown,
  noteActivity,
  reportOf,
  sessionMinutes,
  settleIdle,
  shortsWatched,
  startSession,
  unaccountedMinutes,
  type WatchSettings,
} from "./watchSession";

const settings: WatchSettings = defaultWatchSettings;
const t0 = new Date(2026, 2, 10, 19, 0, 0).getTime();
const mins = (n: number) => n * 60_000;
const at = (n: number) => t0 + mins(n);

/** A session with `count` distinct shorts, each one minute apart. */
const withShorts = (count: number) => {
  let session = startSession(t0);
  for (let index = 0; index < count; index++) session = countShort(session, `s${index}`, at(index + 1));
  return session;
};

describe("counting a session", () => {
  it("counts from the start until done browsing", () => {
    const session = endSession(noteActivity(startSession(t0), at(40)), at(42));
    expect(sessionMinutes(session, settings, at(300))).toBe(42);
  });

  it("keeps counting while it is still open", () => {
    const session = noteActivity(startSession(t0), at(8));
    expect(sessionMinutes(session, settings, at(10))).toBe(10);
  });

  it("does not bill an evening for a forgotten button", () => {
    // The whole reason "done browsing" is not the only way a session ends.
    const session = noteActivity(startSession(t0), at(12));
    expect(sessionMinutes(session, settings, at(300))).toBe(12);
  });

  it("closes an abandoned session at the last real activity", () => {
    const settled = settleIdle(noteActivity(startSession(t0), at(12)), settings, at(300));
    expect(settled.endedAt).toBe(at(12));
    expect(settled.endedBy).toBe("idle");
  });

  it("leaves a session alone while the gap is still short", () => {
    const session = noteActivity(startSession(t0), at(10));
    expect(settleIdle(session, settings, at(13)).endedAt).toBeUndefined();
  });

  it("treats counting a short as activity in itself", () => {
    // Watching without touching anything else must not look like idleness.
    let session = startSession(t0);
    session = countShort(session, "a", at(4));
    session = countShort(session, "b", at(8));
    expect(settleIdle(session, settings, at(10)).endedAt).toBeUndefined();
    expect(sessionMinutes(session, settings, at(10))).toBe(10);
  });

  it("does not let a stale timestamp drag activity backwards", () => {
    // An event arriving with an older timestamp than one already recorded must
    // not age the session towards being called idle.
    const session = noteActivity(noteActivity(startSession(t0), at(3)), t0 - mins(50));
    expect(session.lastActivityAt).toBe(at(3));
    expect(sessionMinutes(session, settings, at(4))).toBe(4);
  });

  it("closes at exactly the cutoff, not a moment later", () => {
    const session = noteActivity(startSession(t0), at(10));
    expect(settleIdle(session, settings, at(15)).endedBy).toBe("idle");
    expect(settleIdle(session, settings, at(14)).endedBy).toBeUndefined();
  });

  it("ignores anything after it is closed", () => {
    const done = endSession(startSession(t0), at(20));
    expect(countShort(done, "late", at(25))).toEqual(done);
    expect(noteActivity(done, at(25))).toEqual(done);
    expect(endSession(done, at(30)).endedAt).toBe(at(20));
  });
});

describe("counting shorts", () => {
  it("counts each one", () => {
    expect(shortsWatched(withShorts(7))).toBe(7);
  });

  it("does not count the same short twice", () => {
    // Scrolling back to one you already saw is not a new short.
    let session = countShort(startSession(t0), "abc", at(1));
    session = countShort(session, "abc", at(2));
    expect(shortsWatched(session)).toBe(1);
  });

  it("ignores a missing id rather than counting a phantom", () => {
    expect(shortsWatched(countShort(startSession(t0), "", at(1)))).toBe(0);
  });
});

describe("when Sly steps in", () => {
  it("stays away until the fifth", () => {
    for (const count of [0, 1, 4]) expect(interruptionDue(withShorts(count), settings).due).toBe(false);
    expect(interruptionDue(withShorts(5), settings).due).toBe(true);
  });

  it("appears for fifteen seconds", () => {
    expect(interruptionDue(withShorts(5), settings).seconds).toBe(15);
  });

  it("does not fire twice for the same five", () => {
    const session = markInterruptionShown(withShorts(5));
    expect(interruptionDue(session, settings).due).toBe(false);
    expect(interruptionDue(markInterruptionShown(withShorts(9)), settings).due).toBe(false);
  });

  it("comes back at the tenth, and only once for it", () => {
    const afterFifth = markInterruptionShown(withShorts(5));
    expect(interruptionDue(afterFifth, settings).due).toBe(false);

    // The same session reaching ten owes one more.
    const reachedTen = { ...markInterruptionShown(withShorts(10)) };
    expect(interruptionDue(reachedTen, settings).due).toBe(true);
    expect(interruptionDue(markInterruptionShown(reachedTen), settings).due).toBe(false);
  });

  it("catches up if several went by at once", () => {
    // Ten shorts with nothing shown yet still owes an interruption.
    expect(interruptionDue(withShorts(10), settings).due).toBe(true);
  });

  it("stays away once the session is closed", () => {
    expect(interruptionDue(endSession(withShorts(5), at(9)), settings).due).toBe(false);
  });

  it("survives a nonsense setting rather than dividing by zero", () => {
    const broken = { ...settings, shortsPerInterruption: 0, interruptionSeconds: 0 };
    expect(interruptionDue(withShorts(1), broken).due).toBe(true);
    expect(interruptionDue(withShorts(1), broken).seconds).toBe(1);
  });

  it("puts the number in front of you without scolding", () => {
    for (const count of [5, 10, 25, 60]) {
      expect(interruptionLine(count)).not.toMatch(/fail|lazy|wasted|should have|bad|shame|addict|disgrace/i);
      expect(interruptionLine(count)).toContain(String(count));
    }
  });
});

describe("what gets reported back", () => {
  const localDay = () => "2026-03-10";

  it("reports nothing while the session is still open", () => {
    expect(reportOf(noteActivity(startSession(t0), at(5)), settings, at(6), localDay)).toBeNull();
  });

  it("reports the total and the shorts once done", () => {
    const session = endSession(withShorts(6), at(30));
    const report = reportOf(session, settings, at(31), localDay);
    expect(report).toMatchObject({ date: "2026-03-10", minutes: 30, shorts: 6, endedBy: "done" });
  });

  it("says when a session timed out rather than being closed", () => {
    // Worth recording honestly: an idle-closed session is a weaker reading.
    const report = reportOf(withShorts(3), settings, at(300), localDay);
    expect(report).toMatchObject({ minutes: 3, endedBy: "idle" });
  });

  it("files the session under the day it began", () => {
    // A session running past midnight belongs to the evening it started in.
    const report = reportOf(endSession(startSession(t0), at(400)), settings, at(401), () => "2026-03-10");
    expect(report?.date).toBe("2026-03-10");
  });
});

describe("time nothing accounts for", () => {
  it("names what the browser could not see", () => {
    // Watching in a native app is invisible here. Letting that time vanish
    // would leave a heavy day looking clean.
    expect(unaccountedMinutes(300, 120)).toBe(180);
  });

  it("is nothing when the sessions cover the day", () => {
    expect(unaccountedMinutes(120, 120)).toBe(0);
  });

  it("never goes negative when the two disagree slightly", () => {
    expect(unaccountedMinutes(100, 130)).toBe(0);
  });

  it("is unknown when the phone was never measured", () => {
    expect(unaccountedMinutes(null, 120)).toBeNull();
  });
});
