import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import type { Logger } from "../server/logger";

type ForbiddenRawMethods = "run" | "all" | "get" | "values" | "execute";

// Represents any value that can be serialized to JSON — used as the return type for user functions
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type RawDrizzleDb<TSchema extends Record<string, unknown>> =
  DrizzleSqliteDODatabase<TSchema>;

type EdgePodDb<TSchema extends Record<string, unknown>> = Omit<
  RawDrizzleDb<TSchema>,
  ForbiddenRawMethods
>;

export type RpcRequest = {
  headers: Record<string, string>;
  user: Record<string, unknown> | null;
  traceId: string;
  reactive: boolean;
};

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
  TUser extends Record<string, unknown> | string | null = Record<string, unknown> | string | null, // Typed user object
> = {
  // The Proxied Database (Safe) + the Raw Database (for advanced use cases with manual invalidation)
  db: EdgePodDb<TSchema>;
  unsafeRawDb: RawDrizzleDb<TSchema>;

  // Original Request headers
  headers: Record<string, string>;

  // Basic auth functions
  user: TUser;
  // JWT signing — only available when EDGEPOD_JWT_PRIVATE_KEY is configured (local auth mode)
  signJwt: ((claims: Record<string, unknown>, expiresIn?: string) => Promise<string>) | null;

  log: Logger; // A per-request logger with traceId bound — use for structured, traceable output

  // Manual Reactivity Escape Hatches
  subscribeTo: (tables: string[]) => void;
  invalidate: (tables: string[]) => void;

  // Environment Variables (for Stripe keys, Resend API, etc.)
  env: TEnv;

  // Durable Object Memory/State Access
  set: <Key extends keyof TVariables>(key: Key, value: TVariables[Key]) => void;
  get: <Key extends keyof TVariables>(key: Key) => TVariables[Key];
};
