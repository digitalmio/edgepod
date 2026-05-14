<div align="center">
  <h1>⬡ EdgePod</h1>
  <p><b>The Edge-Native, Reactive Database & RPC Framework</b></p>
</div>

---

## 📖 Overview

**EdgePod** is a full-stack, server-authoritative framework built on top of Cloudflare Workers and Durable Objects. By co-locating compute and storage inside a single Cloudflare Durable Object (DO) powered by SQLite, EdgePod delivers a strictly consistent, 0ms-latency database with a seamless Developer Experience (DX). It features a fully typed RPC router and an automatic real-time frontend cache invalidation engine.

---

## Why EdgePod

If you're building a client-side app — a React SPA, a Vue dashboard, a Svelte frontend, a mobile app — you already know the drill. You need a backend. You need a database. You need APIs. You need real-time sync. And before you can ship a single feature, you've spent a week wiring it all together.

EdgePod removes all of that.

**Write TypeScript functions. Call them from your frontend like local async calls. Everything is typed. Everything stays in sync. Deploy to your own Cloudflare account.**

### What you get

- **No API layer to maintain** — Export async functions from `edgepod/functions/index.ts`. EdgePod turns them into an RPC router. No REST endpoints, no GraphQL schemas, no OpenAPI spec.
- **Real-time without the work** — EdgePod tracks which database tables each query touches. When a mutation changes data, it pushes a lightweight invalidation signal over WebSocket. Your frontend cache refreshes automatically. No `useEffect`, no polling, no manual subscriptions.
- **Type safety end to end** — Define your schema once. Get full TypeScript autocomplete from your database tables all the way to your React hooks. Rename a column? Your frontend breaks at compile time, not at runtime.
- **Your Cloudflare account, your data** — EdgePod deploys as a Worker + Durable Object directly to your Cloudflare account. No hosted platform, no vendor lock-in, no surprise bills.
- **SQLite at the edge** — The database lives inside the Durable Object alongside your compute. No connection pooling, no cold-start latency, no network hop between your code and your data.

### How it works

EdgePod runs as a single Durable Object on Cloudflare's edge network. Your SQLite database is embedded directly in that process. When a client calls an RPC function, the request hits the Durable Object, executes your code, and returns the result — all within the same process.

For reactivity, EdgePod uses a dual-protocol approach:

- **HTTP** carries all your queries and mutations. Standard POST requests, standard status codes, easy to debug in the network tab.
- **WebSockets** carry only lightweight invalidation signals. The server never sends row data over the socket — it just tells your client which tables changed. Your frontend refetches what it needs.

The result is a system that feels like a local database to your frontend, but runs entirely at the edge, scales automatically, and keeps your UI in sync without you writing a single line of WebSocket code.

---

## 🚀 Quick Start

You need a project with a `package.json`. Then:

```bash
npx @edgepod/cli init
```

This scaffolds the `edgepod/` directory (schema, functions, wrangler config) and installs dependencies. After that:

```bash
pnpm edgepod:dev      # Start local dev server
pnpm edgepod:deploy   # Ship to Cloudflare
```

For full details on prerequisites, auth setup, and project structure, see the [CLI README](packages/cli/README.md).

---

## 🏗️ Core Architecture

EdgePod is built on a **Dual-Protocol** architecture, separating data transfer from reactivity to maximize performance and reliability.

### The Cloudflare Edge Backend

Every EdgePod project is deployed directly to the user's Cloudflare account as a two-part system:

- **The Gateway Worker:** A stateless entry point that handles incoming HTTP requests, upgrades WebSockets, verifies authentication keys (`EP_PK_...`), and routes traffic to the correct Durable Object.
- **The EdgePod Engine (Durable Object):** A single, atomic, stateful instance containing the embedded SQLite database. It maintains all active WebSocket connections in memory and executes the user's RPC functions.

> Durable Objects are incredibly powerful, but they are intentionally small and resource-constrained. Pushing large payloads or running unbounded queries can increase your Cloudflare bill and degrade performance. EdgePod puts safety nets in place to help you avoid these pitfalls.

### The Dual-Protocol Network Layer

- **HTTP for Data Transfer (The Workhorse):** All queries (`getUsers`) and mutations (`insertUser`) are executed via standard HTTP POST requests. This ensures massive payloads are handled gracefully with native browser gzipping, standard HTTP status codes, and easy network tab debugging.
- **WebSockets for Reactivity (The Whisperer):** WebSockets are used **strictly** for lightweight, unidirectional "ping" signals. The server never sends row data over WS; it simply pushes minimal dependency alerts: `{"type": "stale", "tables": ["users"]}`.

### Security Model

EdgePod is origin-agnostic by design. Every request is authenticated via the publishable API key (`EP_PK_...`); CORS is not used as a security gate. This allows SPAs, mobile apps, and third-party frontends to call your backend directly without origin whitelisting.

### The Reactivity Engine

EdgePod achieves automatic reactivity without requiring developers to manually declare table dependencies:

- **Drizzle Query Tracker:** When a backend RPC function executes a Drizzle query, EdgePod intercepts the compiled SQL. It extracts the exact tables being read or written to and dynamically registers the active `clientId` to those tables in the DO's memory map.
- **Automatic Invalidation:** When a mutation modifies a table, the DO looks up all connected clients subscribed to that table and fires the `"stale"` WebSocket message.

---

## 💻 Developer Experience (DX)

### Backend: Writing RPC Functions

Developers write standard asynchronous JavaScript/TypeScript functions. The framework injects a typed context (`ctx`) containing the Drizzle SQLite database instance. There is no complex Row-Level Security (RLS) to manage — the exported function _is_ the security boundary.

```typescript
// edgepod/functions/index.ts
import { users } from "../schema";

export const getUsers = async (ctx) => {
  // Drizzle tracker auto-subscribes the client to the 'users' table
  return await ctx.db.select().from(users).all();
};

export const insertUser = async (ctx, args) => {
  const result = await ctx.db.insert(users).values(args).returning().all();
  // The DO auto-detects the write and pings active WebSockets
  return result;
};
```

### Middleware

Wrap functions with reusable middleware using the familiar `(ctx, args, next)` pattern:

```typescript
import { createMiddleware } from "@edgepod/server";

// Create a middleware that enforces authentication
const withAuth = createMiddleware(async (ctx, args, next) => {
  if (!ctx.user) throw new Error("Unauthorized");
  return next();
});

// Apply it to any handler — types are preserved
export const getUsers = withAuth(async (ctx) => {
  return await ctx.db.select().from(users).all();
});
```

Middleware runs before the handler, so it is the perfect place for auth checks, argument validation, or enriching the context. You can compose multiple middlewares by nesting them.

### Authentication

`edgepod init` walks you through three auth strategies:

| Mode            | How it works                                                                                                                                                                                               |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **None**        | No JWT verification. Every request is treated as anonymous.                                                                                                                                                |
| **Remote JWKS** | Verify tokens from an external provider (Clerk, Auth0, Supabase, etc.). You supply the provider's JWKS URL and EdgePod validates signatures against it.                                                    |
| **Local JWKS**  | EdgePod generates an ES256 key pair. The public key is served at `/.well-known/jwks.json` and the private signing key lives in `edgepod/.env`. Use the exported `getJwtSigner()` to issue tokens yourself. |

In remote mode, tokens are verified but never issued by EdgePod. In local mode, you are the authority — sign tokens server-side using `ctx.signJwt`. The gateway already verifies the Bearer token on every request and places the decoded payload in `ctx.user`, so protecting functions is as simple as checking `ctx.user`:

```typescript
// edgepod/middlewares.ts — generated by edgepod init
import { createMiddleware } from "@edgepod/server";

export const withAuth = createMiddleware(async (ctx, _args, next) => {
  if (!ctx.user) throw new Error("UNAUTHORIZED: Bearer token required");
  return next();
});
```

For advanced use cases (e.g. verifying a token from a different source or checking specific claims), the standalone `verifyJwt(token, env)` is exported from `@edgepod/server`.

### Frontend: Using the Typed Client

Wrap your app once with the generated provider, then import typed hooks directly:

```tsx
// App.tsx
import { EdgePodProvider } from "./edgepod/client";

function App() {
  return (
    <EdgePodProvider url="http://localhost:8989" apiKey="ep_pk_...">
      <Users />
    </EdgePodProvider>
  );
}

// Users.tsx
import { useQuery, useMutation, useStatus } from "./edgepod/client";

function Users() {
  const { data, isLoading, error } = useQuery("getUsers");
  const { trigger, isMutating } = useMutation("insertUser");
  const status = useStatus();

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <div>
      <p>WebSocket: {status}</p>
      <ul>
        {data?.map((u) => (
          <li key={u.id}>{u.name}</li>
        ))}
      </ul>
      <button disabled={isMutating} onClick={() => trigger({ name: "Ada" })}>
        Add User
      </button>
    </div>
  );
}
```

The provider manages the WebSocket lifecycle. When another user inserts a row, your `useQuery` cache refreshes automatically via WebSocket invalidation signals.

---

## 🦺 Safety Nets

EdgePod helps you stay within Durable Object limits with lightweight, always-on guards:

| Guard                 | What it does                                                                                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Result limit**      | Queries are capped at **1 000 rows**. If a query returns exactly 1 000 rows, a warning is logged to paginate with `.limit()` and `.offset()`.                                                                  |
| **WHERE enforcement** | `UPDATE` and `DELETE` without a `.where()` clause are blocked. If you really mean to affect every row, chain `.withoutWhere()` to opt out per-query.                                                           |
| **Raw SQL guard**     | Dangerous raw methods like `db.run()` and `db.get()` are blocked on the tracked database instance. Use `ctx.unsafeRawDb` explicitly if you need raw access — raw SQL is automatically tracked via SQL parsing. |
| **Bulk insert limit** | `insert().values()` arrays are capped at 1 000 rows to avoid oversized writes.                                                                                                                                 |

These are not configuration options — they are designed to catch accidental misuse early, while giving you explicit escape hatches when you need them.

---

## License

Apache License 2.0
