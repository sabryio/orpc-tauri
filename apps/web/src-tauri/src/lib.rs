use tauri::Manager;

mod broadcast;
mod commands;
mod types;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Initialize SSE broadcaster for app-wide events
            let broadcaster = broadcast::AppBroadcaster::new(app.handle().clone());
            app.manage(broadcaster);

            Ok(())
        })
        .manage(commands::planet::PlanetStore::new())
        .invoke_handler(tauri::generate_handler![
            commands::ping::ping,
            commands::planet::create_planet,
            commands::planet::find_planet,
            commands::planet::delete_planet,
            commands::planet::list_planets,
            commands::planet::list_planets_paginated,
            commands::stream::stream_events,
            commands::channel_stream::stream_events_channel,
            commands::file::upload_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
