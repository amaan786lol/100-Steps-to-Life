import { COOKIE_NAME } from "@shared/const";
import { getCourseProgressByUserId, saveCourseProgress } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { courseProgressPayloadSchema } from "./progressSchema";
import { invokeLLM } from "./_core/llm";
import { plannerInputSchema, screenTimeReviewInputSchema, watchReadInputSchema } from "./plannerSchema";

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  progress: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const backup = await getCourseProgressByUserId(ctx.user.id);
      return backup ? { data: backup.data, updatedAt: backup.updatedAt } : null;
    }),
    save: protectedProcedure.input(courseProgressPayloadSchema).mutation(async ({ ctx, input }) => {
      const backup = await saveCourseProgress(ctx.user.id, input.data);
      return { updatedAt: backup?.updatedAt ?? new Date() };
    }),
  }),
  planner: router({
    create: protectedProcedure.input(plannerInputSchema).mutation(async ({ input }) => {
      const response = await invokeLLM({
        model: "gpt-5-mini",
        maxTokens: 1200,
        messages: [
          { role: "system", content: "You are a direct, respectful daily habit-planning assistant for a personal-development course. Build a short, practical plan for TODAY, beginning with a morning decision and ending with one simple evening check-in. The supplied step target and steps so far are both for today. Sleep refers to last night and is optional wellbeing context only. Give one honest overview that is specific, calm, and non-sycophantic: name the clearest pattern, state what it is likely costing the user in practical terms, and identify one realistic lever. Do not exaggerate, diagnose health conditions, shame the user, prescribe treatment, or make claims about sleep/medical causes. Do not recommend extreme restriction or punishment. If a review of yesterday is supplied, treat it as the most useful evidence you have: carry its one change into today's plan concretely, say in the overview how today follows from it, and do not simply restate it. Never scold the user about yesterday." },
          { role: "user", content: [
            { type: "text", text: `Morning priority for today: ${input.priority}${input.yesterday ? `\nYesterday's review said: ${input.yesterday.overview}\nThe one change it asked for: ${input.yesterday.oneChange}` : ""}\nToday’s habits: ${input.habits.map(h => `${h.mode}: ${h.name}`).join("; ") || "none yet"}\nToday’s step target: ${input.stepTarget ?? "not provided"}\nSteps so far today: ${input.stepsSoFar ?? "not provided"}\nSleep last night: ${input.sleepHours ?? "not provided"}` },
          ] },
        ],
        outputSchema: {
          name: "habit_schedule", strict: true, schema: { type: "object", additionalProperties: false, properties: {
            focus: { type: "string" }, honestOverview: { type: "string" }, schedule: { type: "array", minItems: 3, maxItems: 5, items: { type: "object", additionalProperties: false, properties: { time: { type: "string" }, action: { type: "string" }, reason: { type: "string" } }, required: ["time", "action", "reason"] } }, friction: { type: "string" }, replacement: { type: "string" }, checkIn: { type: "string" }, note: { type: "string" },
          }, required: ["focus", "honestOverview", "schedule", "friction", "replacement", "checkIn", "note"] },
        },
      });
      const content = response.choices[0]?.message.content;
      if (typeof content !== "string") throw new Error("The planner returned an unreadable response.");
      return { plan: JSON.parse(content) as Record<string, unknown> };
    }),
    readWatch: protectedProcedure.input(watchReadInputSchema).mutation(async ({ input }) => {
      const response = await invokeLLM({
        model: "gpt-5-mini",
        maxTokens: 400,
        messages: [
          { role: "system", content: "You read figures off a Samsung Health or Galaxy Watch screenshot so they can be typed into a check-in automatically. Report only what is legibly shown. Use null for anything you cannot read with confidence — never estimate, infer, or fill a gap. steps and stepTarget are whole numbers of steps for the day shown. sleepHours is last night's total sleep in hours, as a decimal. Put anything the user should know in note, in one short sentence, such as which day the screenshot appears to cover. Do not comment on whether the numbers are good, and do not give health advice." },
          { role: "user", content: [
            { type: "text", text: "Read the steps, step goal and sleep from this screenshot." },
            { type: "image_url", image_url: { url: input.watchImage, detail: "low" } },
          ] },
        ],
        outputSchema: {
          name: "watch_reading", strict: true, schema: { type: "object", additionalProperties: false, properties: {
            steps: { type: ["integer", "null"] }, stepTarget: { type: ["integer", "null"] }, sleepHours: { type: ["number", "null"] }, note: { type: "string" },
          }, required: ["steps", "stepTarget", "sleepHours", "note"] },
        },
      });
      const content = response.choices[0]?.message.content;
      if (typeof content !== "string") throw new Error("The watch reading returned an unreadable response.");
      return { reading: JSON.parse(content) as { steps: number | null; stepTarget: number | null; sleepHours: number | null; note: string } };
    }),
    reviewYesterday: protectedProcedure.input(screenTimeReviewInputSchema).mutation(async ({ input }) => {
      const response = await invokeLLM({
        model: "gpt-5-mini",
        maxTokens: 700,
        messages: [
          { role: "system", content: "You are a direct, respectful personal-development reviewer. The user is voluntarily reviewing a Screen Time screenshot from YESTERDAY. Give a concise, honest review without shame or generic praise. Identify only broad usage patterns; do not name apps shown in the image. State what the pattern likely cost in practical terms and one small, concrete change to try tomorrow. Never diagnose health conditions, prescribe treatment, recommend extreme restrictions, or act as a therapist." },
          { role: "user", content: [{ type: "text", text: `Optional current priority: ${input.priority ?? "not provided"}` }, { type: "image_url", image_url: { url: input.screenTimeImage, detail: "low" } }] },
        ],
        outputSchema: { name: "yesterday_screen_time_review", strict: true, schema: { type: "object", additionalProperties: false, properties: { overview: { type: "string" }, evidence: { type: "string" }, oneChange: { type: "string" }, note: { type: "string" } }, required: ["overview", "evidence", "oneChange", "note"] } },
      });
      const content = response.choices[0]?.message.content;
      if (typeof content !== "string") throw new Error("The review returned an unreadable response.");
      return { review: JSON.parse(content) as Record<string, unknown> };
    }),
  }),
});

export type AppRouter = typeof appRouter;
