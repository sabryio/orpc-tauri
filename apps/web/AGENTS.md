# Web App

## Overview

Tauri 2 desktop application with React 19 frontend. Demonstrates type-safe RPC between TypeScript and Rust via oRPC contracts, with dual streaming support (SSE events and Tauri channels). Frontend uses TanStack Router for routing and TanStack Query for data fetching.

## Key files

| File                        | Owns                                                      |
| --------------------------- | --------------------------------------------------------- |
| src/rpc/contract.ts         | oRPC contract definitions, maps to Tauri commands         |
| src/rpc/index.ts            | RPC client setup with TauriLink                           |
| src-tauri/                  | Rust backend (see src-tauri/AGENTS.md)                    |
| src/routes/                 | TanStack Router routes with tab-based UI                  |

## Commands

```bash
# Dev (frontend only, browser)
bun dev

# Dev (desktop with Tauri)
bun desktop:dev

# Build desktop app
bun desktop:build

# Type check
bun check-types

# Generate env types
bun env:generate
```

## Conventions

- Contract defines the API surface: every Tauri command has a matching oRPC contract entry
- Command naming: `snake_case` in Rust, contract metadata maps to camelCase in TypeScript
- Streaming transports: `tauri.transport({kind: "stream"})` for SSE, `{kind: "channel"}` for Tauri channels
- Stream IDs and event names generated via contract metadata (streamId, eventNames functions)
- Routes use TanStack Router file-based routing, generated in `src/routeTree.gen.ts`
- Components from `@tauri-orpc-contract/ui` package, not local duplicates
- Env validation via Varlock, types auto-generated on postinstall

## Gotchas

- SSE streaming requires unique event names per stream instance, generated via contract metadata
- Channel streaming uses Tauri's Channel type, sent as function parameter from frontend
- Contract `input(z.void())` required for commands with no input, not omitted
- TauriLink handles both unary calls and streaming via same client interface
- Rust commands return `Result<T, AppError>`, errors map to oRPC error codes via ErrorHandler

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
