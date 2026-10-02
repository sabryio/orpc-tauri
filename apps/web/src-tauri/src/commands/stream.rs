use crate::sse::Event;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{AppHandle, Emitter};

/// Stream event data payload
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamEventData {
    pub message: String,
    pub count: i32,
}

/// Event names received from frontend
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventNames {
    pub data: String,
    pub done: String,
    pub error: String,
}

#[tauri::command]
pub async fn stream_events(app: AppHandle, stream_id: String, event_names: EventNames) {
    log::info!(
        "Stream events command invoked with stream_id: {} and event_names: {:?}",
        stream_id,
        event_names
    );

    // Spawn async task to emit events
    tauri::async_runtime::spawn(async move {
        // 1. FLUSH: Send initial event to establish connection (Axum-style)
        log::info!("Sending flush event for stream: {}", stream_id);
        let flush_event: Event<()> = Event::default().comment("flush");
        if let Err(e) = app.emit(&event_names.data, &flush_event) {
            log::error!("Failed to emit flush event: {:?}", e);
            let _ = app.emit(&event_names.error, "Failed to establish stream");
            return;
        }

        // Small delay to ensure frontend is ready
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // 2. EVENTS: Stream actual data events (Axum-style with id and retry)
        for i in 1..=5 {
            let payload = StreamEventData {
                message: format!("Event {} [stream_id: {}]", i, stream_id),
                count: i,
            };

            log::info!("Emitting event {}: {:?}", i, payload);

            // Axum-style event with metadata
            let event = Event::default()
                .event("message")
                .id(i.to_string())
                .retry(Duration::from_secs(5))
                .data(payload);

            if let Err(e) = app.emit(&event_names.data, &event) {
                log::error!("Failed to emit event {}: {:?}", i, e);
                let _ = app.emit(&event_names.error, "Failed to emit event");
                return;
            }

            // Simulate some work
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }

        // 3. DONE: Signal stream completion
        log::info!("Sending done event for stream: {}", stream_id);
        if let Err(e) = app.emit(&event_names.done, ()) {
            log::error!("Failed to emit done event: {:?}", e);
        }

        log::info!("Stream events completed for: {}", stream_id);
    });
}
