import type { EdgePodContextValue } from "../provider/context";

type RpcSuccess<T> = {
  success: true;
  data: T;
  _meta?: { t?: string[] };
  warnings?: string[];
};

type RpcError = {
  success: false;
  error: string;
};

type RpcResponse<T> = RpcSuccess<T> | RpcError;

export async function rpcFetcher<T>(
  ctx: EdgePodContextValue,
  functionName: string,
  args?: Record<string, unknown>,
): Promise<{ data: T; _meta: { t: string[] } }> {
  const url = new URL(`/rpc/${functionName}`, ctx.url).toString();

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Edgepod-Key": ctx.apiKey,
      "X-Edgepod-Session-Id": ctx.sessionId,
    },
    body: JSON.stringify(args ?? {}),
  });

  if (!res.ok) {
    throw new Error(`RPC failed: ${res.status} ${res.statusText}`);
  }

  const payload = (await res.json()) as RpcResponse<T>;

  if (!payload.success) {
    throw new Error(payload.error);
  }

  return {
    data: payload.data,
    _meta: { t: payload._meta?.t ?? [] },
  };
}
