import { describe, expect, it } from "vitest";
import {
  CODE_LENGTH,
  DEFAULT_BAR,
  codeFor,
  gateIsOpen,
  gateLine,
  meetsBar,
  newSecret,
  noteMiss,
  normalise,
  openGate,
  verifyCode,
} from "./passcode";

const secret = "ABCDEFGH1234567JKMNP";
const today = "2026-03-10";

describe("earning the code", () => {
  it("wants three quarters right", () => {
    expect(DEFAULT_BAR).toBe(0.75);
    expect(meetsBar({ score: 9, outOf: 12 })).toBe(true);
    expect(meetsBar({ score: 8, outOf: 12 })).toBe(false);
  });

  it("counts exactly the bar as passed", () => {
    expect(meetsBar({ score: 3, outOf: 4 })).toBe(true);
  });

  it("does not hand out a code for a test that never happened", () => {
    // An empty test passing vacuously would be the easiest possible cheat.
    expect(meetsBar({ score: 0, outOf: 0 })).toBe(false);
    expect(meetsBar({ score: Number.NaN, outOf: 10 })).toBe(false);
  });
});

describe("the code itself", () => {
  it("is six characters from an unambiguous alphabet", async () => {
    const code = await codeFor(secret, today, 12);
    expect(code).toHaveLength(CODE_LENGTH);
    // No I, L, O or U: the first three are misread, the last spells things.
    expect(code).toMatch(/^[0-9A-HJ-KM-NP-TV-Z]{6}$/);
  });

  it("is the same code on both sides, given the same day", async () => {
    // The whole point: the course and the script derive it separately.
    expect(await codeFor(secret, today, 12)).toBe(await codeFor(secret, today, 12));
  });

  it("changes with the date, so yesterday's code is no use", async () => {
    expect(await codeFor(secret, today, 12)).not.toBe(await codeFor(secret, "2026-03-11", 12));
  });

  it("changes with the course day", async () => {
    expect(await codeFor(secret, today, 12)).not.toBe(await codeFor(secret, today, 13));
  });

  it("changes with the secret, so one person's code is not another's", async () => {
    expect(await codeFor(secret, today, 12)).not.toBe(await codeFor(newSecret(), today, 12));
  });
});

describe("pairing secrets", () => {
  it("is long enough not to be guessed at", () => {
    expect(newSecret().length).toBeGreaterThanOrEqual(20);
  });

  it("is different every time", () => {
    const seen = new Set(Array.from({ length: 20 }, () => newSecret()));
    expect(seen.size).toBe(20);
  });
});

describe("typing it in", () => {
  it("forgives spaces, dashes and case", async () => {
    const code = await codeFor(secret, today, 12);
    const messy = `${code.slice(0, 3)} - ${code.slice(3)}`.toLowerCase();
    expect(await verifyCode(messy, secret, today, 12)).toBe(true);
  });

  it("forgives the characters people misread", () => {
    // Read off one screen, typed into another: O for 0 and I or L for 1.
    expect(normalise("o1l")).toBe("011");
    expect(normalise("I0O")).toBe("100");
  });

  it("accepts today's code", async () => {
    expect(await verifyCode(await codeFor(secret, today, 12), secret, today, 12)).toBe(true);
  });

  it("rejects yesterday's code", async () => {
    const yesterday = await codeFor(secret, "2026-03-09", 12);
    expect(await verifyCode(yesterday, secret, today, 12)).toBe(false);
  });

  it("rejects a code for another course day", async () => {
    expect(await verifyCode(await codeFor(secret, today, 13), secret, today, 12)).toBe(false);
  });

  it("rejects the wrong length rather than comparing a prefix", async () => {
    const code = await codeFor(secret, today, 12);
    expect(await verifyCode(code.slice(0, 5), secret, today, 12)).toBe(false);
    expect(await verifyCode(`${code}X`, secret, today, 12)).toBe(false);
    expect(await verifyCode("", secret, today, 12)).toBe(false);
  });
});

describe("the gate", () => {
  it("opens for the day it was unlocked, and no other", () => {
    const state = openGate(today);
    expect(gateIsOpen(state, today)).toBe(true);
    expect(gateIsOpen(state, "2026-03-11")).toBe(false);
  });

  it("starts shut", () => {
    expect(gateIsOpen({}, today)).toBe(false);
  });

  it("counts wrong tries without holding them against anyone", () => {
    const state = noteMiss(noteMiss({}));
    expect(state.misses).toBe(2);
    expect(gateLine(state, today, 12)).not.toMatch(/fail|lazy|wasted|should have|bad|shame|stupid/i);
  });

  it("clears the misses once it opens", () => {
    expect(openGate(today).misses).toBe(0);
  });

  it("points at the likely cause after a few wrong tries", () => {
    // Repeating "not that one" a fourth time helps nobody.
    expect(gateLine(noteMiss(noteMiss(noteMiss({}))), today, 12)).toMatch(/one day only/i);
  });

  it("names the day still to be done", () => {
    expect(gateLine({}, today, 12)).toContain("day 12");
  });

  it("says something worth reading when it is open", () => {
    expect(gateLine(openGate(today), today, 12)).toMatch(/earned/i);
  });
});
