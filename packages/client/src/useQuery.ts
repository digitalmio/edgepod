import { useEffect, useMemo } from "react";
import useSWR, { type SWRConfiguration } from "swr";
import { useEdgePod } from "./context";
import { rpcFetcher } from "./rpc";
import { registerQuery, deregisterQuery } from "./store";

export function useQuery<T>(
  functionName: string,
  args?: Record<string, unknown> | null,
  config?: SWRConfiguration,
) {
  const ctx = useEdgePod();

  const key = useMemo(
    () => (args === null ? null : (["edgepod", functionName, args] as unknown[])),
    [functionName, args],
  );

  const {
    data: result,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR(key, key ? () => rpcFetcher<T>(ctx, functionName, args ?? {}) : null, config);

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
