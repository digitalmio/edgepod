import { parseSqlTracking } from "./parseSqlTracking";

export function recordCascades(
  tableName: string,
  tablesWritten: Set<string>,
  cascadeGraph: Map<string, Set<string>>,
) {
  if (tablesWritten.has(tableName)) return;
  tablesWritten.add(tableName);
  const children = cascadeGraph.get(tableName);
  if (children) {
    for (const child of children) {
      recordCascades(child, tablesWritten, cascadeGraph);
    }
  }
}

export function createTrackedClient(
  storage: DurableObjectStorage,
  tablesRead: Set<string>,
  tablesWritten: Set<string>,
  cascadeGraph: Map<string, Set<string>>,
): DurableObjectStorage {
  return new Proxy(storage, {
    get(target, prop, receiver) {
      if (prop === "sql") {
        const sql = Reflect.get(target, prop, receiver);
        return new Proxy(sql, {
          get(sqlTarget, sqlProp, sqlReceiver) {
            const value = Reflect.get(sqlTarget, sqlProp, sqlReceiver);
            if (sqlProp === "exec" && typeof value === "function") {
              return (sqlStr: string, ...params: unknown[]) => {
                const parsed = parseSqlTracking(sqlStr, params);
                for (const t of parsed.tablesRead) tablesRead.add(t);
                for (const t of parsed.tablesWritten) {
                  recordCascades(t, tablesWritten, cascadeGraph);
                }
                return value.apply(sqlTarget, [sqlStr, ...params]);
              };
            }
            return typeof value === "function" ? value.bind(sqlTarget) : value;
          },
        });
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as DurableObjectStorage;
}
