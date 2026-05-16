import { checkResultWarnings } from "./checkResultWarnings";
import { createQueryProxy, type ProxyConfig } from "./createQueryProxy";

export function createSelectProxy(
  builder: Record<string, unknown>,
  warnings: string[],
  maxLimit: number,
): unknown {
  const config: ProxyConfig = {
    onMethod: {
      limit: (target, args, state, factory) => {
        const n = args[0] as number;
        if (n > maxLimit) {
          warnings.push(`Query limit of ${n} overridden to ${maxLimit}.`);
        }
        const clamped = Math.max(0, Math.min(n, maxLimit));
        return factory(target.limit(clamped), { ...state, limitSet: true });
      },
    },
    onExecute: (target, prop, args, state) => {
      const finalBuilder = state.limitSet ? target : target.limit(maxLimit);
      if (prop === "then") {
        const [resolve, reject] = args;
        return finalBuilder.then((result: unknown[]) => {
          checkResultWarnings(result, warnings, maxLimit);
          return (resolve as (v: unknown) => void)(result);
        }, reject);
      }
      if (prop === "prepare") {
        return finalBuilder[prop](...args);
      }
      const result = finalBuilder[prop](...args);
      checkResultWarnings(result, warnings, maxLimit);
      return result;
    },
  };

  return createQueryProxy(builder, { limitSet: false }, config);
}
