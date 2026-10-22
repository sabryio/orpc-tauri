use crate::broadcast::{Event, event_names};
use crate::commands::file::PROGRESS_EVERY_N_CHUNKS;
use crate::types::errors::AppError;
use serde::Deserialize;
use std::io::Read;
use tauri::ipc::{Channel, InvokeResponseBody};

/// `input` argument of `raw_file_download` — deserialized from the oRPC input
/// envelope `{ input: { path } }` (the wrapper key names the command arg, so
/// fields live flat here).
#[derive(Debug, Deserialize)]
pub struct RawDownloadInput {
    pub path: String,
}

/// Raw chunk size for the demo file transfer (64 KiB).
///
/// Note the `InvokeResponseBody::Raw` threshold caveat: Tauri executes raw
/// payloads under `tauri::ipc::channel::MAX_RAW_DIRECT_EXECUTE_THRESHOLD`
/// bytes (1 KiB) via direct `eval` — larger raw payloads stay raw bytes over
/// the IPC body, so 64 KiB is comfortably "always raw".
const RAW_CHUNK_SIZE: usize = 64 * 1024;

/// §1 raw binary download (`docs/ADVANCED_FEATURES.md` — "tauri.binary()").
///
/// Unlike `download_file` / `resource_file_download`, this stream sends real
/// file bytes through a **raw channel**: `Channel<InvokeResponseBody>` (its
/// default type parameter) delivers `InvokeResponseBody::Raw` chunks to the
/// frontend as `ArrayBuffer`s — zero JSON overhead, no `number[]` inflation.
///
/// The trick that makes a raw channel and the existing SSE-style protocol
/// coexist: each sent value independently chooses its representation. Data
/// chunks go out **raw** (`InvokeResponseBody::Raw(bytes)`); control
/// envelopes stay **JSON** (`Event` serializes to the same
/// `{ event?, id?, comment? }` shape the link's channel transport already
/// parses). The link's §1 work is exactly this discrimination: treat an
/// incoming `ArrayBuffer` as data, keep parsing objects for control
/// envelopes (`flush`, `progress:`, `done`).
#[tauri::command]
pub async fn raw_download(
    input: RawDownloadInput,
    on_event: Channel<InvokeResponseBody>,
) -> Result<usize, AppError> {
    // Open + size synchronously: a missing/unreadable file fails the command
    // (and therefore the stream) instead of silently ending it.
    let mut file =
        std::fs::File::open(&input.path).map_err(|cause| match cause.kind() {
            std::io::ErrorKind::NotFound => {
                AppError::not_found(format!("file not found: {}", input.path))
            }
            _ => AppError::internal(format!(
                "cannot open {}: {cause}",
                input.path
            )),
        })?;
    let total = file.metadata().map_err(|cause| {
        AppError::internal(format!("cannot stat {}: {cause}", input.path))
    })?.len() as usize;

    log::info!(
        "Raw file download: {} ({} bytes, {} chunks of {} KiB)",
        input.path,
        total,
        total.div_ceil(RAW_CHUNK_SIZE),
        RAW_CHUNK_SIZE / 1024
    );

    tauri::async_runtime::spawn_blocking(move || -> Result<usize, AppError> {
        // 1. FLUSH: establish connection (Axum style, JSON envelope — the
        //    `Event` shapes are identical to what `download_file` sends).
        on_event
            .send(InvokeResponseBody::Json(
                serde_json::to_string(&Event::default().flush())?,
            ))
            .map_err(|e| AppError::internal(format!("flush send failed: {e:?}")))?;

        // 2. RAW DATA + JSON PROGRESS: each read becomes one raw chunk; one
        //    data-less progress envelope per N chunks, plus the final one.
        let mut read_buf = vec![0u8; RAW_CHUNK_SIZE];
        let mut sent = 0usize;
        let mut seq = 0usize;

        loop {
            match file.read(&mut read_buf) {
                Ok(0) => break, // EOF
                Ok(n) => {
                    // Raw payload: arrives in JS as an ArrayBuffer.
                    on_event.send(InvokeResponseBody::Raw(read_buf[..n].to_vec()))
                        .map_err(|e| {
                            AppError::internal(format!("chunk {seq} send failed: {e:?}"))
                        })?;

                    sent += n;
                    seq += 1;

                    if (seq.is_multiple_of(PROGRESS_EVERY_N_CHUNKS) || sent == total)
                        && let Err(e) = on_event.send(InvokeResponseBody::Json(
                            serde_json::to_string(&Event::default()
                                .progress(sent as u64, total as u64))?,
                        ))
                    {
                        log::error!("Failed to send progress: {e:?}");
                        break;
                    }
                }
                Err(cause) => {
                    on_event
                        .send(InvokeResponseBody::Json(serde_json::to_string(
                            &Event::default()
                                .event(event_names::ERROR)
                                .data(serde_json::json!({
                                    "message": format!("read error: {cause}"),
                                })),
                        )?))
                        .ok(); // best-effort; the stream is already broken
                    return Err(AppError::internal(format!(
                        "read failed after {} bytes: {cause}",
                        sent
                    )));
                }
            }
        }

        // 3. DONE: signal stream completion (JSON envelope).
        if let Err(e) = on_event.send(InvokeResponseBody::Json(serde_json::to_string(
            &Event::default().event(event_names::DONE),
        )?)) {
            log::error!("Failed to send done event: {e:?}");
        }

        log::info!("Raw download complete: {sent} bytes in {seq} chunks",);

        Ok(sent)
    });

    // Announced up front (like the other demo downloads); the spawned task
    // streams the real body.
    Ok(total)
}
