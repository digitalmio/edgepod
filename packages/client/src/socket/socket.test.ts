import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { connectSocket, $wsStatus } from "./socket";

let mockSocketInstance: {
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  _handlers: Record<string, ((event: Event) => void)[]>;
};

vi.mock("partysocket", () => ({
  default: vi.fn().mockImplementation(() => {
    mockSocketInstance = {
      addEventListener: vi.fn((event: string, handler: (event: Event) => void) => {
        if (!mockSocketInstance._handlers[event]) {
          mockSocketInstance._handlers[event] = [];
        }
        mockSocketInstance._handlers[event].push(handler);
      }),
      removeEventListener: vi.fn((event: string, handler: (event: Event) => void) => {
        if (mockSocketInstance._handlers[event]) {
          mockSocketInstance._handlers[event] = mockSocketInstance._handlers[event].filter(
            (h) => h !== handler,
          );
        }
      }),
      close: vi.fn(),
      _handlers: {},
    };
    return mockSocketInstance;
  }),
}));

function triggerEvent(eventName: string, eventData?: Event) {
  const handlers = mockSocketInstance._handlers[eventName] || [];
  for (const handler of handlers) {
    handler(eventData || new Event(eventName));
  }
}

describe("connectSocket", () => {
  beforeEach(() => {
    $wsStatus.set("disconnected");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("sets status to connected on open", () => {
    expect($wsStatus.get()).toBe("disconnected");

    connectSocket("https://api.edgepod.dev", "key", "sid", vi.fn());
    triggerEvent("open");

    expect($wsStatus.get()).toBe("connected");
  });

  it("sets status to disconnected on close", () => {
    connectSocket("https://api.edgepod.dev", "key", "sid", vi.fn());
    triggerEvent("open");
    expect($wsStatus.get()).toBe("connected");

    triggerEvent("close");
    expect($wsStatus.get()).toBe("disconnected");
  });

  it("sets status to disconnected on error", () => {
    connectSocket("https://api.edgepod.dev", "key", "sid", vi.fn());
    triggerEvent("open");
    expect($wsStatus.get()).toBe("connected");

    triggerEvent("error");
    expect($wsStatus.get()).toBe("disconnected");
  });

  it("calls onInvalidate for valid messages", () => {
    const onInvalidate = vi.fn();
    connectSocket("https://api.edgepod.dev", "key", "sid", onInvalidate);

    const messageEvent = new MessageEvent("message", {
      data: JSON.stringify({ action: "invalidate", tables: ["a1b2", "c3d4"] }),
    });
    triggerEvent("message", messageEvent);

    expect(onInvalidate).toHaveBeenCalledWith(["a1b2", "c3d4"]);
  });

  it("ignores malformed messages", () => {
    const onInvalidate = vi.fn();
    connectSocket("https://api.edgepod.dev", "key", "sid", onInvalidate);

    const messageEvent = new MessageEvent("message", {
      data: "not json",
    });
    triggerEvent("message", messageEvent);

    expect(onInvalidate).not.toHaveBeenCalled();
  });

  it("ignores messages with wrong action", () => {
    const onInvalidate = vi.fn();
    connectSocket("https://api.edgepod.dev", "key", "sid", onInvalidate);

    const messageEvent = new MessageEvent("message", {
      data: JSON.stringify({ action: "other", tables: ["a1b2"] }),
    });
    triggerEvent("message", messageEvent);

    expect(onInvalidate).not.toHaveBeenCalled();
  });

  it("cleans up listeners on disconnect", () => {
    const cleanup = connectSocket("https://api.edgepod.dev", "key", "sid", vi.fn());

    expect(mockSocketInstance.addEventListener).toHaveBeenCalledTimes(4);

    cleanup();

    expect(mockSocketInstance.removeEventListener).toHaveBeenCalledTimes(4);
    expect(mockSocketInstance.close).toHaveBeenCalledOnce();
  });

  it("creates PartySocket with correct config", async () => {
    connectSocket("https://api.edgepod.dev", "key", "sid", vi.fn());

    const PartySocket = vi.mocked((await import("partysocket")).default);
    expect(PartySocket).toHaveBeenCalledWith({
      host: "https://api.edgepod.dev",
      room: "sid",
      path: "ws",
      query: { key: "key", sessionId: "sid" },
    });
  });
});
