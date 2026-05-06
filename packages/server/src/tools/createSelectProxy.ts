import { getTableName } from "drizzle-orm";
import { EdgePodSessionMap } from "../types";
import { checkResultWarnings } from "./checkResultWarnings";

const JOIN_METHODS = ["from", "leftJoin", "innerJoin", "rightJoin", "fullJoin"];

export function createSelectProxy(
  builder: Record<string, unknown>,
  sessionId: string,
  activeSessions: EdgePodSessionMap,
  tablesRead: Set<string>,
  warnings: string[],
  maxLimit: number,
  state = { limitSet: false },
): unknown {
  return new Proxy(builder as any, {
    get(target: any, prop: string) {
      if (prop === "limit") {
        return function (n: number) {
          if (n > maxLimit) {
            warnings.push(`Query limit of ${n} overridden to ${maxLimit}.`);
          }
          const clamped = Math.max(0, Math.min(n, maxLimit));
          return createSelectProxy(
            target.limit(clamped),
            sessionId,
            activeSessions,
            tablesRead,
            warnings,
            maxLimit,
            { ...state, limitSet: true },
          );
        };
      }

      if (prop === "then") {
        return function (resolve: unknown, reject: unknown) {
          const finalBuilder = state.limitSet ? target : target.limit(maxLimit);
          return finalBuilder.then((result: unknown[]) => {
            checkResultWarnings(result, warnings, maxLimit);
            return (resolve as (v: unknown) => void)(result);
          }, reject);
        };
      }

      if (JOIN_METHODS.includes(prop)) {
        return function (table: unknown, ...restArgs: unknown[]) {
          const tableName = getTableName(table as any) ?? "unknown";
          const session = activeSessions.get(sessionId);
          if (tableName !== "unknown") {
            if (session) session.listeningToTables.add(tableName);
            tablesRead.add(tableName);
          }
          return createSelectProxy(
            target[prop](table, ...restArgs),
            sessionId,
            activeSessions,
            tablesRead,
            warnings,
            maxLimit,
            { ...state },
          );
        };
      }

      const value = target[prop];
      if (typeof value === "function") {
        return function (...args: unknown[]) {
          const result = value.apply(target, args);
          if (result && typeof result === "object" && "then" in result) {
            return createSelectProxy(
              result,
              sessionId,
              activeSessions,
              tablesRead,
              warnings,
              maxLimit,
              { ...state },
            );
          }
          return result;
        };
      }

      return value;
    },
  });
}
