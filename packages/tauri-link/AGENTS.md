# Tauri Link

## Overview

Custom oRPC link implementation that bridges oRPC contracts to Tauri IPC. Handles unary commands and dual streaming transports (SSE event streaming and Tauri channel streaming). Provides type-safe client for Tauri commands defined in oRPC contracts.

**Implementation:** Effect TypeScript internally for resource safety and typed errors, Promise-based public API for backward compatibility. No breaking changes for users.

## Learning more about Effect

This repository uses Effect TypeScript library internally (v4.0.0-rc.118).

Before writing any Effect code, first read `node_modules/effect/AGENTS.md` **completely**, and follow the links in the file when required.

If you need to learn more about particular Effect APIs and concepts that the guide doesn't cover, search through the source code in `node_modules/effect/src`.

## Architecture

### Public API (Promise-based)
- `src/v2/public-api.ts` - TauriLink class, backward compatible API
- `src/v2/error-converter.ts` - Converts Effect errors to ORPCError at boundary
- Returns `Promise<T>` for unary calls, `AsyncIterableIterator<T>` for streaming

### Effect Internals (v2/)
- `src/v2/link.ts` - EffectTauriLink orchestrator, coordinates services and streaming
- `src/v2/services/` - Injectable Effect services (invoker, listener, channel-factory)
- `src/v2/streaming/` - Effect.Stream implementations for SSE and channel modes
- `src/v2/adapters/` - Stream → AsyncIterator conversion
- `src/v2/errors.ts` - Typed error classes (TauriInvokeError, TauriListenError, StreamError, ValidationError, AbortError)

### Shared Utilities (kept from old implementation)
- `src/resolvers/contract-validator.ts` - Contract structure validation
- `src/resolvers/procedure-resolver.ts` - Extract metadata from contract paths
- `src/streaming/event-name-strategy.ts` - Generate unique event names per stream
- `src/streaming/sse-types.ts` - SSE event types and metadata utilities
- `src/metadata.ts` - Tauri metadata builder (tauri.command, tauri.transport)
- `src/logger.ts` - Logger implementations (ConsoleLogger, NoopLogger)
- `src/types.ts` - Shared type definitions

## Key files

| File                                 | Owns                                                    |
| ------------------------------------ | ------------------------------------------------------- |
| src/v2/public-api.ts                 | Promise facade over Effect implementation               |
| src/v2/link.ts                       | Effect-based orchestrator (EffectTauriLink)             |
| src/v2/services/invoker.ts           | TauriInvoker service (wraps tauri.invoke)               |
| src/v2/services/listener.ts          | TauriListener service (wraps tauri.listen, auto-cleanup)|
| src/v2/services/channel-factory.ts   | TauriChannelFactory service (creates Tauri Channels)    |
| src/v2/streaming/event-stream.ts     | SSE event streaming with Effect.Stream                  |
| src/v2/streaming/channel-stream.ts   | Tauri channel streaming with Effect.Stream              |
| src/v2/adapters/stream-adapter.ts    | Convert Effect.Stream to AsyncIterableIterator          |
| src/v2/errors.ts                     | Typed error classes for internal error handling         |
| src/v2/error-converter.ts            | Convert Effect errors to ORPCError at boundary          |
| src/resolvers/contract-validator.ts  | Contract structure validation                           |
| src/resolvers/procedure-resolver.ts  | Extract metadata from contract paths                    |
| src/streaming/event-name-strategy.ts | Generate unique event names per stream                  |
| src/streaming/sse-types.ts           | SSE event structure and metadata attachment             |
| src/metadata.ts                      | Tauri metadata builder (tauri.command, tauri.transport) |

## Commands

```bash
# Type check
bun run tsc --noEmit

# Run tests
bun run test

# Run tests in watch mode
bun run test --watch
```

## Conventions

- Link reads contract metadata to determine command name, streaming mode, transport type
- Unary calls: `Effect.runPromise()` at boundary converts Effect to Promise
- Event streaming: Effect.Stream with automatic listener cleanup via Scope
- Channel streaming: Effect.Stream with channel messages, no manual cleanup needed
- Event names must be unique per stream instance (collision causes cross-talk)
- Transport config validated at construction time, not runtime
- Logger injected via options, defaults to ConsoleLogger
- Debug mode controlled per procedure via contract metadata
- SSE metadata preserved: `EVENT_META_SYMBOL` attached to data payloads (id, retry, comments)
- Typed errors internally (TauriInvokeError, StreamError, etc.) converted to ORPCError at boundary

## Effect Internals

### Resource Safety
- **Automatic cleanup:** `Effect.Scope` ensures listeners are unregistered on exit/error/interruption
- **No manual tracking:** Old implementation tracked `unlisten` functions manually (leak-prone)
- **Stream lifecycle:** Effect.Stream handles backpressure and termination automatically

### Typed Error Channels
- **Five error types:** TauriInvokeError, TauriListenError, StreamError, ValidationError, AbortError
- **Boundary conversion:** Internal typed errors → ORPCError at public API
- **Preserved 'defined' flag:** Contract-defined errors flow through correctly (`isDefinedError()` works)

### Service Layers (Dependency Injection)
- **TauriInvoker:** Wraps `tauri.invoke()`, returns `Effect<T, TauriInvokeError>`
- **TauriListener:** Wraps `tauri.listen()`, auto-unlisten via Scope
- **TauriChannelFactory:** Wraps `new Channel<T>()`, typed error on creation failure
- **Testing:** Services mocked via `Layer.succeed()` for isolated tests

### Streaming
- **Effect.Stream primitives:** Replace 250 lines of manual queue/callback code with ~75 lines declarative
- **Bounded queue:** Stream adapter prevents OOM under fast producers (old StreamIterator was unbounded)
- **SSE mode:** Listen to data/done/error events, emit via Stream
- **Channel mode:** Create channel, setup onmessage handler, emit via Stream

## Gotchas

- **Effect is internal only:** Public API is Promise-based, Effect never exposed to users
- **Service dependencies:** Effect.Stream requires services provided via `Stream.provide(layer)`
- **Scope cleanup:** Listeners registered in Scope are cleaned up automatically, no manual `unlisten()`
- **Error unwrapping:** Effect errors wrap original Tauri errors in `.cause` property, unwrapped at boundary
- Contract validation runs at link construction, throws if structure invalid
- Rust command names are snake_case, contract metadata stores them verbatim
- AbortSignal checked before invoke, not passed to Tauri (Tauri has no cancellation API)

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
