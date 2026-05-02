import PartySocket from "partysocket";

type IncomingMessage = {
  action: "invalidate";
  tables: string[];
};

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

  function handleMessage(event: MessageEvent<string>) {
    const msg = parseMessage(event.data);
    if (msg) onInvalidate(msg.tables);
  }

  socket.addEventListener("message", handleMessage);

  return () => {
    socket.removeEventListener("message", handleMessage);
    socket.close();
  };
}
