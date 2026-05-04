import { type SWRMutationConfiguration } from "swr/mutation";
import { type SWRConfiguration } from "swr";
import { useQuery as useQueryHook } from "./hooks/useQuery";
import { useMutation as useMutationHook } from "./hooks/useMutation";
import { connectSocket, $wsStatus } from "./socket/socket";
import { invalidateTables } from "./store/registry";

type InferRouter<T extends Record<string, (...args: any[]) => any>> = {
  [K in keyof T]: {
    args: Parameters<T[K]> extends [any, infer A] ? A : undefined;
    returns: Awaited<ReturnType<T[K]>>;
  };
};

type ClientConfig = {
  url: string;
  apiKey: string;
};

export function createEdgePodClient<T extends Record<string, (...args: any[]) => any>>(
  config: ClientConfig,
) {
  const sessionId = crypto.randomUUID();

  const ctx = {
    url: config.url,
    apiKey: config.apiKey,
    sessionId,
  };

  connectSocket(config.url, config.apiKey, sessionId, (tables) => {
    invalidateTables(tables);
  });

  return {
    useQuery<K extends keyof T & string>(
      functionName: K,
      args?: InferRouter<T>[K]["args"] | null,
      swrConfig?: SWRConfiguration,
    ) {
      return useQueryHook<InferRouter<T>[K]["returns"]>(
        ctx,
        functionName,
        args as Record<string, unknown> | null | undefined,
        swrConfig,
      );
    },

    useMutation<K extends keyof T & string>(
      functionName: K,
      swrMutationConfig?: SWRMutationConfiguration<InferRouter<T>[K]["returns"], Error>,
    ) {
      return useMutationHook<InferRouter<T>[K]["returns"], InferRouter<T>[K]["args"]>(
        ctx,
        functionName,
        swrMutationConfig,
      );
    },

    get status() {
      return $wsStatus.get();
    },
  };
}
