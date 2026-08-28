use crate::db::{self, PetStatus};
use crate::memory;
use crate::util::now_unix;
use rand::Rng;
use rusqlite::{params, Connection};
use serde::Serialize;

/// Section 15's food types. Static/const rather than a DB table since these
/// are game-balance constants the app ships with, not user data — a real
/// "unlockable new food type" system (Section 13's bond-gated unlocks)
/// would extend this list, not move it into SQLite.
pub struct FoodDef {
    pub id: &'static str,
    pub label: &'static str,
    pub hunger: f64,
    pub happiness: f64,
    pub bond: i64,
    /// Higher = more common when a reward is earned. Not a percentage —
    /// weights are normalized against each other in `pick_weighted`.
    pub rarity_weight: f64,
}

pub const CATALOG: &[FoodDef] = &[
    FoodDef { id: "basic", label: "Basic Food", hunger: 10.0, happiness: 2.0, bond: 0, rarity_weight: 50.0 },
    FoodDef { id: "apple", label: "Apple", hunger: 15.0, happiness: 5.0, bond: 1, rarity_weight: 25.0 },
    FoodDef { id: "cookie", label: "Cookie", hunger: 10.0, happiness: 10.0, bond: 1, rarity_weight: 15.0 },
    FoodDef { id: "treat", label: "Treat", hunger: 5.0, happiness: 8.0, bond: 3, rarity_weight: 7.0 },
    FoodDef { id: "cake", label: "Cake", hunger: 25.0, happiness: 20.0, bond: 5, rarity_weight: 2.5 },
    FoodDef { id: "golden_treat", label: "Golden Treat", hunger: 30.0, happiness: 30.0, bond: 10, rarity_weight: 0.5 },
];

#[derive(Debug, Clone, Serialize)]
pub struct FoodCatalogEntry {
    pub id: String,
    pub label: String,
    pub hunger: f64,
    pub happiness: f64,
    pub bond: i64,
    pub rarity_weight: f64,
}

pub fn catalog() -> Vec<FoodCatalogEntry> {
    CATALOG
        .iter()
        .map(|f| FoodCatalogEntry {
            id: f.id.to_string(),
            label: f.label.to_string(),
            hunger: f.hunger,
            happiness: f.happiness,
            bond: f.bond,
            rarity_weight: f.rarity_weight,
        })
        .collect()
}

fn find_def(id: &str) -> Option<&'static FoodDef> {
    CATALOG.iter().find(|f| f.id == id)
}

fn pick_weighted() -> &'static FoodDef {
    let total: f64 = CATALOG.iter().map(|f| f.rarity_weight).sum();
    let mut roll = rand::thread_rng().gen_range(0.0..total);
    for def in CATALOG {
        if roll < def.rarity_weight {
            return def;
        }
        roll -= def.rarity_weight;
    }
    &CATALOG[0]
}

/// Feed the pet a specific food from inventory. Consumes one unit, applies
/// that food's hunger/happiness/bond values (happiness folds into the
/// dynamic `energy` resource as a proxy, at a fraction of its listed value,
/// since Phase 3 didn't introduce a separate persisted "happiness" stat —
/// see README for why that's a deliberate simplification rather than a
/// missing feature).
pub fn feed(conn: &Connection, food_id: &str) -> Result<PetStatus, String> {
    let def = find_def(food_id).ok_or_else(|| "unknown_food".to_string())?;

    let count: i64 = conn
        .query_row(
            "SELECT count FROM food_inventory WHERE food_id = ?1",
            params![food_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if count <= 0 {
        return Err("out_of_food".to_string());
    }

    conn.execute(
        "UPDATE food_inventory SET count = count - 1 WHERE food_id = ?1",
        params![food_id],
    )
    .map_err(|e| e.to_string())?;

    db::add_hunger_energy(conn, def.hunger, def.happiness * 0.3);
    db::add_bond(conn, def.bond);
    memory::record_interaction(conn, "feed");

    Ok(db::get_status(conn))
}

/// Section 14/36's diminishing-returns rule, generalized across interaction
/// kinds: an interaction only earns food if fewer than `MAX_REWARDS_PER_WINDOW`
/// rewards of that *same kind* have landed in the last `WINDOW_SECS`. This
/// directly matches the spec's own worked example — "pet once +1, pet again
/// +1, pet repeatedly +0" — with a window so the reward eventually resets
/// instead of being a one-time daily allowance.
const WINDOW_SECS: i64 = 600; // 10 minutes
const MAX_REWARDS_PER_WINDOW: i64 = 2;

/// Returns the food earned (if any) plus the refreshed status. Always
/// records the interaction in memory_stats regardless of whether a reward
/// was earned — Section 12's memory system should reflect what the user
/// actually *does*, not just what paid out.
pub fn earn_food(conn: &Connection, kind: &str) -> (Option<FoodCatalogEntry>, PetStatus) {
    memory::record_interaction(conn, kind);

    let now = now_unix();
    let cutoff = now - WINDOW_SECS;
    let recent_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM interaction_rewards WHERE kind = ?1 AND at > ?2",
            params![kind, cutoff],
            |r| r.get(0),
        )
        .unwrap_or(0);

    if recent_count >= MAX_REWARDS_PER_WINDOW {
        return (None, db::get_status(conn));
    }

    let def = pick_weighted();
    conn.execute(
        "INSERT INTO food_inventory (food_id, count) VALUES (?1, 1)
         ON CONFLICT(food_id) DO UPDATE SET count = count + 1",
        params![def.id],
    )
    .expect("failed to add earned food to inventory");
    conn.execute(
        "INSERT INTO interaction_rewards (kind, at) VALUES (?1, ?2)",
        params![kind, now],
    )
    .expect("failed to log interaction reward");

    let entry = FoodCatalogEntry {
        id: def.id.to_string(),
        label: def.label.to_string(),
        hunger: def.hunger,
        happiness: def.happiness,
        bond: def.bond,
        rarity_weight: def.rarity_weight,
    };
    (Some(entry), db::get_status(conn))
}

/// A richer interaction than a plain click — Section 25's break
/// mini-activities and the Pet House's "Play" button both funnel here.
/// Guarantees a small direct bond/energy bump on top of whatever
/// `earn_food` pays out, since playing is meant to feel more rewarding
/// than idly petting even when the food roll misses.
pub fn play(conn: &Connection) -> (Option<FoodCatalogEntry>, PetStatus) {
    let (earned, _) = earn_food(conn, "play");
    db::add_bond(conn, 2);
    db::add_hunger_energy(conn, 0.0, 5.0);
    (earned, db::get_status(conn))
}

/// Called once when a micro-break mini-game (Phase 6) completes. Bypasses
/// the diminishing-returns check on purpose — completing a mini-game
/// already takes real time and attention, so it isn't spammable the way a
/// click is, and Section 14's reward table lists mini-games at a fixed
/// higher value ("Mini-game +5") rather than a diminishing one.
pub fn minigame_reward(conn: &Connection) -> (FoodCatalogEntry, PetStatus) {
    memory::record_interaction(conn, "minigame");
    let def = pick_weighted();
    conn.execute(
        "INSERT INTO food_inventory (food_id, count) VALUES (?1, 1)
         ON CONFLICT(food_id) DO UPDATE SET count = count + 1",
        params![def.id],
    )
    .expect("failed to add minigame reward food");
    db::add_bond(conn, 3);
    db::add_hunger_energy(conn, 0.0, 10.0);

    let entry = FoodCatalogEntry {
        id: def.id.to_string(),
        label: def.label.to_string(),
        hunger: def.hunger,
        happiness: def.happiness,
        bond: def.bond,
        rarity_weight: def.rarity_weight,
    };
    (entry, db::get_status(conn))
}
