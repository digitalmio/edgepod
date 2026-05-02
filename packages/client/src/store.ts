import { atom } from "nanostores";
import { mutate } from "swr";

const $registry = atom<Map<string, Set<string>>>(new Map());

export function registerQuery(tables: string[], swrKey: unknown[]): void {
  const serializedKey = JSON.stringify(swrKey);
  const current = $registry.get();
  const next = new Map(current);

  for (const table of tables) {
    const keys = new Set(next.get(table));
    keys.add(serializedKey);
    next.set(table, keys);
  }

  $registry.set(next);
}

export function deregisterQuery(tables: string[], swrKey: unknown[]): void {
  const serializedKey = JSON.stringify(swrKey);
  const current = $registry.get();
  const next = new Map(current);

  for (const table of tables) {
    const keys = new Set(next.get(table));
    keys.delete(serializedKey);
    if (keys.size === 0) {
      next.delete(table);
    } else {
      next.set(table, keys);
    }
  }

  $registry.set(next);
}

export function invalidateTables(tables: string[]): void {
  const current = $registry.get();
  const keysToInvalidate = new Set<string>();

  for (const table of tables) {
    const keys = current.get(table);
    if (keys) {
      for (const k of keys) {
        keysToInvalidate.add(k);
      }
    }
  }

  for (const serialized of keysToInvalidate) {
    mutate(JSON.parse(serialized));
  }
}
