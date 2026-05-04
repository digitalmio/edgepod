import { useEffect, useMemo } from "react";
import useSWR from "swr";
import { rpcFetcher } from "../rpc/fetcher";
import { registerQuery, deregisterQuery } from "../store/registry";
import { useEdgePod } from "../provider/provider";

export type UseQueryOptions<T> = {
  fallbackData?: T;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
  suspense?: boolean;
  errorRetryCount?: number;
};

export function useQuery<T>(
  functionName: string,
  args?: Record<string, unknown> | null,
  options?: UseQueryOptions<T>,
) {
  const ctx = useEdgePod();

  const key = useMemo(
    () => (args === null ? null : (["edgepod", functionName, args] as unknown[])),
    [functionName, args],
  );

  const swrConfig = useMemo(
    () => ({
      fallbackData: options?.fallbackData,
      onSuccess: options?.onSuccess,
      onError: options?.onError,
      suspense: options?.suspense,
      errorRetryCount: options?.errorRetryCount,
    }),
    [options],
  );

  const {
    data: result,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR(key, key ? () => rpcFetcher<T>(ctx, functionName, args ?? {}) : null, swrConfig);

  const metaTables = result?._meta?.t;
  const tablesDep = metaTables ? metaTables.join(",") : "";

  useEffect(() => {
    if (!metaTables?.length || !key) return;

    const tables = metaTables;
    const swrKey = key as unknown[];

    registerQuery(tables, swrKey);
    return () => {
      deregisterQuery(tables, swrKey);
    };
  }, [key, tablesDep]);

  return {
    data: result?.data,
    error,
    isLoading,
    isValidating,
    mutate,
  };
}
