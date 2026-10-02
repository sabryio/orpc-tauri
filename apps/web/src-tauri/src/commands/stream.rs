use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamEvent {
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
        // Simulate streaming with delay
        for i in 1..=5 {
            let event = StreamEvent {
                message: format!("Event {}", i),
                count: i,
            };

            log::info!("Emitting event: {:?}", event);

            // Emit event to frontend with stream-specific event name
            let data_event = format!("stream:{}:data", stream_id_clone);
            if let Err(e) = app.emit(&data_event, &event) {
                log::error!("Failed to emit event: {:?}", e);
                let error_event = format!("stream:{}:error", stream_id_clone);
                let _ = app.emit(&error_event, "Failed to emit event");
                return;
            }

            // Simulate some work
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }

        // Signal completion
        let done_event = format!("stream:{}:done", stream_id_clone);
        if let Err(e) = app.emit(&done_event, ()) {
            log::error!("Failed to emit done event: {:?}", e);
        }

        log::info!("Stream events completed");
    });

    // Return stream ID immediately so frontend can start listening
    StreamStartResponse { stream_id }
}
