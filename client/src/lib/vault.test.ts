import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BAR, MAX_LENGTH, MIN_LENGTH, SUPER_CAP, awardSuper, canOpen, canSpendSuper, cancelNext,
  carryOver, clampLength, daysBetween, daysUntilDue, dueOn, isDue, isOpen, isPerfect, makeKey,
  meetsBar, newVault, noteOpened, openedOn, opensInLast, prepareNext, spendSuper, vaultLine,
  type Vault,
} from "./vault";

/** Deterministic bytes, so a generated key can be asserted exactly. */
const fakeCrypto = (...bytes: number[]): Crypto => {
  let next = 0;
  return {
    getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
      const view = array as unknown as Uint8Array;
      for (let i = 0; i < view.length; i++) view[i] = bytes[next++ % bytes.length];
      return array;
    },
  } as Crypto;
};

const at = (today: string, overrides: Partial<Vault> = {}): Vault => ({
  key: "BCDFGHJK", since: today, next: null, rotationDays: 7, length: 8, openedOn: [],
  supers: 0, superEarnedOn: [], superSpentOn: [], ...overrides,
});

describe("the key the blocker will accept", () => {
  it("uses only letters, because the blocker refuses digits", () => {
    for (let run = 0; run < 40; run++) expect(makeKey()).toMatch(/^[A-Z]{8}$/);
  });

  it("contains no vowels, so a key never spells a word worth remembering", () => {
    for (let run = 0; run < 40; run++) expect(makeKey()).not.toMatch(/[AEIOU]/);
  });

  it("stays inside the length the blocker allows", () => {
    expect(makeKey(1)).toHaveLength(MIN_LENGTH);
    expect(makeKey(99)).toHaveLength(MAX_LENGTH);
    expect(makeKey(6)).toHaveLength(6);
  });

  it("clamps a nonsense length rather than producing an unusable key", () => {
    expect(clampLength(0)).toBe(MIN_LENGTH);
    expect(clampLength(200)).toBe(MAX_LENGTH);
    expect(clampLength(5.4)).toBe(5);
  });

  it("maps random bytes onto the alphabet", () => {
    // Byte 0 -> B, byte 1 -> C. The point is that it reads the source given.
    expect(makeKey(4, fakeCrypto(0, 1, 0, 1))).toBe("BCBC");
  });

  it("does not hand out the same key twice in a row", () => {
    const keys = new Set(Array.from({ length: 50 }, () => makeKey()));
    expect(keys.size).toBeGreaterThan(45);
  });
});

describe("the bar the lesson has to clear", () => {
  it("opens at or above three quarters", () => {
    expect(meetsBar({ score: 9, outOf: 12 })).toBe(true);
    expect(meetsBar({ score: 12, outOf: 12 })).toBe(true);
  });

  it("stays shut below it", () => {
    expect(meetsBar({ score: 8, outOf: 12 })).toBe(false);
  });

  it("refuses a result that has not happened", () => {
    expect(meetsBar(undefined)).toBe(false);
    expect(meetsBar({ score: 0, outOf: 0 })).toBe(false);
  });

  it("refuses impossible results rather than trusting them", () => {
    // A stored score larger than the test would otherwise open the vault.
    expect(meetsBar({ score: 20, outOf: 12 })).toBe(false);
    expect(meetsBar({ score: -1, outOf: 12 })).toBe(false);
    expect(meetsBar({ score: NaN, outOf: 12 })).toBe(false);
  });

  it("accepts a different bar when one is given", () => {
    expect(meetsBar({ score: 6, outOf: 12 }, 0.5)).toBe(true);
    expect(meetsBar({ score: 6, outOf: 12 }, DEFAULT_BAR)).toBe(false);
  });
});

describe("when the key is due to be replaced", () => {
  it("counts whole days between two dates", () => {
    expect(daysBetween("2026-03-01", "2026-03-08")).toBe(7);
    expect(daysBetween("2026-03-08", "2026-03-01")).toBe(-7);
    expect(daysBetween("2026-02-26", "2026-03-01")).toBe(3); // across a month end
  });

  it("falls due a week after it was carried across", () => {
    const vault = at("2026-03-01");
    expect(dueOn(vault)).toBe("2026-03-08");
    expect(isDue(vault, "2026-03-07")).toBe(false);
    expect(isDue(vault, "2026-03-08")).toBe(true);
    expect(isDue(vault, "2026-03-20")).toBe(true);
  });

  it("reports how long is left", () => {
    expect(daysUntilDue(at("2026-03-01"), "2026-03-05")).toBe(3);
    expect(daysUntilDue(at("2026-03-01"), "2026-03-09")).toBe(-1);
  });

  it("never falls due when rotation is switched off", () => {
    const vault = at("2026-03-01", { rotationDays: null });
    expect(dueOn(vault)).toBeNull();
    expect(daysUntilDue(vault, "2030-01-01")).toBeNull();
    expect(isDue(vault, "2030-01-01")).toBe(false);
  });
});

describe("handing a new key over", () => {
  it("keeps the old key working until the new one is actually entered", () => {
    // The app cannot see the blocker. Swapping early would lock the learner
    // out of something they earned.
    const ready = prepareNext(at("2026-03-01"));
    expect(ready.next).toMatch(/^[A-Z]{8}$/);
    expect(ready.key).toBe("BCDFGHJK");
  });

  it("does not replace a waiting key that may already be written down", () => {
    const first = prepareNext(at("2026-03-01"));
    expect(prepareNext(first).next).toBe(first.next);
  });

  it("promotes the waiting key once it has been carried across", () => {
    const ready = prepareNext(at("2026-03-01"));
    const done = carryOver(ready, "2026-03-08");
    expect(done.key).toBe(ready.next);
    expect(done.next).toBeNull();
    expect(done.since).toBe("2026-03-08");
    expect(isDue(done, "2026-03-08")).toBe(false);
  });

  it("does nothing when there is no waiting key", () => {
    const vault = at("2026-03-01");
    expect(carryOver(vault, "2026-03-08")).toBe(vault);
  });

  it("can abandon a handover that did not happen", () => {
    const ready = prepareNext(at("2026-03-01"));
    const cancelled = cancelNext(ready);
    expect(cancelled.next).toBeNull();
    expect(cancelled.key).toBe("BCDFGHJK");
  });

  it("keeps the record of opens across a replacement", () => {
    // The record describes the learner, not the key.
    const used = noteOpened(at("2026-03-01"), "2026-03-04");
    expect(carryOver(prepareNext(used), "2026-03-08").openedOn).toEqual(["2026-03-04"]);
  });
});

describe("opening the vault", () => {
  it("opens only on a day that was passed", () => {
    expect(canOpen({ score: 9, outOf: 12 })).toBe(true);
    expect(canOpen({ score: 5, outOf: 12 })).toBe(false);
    expect(canOpen(undefined)).toBe(false);
  });

  it("records the date it was handed over", () => {
    expect(openedOn(noteOpened(at("2026-03-01"), "2026-03-04"), "2026-03-04")).toBe(true);
  });

  it("counts one open per day however many times it is looked at", () => {
    let vault = at("2026-03-01");
    for (let i = 0; i < 5; i++) vault = noteOpened(vault, "2026-03-04");
    expect(vault.openedOn).toEqual(["2026-03-04"]);
  });

  it("counts opens inside the last week only", () => {
    const vault = at("2026-03-01", {
      openedOn: ["2026-02-20", "2026-03-02", "2026-03-03", "2026-03-06"],
    });
    expect(opensInLast(vault, "2026-03-06")).toBe(3);
    expect(opensInLast(vault, "2026-03-06", 30)).toBe(4);
  });

  it("ignores dates in the future when counting", () => {
    const vault = at("2026-03-01", { openedOn: ["2026-03-20"] });
    expect(opensInLast(vault, "2026-03-06")).toBe(0);
  });
});

describe("what Sly says at the vault", () => {
  it("explains that a waiting key is not the password yet", () => {
    const line = vaultLine(prepareNext(at("2026-03-01")), { score: 12, outOf: 12 }, "2026-03-08", 40);
    expect(line).toMatch(/new key waiting/i);
  });

  it("warns when the key is due, because memorising it is the failure mode", () => {
    expect(vaultLine(at("2026-03-01"), { score: 12, outOf: 12 }, "2026-03-08", 40))
      .toMatch(/due to be replaced/i);
  });

  it("names what is missing rather than repeating that it is shut", () => {
    const line = vaultLine(at("2026-03-01"), { score: 5, outOf: 12 }, "2026-03-03", 40);
    expect(line).toContain("5 out of 12");
    expect(line).toContain("9"); // ceil(12 * 0.75)
    expect(line).toMatch(/taken again/i);
  });

  it("points at the day when the check has not been attempted", () => {
    expect(vaultLine(at("2026-03-01"), undefined, "2026-03-03", 41)).toMatch(/Day 41 first/);
  });

  it("hands it over without ceremony when the day was passed", () => {
    expect(vaultLine(at("2026-03-01"), { score: 10, outOf: 12 }, "2026-03-03", 40))
      .toMatch(/you did the day first/i);
  });

  it("mentions a heavy week as information, not as a telling-off", () => {
    const vault = at("2026-03-01", {
      openedOn: ["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05"],
    });
    const line = vaultLine(vault, { score: 10, outOf: 12 }, "2026-03-05", 40);
    expect(line).toContain("5 days this week");
    expect(line).toMatch(/not worth a lecture/i);
  });
});

describe("a fresh vault", () => {
  it("starts with a key already in it and nothing waiting", () => {
    const vault = newVault("2026-03-01");
    expect(vault.key).toMatch(/^[A-Z]{8}$/);
    expect(vault.next).toBeNull();
    expect(vault.since).toBe("2026-03-01");
    expect(vault.openedOn).toEqual([]);
  });

  it("can be set to a shorter key, or to never rotate", () => {
    expect(newVault("2026-03-01", null, 5).key).toHaveLength(5);
    expect(dueOn(newVault("2026-03-01", null, 5))).toBeNull();
  });
});

describe("super keys", () => {
  const perfect = { score: 12, outOf: 12 };
  const partial = { score: 9, outOf: 12 };
  const failed = { score: 4, outOf: 12 };

  it("recognises a perfect check, and only a real one", () => {
    expect(isPerfect(perfect)).toBe(true);
    expect(isPerfect(partial)).toBe(false);
    expect(isPerfect({ score: 0, outOf: 0 })).toBe(false);
    expect(isPerfect(undefined)).toBe(false);
  });

  it("banks one for a perfect day", () => {
    expect(awardSuper(at("2026-03-01"), "2026-03-03", perfect).supers).toBe(1);
  });

  it("banks nothing for a day that merely passed", () => {
    expect(awardSuper(at("2026-03-01"), "2026-03-03", partial).supers).toBe(0);
  });

  it("banks one per day however many times the day is recorded", () => {
    let vault = at("2026-03-01");
    for (let i = 0; i < 4; i++) vault = awardSuper(vault, "2026-03-03", perfect);
    expect(vault.supers).toBe(1);
  });

  it("stops at the cap, so a strong fortnight cannot buy out the gate", () => {
    let vault = at("2026-03-01");
    for (let day = 1; day <= 10; day++) vault = awardSuper(vault, `2026-03-${String(day).padStart(2, "0")}`, perfect);
    expect(vault.supers).toBe(SUPER_CAP);
  });

  it("opens a failed day when one is spent", () => {
    const held = at("2026-03-01", { supers: 2 });
    expect(isOpen(held, failed, "2026-03-03")).toBe(false);
    const spent = spendSuper(held, "2026-03-03", failed);
    expect(spent.supers).toBe(1);
    expect(isOpen(spent, failed, "2026-03-03")).toBe(true);
  });

  it("refuses to burn one on a day that is already open", () => {
    const held = at("2026-03-01", { supers: 2 });
    expect(spendSuper(held, "2026-03-03", partial)).toBe(held);
    expect(canSpendSuper(held, partial, "2026-03-03")).toBe(false);
  });

  it("refuses to spend one that is not held", () => {
    const empty = at("2026-03-01");
    expect(spendSuper(empty, "2026-03-03", failed)).toBe(empty);
    expect(canSpendSuper(empty, failed, "2026-03-03")).toBe(false);
  });

  it("cannot be spent twice on the same day", () => {
    const held = at("2026-03-01", { supers: 3 });
    const once = spendSuper(held, "2026-03-03", failed);
    expect(spendSuper(once, "2026-03-03", failed)).toBe(once);
  });

  it("only opens the day it was spent on", () => {
    const spent = spendSuper(at("2026-03-01", { supers: 1 }), "2026-03-03", failed);
    expect(isOpen(spent, failed, "2026-03-04")).toBe(false);
  });

  it("says a super was what opened it", () => {
    const spent = spendSuper(at("2026-03-01", { supers: 1 }), "2026-03-03", failed);
    expect(vaultLine(spent, failed, "2026-03-03", 40)).toMatch(/on a super key/i);
  });

  it("mentions the banked key when a day falls short", () => {
    const line = vaultLine(at("2026-03-01", { supers: 2 }), failed, "2026-03-03", 40);
    expect(line).toMatch(/holding 2/);
  });

  it("says nothing about supers when none are held", () => {
    expect(vaultLine(at("2026-03-01"), failed, "2026-03-03", 40)).not.toMatch(/holding/);
  });

  it("notes the bank on a perfect day", () => {
    expect(vaultLine(at("2026-03-01"), perfect, "2026-03-03", 40)).toMatch(/banks a super key/i);
  });

  it("keeps banked keys across a rotation", () => {
    const held = at("2026-03-01", { supers: 2 });
    expect(carryOver(prepareNext(held), "2026-03-08").supers).toBe(2);
  });
});
