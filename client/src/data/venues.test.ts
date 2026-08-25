import { describe, expect, it } from "vitest";
import { lessons } from "./course";
import { placeFor, placeIndex, venueFor, venues } from "./venues";

describe("every island has somewhere to stand", () => {
  it("covers all ten islands, once each", () => {
    expect(venues).toHaveLength(10);
    expect(venues.map((venue) => venue.phaseId).sort((a, b) => a - b))
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("gives every island ten places", () => {
    for (const venue of venues) {
      expect(venue.places, venue.exterior).toHaveLength(10);
    }
  });

  it("names every place, with nothing blank", () => {
    for (const venue of venues) {
      for (const place of venue.places) expect(place.trim().length, venue.exterior).toBeGreaterThan(0);
      expect(venue.exterior.trim().length).toBeGreaterThan(0);
      expect(venue.approach.trim().length).toBeGreaterThan(0);
    }
  });

  it("does not repeat a place within an island", () => {
    for (const venue of venues) {
      expect(new Set(venue.places).size, venue.exterior).toBe(10);
    }
  });

  it("does not repeat a place anywhere in the course", () => {
    // A duplicate across islands would make two different days look identical
    // on the map.
    const all = venues.flatMap((venue) => venue.places);
    expect(new Set(all).size).toBe(100);
  });
});

describe("finding the place for a day", () => {
  it("gives every day from 1 to 100 a place", () => {
    for (let day = 1; day <= 100; day++) {
      expect(placeFor(day).trim().length, `day ${day}`).toBeGreaterThan(0);
    }
  });

  it("puts the first day of an island at its way in", () => {
    expect(placeFor(1)).toBe("The Landing");
    expect(placeFor(31)).toBe("The Threshold");
    expect(placeFor(91)).toBe("The Final Approach");
  });

  it("puts the last day of an island at its furthest point", () => {
    expect(placeFor(10)).toBe("Cove Head");
    expect(placeFor(40)).toBe("The Minaret Stair");
    expect(placeFor(100)).toBe("The Summit Cairn");
  });

  it("crosses island boundaries correctly", () => {
    // Day 30 is the last of Training Ridge; day 31 the first of Sakina Point.
    expect(placeFor(30)).toBe("Ridge Crest");
    expect(placeFor(31)).toBe("The Threshold");
  });

  it("counts a day's position within its island from zero", () => {
    expect(placeIndex(31)).toBe(0);
    expect(placeIndex(40)).toBe(9);
    expect(placeIndex(41)).toBe(0);
  });

  it("degrades to a readable label rather than an empty one", () => {
    // A day outside the course should not render as a blank waypoint.
    expect(placeFor(101)).toMatch(/Day 101|^\S/);
  });
});

describe("the places line up with the course", () => {
  it("has a place for every lesson, on the right island", () => {
    for (const lesson of lessons) {
      const venue = venueFor(lesson.phase.id);
      expect(venue, `day ${lesson.day}`).toBeDefined();
      expect(venue!.places).toContain(placeFor(lesson.day));
    }
  });

  it("names the island the same way the course does", () => {
    for (const lesson of lessons) {
      expect(venueFor(lesson.phase.id)!.exterior, `day ${lesson.day}`).toBe(lesson.phase.island);
    }
  });
});
