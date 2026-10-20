use crate::broadcast::Event;
use crate::types::errors::AppError;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tauri::ipc::Channel;

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

#[derive(Debug, Deserialize)]
pub struct DownloadFileInput {
    /// Total bytes to generate (demo command — no real file I/O).
    /// Capped at 2 MB server-side regardless of the requested value.
    pub total_bytes: Option<u64>,
}

const CHUNK_SIZE: usize = 32 * 1024; // 32 KiB
const DEFAULT_TOTAL: usize = 256 * 1024; // 256 KiB
const MAX_TOTAL: u64 = 2 * 1024 * 1024; // 2 MB safety cap for the demo
const PROGRESS_EVERY_N_CHUNKS: usize = 2; // one progress tick per N chunks
const DEMO_DELAY: Duration = Duration::from_millis(40);

#[tauri::command]
pub async fn download_file(
    input: DownloadFileInput,
    on_event: Channel<Event>,
) -> Result<usize, AppError> {
    let total = input
        .total_bytes
        .map_or(DEFAULT_TOTAL, |requested| requested.min(MAX_TOTAL) as usize);

    log::info!("Streaming download demo: {} bytes", total);

    tauri::async_runtime::spawn(async move {
        // 1. FLUSH: establish connection (Axum-style)
        if let Err(e) = on_event.send(Event::default().comment("flush")) {
            log::error!("Failed to send flush event: {:?}", e);
            return;
        }

        // 2. DATA + PROGRESS: chunk envelopes interleaved with data-less
        //    progress control envelopes (`progress:<read>/<total>`).
        //    Demo pattern: deterministic pseudo-random bytes so UI debugging
        //    is reproducible (any byte generator would do for a real file).
        let mut sent = 0usize;
        let mut seq = 0usize;

        while sent < total {
            let size = CHUNK_SIZE.min(total - sent);
            let chunk: Vec<u8> = (0..size)
                .map(|i| ((i * 7 + seq * 13) % 256) as u8)
                .collect();

            if let Err(e) = on_event.send(
                Event::default()
                    .event("message")
                    .id(seq.to_string())
                    .data(chunk),
            ) {
                log::error!("Failed to send chunk {}: {:?}", seq, e);
                return;
            }

            sent += size;
            seq += 1;

            // Throttle: one progress envelope per N chunks, plus the final one
            if (seq.is_multiple_of(PROGRESS_EVERY_N_CHUNKS) || sent == total)
                && let Err(e) = on_event.send(Event::default().progress(sent as u64, total as u64))
            {
                log::error!("Failed to send progress: {:?}", e);
                return;
            }

            // Demo pacing so progress is visible in the UI
            tokio::time::sleep(DEMO_DELAY).await;
        }

        // 3. DONE: Signal stream completion
        if let Err(e) = on_event.send(Event::default().event("done")) {
            log::error!("Failed to send done event: {:?}", e);
        }

        log::info!("Download demo complete: {} bytes in {} chunks", sent, seq);
    });

    Ok(total)
}
