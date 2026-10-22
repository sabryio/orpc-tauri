//! Duplex chat demo (`link.duplex` — rid + channel + unary = WebSockets).
//!
//! Two cooperating commands, no new transport:
//! - `chat_session` (streaming): creates the `ChatSession` resource, sends
//!   `flush()` to open the channel, announces the rid as `handle:<rid>`
//!   (the link captures it for `send` injection + `autoClose` teardown) and
//!   pumps inbound messages Rust→JS. Ends when the resource is closed
//!   (consumer `break`/abort → autoClose) — no `done` after a cancel.
//! - `chat_session_send` (unary): looks the session up by rid in the
//!   resource table and pushes the text into the session's mpsc — the
//!   JS→Rust half of the duplex. The rid rides the input's `handle` field,
//!   injected by the link from the captured announcement.

use crate::broadcast::Event;
use crate::commands::resource::HandleInput;
use crate::types::errors::AppError;
use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::sync::Arc;
use std::time::Duration;
use tauri::ipc::Channel;
use tauri::{AppHandle, Manager, Resource, ResourceId};
use tokio::sync::{mpsc, Notify};

/// Bot "typing" delay — makes the two pipes visible in the UI.
const BOT_DELAY: Duration = Duration::from_millis(400);

/// JS→Rust dispatch queue bound. Backpressure lives here: chat is bursty
/// but bounded, and a full queue makes `send` await a tick.
const SESSION_QUEUE: usize = 64;

#[derive(Debug, Serialize, Clone)]
struct ChatMessage {
    id: u64,
    /// Who appeared "on screen": `you` = JS sender echo, `rust` = the bot.
    from: String,
    text: String,
}

/// A live full-duplex session. Bodies live in the resource table; JS only
/// ever names it by rid. `close` is the single server-side termination
/// hook — the link's autoClose teardown, a manual close, or app shutdown.
pub struct ChatSession {
    room: String,
    /// JS→Rust dispatch — cloned per `chat_session_send` call.
    sender: mpsc::Sender<String>,
    cancel: Arc<Notify>,
}

impl Resource for ChatSession {
    fn name(&self) -> Cow<'_, str> {
        "ChatSession".into()
    }

    fn close(self: Arc<Self>) {
        log::info!("ChatSession #{} closed (worker notified)", self.room);
        self.cancel.notify_one();
    }
}

#[derive(Debug, Deserialize)]
pub struct ChatSessionInput {
    pub room: String,
}

/// Canned demo bot so the duplex pipes are visible. Deterministic and
/// local — no external service behind it.
fn bot_reply(text: &str) -> String {
    let t = text.trim().to_lowercase();
    if t == "ping" {
        "pong — round-trip over mpsc + channel, one rid".into()
    } else if t.is_empty() {
        "(empty message — send rejected client-side, how did you get here?)".into()
    } else if t.ends_with('?') {
        "good question — this answer came through the duplex channel".into()
    } else if t.contains("rid") {
        "the rid never touched your client code — the link injects it".into()
    } else {
        "ack".into()
    }
}

#[tauri::command]
pub async fn chat_session(
    input: ChatSessionInput,
    app: AppHandle,
    on_event: Channel<Event>,
) -> Result<(), AppError> {
    let room = input.room.trim().to_string();
    if room.is_empty() {
        return Err(AppError::ValidationError("room is required".into()));
    }

    let (sender, mut receiver) = mpsc::channel::<String>(SESSION_QUEUE);
    let cancel = Arc::new(Notify::new());
    let session = ChatSession {
        room: room.clone(),
        sender,
        cancel: cancel.clone(),
    };
    let rid: ResourceId = app.resources_table().add(session);

    log::info!("chat_session: room {room:?} (rid {rid})");

    tauri::async_runtime::spawn(async move {
        // 1. FLUSH: a channel's first send must land before real frames flow.
        if let Err(e) = on_event.send(Event::default().flush()) {
            log::error!("flush send failed: {e:?}");
            return;
        }

        // 2. HANDLE ANNOUNCEMENT: exactly once — the link captures this rid
        //    for `send` injection and (autoClose) server-side teardown.
        if let Err(e) = on_event.send(Event::default().handle(rid)) {
            log::error!("handle announcement failed: {e:?}");
            return;
        }

        // 3. GREETING: the worker owns message ids (only it emits).
        let mut id = 0u64;
        let greet = ChatMessage {
            id,
            from: "rust".into(),
            text: format!(
                "joined #{room} — duplex session rid {rid} (send something!)"
            ),
        };
        id += 1;
        if let Err(e) = on_event.send(
            Event::default().event("message").data(greet),
        ) {
            log::error!("greeting send failed: {e:?}");
            return;
        }

        // 4. PUMP: Rust→JS from the channel loop; JS→Rust from the mpsc
        //    (fed by `chat_session_send` via the rid). The worker's own
        //    reply goes out the same pipe.
        loop {
            tokio::select! {
                _ = cancel.notified() => {
                    // Resource closed (consumer break/abort → autoClose).
                    // No `done`: the session was terminated, not completed.
                    log::info!("chat room {room:?} cancelled (rid {rid})");
                    return;
                }
                text = receiver.recv() => {
                    let Some(text) = text else {
                        // All senders dropped — only possible on shutdown.
                        log::info!("chat room {room:?} queue closed (rid {rid})");
                        return;
                    };

                    // Echo the user's own message first (from: "you")
                    let echo = ChatMessage { id, from: "you".into(), text: text.clone() };
                    id += 1;
                    if let Err(e) = on_event.send(Event::default().event("message").data(echo)) {
                        log::error!("echo send failed: {e:?}");
                        return;
                    }

                    tokio::select! {
                        _ = tokio::time::sleep(BOT_DELAY) => {}
                        _ = cancel.notified() => {
                            log::info!("chat room {room:?} cancelled mid-reply (rid {rid})");
                            return;
                        }
                    }

                    let reply = ChatMessage { id, from: "rust".into(), text: bot_reply(&text) };
                    id += 1;
                    if let Err(e) = on_event.send(Event::default().event("message").data(reply)) {
                        log::error!("reply send failed: {e:?}");
                        return;
                    }
                }
            }
        }
    });

    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct ChatSendInput {
    pub handle: HandleInput,
    pub text: String,
}

#[tauri::command]
pub async fn chat_session_send(
    input: ChatSendInput,
    app: AppHandle,
) -> Result<(), AppError> {
    if input.text.trim().is_empty() {
        return Err(AppError::ValidationError("text is required".into()));
    }

    let rid = input.handle.rid;
    let session = app
        .resources_table()
        .get::<ChatSession>(rid)
        .map_err(|_| AppError::NotFound(format!("chat session rid {rid}")))?;

    session
        .sender
        .send(input.text)
        .await
        .map_err(|e| AppError::internal(format!("session queue closed: {e}")))
}
