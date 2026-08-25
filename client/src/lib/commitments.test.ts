import { describe, expect, it } from "vitest";
import {
  COMMITMENTS_KEY,
  WEEKDAYS,
  appliesOn,
  bookedHours,
  commitmentsAt,
  defaultCommitments,
  describeCommitment,
  firstFreeHour,
  isSetUp,
  readCommitments,
  type Commitment,
} from "./commitments";

// 2026-03-10 is a Tuesday, 2026-03-08 a Sunday.
const tuesday = new Date(2026, 2, 10, 9, 0);
const sunday = new Date(2026, 2, 8, 9, 0);

const madressa: Commitment = { name: "Madressa", days: [], fromHour: 8, toHour: 11 };
const school: Commitment = { name: "School", days: WEEKDAYS, fromHour: 9, toHour: 15 };

const store = (value?: string) => ({ getItem: () => value ?? null });

describe("assuming nothing", () => {
  it("starts with no commitments at all", () => {
    // One person's madressa is another's shift. An app that assumes a
    // timetable it was never told is planning someone else's day.
    expect(defaultCommitments).toEqual([]);
  });

  it("knows the difference between 'nothing booked' and 'never asked'", () => {
    // Someone who said they have nothing booked must not be asked again.
    expect(isSetUp(store())).toBe(false);
    expect(isSetUp(store("[]"))).toBe(true);
    expect(readCommitments(store("[]"))).toEqual([]);
  });

  it("keeps an answer of 'nothing' rather than replacing it", () => {
    expect(readCommitments(store(JSON.stringify([])))).toEqual([]);
  });
});

describe("reading what was set up", () => {
  it("reads well-formed commitments", () => {
    expect(readCommitments(store(JSON.stringify([madressa])))).toEqual([madressa]);
  });

  it("drops malformed entries rather than guessing", () => {
    const raw = JSON.stringify([
      madressa,
      { name: "", days: [], fromHour: 1, toHour: 2 },
      { name: "Backwards", days: [], fromHour: 14, toHour: 9 },
      { name: "Zero length", days: [], fromHour: 9, toHour: 9 },
      { name: "Bad day", days: [9], fromHour: 1, toHour: 2 },
      { name: "Off the clock", days: [], fromHour: 20, toHour: 30 },
      "nonsense",
    ]);
    expect(readCommitments(store(raw))).toEqual([madressa]);
  });

  it("survives unreadable storage", () => {
    expect(readCommitments(store("not json"))).toEqual([]);
    expect(readCommitments(store("{}"))).toEqual([]);
  });

  it("uses the key the interface writes to", () => {
    expect(COMMITMENTS_KEY).toBe("hundred-steps-commitments-v1");
  });
});

describe("which days a commitment runs", () => {
  it("treats an empty day list as every day", () => {
    expect(appliesOn(madressa, tuesday)).toBe(true);
    expect(appliesOn(madressa, sunday)).toBe(true);
  });

  it("respects a weekday-only commitment", () => {
    expect(appliesOn(school, tuesday)).toBe(true);
    expect(appliesOn(school, sunday)).toBe(false);
  });
});

describe("which hours are spoken for", () => {
  it("covers the hours between start and end, end exclusive", () => {
    expect([...bookedHours([madressa], tuesday)].sort((a, b) => a - b)).toEqual([8, 9, 10]);
  });

  it("counts nothing on a day the commitment does not run", () => {
    expect(bookedHours([school], sunday).size).toBe(0);
  });

  it("finds what covers a given hour", () => {
    expect(commitmentsAt([madressa], tuesday, 9).map((item) => item.name)).toEqual(["Madressa"]);
    expect(commitmentsAt([madressa], tuesday, 11)).toEqual([]);
  });

  it("reports overlapping commitments together", () => {
    expect(commitmentsAt([madressa, school], tuesday, 9)).toHaveLength(2);
  });
});

describe("finding room in the day", () => {
  it("returns the hour asked for when it is free", () => {
    expect(firstFreeHour([madressa], tuesday, 12)).toBe(12);
  });

  it("skips past a commitment", () => {
    // 09:00 is madressa, so the first free hour is when it finishes.
    expect(firstFreeHour([madressa], tuesday, 9)).toBe(11);
  });

  it("skips past two commitments back to back", () => {
    const after: Commitment = { name: "Club", days: [], fromHour: 11, toHour: 13 };
    expect(firstFreeHour([madressa, after], tuesday, 9)).toBe(13);
  });

  it("gives up rather than returning an hour past the limit", () => {
    expect(firstFreeHour([madressa], tuesday, 9, 11)).toBeNull();
  });

  it("finds any hour when nothing is booked", () => {
    expect(firstFreeHour([], tuesday, 9)).toBe(9);
  });
});

describe("saying it back", () => {
  it("describes a commitment the way the plan mentions it", () => {
    expect(describeCommitment(madressa)).toBe("Madressa, 08:00–11:00");
  });
});
