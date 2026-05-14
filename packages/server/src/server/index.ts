import pkg from "../../package.json" with { type: "json" };
import type { BaseEdgePodEngine } from "./do";
import type { RpcRequest } from "../types";
import { verifyJwt } from "./auth";
import { hashMetaTableNames, hashTableName } from "../tools/hashTableName";
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
  const apiKey = request.headers.get("X-Edgepod-Key") ?? url.searchParams.get("key");

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

    if (request.method !== "POST" && request.method !== "GET") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: serverHeader,
      });
    }

    const parseArgs = (): ResultAsync<unknown, string> => {
      if (request.method === "POST") {
        return ResultAsync.fromPromise(request.json(), () => "Invalid request body.");
      }
      if (request.method === "GET") {
        const queryArgs = url.searchParams.get("args");
        if (queryArgs) {
          return ResultAsync.fromPromise(
            Promise.resolve(JSON.parse(decodeURIComponent(queryArgs))),
            () => "Invalid request body.",
          );
        }
        return ResultAsync.fromPromise(Promise.resolve({}), () => "unreachable");
      }
      return ResultAsync.fromPromise(Promise.reject(new Error("unreachable")), () => "unreachable");
    };

    const argsResult = await parseArgs();
    if (argsResult.isErr()) {
      return Response.json(
        { success: false, error: argsResult.error },
        { status: 400, headers: serverHeader },
      );
    }

    const stub = getStub(env, options);
    const traceId = crypto.randomUUID();
    const headers: Record<string, string> = Object.fromEntries(request.headers.entries());
    const reactive = request.headers.get("X-Edgepod-Reactive") !== "false";
    const result = await stub.executeRpc(functionName, argsResult.value, {
      headers,
      user: userPayload,
      traceId,
      reactive,
    });

    if (result.success) {
      const rowsMeta = result.meta.rows
        ? Object.fromEntries(
            Object.entries(result.meta.rows).map(([t, ids]) => [hashTableName(t), ids]),
          )
        : undefined;
      return Response.json(
        {
          success: true,
          data: result.data,
          _meta: {
            t: hashMetaTableNames(result.meta.read),
            ...(rowsMeta ? { r: rowsMeta } : {}),
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
