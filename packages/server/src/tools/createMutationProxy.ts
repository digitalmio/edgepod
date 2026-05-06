const EXECUTION_METHODS = ["run", "all", "get", "values", "execute"];

export function createMutationProxy(
  builder: any,
  warnings: string[],
  mutationType: "update" | "delete",
  state = { whereSet: false, withoutWhereSet: false },
): any {
  return new Proxy(builder, {
    get(target, prop: string) {
      if (prop === "where") {
        return function (...whereArgs: any[]) {
          state.whereSet = true;
          const next = target.where.apply(target, whereArgs);
          return createMutationProxy(next, warnings, mutationType, state);
        };
      }

      if (prop === "withoutWhere") {
        return function () {
          state.withoutWhereSet = true;
          const next = target.withoutWhere.apply(target);
          return createMutationProxy(next, warnings, mutationType, state);
        };
      }

      if (prop === "then" || EXECUTION_METHODS.includes(prop)) {
        return function (...execArgs: any[]) {
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
        return function (...args: any[]) {
          const result = value.apply(target, args);
          if (result && typeof result === "object" && "then" in result) {
            return createMutationProxy(result, warnings, mutationType, state);
          }
          return result;
        };
      }

      return value;
    },
  });
}
