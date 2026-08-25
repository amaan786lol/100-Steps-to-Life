// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ScreenTimePanel } from "./ScreenTimePanel";

type Native = NonNullable<Window["HundredStepsScreenTime"]>;

const at = (hour: number, minute = 0) => {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
};

const install = (native: Native) => {
  window.HundredStepsScreenTime = native;
};

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  delete window.HundredStepsScreenTime;
});

describe("in a plain browser", () => {
  it("says the figure is impossible here, not merely unavailable", () => {
    // The distinction matters: no permission the learner could grant anywhere
    // would make a web page able to read this.
    render(<ScreenTimePanel />);
    expect(screen.getByText(/Android app/)).toBeTruthy();
    expect(screen.getByText(/no way to see it/i)).toBeTruthy();
  });

  it("offers no permission button, because there is nothing to grant", () => {
    render(<ScreenTimePanel />);
    expect(screen.queryByRole("button", { name: /Usage Access/i })).toBeNull();
  });
});

describe("in the app without access yet", () => {
  it("offers the settings screen", () => {
    const requestPermission = vi.fn();
    install({ hasPermission: () => false, requestPermission, readUsage: () => "[]" });
    render(<ScreenTimePanel />);

    const button = screen.getByRole("button", { name: /Open Usage Access settings/i });
    fireEvent.click(button);
    expect(requestPermission).toHaveBeenCalled();
  });

  it("promises nothing leaves the device", () => {
    install({ hasPermission: () => false, requestPermission: vi.fn(), readUsage: () => "[]" });
    render(<ScreenTimePanel />);
    expect(screen.getByText(/Nothing leaves the device/i)).toBeTruthy();
  });
});

describe("with access granted", () => {
  const withUsage = (pairs: Array<[number, number]>) =>
    install({ hasPermission: () => true, requestPermission: vi.fn(), readUsage: () => JSON.stringify(pairs) });

  it("shows today's total", () => {
    withUsage([[at(7), at(8, 30)], [at(9), at(9, 45)]]);
    render(<ScreenTimePanel />);
    expect(screen.getByText("2h 15m")).toBeTruthy();
  });

  it("does not double-count overlapping apps", () => {
    withUsage([[at(7), at(8)], [at(7, 30), at(8, 30)]]);
    render(<ScreenTimePanel />);
    expect(screen.getByText("1h 30m")).toBeTruthy();
  });

  it("judges against the goal without calling it a score", () => {
    withUsage([[at(7), at(8)]]);
    render(<ScreenTimePanel />);
    expect(screen.getByText(/Completed · target < 3h 00m/)).toBeTruthy();
  });

  it("says so when the day has gone over", () => {
    withUsage([[at(6), at(14)]]);
    render(<ScreenTimePanel />);
    expect(screen.getByText(/Not completed/)).toBeTruthy();
  });

  it("writes today into the record so the week survives a restart", () => {
    withUsage([[at(7), at(8)]]);
    render(<ScreenTimePanel />);
    const stored = JSON.parse(localStorage.getItem("hundred-steps-screen-time-daily-v1") ?? "[]");
    const today = stored.find((day: { date: string }) => day.date === new Date().toLocaleDateString("en-CA"));
    expect(today.minutes).toBe(60);
  });

  it("keeps a changed limit", () => {
    withUsage([[at(7), at(8)]]);
    render(<ScreenTimePanel />);
    fireEvent.change(screen.getByLabelText(/Daily screen time limit/i), { target: { value: "90" } });
    expect(JSON.parse(localStorage.getItem("hundred-steps-screen-time-goal-v1")!).target).toBe(90);
    expect(screen.getByText(/target < 1h 30m/)).toBeTruthy();
  });

  it("reports a genuinely unused phone as zero, not as unknown", () => {
    withUsage([]);
    render(<ScreenTimePanel />);
    expect(screen.getByText("0m")).toBeTruthy();
  });
});

describe("filling in the days before it was installed", () => {
  /** Serve a different answer per requested window, keyed by the day it starts in. */
  const perDay = (minutesByOffset: Record<number, number | null>) => {
    const midnight = (offset: number) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + offset);
      return d.getTime();
    };
    install({
      hasPermission: () => true,
      requestPermission: vi.fn(),
      readUsage: (start: number) => {
        for (const [offset, mins] of Object.entries(minutesByOffset)) {
          if (start === midnight(Number(offset))) {
            // null stands for "the device no longer remembers this day".
            return mins === null ? "[]" : JSON.stringify([[start, start + mins * 60_000]]);
          }
        }
        return "[]";
      },
    });
  };

  it("reads the retained days on first open instead of one per day", () => {
    perDay({ 0: 45, [-1]: 120, [-2]: 90 });
    render(<ScreenTimePanel />);
    const stored = JSON.parse(localStorage.getItem("hundred-steps-screen-time-daily-v1") ?? "[]");
    expect(stored).toHaveLength(3);
    expect(stored.map((d: { minutes: number }) => d.minutes).sort((a: number, b: number) => a - b)).toEqual([45, 90, 120]);
  });

  it("leaves a forgotten day as a gap rather than recording a false zero", () => {
    // A day aged out of Android's event log looks identical to an untouched
    // phone, so it must not be written down as 0 hours.
    perDay({ 0: 45, [-1]: null, [-2]: 90 });
    render(<ScreenTimePanel />);
    const stored = JSON.parse(localStorage.getItem("hundred-steps-screen-time-daily-v1") ?? "[]");
    expect(stored).toHaveLength(2);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(stored.find((d: { date: string }) => d.date === yesterday.toLocaleDateString("en-CA"))).toBeUndefined();
  });

  it("keeps today's genuine zero, which is a real reading", () => {
    perDay({ 0: 0, [-1]: 60 });
    render(<ScreenTimePanel />);
    const stored = JSON.parse(localStorage.getItem("hundred-steps-screen-time-daily-v1") ?? "[]");
    const today = stored.find((d: { date: string }) => d.date === new Date().toLocaleDateString("en-CA"));
    expect(today.minutes).toBe(0);
  });

  it("does not overwrite a day already recorded with a later reading", () => {
    perDay({ 0: 45, [-1]: 120 });
    render(<ScreenTimePanel />);
    const first = JSON.parse(localStorage.getItem("hundred-steps-screen-time-daily-v1")!);
    cleanup();
    render(<ScreenTimePanel />);
    const second = JSON.parse(localStorage.getItem("hundred-steps-screen-time-daily-v1")!);
    expect(second).toHaveLength(first.length);
  });
});
