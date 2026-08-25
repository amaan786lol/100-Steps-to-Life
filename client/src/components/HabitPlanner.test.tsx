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
    expect(screen.getByText("Walk").closest(".habit-row")?.classList.contains("done")).toBe(false);

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
