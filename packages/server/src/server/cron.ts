import { Cron } from "croner";
import { createTrackedDb } from "../tools/createTrackedDb";
import { createLogger } from "./logger";
import { hashMetaTableNames } from "../tools/hashTableName";
import type { CronContext, CronDefinition, EdgePodSessionMap } from "../types";

export async function scheduleNextAlarm(
  cronFunctions: Record<string, CronDefinition<any, any, any>>,
  setAlarm: (ms: number) => Promise<void>,
) {
  const now = new Date();
  let soonestMs: number | null = null;

  for (const entry of Object.values(cronFunctions)) {
    try {
      const cron = new Cron(entry.schedule, { timezone: "UTC" });
      const nextRuns = cron.nextRuns(1, now);
      const nextRun = nextRuns[0];
      if (nextRun) {
        const nextMs = nextRun.getTime();
        if (soonestMs === null || nextMs < soonestMs) {
          soonestMs = nextMs;
        }
      }
    } catch (e) {
      console.error(
        "[EdgePod] Failed to parse cron schedule:",
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  if (soonestMs !== null) {
    await setAlarm(soonestMs);
  }
}

export async function executeCron(
  name: string,
  def: CronDefinition<any, any, any>,
  scheduledTime: Date,
  rawDb: any,
  env: any,
  activeSessions: EdgePodSessionMap,
  cascadeGraph: Map<string, Set<string>>,
  broadcastInvalidations: (tables: string[]) => void,
) {
  const traceId = `cron:${name}:${scheduledTime.getTime()}`;

  const tablesRead = new Set<string>();
  const tablesWritten = new Set<string>();
  const warnings: string[] = [];
  const variableStore = new Map();

  const dbProxy = createTrackedDb(
    rawDb,
    `cron:${name}`,
    activeSessions,
    tablesRead,
    tablesWritten,
    cascadeGraph,
    warnings,
  );

  const ctx: CronContext<any, any, Record<string, any>> = {
    db: dbProxy as any,
    unsafeRawDb: rawDb,
    env,
    log: createLogger(traceId),
    subscribeTo: (_tables: string[]) => {},
    invalidate: (tables: string[]) => tables.forEach((t) => tablesWritten.add(t)),
    set: (key: string, value: any) => variableStore.set(key, value),
    get: (key: string) => variableStore.get(key) as any,
    cron: def.schedule,
    scheduledTime: scheduledTime.toISOString(),
  };

  await def.handler(ctx);

  if (tablesWritten.size > 0) {
    const hashedTableNames = hashMetaTableNames(Array.from(tablesWritten));
    broadcastInvalidations(hashedTableNames);
  }
}

export async function handleCronAlarm(
  cronFunctions: Record<string, CronDefinition<any, any, any>>,
  setAlarm: (ms: number) => Promise<void>,
  rawDb: any,
  env: any,
  activeSessions: EdgePodSessionMap,
  cascadeGraph: Map<string, Set<string>>,
  broadcastInvalidations: (tables: string[]) => void,
) {
  const now = new Date();
  const checkFrom = new Date(now.getTime() - 120000);

  for (const [name, entry] of Object.entries(cronFunctions)) {
    try {
      const cron = new Cron(entry.schedule, { timezone: "UTC" });
      const nextRuns = cron.nextRuns(1, checkFrom);
      const nextRun = nextRuns[0];
      if (nextRun && nextRun.getTime() <= now.getTime()) {
        await executeCron(
          name,
          entry,
          nextRun,
          rawDb,
          env,
          activeSessions,
          cascadeGraph,
          broadcastInvalidations,
        );
      }
    } catch (e) {
      console.error(`[EdgePod] Cron "${name}" failed:`, e instanceof Error ? e.message : String(e));
    }
  }

  await scheduleNextAlarm(cronFunctions, setAlarm);
}
