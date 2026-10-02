use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Planet {
    pub id: i32,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PingResponse {
    pub id: Uuid,
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct CreatePlanetInput {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct FindPlanetInput {
    pub id: i32,
}

#[derive(Debug, Deserialize)]
pub struct DeletePlanetInput {
    pub id: i32,
}

#[derive(Debug, Deserialize)]
pub struct ListPlanetsPaginatedInput {
    pub limit: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub offset: Option<i32>,
}

#[derive(Debug, Serialize)]
pub struct PaginatedPlanets {
    pub items: Vec<Planet>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_page_param: Option<i32>,
}
