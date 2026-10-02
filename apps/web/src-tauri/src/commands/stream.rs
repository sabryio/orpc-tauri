use crate::types::errors::AppError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct StreamEvent {
    pub message: String,
    pub count: i32,
}

#[tauri::command]
pub async fn stream_events() -> Result<Vec<StreamEvent>, AppError> {
    log::info!("Stream events command invoked");

    let events = vec![
        StreamEvent {
            message: "Event 1".to_string(),
            count: 1,
        },
        StreamEvent {
            message: "Event 2".to_string(),
            count: 2,
        },
        StreamEvent {
            message: "Event 3".to_string(),
            count: 3,
        },
    ];

    Ok(events)
}
