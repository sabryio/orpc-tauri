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

| Feature                   | Description                                        |
| ------------------------- | -------------------------------------------------- |
| 🔗 **oRPC Integration**   | Seamless integration with oRPC contracts           |
| 📡 **Dual Streaming**     | Event-based (SSE-style) and Channel API streaming  |
| 🎯 **Type-Safe**          | Full TypeScript support with inferred types        |
| 🏗️ **Clean Architecture** | SOLID principles with Effect TypeScript internals  |
| 🔍 **Metadata-Driven**    | Configure transport behavior via contract metadata |
| ⚡ **Resource Safe**      | Automatic cleanup and memory management            |

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
import { tauri } from "@sabryio/orpc-tauri/meta";

// 1. Define your data shapes with Zod
const PingResponseSchema = z.object({
  id: z.string().uuid(),
  message: z.string(),
});

// 2. Build your contract
export const contract = {
  ping: {
    ping: oc
      .meta(tauri.command("ping")) // Maps to Rust command
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

const EventSchema = z.object({
  type: z.literal("stream"),
  data: z.object({
    message: z.string(),
    count: z.number().int(),
  }),
});

export const contract = {
  stream: {
    streamEvents: oc
      .meta(tauri.command("stream_events"))
      .meta(tauri.transport({ kind: "stream" })) // Simple config - link handles event names
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
const EventSchema = z.object({
  type: z.literal("stream"),
  data: z.object({
    message: z.string(),
    count: z.number().int(),
  }),
});

export const contract = {
  stream: {
    // Simple: omit id to use default "onEvent" parameter name
    streamEventsChannel: oc
      .meta(tauri.command("stream_events_channel"))
      .meta(tauri.transport({ kind: "channel" }))  // Defaults to "onEvent"
      .input(z.void())
      .output(asyncIteratorObject(EventSchema)),
      
    // Or specify custom parameter name
    streamEventsCustom: oc
      .meta(tauri.command("stream_events_custom"))
      .meta(
        tauri.transport({
          kind: "channel",
          id: "onEvent", // Custom Rust parameter name
        }),
      )
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

---

## Metadata API

Configure RPC behavior through declarative metadata attached to your contract procedures.

### `tauri.command(name: string)`

Maps a contract procedure to a specific Rust command name.

```typescript
oc.meta(tauri.command("create_planet")); // Invokes: create_planet
```

### `tauri.transport(config: TransportConfig)`

Configures streaming transport mode.

```typescript
// Event-based streaming (SSE-style)
tauri.transport({ kind: "stream" });

// Channel-based streaming (direct pipe)
// Omit id to use default "onEvent" parameter name
tauri.transport({ kind: "channel" });

// Or specify custom parameter name
tauri.transport({
  kind: "channel",
  id: "customChannel", // Parameter name in Rust (defaults to "onEvent" if omitted)
});
```

### Additional Options

```typescript
interface TauriMetadata {
  command?: string;                    // Override command name
  transport?: TauriTransportConfig;    // Streaming transport config
  timeout?: number;                    // Timeout in milliseconds
  debug?: boolean;                     // Enable debug logging
  tags?: string[];                     // Categorization tags
  permissions?: string[];              // Required permissions
}

// Usage
oc.meta(
  tauri({
    command: "fetch_planets",
    timeout: 10000,
    debug: true,
    tags: ["crud", "public"],
    permissions: ["read:planets"],
  }),
);
```

### Metadata Merging

Array fields (`tags`, `permissions`) are concatenated across multiple `.meta()` calls:

```typescript
oc.meta(tauri({ tags: ["streaming"], permissions: ["read:data"] })).meta(
  tauri({ tags: ["realtime"], permissions: ["write:data"] }),
);

// Result:
// tags: ["streaming", "realtime"]
// permissions: ["read:data", "write:data"]
```

---

## Error Handling

Rust errors are automatically converted to structured `ORPCError` objects with full type information.

### Basic Error Handling

```typescript
import { ORPCError, isDefinedError } from "@orpc/client";
import { client } from "./rpc";

try {
  const planet = await client.planet.findPlanet({
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
    findPlanet: oc
      .meta(tauri.command("find_planet"))
      .input(z.object({ id: z.number() }))
      .output(PlanetSchema)
      .errors(StandardApiErrors), // Attach error definitions
  },
};
```

Now TypeScript knows about your error shapes:

```typescript
try {
  const planet = await client.planet.findPlanet({ input: { id: 999 } });
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

// Types
import type { TauriLinkOptions, SimpleLogger } from "@sabryio/orpc-tauri/link";
```

### TauriLink Constructor

```typescript
class TauriLink {
  constructor(contract: Contract, options?: TauriLinkOptions);
}

interface TauriLinkOptions {
  logger?: SimpleLogger;                           // Default: ConsoleLogger
  invoke?: InvokeFn;                               // Custom invoke function
  eventNameStrategy?: EventNameStrategy;           // Custom event naming
}

type InvokeFn = <T = unknown>(
  command: string,
  args?: Record<string, unknown>
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
  invoke: async (command, args) => {
    console.log(`[Invoke] ${command}`, args);
    
    try {
      const result = await invoke(command, args);
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
  invoke: async (command, args) => {
    // Return mock data - no need to mock Tauri API
    return { id: 1, name: "Test User" };
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

- 🔹 [Full Application](../../apps/web) - Complete Tauri app with RPC
- 🔹 Unary RPC calls (CRUD operations)
- 🔹 Event-based streaming
- 🔹 Channel-based streaming
- 🔹 Error handling
- 🔹 TanStack Query integration
- 🔹 Multiple consumption patterns (hooks, direct iterators, queries)

---

## License

MIT © [Sabry Awad](https://github.com/sabryio)
