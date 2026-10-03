use crate::types::errors::AppError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct UploadFileInput {
    pub content: Vec<u8>, // Raw bytes from Uint8Array
    pub filename: String,
}

#[derive(Debug, Serialize)]
pub struct UploadFileOutput {
    pub success: bool,
    pub size: usize,
    pub filename: String,
    pub mime_type: Option<String>,
}

#[tauri::command]
pub async fn upload_file(input: UploadFileInput) -> Result<UploadFileOutput, AppError> {
    // No need to decode - already have raw bytes!
    let size = input.content.len();

    // Detect MIME type from filename extension
    let mime_type = match input.filename.split('.').next_back() {
        Some("jpg") | Some("jpeg") => Some("image/jpeg".to_string()),
        Some("png") => Some("image/png".to_string()),
        Some("gif") => Some("image/gif".to_string()),
        Some("pdf") => Some("application/pdf".to_string()),
        Some("txt") => Some("text/plain".to_string()),
        Some("json") => Some("application/json".to_string()),
        _ => None,
    };

    log::info!(
        "Processed file upload: {} ({} bytes, type: {:?})",
        input.filename,
        size,
        mime_type
    );

    Ok(UploadFileOutput {
        success: true,
        size,
        filename: input.filename,
        mime_type,
    })
}
