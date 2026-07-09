import pkg from "../../package.json" with { type: "json" };
import type { BaseEdgePodEngine } from "./do";
import type { RpcRequest } from "../types";
import { verifyJwt, resetAuthCache } from "./auth";
import { hashMetaTableNames } from "../tools/hashTableName";
import { ResultAsync } from "neverthrow";

// EdgePod is origin-agnostic by design. Every request is authenticated via the
// publishable API key (X-Edgepod-Key); CORS is not used as a security gate.
const serverHeader = {
  "X-Powered-By": `EdgePod/${pkg.version}`,
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Edgepod-Key, X-Edgepod-Session-Id",
  "Access-Control-Max-Age": "86400",
};

type EdgePodEnv = {
  EDGEPOD_DO: DurableObjectNamespace<BaseEdgePodEngine>;
  EDGEPOD_API_KEY: string;
  EDGEPOD_JWKS_URL?: string;
  EDGEPOD_MAX_BODY_BYTES?: string;
  ASSETS?: Fetcher;
};

export type LocationHint = "wnam" | "enam" | "sam" | "weur" | "eeur" | "apac" | "oc" | "afr" | "me";

export type DataLocationOptions = {
  jurisdiction?: "eu" | "fedramp";
  locationHint?: LocationHint;
};

// Minimal stub interface to avoid deep type instantiation through DurableObjectStub<BaseEdgePodEngine>
type EdgePodStub = {
  executeRpc(
    functionName: string,
    args: unknown,
    rpcCtx: RpcRequest,
  ): ReturnType<BaseEdgePodEngine["executeRpc"]>;
  fetch(request: Request): Promise<Response>;
};

const MAX_BODY_BYTES_DEFAULT = 10 * 1024 * 1024;

const PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE";

// Headers stripped from ctx.headers to prevent leaking credentials into user functions
const FILTERED_HEADERS = new Set([
  "authorization",
  "x-edgepod-key",
  "x-edgepod-session-id",
  "x-edgepod-reactive",
]);

function filterHeaders(headers: Headers): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const [key, value] of headers.entries()) {
    if (!FILTERED_HEADERS.has(key.toLowerCase())) {
      filtered[key] = value;
    }
  }
  return filtered;
}

async function readBodyWithLimit(request: Request, maxBytes: number): Promise<unknown> {
  const cl = request.headers.get("Content-Length");
  if (cl && Number(cl) > maxBytes) {
    throw new Error(PAYLOAD_TOO_LARGE);
  }

  if (!request.body) {
    return {};
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        throw new Error(PAYLOAD_TOO_LARGE);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (totalBytes === 0) return {};

  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return JSON.parse(new TextDecoder().decode(merged));
}

const getStub = (env: EdgePodEnv, options?: DataLocationOptions): EdgePodStub => {
  const namespace = options?.jurisdiction
    ? env.EDGEPOD_DO.jurisdiction(options.jurisdiction)
    : env.EDGEPOD_DO;
  const doId = namespace.idFromName("global-edgepod-instance");
  return namespace.get(
    doId,
    options?.locationHint ? { locationHint: options.locationHint } : undefined,
  ) as unknown as EdgePodStub;
};

export const edgePodFetch = async (
  request: Request,
  env: EdgePodEnv,
  allowedFunctions: string[],
  options?: DataLocationOptions,
) => {
  const url = new URL(request.url);

  // CORS preflight — must come before auth check (browsers don't send custom headers on OPTIONS)
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: serverHeader });
  }

  // API key auth — WebSocket upgrades can't send custom headers, so also accept ?key= query param
  const isWsUpgrade = request.headers.get("Upgrade") === "websocket";
  const apiKey =
    request.headers.get("X-Edgepod-Key") ?? (isWsUpgrade ? url.searchParams.get("key") : null);

  if (!apiKey || apiKey !== env.EDGEPOD_API_KEY) {
    return new Response("Unauthorized", { status: 401, headers: serverHeader });
  }

  // JWT verification — if a Bearer token is present it must be valid
  const authHeader = request.headers.get("Authorization");
  let userPayload: Record<string, unknown> | null = null;

  if (authHeader?.startsWith("Bearer ")) {
    const result = await verifyJwt(authHeader.slice(7), env);
    if (result.isErr())
      return new Response("Unauthorized", {
        status: 401,
        headers: serverHeader,
      });
    userPayload = result.value as Record<string, unknown>;
  }

  // Durable Object RPC call
  if (url.pathname.startsWith("/rpc/")) {
    const functionName = url.pathname.slice(5);

    if (!allowedFunctions.includes(functionName)) {
      return Response.json(
        { success: false, error: `NOT_FOUND: Function "${functionName}" does not exist.` },
        { status: 404, headers: serverHeader },
      );
    }

    if (request.method !== "POST") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: serverHeader,
      });
    }

    const maxBodyBytes = parseInt(env.EDGEPOD_MAX_BODY_BYTES ?? "") || MAX_BODY_BYTES_DEFAULT;

    const argsResult = await ResultAsync.fromPromise(
      readBodyWithLimit(request, maxBodyBytes),
      (e) => (e instanceof Error ? e.message : "Invalid request body."),
    );

    if (argsResult.isErr()) {
      const isTooLarge = argsResult.error === PAYLOAD_TOO_LARGE;
      return Response.json(
        { success: false, error: isTooLarge ? "Payload Too Large" : argsResult.error },
        { status: isTooLarge ? 413 : 400, headers: serverHeader },
      );
    }

    const stub = getStub(env, options);
    const traceId = crypto.randomUUID();
    const sessionId = request.headers.get("X-Edgepod-Session-Id") ?? "anonymous";
    const reactive = request.headers.get("X-Edgepod-Reactive") !== "false";
    const headers = filterHeaders(request.headers);
    const result = await stub.executeRpc(functionName, argsResult.value, {
      headers,
      user: userPayload,
      traceId,
      reactive,
      sessionId,
    });

    if (result.success) {
      return Response.json(
        {
          success: true,
          data: result.data,
          _meta: {
            t: hashMetaTableNames([...new Set([...result.meta.read, ...result.meta.changed])]),
          },
          ...(result.warnings.length > 0 ? { warnings: result.warnings } : {}),
        },
        { headers: serverHeader },
      );
    }

    const status = result.error.startsWith("NOT_FOUND:")
      ? 404
      : result.error.startsWith("UNAUTHORIZED:")
        ? 401
        : 500;
    return Response.json(
      { success: false, error: result.error },
      { status, headers: serverHeader },
    );
  }

  // WebSocket Upgrades and handler
  if (url.pathname === "/ws") {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", {
        status: 426,
        headers: serverHeader,
      });
    }
    const stub = getStub(env, options);
    return await stub.fetch(request);
  }

  return new Response("Not Found", { status: 404, headers: serverHeader });
};

// barrel export for the DO class, so Wrangler can push the code
export { BaseEdgePodEngine } from "./do";
export { resetAuthCache };
