import useSWRMutation from "swr/mutation";
import { useEdgePod } from "../provider/context";
import { rpcFetcher } from "../rpc/fetcher";
import { invalidateTables } from "../store/registry";

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

      // Immediate client-side invalidation (Option C) — the server also broadcasts
      // to all other sessions via WebSocket, so cross-client sync is handled there.
      if (_meta.t.length > 0) {
        invalidateTables(_meta.t);
      }

      // TODO: Add optimistic updates support

      return rpcData;
    },
    config,
  );

  return { trigger, data, error, isMutating };
}
