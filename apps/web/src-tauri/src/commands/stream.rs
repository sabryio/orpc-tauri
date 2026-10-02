use crate::sse::Event;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

/// Stream event data payload
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamEventData {
    pub message: String,
    pub count: i32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StreamStartResponse {
    pub stream_id: String,
}

#[tauri::command]
pub async fn stream_events(app: AppHandle) -> StreamStartResponse {
    // Generate unique stream ID in Rust
    let stream_id = Uuid::new_v4().to_string();

    log::info!(
        "Stream events command invoked with stream_id: {}",
        stream_id
    );

    let stream_id_clone = stream_id.clone();

    // Spawn async task to emit events
    tauri::async_runtime::spawn(async move {
        let data_event = format!("stream:{}:data", stream_id_clone);
        let done_event = format!("stream:{}:done", stream_id_clone);
        let error_event = format!("stream:{}:error", stream_id_clone);

        // 1. FLUSH: Send initial event to establish connection (Axum-style)
        log::info!("Sending flush event for stream: {}", stream_id_clone);
        let flush_event: Event<()> = Event::default().comment("flush");
        if let Err(e) = app.emit(&data_event, &flush_event) {
            log::error!("Failed to emit flush event: {:?}", e);
            let _ = app.emit(&error_event, "Failed to establish stream");
            return;
        }

        // Small delay to ensure frontend is ready
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // 2. EVENTS: Stream actual data events (Axum-style with id and retry)
        for i in 1..=5 {
            let payload = StreamEventData {
                message: format!("Event {}", i),
                count: i,
            };

            log::info!("Emitting event {}: {:?}", i, payload);

            // Axum-style event with metadata
            let event = Event::default()
                .event("message")
                .id(i.to_string())
                .retry(Duration::from_secs(5))
                .data(payload);

            if let Err(e) = app.emit(&data_event, &event) {
                log::error!("Failed to emit event {}: {:?}", i, e);
                let _ = app.emit(&error_event, "Failed to emit event");
                return;
            }

            // Simulate some work
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }

        // 3. CLOSE: Signal stream completion (Axum-style)
        log::info!("Sending close event for stream: {}", stream_id_clone);
        let close_event: Event<()> = Event::default().event("close");
        if let Err(e) = app.emit(&data_event, &close_event) {
            log::error!("Failed to emit close event: {:?}", e);
        }

        // Send done event for cleanup
        if let Err(e) = app.emit(&done_event, ()) {
            log::error!("Failed to emit done event: {:?}", e);
        }

        log::info!("Stream events completed");
    });

    // Return stream ID immediately so frontend can start listening
    StreamStartResponse { stream_id }
}
