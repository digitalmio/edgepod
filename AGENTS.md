# EdgePod — Agent Rules

## General Behaviour

- **Ask questions if unsure, do not assume anything.** When requirements are ambiguous, ask for clarification before writing code.
- **Keep files under 150 lines** (soft limit). Files above 200 lines must be refactored into smaller modules (hard limit).
- **No Python.** For helper scripts, use Node.js (plain `.mjs` files). Never reach for Python, shell scripts beyond simple one-liners, or other runtimes.
- **Do not edit auto-generated files.** Files like `routeTree.gen.ts` (TanStack Router), `worker-configuration.d.ts`, or any file with a `// This file is auto-generated` header must never be manually edited — they are overwritten by tooling.
- **Do not edit shadcn/ui files.** Files under `src/components/ui/` are installed and managed by the shadcn CLI. Never modify them — override styles at the call site instead.

---

## React — Hydration & useEffect

- **Avoid `useEffect` unless truly necessary.** It adds complexity, delays rendering, and can cause layout shift.
- **Hydration mismatches:** before reaching for `useEffect` to force client-only rendering, first check whether the mismatch can be suppressed with `suppressHydrationWarning` on the element. Use this when the differing value is inherently client-specific (e.g. a timestamp, locale-formatted date) and the mismatch is expected and harmless.
  ```tsx
  <span suppressHydrationWarning>{formatRelativeTime(date)}</span>
  ```
- Only fall back to `useEffect` + client-side state if the suppressed mismatch would cause a visible flash or broken UI that `suppressHydrationWarning` cannot hide.

---

## After Every File Change

After creating or modifying **any** file, always run the following two commands from the repo root before considering the task done:

```sh
pnpm format
pnpm lint
```

If those scripts are not yet defined at the root, run them scoped to the affected package:

```sh
pnpm --filter <package-name> build
```

---

## Formatter — oxfmt

Config: `.oxfmtrc.json` at repo root.

Key rules:

- `printWidth`: 100
- `tabWidth`: 2, spaces (no tabs)
- `semi`: true
- `singleQuote`: false — **always double quotes**
- `trailingComma`: `"es5"` — trailing commas in objects and arrays, not function params
- `arrowParens`: `"always"` — always wrap arrow function params: `(x) => x`
- `bracketSpacing`: true — `{ foo }` not `{foo}`
- `bracketSameLine`: false — JSX closing `>` goes on its own line

---

## Linter — oxlint

Config: `.oxlintrc.json` at repo root.

Key rules:

- `correctness` violations are **errors** — must be fixed
- `suspicious` violations are **warnings** — must be reviewed
- `no-unused-vars`: warn — remove unused variables
- `no-console`: off — `console.log` is allowed
- `eqeqeq`: warn — prefer `===` over `==`
- Plugin `unicorn` is active

Ignored paths: `**/dist/**`, `**/node_modules/**`, `scripts/**`

---

## TypeScript

- All packages use `tsc --noEmit` for type-checking — **no emit, no dist**
- Apps (Cloudflare Worker, Next.js) are the only things that bundle/compile
- Packages point their `main`/`exports` directly at `./src/*.ts`
- `@cloudflare/workers-types` is declared and installed in the `tsconfig.json` of the packages that do require it — do NOT add triple-slash `/// <reference types="@cloudflare/workers-types" />` directives to source files
- For Node globals (e.g. `process`) in config files like `drizzle.config.ts`, use `/// <reference types="node" />` at the top of that specific file only

---

## Code Style

- Prefer `const` over `let`; never use `var`
- Use named exports — avoid default exports except where frameworks require them (e.g. Cloudflare Worker `export default { fetch }`)
- All factory functions that take `env: Cloudflare.Env` must cast internally — never widen the public signature
- Section comments are a single line — no surrounding dashes:
  ```ts
  // Section name
  ```
  For multi-line context, continue with plain `//` on the next line:
  ```ts
  // Section name — brief note that fits on one line
  // Second line of context if truly needed
  ```
- TODOs are written as `// TODO: description` — one per line, actionable

---

## neverthrow

Use `ResultAsync` to wrap async calls that would otherwise require try/catch.

**Wrapping Better Auth calls** (which return `{ data, error }` instead of throwing):

```ts
function doSomething(email: string) {
  return ResultAsync.fromPromise(
    authClient.someMethod({ email }).then(({ error }) => {
      if (error) throw new Error(error.message ?? "Fallback message.");
    }),
    (e) => (e instanceof Error ? e.message : "Fallback message.")
  );
}
```

- Throw inside `.then()` to convert the `{ error }` response into a real rejection — that's what `fromPromise` catches
- The second arg (error mapper) should always return `string` for consistency
- No need to annotate return types — TypeScript infers `ResultAsync<T, string>` correctly
- Consume with `.match(okFn, errFn)` — never `await` and unwrap manually
- No need for `.andThen(res => res)` — that's only for flattening nested `ResultAsync` values
