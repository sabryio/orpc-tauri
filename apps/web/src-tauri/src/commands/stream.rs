use crate::sse::Event;
use serde::{Deserialize, Serialize};
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

/// Stream event data payload
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamEventData {
    pub message: String,
    pub count: i32,
}

#[tauri::command]
pub async fn stream_events(app: AppHandle) {
    log::info!("Stream events command invoked (global event mode)");

    // Spawn async task to emit events
    tauri::async_runtime::spawn(async move {
        // 1. FLUSH: Send initial event to establish connection (Axum-style)
        log::info!("Sending flush event");
        let flush_event = Event::default().comment("flush");
        if let Err(e) = app.emit(event_names::DATA, &flush_event) {
            log::error!("Failed to emit flush event: {:?}", e);
            let _ = app.emit(event_names::ERROR, "Failed to establish stream");
            return;
        }

        // Small delay to ensure frontend is ready
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // 2. EVENTS: Stream actual data events (Axum-style with id and retry)
        for i in 1..=5 {
            let payload = StreamEventData {
                message: format!("Event {} (global)", i),
                count: i,
            };

            log::info!("Emitting event {}: {:?}", i, payload);

            // Axum-style event with metadata
            let event = Event::default()
                .event("message")
                .id(i.to_string())
                .retry(Duration::from_secs(5))
                .data(payload);

            if let Err(e) = app.emit(event_names::DATA, &event) {
                log::error!("Failed to emit event {}: {:?}", i, e);
                let _ = app.emit(event_names::ERROR, "Failed to emit event");
                return;
            }

            // Simulate some work
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }

        // 3. DONE: Signal stream completion
        log::info!("Sending done event");
        if let Err(e) = app.emit(event_names::DONE, ()) {
            log::error!("Failed to emit done event: {:?}", e);
        }

        log::info!("Stream events completed");
    });
}
