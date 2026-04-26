import pkg from "../../package.json" with { type: "json" };

const serverHeader = { "X-Powered-By": `EdgePod/${pkg.version}` };

export const edgePodFetch = async (request: Request, env: any) => {
  const url = new URL(request.url);
  const doId = env.EDGEPOD_DO.idFromName("global-edgepod-instance");
  const stub = env.EDGEPOD_DO.get(doId);

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

      const headers = Object.fromEntries(request.headers.entries());
      const data = await stub.executeRpc(functionName, args, headers);

      return Response.json({ data }, { headers: serverHeader });
    } catch (error) {
      return Response.json(
        { error: (error as Error).message },
        { status: 500, headers: serverHeader }
      );
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
