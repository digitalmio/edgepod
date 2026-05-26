import type { CronDefinition, CronContext } from "../types";

export function createSchedule<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
  TEnv = Record<string, string>,
  TVariables extends Record<string, unknown> = Record<string, unknown>,
>(
  schedule: string,
  handler: (ctx: CronContext<TSchema, TEnv, TVariables>) => Promise<unknown>,
): CronDefinition<TSchema, TEnv, TVariables> {
  return { schedule, handler } as CronDefinition<TSchema, TEnv, TVariables>;
}
