const EXECUTION_METHODS = ["run", "all", "get", "values", "execute"];

export function createMutationProxy(
  builder: Record<string, unknown>,
  warnings: string[],
  mutationType: "update" | "delete",
  state = { whereSet: false, withoutWhereSet: false },
): Record<string, unknown> {
  return new Proxy(builder, {
    get(target, prop: string) {
      if (prop === "where") {
        return function (...whereArgs: unknown[]) {
          const next = target.where.apply(target, whereArgs);
          return createMutationProxy(next, warnings, mutationType, { ...state, whereSet: true });
        };
      }

      if (prop === "withoutWhere") {
        return function () {
          const next = target.withoutWhere.apply(target);
          return createMutationProxy(next, warnings, mutationType, {
            ...state,
            withoutWhereSet: true,
          });
        };
      }

      if (prop === "then" || EXECUTION_METHODS.includes(prop)) {
        return function (...execArgs: unknown[]) {
          if (!state.whereSet && !state.withoutWhereSet) {
            throw new Error(
              `[EdgePod] ${mutationType.toUpperCase()} without WHERE is blocked. If intentional, chain .withoutWhere().`,
            );
          }
          return target[prop].apply(target, execArgs);
        };
      }

      const value = target[prop];
      if (typeof value === "function") {
        return function (...args: unknown[]) {
          const result = value.apply(target, args);
          if (result && typeof result === "object" && "then" in result) {
            return createMutationProxy(result, warnings, mutationType, { ...state });
          }
          return result;
        };
      }

      return value;
    },
  });
}
