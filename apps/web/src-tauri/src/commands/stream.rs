use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamEvent {
    pub message: String,
    pub count: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "type", content = "data")]
pub enum StreamEventMessage {
    /// Initial flush event to establish stream
    #[serde(rename = "flush")]
    Flush,
    /// Data event with payload
    #[serde(rename = "data")]
    Data(StreamEvent),
    /// Close event to signal completion
    #[serde(rename = "close")]
    Close,
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

        // 1. FLUSH: Send initial event to establish connection
        log::info!("Sending flush event for stream: {}", stream_id_clone);
        if let Err(e) = app.emit(&data_event, StreamEventMessage::Flush) {
            log::error!("Failed to emit flush event: {:?}", e);
            let _ = app.emit(&error_event, "Failed to establish stream");
            return;
        }

        // Small delay to ensure frontend is ready
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // 2. EVENTS: Stream actual data events
        for i in 1..=5 {
            let event = StreamEvent {
                message: format!("Event {}", i),
                count: i,
            };

            log::info!("Emitting event {}: {:?}", i, event);

            if let Err(e) = app.emit(&data_event, StreamEventMessage::Data(event)) {
                log::error!("Failed to emit event {}: {:?}", i, e);
                let _ = app.emit(&error_event, "Failed to emit event");
                return;
            }

            // Simulate some work
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }

        // 3. CLOSE: Signal stream completion
        log::info!("Sending close event for stream: {}", stream_id_clone);
        if let Err(e) = app.emit(&data_event, StreamEventMessage::Close) {
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
