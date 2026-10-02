# Tauri oRPC Contract

## Stack

- **Language / Runtime**: TypeScript, Node 20, Rust (Tauri backend)
- **Framework**: React 19, TanStack Router, Vite, Tauri 2
- **Key dependencies**: oRPC (type-safe RPC), TanStack Query, Tailwind CSS 4, Zod
- **Package manager**: Bun (with bun workspaces)

## Commands

```bash
# Install
bun install

# Dev server (all workspaces)
bun dev

# Dev server (web app only)
bun dev:web

# Desktop dev (Tauri)
cd apps/web && bun desktop:dev

# Build
bun build

# Type check
bun check-types

# Format/lint
bun check
```

## Rules

- Tabs for indentation, double quotes for strings (Biome enforced)
- Sorted Tailwind classes via Biome (functions: clsx, cva, cn)
- No parameter reassignment, use as const assertions, self closing elements
- Contract first: define oRPC contracts with Zod schemas, types flow from there
- Commands map snake_case (Rust) to camelCase (TypeScript) via contract metadata
- Streaming uses two transports: SSE events (custom event names) or Tauri channels
- Workspace dependencies via `workspace:*` protocol

## Context files

- [apps/web/AGENTS.md](apps/web/AGENTS.md): Tauri desktop app with React frontend
- [apps/web/src-tauri/AGENTS.md](apps/web/src-tauri/AGENTS.md): Rust backend, command implementations
- [packages/tauri-link/AGENTS.md](packages/tauri-link/AGENTS.md): Custom oRPC link for Tauri IPC
- [packages/ui/AGENTS.md](packages/ui/AGENTS.md): Shared React component library

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
