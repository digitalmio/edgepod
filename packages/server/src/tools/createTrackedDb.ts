import { getTableName } from "drizzle-orm";
import { RawDrizzleDb, EdgePodSessionMap } from "../types";
import { checkResultWarnings } from "./checkResultWarnings";
import { createSelectProxy } from "./createSelectProxy";
import { createMutationProxy } from "./createMutationProxy";
import { hashTableName } from "./hashTableName";
import { recordMutationWithCascades } from "./recordMutation";
import { createQueryProxy, type ProxyConfig } from "./createQueryProxy";

const FORBIDDEN_RAW_METHODS = ["run", "all", "get", "values", "execute"];
const MAX_LIMIT = 1000;

function createInsertProxy(
  builder: Record<string, unknown>,
  maxLimit: number,
  tableName: string,
  tablesWritten: Set<string>,
): unknown {
  const config: ProxyConfig = {
    onMethod: {
      values: (target, args, _state, factory) => {
        const rows = args[0] as unknown[];
        if (Array.isArray(rows) && rows.length > maxLimit) {
          throw new Error(
            `[EdgePod] Bulk insert blocked: ${rows.length} rows > ${maxLimit}. Split into smaller batches.`,
          );
        }
        return factory(target.values(rows), {});
      },
    },
    onExecute: (target, prop, args) => {
      if (prop === "prepare") {
        throw new Error("[EdgePod] .prepare() is not supported for inserts.");
      }
      if (tableName !== "unknown") {
        recordMutationWithCascades(tableName, tablesWritten, new Map());
      }
      return target[prop](...args);
    },
  };

  return createQueryProxy(builder, {}, config);
}

function createUpdateBuilderProxy(
  builder: Record<string, unknown>,
  warnings: string[],
  tableName: string,
  tablesWritten: Set<string>,
): unknown {
  const config: ProxyConfig = {
    onMethod: {
      set: (target, args, _state, _factory) => {
        const base = target.set(...args);
        return createMutationProxy(base, warnings, "update", tableName, tablesWritten);
      },
    },
    onExecute: (target, prop, args) => target[prop](...args),
  };

  return createQueryProxy(builder, {}, config);
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
            const tableApi = queryTarget[tableProp];
            if (!tableApi) return undefined;
            const session = activeSessions.get(sessionId);
            if (session) session.listeningToTables.add(hashTableName(tableProp));
            tablesRead.add(tableProp);
            return new Proxy(tableApi, {
              get(tableTarget: any, method: string) {
                if (method === "findMany") {
                  return function (opts: Record<string, unknown> = {}) {
                    const limit =
                      typeof opts.limit === "number" && Number.isFinite(opts.limit)
                        ? Math.max(0, Math.min(opts.limit, MAX_LIMIT))
                        : MAX_LIMIT;
                    if (typeof opts.limit === "number" && opts.limit > MAX_LIMIT) {
                      warnings.push(`Query limit of ${opts.limit} overridden to ${MAX_LIMIT}.`);
                    }
                    trackWithRelations(opts, tablesRead, activeSessions, sessionId);
                    return tableTarget.findMany({ ...opts, limit }).then((result: unknown[]) => {
                      checkResultWarnings(result, warnings, MAX_LIMIT);
                      return result;
                    });
                  };
                }
                if (method === "findFirst") {
                  return function (opts: Record<string, unknown> = {}) {
                    trackWithRelations(opts, tablesRead, activeSessions, sessionId);
                    return tableTarget.findFirst(opts);
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

function trackWithRelations(
  opts: Record<string, unknown>,
  tablesRead: Set<string>,
  activeSessions: EdgePodSessionMap,
  sessionId: string,
) {
  const withOpt = opts.with as Record<string, unknown> | undefined;
  if (!withOpt) return;
  for (const relation of Object.keys(withOpt)) {
    const session = activeSessions.get(sessionId);
    if (session) session.listeningToTables.add(hashTableName(relation));
    tablesRead.add(relation);
    trackWithRelations(
      withOpt[relation] as Record<string, unknown>,
      tablesRead,
      activeSessions,
      sessionId,
    );
  }
}
