// @edgepod/server/index.ts
import type { DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

export type EdgePodContext<
  TSchema extends Record<string, unknown>,
  TEnv = Record<string, string>, // Cloudflare Env types
  TVariables extends Record<string, any> = Record<string, any>, // Typed variables for functions
> = {
  // Drizzle ORM Database instance (for running queries in request handlers)
  db: DrizzleSqliteDODatabase<TSchema>;

  // The raw incoming Request (for reading headers, IP addresses, cookies)
  req: Request;

  // Cloudflare Environment Variables (for Stripe keys, Resend API, etc.)
  env: TEnv;

  // Hono-like API, strictly typed request lifecycle variables
  set: <Key extends keyof TVariables>(key: Key, value: TVariables[Key]) => void;
  get: <Key extends keyof TVariables>(key: Key) => TVariables[Key];
  var: TVariables;
};
