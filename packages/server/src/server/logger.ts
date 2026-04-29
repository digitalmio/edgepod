import { configure, getConsoleSink, getLogger } from "@logtape/logtape";
import type { Logger } from "@logtape/logtape";

let initialized = false;

export async function initLogger(): Promise<void> {
  if (initialized) return;
  initialized = true;
  await configure({
    sinks: { console: getConsoleSink() },
    loggers: [{ category: ["edgepod"], lowestLevel: "debug", sinks: ["console"] }],
  });
}

export function createLogger(traceId: string): Logger {
  return getLogger(["edgepod"]).with({ traceId });
}

export type { Logger };
