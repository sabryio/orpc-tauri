use serde::Serialize;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Global SSE event names (matches GLOBAL_EVENT_NAMES in tauri-link/constants.ts)
pub mod event_names {
    /// Data event - emitted for each stream item
    pub const DATA: &str = "data";
    /// Done event - emitted when stream completes successfully
    pub const DONE: &str = "done";
    /// Error event - emitted when stream encounters an error
    pub const ERROR: &str = "error";
}

/// Server-Sent Event builder, matching Axum's SSE Event pattern exactly.
///
/// This allows seamless migration from Tauri to Axum by using the same API:
/// ```rust
/// Event::default()
///     .event("message")
///     .id("123")
///     .retry(Duration::from_secs(5))
///     .data(payload)
/// ```
#[derive(Debug, Default, Clone, Serialize)]
pub struct Event {
    /// Optional event name (maps to `event:` field in SSE)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event: Option<String>,

    /// Optional event ID (maps to `id:` field in SSE)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,

    /// Optional retry duration in milliseconds (maps to `retry:` field in SSE)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry: Option<u64>,

    /// Optional comment (maps to `:` field in SSE)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,

    /// Event data payload (maps to `data:` field in SSE)
    /// Stored as JSON Value for flexibility
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl Event {
    /// Set the event name field (`event:<event-name>`)
    ///
    /// This corresponds to the `type` parameter in `addEventListener` on an EventSource.
    /// For example, `.event("update")` corresponds to `.addEventListener("update", ...)`.
    pub fn event<S: Into<String>>(mut self, event: S) -> Self {
        self.event = Some(event.into());
        self
    }

    /// Set the event's identifier field (`id:<identifier>`)
    ///
    /// This corresponds to MessageEvent's `lastEventId` field.
    pub fn id<S: Into<String>>(mut self, id: S) -> Self {
        self.id = Some(id.into());
        self
    }

    /// Set the event's retry timeout field (`retry: <timeout>`)
    ///
    /// This sets how long clients will wait before reconnecting if disconnected.
    pub fn retry(mut self, duration: Duration) -> Self {
        self.retry = Some(duration.as_millis() as u64);
        self
    }

    /// Set the event's comment field (`:<comment-text>`)
    ///
    /// This field is ignored by most SSE clients but useful for keep-alive.
    pub fn comment<S: Into<String>>(mut self, comment: S) -> Self {
        self.comment = Some(comment.into());
        self
    }

    /// Set the event's data field (`data: <content>`)
    ///
    /// This corresponds to MessageEvent's data field.
    /// Accepts any type that can be serialized to JSON.
    pub fn data<T: Serialize>(mut self, data: T) -> Self {
        // Convert to serde_json::Value for consistent handling
        self.data = serde_json::to_value(data).ok();
        self
    }
}

/// Broadcast SSE manager - can be used from any command handler
/// Similar to Axum's SSE broadcasting pattern
#[derive(Clone)]
pub struct SseBroadcaster {
    app: Arc<AppHandle>,
}

impl SseBroadcaster {
    /// Create a new broadcaster with the app handle
    pub fn new(app: AppHandle) -> Self {
        Self { app: Arc::new(app) }
    }

    /// Emit a data event to all connected clients
    pub fn emit_data(&self, event: Event) -> Result<(), String> {
        self.app
            .emit(event_names::DATA, &event)
            .map_err(|e| e.to_string())
    }

    /// Emit an error event to all connected clients
    pub fn emit_error<T: Serialize>(&self, error: T) -> Result<(), String> {
        self.app
            .emit(event_names::ERROR, &error)
            .map_err(|e| e.to_string())
    }

    /// Emit a done event to all connected clients
    pub fn emit_done(&self) -> Result<(), String> {
        self.app
            .emit(event_names::DONE, ())
            .map_err(|e| e.to_string())
    }

    /// Convenience method to emit a flush event (establish connection)
    pub fn emit_flush(&self) -> Result<(), String> {
        let flush_event = Event::default().comment("flush");
        self.emit_data(flush_event)
    }

    /// Convenience method to emit a typed data event with metadata
    /// Event type: "message", retry: 5 seconds
    pub fn emit_event<T: Serialize>(&self, data: T, id: String) -> Result<(), String> {
        let event = Event::default()
            .event("message")
            .id(id)
            .retry(Duration::from_secs(5))
            .data(data);
        self.emit_data(event)
    }
}
