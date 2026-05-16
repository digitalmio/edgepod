import { RawDrizzleDb, EdgePodSessionMap } from "../types";
import { checkResultWarnings } from "./checkResultWarnings";
import { createSelectProxy } from "./createSelectProxy";
import { createMutationProxy } from "./createMutationProxy";
import { hashTableName } from "./hashTableName";
import { createTrackedClient } from "./createTrackedClient";
import { createQueryProxy, type ProxyConfig } from "./createQueryProxy";

const FORBIDDEN_RAW_METHODS = ["run", "all", "get", "values", "execute"];
const MAX_LIMIT = 1000;

function createInsertProxy(builder: Record<string, unknown>, maxLimit: number): unknown {
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
      return target[prop](...args);
    },
  };

  return createQueryProxy(builder, {}, config);
}

function createUpdateBuilderProxy(builder: Record<string, unknown>, warnings: string[]): unknown {
  const config: ProxyConfig = {
    onMethod: {
      set: (target, args, _state, _factory) => {
        const base = target.set(...args);
        return createMutationProxy(base, warnings, "update");
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
  // Wire in client-level SQL tracking if the db exposes its underlying storage
  const client = (realDb as unknown as Record<string, unknown>).$client;
  if (!client || typeof client !== "object" || !("sql" in client)) {
    console.warn("[EdgePod] Unable to wire SQL tracking: realDb.$client is missing or invalid.");
  } else {
    const trackedClient = createTrackedClient(
      client as DurableObjectStorage,
      tablesRead,
      tablesWritten,
      cascadeGraph,
    );
    const session = (realDb as unknown as Record<string, unknown>).session;
    if (!session || typeof session !== "object") {
      console.warn("[EdgePod] Unable to wire SQL tracking: realDb.session is missing.");
    } else {
      (session as Record<string, unknown>).client = trackedClient;
    }
  }

  return new Proxy(realDb as unknown as Record<string, unknown>, {
    get(target: Record<string, unknown>, prop: string) {
      if (FORBIDDEN_RAW_METHODS.includes(prop)) {
        throw new Error(
          `[EdgePod] Raw SQL via 'ctx.db.${prop}()' is blocked. Use ctx.db.select()/ctx.db.update(). ` +
            `For raw SQL, use ctx.unsafeRawDb.${prop}() and call ctx.invalidate() manually.`,
        );
      }

      if (prop === "insert") {
        return function (...args: unknown[]) {
          const builder = (target[prop] as (...a: unknown[]) => unknown).apply(target, args);
          return createInsertProxy(builder as Record<string, unknown>, MAX_LIMIT);
        };
      }

      if (prop === "update") {
        return function (...args: unknown[]) {
          const builder = (target[prop] as (...a: unknown[]) => unknown).apply(target, args);
          return createUpdateBuilderProxy(builder as Record<string, unknown>, warnings);
        };
      }

      if (prop === "delete") {
        return function (...args: unknown[]) {
          const builder = (target[prop] as (...a: unknown[]) => unknown).apply(target, args);
          return createMutationProxy(builder as Record<string, unknown>, warnings, "delete");
        };
      }

      if (prop === "query") {
        const queryObject = target.query;
        if (!queryObject) return undefined;
        return new Proxy(queryObject as Record<string, unknown>, {
          get(queryTarget: Record<string, unknown>, tableProp: string) {
            const tableApi = queryTarget[tableProp];
            if (!tableApi) return undefined;
            const session = activeSessions.get(sessionId);
            if (session) session.listeningToTables.add(hashTableName(tableProp));
            return new Proxy(tableApi as Record<string, unknown>, {
              get(tableTarget: Record<string, unknown>, method: string) {
                if (method === "findMany") {
                  return function (opts: Record<string, unknown> = {}) {
                    const limit =
                      typeof opts.limit === "number" && Number.isFinite(opts.limit)
                        ? Math.max(0, Math.min(opts.limit, MAX_LIMIT))
                        : MAX_LIMIT;
                    if (typeof opts.limit === "number" && opts.limit > MAX_LIMIT) {
                      warnings.push(`Query limit of ${opts.limit} overridden to ${MAX_LIMIT}.`);
                    }
                    trackWithRelations(opts, activeSessions, sessionId);
                    const promise = (
                      tableTarget.findMany as (...a: unknown[]) => Promise<unknown[]>
                    )({
                      ...opts,
                      limit,
                    });
                    return promise.then((result: unknown[]) => {
                      checkResultWarnings(result, warnings, MAX_LIMIT);
                      return result;
                    });
                  };
                }
                if (method === "findFirst") {
                  return function (opts: Record<string, unknown> = {}) {
                    trackWithRelations(opts, activeSessions, sessionId);
                    return (tableTarget.findFirst as (...a: unknown[]) => unknown)(opts);
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
          const builder = (target[prop] as (...a: unknown[]) => unknown).apply(target, args);
          return createSelectProxy(builder as Record<string, unknown>, warnings, MAX_LIMIT);
        };
      }

      const value = target[prop];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

function trackWithRelations(
  opts: Record<string, unknown>,
  activeSessions: EdgePodSessionMap,
  sessionId: string,
) {
  const withOpt = opts.with as Record<string, unknown> | undefined;
  if (!withOpt) return;
  for (const relation of Object.keys(withOpt)) {
    const session = activeSessions.get(sessionId);
    if (session) session.listeningToTables.add(hashTableName(relation));
    trackWithRelations(withOpt[relation] as Record<string, unknown>, activeSessions, sessionId);
  }
}
