import { COOKIE_NAME } from "@shared/const";
import { getCourseProgressByUserId, saveCourseProgress } from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { courseProgressPayloadSchema } from "./progressSchema";

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
});

export type AppRouter = typeof appRouter;
