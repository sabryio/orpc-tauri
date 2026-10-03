use crate::broadcast::{AppBroadcaster, AppEvent, PlanetOperation};
use crate::types::{
    errors::AppError,
    models::{
        CreatePlanetInput, DeletePlanetInput, FindPlanetInput, ListPlanetsPaginatedInput,
        PaginatedPlanets, Planet,
    },
};
use serde_json::Value;
use std::sync::Mutex;
use tauri::State;

pub struct PlanetStore {
    planets: Mutex<Vec<Planet>>,
    next_id: Mutex<i32>,
}

impl PlanetStore {
    pub fn new() -> Self {
        let mut planets = Vec::new();
        for i in 1..=15 {
            planets.push(Planet {
                id: i,
                name: format!("Planet {}", i),
                description: Some(format!("Initial planet number {}", i)),
            });
        }
        Self {
            planets: Mutex::new(planets),
            next_id: Mutex::new(16),
        }
    }
}

#[tauri::command]
pub async fn create_planet(
    input: Value,
    store: State<'_, PlanetStore>,
    broadcaster: State<'_, AppBroadcaster>,
) -> Result<Planet, AppError> {
    let create_input: CreatePlanetInput = serde_json::from_value(input)?;

    log::info!("Creating planet: {:?}", create_input);

    let mut planets = store.planets.lock()?;
    let mut next_id = store.next_id.lock()?;

    let planet = Planet {
        id: *next_id,
        name: create_input.name.clone(),
        description: create_input.description.clone(),
    };

    *next_id += 1;
    planets.push(planet.clone());

    // Broadcast planet creation event
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let event = AppEvent::Planet {
        operation: PlanetOperation::Created,
        planet_id: Some(planet.id),
        planet_name: Some(planet.name.clone()),
        timestamp,
    };
    let _ = broadcaster.emit_event(event, timestamp.to_string());

    Ok(planet)
}

#[tauri::command]
pub async fn find_planet(input: Value, store: State<'_, PlanetStore>) -> Result<Planet, AppError> {
    let find_input: FindPlanetInput = serde_json::from_value(input)?;

    log::info!("Finding planet with id: {}", find_input.id);

    let planets = store.planets.lock()?;

    planets
        .iter()
        .find(|p| p.id == find_input.id)
        .cloned()
        .ok_or_else(|| AppError::not_found(format!("Planet {} not found", find_input.id)))
}

#[tauri::command]
pub async fn delete_planet(
    input: Value,
    store: State<'_, PlanetStore>,
    broadcaster: State<'_, AppBroadcaster>,
) -> Result<(), AppError> {
    let delete_input: DeletePlanetInput = serde_json::from_value(input)?;

    log::info!("Deleting planet with id: {}", delete_input.id);

    let mut planets = store.planets.lock()?;

    let initial_len = planets.len();

    // Find planet name before deletion for event
    let planet_name = planets
        .iter()
        .find(|p| p.id == delete_input.id)
        .map(|p| p.name.clone());

    planets.retain(|p| p.id != delete_input.id);

    if planets.len() == initial_len {
        return Err(AppError::not_found(format!(
            "Planet {} not found",
            delete_input.id
        )));
    }

    // Broadcast planet deletion event
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let event = AppEvent::Planet {
        operation: PlanetOperation::Deleted,
        planet_id: Some(delete_input.id),
        planet_name,
        timestamp,
    };
    let _ = broadcaster.emit_event(event, timestamp.to_string());

    Ok(())
}

#[tauri::command]
pub async fn list_planets(
    store: State<'_, PlanetStore>,
    broadcaster: State<'_, AppBroadcaster>,
) -> Result<Vec<Planet>, AppError> {
    log::info!("Listing all planets");

    let planets = store.planets.lock()?;
    let result = planets.clone();

    // Broadcast list event
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let event = AppEvent::Planet {
        operation: PlanetOperation::Listed,
        planet_id: None,
        planet_name: None,
        timestamp,
    };
    let _ = broadcaster.emit_event(event, timestamp.to_string());

    Ok(result)
}

#[tauri::command]
pub async fn list_planets_paginated(
    input: Value,
    store: State<'_, PlanetStore>,
) -> Result<PaginatedPlanets, AppError> {
    let paginated_input: ListPlanetsPaginatedInput = serde_json::from_value(input)?;

    log::info!("Listing planets paginated: {:?}", paginated_input);

    let planets = store.planets.lock()?;

    let offset = paginated_input.offset.unwrap_or(0) as usize;
    let limit = paginated_input.limit as usize;

    let items: Vec<Planet> = planets.iter().skip(offset).take(limit).cloned().collect();

    let next_page_param = if offset + limit < planets.len() {
        Some((offset + limit) as i32)
    } else {
        None
    };

    Ok(PaginatedPlanets {
        items,
        next_page_param,
    })
}
