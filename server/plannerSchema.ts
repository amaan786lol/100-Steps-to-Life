import { z } from "zod";

const habitSchema = z.object({ name: z.string().trim().min(1).max(90), mode: z.enum(["build", "reduce"]) });

/** What yesterday's Screen Time review concluded, carried into today's plan. */
const yesterdaySchema = z.object({
  overview: z.string().trim().max(600),
  oneChange: z.string().trim().max(400),
  reviewedOn: z.string().trim().max(40).optional(),
});

/** Today's course lesson, so the plan is built around the step it asks for. */
const lessonSchema = z.object({
  day: z.number().int().min(1).max(100),
  title: z.string().trim().max(120),
  keyIdea: z.string().trim().max(400),
  actionPrompt: z.string().trim().max(400),
  island: z.string().trim().max(80).optional(),
});

export const plannerInputSchema = z.object({
  priority: z.string().trim().min(3).max(500),
  lesson: lessonSchema.optional(),
  yesterday: yesterdaySchema.optional(),
  habits: z.array(habitSchema).max(12),
  stepTarget: z.number().int().min(0).max(100000).optional(),
  stepsSoFar: z.number().int().min(0).max(100000).optional(),
  sleepHours: z.number().min(0).max(24).optional(),
}).strict();

export const screenTimeReviewInputSchema = z.object({
  screenTimeImage: z.string().startsWith("data:image/").max(5_000_000),
  priority: z.string().trim().max(500).optional(),
});

/** A Samsung Health / Galaxy Watch screenshot to read figures from. */
export const watchReadInputSchema = z.object({
  watchImage: z.string().startsWith("data:image/").max(5_000_000),
});

export type PlannerInput = z.infer<typeof plannerInputSchema>;
