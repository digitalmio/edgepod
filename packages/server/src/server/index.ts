import pkg from "../../package.json" with { type: "json" };
import type { BaseEdgePodEngine } from "./do";
import type { JsonValue } from "../types";

const serverHeader = { "X-Powered-By": `EdgePod/${pkg.version}` };

type EdgePodEnv = {
  EDGEPOD_DO: DurableObjectNamespace<BaseEdgePodEngine>;
  EDGEPOD_API_KEY: string;
};

// Minimal stub interface to avoid deep type instantiation through DurableObjectStub<BaseEdgePodEngine>
type EdgePodStub = {
  executeRpc(
    functionName: string,
    args: unknown,
    headers: Record<string, string>
  ): Promise<JsonValue> | JsonValue;
  fetch(request: Request): Promise<Response>;
};

export const edgePodFetch = async (request: Request, env: EdgePodEnv) => {
  const url = new URL(request.url);

  // API key auth — WebSocket upgrades can't send custom headers, so also accept ?key= query param
  const apiKey = request.headers.get("X-Edgepod-Key") ?? url.searchParams.get("key");

  if (!apiKey || apiKey !== env.EDGEPOD_API_KEY) {
    return new Response("Unauthorized", { status: 401, headers: serverHeader });
  }

  const doId = env.EDGEPOD_DO.idFromName("global-edgepod-instance");
  const stub = env.EDGEPOD_DO.get(doId) as unknown as EdgePodStub;

  // Durable Object RPC call
  if (url.pathname.startsWith("/rpc/")) {
    // Remove first 5 characters (/rpc/) to extract function name, e.g. /rpc/myFunction -> myFunction
    const functionName = url.pathname.slice(5);
    let args = {};

    try {
      if (request.method === "POST") {
        args = await request.json();
      } else if (request.method === "GET") {
        const queryArgs = url.searchParams.get("args");
        if (queryArgs) {
          args = JSON.parse(decodeURIComponent(queryArgs));
        }
      } else {
        return new Response("Method Not Allowed", { status: 405, headers: serverHeader });
      }
    } catch {
      return Response.json(
        { success: false, error: "Invalid request body." },
        { status: 400, headers: serverHeader }
      );
    }

    try {
      const headers = Object.fromEntries(request.headers.entries());
      const data = await stub.executeRpc(functionName, args, headers);

      return Response.json({ success: true, data }, { headers: serverHeader });
    } catch (error) {
      const message = (error as Error).message;
      const status = message.startsWith("NOT_FOUND:") ? 404 : 500;
      return Response.json({ success: false, error: message }, { status, headers: serverHeader });
    }
  }

  // WebSocket Upgrades and handler
  if (url.pathname === "/ws") {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426, headers: serverHeader });
    }
    // WebSockets require the HTTP fetch() path to handle the Upgrade header
    return await stub.fetch(request);
  }

  return new Response("Not Found", { status: 404, headers: serverHeader });
};

// barrel export for the DO class, so Wrangler can push the code
export { BaseEdgePodEngine } from "./do";
