import type { TrackContext } from "./createSafetyProxy";
import { trackExec, warnRowLimit } from "./tracking";

const STATE = Symbol("edgepod_builder_state");
const EXEC = ["then", "run", "all", "get", "values", "execute"];
const MAX_LIMIT = 1000;
const MAX_BULK_INSERT = 1000;

type BuilderConfig = {
  type: "select" | "insert" | "update" | "delete";
  tableName?: string;
};

export function createBuilderProxy(builder: any, ctx: TrackContext, config: BuilderConfig): any {
  if (!builder[STATE]) {
    builder[STATE] = { limitSet: false, whereSet: false, withoutWhereSet: false };
  }

  return new Proxy(builder, {
    get(target: any, prop: string) {
      const state: { limitSet: boolean; whereSet: boolean; withoutWhereSet: boolean } = target[
        STATE
      ] || { limitSet: false, whereSet: false, withoutWhereSet: false };

      // Safety: limit clamping for SELECT
      if (prop === "limit" && config.type === "select")
        return (n: number) => {
          const clamped = Math.max(0, Math.min(n, MAX_LIMIT));
          if (n > MAX_LIMIT) ctx.warnings.push(`Query limit of ${n} overridden to ${MAX_LIMIT}.`);
          return wrap(target.limit(clamped), ctx, config, { ...state, limitSet: true });
        };

      // Safety: WHERE enforcement for UPDATE/DELETE
      if (prop === "where" && (config.type === "update" || config.type === "delete"))
        return (...args: unknown[]) =>
          wrap(target.where(...args), ctx, config, { ...state, whereSet: true });
      if (prop === "withoutWhere" && (config.type === "update" || config.type === "delete"))
        return () => {
          ctx.warnings.push(`[EdgePod] Unfiltered ${config.type} executed via .withoutWhere().`);
          return wrap(target.withoutWhere(), ctx, config, { ...state, withoutWhereSet: true });
        };

      // Safety: bulk insert limit
      if (prop === "values" && config.type === "insert")
        return (...args: unknown[]) => {
          const rows = args[0];
          if (Array.isArray(rows) && rows.length > MAX_BULK_INSERT)
            throw new Error(
              `[EdgePod] Bulk insert blocked: ${rows.length} rows > ${MAX_BULK_INSERT}. Split into smaller batches.`,
            );
          return wrap(target.values(...args), ctx, config, state);
        };

      // Safety: prepare
      if (prop === "prepare" && config.type !== "select")
        return () => {
          throw new Error(`[EdgePod] .prepare() is not supported for ${config.type}s.`);
        };
      if (prop === "prepare")
        return (...args: unknown[]) => {
          const b = state.limitSet ? target : target.limit(MAX_LIMIT);
          return (b as any).prepare(...args);
        };

      // Execution: safety check → track → execute
      if (EXEC.includes(prop))
        return (...args: unknown[]) => {
          if (
            !state.whereSet &&
            !state.withoutWhereSet &&
            (config.type === "update" || config.type === "delete")
          )
            throw new Error(
              `[EdgePod] ${config.type.toUpperCase()} without WHERE is blocked. If intentional, chain .withoutWhere().`,
            );

          let b = target;
          if (config.type === "select" && !state.limitSet) b = target.limit(MAX_LIMIT);

          trackExec(b, ctx, config.tableName, config.type);

          if (prop === "then") {
            const [resolve, reject] = args as [(v: unknown) => void, (e: unknown) => void];
            return b.then((res: unknown) => {
              warnRowLimit(res, ctx.warnings);
              resolve(res);
            }, reject);
          }

          const method = b[prop] as Function;
          const result = method.apply(b, args);
          warnRowLimit(result, ctx.warnings);
          return result;
        };

      // Generic pass-through: wrap if result is a builder
      return passThrough(target, prop, ctx, config, state);
    },
  });
}

function wrap(
  result: any,
  ctx: TrackContext,
  config: BuilderConfig,
  state: { limitSet: boolean; whereSet: boolean; withoutWhereSet: boolean },
): any {
  if (isBuilder(result)) {
    result[STATE] = state;
    return createBuilderProxy(result, ctx, config);
  }
  return result;
}

function passThrough(
  target: any,
  prop: string,
  ctx: TrackContext,
  config: BuilderConfig,
  state: { limitSet: boolean; whereSet: boolean; withoutWhereSet: boolean },
): any {
  const raw = target[prop];
  if (typeof raw === "function")
    return (...args: unknown[]) => {
      const result = raw.apply(target, args);
      return isBuilder(result)
        ? createBuilderProxy(Object.assign(result, { [STATE]: state }), ctx, config)
        : result;
    };
  if (isBuilder(raw)) {
    raw[STATE] = state;
    return createBuilderProxy(raw, ctx, config);
  }
  return raw;
}

function isBuilder(v: unknown): boolean {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
