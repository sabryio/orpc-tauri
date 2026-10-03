use crate::types::errors::AppError;
use base64::{Engine as _, engine::general_purpose};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct UploadFileInput {
    pub content: String, // Base64 encoded
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
    // Decode base64 content
    let decoded = general_purpose::STANDARD
        .decode(&input.content)
        .map_err(|e| AppError::Internal {
            msg: format!("Failed to decode base64: {}", e),
        })?;

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
        decoded.len(),
        mime_type
    );

    Ok(UploadFileOutput {
        success: true,
        size: decoded.len(),
        filename: input.filename,
        mime_type,
    })
}
