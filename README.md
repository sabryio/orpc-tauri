# Tauri oRPC Contract

Type-safe RPC between TypeScript and Rust using [oRPC](https://orpc.unnoq.com/) contracts. Demonstrates contract-first architecture with dual streaming transports (SSE events and Tauri channels) in a Tauri 2 desktop application.

## Features

- **oRPC Contracts** - Zod schemas define the API surface, types flow to both frontend and backend
- **Custom Tauri Link** - oRPC link implementation bridges contracts to Tauri IPC
- **Dual Streaming** - SSE event streaming and Tauri channel streaming in one contract
- **React 19** - Modern React with TanStack Router and TanStack Query
- **TypeScript + Rust** - Type safety across the IPC boundary
- **Bun Workspaces** - Monorepo with shared packages
- **Tailwind CSS 4** - Latest Tailwind with CSS-first configuration
- **shadcn/ui** - Shared component library in `packages/ui`

## Quick Start

Install dependencies:

```bash
bun install
```

Run the web app in browser:

```bash
bun dev
# or target web only
bun dev:web
```

Open [http://localhost:3001](http://localhost:3001).

Run the Tauri desktop app:

```bash
cd apps/web
bun desktop:dev
```

## Project Structure

```
tauri-orpc-contract/
├── apps/
│   └── web/                # Tauri desktop app (React frontend + Rust backend)
│       ├── src/            # TypeScript frontend
│       │   ├── rpc/        # oRPC contract and client setup
│       │   └── routes/     # TanStack Router routes
│       └── src-tauri/      # Rust backend
│           ├── src/
│           │   ├── commands/   # Tauri command implementations
│           │   └── types/      # Domain models and errors
│           └── Cargo.toml
├── packages/
│   ├── tauri-link/         # Custom oRPC link for Tauri IPC
│   ├── ui/                 # Shared shadcn/ui components
│   └── config/             # Shared TypeScript config
└── docs/                   # Implementation guides
```

## Architecture

**Contract-first design**: Define oRPC contracts with Zod schemas in `apps/web/src/rpc/contract.ts`. Types flow to both frontend (via oRPC client) and backend (via contract metadata). Rust commands use snake_case, mapped to camelCase in TypeScript via contract metadata.

**Dual streaming transports**:
- **SSE events** - `tauri.transport({kind: "stream"})` with unique event names per stream
- **Tauri channels** - `{kind: "channel"}` with Channel type passed as function parameter

The custom TauriLink (`packages/tauri-link`) reads contract metadata to route calls to the appropriate Tauri command and streaming handler.

## Available Scripts

- `bun dev` - Start all workspaces in development mode
- `bun dev:web` - Start web app only (browser)
- `bun build` - Build all workspaces
- `bun check-types` - TypeScript type checking across workspaces
- `bun check` - Run Biome formatting and linting

**Desktop app** (run from `apps/web/`):
- `bun desktop:dev` - Start Tauri app in development
- `bun desktop:build` - Build production desktop app

## Shared UI Components

React apps share shadcn/ui primitives through `packages/ui`.

- Update design tokens in `packages/ui/src/styles/globals.css`
- Add components in `packages/ui/src/components/*`
- Configure shadcn in `packages/ui/components.json`

Add more shared components:

```bash
npx shadcn@latest add accordion dialog popover -c packages/ui
```

Import in apps:

```tsx
import { Button } from "@tauri-orpc-contract/ui/components/button";
```

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TanStack Router, TanStack Query, Tailwind CSS 4 |
| Backend | Rust, Tauri 2 |
| RPC | oRPC contracts, custom TauriLink |
| Validation | Zod (contracts), Varlock (env schemas) |
| Monorepo | Bun workspaces, Turborepo |
| Tooling | Biome, TypeScript 6 |

## Documentation

- `packages/tauri-link/README.md` - TauriLink implementation guide
- `docs/ORPC_ERROR_HANDLING.md` - Error handling patterns
- `docs/CUSTOM_LINK_IMPLEMENTATION.md` - Custom link architecture
- `AGENTS.md` files in each workspace - AI context and conventions
