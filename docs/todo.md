# EdgePod Development Todo

This file tracks active work, upcoming features, and known technical debt. Items are grouped by target version and priority.

## Legend

- `[x]` — Completed
- `[-]` — In Progress
- `[ ]` — Not Started

---

## v1.0 — Core Framework (In Progress)

### Client (`@edgepod/client`)

`[x]` **WebSocket Resilience**

- [x] Surface WS connection status via `$wsStatus` nanostores atom (`'connected' | 'disconnected'`)
- [x] Expose `wsStatus` in `EdgePodContextValue` via `useSyncExternalStore`
- [x] Listen for `open`/`close`/`error` events on `PartySocket`
- [x] Graceful degradation: queries still work via HTTP when WS is down, but reactivity pauses (by design — PartySocket auto-reconnects)

`[x]` **HTTP RPC Caller**

- [x] `rpcFetcher` with proper headers (`X-Edgepod-Key`, `X-Edgepod-Session-Id`)
- [x] Error handling for non-ok HTTP and RPC error payloads
- [x] Returns `_meta.t` (hashed table names) for cache invalidation

`[x]` **Query Hook (`useQuery`)**

- [x] SWR-powered with array keys `['edgepod', functionName, args]`
- [x] Registers `_meta.t` tables in nanostores registry after fetch
- [x] Deregisters on unmount / key change
- [x] Supports `args === null` to skip fetching

`[-]` **Mutation Hook (`useMutation`)**

- [x] Calls `rpcFetcher` via SWR mutation
- [x] **Immediate client-side invalidation** on success (reads `_meta.t`, calls `invalidateTables`)
- [ ] **Optimistic updates** — pass `optimisticData` option that SWR applies before mutation resolves
- [ ] Typed error states (currently `any`)

`[x]` **Nanostores Registry (`store/registry.ts`)**

- [x] Bidirectional map: `Map<hashedTableName, Set<serializedSWRKey>>`
- [x] `registerQuery` / `deregisterQuery` / `invalidateTables`
- [x] Deduplicates `mutate()` calls when a key is registered for multiple invalidated tables
- [x] `resetRegistry()` helper for test isolation

`[x]` **Debug / DevTools**

- [x] `wsStatus` exposed in `useEdgePod()` — can be used for connection banners
- [ ] `useEdgePodDebug()` hook returning:
  - Active subscription count
  - Pending mutations count
- [ ] Log subscription changes in development mode

`[ ]` **Error Handling Polish**

- [ ] Network timeout on `fetch` calls (currently unbounded)
- [ ] Distinguish network errors vs. RPC logic errors
- [ ] Surface server error messages more clearly in `rpcFetcher`
- [ ] Typed error state in `useQuery` and `useMutation` (currently `any`)

### Server (`@edgepod/server`)

`[x]` **Durable Object Engine**

- [x] `BaseEdgePodEngine` with Drizzle SQLite proxy
- [x] Table read/write tracking via `createTrackedDb` Proxy
- [x] WebSocket session management with hibernation-safe attachments
- [x] Automatic invalidation broadcast on mutations
- [x] Cascade graph for `ON DELETE CASCADE` FK relationships

`[x]` **RPC Router**

- [x] HTTP POST `/rpc/{functionName}` with API key auth
- [x] JWT verification via `jose`
- [x] `X-Edgepod-Reactive` header to disable table tracking
- [x] Query args via POST body or GET query param

`[x]` **Middleware System**

- [x] `createMiddleware` HOC with `(ctx, args, next) => Promise` pattern
- [x] Type preservation through wrapper

`[ ]` **Transaction Awareness**

- [ ] Document that multiple `ctx.db.insert()` calls in one RPC should be wrapped in `ctx.db.transaction()`
- [ ] Optional: dev-time warning when an RPC function performs 3+ sequential mutations without a transaction

### CLI (`@edgepod/cli`)

`[x]` **Project Initialization**

- [x] `edgepod init` — scaffold project with Wrangler, schema, functions, types
- [x] Interactive prompts for auth config, data location

`[x]` **Build & Deploy**

- [x] `edgepod build` — generate Drizzle migrations
- [x] `edgepod info` — display project info

`[ ]` **Watch Mode for Development**

- [ ] `edgepod dev` or `concurrently` integration to run wrangler + type watcher

### Testing

`[-]` **Client Tests**

- [x] `rpc/fetcher.ts` — headers, body, happy path, errors, missing `_meta.t`
- [x] `store/registry.ts` — register, deregister, invalidate, deduplication, cleanup
- [x] `hooks/useQuery.ts` — skip on null args, register tables, deregister on unmount, key format
- [x] `hooks/useMutation.ts` — immediate invalidation, empty `_meta.t`, return shape
- [x] `socket/socket.ts` — connection, status tracking, message parsing, cleanup
- [x] `provider/provider.tsx` — context value, WS lifecycle, `wsStatus` sync

`[ ]` **Server Tests**

- [ ] Pure logic: `hashTableName`, `buildCascadeGraph`, `createMiddleware`
- [ ] `createTrackedDb` — mock Drizzle object, verify proxy behavior
- [ ] Integration: Miniflare end-to-end (one test: start DO, connect WS, call RPC, verify invalidation)

`[ ]` **CLI Tests**

- [ ] Template snapshot tests (each template function output matches expected)
- [ ] `init.ts` — mock file system (memfs or temp dirs)
- [ ] `findFiles.ts`, `package.ts` — utility tests

---

## v1.1 — Typed Client Generation

`[ ]` **CLI Type Extraction**

- [ ] `edgepod generate-client-types [--watch]` command
- [ ] Parse `edgepod/functions/index.ts` with TypeScript compiler API
- [ ] Extract: function name, argument type (skipping `ctx`), return type (unwrapping `Promise`)
- [ ] Recursively inline all types — objects, unions, arrays, primitives — no Drizzle/schema imports
- [ ] Emit `edgepod/client.gen.ts` with `EdgePodRouter` type

`[ ]` **Typed Hook Factory**

- [ ] `createEdgePodClient<EdgePodRouter>()` returns `useQuery` / `useMutation` with full type inference
- [ ] Usage: `const { useQuery } = createEdgePodClient<typeof EdgePodRouter>()`
- [ ] `useQuery('getUsers')` infers zero args and `User[]` return
- [ ] `useMutation('createUser')` infers `{ email: string }` args

`[ ]` **Watch Mode**

- [ ] `chokidar` watches `edgepod/functions/**/*.ts`
- [ ] Regenerates `client.gen.ts` on change
- [ ] Can run alongside `wrangler dev` via `concurrently`

`[ ]` **Monorepo Shortcut (Documented)**

- [ ] Support `import type * as Functions from '../edgepod/functions'` for same-repo setups
- [ ] Mark as "convenient but not recommended for production" — generated file is canonical

---

## v2.0 — Advanced Features

`[ ]` **Optimistic Updates (Full Implementation)**

- [ ] `useMutation` accepts `optimisticData` option
- [ ] SWR applies optimistic data immediately, rolls back on error
- [ ] Coordinates with immediate invalidation for correct final state

`[ ]` **Multi-DO / Tenant Sharding**

- [ ] DO per tenant (e.g., `orgId`) with full schema copy
- [ ] Gateway Worker routes by tenant key
- [ ] Still 0ms latency within a tenant, horizontal scaling across tenants

`[ ]` **Read Replicas / Snapshots**

- [ ] DO storage snapshots for read-heavy workloads
- [ ] Or hybrid tiering: hot data in DO SQLite, cold data in D1

`[ ]` **Real-Time Collaboration**

- [ ] Broadcast mutation events (not just invalidation pings) to all connected clients
- [ ] Enable live cursors, live lists, etc.
- [ ] Would require different WS message types and client handling

---

## Known Issues & Technical Debt

`[ ]` **React Version Mismatch**

- `react-dom@19.2.5` installed in root but `react@18.3.1` in `packages/client`
- `@testing-library/react` resolves peer dep to React 19 but client uses React 18
- Should pin `react-dom@18.3.1` in root or upgrade client to React 19

`[ ]` **Drizzle Types in Frontend Type Graph**

- When using `import type * as Functions from '../edgepod/functions'`, TypeScript resolves through `schema.ts`
- This pulls `drizzle-orm/sqlite-core` types into frontend compilation
- Not harmful but slows type-checking; fully resolved by generated `client.gen.ts`

`[x]` **WebSocket Cost Transparency**

- Uses `acceptWebSocket` hibernation API — idle DOs sleep even with open connections
- Only billed for actual execution time (ms per message), not wall-clock active hours
- Free tier: ~3M req/mo + ~390K GB-s; paid: 1M req + 400K GB-s included, then $0.15/M req + $12.50/M GB-s
- Outgoing WS messages and protocol pings are free; incoming billed at 20:1 ratio

`[ ]` **DO Hibernation + `migrate()`**

- `migrate()` runs on every cold start (initialization or after hibernation)
- Drizzle's DO migrator should be idempotent, but we haven't verified it produces zero writes on already-migrated DBs
- Low risk but worth confirming

`[ ]` **Proxy Performance**

- `createTrackedDb` wraps every Drizzle method call in a Proxy
- No measurable impact expected for typical CRUD workloads
- If profiling reveals overhead, could switch to compile-time instrumentation (AST transformation)

---

## Done (Completed Since Last Review)

- [x] Client-side mutation invalidation (Option C) — `hooks/useMutation.ts` calls `invalidateTables` on success
- [x] Server broadcasts WS invalidations to **all** sessions (sender included) as safety net
- [x] Vitest + React Testing Library test suite for client package (19 tests)
- [x] `resetRegistry()` for test isolation
- [x] `docs/client-architecture.md` documenting reactive architecture decisions
