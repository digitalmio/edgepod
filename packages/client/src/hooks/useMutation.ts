import useSWRMutation from "swr/mutation";
import { rpcFetcher } from "../rpc/fetcher";
import { invalidateTables } from "../store/registry";

type RpcCtx = {
  url: string;
  apiKey: string;
  sessionId: string;
};

export function useMutation<T, A = any>(
  ctx: RpcCtx,
  functionName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config?: any,
) {
  const { trigger, data, error, isMutating } = useSWRMutation(
    functionName,
    async (_, { arg }: { arg?: A }) => {
      const { data: rpcData, _meta } = await rpcFetcher<T>(
        ctx,
        functionName,
        arg as unknown as Record<string, unknown>,
      );

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
