# EdgePod Client Architecture & Decisions

## Current Implementation (v1.0)

### `@edgepod/client` Package

#### 1. `EdgePodProvider`

The root component that manages client configuration and WebSocket lifecycle:

- Captures `url` and `apiKey` from props
- Generates a `sessionId` via `crypto.randomUUID()`
- Establishes a `PartySocket` WebSocket connection in `useEffect`
- Wires WebSocket invalidation messages (`{ action: "invalidate", tables: [...] }`) to the nanostores registry, which triggers SWR revalidation
- Provides `{ url, apiKey, sessionId, wsStatus }` via React context

Wrap your app once:

```tsx
import { EdgePodProvider } from "./edgepod/client";

<EdgePodProvider url="http://localhost:8989" apiKey="ep_pk_...">
  <App />
</EdgePodProvider>;
```

#### 2. `useQuery(functionName, args?, options?)`

SWR-powered query hook. Reads `url`/`apiKey`/`sessionId` from context internally:

- **Key format:** `["edgepod", functionName, args]` (SWR-idiomatic array keys)
- Calls `rpcFetcher` which POSTs to `/rpc/{functionName}`
- After a successful fetch, registers the returned `_meta.t` (hashed table names) in the nanostores registry via `registerQuery(tables, swrKey)`
- Cleans up registry entries on unmount / key change via `deregisterQuery(tables, swrKey)`
- Returns `{ data, error, isLoading, isValidating, mutate }`

Exposed options:

| Option            | Description                                |
| ----------------- | ------------------------------------------ |
| `fallbackData`    | Initial data before the first fetch.       |
| `onSuccess`       | Callback fired when the request succeeds.  |
| `onError`         | Callback fired when the request fails.     |
| `suspense`        | Enable React Suspense mode.                |
| `errorRetryCount` | Number of times to retry a failed request. |

#### 3. `useMutation(functionName, options?)`

SWR mutation hook. Also reads context internally:

- Returns `{ trigger, data, error, isMutating }`
- Calls `rpcFetcher` via `trigger(arg?)`
- **Immediate client-side invalidation** — reads `_meta.t` from the mutation response and calls `invalidateTables(_meta.t)` to refresh local queries
- The server also broadcasts the same invalidation to all other connected clients via WebSocket

Exposed options:

| Option      | Description                               |
| ----------- | ----------------------------------------- |
| `onSuccess` | Callback fired when the request succeeds. |
| `onError`   | Callback fired when the request fails.    |

**Deferred to v1.1:**

- Optimistic updates

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

### Mutation Invalidation: Immediate Client-Side

Mutations call `rpcFetcher` and read `_meta.t` from the response. If tables were written to, the client immediately calls `invalidateTables(_meta.t)` to refresh local queries. The server also broadcasts the same invalidation to all other connected clients via WebSocket, so cross-client sync is handled automatically.

**Deferred to v1.1:**

- Optimistic updates

### SWR Key Format: Arrays

We use `['edgepod', functionName, args]` instead of string concatenation because:

- SWR natively deduplicates array keys by reference
- Arrays are more readable and debuggable in DevTools
- No risk of collision from string serialization edge cases

---

## v1.0: Typed Client with Generated Client File

### How It Works

After running `edgepod init`, a typed client is generated in the `edgepod/` folder:

```ts
// edgepod/client.ts — generated
export { EdgePodProvider, useStatus, $wsStatus } from "@edgepod/client";

import { useQuery as baseUseQuery, useMutation as baseUseMutation } from "@edgepod/client";
import type * as functions from "./functions/index";

type Router = {
  [K in keyof typeof functions]: {
    args: Parameters<(typeof functions)[K]> extends [any, infer P] ? P : undefined;
    returns: Awaited<ReturnType<(typeof functions)[K]>>;
  };
};

export function useQuery<K extends keyof Router & string>(
  functionName: K,
  args?: Router[K]["args"] | null,
  options?: { fallbackData?: Router[K]["returns"]; onSuccess?: (data: Router[K]["returns"]) => void; onError?: (error: Error) => void; suspense?: boolean; errorRetryCount?: number },
) { ... }

export function useMutation<K extends keyof Router & string>(
  functionName: K,
  options?: { onSuccess?: (data: Router[K]["returns"]) => void; onError?: (error: Error) => void },
) { ... }
```

### Usage in Components

```tsx
import { EdgePodProvider, useQuery, useMutation } from "./edgepod/client";

function MyApp() {
  return (
    <EdgePodProvider url="http://localhost:8989" apiKey="ep_pk_...">
      <Users />
    </EdgePodProvider>
  );
}

function Users() {
  const { data } = useQuery("getUsers");
  //    ^? data: Array<{ id: number; email: string; name: string | null }>

  const { trigger } = useMutation("createUser");
  //    ^? trigger: (args: { email: string; name: string }) => Promise<{ ... }>
}
```

### Limitations

- Works in monorepos where frontend and backend share `node_modules` (TypeScript can resolve backend imports)
- Does **not** work for separate repositories (frontend cannot import backend files)
- Frontend `tsc` resolves the full backend type graph including Drizzle definitions — this can slow type-checking as the backend grows

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
import { EdgePodProvider, useQuery, useMutation } from "@edgepod/client";
import type { EdgePodRouter } from "./edgepod/client.gen";

// Hooks would accept a generic or the types would be wired another way
```

---

## Open Questions

1. **Docs generation:** Should the CLI emit a README in the `edgepod/` folder explaining `client.gen.ts` usage?

2. **Typed vs untyped hooks:** Untyped `useQuery`/`useMutation` remain available from `@edgepod/client` for quick scripts and prototyping. The generated `edgepod/client.ts` is recommended for production.

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
