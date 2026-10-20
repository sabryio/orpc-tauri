# Tauri oRPC Contract

**Type-safe RPC between TypeScript and Rust for Tauri desktop apps.**

Define your API once as an oRPC contract with Zod schemas and get end-to-end type safety across the IPC boundary — including streaming, with zero code generation.

Built on [oRPC](https://orpc.unnoq.com/) and [Tauri 2](https://v2.tauri.app/), powered by the [`tauri-link`](./packages/tauri-link) — a custom oRPC link bridge, also published as [`@sabryio/orpc-tauri`](https://jsr.io/@sabryio/orpc-tauri) on JSR.

---

<div align="center">

[Capabilities](#key-capabilities) · [Quick Start](#quick-start) · [Contract Design](#contract-design) · [Architecture](#architecture) · [Scripts](#scripts) · [Docs](#documentation)

</div>

---

## Key Capabilities

|                                |                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------- |
| 🔗 **Contract-first**          | One source of truth; types flow to React, TanStack Query, and Rust           |
| ⚡ **Zero code generation**    | The contract _is_ the client — no generators, no drift                       |
| 🎯 **Convention over config**  | Route keys are the Rust command names, verbatim                              |
| 📡 **Dual streaming**          | Listen-style SSE events **and** Tauri channels, in one contract              |
| 🛡️ **Typed errors**            | Rust `AppError` maps to typed, contract-defined oRPC errors                  |
| 🏗️ **Resource-safe internals** | Effect-based link with automatic listener cleanup — Promise-based public API |

## Quick Start

**Prerequisites:** [Bun](https://bun.sh), [Rust](https://rustup.rs), and the [Tauri CLI](https://v2.tauri.app/start/prerequisites/) (`cargo install tauri-cli --version ^2`).

```bash
bun install

# Web app (frontend only, browser)
bun dev                   # → http://localhost:3001

# Desktop app (starts the Rust backend)
cd apps/web
bun desktop:dev
```

## Contract Design

A contract procedure is defined once and consumed everywhere. **Route keys are the snake_case Rust command names** — the link derives the invoked command from the route path, so standard procedures need no metadata at all:

```ts
// apps/web/src/rpc/contract.ts
export const contract = {
  planet: {
    // Route key `delete_planet` → invokes Rust command `delete_planet`
    delete_planet: oc
      .input(z.object({ input: z.object({ id: z.number().int() }) }))
      .output(z.void())
      .errors(StandardApiErrors),
  },
};
```

```tsx
// Fully typed — including error shapes
const mutation = orpc.planet.delete_planet.mutationOptions({
  onSuccess: () =>
    queryClient.invalidateQueries({ queryKey: orpc.planet.key() }),
});
```

Streaming procedures add one short meta instruction — two transports, same client interface:

```ts
stream: {
  stream_events: oc
    .meta(tauri.listen())           // Broadcast-style SSE events
    .input(z.void())
    .output(asyncIteratorObject(AppEventSchema)),

  stream_events_channel: oc
    .meta(tauri.channel("onEvent")) // Point-to-point Tauri channel
    .input(z.void())
    .output(asyncIteratorObject(AppEventSchema)),
},
```

Use `tauri.command("override_name")` only when a command name must differ from its route key.

## Architecture

```
React (TanStack Router + Query)
        │  orpc client
        ▼
┌──────────────────┐        ┌────────────────────────┐
│ TauriLink        │  IPC   │ Rust (Tauri 2 backend) │
│ (oRPC link)      │ ─────▶ │ #[tauri::command] fns  │
│ reads contract   │        │ Result<T, AppError>    │
│ metadata per call│ ─────▶ │ SSE events / Channels  │
└──────────────────┘        └────────────────────────┘
```

- **Contract-first**: `apps/web/src/rpc/contract.ts` defines the API surface with Zod schemas. Types flow to the frontend via the oRPC client; runtime shapes match Rust through serde.
- **Derived commands**: `packages/tauri-link` derives the Tauri command from the contract route path — duplicate command names fail at link-construction time.
- **Dual transports**: the link routes calls based on contract metadata: `tauri.listen()` streams events with unique per-stream event names; `tauri.channel()` passes a native Tauri `Channel` as a function argument.
- **Error mapping**: Rust `AppError` serializes with `code` + `message`; the link converts them to `ORPCError`, so `isDefinedError()` works for contract-declared errors.

### Project Structure

```
├── apps/
│   └── web/                    # Tauri desktop app
│       ├── src/                #   React frontend — /rpc contract & client, /routes
│       └── src-tauri/          #   Rust backend — /src/commands, /src/types
├── packages/
│   ├── tauri-link/             # oRPC ↔ Tauri IPC link (published to JSR)
│   ├── ui/                     # Shared shadcn/ui component library
│   └── config/                 # Shared TypeScript config
└── docs/                       # Implementation guides
```

## Scripts

| Command (repo root) | Description                                       |
| ------------------- | ------------------------------------------------- |
| `bun install`       | Install dependencies (Bun workspaces + Turborepo) |
| `bun dev`           | Dev server for all workspaces                     |
| `bun dev:web`       | Dev server, web app only                          |
| `bun build`         | Production build, all workspaces                  |
| `bun check-types`   | TypeScript checks across workspaces               |
| `bun check`         | Biome format & lint                               |

**Desktop app** (from `apps/web/`): `bun desktop:dev` · `bun desktop:build`

## Shared UI Components

The shadcn/ui primitives live in `packages/ui` and are shared across apps:

```tsx
import { Button } from "@tauri-orpc-contract/ui/components/button";
```

```bash
# Add more primitives (from the repo root)
npx shadcn@latest add accordion dialog popover -c packages/ui
```

Design tokens: `packages/ui/src/styles/globals.css` · Component config: `packages/ui/components.json`

## Stack

| Layer      | Technology                                                |
| ---------- | --------------------------------------------------------- |
| Frontend   | React 19, TanStack Router, TanStack Query, Tailwind CSS 4 |
| Backend    | Rust, Tauri 2, serde, thiserror                           |
| RPC        | oRPC contracts + custom `TauriLink` (Effect internals)    |
| Validation | Zod (contracts), Varlock (env schemas)                    |
| Monorepo   | Bun workspaces, Turborepo                                 |
| Tooling    | TypeScript 6, Biome, Vitest                               |

## Documentation

| Document                                                                     | Scope                                                    |
| ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| [`packages/tauri-link/README.md`](./packages/tauri-link/README.md)           | Full TauriLink guide — contracts, streaming, errors, API |
| [`docs/ORPC_ERROR_HANDLING.md`](./docs/ORPC_ERROR_HANDLING.md)               | Error handling patterns                                  |
| [`docs/CUSTOM_LINK_IMPLEMENTATION.md`](./docs/CUSTOM_LINK_IMPLEMENTATION.md) | Link architecture deep dive                              |
| [`docs/OPENAPI_LINK_GUIDE.md`](./docs/OPENAPI_LINK_GUIDE.md)                 | OpenAPI-style link guide                                 |
| `AGENTS.md` (per workspace)                                                  | Conventions and AI context                               |

## Troubleshooting

### `resources.close not allowed` when cancelling a resource-backed stream

**Symptom:** Clicking Cancel on a resource-backed download (or any `tauri.resource()` stream) logs:

```
[tauri-link] Failed to close Rust resource rid=… (Rust task was NOT cancelled — it keeps running).
Cause: TauriInvokeError: resources.close not allowed.
```

**Cause:** Tauri bakes capabilities into the binary at compile time. The `plugin:resources|close` call the link uses to cancel the Rust task requires `core:resources:allow-close`, which is **not** included in `core:default`. Additionally, if `tauri.conf.json` has an inline `app.security.capabilities` array, the files in `src-tauri/capabilities/` are ignored entirely — only the inline block is compiled in.

**Fix:** Remove the inline `capabilities` block from `tauri.conf.json` so Tauri loads `src-tauri/capabilities/*.json` instead:

```json
// tauri.conf.json — before
"security": {
  "csp": null,
  "capabilities": [ { ... } ]   // ← this shadows your capabilities/ folder
}

// tauri.conf.json — after
"security": {
  "csp": null
}
```

Then make sure `src-tauri/capabilities/default.json` includes the permission:

```json
{
  "identifier": "default",
  "windows": ["main"],
  "permissions": ["core:default", "core:resources:allow-close"]
}
```

Rebuild (`bun desktop:dev`) — the cancel button will now close the rid server-side and stop the Rust task within ~50 ms.

## License

The `tauri-link` package is released under the [MIT license](./packages/tauri-link/LICENSE).
