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
  // Event-based streaming (default)
  stream: {
    events: oc
      .meta(openapi({ method: "GET", path: "/stream_events" }))
      .meta(tauri({ transport: "emit-listen" }))
      .input(z.void())
      .output(asyncIteratorObject(EventSchema)),
  },
  
  // Channel-based streaming (Tauri native)
  channel: {
    events: oc
      .meta(openapi({ method: "GET", path: "/channel_events" }))
      .meta(tauri({ transport: "channel" }))
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
   * Transport mechanism for streaming procedures
   * - "emit-listen": Event-based streaming with stream IDs (default)
   * - "channel": Bidirectional Channel API streaming
   */
  transport?: "emit-listen" | "channel";

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
use uuid::Uuid;
use tauri::{AppHandle, Emitter};

#[tauri::command]
pub async fn stream_events(app: AppHandle) -> StreamStartResponse {
    let stream_id = Uuid::new_v4().to_string();
    
    tauri::async_runtime::spawn(async move {
        for i in 1..=5 {
            let event = StreamEvent { message: format!("Event {}", i), count: i };
            let _ = app.emit(&format!("stream:{}:data", stream_id), &event);
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        let _ = app.emit(&format!("stream:{}:done", stream_id), ());
    });
    
    StreamStartResponse { stream_id }
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
#[serde(tag = "event", content = "data")]
enum StreamEvent {
    #[serde(rename = "data")]
    Data { message: String, count: i32 },
    #[serde(rename = "done")]
    Done,
}

#[tauri::command]
pub async fn channel_events(on_event: Channel<StreamEvent>) {
    tauri::async_runtime::spawn(async move {
        for i in 1..=5 {
            let _ = on_event.send(StreamEvent::Data { 
                message: format!("Event {}", i), 
                count: i 
            });
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        let _ = on_event.send(StreamEvent::Done);
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
