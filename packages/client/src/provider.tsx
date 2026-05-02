import { useEffect, useMemo, type ReactNode } from "react";
import { EdgePodContext } from "./context";
import { connectSocket } from "./socket";
import { invalidateTables } from "./store";

export type EdgePodProviderProps = {
  url: string;
  apiKey: string;
  children: ReactNode;
};

export function EdgePodProvider({ url, apiKey, children }: EdgePodProviderProps) {
  const sessionId = useMemo(() => crypto.randomUUID(), []);

  useEffect(() => {
    const cleanup = connectSocket(url, apiKey, sessionId, (tables) => {
      invalidateTables(tables);
    });
    return cleanup;
  }, [url, apiKey, sessionId]);

  return (
    <EdgePodContext.Provider value={{ url, apiKey, sessionId }}>{children}</EdgePodContext.Provider>
  );
}
