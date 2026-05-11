# @edgepod/client

React client for EdgePod. Provides type-safe `useQuery` and `useMutation` hooks backed by SWR, with automatic WebSocket reactivity.

## Install

```bash
pnpm add @edgepod/client
```

## Quick start

### 1. Wrap your app with the provider

After running `edgepod init`, import the provider from the generated client file:

```tsx
import { EdgePodProvider } from "./edgepod/client";

function App() {
  return (
    <EdgePodProvider url="http://localhost:8989" apiKey="ep_pk_...">
      <MyApp />
    </EdgePodProvider>
  );
}
```

### 2. Use typed hooks in components

```tsx
import { useQuery, useMutation, useStatus } from "./edgepod/client";

function Post({ id }: { id: string }) {
  const { data, error, isLoading } = useQuery("getPost", { id });

  if (isLoading) return <p>Loading…</p>;
  if (error) return <p>Error: {error.message}</p>;
  return <h1>{data?.title}</h1>;
}

function CreatePost() {
  const { trigger, isMutating } = useMutation("createPost");

  return (
    <button disabled={isMutating} onClick={() => trigger({ title: "Hello world" })}>
      Create
    </button>
  );
}

function ConnectionBadge() {
  const status = useStatus();
  return <span>{status}</span>;
}
```

## API

### `EdgePodProvider`

Wrap your app (or a subtree) once:

| Prop     | Type     | Description                      |
| -------- | -------- | -------------------------------- |
| `url`    | `string` | Base URL of your EdgePod Worker. |
| `apiKey` | `string` | API key used for auth.           |

The provider manages the WebSocket lifecycle automatically.

### `useQuery(functionName, args?, options?)`

Read query backed by SWR.

| Param          | Type               | Description                                      |
| -------------- | ------------------ | ------------------------------------------------ |
| `functionName` | `string`           | Name of the RPC function to call.                |
| `args`         | `object` \| `null` | Arguments to pass. Pass `null` to skip fetching. |
| `options`      | `object`           | See options below.                               |

Returns `{ data, error, isLoading, isValidating, mutate }`.

### `useMutation(functionName, options?)`

Mutation hook.

| Param          | Type     | Description                       |
| -------------- | -------- | --------------------------------- |
| `functionName` | `string` | Name of the RPC function to call. |
| `options`      | `object` | See options below.                |

Returns `{ trigger, data, error, isMutating }`.

### `useStatus()`

React hook that reads the current WebSocket connection status:

```tsx
const status = useStatus(); // "connected" | "disconnected"
```

### Query / mutation options

| Option            | Applies to                | Description                                |
| ----------------- | ------------------------- | ------------------------------------------ |
| `fallbackData`    | `useQuery`                | Initial data before the first fetch.       |
| `onSuccess`       | `useQuery`, `useMutation` | Callback fired when the request succeeds.  |
| `onError`         | `useQuery`, `useMutation` | Callback fired when the request fails.     |
| `suspense`        | `useQuery`                | Enable React Suspense mode.                |
| `errorRetryCount` | `useQuery`                | Number of times to retry a failed request. |

### `$wsStatus`

A `nanostores` atom (`"connected" | "disconnected"`) you can subscribe to outside React if you want to observe the WebSocket state.

## How it works

- Queries are fetched via HTTP and cached with SWR.
- The server includes metadata (`_meta.t`) indicating which tables each query touches.
- On mutation, the client invalidates every SWR key that depends on the mutated tables.
- The WebSocket connection broadcasts invalidation events from other sessions, keeping all connected clients in sync.
