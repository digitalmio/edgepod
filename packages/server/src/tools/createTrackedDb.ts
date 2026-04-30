import { getTableName } from "drizzle-orm";
import { RawDrizzleDb, EdgePodSessionMap } from "../types";

const FORBIDDEN_RAW_METHODS = ["run", "all", "get", "values", "execute"];
const JOIN_METHODS = ["from", "leftJoin", "innerJoin", "rightJoin", "fullJoin"];
const MUTATION_METHODS = ["insert", "update", "delete"];
const MAX_LIMIT = 1000;

function recordMutationWithCascades(
  tableName: string,
  tablesWritten: Set<string>,
  cascadeGraph: Map<string, Set<string>>
) {
  if (tablesWritten.has(tableName)) return; // Prevent infinite loops

  tablesWritten.add(tableName);

  const children = cascadeGraph.get(tableName);
  if (children) {
    for (const child of children) {
      recordMutationWithCascades(child, tablesWritten, cascadeGraph);
    }
  }
}

function checkResultWarnings(result: unknown, warnings: string[]) {
  if (Array.isArray(result) && result.length === MAX_LIMIT) {
    warnings.push(
      `Query returned exactly ${MAX_LIMIT} rows — there may be more results. Use .limit() and .offset() to paginate.`
    );
  }
}

function createSelectProxy(
  builder: any,
  sessionId: string,
  activeSessions: EdgePodSessionMap,
  warnings: string[],
  state = { limitSet: false }
): any {
  return new Proxy(builder, {
    get(target, prop: string) {
      if (prop === "limit") {
        return function (n: number) {
          state.limitSet = true;
          if (n > MAX_LIMIT) {
            warnings.push(`Query limit of ${n} overridden to ${MAX_LIMIT}.`);
          }
          return createSelectProxy(
            target.limit(Math.min(n, MAX_LIMIT)),
            sessionId,
            activeSessions,
            warnings,
            state
          );
        };
      }

      if (prop === "then") {
        return function (resolve: any, reject: any) {
          const finalBuilder = state.limitSet ? target : target.limit(MAX_LIMIT);
          return finalBuilder.then((result: any) => {
            checkResultWarnings(result, warnings);
            return resolve(result);
          }, reject);
        };
      }

      if (JOIN_METHODS.includes(prop)) {
        return function (table: any, ...restArgs: any[]) {
          const tableName = getTableName(table) ?? "unknown";
          const session = activeSessions.get(sessionId);
          if (session && tableName !== "unknown") session.listeningToTables.add(tableName);
          return createSelectProxy(
            target[prop](table, ...restArgs),
            sessionId,
            activeSessions,
            warnings,
            state
          );
        };
      }

      const value = target[prop];
      if (typeof value === "function") {
        return function (...args: any[]) {
          const result = value.apply(target, args);
          if (result && typeof result === "object" && "then" in result) {
            return createSelectProxy(result, sessionId, activeSessions, warnings, state);
          }
          return result;
        };
      }

      return value;
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
  tablesWritten: Set<string>,
  cascadeGraph: Map<string, Set<string>>,
  warnings: string[]
) {
  return new Proxy(realDb, {
    get(target, prop: string) {
      // simple blocker of the unsafe methods
      if (FORBIDDEN_RAW_METHODS.includes(prop)) {
        throw new Error(
          `[EdgePod] Raw SQL execution via 'ctx.db.${prop}()' is blocked to preserve real-time reactivity.
Please use the standard Drizzle query builder (e.g., ctx.db.select(), ctx.db.update()).
If you absolutely need raw SQL, use 'ctx.unsafeRawDb.${prop}()' and call 'ctx.invalidate()' manually.`
        );
      }

      // Mutations (insert, update, delete)
      if (MUTATION_METHODS.includes(prop)) {
        return function (table: any, ...restArgs: any[]) {
          const tableName = getTableName(table) ?? "unknown";

          if (tableName !== "unknown") {
            // record the mutation AND automatically flag cascading children
            recordMutationWithCascades(tableName, tablesWritten, cascadeGraph);
          }

          const builder = (target as any)[prop].apply(target, [table, ...restArgs]);

          // Cap bulk inserts — intercept .values() on the insert builder
          if (prop === "insert") {
            return new Proxy(builder, {
              get(builderTarget, builderProp: string) {
                if (builderProp === "values") {
                  return function (rows: any) {
                    if (Array.isArray(rows) && rows.length > MAX_LIMIT) {
                      throw new Error(
                        `[EdgePod] Bulk insert blocked: ${rows.length} rows exceeds the ${MAX_LIMIT}-row limit. ` +
                          `Split your data into batches of ${MAX_LIMIT} or fewer.`
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

          return builder;
        };
      }

      // Relational query API
      if (prop === "query") {
        const queryObject = (target as any).query;
        if (!queryObject) return undefined;

        return new Proxy(queryObject, {
          get(queryTarget, tableProp: string) {
            const session = activeSessions.get(sessionId);
            if (session) session.listeningToTables.add(tableProp);

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
                      checkResultWarnings(result, warnings);
                      return result;
                    });
                  };
                }
                // findFirst is implicitly LIMIT 1 — no cap needed
                const value = tableTarget[method];
                return typeof value === "function" ? value.bind(tableTarget) : value;
              },
            });
          },
        });
      }

      // Selects (Reads & Joins)
      if (prop === "select" || prop === "selectDistinct") {
        return function (...args: any[]) {
          return createSelectProxy(
            (target as any)[prop].apply(target, args),
            sessionId,
            activeSessions,
            warnings
          );
        };
      }

      // All the rest, just pass directly to the real Drizzle instance
      const value = (target as any)[prop];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
