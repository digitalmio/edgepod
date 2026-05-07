import { getTableName } from "drizzle-orm";
import { EdgePodSessionMap } from "../types";
import { checkResultWarnings } from "./checkResultWarnings";
import { createQueryProxy, type ProxyConfig } from "./createQueryProxy";

function trackTable(
  table: unknown,
  tablesRead: Set<string>,
  activeSessions: EdgePodSessionMap,
  sessionId: string,
) {
  const tableName = getTableName(table as any) ?? "unknown";
  if (tableName === "unknown") return;
  const session = activeSessions.get(sessionId);
  if (session) session.listeningToTables.add(tableName);
  tablesRead.add(tableName);
}

export function createSelectProxy(
  builder: Record<string, unknown>,
  sessionId: string,
  activeSessions: EdgePodSessionMap,
  tablesRead: Set<string>,
  warnings: string[],
  maxLimit: number,
): unknown {
  const config: ProxyConfig = {
    onMethod: {
      limit: (target, args, state, factory) => {
        const n = args[0] as number;
        if (n > maxLimit) {
          warnings.push(`Query limit of ${n} overridden to ${maxLimit}.`);
        }
        const clamped = Math.max(0, Math.min(n, maxLimit));
        return factory(target.limit(clamped), { ...state, limitSet: true });
      },
      from: (target, args, state, factory) => {
        trackTable(args[0], tablesRead, activeSessions, sessionId);
        return factory(target.from(...args), { ...state });
      },
      leftJoin: (target, args, state, factory) => {
        trackTable(args[0], tablesRead, activeSessions, sessionId);
        return factory(target.leftJoin(...args), { ...state });
      },
      innerJoin: (target, args, state, factory) => {
        trackTable(args[0], tablesRead, activeSessions, sessionId);
        return factory(target.innerJoin(...args), { ...state });
      },
      rightJoin: (target, args, state, factory) => {
        trackTable(args[0], tablesRead, activeSessions, sessionId);
        return factory(target.rightJoin(...args), { ...state });
      },
      fullJoin: (target, args, state, factory) => {
        trackTable(args[0], tablesRead, activeSessions, sessionId);
        return factory(target.fullJoin(...args), { ...state });
      },
    },
    onExecute: (target, prop, args, state) => {
      const finalBuilder = state.limitSet ? target : target.limit(maxLimit);
      if (prop === "then") {
        const [resolve, reject] = args;
        return finalBuilder.then((result: unknown[]) => {
          checkResultWarnings(result, warnings, maxLimit);
          return (resolve as (v: unknown) => void)(result);
        }, reject);
      }
      const result = finalBuilder[prop](...args);
      checkResultWarnings(result, warnings, maxLimit);
      return result;
    },
  };

  return createQueryProxy(builder, { limitSet: false }, config);
}
