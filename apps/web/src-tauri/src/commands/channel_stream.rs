use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(tag = "event", content = "data")]
pub enum StreamChannelEvent {
    #[serde(rename = "data")]
    Data { message: String, count: i32 },
    #[serde(rename = "done")]
    Done,
    #[serde(rename = "error")]
    Error { message: String },
}

#[tauri::command]
pub async fn stream_events_channel(on_event: Channel<StreamChannelEvent>) {
    log::info!("Stream events channel command invoked");

    // Spawn async task to send events through the channel
    tauri::async_runtime::spawn(async move {
        // Simulate streaming with delay
        for i in 1..=5 {
            let event = StreamChannelEvent::Data {
                message: format!("Channel Event {}", i),
                count: i,
            };

            log::info!("Sending channel event: {:?}", event);

            if let Err(e) = on_event.send(event) {
                log::error!("Failed to send channel event: {:?}", e);
                let _ = on_event.send(StreamChannelEvent::Error {
                    message: "Failed to send event".to_string(),
                });
                return;
            }

            // Simulate some work
            tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
        }

        // Signal completion
        if let Err(e) = on_event.send(StreamChannelEvent::Done) {
            log::error!("Failed to send done event: {:?}", e);
        }

        log::info!("Stream events channel completed");
    });
}
