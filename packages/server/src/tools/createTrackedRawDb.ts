import { trackExec } from "./tracking";
import type { TrackContext } from "./createSafetyProxy";

const RAW_EXEC = ["run", "all", "get", "values", "execute"];

export function createTrackedRawDb(rawDb: any, ctx: TrackContext): any {
  return new Proxy(rawDb, {
    get(target: any, prop: string) {
      if (RAW_EXEC.includes(prop))
        return (...args: unknown[]) => {
          let sql: string;
          let params: unknown[];

          const firstArg = args[0];
          if (
            firstArg &&
            typeof firstArg === "object" &&
            "queryChunks" in firstArg &&
            target.dialect?.sqlToQuery
          ) {
            const query = target.dialect.sqlToQuery(firstArg);
            sql = query.sql;
            params = query.params;
          } else {
            sql = String(firstArg);
            params = args.slice(1).filter((p) => p !== undefined);
          }

          trackExec({ toSQL: () => ({ sql, params }) }, ctx);
          const method = target[prop] as Function;
          return method.call(target, ...args);
        };
      const v = target[prop];
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}
