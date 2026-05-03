# EdgePod Client Architecture & Decisions

## Current Implementation (v1.0)

### `@edgepod/client` Package

#### 1. `EdgePodProvider`

React context provider that:

- Generates a `sessionId` via `crypto.randomUUID()`
- Establishes a `PartySocket` WebSocket connection
- Wires WebSocket invalidation messages (`{ action: "invalidate", tables: [...] }`) to the nanostores registry, which triggers SWR revalidation

#### 2. `useQuery(functionName, args?, config?)`

SWR-powered query hook:

- **Key format:** `["edgepod", functionName, args]` (SWR-idiomatic array keys)
- Calls `rpcFetcher` which POSTs to `/rpc/{functionName}`
- After a successful fetch, registers the returned `_meta.t` (hashed table names) in the nanostores registry via `registerQuery(tables, swrKey)`
- Cleans up registry entries on unmount / key change via `deregisterQuery(tables, swrKey)`
- Returns `{ data, error, isLoading, isValidating, mutate }`

#### 3. `useMutation(functionName, config?)`

SWR mutation hook:

- Returns `{ trigger, data, error, isMutating }`
- Calls `rpcFetcher` via `trigger(arg?)`
- **Currently relies on server WebSocket invalidations (Option B)** — the server detects writes and pings all listening clients
- **TODO comments** in place for:
  - Immediate client-side invalidation (Option C) using `_meta.t` from the mutation response
  - Optimistic updates support

#### 4. `rpcFetcher<T>(ctx, functionName, args?)`

HTTP RPC caller:

- POSTs to `/rpc/{functionName}` with headers:
  - `X-Edgepod-Key: {apiKey}`
  - `X-Edgepod-Session-Id: {sessionId}`
  - `Content-Type: application/json`
- Returns `{ data, _meta: { t: string[] } }` where `t` is the array of hashed table names read during the RPC execution

#### 5. `store.ts` (nanostores registry)

Central mapping layer that bridges WebSocket invalidations to SWR keys:

- **`$registry` atom:** `Map<hashedTableName, Set<serializedSWRKey>>`
- **`registerQuery(tables, swrKey)`** — adds an SWR key to each hashed table's subscription set
- **`deregisterQuery(tables, swrKey)`** — removes an SWR key on unmount / key change
- **`invalidateTables(tables)`** — looks up all registered SWR keys for the given hashed tables and calls SWR's global `mutate()` on each, triggering background revalidation

### Server-Side

`packages/server/src/server/index.ts` returns RPC responses in this shape:

```json
{
  "success": true,
  "data": {...},
  "_meta": {
    "t": ["a1b2c3", "d4e5f6"]
  }
}
```

Where `_meta.t` is `hashMetaTableNames(meta.read)` — djb2-hashed table names from the Drizzle query tracker. WebSocket broadcasts use the same hashes, so the client never needs to decode them.

---

## Design Decisions

### Why No Hash Decoding on the Client?

The server hashes table names before sending them in both HTTP `_meta.t` and WebSocket `invalidate` messages. The client only needs a hash-to-SWR-key mapping. Decoding is unnecessary because:

- The registry stores `hashedTableName → Set<swrKey>`
- When a WS message arrives with hashes, we look them up directly
- No reverse hash function needed

### Mutation Invalidation: Option B (WebSocket Only)

Mutations rely on the server's WebSocket invalidation ping after writes are committed. This is the single source of truth and handles cross-client sync naturally.

**Deferred to v1.1:**

- Option C (immediate client-side invalidation using `_meta.t` from the mutation response)
- Optimistic updates

### SWR Key Format: Arrays

We use `['edgepod', functionName, args]` instead of string concatenation because:

- SWR natively deduplicates array keys by reference
- Arrays are more readable and debuggable in DevTools
- No risk of collision from string serialization edge cases

---

## v1.0: Typed Client with `import type` (Monorepo & Same-Repo)

### How It Works

For projects where frontend and backend live in the same repository (monorepo or same folder), TypeScript can infer types directly from the backend functions:

```ts
// frontend/src/api.ts
import type * as Functions from "../../edgepod/functions/index";
import { createEdgePodClient } from "@edgepod/client";

const { useQuery, useMutation } = createEdgePodClient<typeof Functions>();

// Fully typed — function names, args, and return types inferred
const { data } = useQuery("getUsers");
//    ^? data: Array<{ id: number; email: string; name: string | null }>

const { trigger } = useMutation("createUser");
//    ^? trigger: (args: { email: string; name: string }) => Promise<{ ... }>
```

### Type Inference

`createEdgePodClient<typeof Functions>()` infers an `EdgePodRouter` from the exported function signatures:

- **Function names** — from object keys (`getUsers`, `createUser`)
- **Args** — from the second parameter of each function (skipping `ctx`)
- **Returns** — from `Awaited<ReturnType<fn>>` (unwraps `Promise<>` automatically)

### Limitations

- Requires `import type` from backend source files — frontend `tsc` resolves the full type graph including Drizzle definitions
- Does **not** work for separate repositories (frontend cannot import backend files)
- For separate repos, use the untyped hooks (`useQuery<string>("foo")`) or manually write a router type

---

## v1.1 Plan: CLI Type Generation (Separate Repos)

For cross-repo setups where `import type` is impossible, a CLI command generates a self-contained type manifest:

```bash
npx edgepod generate-client-types [--watch]
```

See `docs/type-extractor-spec.md` for the full design spec and implementation guide. This uses the TypeScript compiler API to:

- Parse `edgepod/functions/index.ts`
- Extract function signatures (name, args, return type)
- Recursively inline all types with zero backend imports
- Emit `edgepod/client.gen.ts` with an `EdgePodRouter` type

### Generated File Format

```ts
// Auto-generated by EdgePod CLI. Do not edit manually.

export type EdgePodRouter = {
  getUsers: {
    args: never;
    returns: Array<{ id: number; email: string; name: string | null }>;
  };
  getUserById: {
    args: { id: number };
    returns: { id: number; email: string; name: string | null } | null;
  };
  createUser: {
    args: { email: string; name: string };
    returns: { id: number; email: string; name: string | null };
  };
};
```

### Frontend Usage (v1.1)

```ts
import type { EdgePodRouter } from "./edgepod/client.gen";
import { createEdgePodClient } from "@edgepod/client";

const { useQuery, useMutation } = createEdgePodClient<EdgePodRouter>();
```

---

## Open Questions

1. **Docs generation:** Should the CLI emit a README in the `edgepod/` folder explaining `client.gen.ts` usage?

2. **Typed vs untyped hooks:** Both coexist. `createEdgePodClient<Router>()` is recommended for production. Untyped `useQuery`/`useMutation` remain available for quick scripts and prototyping.

3. **TypeScript compiler API vs ts-morph:** The built-in compiler API is sufficient for flat function extraction. If we later need more advanced AST manipulation (e.g., JSDoc parsing, middleware unwrapping), we may upgrade to `ts-morph`.

---

## Why Type Generation Is Necessary for Separate Repos

| Approach                                                 | Separate Repos?      | Drawbacks                                                                                           |
| -------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------- |
| `import type * as Functions from '../backend/functions'` | ❌ Requires monorepo | Frontend `tsc` resolves full type graph including Drizzle definitions                               |
| Runtime validation (Zod)                                 | ✅ Works             | Requires rewriting backend to use Zod instead of Drizzle native types                               |
| API introspection endpoint                               | ❌ Not typesafe      | JSON strings cannot become compile-time TypeScript types                                            |
| Publish types as npm package                             | ✅ Works             | Still requires generating type artifacts — just a different distribution channel                    |
| `tsc --declaration` emit                                 | ❌ Fragile           | Emitted `.d.ts` files reference original imports (schema, Drizzle), which the frontend may not have |
| **CLI-generated inlined types**                          | ✅ Clean             | Single self-contained file, zero backend imports, zero runtime cost                                 |

The generated `client.gen.ts` is the only approach that satisfies all constraints: cross-repo compatible, backend-agnostic, compile-time only, and copyable as a single file.
