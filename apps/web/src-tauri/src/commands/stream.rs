use crate::broadcast::SseBroadcaster;
use serde::{Deserialize, Serialize};
use tauri::State;

/// Stream event data payload
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EventData {
    pub message: String,
    pub count: i32,
}

#[tauri::command]
pub async fn stream_events(broadcaster: State<'_, SseBroadcaster>) -> Result<(), String> {
    log::info!("Stream events command invoked (global event mode)");

    // Clone broadcaster for async task
    let broadcaster = broadcaster.inner().clone();

    // Spawn async task to emit events
    tauri::async_runtime::spawn(async move {
        // 1. FLUSH: Send initial event to establish connection (Axum-style)
        log::info!("Sending flush event");
        if let Err(e) = broadcaster.emit_flush() {
            log::error!("Failed to emit flush event: {:?}", e);
            let _ = broadcaster.emit_error("Failed to establish stream");
            return;
        }

        // Small delay to ensure frontend is ready
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // 2. EVENTS: Stream actual data events (Axum-style with id and retry)
        for i in 1..=5 {
            let payload = EventData {
                message: format!("Event {} (global)", i),
                count: i,
            };

            log::info!("Emitting event {}: {:?}", i, payload);

            // Emit event with metadata (event type: "message", retry: 5s)
            if let Err(e) = broadcaster.emit_event(payload, i.to_string()) {
                log::error!("Failed to emit event {}: {:?}", i, e);
                let _ = broadcaster.emit_error("Failed to emit event");
                return;
            }

            // Simulate some work
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }

        // 3. DONE: Signal stream completion
        log::info!("Sending done event");
        if let Err(e) = broadcaster.emit_done() {
            log::error!("Failed to emit done event: {:?}", e);
        }

        log::info!("Stream events completed");
    });

    Ok(())
}
