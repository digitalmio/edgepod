# @edgepod/cli

CLI tool to initialize and manage EdgePod projects.

## Prerequisites

You need an existing project with a `package.json`. EdgePod uses it to find your project root, add scripts, and install dependencies.

```bash
pnpm init   # or npm init, bun init, etc.
```

## Initialize

Run this once to scaffold your EdgePod project:

```bash
npx @edgepod/cli init
```

This creates the `edgepod/` directory, generates config files, and installs `@edgepod/cli`, `@edgepod/server`, and `wrangler` as dev dependencies.

## Workflow

After init, all commands are via the scripts added to your `package.json`:

```bash
pnpm edgepod:dev      # Start the dev server (wrangler dev)
pnpm edgepod:build    # Generate Drizzle migrations after schema changes
pnpm edgepod:deploy   # Deploy to Cloudflare
```

## Commands

| Command | Description |
|---|---|
| `edgepod init` | Scaffold a new EdgePod project (schema, functions, wrangler config, etc.). |
| `edgepod build` | Detect schema changes and generate Drizzle migrations. |
| `edgepod info` | Show project info — API key, worker name, deployed URL. |
