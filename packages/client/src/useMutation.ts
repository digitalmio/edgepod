import useSWRMutation from "swr/mutation";
import { useEdgePod } from "./context";
import { rpcFetcher } from "./rpc";

export function useMutation<T>(
  functionName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config?: any,
) {
  const ctx = useEdgePod();

  const { trigger, data, error, isMutating } = useSWRMutation(
    functionName,
    async (_, { arg }: { arg?: Record<string, unknown> }) => {
      const { data: rpcData, _meta } = await rpcFetcher<T>(ctx, functionName, arg);

      // TODO: Add immediate client-side invalidation (option C) using _meta.t
      // TODO: Add optimistic updates support

      return rpcData;
    },
    config,
  );

  return { trigger, data, error, isMutating };
}
