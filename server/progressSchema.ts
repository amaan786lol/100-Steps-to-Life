import { z } from "zod";

/** The shape is intentionally flexible so local-first course journals can evolve without data loss. */
export const courseProgressPayloadSchema = z.object({
  data: z.record(z.string(), z.unknown()).refine(
    (data) => JSON.stringify(data).length <= 150_000,
    "Your journal backup is too large to save right now."
  ),
});
