import { getTableName } from "drizzle-orm";
import { EdgePodSessionMap } from "../types";
import { checkResultWarnings } from "./checkResultWarnings";

const JOIN_METHODS = ["from", "leftJoin", "innerJoin", "rightJoin", "fullJoin"];

export function createSelectProxy(
  builder: any,
  sessionId: string,
  activeSessions: EdgePodSessionMap,
  tablesRead: Set<string>,
  warnings: string[],
  maxLimit: number,
  state = { limitSet: false },
): any {
  return new Proxy(builder, {
    get(target, prop: string) {
      if (prop === "limit") {
        return function (n: number) {
          state.limitSet = true;
          if (n > maxLimit) {
            warnings.push(`Query limit of ${n} overridden to ${maxLimit}.`);
          }
          return createSelectProxy(
            target.limit(Math.min(n, maxLimit)),
            sessionId,
            activeSessions,
            tablesRead,
            warnings,
            maxLimit,
            state,
          );
        };
      }

      if (prop === "then") {
        return function (resolve: any, reject: any) {
          const finalBuilder = state.limitSet ? target : target.limit(maxLimit);
          return finalBuilder.then((result: any) => {
            checkResultWarnings(result, warnings, maxLimit);
            return resolve(result);
          }, reject);
        };
      }

      if (JOIN_METHODS.includes(prop)) {
        return function (table: any, ...restArgs: any[]) {
          const tableName = getTableName(table) ?? "unknown";
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
            state,
          );
        };
      }

      const value = target[prop];
      if (typeof value === "function") {
        return function (...args: any[]) {
          const result = value.apply(target, args);
          if (result && typeof result === "object" && "then" in result) {
            return createSelectProxy(
              result,
              sessionId,
              activeSessions,
              tablesRead,
              warnings,
              maxLimit,
              state,
            );
          }
          return result;
        };
      }

      return value;
    },
  });
}
