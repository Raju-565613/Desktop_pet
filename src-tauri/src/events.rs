use serde::Serialize;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize)]
pub struct DailyEvent {
    pub id: String,
    pub label: String,
    pub emoji: String,
}

/// Section 38: "lightweight cosmetic events" — deliberately just that.
/// Deterministic per calendar day (so it's the same for everyone on a
/// given day, and stable across restarts) via days-since-epoch modulo the
/// catalog length, with no calendar/timezone library dependency. Purely
/// cosmetic: this doesn't grant bonuses or affect behavior, just a banner
/// in the Pet House, per the spec's own framing.
const EVENTS: &[(&str, &str, &str)] = &[
    ("sunny", "Sunny Day", "☀️"),
    ("rainy", "Rainy Day", "🌧️"),
    ("festival", "Festival Day", "🎉"),
    ("treat", "Favorite Food Day", "🍪"),
    ("toy", "Toy Day", "🧸"),
    ("cloudy", "Cloudy Day", "☁️"),
    ("snow", "Snow Day", "❄️"),
];

pub fn today() -> DailyEvent {
    let days_since_epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        / 86_400;
    let (id, label, emoji) = EVENTS[(days_since_epoch as usize) % EVENTS.len()];
    DailyEvent { id: id.to_string(), label: label.to_string(), emoji: emoji.to_string() }
}
