import { type SWRMutationConfiguration } from "swr/mutation";
import { type SWRConfiguration } from "swr";
import { useQuery as useQueryHook } from "./hooks/useQuery";
import { useMutation as useMutationHook } from "./hooks/useMutation";

type InferRouter<T extends Record<string, (...args: any[]) => any>> = {
  [K in keyof T]: {
    args: Parameters<T[K]> extends [any, infer A] ? A : undefined;
    returns: Awaited<ReturnType<T[K]>>;
  };
};

export function createEdgePodClient<T extends Record<string, (...args: any[]) => any>>() {
  return {
    useQuery<K extends keyof T & string>(
      functionName: K,
      args?: InferRouter<T>[K]["args"] | null,
      config?: SWRConfiguration,
    ) {
      return useQueryHook<InferRouter<T>[K]["returns"]>(functionName, args, config);
    },

    useMutation<K extends keyof T & string>(functionName: K, config?: SWRMutationConfiguration) {
      return useMutationHook<InferRouter<T>[K]["returns"], InferRouter<T>[K]["args"]>(
        functionName,
        config,
      );
    },
  };
}
