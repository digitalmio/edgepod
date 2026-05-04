import { useSyncExternalStore } from "react";
import { $wsStatus } from "../socket/socket";

function getSnapshot() {
  return $wsStatus.get();
}

function subscribe(callback: () => void) {
  return $wsStatus.subscribe(callback);
}

export function useStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
