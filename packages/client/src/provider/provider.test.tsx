import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { EdgePodProvider } from "./provider";
import { useEdgePod } from "./context";
import { $wsStatus } from "../socket/socket";

describe("EdgePodProvider", () => {
  it("provides context with wsStatus", () => {
    $wsStatus.set("disconnected");

    const { result } = renderHook(() => useEdgePod(), {
      wrapper: ({ children }) => (
        <EdgePodProvider url="https://api.edgepod.dev" apiKey="test-key">
          {children}
        </EdgePodProvider>
      ),
    });

    expect(result.current.url).toBe("https://api.edgepod.dev");
    expect(result.current.apiKey).toBe("test-key");
    expect(result.current.sessionId).toBeDefined();
    expect(result.current.wsStatus).toBe("disconnected");
  });

  it("updates wsStatus when socket connects", () => {
    $wsStatus.set("connected");

    const { result } = renderHook(() => useEdgePod(), {
      wrapper: ({ children }) => (
        <EdgePodProvider url="https://api.edgepod.dev" apiKey="test-key">
          {children}
        </EdgePodProvider>
      ),
    });

    expect(result.current.wsStatus).toBe("connected");
  });
});
