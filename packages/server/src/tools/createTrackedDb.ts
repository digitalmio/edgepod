import { getTableName } from "drizzle-orm";
import { RawDrizzleDb, EdgePodSessionMap } from "../types";

const FORBIDDEN_RAW_METHODS = ["run", "all", "get", "values", "execute"];
const JOIN_METHODS = ["from", "leftJoin", "innerJoin", "rightJoin", "fullJoin"];
const MUTATION_METHODS = ["insert", "update", "delete"];

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

/**
 * Wraps a Drizzle instance in a Proxy to automatically track which tables
 * are read (for subscriptions) and written (for invalidations).
 */
export function createTrackedDb<TSchema extends Record<string, unknown>>(
  realDb: RawDrizzleDb<TSchema>,
  sessionId: string,
  activeSessions: EdgePodSessionMap,
  tablesWritten: Set<string>,
  cascadeGraph: Map<string, Set<string>>
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

          // execute the original Drizzle call
          return (target as any)[prop].apply(target, [table, ...restArgs]);
        };
      }

      // Query
      if (prop === "query") {
        const queryObject = (target as any).query;
        if (!queryObject) return undefined;

        return new Proxy(queryObject, {
          get(queryTarget, tableProp: string) {
            const session = activeSessions.get(sessionId);
            if (session) session.listeningToTables.add(tableProp);
            return queryTarget[tableProp];
          },
        });
      }

      // Selects (Reads & Joins)
      if (prop === "select" || prop === "selectDistinct") {
        return function (...args: any[]) {
          const queryBuilder = (target as any)[prop].apply(target, args);

          return new Proxy(queryBuilder, {
            get(builderTarget, builderProp: string) {
              if (JOIN_METHODS.includes(builderProp)) {
                return function (table: any, ...restArgs: any[]) {
                  const tableName = getTableName(table) ?? "unknown";

                  const session = activeSessions.get(sessionId);
                  if (session && tableName !== "unknown") {
                    session.listeningToTables.add(tableName);
                  }

                  return builderTarget[builderProp].apply(builderTarget, [table, ...restArgs]);
                };
              }

              const value = builderTarget[builderProp];
              return typeof value === "function" ? value.bind(builderTarget) : value;
            },
          });
        };
      }

      // All the rest, just pass directly to the real Drizzle instance
      const value = (target as any)[prop];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}
