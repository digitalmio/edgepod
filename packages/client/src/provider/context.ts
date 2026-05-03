import { createContext, useContext } from "react";

export type EdgePodContextValue = {
  url: string;
  apiKey: string;
  sessionId: string;
  wsStatus: "connected" | "disconnected";
};

export const EdgePodContext = createContext<EdgePodContextValue | null>(null);

export function useEdgePod(): EdgePodContextValue {
  const ctx = useContext(EdgePodContext);
  if (!ctx) {
    throw new Error("useEdgePod must be used inside <EdgePodProvider>.");
  }
  return ctx;
}
