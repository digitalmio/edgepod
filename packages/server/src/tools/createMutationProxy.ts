import { recordCascades } from "./createTrackedClient";
import { createQueryProxy, type ProxyConfig } from "./createQueryProxy";

export function createMutationProxy(
  builder: Record<string, unknown>,
  warnings: string[],
  mutationType: "update" | "delete",
  tableName?: string,
  tablesWritten?: Set<string>,
  cascadeGraph?: Map<string, Set<string>>,
  initialState = { whereSet: false, withoutWhereSet: false },
): unknown {
  const config: ProxyConfig = {
    onMethod: {
      where: (target, args, proxyState, factory) => {
        return factory(target.where(...args), { ...proxyState, whereSet: true });
      },
      withoutWhere: (target, _args, proxyState, factory) => {
        warnings.push(`[EdgePod] Unfiltered ${mutationType} executed via .withoutWhere().`);
        return factory(target.withoutWhere(), { ...proxyState, withoutWhereSet: true });
      },
    },
    onExecute: (target, prop, args, proxyState) => {
      if (prop === "prepare") {
        throw new Error(`[EdgePod] .prepare() is not supported for ${mutationType}s.`);
      }
      if (!proxyState.whereSet && !proxyState.withoutWhereSet) {
        throw new Error(
          `[EdgePod] ${mutationType.toUpperCase()} without WHERE is blocked. If intentional, chain .withoutWhere().`,
        );
      }
      if (tableName && tableName !== "unknown" && tablesWritten) {
        recordCascades(tableName, tablesWritten, cascadeGraph ?? new Map());
      }
      return target[prop](...args);
    },
  };

  return createQueryProxy(builder, initialState, config);
}
