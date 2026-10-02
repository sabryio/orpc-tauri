# Tauri Link

## Overview

Custom oRPC link implementation that bridges oRPC contracts to Tauri IPC. Handles unary commands and dual streaming transports (SSE event streaming and Tauri channel streaming). Provides type-safe client for Tauri commands defined in oRPC contracts.

## Key files

| File                                  | Owns                                                    |
| ------------------------------------- | ------------------------------------------------------- |
| src/link.ts                           | Main TauriLink class, routing calls to handlers         |
| src/adapters/tauri-adapter.ts         | Tauri invoke and listen wrappers                        |
| src/resolvers/contract-validator.ts   | Contract structure validation                           |
| src/resolvers/procedure-resolver.ts   | Extract metadata from contract paths                    |
| src/streaming/event-stream.ts         | SSE event streaming handler                             |
| src/streaming/channel-stream.ts       | Tauri channel streaming handler                         |
| src/streaming/event-name-strategy.ts  | Generate unique event names per stream                  |
| src/errors/error-handler.ts           | Map Tauri errors to ORPCError                           |
| src/metadata.ts                       | Tauri metadata builder (tauri.command, tauri.transport) |

## Conventions

- Link reads contract metadata to determine command name, streaming mode, transport type
- Unary calls: direct `tauri.invoke(commandName, {input})` via TauriAdapter
- Event streaming: unlisten previous, listen for data/done/error events, yield AsyncIterator
- Channel streaming: pass `Channel<T>` as function parameter, backend pushes to it
- Event names must be unique per stream instance (collision causes cross-talk)
- Transport config validated at construction time, not runtime
- Logger injected via options, defaults to ConsoleLogger
- Debug mode controlled per procedure via contract metadata

## Gotchas

- Event streaming requires unlisten cleanup for previous stream with same event names
- Channel streaming needs no cleanup, Tauri handles channel lifecycle
- Stream transport metadata must include id (for channel) or id+events (for SSE)
- Contract validation runs at link construction, throws if structure invalid
- Rust command names are snake_case, contract metadata stores them verbatim
- AbortSignal checked before invoke, not passed to Tauri (Tauri has no cancellation API)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
