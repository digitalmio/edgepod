# @edgepod/client

React client for EdgePod. Provides type-safe `useQuery` and `useMutation` hooks backed by SWR, with automatic WebSocket reactivity.

## Install

```bash
pnpm add @edgepod/client
```

## Quick start

### 1. Import the generated client

After running `edgepod init`, a typed client is generated in your `edgepod/` folder:

```ts
import { edgepod } from "./edgepod/client";
```

### 2. Use in components

```tsx
function Post({ id }: { id: string }) {
  const { data, error, isLoading } = edgepod.useQuery("getPost", { id });

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p>Error: {error.message}</p>;
  return <h1>{data?.title}</h1>;
}

function CreatePost() {
  const { trigger, isMutating } = edgepod.useMutation("createPost");

  return (
    <button disabled={isMutating} onClick={() => trigger({ title: "Hello world" })}>
      Create
    </button>
  );
}
```

No provider wrapping needed — the client auto-connects its WebSocket on creation.

## Creating a client manually

If you are not using the CLI-generated client, create one with `createEdgePodClient`:

```ts
import { createEdgePodClient } from "@edgepod/client";
import type { EdgePodRouter } from "./edgepod/router";

export const edgepod = createEdgePodClient<EdgePodRouter>({
  url: "http://localhost:8989",
  apiKey: "your-api-key",
});
```

## API

### `createEdgePodClient<Router>(config)`

| Param    | Type     | Description                      |
| -------- | -------- | -------------------------------- |
| `url`    | `string` | Base URL of your EdgePod Worker. |
| `apiKey` | `string` | API key used for auth.           |

Returns an object with:

- `useQuery(functionName, args?, swrConfig?)` – read query. Uses SWR under the hood.
- `useMutation(functionName, swrMutationConfig?)` – mutation hook. Returns `{ trigger, data, error, isMutating }`.
- `status` – current WebSocket status (`"connected" | "disconnected"`).

Pass your server router type (e.g. from `typeof import("./edgepod/functions")`) to get full type-safety for function names, arguments, and return values.

### `useStatus()`

React hook that reads the current WebSocket connection status:

```tsx
import { useStatus } from "@edgepod/client";

function ConnectionBadge() {
  const status = useStatus();
  return <span>{status}</span>;
}
```

### `$wsStatus`

A `nanostores` atom (`"connected" | "disconnected"`) you can subscribe to outside React if you want to observe the WebSocket state.

## How it works

- Queries are fetched via HTTP and cached with SWR.
- The server includes metadata (`_meta.t`) indicating which tables each query touches.
- On mutation, the client invalidates every SWR key that depends on the mutated tables.
- The WebSocket connection broadcasts invalidation events from other sessions, keeping all connected clients in sync.
