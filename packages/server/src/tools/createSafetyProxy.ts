import { getTableName } from "drizzle-orm";
import { createBuilderProxy } from "./createBuilderProxy";
import { addListener } from "./tracking";
import type { EdgePodSessionMap } from "../types";

const FORBIDDEN = ["run", "all", "get", "values", "execute"];

export type TrackContext = {
  sessionId: string;
  activeSessions: EdgePodSessionMap;
  tablesRead: Set<string>;
  tablesWritten: Set<string>;
  rowIds: Map<string, Set<string>>;
  cascadeGraph: Map<string, Set<string>>;
  warnings: string[];
  pkMap: Map<string, string[]>;
};

export function createSafetyProxy(rawDb: any, ctx: TrackContext): any {
  return new Proxy(rawDb, {
    get(target: any, prop: string) {
      if (FORBIDDEN.includes(prop))
        throw new Error(
          `[EdgePod] Raw SQL via 'ctx.db.${prop}()' is blocked. Use ctx.db.select()/ctx.db.update() or ctx.unsafeRawDb.${prop}().`,
        );

      if (prop === "insert")
        return (table: unknown, ...rest: unknown[]) =>
          createBuilderProxy(target.insert(table, ...rest), ctx, {
            type: "insert",
            tableName: getTableName(table as any) ?? "unknown",
          });

      if (prop === "update")
        return (table: unknown, ...rest: unknown[]) =>
          createBuilderProxy(target.update(table, ...rest), ctx, {
            type: "update",
            tableName: getTableName(table as any) ?? "unknown",
          });

      if (prop === "delete")
        return (table: unknown, ...rest: unknown[]) =>
          createBuilderProxy(target.delete(table, ...rest), ctx, {
            type: "delete",
            tableName: getTableName(table as any) ?? "unknown",
          });

      if (prop === "select" || prop === "selectDistinct")
        return (...args: unknown[]) =>
          createBuilderProxy(target[prop](...args), ctx, { type: "select" });

      if (prop === "query") {
        const q = target.query;
        return q ? createQueryApiProxy(q, ctx) : undefined;
      }

      const v = target[prop];
      return typeof v === "function" ? v.bind(target) : v;
    },
  });
}

function createQueryApiProxy(queryObject: any, ctx: TrackContext) {
  return new Proxy(queryObject, {
    get(_target: any, tableProp: string) {
      const tableApi = (_target as any)[tableProp];
      if (!tableApi) return undefined;
      return new Proxy(tableApi, {
        get(t: any, method: string) {
          if (method === "findMany")
            return (opts: Record<string, unknown> = {}) => {
              addListener(tableProp, ctx);
              trackWithRelations(opts, ctx);
              const limit =
                typeof opts.limit === "number" && Number.isFinite(opts.limit)
                  ? Math.max(0, Math.min(opts.limit, 1000))
                  : 1000;
              if (typeof opts.limit === "number" && opts.limit > 1000)
                ctx.warnings.push(`Query limit of ${opts.limit} overridden to 1000.`);
              return t.findMany({ ...opts, limit }).then((res: unknown[]) => {
                if (Array.isArray(res) && res.length === 1000)
                  ctx.warnings.push(
                    "Query returned exactly 1000 rows — there may be more results. Use .limit() and .offset() to paginate.",
                  );
                return res;
              });
            };
          if (method === "findFirst")
            return (opts: Record<string, unknown> = {}) => {
              addListener(tableProp, ctx);
              trackWithRelations(opts, ctx);
              return t.findFirst(opts);
            };
          const v = t[method];
          return typeof v === "function" ? v.bind(t) : v;
        },
      });
    },
  });
}

function trackWithRelations(opts: Record<string, unknown>, ctx: TrackContext) {
  const withOpt = opts.with as Record<string, unknown> | undefined;
  if (!withOpt) return;
  for (const relation of Object.keys(withOpt)) {
    addListener(relation, ctx);
    trackWithRelations(withOpt[relation] as Record<string, unknown>, ctx);
  }
}
