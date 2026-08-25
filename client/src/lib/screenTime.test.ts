import { describe, expect, it } from "vitest";
import { findPriorScreenshotUse, recordScreenshotUse, reviewSubmissionState } from "./screenTime";

describe("Screen Time screenshot history", () => {
  it("recognises an exact screenshot fingerprint that was already used", () => {
    const history = [{ hash: "same-image", usedAt: "2026-08-24T10:00:00.000Z" }];
    expect(findPriorScreenshotUse(history, "same-image")?.usedAt).toBe("2026-08-24T10:00:00.000Z");
    expect(findPriorScreenshotUse(history, "new-image")).toBeUndefined();
  });

  it("keeps a compact history and replaces an earlier record for the same image", () => {
    const history = Array.from({ length: 12 }, (_, index) => ({ hash: `image-${index}`, usedAt: `${index}` }));
    const next = recordScreenshotUse(history, "image-6", "new-time");
    expect(next).toHaveLength(12);
    expect(next.filter((item) => item.hash === "image-6")).toEqual([{ hash: "image-6", usedAt: "new-time" }]);
  });

  it("allows only a new screenshot to enter the separate yesterday-review submission", () => {
    expect(reviewSubmissionState(undefined, undefined)).toMatchObject({ allowed: false, message: "Add yesterday’s Screen Time screenshot first." });
    expect(reviewSubmissionState("data:image/png;base64,new", "2026-08-24T00:00:00.000Z")).toMatchObject({ allowed: false });
    expect(reviewSubmissionState("data:image/png;base64,new", undefined)).toEqual({ allowed: true, message: "" });
  });
});
