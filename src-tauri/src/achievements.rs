use crate::db::{self, get_achievement_signals};
use crate::memory;
use crate::util::now_unix;
use rusqlite::{params, Connection};
use serde::Serialize;

pub struct AchievementDef {
    pub id: &'static str,
    pub title: &'static str,
    pub description: &'static str,
}

/// Section 37's list, adapted to what's actually built rather than copied
/// verbatim — "Fashion Designer: create 10 outfits" and "Little Gardener"
/// assume an outfit-saving system and a garden that don't exist in this
/// pass, so they're swapped for achievements the real Phase 4/5/6/8
/// systems can actually satisfy. "Companion: spend 7 days with your pet"
/// has no real day-tracking (no daily-login system), so it's approximated
/// as a total-interaction-count threshold — a real calendar-based version
/// would need its own `daily_visits` table, noted here rather than faked.
pub const CATALOG: &[AchievementDef] = &[
    AchievementDef { id: "first_feeding", title: "First Feeding", description: "Feed your pet for the first time." },
    AchievementDef { id: "playmate", title: "Playmate", description: "Play with your pet 10 times." },
    AchievementDef { id: "best_friends", title: "Best Friends", description: "Reach Bond Level 20." },
    AchievementDef { id: "home_designer", title: "Home Designer", description: "Customize your pet's look for the first time." },
    AchievementDef { id: "style_icon", title: "Style Icon", description: "Change your pet's appearance 5 times." },
    AchievementDef { id: "star_catcher", title: "Star Catcher", description: "Complete a Catch the Star mini-game." },
    AchievementDef { id: "deep_worker", title: "Deep Worker", description: "Use Deep Work Mode at least once." },
    AchievementDef { id: "companion", title: "Companion", description: "Interact with your pet 30 times total." },
];

#[derive(Debug, Clone, Serialize)]
pub struct AchievementStatus {
    pub id: String,
    pub title: String,
    pub description: String,
    pub unlocked: bool,
    pub unlocked_at: Option<i64>,
}

fn count_for(stats: &[memory::MemoryStat], kind: &str) -> i64 {
    stats.iter().find(|s| s.kind == kind).map(|s| s.count).unwrap_or(0)
}

/// Checks every achievement's criteria against current state and unlocks
/// (persists) any newly-met ones, then returns the full list with
/// unlocked/unlocked_at populated. Cheap enough to call on every read
/// (a handful of small indexed queries) rather than needing its own
/// background job.
pub fn evaluate_and_sync(conn: &Connection) -> Vec<AchievementStatus> {
    let status = db::get_status(conn);
    let stats = memory::get_stats(conn);
    let signals = get_achievement_signals(conn);

    let feed_count = count_for(&stats, "feed");
    let play_count = count_for(&stats, "play");
    let minigame_count = count_for(&stats, "minigame");
    let total_interactions: i64 = stats.iter().map(|s| s.count).sum();

    let met: std::collections::HashMap<&str, bool> = [
        ("first_feeding", feed_count >= 1),
        ("playmate", play_count >= 10),
        ("best_friends", status.bond >= 20),
        ("home_designer", signals.appearance_update_count >= 1),
        ("style_icon", signals.appearance_update_count >= 5),
        ("star_catcher", minigame_count >= 1),
        ("deep_worker", signals.deep_work_used),
        ("companion", total_interactions >= 30),
    ]
    .into_iter()
    .collect();

    let now = now_unix();
    for def in CATALOG {
        if *met.get(def.id).unwrap_or(&false) {
            conn.execute(
                "INSERT INTO achievements (id, unlocked_at) VALUES (?1, ?2)
                 ON CONFLICT(id) DO UPDATE SET unlocked_at = CASE WHEN unlocked_at = 0 THEN ?2 ELSE unlocked_at END",
                params![def.id, now],
            )
            .expect("failed to sync achievement");
        }
    }

    let mut unlocked_at_by_id = std::collections::HashMap::new();
    {
        let mut stmt = conn.prepare("SELECT id, unlocked_at FROM achievements").unwrap();
        let rows = stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?)))
            .unwrap();
        for r in rows.flatten() {
            unlocked_at_by_id.insert(r.0, r.1);
        }
    }

    CATALOG
        .iter()
        .map(|def| {
            let at = unlocked_at_by_id.get(def.id).copied().unwrap_or(0);
            AchievementStatus {
                id: def.id.to_string(),
                title: def.title.to_string(),
                description: def.description.to_string(),
                unlocked: at > 0,
                unlocked_at: if at > 0 { Some(at) } else { None },
            }
        })
        .collect()
}
