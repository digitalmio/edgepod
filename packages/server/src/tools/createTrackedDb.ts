import { getTableName } from "drizzle-orm";
import { RawDrizzleDb, EdgePodSessionMap } from "../types";
import { checkResultWarnings } from "./checkResultWarnings";
import { createSelectProxy } from "./createSelectProxy";
import { createMutationProxy } from "./createMutationProxy";

const FORBIDDEN_RAW_METHODS = ["run", "all", "get", "values", "execute"];
const MAX_LIMIT = 1000;

function recordMutationWithCascades(
  tableName: string,
  tablesWritten: Set<string>,
  cascadeGraph: Map<string, Set<string>>,
) {
  if (tablesWritten.has(tableName)) return;
  tablesWritten.add(tableName);
  const children = cascadeGraph.get(tableName);
  if (children) {
    for (const child of children) {
      recordMutationWithCascades(child, tablesWritten, cascadeGraph);
    }
  }
}

function createInsertProxy(builder: any, maxLimit: number) {
  return new Proxy(builder, {
    get(builderTarget, builderProp: string) {
      if (builderProp === "values") {
        return function (rows: any) {
          if (Array.isArray(rows) && rows.length > maxLimit) {
            throw new Error(
              `[EdgePod] Bulk insert blocked: ${rows.length} rows > ${maxLimit}. Split into smaller batches.`,
            );
          }
          return builderTarget.values(rows);
        };
      }
      const value = builderTarget[builderProp];
      return typeof value === "function" ? value.bind(builderTarget) : value;
    },
  });
}

function createUpdateBuilderProxy(builder: any, warnings: string[]) {
  return new Proxy(builder, {
    get(builderTarget, builderProp: string) {
      if (builderProp === "set") {
        return function (...setArgs: any[]) {
          const base = builderTarget.set.apply(builderTarget, setArgs);
          return createMutationProxy(base, warnings, "update");
        };
      }
      const value = builderTarget[builderProp];
      return typeof value === "function" ? value.bind(builderTarget) : value;
    },
  });
}

/**
 * Wraps a Drizzle instance in a Proxy to automatically track which tables
 * are read (for subscriptions) and written (for invalidations).
 */
export function createTrackedDb<TSchema extends Record<string, unknown>>(
  realDb: RawDrizzleDb<TSchema>,
  sessionId: string,
  activeSessions: EdgePodSessionMap,
  tablesRead: Set<string>,
  tablesWritten: Set<string>,
  cascadeGraph: Map<string, Set<string>>,
  warnings: string[],
) {
  return new Proxy(realDb, {
    get(target, prop: string) {
      if (FORBIDDEN_RAW_METHODS.includes(prop)) {
        throw new Error(
          `[EdgePod] Raw SQL via 'ctx.db.${prop}()' is blocked. Use ctx.db.select()/ctx.db.update(). ` +
            `For raw SQL, use ctx.unsafeRawDb.${prop}() and call ctx.invalidate() manually.`,
        );
      }

      if (prop === "insert") {
        return function (table: any, ...restArgs: any[]) {
          const tableName = getTableName(table) ?? "unknown";
          if (tableName !== "unknown") {
            recordMutationWithCascades(tableName, tablesWritten, new Map());
          }
          const builder = (target as any)[prop].apply(target, [table, ...restArgs]);
          return createInsertProxy(builder, MAX_LIMIT);
        };
      }

      if (prop === "update") {
        return function (table: any, ...restArgs: any[]) {
          const tableName = getTableName(table) ?? "unknown";
          if (tableName !== "unknown") {
            recordMutationWithCascades(tableName, tablesWritten, new Map());
          }
          const builder = (target as any)[prop].apply(target, [table, ...restArgs]);
          return createUpdateBuilderProxy(builder, warnings);
        };
      }

      if (prop === "delete") {
        return function (table: any, ...restArgs: any[]) {
          const tableName = getTableName(table) ?? "unknown";
          if (tableName !== "unknown") {
            recordMutationWithCascades(tableName, tablesWritten, cascadeGraph);
          }
          const builder = (target as any)[prop].apply(target, [table, ...restArgs]);
          return createMutationProxy(builder, warnings, "delete");
        };
      }

      if (prop === "query") {
        const queryObject = (target as any).query;
        if (!queryObject) return undefined;
        return new Proxy(queryObject, {
          get(queryTarget, tableProp: string) {
            const session = activeSessions.get(sessionId);
            if (session) session.listeningToTables.add(tableProp);
            tablesRead.add(tableProp);
            const tableApi = queryTarget[tableProp];
            return new Proxy(tableApi, {
              get(tableTarget, method: string) {
                if (method === "findMany") {
                  return function (opts: Record<string, any> = {}) {
                    const limit =
                      typeof opts.limit === "number" ? Math.min(opts.limit, MAX_LIMIT) : MAX_LIMIT;
                    if (typeof opts.limit === "number" && opts.limit > MAX_LIMIT) {
                      warnings.push(`Query limit of ${opts.limit} overridden to ${MAX_LIMIT}.`);
                    }
                    return tableTarget.findMany({ ...opts, limit }).then((result: any[]) => {
                      checkResultWarnings(result, warnings, MAX_LIMIT);
                      return result;
                    });
                  };
                }
                const value = tableTarget[method];
                return typeof value === "function" ? value.bind(tableTarget) : value;
              },
            });
          },
        });
      }

      if (prop === "select" || prop === "selectDistinct") {
        return function (...args: any[]) {
          return createSelectProxy(
            (target as any)[prop].apply(target, args),
            sessionId,
            activeSessions,
            tablesRead,
            warnings,
            MAX_LIMIT,
          );
        };
      }

      const value = (target as any)[prop];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
