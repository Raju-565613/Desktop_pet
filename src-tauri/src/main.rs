// Prevents an extra console window from popping up on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod achievements;
mod ai;
mod app_detect;
mod commands;
mod db;
mod events;
mod food;
mod memory;
mod mood;
mod util;

use db::Db;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

/// How often the background task lowers hunger/energy, and by how much per
/// tick. At these values a full 100 -> 0 hunger drift takes ~10 minutes of
/// real time, fast enough to see and test the UI without waiting all day.
/// Energy drains at half the rate hunger does so "sleepy" doesn't dominate
/// every session. Section 16's real pacing (hours, not minutes) is a tuning
/// pass, not an architecture change.
const HUNGER_TICK_INTERVAL: Duration = Duration::from_secs(20);
const HUNGER_TICK_AMOUNT: f64 = 1.0;
const ENERGY_TICK_AMOUNT: f64 = 0.5;

/// Shared helper: walks the pet "home" and hides the overlay, or brings it
/// back. Used by both the tray menu item and the frontend-triggered
/// `commands::toggle_deep_work`, so there's exactly one place that decides
/// what Deep Work actually *does* (Section 23).
fn set_deep_work(app: &tauri::AppHandle, active: bool) {
    let status = {
        let db_state = app.state::<Db>();
        let conn = db_state.0.lock().expect("db mutex poisoned");
        db::set_deep_work(&conn, active)
    };
    if let Some(w) = app.get_webview_window("overlay") {
        let _ = w.set_visible(!active);
    }
    let _ = app.emit("pet-status-updated", &status);
}

fn main() {
    tauri::Builder::default()
        // Section 23's configurable Deep Work shortcut, hardcoded to
        // Ctrl+Alt+P for this pass (see README — making it user-configurable
        // needs re-registering on change, which is straightforward but
        // deferred). The handler only checks the event's Pressed state, not
        // which shortcut fired, since exactly one shortcut is ever
        // registered — avoids depending on this plugin's exact
        // Shortcut-matching API, which I have no way to verify here.
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        let currently_active = {
                            let db_state = app.state::<Db>();
                            let conn = db_state.0.lock().expect("db mutex poisoned");
                            db::get_status(&conn).deep_work_active
                        };
                        set_deep_work(app, !currently_active);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::get_pet_status,
            commands::get_food_catalog,
            commands::feed_pet,
            commands::pet_interact,
            commands::play_with_pet,
            commands::minigame_complete,
            commands::rest_tick,
            commands::get_appearance,
            commands::update_appearance,
            commands::get_settings,
            commands::update_settings,
            commands::toggle_deep_work,
            commands::get_memory_stats,
            commands::chat_with_pet,
            commands::get_achievements,
            commands::get_daily_event,
            commands::get_active_app_category,
        ])
        .setup(|app| {
            // --- Persistence -------------------------------------------
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("could not resolve app data directory");
            let conn = db::init(&app_data_dir);
            app.manage(Db(Mutex::new(conn)));

            // --- Overlay window: stretch to the real screen -------------
            let overlay = app
                .get_webview_window("overlay")
                .expect("overlay window must exist — check tauri.conf.json");
            if let Ok(Some(monitor)) = overlay.primary_monitor() {
                let size = monitor.size();
                let _ = overlay.set_size(tauri::PhysicalSize::new(size.width, size.height));
                let _ = overlay.set_position(tauri::PhysicalPosition::new(0, 0));
            }
            let _ = overlay.set_ignore_cursor_events(true);

            // Respect a Deep Work session that was still active the last
            // time the app closed, rather than always starting visible.
            {
                let db_state = app.state::<Db>();
                let conn = db_state.0.lock().expect("db mutex poisoned");
                if db::get_status(&conn).deep_work_active {
                    let _ = overlay.set_visible(false);
                }
            }

            // --- Pet House window ----------------------------------------
            // Declared hidden in tauri.conf.json; the tray menu just shows/
            // focuses it rather than constructing it on demand, so it never
            // has to be rebuilt (and loses its animation/DOM state) between
            // opens in the same session.
            let pethouse = app
                .get_webview_window("pethouse")
                .expect("pethouse window must exist — check tauri.conf.json");

            // --- Tray icon -------------------------------------------------
            let open_house = MenuItemBuilder::with_id("open_house", "Open Pet House").build(app)?;
            let deep_work = MenuItemBuilder::with_id("deep_work", "Toggle Deep Work Mode").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Exit").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .items(&[&open_house, &deep_work, &quit])
                .build()?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .tooltip("Desktop Pet")
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "quit" => app.exit(0),
                    "deep_work" => {
                        let db_state = app.state::<Db>();
                        let currently_active = {
                            let conn = db_state.0.lock().expect("db mutex poisoned");
                            db::get_status(&conn).deep_work_active
                        };
                        set_deep_work(app, !currently_active);
                    }
                    "open_house" => {
                        if let Some(w) = app.get_webview_window("pethouse") {
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            // Closing the Pet House window (the titlebar X) should hide it,
            // not destroy it — re-declaring the window every open would lose
            // any in-progress feeding/appearance-editor state.
            let pethouse_for_close = pethouse.clone();
            pethouse.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = pethouse_for_close.hide();
                }
            });

            // --- Background hunger/energy decay --------------------------
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(HUNGER_TICK_INTERVAL);
                loop {
                    interval.tick().await;
                    let status = {
                        let db_state = app_handle.state::<Db>();
                        let conn = db_state.0.lock().expect("db mutex poisoned");
                        db::decay(&conn, HUNGER_TICK_AMOUNT, ENERGY_TICK_AMOUNT)
                    };
                    let _ = app_handle.emit("pet-status-updated", &status);
                }
            });

            // --- Global Deep Work shortcut --------------------------------
            // Registered here (handler is wired above, in the plugin builder
            // itself); a failure to register (e.g. the combo is already
            // claimed by another app) is logged, not fatal — Deep Work
            // still works fine from the tray menu and Pet House button.
            {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                if let Err(e) = app.global_shortcut().register("ctrl+alt+p") {
                    eprintln!("failed to register global Deep Work shortcut: {e}");
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running desktop-pet");
}
