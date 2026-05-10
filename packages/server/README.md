# @edgepod/server

Server component for EdgePod. Provides the `edgePodFetch` handler, `BaseEdgePodEngine` Durable Object, and Drizzle-based schema builders for building reactive, edge-hosted backends on Cloudflare Workers.

## Install

```bash
pnpm add @edgepod/server
```

## Workflow

After running `edgepod init`, the server entrypoint is **100% auto-generated** in `edgepod/.generated/server.ts`. You do not need to edit it.

Your day-to-day work is just:

1. Define tables in `edgepod/schema.ts`
2. Define functions in `edgepod/functions/index.ts`
3. Run `edgepod migrations` after schema changes
4. Run `pnpm edgepod:deploy` to ship

> Never edit files in `edgepod/.generated/` — they are overwritten by the CLI.

## Schema Exports

Import schema builders from `@edgepod/server/schema` — safe to use in Node.js (CLI tooling, migrations) and Workers:

```ts
import { table, text, integer, eq, sql } from "@edgepod/server/schema";
```

## Data Residency

Pass jurisdiction or location hints to `edgePodFetch` in your generated server file:

```ts
edgePodFetch(request, env, { jurisdiction: "eu" });
```
