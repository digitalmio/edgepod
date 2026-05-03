import PartySocket from "partysocket";
import { atom } from "nanostores";

type IncomingMessage = {
  action: "invalidate";
  tables: string[];
};

export const $wsStatus = atom<"connected" | "disconnected">("disconnected");

function parseMessage(raw: string): IncomingMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      "action" in parsed &&
      parsed.action === "invalidate" &&
      "tables" in parsed &&
      Array.isArray(parsed.tables)
    ) {
      return parsed as IncomingMessage;
    }
    return null;
  } catch {
    return null;
  }
}

export function connectSocket(
  url: string,
  apiKey: string,
  sessionId: string,
  onInvalidate: (tables: string[]) => void,
): () => void {
  const socket = new PartySocket({
    host: url,
    room: sessionId,
    path: "ws",
    query: { key: apiKey, sessionId },
  });

  function handleOpen() {
    $wsStatus.set("connected");
  }

  function handleClose() {
    $wsStatus.set("disconnected");
  }

  function handleError() {
    $wsStatus.set("disconnected");
  }

  function handleMessage(event: MessageEvent<string>) {
    const msg = parseMessage(event.data);
    if (msg) onInvalidate(msg.tables);
  }

  socket.addEventListener("open", handleOpen);
  socket.addEventListener("close", handleClose);
  socket.addEventListener("error", handleError);
  socket.addEventListener("message", handleMessage);

  return () => {
    socket.removeEventListener("open", handleOpen);
    socket.removeEventListener("close", handleClose);
    socket.removeEventListener("error", handleError);
    socket.removeEventListener("message", handleMessage);
    socket.close();
  };
}
