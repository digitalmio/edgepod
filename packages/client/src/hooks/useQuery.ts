import { useEffect, useMemo } from "react";
import useSWR, { type SWRConfiguration } from "swr";
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

export function useInternalQuery<T>(
  functionName: string,
  args?: Record<string, unknown> | null,
  options?: UseQueryOptions<T>,
) {
  const ctx = useEdgePod();

  const key = useMemo(
    () => (args === null ? null : (["edgepod", functionName, args ?? null] as unknown[])),
    [functionName, args],
  );

  const swrConfig = useMemo<SWRConfiguration<{ data: T; _meta: { t: string[] } }>>(() => {
    const cfg: SWRConfiguration<{ data: T; _meta: { t: string[] } }> = {};
    if (options?.fallbackData !== undefined) {
      cfg.fallbackData = { data: options.fallbackData, _meta: { t: [] } };
    }
    if (options?.suspense !== undefined) cfg.suspense = options.suspense;
    if (options?.errorRetryCount !== undefined) cfg.errorRetryCount = options.errorRetryCount;
    if (options?.onSuccess) {
      cfg.onSuccess = (data) => options.onSuccess!(data.data);
    }
    if (options?.onError) {
      cfg.onError = (err) => options.onError!(err as Error);
    }
    return cfg;
  }, [options]);

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

  useEffect(() => {
    if (ctx.wsStatus === "connected" && key) {
      mutate();
    }
  }, [ctx.wsStatus, key, mutate]);

  return {
    data: result?.data,
    error,
    isLoading,
    isValidating,
    mutate,
  };
}
