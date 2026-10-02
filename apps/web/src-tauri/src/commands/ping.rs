use crate::types::{errors::AppError, models::PingResponse};
use uuid::Uuid;

#[tauri::command]
pub async fn ping() -> Result<PingResponse, AppError> {
    log::info!("Ping command invoked");

    Ok(PingResponse {
        id: Uuid::new_v4(),
        message: "pong".to_string(),
    })
}
