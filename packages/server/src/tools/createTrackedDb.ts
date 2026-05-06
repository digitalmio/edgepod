import { getTableName } from "drizzle-orm";
import { RawDrizzleDb, EdgePodSessionMap } from "../types";
import { checkResultWarnings } from "./checkResultWarnings";
import { createSelectProxy } from "./createSelectProxy";
import { createMutationProxy } from "./createMutationProxy";

const FORBIDDEN_RAW_METHODS = ["run", "all", "get", "values", "execute"];
const MAX_LIMIT = 1000;

function createInsertProxy(
  builder: Record<string, unknown>,
  maxLimit: number,
  tableName: string,
  tablesWritten: Set<string>,
): unknown {
  return new Proxy(builder as any, {
    get(builderTarget: any, builderProp: string) {
      if (builderProp === "values") {
        return function (rows: unknown[]) {
          if (Array.isArray(rows) && rows.length > maxLimit) {
            throw new Error(
              `[EdgePod] Bulk insert blocked: ${rows.length} rows > ${maxLimit}. Split into smaller batches.`,
            );
          }
          recordMutationWithCascades(tableName, tablesWritten, new Map());
          return builderTarget.values(rows);
        };
      }
      const value = builderTarget[builderProp];
      return typeof value === "function" ? value.bind(builderTarget) : value;
    },
  });
}

function createUpdateBuilderProxy(
  builder: Record<string, unknown>,
  warnings: string[],
  tableName: string,
  tablesWritten: Set<string>,
): unknown {
  return new Proxy(builder as any, {
    get(builderTarget: any, builderProp: string) {
      if (builderProp === "set") {
        return function (...setArgs: unknown[]) {
          const base = builderTarget.set.apply(builderTarget, setArgs);
          return createMutationProxy(base, warnings, "update", undefined, tableName, tablesWritten);
        };
      }
      const value = builderTarget[builderProp];
      return typeof value === "function" ? value.bind(builderTarget) : value;
    },
  });
}

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
): unknown {
  return new Proxy(realDb as any, {
    get(target: any, prop: string) {
      if (FORBIDDEN_RAW_METHODS.includes(prop)) {
        throw new Error(
          `[EdgePod] Raw SQL via 'ctx.db.${prop}()' is blocked. Use ctx.db.select()/ctx.db.update(). ` +
            `For raw SQL, use ctx.unsafeRawDb.${prop}() and call ctx.invalidate() manually.`,
        );
      }

      if (prop === "insert") {
        return function (table: unknown, ...restArgs: unknown[]) {
          const tableName = getTableName(table as any) ?? "unknown";
          const builder = target[prop].apply(target, [table, ...restArgs]);
          return createInsertProxy(builder, MAX_LIMIT, tableName, tablesWritten);
        };
      }

      if (prop === "update") {
        return function (table: unknown, ...restArgs: unknown[]) {
          const tableName = getTableName(table as any) ?? "unknown";
          const builder = target[prop].apply(target, [table, ...restArgs]);
          return createUpdateBuilderProxy(builder, warnings, tableName, tablesWritten);
        };
      }

      if (prop === "delete") {
        return function (table: unknown, ...restArgs: unknown[]) {
          const tableName = getTableName(table as any) ?? "unknown";
          const builder = target[prop].apply(target, [table, ...restArgs]);
          return createMutationProxy(
            builder,
            warnings,
            "delete",
            undefined,
            tableName,
            tablesWritten,
            cascadeGraph,
          );
        };
      }

      if (prop === "query") {
        const queryObject = target.query;
        if (!queryObject) return undefined;
        return new Proxy(queryObject, {
          get(queryTarget: any, tableProp: string) {
            const session = activeSessions.get(sessionId);
            if (session) session.listeningToTables.add(tableProp);
            tablesRead.add(tableProp);
            const tableApi = queryTarget[tableProp];
            return new Proxy(tableApi, {
              get(tableTarget: any, method: string) {
                if (method === "findMany") {
                  return function (opts: Record<string, unknown> = {}) {
                    const limit =
                      typeof opts.limit === "number" ? Math.min(opts.limit, MAX_LIMIT) : MAX_LIMIT;
                    if (typeof opts.limit === "number" && opts.limit > MAX_LIMIT) {
                      warnings.push(`Query limit of ${opts.limit} overridden to ${MAX_LIMIT}.`);
                    }
                    return tableTarget.findMany({ ...opts, limit }).then((result: unknown[]) => {
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
        return function (...args: unknown[]) {
          return createSelectProxy(
            target[prop].apply(target, args),
            sessionId,
            activeSessions,
            tablesRead,
            warnings,
            MAX_LIMIT,
          );
        };
      }

      const value = target[prop];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
