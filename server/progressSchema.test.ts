import { describe, expect, it } from "vitest";
import { courseProgressPayloadSchema } from "./progressSchema";

describe("courseProgressPayloadSchema", () => {
  it("accepts a normal local course journal", () => {
    const parsed = courseProgressPayloadSchema.parse({
      data: {
        currentDay: 2,
        completedDays: [1],
        xp: 35,
        takeaways: { "1": "Begin where you are." },
      },
    });

    expect(parsed.data.currentDay).toBe(2);
  });

  it("rejects oversized journal payloads", () => {
    const result = courseProgressPayloadSchema.safeParse({ data: { note: "a".repeat(150_001) } });
    expect(result.success).toBe(false);
  });
});
