use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamChannelData {
    pub message: String,
    pub count: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "event", content = "data")]
pub enum StreamChannelEvent {
    /// Initial flush event to establish stream
    #[serde(rename = "flush")]
    Flush,
    /// Data event with payload
    #[serde(rename = "data")]
    Data(StreamChannelData),
    /// Close event to signal completion
    #[serde(rename = "close")]
    Close,
    /// Error event
    #[serde(rename = "error")]
    Error { message: String },
}

#[tauri::command]
pub async fn stream_events_channel(on_event: Channel<StreamChannelEvent>) {
    log::info!("Stream events channel command invoked");

    // Spawn async task to send events through the channel
    tauri::async_runtime::spawn(async move {
        // 1. FLUSH: Send initial event to establish connection
        log::info!("Sending flush event to channel");
        if let Err(e) = on_event.send(StreamChannelEvent::Flush) {
            log::error!("Failed to send flush event: {:?}", e);
            let _ = on_event.send(StreamChannelEvent::Error {
                message: "Failed to establish stream".to_string(),
            });
            return;
        }

        // Small delay to ensure channel is fully ready
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

        // 2. EVENTS: Stream actual data events
        for i in 1..=5 {
            let data = StreamChannelData {
                message: format!("Channel Event {}", i),
                count: i,
            };

            log::info!("Sending channel event {}: {:?}", i, data);

            if let Err(e) = on_event.send(StreamChannelEvent::Data(data)) {
                log::error!("Failed to send channel event {}: {:?}", i, e);
                let _ = on_event.send(StreamChannelEvent::Error {
                    message: "Failed to send event".to_string(),
                });
                return;
            }

            // Simulate some work
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }

        // 3. CLOSE: Signal completion
        log::info!("Sending close event to channel");
        if let Err(e) = on_event.send(StreamChannelEvent::Close) {
            log::error!("Failed to send close event: {:?}", e);
        }

        log::info!("Stream events channel completed");
    });
}
