# @tauri-orpc-contract/tauri-link

Type-safe oRPC link for Tauri applications with support for both event-based and channel-based streaming.

## Features

- 🔗 **oRPC Integration**: Seamless integration with oRPC contracts
- 📡 **Dual Streaming**: Support for both Tauri event-based and Channel API streaming
- 🎯 **Type-Safe**: Full TypeScript support with inferred types
- 🏗️ **Clean Architecture**: SOLID principles, modular design
- 🔍 **Metadata-Driven**: Uses `@tauri` metadata to configure transport behavior

## Installation

```bash
bun add @tauri-orpc-contract/tauri-link
```

## Quick Start

### 1. Define your contract with Tauri metadata

```typescript
import { oc } from "@orpc/contract";
import { openapi } from "@orpc/openapi";
import { asyncIteratorObject } from "@orpc/contract";
import { tauri } from "@tauri-orpc-contract/tauri-link";

export const contract = {
  // Event-based streaming
  stream: {
    events: oc
      .meta(tauri.command("stream_events"))
      .meta(
        tauri.transport({
          kind: "stream",
          id: { name: "streamId", value: () => crypto.randomUUID() },
          events: {
            name: "eventNames",
            generator: (streamId) => ({
              data: `stream:${streamId}:data`,
              done: `stream:${streamId}:done`,
              error: `stream:${streamId}:error`,
            }),
          },
        })
      )
      .input(z.void())
      .output(asyncIteratorObject(EventSchema)),
  },
  
  // Channel-based streaming
  channel: {
    events: oc
      .meta(tauri.command("channel_events"))
      .meta(tauri.transport({ kind: "channel", id: "onEvent" }))
      .input(z.void())
      .output(asyncIteratorObject(EventSchema)),
  },
};
```

### 2. Create client with TauriLink

```typescript
import { createORPCClient } from "@orpc/client";
import { TauriLink } from "@tauri-orpc-contract/tauri-link";
import { contract } from "./contract";

const link = new TauriLink(contract);
const client = createORPCClient(contract, link);
```

### 3. Use in your app

```typescript
// Regular RPC calls
const result = await client.ping.ping();

// Event-based streaming
for await (const event of await client.stream.events()) {
  console.log("Event:", event);
}

// Channel-based streaming
for await (const event of await client.channel.events()) {
  console.log("Channel event:", event);
}
```

## Tauri Metadata

The `tauri()` metadata plugin supports the following options:

```typescript
interface TauriMeta {
  /**
   * Transport configuration for streaming procedures
   */
  transport?: TauriTransportConfig;

  /**
   * Custom Tauri command name override
   */
  command?: string;

  /**
   * Command timeout in milliseconds
   */
  timeout?: number;

  /**
   * Enable debug logging
   */
  debug?: boolean;

  /**
   * Tags for categorizing commands (merged across .meta() calls)
   */
  tags?: string[];

  /**
   * Required permissions (merged across .meta() calls)
   */
  permissions?: string[];
}

type TauriTransportConfig =
  | {
      kind: "stream";
      id: { name: string; value: string | (() => string) };
      events: {
        name: string;
        generator: (streamId: string) => {
          data: string;
          done: string;
          error: string;
        };
      };
    }
  | { kind: "channel"; id: { name: string } | string };
```

### Metadata Merging

Arrays (`tags`, `permissions`) are merged by concatenation:

```typescript
oc
  .meta(tauri({ tags: ["streaming"], permissions: ["read:data"] }))
  .meta(tauri({ tags: ["realtime"], permissions: ["admin"] }))
  
// Result: 
// tags = ["streaming", "realtime"]
// permissions = ["read:data", "admin"]
```

## Streaming Patterns

### Event-Based Streaming

**Rust Backend:**
```rust
use tauri::{AppHandle, Emitter};
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventNames {
    pub data: String,
    pub done: String,
    pub error: String,
}

#[derive(Serialize)]
pub struct StreamEventData {
    pub message: String,
    pub count: i32,
}

#[tauri::command]
pub async fn stream_events(app: AppHandle, stream_id: String, event_names: EventNames) {
    tauri::async_runtime::spawn(async move {
        for i in 1..=5 {
            let event = StreamEventData { 
                message: format!("Event {}", i), 
                count: i 
            };
            let _ = app.emit(&event_names.data, &event);
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        let _ = app.emit(&event_names.done, ());
    });
}
```

**Frontend:**
```typescript
const iterator = await client.stream.events();
for await (const event of iterator) {
  console.log(event);
}
```

### Channel-Based Streaming

**Rust Backend:**
```rust
use tauri::ipc::Channel;

#[derive(Serialize)]
pub struct StreamChannelData {
    pub message: String,
    pub count: i32,
}

#[tauri::command]
pub async fn stream_events_channel(on_event: Channel<Event<StreamChannelData>>) {
    tauri::async_runtime::spawn(async move {
        for i in 1..=5 {
            let payload = StreamChannelData { 
                message: format!("Event {}", i), 
                count: i 
            };
            let event = Event::default()
                .event("message")
                .data(payload);
            let _ = on_event.send(event);
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        let _ = on_event.send(Event::default().event("close"));
    });
}
```

**Frontend:**
```typescript
const iterator = await client.channel.events();
for await (const event of iterator) {
  console.log(event);
}
```

## Architecture

```
packages/tauri-link/
├── src/
│   ├── errors/
│   │   └── error-handler.ts      # Error conversion logic
│   ├── resolvers/
│   │   ├── contract-validator.ts # Contract validation
│   │   └── procedure-resolver.ts # Metadata extraction
│   ├── streaming/
│   │   ├── stream-iterator.ts    # Async queue management
│   │   ├── event-stream.ts       # Event-based streaming
│   │   └── channel-stream.ts     # Channel-based streaming
│   ├── link.ts                   # Main TauriLink class
│   ├── metadata.ts               # Tauri metadata plugin
│   ├── types.ts                  # Type definitions
│   └── index.ts                  # Public exports
```

## License

MIT
