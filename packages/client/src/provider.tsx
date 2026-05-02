import { useEffect, useMemo, type ReactNode } from "react";
import { EdgePodContext } from "./context";
import { connectSocket } from "./socket";

export type EdgePodProviderProps = {
  url: string;
  apiKey: string;
  children: ReactNode;
};

export function EdgePodProvider({ url, apiKey, children }: EdgePodProviderProps) {
  const sessionId = useMemo(() => crypto.randomUUID(), []);

  useEffect(() => {
    // No-op invalidation handler for now — wired to SWR in a later step
    const cleanup = connectSocket(url, apiKey, sessionId, (_tables) => {});
    return cleanup;
  }, [url, apiKey, sessionId]);

  return (
    <EdgePodContext.Provider value={{ url, apiKey, sessionId }}>{children}</EdgePodContext.Provider>
  );
}
