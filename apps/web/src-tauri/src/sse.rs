use serde::Serialize;
use std::time::Duration;

/// Server-Sent Event builder, matching Axum's SSE Event pattern exactly.
///
/// This allows seamless migration from Tauri to Axum by using the same API:
/// ```rust
/// Event::default()
///     .event("message")
///     .id("123")
///     .retry(Duration::from_secs(5))
///     .data(payload)
/// ```
#[derive(Debug, Default, Clone, Serialize)]
pub struct Event {
    /// Optional event name (maps to `event:` field in SSE)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub event: Option<String>,

    /// Optional event ID (maps to `id:` field in SSE)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,

    /// Optional retry duration in milliseconds (maps to `retry:` field in SSE)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry: Option<u64>,

    /// Optional comment (maps to `:` field in SSE)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub comment: Option<String>,

    /// Event data payload (maps to `data:` field in SSE)
    /// Stored as JSON Value for flexibility
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

impl Event {
    /// Set the event name field (`event:<event-name>`)
    ///
    /// This corresponds to the `type` parameter in `addEventListener` on an EventSource.
    /// For example, `.event("update")` corresponds to `.addEventListener("update", ...)`.
    pub fn event<S: Into<String>>(mut self, event: S) -> Self {
        self.event = Some(event.into());
        self
    }

    /// Set the event's identifier field (`id:<identifier>`)
    ///
    /// This corresponds to MessageEvent's `lastEventId` field.
    pub fn id<S: Into<String>>(mut self, id: S) -> Self {
        self.id = Some(id.into());
        self
    }

    /// Set the event's retry timeout field (`retry: <timeout>`)
    ///
    /// This sets how long clients will wait before reconnecting if disconnected.
    pub fn retry(mut self, duration: Duration) -> Self {
        self.retry = Some(duration.as_millis() as u64);
        self
    }

    /// Set the event's comment field (`:<comment-text>`)
    ///
    /// This field is ignored by most SSE clients but useful for keep-alive.
    pub fn comment<S: Into<String>>(mut self, comment: S) -> Self {
        self.comment = Some(comment.into());
        self
    }

    /// Set the event's data field (`data: <content>`)
    ///
    /// This corresponds to MessageEvent's data field.
    /// Accepts any type that can be serialized to JSON.
    pub fn data<T: Serialize>(mut self, data: T) -> Self {
        // Convert to serde_json::Value for consistent handling
        self.data = serde_json::to_value(data).ok();
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_event_builder() {
        let event = Event::default()
            .event("message")
            .id("123")
            .retry(Duration::from_secs(5))
            .data(json!({"msg": "hello"}));

        assert_eq!(event.event, Some("message".to_string()));
        assert_eq!(event.id, Some("123".to_string()));
        assert_eq!(event.retry, Some(5000));
        assert!(event.data.is_some());
    }
}
