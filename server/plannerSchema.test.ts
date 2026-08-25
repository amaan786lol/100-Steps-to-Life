import { describe, expect, it } from "vitest";
import { plannerInputSchema, screenTimeReviewInputSchema } from "./plannerSchema";

describe("planner schemas", () => {
  it("accepts a bounded daily planning context", () => {
    expect(plannerInputSchema.parse({ priority: "Keep my evening phone-free", habits: [{ name: "Phone-free dinner", mode: "build" }], stepTarget: 6400, stepsSoFar: 1200, sleepHours: 7.5 })).toMatchObject({ stepTarget: 6400 });
  });

  it("requires an image for a later Screen Time review", () => {
    expect(() => screenTimeReviewInputSchema.parse({ screenTimeImage: "https://example.com/image.png" })).toThrow();
    expect(screenTimeReviewInputSchema.parse({ screenTimeImage: "data:image/png;base64,abc" })).toMatchObject({ screenTimeImage: "data:image/png;base64,abc" });
  });

  it("keeps the morning-plan request separate from image review", () => {
    expect(() => plannerInputSchema.parse({ priority: "Plan today", habits: [], screenTimeImage: "data:image/png;base64,abc" })).toThrow();
  });
});
