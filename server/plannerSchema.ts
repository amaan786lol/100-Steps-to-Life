import { z } from "zod";

const habitSchema = z.object({ name: z.string().trim().min(1).max(90), mode: z.enum(["build", "reduce"]) });

export const plannerInputSchema = z.object({
  priority: z.string().trim().min(3).max(500),
  habits: z.array(habitSchema).max(12),
  stepTarget: z.number().int().min(0).max(100000).optional(),
  stepsSoFar: z.number().int().min(0).max(100000).optional(),
  sleepHours: z.number().min(0).max(24).optional(),
}).strict();

export const screenTimeReviewInputSchema = z.object({
  screenTimeImage: z.string().startsWith("data:image/").max(5_000_000),
  priority: z.string().trim().max(500).optional(),
});

export type PlannerInput = z.infer<typeof plannerInputSchema>;
