import { recordMutationWithCascades } from "./recordMutation";
import { createQueryProxy, type ProxyConfig } from "./createQueryProxy";

export function createMutationProxy(
  builder: Record<string, unknown>,
  warnings: string[],
  mutationType: "update" | "delete",
  initialState = { whereSet: false, withoutWhereSet: false },
  tableName?: string,
  tablesWritten?: Set<string>,
  cascadeGraph?: Map<string, Set<string>>,
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
      if (!proxyState.whereSet && !proxyState.withoutWhereSet) {
        throw new Error(
          `[EdgePod] ${mutationType.toUpperCase()} without WHERE is blocked. If intentional, chain .withoutWhere().`,
        );
      }
      if (tableName && tablesWritten) {
        recordMutationWithCascades(tableName, tablesWritten, cascadeGraph ?? new Map());
      }
      return target[prop](...args);
    },
  };

  return createQueryProxy(builder, initialState, config);
}
