// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dayKeyOffset } from "@/lib/dailyCheckin";
import { announceHabitChange } from "@/lib/slyContext";
import { SlyCompanion } from "./Sly";

const HABITS_KEY = "hundred-steps-habit-studio-v1";
const STATE_KEY = "hundred-steps-sly-state-v1";
const SPOT_KEY = "hundred-steps-sly-spot-v1";
const minutes = (n: number) => n * 60_000;

/** The app shell Sly renders into, so the theme reaches him. */
function shell() {
  const main = document.createElement("main");
  main.className = "field-app theme-night";
  document.body.append(main);
  return main;
}

const storeHabits = (habits: Array<{ id: string; name: string; mode: "build" | "reduce"; log: Record<string, true> }>) =>
  localStorage.setItem(HABITS_KEY, JSON.stringify({ date: dayKeyOffset(0), priority: "", habits: habits.map(h => ({ ...h, done: false })) }));

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Sly on the page", () => {
  it("renders into the themed app shell, not the bare body", () => {
    // The theme variables are declared on .field-app.theme-*. A fox parented to
    // the body keeps the morning palette on a night page.
    const main = shell();
    render(<SlyCompanion />);
    expect(main.querySelector(".sly-holder")).not.toBeNull();
  });

  it("still renders if the shell is not there", () => {
    render(<SlyCompanion />);
    expect(document.querySelector(".sly-holder")).not.toBeNull();
  });

  it("says what the habits say, without being handed them", () => {
    shell();
    storeHabits([{ id: "a", name: "Morning walk", mode: "build", log: { [dayKeyOffset(-4)]: true } }]);
    render(<SlyCompanion />);
    fireEvent.click(screen.getByRole("button", { name: /^Sly:/ }));
    expect(screen.getByText("Morning walk has gone quiet.")).toBeTruthy();
  });

  it("catches up when the habit page changes something", () => {
    shell();
    storeHabits([{ id: "a", name: "Morning walk", mode: "build", log: { [dayKeyOffset(-4)]: true } }]);
    render(<SlyCompanion />);
    fireEvent.click(screen.getByRole("button", { name: /^Sly:/ }));
    expect(screen.getByText("Morning walk has gone quiet.")).toBeTruthy();

    storeHabits([{ id: "a", name: "Morning walk", mode: "build", log: { [dayKeyOffset(0)]: true } }]);
    act(() => announceHabitChange());
    // Nothing is slipping any more, so he drops the subject and moves on
    // rather than repeating a concern that has been dealt with.
    expect(screen.queryByText("Morning walk has gone quiet.")).toBeNull();
    expect(screen.getByRole("button", { name: /^Sly:/ }).getAttribute("aria-label")).not.toMatch(/gone quiet/);
  });
});

describe("the interruption", () => {
  const longStretch = () =>
    localStorage.setItem(STATE_KEY, JSON.stringify({ stretchStartedAt: Date.now() - minutes(40), lastSeenAt: Date.now() - 1000 }));

  it("steps in front of the screen after a long stretch", () => {
    shell();
    longStretch();
    render(<SlyCompanion />);
    expect(screen.getByRole("dialog", { name: /break/i })).toBeTruthy();
    expect(screen.getByText("That is 30 minutes straight.")).toBeTruthy();
  });

  it("hides the floating fox while the card is up, so it cannot cover its own button", () => {
    shell();
    longStretch();
    render(<SlyCompanion />);
    expect(document.querySelector(".sly-holder")?.className).toContain("phase-due");
  });

  it("starts a real break, and counts it down", () => {
    shell();
    longStretch();
    render(<SlyCompanion />);
    fireEvent.click(screen.getByRole("button", { name: /Start the 15-minute break/i }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Break — 15:00")).toBeTruthy();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByText("Break — 14:00")).toBeTruthy();
  });

  it("does not record a break when it was only sent away", () => {
    // The whole point of Sly: he can always be dismissed, and dismissing him is
    // never quietly written down as a break that was taken.
    shell();
    longStretch();
    render(<SlyCompanion />);
    fireEvent.click(screen.getByRole("button", { name: /Five more minutes/i }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(JSON.parse(localStorage.getItem(STATE_KEY)!).breakStartedAt).toBeUndefined();
  });

  it("comes back after the snooze runs out", () => {
    shell();
    longStretch();
    render(<SlyCompanion />);
    fireEvent.click(screen.getByRole("button", { name: /Five more minutes/i }));
    act(() => { vi.advanceTimersByTime(minutes(6)); });
    expect(screen.getByRole("dialog", { name: /break/i })).toBeTruthy();
  });

  it("ends the break by itself, even with nobody watching", () => {
    shell();
    localStorage.setItem(STATE_KEY, JSON.stringify({ stretchStartedAt: Date.now() - minutes(40), breakStartedAt: Date.now(), lastSeenAt: Date.now() }));
    render(<SlyCompanion />);
    expect(screen.getByText(/^Break — /)).toBeTruthy();
    act(() => { vi.advanceTimersByTime(minutes(16)); });
    expect(screen.queryByText(/^Break — /)).toBeNull();
  });
});

describe("where he stands", () => {
  it("remembers where he was put", () => {
    shell();
    localStorage.setItem(SPOT_KEY, JSON.stringify({ x: 40, y: 120 }));
    render(<SlyCompanion />);
    const holder = document.querySelector(".sly-holder") as HTMLElement;
    expect(holder.style.left).toBe("40px");
    expect(holder.style.top).toBe("120px");
  });

  it("ignores a stored position that is not a position", () => {
    shell();
    localStorage.setItem(SPOT_KEY, "not json");
    render(<SlyCompanion />);
    // No inline placement means he falls back to the corner the stylesheet picks.
    expect((document.querySelector(".sly-holder") as HTMLElement).style.left).toBe("");
  });
});
