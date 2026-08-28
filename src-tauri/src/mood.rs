use crate::db::PersonalityTraits;

/// Section 11 of the spec explicitly says mood should never go permanently
/// negative from inactivity — "the application is intended for relaxation,
/// not guilt." So this is a small ordered set of rule checks (most urgent
/// need first: hunger, then energy) falling through to trait-flavored
/// "resting" moods, never to anything punishing. There's no persistent
/// "sad" spiral here on purpose — mood is recomputed fresh from current
/// hunger/energy/traits every time, so it recovers the moment the
/// underlying need is met.
///
/// Kept as a pure function (no DB access) so it's trivial to unit test and
/// so the frontend behavior engine (PersonalityWeights.ts) can eventually
/// mirror this exact logic in TypeScript for instant client-side prediction
/// without waiting on a round trip, if that's ever worth doing.
pub fn compute_mood(hunger: f64, energy: f64, traits: &PersonalityTraits) -> String {
    if hunger < 25.0 {
        return "hungry".to_string();
    }
    if energy < 20.0 {
        return "sleepy".to_string();
    }
    if energy > 75.0 && traits.playfulness > 60 {
        return "excited".to_string();
    }
    if traits.curiosity > 65 && hunger > 50.0 && energy > 50.0 {
        return "curious".to_string();
    }
    if traits.mischief > 60 && energy > 55.0 {
        return "mischievous".to_string();
    }
    if traits.laziness > 65 && energy < 55.0 {
        return "bored".to_string();
    }
    if hunger > 70.0 && energy > 60.0 {
        return "happy".to_string();
    }
    "calm".to_string()
}
