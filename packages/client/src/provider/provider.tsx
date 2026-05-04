import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { connectSocket, $wsStatus } from "../socket/socket";
import { invalidateTables } from "../store/registry";

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
