import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

type ForbiddenRawMethods = "run" | "all" | "get" | "values" | "execute";

export type RawDrizzleDb<TSchema extends Record<string, unknown>> =
  DrizzleSqliteDODatabase<TSchema>;

type EdgePodDb<TSchema extends Record<string, unknown>> = Omit<
  RawDrizzleDb<TSchema>,
  ForbiddenRawMethods
>;

export type EdgePodSessionMap = Map<
  string,
  {
    socket: WebSocket;
    listeningToTables: Set<string>;
  }
>;

export type EdgePodContext<
  TSchema extends Record<string, unknown>,
  TEnv = Record<string, string>, // Cloudflare Env types
  TVariables extends Record<string, any> = Record<string, any>, // Typed variables for functions
> = {
  // The Proxied Database (Safe) + the Raw Database (for advanced use cases with manual invalidation)
  db: EdgePodDb<TSchema>;
  unsafeRawDb: RawDrizzleDb<TSchema>;

  // Original Request headers
  headers: Record<string, string>;

  // Future proofing
  user: Record<string, unknown> | null;
  log: Console; // A logger you can use inside your functions (currently just console, but could be extended in the future)

  // Manual Reactivity Escape Hatches
  subscribeTo: (tables: string[]) => void;
  invalidate: (tables: string[]) => void;

  // Environment Variables (for Stripe keys, Resend API, etc.)
  env: TEnv;

  // Durable Object Memory/State Access
  set: <Key extends keyof TVariables>(key: Key, value: TVariables[Key]) => void;
  get: <Key extends keyof TVariables>(key: Key) => TVariables[Key];
};
