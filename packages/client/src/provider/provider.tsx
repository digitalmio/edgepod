import { useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { EdgePodContext } from "./context";
import { connectSocket, $wsStatus } from "../socket/socket";
import { invalidateTables } from "../store/registry";

export type EdgePodProviderProps = {
  url: string;
  apiKey: string;
  children: ReactNode;
};

function getWsStatusSnapshot() {
  return $wsStatus.get();
}

function subscribeToWsStatus(callback: () => void) {
  return $wsStatus.subscribe(callback);
}

export function EdgePodProvider({ url, apiKey, children }: EdgePodProviderProps) {
  const sessionId = useMemo(() => crypto.randomUUID(), []);

  const wsStatus = useSyncExternalStore(
    subscribeToWsStatus,
    getWsStatusSnapshot,
    getWsStatusSnapshot,
  );

  useEffect(() => {
    const cleanup = connectSocket(url, apiKey, sessionId, (tables) => {
      invalidateTables(tables);
    });
    return cleanup;
  }, [url, apiKey, sessionId]);

  return (
    <EdgePodContext.Provider value={{ url, apiKey, sessionId, wsStatus }}>
      {children}
    </EdgePodContext.Provider>
  );
}
