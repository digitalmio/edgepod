import { useMemo } from "react";
import useSWRMutation, { type SWRMutationConfiguration } from "swr/mutation";
import { rpcFetcher } from "../rpc/fetcher";
import { invalidateTables } from "../store/registry";
import { useEdgePod } from "../provider/provider";

export type UseMutationOptions<T> = {
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
};

export function useInternalMutation<T, A = any>(
  functionName: string,
  options?: UseMutationOptions<T>,
) {
  const ctx = useEdgePod();

  const swrConfig = useMemo<SWRMutationConfiguration<T, Error, string, A>>(() => {
    const cfg: SWRMutationConfiguration<T, Error, string, A> = {};
    if (options?.onSuccess) {
      cfg.onSuccess = (data) => options.onSuccess!(data);
    }
    if (options?.onError) {
      cfg.onError = (err) => options.onError!(err as Error);
    }
    return cfg;
  }, [options]);

  const { trigger, data, error, isMutating } = useSWRMutation(
    functionName,
    async (_, { arg }: { arg?: A }) => {
      const { data: rpcData, _meta } = await rpcFetcher<T>(
        ctx,
        functionName,
        arg as unknown as Record<string, unknown>,
      );

      if (_meta.t.length > 0) {
        invalidateTables(_meta.t);
      }

      return rpcData;
    },
    swrConfig,
  );

  return { trigger, data, error, isMutating };
}
