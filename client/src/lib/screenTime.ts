export type ScreenshotUse = { hash: string; usedAt: string };

export function findPriorScreenshotUse(history: ScreenshotUse[], hash: string) {
  return history.find((item) => item.hash === hash);
}

export function recordScreenshotUse(history: ScreenshotUse[], hash: string, usedAt: string): ScreenshotUse[] {
  return [...history.filter((item) => item.hash !== hash).slice(-11), { hash, usedAt }];
}

export function reviewSubmissionState(screenshot: string | undefined, reusedAt: string | undefined) {
  if (!screenshot) return { allowed: false, message: "Add yesterday’s Screen Time screenshot first." } as const;
  if (reusedAt) return { allowed: false, message: "Use a newer Screen Time screenshot. This exact image was already reviewed." } as const;
  return { allowed: true, message: "" } as const;
}
