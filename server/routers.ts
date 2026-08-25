import { COOKIE_NAME } from "@shared/const";
import { getCourseProgressByUserId, saveCourseProgress } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { courseProgressPayloadSchema } from "./progressSchema";
import { buildLeavePlan, buildSchedule, leaveInputSchema, scheduleInputSchema } from "./coach";

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
  coach: router({
    // Public: the coach helps whether or not someone has signed in, in keeping
    // with the course never putting an account between a learner and the work.
    schedule: publicProcedure.input(scheduleInputSchema).mutation(({ input }) => buildSchedule(input)),
    leavePlan: publicProcedure.input(leaveInputSchema).mutation(({ input }) => buildLeavePlan(input)),
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
});

export type AppRouter = typeof appRouter;
