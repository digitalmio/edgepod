const EXECUTION_METHODS = ["run", "all", "get", "values", "execute"];

type ProxyFactory = (builder: any, state: Record<string, unknown>) => unknown;

export type ProxyConfig = {
  onMethod: Record<
    string,
    (target: any, args: unknown[], state: Record<string, unknown>, factory: ProxyFactory) => unknown
  >;
  onExecute: (
    target: any,
    prop: string,
    args: unknown[],
    state: Record<string, unknown>,
  ) => unknown;
};

export function createQueryProxy(
  builder: any,
  state: Record<string, unknown>,
  config: ProxyConfig,
): unknown {
  const factory: ProxyFactory = (b, s) => createQueryProxy(b, s, config);

  return new Proxy(builder, {
    get(target: any, prop: string) {
      // 1. Specific method intercepts (.limit, .where, .values, etc.)
      const methodHandler = config.onMethod[prop];
      if (methodHandler) {
        return function (...args: unknown[]) {
          return methodHandler(target, args, state, factory);
        };
      }

      // 2. Execution intercepts (.then, .run, .all, etc.)
      if (prop === "then" || EXECUTION_METHODS.includes(prop)) {
        return function (...args: unknown[]) {
          return config.onExecute(target, prop, args, state);
        };
      }

      // 3. Generic builder-returning method wrap
      const value = target[prop];
      if (typeof value === "function") {
        return function (...args: unknown[]) {
          const result = value.apply(target, args);
          if (result && typeof result === "object" && typeof result.then === "function") {
            return factory(result, { ...state });
          }
          return result;
        };
      }

      return value;
    },
  });
}
