<div align="center">

# @sabryio/orpc-tauri

**Type-safe RPC bridge between TypeScript and Rust for Tauri applications**

[![JSR](https://jsr.io/badges/@sabryio/orpc-tauri)](https://jsr.io/@sabryio/orpc-tauri)
[![JSR Score](https://jsr.io/badges/@sabryio/orpc-tauri/score)](https://jsr.io/@sabryio/orpc-tauri)

[Features](#features) • [Quick Start](#quick-start) • [Streaming](#streaming) • [API Reference](#api-reference) • [Examples](#examples)

</div>

---

## Overview

`@sabryio/orpc-tauri` seamlessly connects your TypeScript frontend to your Rust backend with full end-to-end type safety. Define your API once in TypeScript, and get compile-time guarantees across the IPC boundary.

### Why orpc-tauri?

- **Zero Runtime Overhead**: Direct Tauri IPC integration without middleware
- **Contract-First Design**: Single source of truth for frontend and backend APIs
- **Streaming Built-In**: First-class support for real-time data with two transport modes
- **Effect-Powered**: Rock-solid resource management with automatic cleanup
- **Developer Experience**: IntelliSense, type inference, and helpful error messages

## Features

| Feature                   | Description                                           |
| ------------------------- | ----------------------------------------------------- |
| 🔗 **oRPC Integration**   | Seamless integration with oRPC contracts              |
| 📡 **Dual Streaming**     | Event-based (SSE-style) and Channel API streaming     |
| 🎯 **Type-Safe**          | Full TypeScript support with inferred types           |
| 🏗️ **Clean Architecture** | SOLID principles with Effect TypeScript internals     |
| 🔍 **Metadata-Driven**    | Configure transport behavior via contract metadata    |
| ⚡ **Resource Safe**      | Automatic cleanup and memory management               |
| ✅ **Rust Resources**     | Resource-backed streams with server-side cancellation |

## Installation

```bash
# Using JSR (recommended)
npx jsr add @sabryio/orpc-tauri

# Or with Deno
deno add jsr:@sabryio/orpc-tauri

# Or with Bun
bunx jsr add @sabryio/orpc-tauri
```

## Quick Start

Build your first type-safe Tauri RPC application in minutes.

### Step 1: Create Your Project

```bash
npm create tauri-app@latest my-app
cd my-app
```

Install the required dependencies:

```bash
npx jsr add @sabryio/orpc-tauri
npm install @orpc/contract@beta @orpc/client@beta @orpc/tanstack-query@beta zod
```

### Step 2: Define the Contract

Create a contract that describes your API. This is your single source of truth.

**`src/rpc/contract.ts`**

```typescript
import { z } from "zod";
import { oc } from "@orpc/contract";

// 1. Define your data shapes with Zod
const PingResponseSchema = z.object({
  id: z.string().uuid(),
  message: z.string(),
});

// 2. Build your contract
export const contract = {
  ping: {
    // The route key IS the Rust command name — no metadata needed!
    ping: oc
      .input(z.void()) // No input required
      .output(PingResponseSchema), // Typed response
  },
} as const;

export type Contract = typeof contract;
```

### Step 3: Implement Rust Backend

Your Rust implementation must match the contract signature exactly.

**`src-tauri/src/lib.rs`**

```rust
use serde::Serialize;
use uuid::Uuid;

#[derive(Serialize)]
pub struct PingResponse {
    id: Uuid,
    message: String,
}

#[tauri::command]
pub async fn ping() -> Result<PingResponse, String> {
    Ok(PingResponse {
        id: Uuid::new_v4(),
        message: "pong".to_string(),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![ping])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**`src-tauri/Cargo.toml`**

```toml
[dependencies]
tauri = { version = "2", features = [] }
serde = { version = "1", features = ["derive"] }
uuid = { version = "1", features = ["v4", "serde"] }
```

### Step 4: Create the Client

Wire up your contract with TauriLink to create a type-safe client.

**`src/rpc/index.ts`**

```typescript
import { createORPCClient, isDefinedError, ORPCError } from "@orpc/client";
import { TauriLink } from "@sabryio/orpc-tauri/link";
import { contract, type Contract } from "./contract";

// Export helpers for streaming and errors
export { consumeAsyncIterator, getEventMeta } from "@orpc/client";
export { isDefinedError, ORPCError };

// Create the link
const link = new TauriLink(contract);

// Export type-safe client
export const client = createORPCClient(link);
```

### Step 5: Use in Your Components

Enjoy full type safety and IntelliSense in your React components.

**`src/App.tsx`**

```typescript
import { useState } from "react";
import { client } from "./rpc";

function App() {
  const [response, setResponse] = useState<string>("");

  const handlePing = async () => {
    try {
      // Pass undefined for z.void() input
      const result = await client.ping.ping(undefined);

      // TypeScript knows the exact shape of 'result'
      setResponse(`ID: ${result.id}\nMessage: ${result.message}`);
    } catch (error) {
      console.error("RPC failed:", error);
    }
  };

  return (
    <div>
      <button onClick={handlePing}>Ping Backend</button>
      <pre>{response}</pre>
    </div>
  );
}

export default App;
```

**That's it!** Run your app and watch type-safe RPC in action:

```bash
npm run tauri dev
```

---

## Streaming

Real-time data streaming with full type safety. Choose between two transport modes based on your use case.

### Event-Based Streaming

Perfect for broadcasting updates to multiple listeners. Uses Tauri's event system under the hood.

#### When to Use

- Broadcasting state changes to multiple components
- Server-sent events style updates
- Pub/sub patterns
- System-wide notifications

#### Contract Definition

**`src/rpc/contract.ts`**

```typescript
import { asyncIteratorObject } from "@orpc/contract";
import { tauri } from "@sabryio/orpc-tauri/meta";

const EventSchema = z.object({
  type: z.literal("stream"),
  data: z.object({
    message: z.string(),
    count: z.number().int(),
  }),
});

// Route keys are the Rust command names (snake_case, verbatim).
// `stream_events` maps to the Rust command `stream_events` automatically.
export const contract = {
  stream: {
    stream_events: oc
      .meta(tauri.listen()) // Event-based streaming — link handles event names
      .input(z.void())
      .output(asyncIteratorObject(EventSchema)),
  },
};
```

#### Rust Implementation

**`src-tauri/src/commands/stream.rs`**

```rust
use tauri::{AppHandle, Emitter};
use serde::Serialize;
use std::time::Duration;

// Event names (must match tauri-link expectations)
mod event_names {
    pub const DATA: &str = "data";
    pub const DONE: &str = "done";
    pub const ERROR: &str = "error";
}

// SSE Event structure with metadata
#[derive(Serialize, Clone, Default)]
pub struct Event {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

// Your app event type (discriminated union)
#[derive(Serialize, Clone)]
#[serde(tag = "type", content = "data")]
pub enum AppEvent {
    #[serde(rename = "stream")]
    Stream { message: String, count: i32 },
}

#[tauri::command]
pub async fn stream_events(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn(async move {
        // Step 1: Send flush event to establish connection (Axum-style)
        let flush = Event {
            comment: Some("flush".to_string()),
            ..Default::default()
        };
        let _ = app.emit(event_names::DATA, &flush);

        // Small delay to ensure frontend is ready
        tokio::time::sleep(Duration::from_millis(100)).await;

        // Step 2: Stream data events
        for i in 1..=5 {
            let app_event = AppEvent::Stream {
                message: format!("Event {}", i),
                count: i,
            };

            let sse_event = Event {
                event: Some("message".to_string()),
                id: Some(i.to_string()),
                retry: Some(5000), // 5 seconds
                data: serde_json::to_value(app_event).ok(),
                ..Default::default()
            };

            let _ = app.emit(event_names::DATA, &sse_event);
            tokio::time::sleep(Duration::from_millis(500)).await;
        }

        // Step 3: Signal completion
        let _ = app.emit(event_names::DONE, ());
    });

    Ok(())
}
```

#### Frontend Usage Patterns

**Pattern 1: Custom Hook (Recommended)**

```typescript
// hooks/use-stream-events.ts
import { useState } from "react";
import { toast } from "sonner";

export function useStreamEvents<T>() {
  const [events, setEvents] = useState<T[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const startStream = async (
    streamFn: () => Promise<AsyncIterableIterator<T>>,
    successMsg: string,
  ) => {
    setIsStreaming(true);
    setEvents([]);

    try {
      const iterator = await streamFn();

      for await (const event of iterator) {
        setEvents((prev) => [...prev, event]);
      }

      toast.success(successMsg);
    } catch (error) {
      toast.error("Stream failed");
    } finally {
      setIsStreaming(false);
    }
  };

  return { events, isStreaming, startStream };
}

// In your component
import { useStreamEvents } from "./hooks/use-stream-events";
import { client } from "./rpc";

function StreamComponent() {
  const stream = useStreamEvents();

  const handleStart = () => {
    stream.startStream(
      () => client.stream.streamEvents(undefined, {
        signal: new AbortController().signal,  // For cancellation
      }),
      "Stream completed!",
    );
  };

  return (
    <div>
      <button onClick={handleStart} disabled={stream.isStreaming}>
        {stream.isStreaming ? "Streaming..." : "Start Stream"}
      </button>

      {stream.events.map((event, i) => (
        <div key={i}>{event.data.message}</div>
      ))}
    </div>
  );
}
```

**Pattern 2: Direct Async Iterator with Helper**

```typescript
import { consumeAsyncIterator } from "@orpc/client";
import { client } from "./rpc";

function DirectStreamComponent() {
  const [events, setEvents] = useState([]);
  const cancelRef = useRef<(() => void) | null>(null);

  const handleStart = () => {
    const cancel = consumeAsyncIterator(
      client.stream.streamEvents(undefined),
      {
        onEvent: (event) => {
          setEvents(prev => [...prev, event]);
        },
        onError: (err) => {
          console.error("Stream error:", err);
        },
        onSuccess: () => {
          console.log("Stream completed");
        },
        onFinish: () => {
          cancelRef.current = null;
        },
      }
    );

    cancelRef.current = cancel;
  };

  const handleCancel = () => {
    cancelRef.current?.();
  };

  return (
    <div>
      <button onClick={handleStart}>Start</button>
      <button onClick={handleCancel}>Cancel</button>
    </div>
  );
}
```

**Pattern 3: TanStack Query Integration**

```typescript
import { useQuery } from "@tanstack/react-query";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { client } from "./rpc";

// Create query utils
const orpc = createTanstackQueryUtils(client);

function QueryStreamComponent() {
  // Accumulates ALL events into array
  const streamedQuery = useQuery(
    orpc.stream.streamEvents.streamedOptions({
      retry: false,
      enabled: false,  // Manual trigger
      gcTime: 0,
    }),
  );

  return (
    <div>
      <button
        onClick={() => streamedQuery.refetch()}
        disabled={streamedQuery.isFetching}
      >
        Start Stream
      </button>

      {streamedQuery.data?.map((event, i) => (
        <div key={i}>{event.data.message}</div>
      ))}
    </div>
  );
}
```

### Cancellation (`signal`)

Pass `signal` in the call options. Scope depends on the call kind:

- **Unary** — the signal is checked before the command runs; pre-aborted requests fail fast without invoking.
- **Streams** — checked before invoke **and wired mid-stream**: aborting tears the stream down immediately (interrupted in-progress pull, listener unlistened, channel dropped), and the pending `next()` rejects with `ORPCError("CLIENT_CLOSED_REQUEST")`. Subsequent pulls see a closed iterator (`done`), never a hang.

```typescript
const controller = new AbortController();

const iterator = await client.file.download_file(
  { input: { total_bytes: 262_144 } },
  { signal: controller.signal },
);

for await (const chunk of iterator) {
  // ...
}
```

Notes:

- **The Rust command is unaffected** — Tauri has no cancellation API honoured by Rust commands, so a cancelled command runs to completion; only consumption stops. On teardown the link stops delivering envelopes instantly (no-op `onmessage` — no leak into the consumer) but never unregisters the channel's IPC callback itself: Tauri sends `{end: true}` when the backend's last Channel clone drops (natural completion, or a cancelled task stopping via `tauri.resource()`), and the JS Channel unregisters itself in order — zero `Couldn't find callback id` warnings. A grace timer (10 s) unregisters only if a hung backend never sends `{end}`. Long-running commands can check `on_event.closed()` themselves if they want to short-circuit production.
- `tauri.timeout` and `signal` compose: whichever fires first wins (inactivity timeout → `"TIMEOUT"`, abort → `"CLIENT_CLOSED_REQUEST"`).
- React: wire the component's `AbortController` to `useEffect` cleanup or a Cancel button.

### Channel-Based Streaming

Optimized for point-to-point streaming with lower overhead. Uses Tauri's native Channel API.

#### When to Use

- High-frequency updates to a single consumer
- Binary data streaming
- File uploads/downloads with progress
- Direct frontend-backend pipes

#### Contract Definition

**`src/rpc/contract.ts`**

```typescript
export const contract = {
  stream: {
    // Route key `stream_events_channel` maps to the Rust command
    // `stream_events_channel` automatically. Metadata only configures
    // the transport.
    stream_events_channel: oc
      .meta(tauri.channel()) // Defaults to "onEvent" (Rust param `on_event`)
      .input(z.void())
      .output(asyncIteratorObject(EventSchema)),

    // Custom Rust parameter name — write it exactly as it appears in Rust
    stream_events_custom: oc
      .meta(tauri.channel("custom_param")) // Rust param `custom_param`
      .input(z.void())
      .output(asyncIteratorObject(EventSchema)),
  },
};
```

#### Rust Implementation

**`src-tauri/src/commands/channel_stream.rs`**

```rust
use tauri::ipc::Channel;
use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct StreamEventData {
    message: String,
    count: i32,
}

#[derive(Serialize, Clone)]
pub struct StreamEvent {
    r#type: String,
    data: StreamEventData,
}

#[tauri::command]
pub async fn stream_events_channel(on_event: Channel<StreamEvent>) -> Result<(), String> {
    tauri::async_runtime::spawn(async move {
        for i in 1..=5 {
            let event = StreamEvent {
                r#type: "stream".to_string(),
                data: StreamEventData {
                    message: format!("Channel event {}", i),
                    count: i,
                },
            };

            let _ = on_event.send(event);
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }
    });

    Ok(())
}
```

#### Frontend Usage

Channel streaming uses the exact same consumption patterns as event-based streaming:

```typescript
// Same hook pattern
const channelStream = useStreamEvents();

channelStream.startStream(
  () =>
    client.stream.streamEventsChannel(undefined, {
      signal: new AbortController().signal,
    }),
  "Channel stream completed!",
);

// Same direct iterator pattern
consumeAsyncIterator(client.stream.streamEventsChannel(undefined), {
  onEvent: (event) => console.log(event),
});

// Same TanStack Query pattern
const query = useQuery(
  orpc.stream.streamEventsChannel.streamedOptions({
    retry: false,
    enabled: false,
  }),
);
```

### SSE Metadata

Event-based streams can carry SSE metadata (event ID, retry timeout):

```typescript
import { getEventMeta } from "@orpc/client";

for await (const event of await client.stream.streamEvents(undefined)) {
  const meta = getEventMeta(event);

  console.log("Event:", event);
  console.log("ID:", meta?.id); // Event ID
  console.log("Retry:", meta?.retry); // Retry timeout in ms
}
```

### Transfer Progress (Both Streaming Transports)

Streams can report transfer progress through **data-less control envelopes** — the SSE envelope's `comment` field carries `progress:<bytesRead>/<totalBytes>`, on **both** the channel transport and the listen/SSE transport. These never enter the consumer's payload schema, so your output type stays pure.

**Rust side** — use the built-in builder and throttle (one tick per N chunks is plenty):

```rust
// broadcast.rs
Event::default().progress(bytes_read, total_bytes); // → comment: "progress:65536/262144"

// In your command: send a chunk, then a progress envelope
on_event.send(Event::default().event("message").id("3").data(chunk))?;
on_event.send(Event::default().progress(bytes_read, total))?;
// Finish with the done event (ends the consumer's stream)
on_event.send(Event::default().event("done"))?;
```

**TypeScript side** — pass the typed `onProgress` call option. To get `onProgress` typed on every call-site, add the ambient augmentation once (see [Transfer Progress Setup](#transfer-progress-setup) below):

```typescript
import type { ProgressInfo } from "@sabryio/orpc-tauri/link";

const iterator = await client.file.download_file(
  { input: { path: "/data/model.bin" } },
  {
    onProgress: (info: ProgressInfo) => {
      console.log(`${info.percentage}%`); // 0-100, when total is known
      console.log(info.bytesTransferred); // cumulative
      console.log(info.totalBytes); // optional
    },
  },
);

for await (const chunk of iterator) {
  // chunk — only ever payload; progress is never yielded into the stream
  await write(chunk);
}
```

Guarantees:

- Progress envelopes are **swallowed** by the link — they never appear in the async iterator and never touch your Zod schemas
- Malformed `progress:` comments are ignored silently — control signals can never break a data stream
- `getEventMeta()` on data envelopes is unchanged
- Transport parity: `onProgress` fires for channel streams **and** listen-mode (SSE events) streams; without the option, envelopes are swallowed with zero parsing
- Custom convention per procedure: `tauri.channel("on_event", { prefix: "pct:" })` or `tauri.listen({ parser })`

#### Transfer Progress Setup

`onProgress` is typed via an ambient augmentation of `@orpc/client`. The `./augment` subpath is available for **npm installs** only — JSR prohibits packages from including module augmentation files.

**npm — triple-slash reference in a `.d.ts` file (recommended)**

Create `src/globals.d.ts` (or any `.d.ts` TypeScript picks up):

```ts
/// <reference types="@sabryio/orpc-tauri/augment" />
```

**npm — side-effect import**

```ts
import "@sabryio/orpc-tauri/augment";
```

**JSR / Deno — add one `declare module` block to your project**

```ts
// e.g. src/globals.d.ts
import type { ProgressInfo } from "@sabryio/orpc-tauri/link";

declare module "@orpc/client" {
  interface ClientOptions<T> {
    onProgress?: (info: ProgressInfo) => void;
  }
}
```

Either approach makes `onProgress` available at every `client.*` call-site without extra boilerplate.

### Request Context (`TauriLink<TContext>`)

Request-scoped client metadata — the IPC analog of HTTP headers. oRPC clients forward a `context` object to their link; TauriLink makes it real by merging link-level defaults with per-call overrides and injecting the result into the invoke args under the reserved `context` key.

```typescript
// Typed exactly like OpenAPILink<ClientContext>:
interface ClientContext {
  token?: string;
  xRequestId?: string;
}

const link = new TauriLink<ClientContext>(contract, {
  // Link-level defaults: static object, or a factory re-evaluated per call
  context: () => ({ xRequestId: crypto.randomUUID() }),
});
export const client: RouterContractClient<Contract, ClientContext> =
  createORPCClient(link);

// Per-call override — merged shallowly, per-call wins:
await client.ping(undefined, { context: { token: "fresh-token" } });
```

**Rust side** — commands opt in by declaring a `context` parameter; commands that don't are completely untouched, and the contract's Zod schemas are unaffected (it rides next to `streamId`, outside the validated `input` envelope):

```rust
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct CallCtx {
    pub token: Option<String>,
    pub x_request_id: Option<String>, // ← xRequestId
}

#[tauri::command]
pub async fn ping(context: Option<CallCtx>) -> Result<PingResponse, AppError> {
    if let Some(ctx) = &context {
        log::info!("ping (x_request_id={:?})", ctx.x_request_id); // correlated logs
    }
    // ...
}
```

More guardrails: custom `invoke` implementations see the resolved context as part of `args` — there is no separate parameter (the reserved key is the single delivery path). When neither side provides a context, args are left completely untouched (`ping` still sends no args object).

### Resource-Backed Streams (`tauri.resource`)

Long-running stream commands can register a handle in **Tauri's resource table** and announce it as a data-less control envelope — `comment: "handle:<rid>"` (Rust builder: `Event::default().handle(rid)`). The link swallows it and, with the default `autoClose`, **closes the resource when the stream exits abnormally** — consumer abort, failure, or early exit. Closing runs Rust's `Resource::close`, which is your one-line server-side cancellation hook.

**Rust side** — a `#[tauri::command]` with `use tauri::{AppHandle, Manager, Resource, ResourceId}`:

```rust
pub struct TransferHandle { token: Arc<AtomicBool> }

impl Resource for TransferHandle {
    fn name(&self) -> Cow<'_, str> { "TransferHandle".into() }
    // Runs the moment the rid is closed — from the link's autoClose teardown,
    // link.resource.close(handle), or Rust's resources_table().close(rid).
    fn close(self: Arc<Self>) { self.token.store(true, Ordering::Release); }
}

#[tauri::command]
pub async fn resource_file_download(
    input: DownloadInput,
    app: AppHandle,
    on_event: Channel<Event>,
) -> Result<usize, AppError> {
    let token = Arc::new(AtomicBool::new(false));
    let rid = app.resources_table().add(TransferHandle { token: token.clone() });

    on_event.send(Event::default().comment("flush"))?;         // establish connection
    on_event.send(Event::default().handle(rid))?;              // handle:<rid>, exactly once
    tauri::async_runtime::spawn(async move {
        while sent < total && !token.load(Ordering::Acquire) { /* chunk + progress */ }
        if token.load(Ordering::Acquire) { return; }            // cancelled: no `done`
        let _ = app.resources_table().close(rid);               // completion: drop own rid
        let _ = on_event.send(Event::default().event("done"));
    });
    Ok(total)
}
```

**TypeScript side** — mark the procedure and work with the typed handle:

```typescript
import { asResourceHandle, type RustResourceHandle } from "@sabryio/orpc-tauri/link";

resource_file_download: oc
  .meta(tauri.channel("on_event"), tauri.resource())
  .input(/* input */)
  .output(asyncIteratorObject(ChunkSchema)),

// The wire format is a plain { rid: number }; the brand is compile-time only.
const handle = asResourceHandle(rid as number); // widen a raw payload when needed

// Manual close (the facade mirrors `@tauri-apps/api/core` Resource.close,
// inside the same Effect pipeline):
await link.resource.close(handle);
```

Lifecycle guarantees:

- The `handle:<rid>` envelope is announced exactly once (by the producer); the link keeps the **first** announcement and swallows malformed or duplicate ones
- **Auto-close fires on abnormal exits only**: consumer abort (`signal`), stream failure, or early consumer exit (`.return()` / `break`); a **normal completion never auto-closes** — the Rust side owns its lifecycle (the worker removes its own resource via `resources_table().close(rid)`)
- `tauri.resource({ autoClose: false })` makes the resource fully manual
- **`tauri.resource()` is optional for detection** — the `handle:<rid>` envelope alone enables auto-close (envelope-driven, see the source-driven tests in `channel-stream.test.ts`); the meta's role is the `autoClose: false` opt-out and contract documentation
- Auto-close is **best-effort, never silent**: close failures don't mask the stream's own exit cause, but they ARE logged loudly (`Failed to close Rust resource rid=N … Cause: …`) — a failed close leaves the Rust task running
- `link.resource.close()` **rejects** on failure (ORPCError at the boundary) — a failed "close" is never a silent success
- Works in both transports (channel and listen); the close invoke uses the `plugin:resources|close` IPC, which requires the **`core:resources:allow-close`** capability — grant it explicitly in `src-tauri/capabilities/*.json` (`"core:default"` alone has been observed _not_ to include it: the invoke fails with `resources.close not allowed`)
- If the abort lands before the first chunk arrives, no rid has been announced — nothing to close, nothing leaks (the Rust task finishes on its own)
- Unary procedures may carry `tauri.resource()` too — it's a no-op for the link lifecycle (close stays manual via the facade)

---

## Metadata API

Configure RPC behavior through declarative metadata attached to your contract procedures.

### Command Name Auto-Mapping

You don't need to declare the command name — it's derived from the **last segment of the route path, verbatim**:

```typescript
// Route key `delete_planet` → invokes Rust command `delete_planet`
delete_planet: oc
  .input(z.object({ input: z.object({ id: z.number().int() }) }))
  .output(z.void()),
```

Write the route key exactly as the `#[tauri::command]` function name (snake_case). No case conversion happens — the key and the Rust command name are the same string.

Override only when the command name differs from the route key:

```typescript
// Route `planet.remove` → invokes `destroy_planet` instead
remove: oc.meta(tauri.command("destroy_planet")).input(z.void()).output(z.void()),
```

Duplicate command names (whether derived or explicit) are detected at contract-construction time and throw a descriptive validation error.

### Streaming Helpers

```typescript
// Event-based streaming (SSE-style) — the frontend listens to Tauri events
tauri.listen();

// Channel-based streaming (direct pipe)
// Omit id to use the default "onEvent" parameter name
tauri.channel();

// Or specify the custom Rust parameter name — snake_case or camelCase,
// both work (normalized internally, since Tauri IPC keys args in camelCase)
tauri.channel("custom_param"); // sends over IPC as `customParam`

// Rust-resource-backed streaming (see "Resource-Backed Streams" above):
// the command announces handle:<rid>; autoClose closes it on abnormal exit
tauri.resource();
tauri.resource({ autoClose: false }); // fully manual resource lifecycle
```

### Transport (raw config)

For full control, use the transport object directly:

```typescript
oc.meta(
  tauri.transport({
    kind: "listen",
  }),
);

oc.meta(
  tauri.transport({
    kind: "channel",
    id: "custom_param", // Rust param name — normalized to camelCase for IPC
  }),
);
```

### Additional Options

```typescript
interface TauriMeta {
  command?: string; // Override command name (optional — derived from route key when omitted)
  transport?: TauriTransportConfig; // Streaming transport config
  timeout?: number; // Client-side deadline in milliseconds (see below)
  debug?: boolean; // Enable debug logging
}

// Scoped helpers
oc.meta(tauri.timeout(10000));
oc.meta(tauri.debug(true));

// Or one object with everything
oc.meta(
  tauri({
    command: "fetch_planets", // Optional override
    timeout: 10000,
    debug: true,
  }),
);
```

### Timeout (`tauri.timeout`)

`tauri.timeout(ms)` applies a **client-side deadline** enforced by the link — the Rust command is unaffected:

- **Unary calls** — the whole call must complete within the window; otherwise the call rejects with `ORPCError("TIMEOUT")` (message: `"command_name timed out after Nms"`).
- **Streams** — an **inactivity deadline**: the iterator fails when no value arrives within the window. A slow-but-steady stream is never cut; a stalled one fails after the window with an error tagged `TimeoutError` (exported from the package).

```typescript
oc.meta(tauri.channel("on_event")).meta(tauri.timeout(30000));
```

### Metadata Merging

Fields across multiple `.meta()` calls are merged (`??` semantics — the latest non-undefined value wins). The `command` name can only be set once; changing it throws.

---

## Error Handling

Rust errors are automatically converted to structured `ORPCError` objects with full type information.

### Basic Error Handling

The boundary is uniform: **unary calls and stream iteration both reject with `ORPCError`** — Rust command errors, `tauri.timeout` budget breaches (`TIMEOUT` code), and unknown failures are all mapped through the same converter.

```typescript
import { ORPCError, isDefinedError } from "@orpc/client";
import { client } from "./rpc";

try {
  const planet = await client.planet.find_planet({
    input: { id: 999 },
  });
} catch (error) {
  if (error instanceof ORPCError) {
    console.error(`Error [${error.code}]: ${error.message}`);

    // Access additional error data
    if (error.data) {
      console.error("Details:", error.data);
    }
  }
}

// Streams reject the same way
try {
  for await (const chunk of await client.file.download_file({
    input: { total_bytes: 1024 },
  })) {
    // ...
  }
} catch (error) {
  if (error instanceof ORPCError && error.code === "TIMEOUT") {
    console.error("Stalled or too slow:", error.data);
  }
}
```

### Typed Error Contracts

Define expected errors in your contract for type-safe error handling:

```typescript
const StandardApiErrors = {
  NOT_FOUND: {},
  VALIDATION_ERROR: {
    data: z.object({
      field: z.string(),
      reason: z.string(),
    }),
  },
  INTERNAL: {
    data: z.object({
      msg: z.string(),
    }),
  },
} as const;

export const contract = {
  planet: {
    find_planet: oc
      .input(z.object({ input: z.object({ id: z.number().int() }) }))
      .output(PlanetSchema)
      .errors(StandardApiErrors), // Attach error definitions
  },
};
```

Now TypeScript knows about your error shapes:

```typescript
try {
  const planet = await client.planet.find_planet({ input: { id: 999 } });
} catch (error) {
  if (error instanceof ORPCError) {
    if (isDefinedError(error)) {
      // TypeScript knows this is a contract-defined error
      switch (error.code) {
        case "NOT_FOUND":
          showToast("Planet not found");
          break;
        case "VALIDATION_ERROR":
          // error.data is typed as { field: string, reason: string }
          console.error(`Invalid ${error.data.field}: ${error.data.reason}`);
          break;
      }
    }
  }
}
```

---

## API Reference

### Module Exports

```typescript
// Metadata builder
import { tauri } from "@sabryio/orpc-tauri/meta";

// Link implementation
import { TauriLink, ConsoleLogger, NoopLogger } from "@sabryio/orpc-tauri/link";
import type { ProgressInfo } from "@sabryio/orpc-tauri/link";
import { PROGRESS_PREFIX } from "@sabryio/orpc-tauri/link";

// Rust resources (Tauri Resource protocol)
import {
  asResourceHandle,
  HANDLE_PREFIX,
  parseHandleEnvelope,
} from "@sabryio/orpc-tauri/link";
import type { RustResourceHandle } from "@sabryio/orpc-tauri/link";
// link.resource.close(handle) — the facade on TauriLink (see above)

// Ambient augmentation — adds typed `onProgress` to every call-site (npm only)
// Triple-slash in a .d.ts:  /// <reference types="@sabryio/orpc-tauri/augment" />
// Side-effect import:       import "@sabryio/orpc-tauri/augment";
// JSR/Deno: add a declare module block manually (see Transfer Progress Setup)

// Types
import type { TauriLinkOptions, SimpleLogger } from "@sabryio/orpc-tauri/link";
```

### TauriLink Constructor

```typescript
class TauriLink {
  constructor(contract: Contract, options?: TauriLinkOptions);
}

interface TauriLinkOptions {
  logger?: SimpleLogger; // Default: ConsoleLogger
  invoke?: InvokeFn; // Custom invoke function
  eventNameStrategy?: EventNameStrategy; // Custom event naming
}

type InvokeFn = <T = unknown>(
  command: string,
  args?: Record<string, unknown>,
) => Promise<T>;
```

**Example with custom logger:**

```typescript
import { TauriLink, NoopLogger } from "@sabryio/orpc-tauri/link";

// Disable logging in production
const link = new TauriLink(contract, {
  logger: new NoopLogger(),
});
```

**Example with custom invoke (for middleware/testing):**

```typescript
import { TauriLink } from "@sabryio/orpc-tauri/link";
import { invoke } from "@tauri-apps/api/core";

// Add custom middleware (auth, logging, etc.)
const link = new TauriLink(contract, {
  invoke: async <T = unknown>(
    command: string,
    args?: Record<string, unknown>,
  ): Promise<T> => {
    console.log(`[Invoke] ${command}`, args);

    try {
      const result = await invoke<T>(command, args);
      console.log(`[Result] ${command}`, result);
      return result;
    } catch (error) {
      console.error(`[Error] ${command}`, error);
      throw error;
    }
  },
});
```

**Mocking for tests:**

```typescript
const link = new TauriLink(contract, {
  invoke: async <T = unknown>(
    command: string,
    args?: Record<string, unknown>,
  ): Promise<T> => {
    // Return mock data - no need to mock Tauri API
    return { id: 1, name: "Test User" } as T;
  },
});
```

### Logger Interface

Implement custom loggers for debugging or monitoring:

```typescript
interface SimpleLogger {
  log(message: string, data?: unknown): void;
  error(message: string, error?: unknown): void;
}

// Custom logger example
class MyLogger implements SimpleLogger {
  log(msg: string, data?: unknown) {
    // Send to your monitoring service
    console.log(msg, data);
  }

  error(msg: string, error?: unknown) {
    // Send errors to tracking service
    console.error(msg, error);
  }
}

const link = new TauriLink(contract, {
  logger: new MyLogger(),
});
```

---

## Implementation Details

### Architecture

- **Effect TypeScript Core**: Leverages Effect for resource-safe streaming and typed error channels
- **Promise-Based API**: Clean public interface with no Effect exposure to end users
- **Automatic Cleanup**: Resources (event listeners, channels) are automatically disposed via `Effect.Scope`
- **Service Injection**: Testable architecture with dependency injection for Tauri APIs

### Type Safety Guarantees

1. **Contract Validation**: Structure validated at link construction time
2. **Input/Output Types**: Zod schemas ensure runtime validation matches compile-time types
3. **Error Types**: Internal typed errors converted to ORPCError at API boundary
4. **Stream Types**: AsyncIterator types flow through with full inference

### Performance

- **Zero-Copy Streaming**: Direct Tauri IPC, no intermediate serialization
- **Bounded Queues**: Prevents memory leaks under backpressure
- **Lazy Initialization**: Resources allocated only when needed

---

## Examples

Explore a complete working implementation with all features:

- 🔹 [Full Application](https://github.com/sabryio/orpc-tauri/tree/main/apps/web) - Complete Tauri app with RPC
- 🔹 Unary RPC calls (CRUD operations)
- 🔹 Event-based streaming
- 🔹 Channel-based streaming
- 🔹 Error handling
- 🔹 TanStack Query integration
- 🔹 Multiple consumption patterns (hooks, direct iterators, queries)

---

## License

MIT © [Sabry Awad](https://github.com/sabryio)
