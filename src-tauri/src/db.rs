use crate::mood;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;

/// Wraps the single SQLite connection behind a mutex so it can be shared
/// safely across Tauri commands and the background decay task. A single
/// connection behind a mutex is deliberately the simplest thing that works
/// for this write volume; a pool (r2d2/deadpool) is easy to swap in later
/// if the data model (Section 48) grows enough to need it.
pub struct Db(pub Mutex<Connection>);

/// Section 10's ten personality traits, each 0-100 and static today (Phase 5's
/// Pet Creator is what eventually lets a user set these at creation time).
/// These bias both the frontend behavior engine (PersonalityWeights logic in
/// PetStateMachine.ts) and the backend mood engine (mood.rs) from the same
/// numbers, so a mischievous pet is mischievous everywhere, not just in its
/// animations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersonalityTraits {
    pub playfulness: i64,
    pub curiosity: i64,
    pub affection: i64,
    pub mischief: i64,
    pub energy: i64, // trait: general energy level, distinct from the dynamic `energy` resource
    pub shyness: i64,
    pub laziness: i64,
    pub friendliness: i64,
    pub independence: i64,
    pub bravery: i64,
}

/// A deliberately small slice of Section 5-9's full modular character
/// system: enough independently-customizable pieces (ear shape, tail
/// style, two colors, one accessory) to make combinations feel personal
/// and to prove the renderer is actually parameterized rather than
/// hardcoded — not the full body/hair/clothing layering system. See
/// README's "known gaps" for what's deliberately deferred and why.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Appearance {
    pub body_color: String,
    pub ear_color: String,
    /// "cat" | "bunny" | "bear" | "fox"
    pub ear_style: String,
    /// "cat" | "fox" | "bunny" | "none"
    pub tail_style: String,
    /// "none" | "bow" | "glasses"
    pub accessory: String,
    /// "none" | "bow_tie" | "hoodie" | "scarf" — a small clothing layer
    /// drawn over the body. Not the full layered outfit-designer system
    /// (Section 33: multiple garments, saved outfits per mood) — see
    /// README for why that's scoped down to one layer/one slot.
    pub outfit: String,
    pub outfit_color: String,
}

/// Phase 9 settings: accessibility, privacy, and the break/Deep Work
/// controls from Phase 6. `ai_api_key_set` is a boolean, not the key
/// itself — the raw key is written but never read back out to the
/// frontend, so a compromised renderer process can't exfiltrate it via
/// `get_settings`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub reduce_motion: bool,
    pub muted: bool,
    pub high_contrast: bool,
    pub roaming_enabled: bool,
    pub break_reminders_enabled: bool,
    pub break_interval_minutes: i64,
    /// Section 28/29: off by default, and — see README — detection itself
    /// isn't implemented in this pass. The toggle exists so the *privacy
    /// posture* (opt-in, visible, explained) is in place before the
    /// feature is, not after.
    pub detect_active_app: bool,
    pub ai_enabled: bool,
    pub ai_api_key_set: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PetStatus {
    pub name: String,
    /// 0.0 - 100.0, decays over time, raised by feeding.
    pub hunger: f64,
    /// 0.0 - 100.0, decays over time, raised by feeding/resting.
    pub energy: f64,
    /// food id -> count on hand, e.g. {"basic": 3, "cookie": 1}
    pub food_inventory: HashMap<String, i64>,
    pub bond: i64,
    /// Derived fresh on every read from hunger/energy/traits — see mood.rs.
    pub mood: String,
    pub traits: PersonalityTraits,
    pub appearance: Appearance,
    pub deep_work_active: bool,
    /// The interaction kind (e.g. "play", "pet", "chat") with the highest
    /// recorded count in `memory_stats`, or None before any interaction has
    /// happened. See memory.rs.
    pub favorite_activity: Option<String>,
}

/// Columns added on top of the Phase 2 `pets` table, across Phases 3-9.
/// SQLite's `ALTER TABLE ADD COLUMN` doesn't support `IF NOT EXISTS`, so
/// `migrate()` below checks `PRAGMA table_info` itself and only adds what's
/// missing — this keeps upgrading an existing database non-destructive
/// instead of requiring a fresh DB file on every phase.
///
/// Storing all of this on the single `pets` row (rather than normalizing
/// settings/appearance into their own tables) is a deliberate simplification
/// that only holds up because the app manages exactly one pet and one user
/// today — Phase 30 (multi-pet) is the point where this needs to become a
/// real foreign-key relationship instead.
const MIGRATION_COLUMNS: &[(&str, &str)] = &[
    // Phase 3: personality + dynamic energy
    ("trait_playfulness", "INTEGER NOT NULL DEFAULT 70"),
    ("trait_curiosity", "INTEGER NOT NULL DEFAULT 60"),
    ("trait_affection", "INTEGER NOT NULL DEFAULT 75"),
    ("trait_mischief", "INTEGER NOT NULL DEFAULT 20"),
    ("trait_energy", "INTEGER NOT NULL DEFAULT 65"),
    ("trait_shyness", "INTEGER NOT NULL DEFAULT 20"),
    ("trait_laziness", "INTEGER NOT NULL DEFAULT 25"),
    ("trait_friendliness", "INTEGER NOT NULL DEFAULT 80"),
    ("trait_independence", "INTEGER NOT NULL DEFAULT 40"),
    ("trait_bravery", "INTEGER NOT NULL DEFAULT 55"),
    ("energy", "REAL NOT NULL DEFAULT 80"),
    ("last_pet_interaction_at", "INTEGER NOT NULL DEFAULT 0"),
    // Phase 5: appearance
    ("body_color", "TEXT NOT NULL DEFAULT '#f6b8c4'"),
    ("ear_color", "TEXT NOT NULL DEFAULT '#f191a5'"),
    ("ear_style", "TEXT NOT NULL DEFAULT 'cat'"),
    ("tail_style", "TEXT NOT NULL DEFAULT 'cat'"),
    ("accessory", "TEXT NOT NULL DEFAULT 'none'"),
    ("outfit", "TEXT NOT NULL DEFAULT 'none'"),
    ("outfit_color", "TEXT NOT NULL DEFAULT '#e0577a'"),
    ("appearance_update_count", "INTEGER NOT NULL DEFAULT 0"),
    // Phase 6: break / Deep Work
    ("break_interval_minutes", "INTEGER NOT NULL DEFAULT 30"),
    ("break_reminders_enabled", "INTEGER NOT NULL DEFAULT 1"),
    ("deep_work_active", "INTEGER NOT NULL DEFAULT 0"),
    ("deep_work_used", "INTEGER NOT NULL DEFAULT 0"),
    // Phase 7: privacy-gated app-awareness toggle (see Settings doc comment)
    ("detect_active_app", "INTEGER NOT NULL DEFAULT 0"),
    // Phase 8: optional AI
    ("ai_enabled", "INTEGER NOT NULL DEFAULT 0"),
    ("ai_api_key", "TEXT NOT NULL DEFAULT ''"),
    // Phase 9: accessibility / polish
    ("reduce_motion", "INTEGER NOT NULL DEFAULT 0"),
    ("muted", "INTEGER NOT NULL DEFAULT 0"),
    ("high_contrast", "INTEGER NOT NULL DEFAULT 0"),
    ("roaming_enabled", "INTEGER NOT NULL DEFAULT 1"),
];

fn migrate(conn: &Connection) {
    let mut existing = std::collections::HashSet::new();
    {
        let mut stmt = conn.prepare("PRAGMA table_info(pets)").unwrap();
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(1))
            .expect("failed to read table_info");
        for name in rows.flatten() {
            existing.insert(name);
        }
    }

    for (name, decl) in MIGRATION_COLUMNS {
        if !existing.contains(*name) {
            let sql = format!("ALTER TABLE pets ADD COLUMN {name} {decl}");
            conn.execute(&sql, [])
                .unwrap_or_else(|e| panic!("failed to add column {name}: {e}"));
        }
    }

    conn.execute_batch(
        "
        -- Phase 4: multiple food types on hand, replacing the old single
        -- food_count column (still physically present on `pets` but unused
        -- from Phase 4 onward — dropping columns needs a newer SQLite than
        -- it's worth requiring here).
        CREATE TABLE IF NOT EXISTS food_inventory (
            food_id TEXT PRIMARY KEY,
            count INTEGER NOT NULL DEFAULT 0
        );

        -- Phase 4: a short log of *rewarded* interactions, used to enforce
        -- Section 14/36's diminishing-returns rule (\"pet once +1, pet
        -- again +1, pet repeatedly +0\"). Only rewarded events are logged,
        -- so this table stays small; old rows aren't queried once they
        -- fall outside the reward window.
        CREATE TABLE IF NOT EXISTS interaction_rewards (
            kind TEXT NOT NULL,
            at INTEGER NOT NULL
        );

        -- Phase 7: lightweight memory of what the user actually engages
        -- with, used to compute a \"favorite activity\" that nudges the
        -- behavior engine (Section 12).
        CREATE TABLE IF NOT EXISTS memory_stats (
            kind TEXT PRIMARY KEY,
            count INTEGER NOT NULL DEFAULT 0
        );

        -- Section 37: achievements. `unlocked_at` is 0 until the criteria
        -- in achievements.rs are met, at which point it's set once and
        -- never cleared.
        CREATE TABLE IF NOT EXISTS achievements (
            id TEXT PRIMARY KEY,
            unlocked_at INTEGER NOT NULL DEFAULT 0
        );
        ",
    )
    .expect("failed to run Phase 4/7 table migrations");

    // Seed starter food once, the first time food_inventory is empty —
    // covers both a brand-new database and an upgrade from a pre-Phase-4
    // database that only had the old single `food_count` column.
    let food_row_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM food_inventory", [], |r| r.get(0))
        .unwrap_or(0);
    if food_row_count == 0 {
        conn.execute(
            "INSERT INTO food_inventory (food_id, count) VALUES ('basic', 5)",
            [],
        )
        .expect("failed to seed starter food inventory");
    }
}

/// Opens (creating if necessary) the SQLite file in the app's data directory
/// and runs migrations. Per Section 3 of the spec, the app must work fully
/// offline, so everything here is local-only — no network calls (the one
/// exception, the optional AI chat in ai.rs, is off by default and never
/// touches this file).
pub fn init(app_data_dir: &std::path::Path) -> Connection {
    std::fs::create_dir_all(app_data_dir).expect("failed to create app data dir");
    let db_path = app_data_dir.join("desktop-pet.sqlite3");
    let conn = Connection::open(db_path).expect("failed to open sqlite db");

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS pets (
            id INTEGER PRIMARY KEY CHECK (id = 1), -- single pet for now; Phase 30 (multi-pet) widens this
            name TEXT NOT NULL,
            hunger REAL NOT NULL,
            food_count INTEGER NOT NULL, -- superseded by food_inventory from Phase 4 on; kept for schema stability
            bond INTEGER NOT NULL
        );
        ",
    )
    .expect("failed to run base migration");

    migrate(&conn);

    conn.execute(
        "INSERT OR IGNORE INTO pets (id, name, hunger, food_count, bond) VALUES (1, 'Mochi', 70.0, 5, 0)",
        [],
    )
    .expect("failed to seed default pet");

    conn
}

pub fn get_status(conn: &Connection) -> PetStatus {
    let (name, hunger, energy, bond, traits, appearance, deep_work_active) = conn
        .query_row(
            "SELECT name, hunger, energy, bond,
                    trait_playfulness, trait_curiosity, trait_affection, trait_mischief,
                    trait_energy, trait_shyness, trait_laziness, trait_friendliness,
                    trait_independence, trait_bravery,
                    body_color, ear_color, ear_style, tail_style, accessory, outfit, outfit_color,
                    deep_work_active
             FROM pets WHERE id = 1",
            [],
            |row| {
                let traits = PersonalityTraits {
                    playfulness: row.get(4)?,
                    curiosity: row.get(5)?,
                    affection: row.get(6)?,
                    mischief: row.get(7)?,
                    energy: row.get(8)?,
                    shyness: row.get(9)?,
                    laziness: row.get(10)?,
                    friendliness: row.get(11)?,
                    independence: row.get(12)?,
                    bravery: row.get(13)?,
                };
                let appearance = Appearance {
                    body_color: row.get(14)?,
                    ear_color: row.get(15)?,
                    ear_style: row.get(16)?,
                    tail_style: row.get(17)?,
                    accessory: row.get(18)?,
                    outfit: row.get(19)?,
                    outfit_color: row.get(20)?,
                };
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, f64>(1)?,
                    row.get::<_, f64>(2)?,
                    row.get::<_, i64>(3)?,
                    traits,
                    appearance,
                    row.get::<_, i64>(21)? != 0,
                ))
            },
        )
        .expect("pet row must exist after seeding in init()");

    let mood = mood::compute_mood(hunger, energy, &traits);

    let mut food_inventory = HashMap::new();
    {
        let mut stmt = conn
            .prepare("SELECT food_id, count FROM food_inventory WHERE count > 0")
            .unwrap();
        let rows = stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))
            .unwrap();
        for r in rows.flatten() {
            food_inventory.insert(r.0, r.1);
        }
    }

    let favorite_activity: Option<String> = conn
        .query_row(
            "SELECT kind FROM memory_stats WHERE count > 0 ORDER BY count DESC LIMIT 1",
            [],
            |row| row.get(0),
        )
        .ok();

    PetStatus {
        name,
        hunger,
        energy,
        food_inventory,
        bond,
        mood,
        traits,
        appearance,
        deep_work_active,
        favorite_activity,
    }
}

/// Called on a timer by the background task in main.rs to slowly lower
/// hunger and energy over time. Per Section 16, hunger (and by the same
/// principle, energy) must never punish the user or let the pet "die" —
/// both floor at 0, full stop, no further consequence. Energy drains more
/// slowly than hunger so "sleepy" doesn't dominate every session.
pub fn decay(conn: &Connection, hunger_amount: f64, energy_amount: f64) -> PetStatus {
    let status = get_status(conn);
    let new_hunger = (status.hunger - hunger_amount).max(0.0);
    let new_energy = (status.energy - energy_amount).max(0.0);
    conn.execute(
        "UPDATE pets SET hunger = ?1, energy = ?2 WHERE id = 1",
        rusqlite::params![new_hunger, new_energy],
    )
    .expect("failed to update hunger/energy during decay tick");
    get_status(conn)
}

/// Called repeatedly by the frontend while the local behavior engine has
/// chosen the "sleep" activity, so resting actually restores the energy
/// that sleeping is supposed to represent. The visual decision to sleep
/// stays client-side (PetStateMachine.ts); this just lets that decision
/// have a real, persisted effect.
pub fn rest_tick(conn: &Connection, amount: f64) -> PetStatus {
    let status = get_status(conn);
    let new_energy = (status.energy + amount).min(100.0);
    conn.execute(
        "UPDATE pets SET energy = ?1 WHERE id = 1",
        rusqlite::params![new_energy],
    )
    .expect("failed to update energy during rest tick");
    get_status(conn)
}

/// A click/pet on the overlay pet. Bond only increases if enough time has
/// passed since the last rewarded pet — Section 13's affection-building
/// loop, kept separate from Section 14's food-earning loop (see food.rs's
/// `earn_food`, which `commands::pet_interact` also calls).
pub fn pet_interact_bond(conn: &Connection) -> PetStatus {
    const COOLDOWN_SECS: i64 = 30;
    let status = get_status(conn);
    let last: i64 = conn
        .query_row(
            "SELECT last_pet_interaction_at FROM pets WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let now = crate::util::now_unix();
    if now - last >= COOLDOWN_SECS {
        conn.execute(
            "UPDATE pets SET bond = ?1, last_pet_interaction_at = ?2 WHERE id = 1",
            rusqlite::params![status.bond + 1, now],
        )
        .expect("failed to record pet interaction");
    }

    get_status(conn)
}

/// Raises bond directly (used by feeding, playing, chatting — anything
/// that isn't the plain "click the overlay pet" affection loop above,
/// which has its own cooldown).
pub fn add_bond(conn: &Connection, amount: i64) {
    conn.execute(
        "UPDATE pets SET bond = bond + ?1 WHERE id = 1",
        rusqlite::params![amount],
    )
    .expect("failed to update bond");
}

pub fn add_hunger_energy(conn: &Connection, hunger_delta: f64, energy_delta: f64) {
    let status = get_status(conn);
    let new_hunger = (status.hunger + hunger_delta).clamp(0.0, 100.0);
    let new_energy = (status.energy + energy_delta).clamp(0.0, 100.0);
    conn.execute(
        "UPDATE pets SET hunger = ?1, energy = ?2 WHERE id = 1",
        rusqlite::params![new_hunger, new_energy],
    )
    .expect("failed to adjust hunger/energy");
}

pub fn set_deep_work(conn: &Connection, active: bool) -> PetStatus {
    conn.execute(
        "UPDATE pets SET deep_work_active = ?1 WHERE id = 1",
        rusqlite::params![active as i64],
    )
    .expect("failed to update deep_work_active");
    if active {
        // Sticky flag for the "used Deep Work at least once" achievement —
        // deliberately never reset when Deep Work ends.
        conn.execute("UPDATE pets SET deep_work_used = 1 WHERE id = 1", [])
            .expect("failed to record deep_work_used");
    }
    get_status(conn)
}

pub fn get_appearance(conn: &Connection) -> Appearance {
    get_status(conn).appearance
}

pub fn update_appearance(conn: &Connection, appearance: &Appearance) -> PetStatus {
    conn.execute(
        "UPDATE pets SET body_color = ?1, ear_color = ?2, ear_style = ?3, tail_style = ?4,
                accessory = ?5, outfit = ?6, outfit_color = ?7,
                appearance_update_count = appearance_update_count + 1
         WHERE id = 1",
        rusqlite::params![
            appearance.body_color,
            appearance.ear_color,
            appearance.ear_style,
            appearance.tail_style,
            appearance.accessory,
            appearance.outfit,
            appearance.outfit_color
        ],
    )
    .expect("failed to update appearance");
    get_status(conn)
}

pub fn get_settings(conn: &Connection) -> Settings {
    conn.query_row(
        "SELECT reduce_motion, muted, high_contrast, roaming_enabled, break_reminders_enabled,
                break_interval_minutes, detect_active_app, ai_enabled, ai_api_key
         FROM pets WHERE id = 1",
        [],
        |row| {
            let ai_api_key: String = row.get(8)?;
            Ok(Settings {
                reduce_motion: row.get::<_, i64>(0)? != 0,
                muted: row.get::<_, i64>(1)? != 0,
                high_contrast: row.get::<_, i64>(2)? != 0,
                roaming_enabled: row.get::<_, i64>(3)? != 0,
                break_reminders_enabled: row.get::<_, i64>(4)? != 0,
                break_interval_minutes: row.get(5)?,
                detect_active_app: row.get::<_, i64>(6)? != 0,
                ai_enabled: row.get::<_, i64>(7)? != 0,
                ai_api_key_set: !ai_api_key.trim().is_empty(),
            })
        },
    )
    .expect("pet row must exist")
}

/// Partial update — every field is optional so the frontend can send just
/// the toggle the user changed. `ai_api_key: Some("")` explicitly clears a
/// stored key; `None` leaves whatever's already saved untouched.
#[derive(Debug, Deserialize)]
pub struct SettingsUpdate {
    pub reduce_motion: Option<bool>,
    pub muted: Option<bool>,
    pub high_contrast: Option<bool>,
    pub roaming_enabled: Option<bool>,
    pub break_reminders_enabled: Option<bool>,
    pub break_interval_minutes: Option<i64>,
    pub detect_active_app: Option<bool>,
    pub ai_enabled: Option<bool>,
    pub ai_api_key: Option<String>,
}

pub fn update_settings(conn: &Connection, update: &SettingsUpdate) -> Settings {
    let current = get_settings(conn);
    conn.execute(
        "UPDATE pets SET
            reduce_motion = ?1, muted = ?2, high_contrast = ?3, roaming_enabled = ?4,
            break_reminders_enabled = ?5, break_interval_minutes = ?6, detect_active_app = ?7,
            ai_enabled = ?8
         WHERE id = 1",
        rusqlite::params![
            update.reduce_motion.unwrap_or(current.reduce_motion) as i64,
            update.muted.unwrap_or(current.muted) as i64,
            update.high_contrast.unwrap_or(current.high_contrast) as i64,
            update.roaming_enabled.unwrap_or(current.roaming_enabled) as i64,
            update
                .break_reminders_enabled
                .unwrap_or(current.break_reminders_enabled) as i64,
            update
                .break_interval_minutes
                .unwrap_or(current.break_interval_minutes),
            update.detect_active_app.unwrap_or(current.detect_active_app) as i64,
            update.ai_enabled.unwrap_or(current.ai_enabled) as i64,
        ],
    )
    .expect("failed to update settings");

    if let Some(key) = &update.ai_api_key {
        conn.execute(
            "UPDATE pets SET ai_api_key = ?1 WHERE id = 1",
            rusqlite::params![key],
        )
        .expect("failed to update ai api key");
    }

    get_settings(conn)
}

/// Only used internally by ai.rs when it actually needs to make a request —
/// never exposed to the frontend (see `Settings.ai_api_key_set` above).
pub fn get_ai_api_key(conn: &Connection) -> Option<String> {
    let key: String = conn
        .query_row("SELECT ai_api_key FROM pets WHERE id = 1", [], |r| r.get(0))
        .unwrap_or_default();
    if key.trim().is_empty() {
        None
    } else {
        Some(key)
    }
}

/// Raw signals achievements.rs checks its criteria against. Kept as one
/// small query here rather than scattering ad-hoc SELECTs through
/// achievements.rs, since these are all plain `pets`-row columns.
pub struct AchievementSignals {
    pub appearance_update_count: i64,
    pub deep_work_used: bool,
}

pub fn get_achievement_signals(conn: &Connection) -> AchievementSignals {
    conn.query_row(
        "SELECT appearance_update_count, deep_work_used FROM pets WHERE id = 1",
        [],
        |row| {
            Ok(AchievementSignals {
                appearance_update_count: row.get(0)?,
                deep_work_used: row.get::<_, i64>(1)? != 0,
            })
        },
    )
    .expect("pet row must exist")
}
