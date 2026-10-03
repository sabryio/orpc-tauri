use crate::broadcast::{AppBroadcaster, AppEvent};
use tauri::State;

#[tauri::command]
pub async fn stream_events(broadcaster: State<'_, AppBroadcaster>) -> Result<(), String> {
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

        // 2. EVENTS: Stream actual data events
        for i in 1..=5 {
            let message = format!("Event {} (global)", i);
            log::info!("Emitting stream event {}: {}", i, message);

            // Create and emit typed stream event
            let event = AppEvent::Stream { message, count: i };
            if let Err(e) = broadcaster.emit_event(event, i.to_string()) {
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
