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
- `src/public-api.ts` - TauriLink class, backward compatible API
- `src/error-converter.ts` - Converts Effect errors to ORPCError at boundary
- Returns `Promise<T>` for unary calls, `AsyncIterableIterator<T>` for streaming

### Effect Internals
- `src/link.ts` - EffectTauriLink orchestrator, coordinates services and streaming
- `src/services/` - Injectable Effect services (invoker, listener, channel-factory)
- `src/streaming/` - Effect.Stream implementations (event-stream, channel-stream, stream-adapter, utilities)
- `src/errors.ts` - Typed error classes (TauriInvokeError, TauriListenError, StreamError, ValidationError, AbortError)

### Shared Utilities
- `src/resolvers/contract-validator.ts` - Contract structure validation
- `src/resolvers/procedure-resolver.ts` - Extract metadata from contract paths
- `src/metadata.ts` - Tauri metadata builder (tauri.command, tauri.listen, tauri.channel, tauri.transport)
- `src/logger.ts` - Logger implementations (ConsoleLogger, NoopLogger)
- `src/types.ts` - Shared type definitions

## Key files

| File                              | Owns                                                    |
| --------------------------------- | ------------------------------------------------------- |
| src/public-api.ts                 | Promise facade over Effect implementation               |
| src/link.ts                       | Effect-based orchestrator (EffectTauriLink)             |
| src/services/invoker.ts           | TauriInvoker service (wraps tauri.invoke)               |
| src/services/listener.ts          | TauriListener service (wraps tauri.listen, auto-cleanup)|
| src/services/channel-factory.ts   | TauriChannelFactory service (creates Tauri Channels)    |
| src/streaming/event-stream.ts     | SSE event streaming with Effect.Stream                  |
| src/streaming/channel-stream.ts   | Tauri channel streaming with Effect.Stream              |
| src/streaming/stream-adapter.ts   | Convert Effect.Stream to AsyncIterableIterator          |
| src/streaming/event-name-strategy.ts | Generate unique event names per stream               |
| src/streaming/sse-types.ts        | SSE event structure and metadata attachment             |
| src/streaming/progress.ts         | Transfer progress parsing (`progress:` control envelopes) |
| src/errors.ts                     | Typed error classes for internal error handling         |
| src/error-converter.ts            | Convert Effect errors to ORPCError at boundary          |
| src/resolvers/contract-validator.ts  | Contract structure validation                        |
| src/resolvers/procedure-resolver.ts  | Extract metadata from contract paths                 |
| src/metadata.ts                   | Tauri metadata builder (tauri.command, tauri.listen, tauri.channel, tauri.transport) |

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

- Link reads contract metadata to determine streaming mode, transport type, and (optionally) an explicit command override
- Command names are derived from the last route-path segment verbatim (no case conversion) when no explicit `tauri.command(...)` meta exists
- Channel transport ids accept snake_case or camelCase and normalize to camelCase (Tauri IPC keys args in camelCase)
- Streaming calls support transfer progress on BOTH transports (channel and listen/SSE): data-less `progress:<read>/<total>` comment envelopes fire the `onProgress` call option, never yielded as payload; the convention is configured per procedure via `tauri.channel(id, progress)` or `tauri.listen(progress)` (`prefix`/`parser`), and without `onProgress` the envelopes are swallowed with zero parsing
- Request context (IPC analog of HTTP headers): `TauriLink<TContext>` — link-level `TauriLinkOptions.context` (static object or factory re-evaluated per call) merges shallowly with per-call `CallOptions.context` (per-call wins); the resolved value is injected into invoke args under the reserved `context` key — the single delivery path, no separate invoke parameter; when no context exists at all, args stay untouched; Rust commands opt in by declaring `context: Option<CallCtx>` — the contract's Zod schemas are unaffected
- Raw binary payloads over channels: Rust declares `Channel<InvokeResponseBody>` (Tauri's default type) and sends `InvokeResponseBody::Raw(chunk)` — the link yields the decoded message as an `ArrayBuffer` with NO envelope decode, while JSON control envelopes (`flush`/`progress:`/`done`) keep parsing; no metadata (`tauri.binary()` sketch unnecessary — plain channel transport is enough); `Channel<Vec<u8>>` would NOT be raw (`Vec<u8>` is JSON-serialized)
- Streaming returns pass through a single documented boundary cast helper (`asProducer` in public-api.ts) — the link produces only the payload iterator; the oRPC client owns the full `TOutput` shape
- Resource-backed streams (`tauri.resource()` meta): the Rust command announces its task handle once with a data-less `handle:<rid>` comment envelope (`Event::default().handle(rid)` builder) — **detection is envelope-driven, so the meta is OPTIONAL**: any command emitting `handle:<rid>` is auto-closed on abnormal stream exits (consumer abort/failure/early `.return()`), never on normal completion; `tauri.resource()` exists to document intent and for the `autoClose: false` opt-out; the link keeps the first rid; close failures are logged loudly at teardown (cause + capability hint) so a not-cancelled Rust task is never a silent success
- Duplex sessions (`link.duplex(startPath, { send: sendPath }, { signal, startInput })`): rid + channel + unary = WebSockets — the rid is captured from the `handle:<rid>` announcement and auto-injected into every `.send(payload)` (queued until it lands, settled on every terminal state so it can never hang); teardown stays the stream's own (`break`/abort → autoClose), so there is NO separate close command; the paired send proc's input carries `handle: ResourceHandleSchema` (default `handleField: "handle"`); streams honor a custom `invoke` option via the instance's appLayer (same layering as unary)
- `TauriLink.resource.close(handle)` facade mirrors `@tauri-apps/api/core` Resource.close (same `plugin:resources|close` IPC) and REJECTS on failure (ORPCError at the boundary); `RustResourceHandle`/`asResourceHandle` brand is compile-time only
- `plugin:resources|close` needs `core:resources:allow-close` in the app's `src-tauri/capabilities/*.json` — not guaranteed by `core:default` on every Tauri build; missing it is exactly why a close can fail with `resources.close not allowed` (closeResource carries the typed `TauriInvokeError` for this)
- Early consumer exit works because streamToAsyncIterator cancels the ReadableStream (`reader.cancel()`) when the consumer leaves without completion — that interruption drives scope teardown (and resource auto-close)
- Duplicate effective command names (derived or explicit) fail at contract validation time
- `tauri.timeout(ms)` is a client-side deadline: whole-call for unary (`ORPCError("TIMEOUT")` at boundary), inactivity window for streams (typed `TimeoutError` fails the iterator; Rust side unaffected)
- No dead metadata: every `TauriMeta` field is consumed by the link (`tags`/`permissions` were cut — Tauri capabilities belong in `src-tauri/capabilities/*.json`)
- Unary calls: `Effect.runPromise()` at boundary converts Effect to Promise
- Event streaming: Effect.Stream with automatic listener cleanup via Scope
- Channel streaming: Effect.Stream with channel messages, no manual cleanup needed
- Event names must be unique per stream instance (collision causes cross-talk)
- Transport config validated at construction time, not runtime
- Logger injected via options, defaults to ConsoleLogger
- Debug mode controlled per procedure via contract metadata
- SSE metadata preserved: `EVENT_META_SYMBOL` attached to data payloads (id, retry, comments)
- Typed errors internally (TauriInvokeError, StreamError, etc.) converted to ORPCError at boundary
- Streaming boundary: streamToAsyncIterator maps stream failures through toORPCError too, so consumer's for-await rejects with ORPCError (unary and stream errors share the same shape)

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
- Rust command names are snake_case; contract route keys use the same snake_case string exactly, so the command derives from the path with zero metadata
- AbortSignal is checked before invoke, and wired mid-stream via Stream.interruptWhen: aborting a stream tears it down and rejects with ORPCError("CLIENT_CLOSED_REQUEST"); the channel teardown finalizer never unregisters the Tauri IPC callback eagerly — Tauri sends `{end: true}` when the backend's last Channel clone drops (natural completion or a cancelled task stopping), the JS Channel unregisters itself in order, and trailing envelopes are swallowed by a no-op `onmessage`; a grace timer (10 s) unregisters if a hung/leaking backend never sends `{end}`. Unregistering eagerly made Tauri warn `Couldn't find callback id` on every completion and on every cancelled stream's trailing sends. The Rust command itself still runs on abort (Tauri has no automatic server-side cancellation) — `tauri.resource()` adds that

_Drafted by /audit from the repo, worth a quick human pass. Edit freely: once a line stops matching this draft, later runs treat it as curated and will flag rather than overwrite it._
