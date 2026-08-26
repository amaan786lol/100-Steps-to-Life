import { describe, expect, it } from "vitest";
import {
  SALAH_MINUTES,
  SALAH_ORDER,
  clock,
  defaultSalahTimes,
  describeSalah,
  gapAround,
  hourIsClear,
  lastSalah,
  minutesOf,
  nextSalah,
  readSalahTimes,
  salahLine,
  salahNow,
  sortByTime,
  type SalahTime,
} from "./salah";

const hm = (hour: number, minute = 0) => hour * 60 + minute;
const at = (hour: number, minute = 0) => new Date(2026, 7, 25, hour, minute);
const times = defaultSalahTimes;
const store = (value?: string) => ({ getItem: () => value ?? null });

describe("the five, in order", () => {
  it("names them the way they are prayed", () => {
    expect(SALAH_ORDER).toEqual(["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"]);
  });

  it("comes with times already in order", () => {
    expect(sortByTime(times)).toEqual(times);
  });

  it("sorts times given out of order", () => {
    const jumbled: SalahTime[] = [times[3], times[0], times[2]];
    expect(sortByTime(jumbled).map((time) => time.name)).toEqual(["Fajr", "Asr", "Maghrib"]);
  });
});

describe("reading times someone has corrected", () => {
  it("takes their times over the estimates", () => {
    const mine: SalahTime[] = [{ name: "Fajr", at: hm(3, 50) }, { name: "Isha", at: hm(22, 30) }];
    expect(readSalahTimes(store(JSON.stringify(mine)))).toEqual(sortByTime(mine));
  });

  it("drops nonsense rather than accepting an impossible time", () => {
    const raw = JSON.stringify([
      { name: "Fajr", at: hm(4, 45) },
      { name: "Brunch", at: hm(11) },
      { name: "Asr", at: -30 },
      { name: "Isha", at: 24 * 60 },
    ]);
    expect(readSalahTimes(store(raw))).toEqual([{ name: "Fajr", at: hm(4, 45) }]);
  });

  it("falls back to the estimates rather than leaving the day empty", () => {
    expect(readSalahTimes(store("not json"))).toEqual(defaultSalahTimes);
    expect(readSalahTimes(store())).toEqual(defaultSalahTimes);
    expect(readSalahTimes(store("[]"))).toEqual(defaultSalahTimes);
  });
});

describe("where the day is", () => {
  it("knows when a prayer is in its window", () => {
    expect(salahNow(times, at(13, 20))?.name).toBe("Dhuhr");
    expect(salahNow(times, at(13, 14))).toBeNull();
    expect(salahNow(times, at(13, 30))).toBeNull();
  });

  it("holds each prayer for a quarter of an hour", () => {
    expect(SALAH_MINUTES).toBe(15);
    expect(salahNow(times, at(20, 29))?.name).toBe("Maghrib");
  });

  it("finds the next one due", () => {
    const next = nextSalah(times, at(14, 0));
    expect(next?.time.name).toBe("Asr");
    expect(next?.inMinutes).toBe(180);
  });

  it("wraps past Isha to tomorrow's Fajr", () => {
    // The day does not end at Isha; it turns over.
    const next = nextSalah(times, at(23, 0));
    expect(next?.time.name).toBe("Fajr");
    expect(next?.inMinutes).toBe(60 + hm(4, 45));
  });

  it("knows which prayer the day is sitting after", () => {
    expect(lastSalah(times, at(15, 0))?.name).toBe("Dhuhr");
    expect(lastSalah(times, at(3, 0))).toBeNull();
  });

  it("reads a clock time as minutes and back", () => {
    expect(minutesOf(at(13, 15))).toBe(hm(13, 15));
    expect(clock(hm(4, 45))).toBe("04:45");
    expect(clock(hm(20, 5))).toBe("20:05");
  });
});

describe("the gaps work goes into", () => {
  it("finds the stretch between two prayers", () => {
    // A day is not a blank sheet; it is the gaps between fixed points.
    expect(gapAround(times, hm(15, 0))).toEqual({ from: hm(13, 30), to: hm(17, 0) });
  });

  it("runs from midnight before the first prayer", () => {
    expect(gapAround(times, hm(2, 0))).toEqual({ from: 0, to: hm(4, 45) });
  });

  it("runs to midnight after the last", () => {
    expect(gapAround(times, hm(23, 0))).toEqual({ from: hm(22, 0), to: 24 * 60 });
  });

  it("knows which whole hours are clear of a prayer", () => {
    expect(hourIsClear(times, 13)).toBe(false);
    expect(hourIsClear(times, 20)).toBe(false);
    expect(hourIsClear(times, 15)).toBe(true);
    expect(hourIsClear(times, 11)).toBe(true);
  });
});

describe("what Sly says about them", () => {
  it("has a line for each", () => {
    for (const time of times) {
      expect(salahLine(time).length).toBeGreaterThan(0);
      expect(salahLine(time)).toContain(time.name);
    }
  });

  it("never claims to know whether it was prayed", () => {
    // The app cannot know that, and pretending to would be the worst thing
    // it could do here.
    for (const time of times) {
      expect(salahLine(time)).not.toMatch(/you prayed|well done|you missed|did not pray|you skipped/i);
    }
  });

  it("never nags", () => {
    for (const time of times) {
      expect(salahLine(time)).not.toMatch(/fail|lazy|should have|shame|sin|guilty|excuse/i);
    }
  });

  it("describes a prayer the way the schedule shows it", () => {
    expect(describeSalah(times[0])).toBe("Fajr, 04:45");
  });
});
