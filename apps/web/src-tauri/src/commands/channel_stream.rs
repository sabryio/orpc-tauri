use crate::sse::Event;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::ipc::Channel;

/// Stream event data payload for channel
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamChannelData {
    pub message: String,
    pub count: i32,
}

#[tauri::command]
pub async fn stream_events_channel(on_event: Channel<Event<StreamChannelData>>) {
    log::info!("Stream events channel command invoked");

    // Spawn async task to send events through the channel
    tauri::async_runtime::spawn(async move {
        // 1. FLUSH: Send initial event to establish connection (Axum-style)
        log::info!("Sending flush event to channel");
        let flush_event: Event<StreamChannelData> = Event::default().comment("flush");
        if let Err(e) = on_event.send(flush_event) {
            log::error!("Failed to send flush event: {:?}", e);
            return;
        }

        // Small delay to ensure channel is fully ready
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // 2. EVENTS: Stream actual data events (Axum-style with metadata)
        for i in 1..=5 {
            let payload = StreamChannelData {
                message: format!("Channel Event {}", i),
                count: i,
            };

            log::info!("Sending channel event {}: {:?}", i, payload);

            // Axum-style event with id, retry, and event name
            let event = Event::default()
                .event("message")
                .id(i.to_string())
                .retry(Duration::from_secs(5))
                .data(payload);

            if let Err(e) = on_event.send(event) {
                log::error!("Failed to send channel event {}: {:?}", i, e);
                return;
            }

            // Simulate some work
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }

        // 3. CLOSE: Signal completion (Axum-style)
        log::info!("Sending close event to channel");
        let close_event: Event<StreamChannelData> = Event::default().event("close");
        if let Err(e) = on_event.send(close_event) {
            log::error!("Failed to send close event: {:?}", e);
        }

        log::info!("Stream events channel completed");
    });
}
