use serde::{Serialize, Serializer};
use serde_json::json;
use thiserror::Error;

/// Application error types that map to ORPC contract errors
#[derive(Debug, Clone, Error)]
pub enum AppError {
    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Internal error: {msg}")]
    Internal { msg: String },

    #[error("Validation error: {0}")]
    ValidationError(String),
}

impl AppError {
    /// Get the error code
    pub fn code(&self) -> &str {
        match self {
            AppError::NotFound(_) => "NOT_FOUND",
            AppError::Internal { .. } => "INTERNAL",
            AppError::ValidationError(_) => "BAD_REQUEST",
        }
    }

    /// Get the error message
    pub fn message(&self) -> String {
        match self {
            AppError::NotFound(msg) => msg.clone(),
            AppError::Internal { msg } => format!("Internal error: {}", msg),
            AppError::ValidationError(msg) => format!("Validation error: {}", msg),
        }
    }

    /// Get the error data (if any)
    pub fn data(&self) -> Option<serde_json::Value> {
        match self {
            AppError::Internal { msg } => Some(json!({ "msg": msg })),
            _ => None,
        }
    }
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        use serde::ser::SerializeStruct;

        let mut state = serializer.serialize_struct("AppError", 4)?;
        state.serialize_field("defined", &true)?;
        state.serialize_field("code", self.code())?;
        state.serialize_field("message", &self.message())?;

        if let Some(data) = self.data() {
            state.serialize_field("data", &data)?;
        } else {
            state.skip_field("data")?;
        }

        state.end()
    }
}

// Helper constructors for convenience
impl AppError {
    pub fn not_found(message: impl Into<String>) -> Self {
        AppError::NotFound(message.into())
    }

    pub fn internal(message: impl Into<String>) -> Self {
        AppError::Internal {
            msg: message.into(),
        }
    }

    pub fn validation_error(message: impl Into<String>) -> Self {
        AppError::ValidationError(message.into())
    }
}

// Implement From for common error types for better ergonomics
impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::validation_error(format!("JSON error: {}", err))
    }
}

impl<T> From<std::sync::PoisonError<T>> for AppError {
    fn from(err: std::sync::PoisonError<T>) -> Self {
        AppError::internal(format!("Lock poisoned: {}", err))
    }
}
