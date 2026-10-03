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

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
