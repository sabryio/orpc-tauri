# Tauri Backend

## Overview

Rust backend for the Tauri desktop app. Implements oRPC contract commands, dual streaming transports (SSE events and Tauri channels), and in-memory state management. Commands are exposed via Tauri's IPC layer and called from the TypeScript frontend through the TauriLink.

## Key files

| File                             | Owns                                                      |
| -------------------------------- | --------------------------------------------------------- |
| src/lib.rs                       | App setup, plugin registration, command handler registry  |
| src/commands/ping.rs             | Simple ping/pong command                                  |
| src/commands/planet.rs           | CRUD operations with in-memory PlanetStore                |
| src/commands/stream.rs           | SSE event streaming via Tauri event system                |
| src/commands/channel_stream.rs   | Channel streaming via Tauri IPC channels                  |
| src/sse.rs                       | Event types for SSE streaming                             |
| src/types/models.rs              | Domain models (PingResponse, Planet)                      |
| src/types/errors.rs              | AppError with serialization for IPC                       |
| Cargo.toml                       | Dependencies (tauri, serde, tokio, uuid, thiserror)       |

## Commands

```bash
# Dev (from web workspace)
bun desktop:dev

# Build desktop app
bun desktop:build

# Tauri CLI directly
cargo tauri dev
cargo tauri build
```

## Conventions

- Commands use `#[tauri::command]` macro, registered in `invoke_handler![]`
- Command names are snake_case and must match the oRPC contract route keys exactly (the link derives commands from route keys — no case conversion)
- Return type is `Result<T, AppError>` where T serializes to JSON
- State managed via `tauri::State<T>` for shared data (PlanetStore)
- SSE streaming: emit events via `app.emit()`, listen on frontend via event names
- Channel streaming: accept `Channel<Event<T>>` parameter, send via `channel.send()`
- Errors use thiserror for derive, serialize to JSON with code and message
- Async runtime via `tauri::async_runtime::spawn` for background tasks

## Gotchas

- SSE event names must match frontend expectations (generated in contract metadata)
- Channel streaming needs flush event first to establish connection (Axum style)
- State types must implement `Send + Sync` for tauri::State
- Command input/output must be Serialize + Deserialize, no borrowed data
- AppError must serialize to match oRPC error format (code field required)
- Tauri commands cannot return `impl Trait`, must use concrete types or Box<dyn>
- Stream cleanup: SSE listeners removed by frontend, channels auto-close on drop

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._

<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": false` in the root `turbo.json` or `turbo.jsonc` to opt out; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->
