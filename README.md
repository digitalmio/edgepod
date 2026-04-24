<div align="center">
  <h1>⬡ EdgePod</h1>
  <p><b>The Edge-Native, Reactive Database & RPC Framework</b></p>
</div>

---

## 📖 Overview

**EdgePod** is a full-stack, server-authoritative framework built on top of Cloudflare Workers and Durable Objects. By co-locating compute and storage inside a single Cloudflare Durable Object (DO) powered by SQLite, EdgePod delivers a strictly consistent, 0ms-latency database with a seamless Developer Experience (DX). It features a fully typed RPC router and an automatic real-time frontend cache invalidation engine.

---

## 🏗️ Core Architecture

EdgePod is built on a **Dual-Protocol** architecture, separating data transfer from reactivity to maximize performance and reliability.

### The Cloudflare Edge Backend

Every EdgePod project is deployed directly to the user's Cloudflare account as a two-part system:

- **The Gateway Worker:** A stateless entry point that handles incoming HTTP requests, upgrades WebSockets, verifies authentication keys (`EP_PK_...`), and routes traffic to the correct Durable Object.
- **The EdgePod Engine (Durable Object):** A single, atomic, stateful instance containing the embedded SQLite database. It maintains all active WebSocket connections in memory and executes the user's RPC functions.

### The Dual-Protocol Network Layer

- **HTTP for Data Transfer (The Workhorse):** All queries (`getUsers`) and mutations (`insertUser`) are executed via standard HTTP POST requests. This ensures massive payloads are handled gracefully with native browser gzipping, standard HTTP status codes, and easy network tab debugging.
- **WebSockets for Reactivity (The Whisperer):** WebSockets are used **strictly** for lightweight, unidirectional "ping" signals. The server never sends row data over WS; it simply pushes minimal dependency alerts: `{"type": "stale", "tables": ["users"]}`.

### The Reactivity Engine

EdgePod achieves automatic reactivity without requiring developers to manually declare table dependencies:

- **Kysely AST Sniffer:** When a backend RPC function executes a Kysely query, a custom EdgePod plugin intercepts the Abstract Syntax Tree (AST). It extracts the exact tables being read or written to and dynamically registers the active `clientId` to those tables in the DO's memory map.
- **Automatic Invalidation:** When a mutation modifies a table, the DO looks up all connected clients subscribed to that table and fires the `"stale"` WebSocket message.

---

## 💻 Developer Experience (DX)

### Backend: Writing RPC Functions

Developers write standard asynchronous JavaScript/TypeScript functions. The framework injects a typed context (`ctx`) containing the Kysely SQLite database instance. There is no complex Row-Level Security (RLS) to manage—the exported function _is_ the security boundary.

```typescript
// edgepod/functions/index.ts
export const getUsers = async (ctx, args) => {
  // The Kysely Sniffer automatically subscribes the client to the 'users' table
  return await ctx.db.selectFrom("users").selectAll().execute();
};

export const insertUser = async (ctx, args) => {
  const result = await ctx.db.insertInto("users").values(args).execute();
  // The DO automatically detects a write to 'users' and pings active WebSockets
  return result;
};
```
