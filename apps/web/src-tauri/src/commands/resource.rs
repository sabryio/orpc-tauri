//! Tauri Resource protocol demo commands (`tauri.resource()` meta on the
//! contract side).
//!
//! Resources live in Tauri's resource table (`tauri::Manager::resources_table`);
//! only their numeric id (`rid`) crosses the wire. The link announces a
//! stream's handle as a data-less `handle:<rid>` comment envelope
//! (`orpc-tauri` convention) and – with the default `autoClose` – closes the
//! resource when the consumer aborts/fails/leaves early. `Resource::close`
//! is the single server-side cancellation hook.

use crate::broadcast::Event;
use crate::commands::file::{CHUNK_SIZE, DEFAULT_TOTAL, MAX_TOTAL, PROGRESS_EVERY_N_CHUNKS};
use crate::types::errors::AppError;
use crate::types::models::Planet;
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Resource, ResourceId};

/// Slower pacing than `file.rs` so the cancel window is obvious on the demo
/// (256 KiB / 32 KiB = 8 chunks ≈ 6 s of transfer).
const RESOURCE_DEMO_DELAY: Duration = Duration::from_millis(750);

/// Wire reference to a Rust-owned resource. Never add fields — the JS side
/// types this as `RustResourceHandle` (a plain `{ rid: number }`).
#[derive(Debug, Serialize, Clone, Copy)]
pub struct ResourceRef {
    pub rid: u32,
}

/// Object form the typed client sends for a handle (`{ rid: 1 }`) — matches
/// `RustResourceHandle` on the JS side.
#[derive(Debug, Deserialize)]
pub struct HandleInput {
    pub rid: u32,
}

// ============================================================================
// db_open / db_query / db_close — stateful object behind a rid
// ============================================================================

/// A simulated database connection. Ends up in the resource table; JS holds
/// only its rid. `close` runs when the rid is removed from the table (via
/// `db_close`, `plugin:resources|close`, or app shutdown).
pub struct DatabaseConn {
    path: String,
    planets: Vec<Planet>,
}

impl DatabaseConn {
    fn open(path: &str) -> Result<Self, AppError> {
        if path.is_empty() {
            return Err(AppError::ValidationError("path is required".into()));
        }
        // Demo connection: no real DB behind it, just a seeded planets table.
        Ok(Self {
            path: path.to_string(),
            planets: vec![
                Planet {
                    id: 1,
                    name: "Mercury".into(),
                    description: Some("Closest to the sun".into()),
                },
                Planet {
                    id: 2,
                    name: "Venus".into(),
                    description: None,
                },
                Planet {
                    id: 3,
                    name: "Earth".into(),
                    description: Some("Home".into()),
                },
            ],
        })
    }

    fn query(&self, sql: &str) -> Result<Vec<Planet>, AppError> {
        let sql = sql.trim().to_lowercase();
        if !sql.starts_with("select") {
            return Err(AppError::ValidationError(format!(
                "unsupported SQL (demo accepts `SELECT * FROM planets`): {sql}"
            )));
        }
        Ok(self.planets.clone())
    }
}

impl Resource for DatabaseConn {
    fn name(&self) -> Cow<'_, str> {
        "DatabaseConn".into()
    }

    fn close(self: Arc<Self>) {
        log::info!("Closing database connection: {}", self.path);
    }
}

#[derive(Debug, Deserialize)]
pub struct DbOpenInput {
    pub path: String,
}

#[tauri::command]
pub async fn db_open(
    input: DbOpenInput,
    app: AppHandle,
) -> Result<ResourceRef, AppError> {
    let conn = DatabaseConn::open(&input.path)?;
    let rid = app.resources_table().add(conn);

    log::info!("db_open: {rid}");
    Ok(ResourceRef { rid })
}

#[derive(Debug, Deserialize)]
pub struct DbQueryInput {
    pub handle: HandleInput,
    pub sql: String,
}

#[tauri::command]
pub async fn db_query(
    input: DbQueryInput,
    app: AppHandle,
) -> Result<Vec<Planet>, AppError> {
    let rid = input.handle.rid;
    let conn = app
        .resources_table()
        .get::<DatabaseConn>(rid)
        .map_err(|_| AppError::NotFound(format!("database connection rid {rid}")))?;

    conn.query(&input.sql)
}

#[derive(Debug, Deserialize)]
pub struct DbCloseInput {
    pub handle: HandleInput,
}

#[tauri::command]
pub async fn db_close(
    input: DbCloseInput,
    app: AppHandle,
) -> Result<(), AppError> {
    let rid = input.handle.rid;
    app.resources_table()
        .close(rid)
        .map_err(|_| AppError::NotFound(format!("resource rid {rid}")))?;

    log::info!("db_close: {rid}");
    Ok(())
}

// ============================================================================
// resource_file_download — resource-backed cancellable channel stream
// ============================================================================

/// Handle for the in-flight download task. Registered in the resource table;
/// announced to JS as `handle:<rid>`. Closing the resource — from the link's
/// auto-close teardown, `link.resource.close(handle)`, or Rust — stops the
/// transfer: `Resource::close` flips the token the loop polls.
pub struct TransferHandle {
    rid: ResourceId,
    token: Arc<AtomicBool>,
}

impl Resource for TransferHandle {
    fn name(&self) -> Cow<'_, str> {
        "TransferHandle".into()
    }

    fn close(self: Arc<Self>) {
        // Single server-side cancellation hook — runs whoever closes the rid
        // (link autoClose teardown, link.resource.close(), or the worker
        // dropping its own completed handle).
        log::info!("TransferHandle rid {} closed (cancel token set)", self.rid);
        self.token.store(true, Ordering::Release);
    }
}

#[derive(Debug, Deserialize)]
pub struct ResourceDownloadInput {
    /// Total bytes to generate (demo command — no real file I/O).
    /// Capped at 2 MB server-side regardless of the requested value.
    pub total_bytes: Option<u64>,
}

#[tauri::command]
pub async fn resource_file_download(
    input: ResourceDownloadInput,
    app: AppHandle,
    on_event: Channel<Event>,
) -> Result<usize, AppError> {
    let total = input
        .total_bytes
        .map_or(DEFAULT_TOTAL, |requested| requested.min(MAX_TOTAL) as usize);

    // 1. Register the transfer handle; the rid is announced once JS-side.
    //    The table assigns the rid itself, so the handle is registered once
    //    (bare) and immediately replaced with one that knows its rid.
    let token = Arc::new(AtomicBool::new(false));
    let rid: ResourceId = app
        .resources_table()
        .add(TransferHandle {
            rid: 0,
            token: token.clone(),
        });
    app.resources_table().replace(
        rid,
        TransferHandle {
            rid,
            token: token.clone(),
        },
    );

    log::info!("resource_file_download: {total} bytes (handle rid {rid})");

    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        // 2. FLUSH: establish connection (Axum style)
        if let Err(e) = on_event.send(Event::default().comment("flush")) {
            log::error!("Failed to send flush event: {:?}", e);
            return;
        }

        // 3. HANDLE ANNOUNCEMENT: resource-backed streams announce their
        //    task handle exactly once as a data-less control envelope. The
        //    link swallows it and (autoClose) closes the rid when the
        //    consumer aborts/fails/leaves early.
        if let Err(e) = on_event.send(Event::default().handle(rid)) {
            log::error!("Failed to send handle announcement: {:?}", e);
            return;
        }

        // 4. DATA + PROGRESS while neither the consumer nor the resource
        //    lifecycle cancelled the token.
        let mut sent = 0usize;
        let mut seq = 0usize;

        while sent < total {
            if token.load(Ordering::Acquire) {
                // Resource closed (JS cancel / db-close-style teardown).
                // No `done`: the stream was cancelled, not completed.
                log::info!("Download rid {rid} cancelled — resource closed mid-stream");
                return;
            }

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

            if (seq.is_multiple_of(PROGRESS_EVERY_N_CHUNKS) || sent == total)
                && let Err(e) = on_event.send(Event::default().progress(sent as u64, total as u64))
            {
                log::error!("Failed to send progress: {:?}", e);
                return;
            }

            tokio::time::sleep(RESOURCE_DEMO_DELAY).await;
        }

        // 5. Cancel-at-the-tail race: the consumer aborted while the final
        //    chunk was in flight — treat it as cancelled (no `done`).
        if token.load(Ordering::Acquire) {
            log::info!("Download rid {rid} cancelled at the tail — no done sent");
            return;
        }

        // 6. Normal completion: the Rust side owns its lifecycle — the worker
        //    removes its own resource (which also runs `close`). The link
        //    never auto-closes on a successful stream.
        log::info!("Worker dropping own TransferHandle rid {rid} (normal completion)");
        if let Err(e) = app.resources_table().close(rid) {
            log::warn!("Failed to drop own completed resource rid {rid}: {:?}", e);
        }

        // 7. DONE: signal stream completion
        if let Err(e) = on_event.send(Event::default().event("done")) {
            log::error!("Failed to send done event: {:?}", e);
        }

        log::info!("Download rid {rid} complete: {sent} bytes in {seq} chunks");
    });

    Ok(total)
}
