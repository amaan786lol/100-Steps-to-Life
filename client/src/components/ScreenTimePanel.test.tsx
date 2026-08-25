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

  it("writes the day into the record so a week survives a restart", () => {
    withUsage([[at(7), at(8)]]);
    render(<ScreenTimePanel />);
    const stored = JSON.parse(localStorage.getItem("hundred-steps-screen-time-daily-v1") ?? "[]");
    expect(stored).toHaveLength(1);
    expect(stored[0].minutes).toBe(60);
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
