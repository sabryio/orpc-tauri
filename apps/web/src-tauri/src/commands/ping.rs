use serde::Deserialize;
use uuid::Uuid;

use crate::types::{errors::AppError, models::PingResponse};

/// Request-scoped client context injected by TauriLink under the reserved
/// `context` IPC key (the IPC analog of HTTP headers).
///
/// Commands opt in by declaring a `context: Option<CallCtx>` parameter —
/// commands that don't declare it are completely untouched. Add fields as
/// the app needs them; keys arrive exactly how the client sent them
/// (camelCase, mapped via `rename_all`).
#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct CallCtx {
    pub token: Option<String>,
    pub x_request_id: Option<String>,
}

#[tauri::command]
pub async fn ping(context: Option<CallCtx>) -> Result<PingResponse, AppError> {
    match &context {
        Some(ctx) => log::info!(
            "Ping command invoked (context: x_request_id={:?}, token={})",
            ctx.x_request_id,
            ctx.token.as_deref().unwrap_or("<none>")
        ),
        None => log::info!("Ping command invoked (no context)"),
    }

    Ok(PingResponse {
        id: Uuid::new_v4(),
        message: "pong".to_string(),
    })
}
