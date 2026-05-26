// This is where you define your Edgepod cron jobs!
// Cron jobs run on a schedule inside your Durable Object using Cloudflare's alarm API.
// They execute even when no requests are incoming — perfect for cleanup, reminders, etc.
//
// Define a cron job using the schedule() helper and export it:
//
//   import { createSchedule } from "@edgepod/server";
//   import type { CronCtx } from "../types";
//
//   export const cleanupExpiredSessions = createSchedule("0 */6 * * *", async (ctx: CronCtx) => {
//     await ctx.db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
//   });
//
export {};
