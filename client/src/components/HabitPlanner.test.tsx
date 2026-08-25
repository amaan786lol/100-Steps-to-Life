// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMutate = vi.fn();
const reviewMutate = vi.fn();
const watchMutate = vi.fn();
let watchReading = { steps: 4210, stepTarget: 8000, sleepHours: 6.5, note: "Figures are for today." };

vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ isAuthenticated: true }) }));
vi.mock("@/const", () => ({ startLogin: vi.fn() }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    planner: {
      create: { useMutation: (options: { onSuccess?: (data: unknown) => void }) => ({ isPending: false, mutate: (input: unknown) => { createMutate(input); options.onSuccess?.({ plan: { focus: "Today", honestOverview: "A clear morning decision is better than no decision.", schedule: [], friction: "Move the phone", replacement: "Read", checkIn: "Check tonight", note: "Wellbeing only." } }); } }) },
      reviewYesterday: { useMutation: (options: { onSuccess?: (data: unknown) => void }) => ({ isPending: false, mutate: (input: unknown) => { reviewMutate(input); options.onSuccess?.({ review: { overview: "Yesterday had a clear pattern.", evidence: "A screen-time image was provided.", oneChange: "Set a phone parking place.", note: "Review without shame." } }); } }) },
      readWatch: { useMutation: (options: { onSuccess?: (data: unknown) => void }) => ({ isPending: false, mutate: (input: unknown) => { watchMutate(input); options.onSuccess?.({ reading: watchReading }); } }) },
    },
  },
}));

import { HabitPlanner } from "./HabitPlanner";

beforeEach(() => {
  localStorage.clear();
  createMutate.mockClear();
  reviewMutate.mockClear();
  watchMutate.mockClear();
  watchReading = { steps: 4210, stepTarget: 8000, sleepHours: 6.5, note: "Figures are for today." };
  Object.defineProperty(globalThis, "crypto", { configurable: true, value: { randomUUID: () => "habit-1", subtle: { digest: vi.fn().mockResolvedValue(new Uint8Array(32).buffer) } } });
});

afterEach(() => cleanup());

describe("Habit Studio daily workflow", () => {
  it("loads prior-day storage as a fresh morning check-in and keeps review separate from planning", () => {
    localStorage.setItem("hundred-steps-habit-studio-v1", JSON.stringify({ date: "2020-01-01", priority: "Old priority", stepTarget: 8000, stepsSoFar: 6000, habits: [{ id: "old", name: "Walk", mode: "build", done: true }] }));
    render(<HabitPlanner />);

    expect((screen.getByPlaceholderText("Example: I will protect my evening by putting my phone away after dinner.") as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByPlaceholderText("e.g. 6400") as HTMLInputElement).value).toBe("");
    // Scoped to the habit list: the name also appears in Sly's plan for today.
    const walkRow = document.querySelector(".habit-list")!.querySelector(".habit-row")!;
    expect(walkRow.textContent).toContain("Walk");
    expect(walkRow.classList.contains("done")).toBe(false);

    fireEvent.change(screen.getByPlaceholderText("Example: I will protect my evening by putting my phone away after dinner."), { target: { value: "Protect the evening" } });
    fireEvent.click(screen.getByRole("button", { name: "Create today’s plan" }));
    expect(createMutate).toHaveBeenCalledWith(expect.objectContaining({ priority: "Protect the evening" }));
    expect(createMutate.mock.calls[0][0]).not.toHaveProperty("screenTimeImage");
    expect(reviewMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Review yesterday" }));
    expect(screen.getByText("Add yesterday’s Screen Time screenshot first.")).toBeTruthy();
  });

  it("submits a new screenshot only through the separate yesterday-review path and blocks a duplicate", async () => {
    render(<HabitPlanner />);
    const fileInput = screen.getByLabelText("Yesterday’s Screen Time screenshot") as HTMLInputElement;
    const image = new File([new Uint8Array([1, 2, 3])], "yesterday.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [image] } });
    await waitFor(() => expect(screen.getByText("Yesterday’s Screen Time screenshot is ready for review.")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Review yesterday" }));
    expect(reviewMutate).toHaveBeenCalledWith(expect.objectContaining({ screenTimeImage: expect.stringMatching(/^data:image\//) }));
    expect(createMutate).not.toHaveBeenCalled();

    fireEvent.change(fileInput, { target: { files: [image] } });
    await waitFor(() => expect(screen.getByText("This exact screenshot was already reviewed. Pick a newer one.")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Review yesterday" }));
    expect(reviewMutate).toHaveBeenCalledTimes(1);
  });

  it("carries yesterday's review into today's plan, and lets it be dropped", async () => {
    // A review recorded today is what tomorrow's plan should be built on.
    localStorage.setItem("hundred-steps-yesterday-review-v1", JSON.stringify({
      review: { overview: "Long evening stretches on the phone.", evidence: "Screenshot supplied.", oneChange: "Park the phone in the hall after Maghrib.", note: "No shame." },
      reviewedOn: new Date().toLocaleDateString("en-CA"),
    }));
    render(<HabitPlanner />);

    // It shows in the carried-in banner above the plan button, and the restored
    // review is on the page too, so scope the assertion to the banner.
    expect(document.querySelector(".carried-review p")?.textContent).toBe("Park the phone in the hall after Maghrib.");
    fireEvent.change(screen.getByPlaceholderText("Example: I will protect my evening by putting my phone away after dinner."), { target: { value: "Protect the evening" } });
    fireEvent.click(screen.getByRole("button", { name: "Create today’s plan" }));
    expect(createMutate).toHaveBeenCalledWith(expect.objectContaining({
      yesterday: expect.objectContaining({ oneChange: "Park the phone in the hall after Maghrib." }),
    }));

    // Dropping it must genuinely remove it from the next request.
    createMutate.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Do not use yesterday’s review for today" }));
    fireEvent.click(screen.getByRole("button", { name: "Create today’s plan" }));
    expect(createMutate.mock.calls[0][0].yesterday).toBeUndefined();
  });

  it("builds the plan around the course day the learner is standing on", () => {
    localStorage.setItem("hundred-steps-to-life-v1", JSON.stringify({ currentDay: 3 }));
    render(<HabitPlanner />);

    expect(screen.getByText(/DAY 03/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use this as today’s priority" }));
    fireEvent.click(screen.getByRole("button", { name: "Create today’s plan" }));
    const sent = createMutate.mock.calls[0][0];
    expect(sent.lesson).toMatchObject({ day: 3 });
    // The lesson's own step becomes the priority when the learner asks for it.
    expect(sent.priority).toBe(sent.lesson.actionPrompt);
  });

  it("falls back to day one when no course journal exists yet", () => {
    render(<HabitPlanner />);
    expect(screen.getByText(/DAY 01/)).toBeTruthy();
  });

  it("ignores a review too old to be yesterday", () => {
    localStorage.setItem("hundred-steps-yesterday-review-v1", JSON.stringify({
      review: { overview: "Old.", evidence: "-", oneChange: "Stale advice.", note: "-" },
      reviewedOn: "2020-01-01",
    }));
    render(<HabitPlanner />);
    expect(screen.queryByText("Stale advice.")).toBeNull();
  });

  it("records a kept habit so it survives to the next morning", () => {
    render(<HabitPlanner />);
    fireEvent.change(screen.getByLabelText("New habit"), { target: { value: "Walk after school" } });
    fireEvent.click(screen.getByLabelText("Add habit"));
    fireEvent.click(screen.getByLabelText("Mark Walk after school done"));

    const today = new Date().toLocaleDateString("en-CA");
    const saved = JSON.parse(localStorage.getItem("hundred-steps-habit-studio-v1") ?? "{}");
    expect(saved.habits[0].log[today]).toBe(true);
    expect(screen.getByText("1-day run")).toBeTruthy();
  });

  it("fills the wellbeing fields from a watch screenshot, and only what was read", async () => {
    render(<HabitPlanner />);
    const watchInput = screen.getByLabelText("Samsung Health screenshot") as HTMLInputElement;
    const shot = new File([new Uint8Array([9, 9, 9])], "health.png", { type: "image/png" });

    fireEvent.change(watchInput, { target: { files: [shot] } });
    await waitFor(() => expect(watchMutate).toHaveBeenCalledWith(expect.objectContaining({ watchImage: expect.stringMatching(/^data:image\//) })));
    await waitFor(() => expect((screen.getByPlaceholderText("e.g. 1200") as HTMLInputElement).value).toBe("4210"));
    expect((screen.getByPlaceholderText("e.g. 6400") as HTMLInputElement).value).toBe("8000");
    expect((screen.getByPlaceholderText("e.g. 7.5 hours") as HTMLInputElement).value).toBe("6.5");
    // Reading a screenshot must never trigger a plan or a screen-time review.
    expect(createMutate).not.toHaveBeenCalled();
    expect(reviewMutate).not.toHaveBeenCalled();
  });

  it("leaves a field alone when the screenshot could not be read", async () => {
    watchReading = { steps: null as unknown as number, stepTarget: 9000, sleepHours: null as unknown as number, note: "Sleep was not visible." };
    render(<HabitPlanner />);
    const watchInput = screen.getByLabelText("Samsung Health screenshot") as HTMLInputElement;
    fireEvent.change(watchInput, { target: { files: [new File([new Uint8Array([1])], "h.png", { type: "image/png" })] } });

    await waitFor(() => expect((screen.getByPlaceholderText("e.g. 6400") as HTMLInputElement).value).toBe("9000"));
    // A null must stay empty rather than becoming a guess.
    expect((screen.getByPlaceholderText("e.g. 1200") as HTMLInputElement).value).toBe("");
    expect((screen.getByPlaceholderText("e.g. 7.5 hours") as HTMLInputElement).value).toBe("");
  });
});
