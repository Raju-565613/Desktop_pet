use crate::achievements;
use crate::ai;
use crate::app_detect;
use crate::db::{self, Appearance, Db, PetStatus, Settings, SettingsUpdate};
use crate::events;
use crate::food::{self, FoodCatalogEntry};
use crate::memory;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

fn broadcast(app: &AppHandle, status: &PetStatus) {
    let _ = app.emit("pet-status-updated", status);
}

#[tauri::command]
pub fn get_pet_status(db: State<Db>) -> PetStatus {
    let conn = db.0.lock().expect("db mutex poisoned");
    db::get_status(&conn)
}

#[tauri::command]
pub fn get_food_catalog() -> Vec<FoodCatalogEntry> {
    food::catalog()
}

#[tauri::command]
pub fn feed_pet(db: State<Db>, app: AppHandle, food_id: String) -> Result<PetStatus, String> {
    let status = {
        let conn = db.0.lock().expect("db mutex poisoned");
        food::feed(&conn, &food_id)?
    };
    broadcast(&app, &status);
    Ok(status)
}

#[derive(Debug, Serialize)]
pub struct InteractResult {
    pub status: PetStatus,
    pub earned_food: Option<FoodCatalogEntry>,
}

/// Called when the user clicks/pets the pet on the overlay. Always
/// succeeds — whether bond/food actually increase depends on the
/// cooldowns handled inside db::pet_interact_bond / food::earn_food.
#[tauri::command]
pub fn pet_interact(db: State<Db>, app: AppHandle) -> InteractResult {
    let (earned_food, status) = {
        let conn = db.0.lock().expect("db mutex poisoned");
        db::pet_interact_bond(&conn);
        food::earn_food(&conn, "pet")
    };
    broadcast(&app, &status);
    InteractResult { status, earned_food }
}

#[tauri::command]
pub fn play_with_pet(db: State<Db>, app: AppHandle) -> InteractResult {
    let (earned_food, status) = {
        let conn = db.0.lock().expect("db mutex poisoned");
        food::play(&conn)
    };
    broadcast(&app, &status);
    InteractResult { status, earned_food }
}

#[derive(Debug, Serialize)]
pub struct MinigameResult {
    pub status: PetStatus,
    pub earned_food: FoodCatalogEntry,
}

/// Called once when a break mini-game (Phase 6) finishes successfully.
#[tauri::command]
pub fn minigame_complete(db: State<Db>, app: AppHandle) -> MinigameResult {
    let (earned_food, status) = {
        let conn = db.0.lock().expect("db mutex poisoned");
        food::minigame_reward(&conn)
    };
    broadcast(&app, &status);
    MinigameResult { status, earned_food }
}

/// Called repeatedly by the overlay while its local behavior engine has
/// chosen the "sleep" activity, so energy actually recovers while the pet
/// looks like it's resting.
#[tauri::command]
pub fn rest_tick(db: State<Db>, app: AppHandle) -> PetStatus {
    let status = {
        let conn = db.0.lock().expect("db mutex poisoned");
        db::rest_tick(&conn, 3.0)
    };
    broadcast(&app, &status);
    status
}

#[tauri::command]
pub fn get_appearance(db: State<Db>) -> Appearance {
    let conn = db.0.lock().expect("db mutex poisoned");
    db::get_appearance(&conn)
}

#[tauri::command]
pub fn update_appearance(db: State<Db>, app: AppHandle, appearance: Appearance) -> PetStatus {
    let status = {
        let conn = db.0.lock().expect("db mutex poisoned");
        db::update_appearance(&conn, &appearance)
    };
    broadcast(&app, &status);
    status
}

#[tauri::command]
pub fn get_settings(db: State<Db>) -> Settings {
    let conn = db.0.lock().expect("db mutex poisoned");
    db::get_settings(&conn)
}

#[tauri::command]
pub fn update_settings(db: State<Db>, update: SettingsUpdate) -> Settings {
    let conn = db.0.lock().expect("db mutex poisoned");
    db::update_settings(&conn, &update)
}

/// Flips Deep Work Mode from a frontend-triggered call (e.g. a "Deep Work"
/// button inside the Pet House), mirroring what the tray menu item does in
/// main.rs. The overlay's own show/hide in response lives in main.rs
/// (tray) — this command's job is just persisting the flag and telling
/// every window so they can react (e.g. the overlay hiding itself, the
/// house showing a "Deep Work active" banner).
#[tauri::command]
pub fn toggle_deep_work(db: State<Db>, app: AppHandle) -> PetStatus {
    let status = {
        let conn = db.0.lock().expect("db mutex poisoned");
        let current = db::get_status(&conn).deep_work_active;
        db::set_deep_work(&conn, !current)
    };
    if let Some(w) = app.get_webview_window("overlay") {
        let _ = w.set_visible(!status.deep_work_active);
    }
    broadcast(&app, &status);
    status
}

#[tauri::command]
pub fn get_memory_stats(db: State<Db>) -> Vec<memory::MemoryStat> {
    let conn = db.0.lock().expect("db mutex poisoned");
    memory::get_stats(&conn)
}

#[tauri::command]
pub fn get_achievements(db: State<Db>) -> Vec<achievements::AchievementStatus> {
    let conn = db.0.lock().expect("db mutex poisoned");
    achievements::evaluate_and_sync(&conn)
}

#[tauri::command]
pub fn get_daily_event() -> events::DailyEvent {
    events::today()
}

/// Returns "disabled" without touching any OS API at all if the user
/// hasn't opted in — the privacy toggle is checked here, not just trusted
/// to be respected by the caller.
#[tauri::command]
pub fn get_active_app_category(db: State<Db>) -> String {
    let enabled = {
        let conn = db.0.lock().expect("db mutex poisoned");
        db::get_settings(&conn).detect_active_app
    };
    if !enabled {
        return "disabled".to_string();
    }
    app_detect::active_app_category()
}

/// Explicitly async: the AI branch makes a real network request. Falls
/// back to the local canned reply on any error (missing key, network
/// failure, API error) rather than surfacing a broken chat experience —
/// Section 43's "AI is optional" should mean the feature degrades
/// gracefully, not that a bad connection breaks the pet's ability to talk
/// at all.
#[tauri::command]
pub async fn chat_with_pet(db: State<'_, Db>, app: AppHandle, message: String) -> Result<ai::ChatReply, String> {
    let (status, settings, api_key) = {
        let conn = db.0.lock().expect("db mutex poisoned");
        let status = db::get_status(&conn);
        let settings = db::get_settings(&conn);
        let api_key = db::get_ai_api_key(&conn);
        food::earn_food(&conn, "chat");
        (status, settings, api_key)
    };

    let reply = if settings.ai_enabled {
        if let Some(key) = api_key {
            match ai::call_anthropic(&key, &status.mood, &status.traits, &message).await {
                Ok(text) => ai::ChatReply { reply: text, used_ai: true },
                Err(_) => ai::ChatReply {
                    reply: ai::canned_reply(&status.mood, &status.traits, &message),
                    used_ai: false,
                },
            }
        } else {
            ai::ChatReply {
                reply: ai::canned_reply(&status.mood, &status.traits, &message),
                used_ai: false,
            }
        }
    } else {
        ai::ChatReply {
            reply: ai::canned_reply(&status.mood, &status.traits, &message),
            used_ai: false,
        }
    };

    let refreshed = {
        let conn = db.0.lock().expect("db mutex poisoned");
        db::get_status(&conn)
    };
    broadcast(&app, &refreshed);

    Ok(reply)
}
