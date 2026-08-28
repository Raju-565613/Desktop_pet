use crate::db::PersonalityTraits;
use serde::{Deserialize, Serialize};

/// Section 43: "AI should be optional rather than required for the core
/// application... use AI only for higher-level interactions" — never on
/// routine ticks. This module is only ever called from `commands::chat_with_pet`,
/// which only fires when the user explicitly sends a chat message, and even
/// then only reaches `call_anthropic` if the user has both turned AI on
/// *and* saved their own API key. Everyone else gets `canned_reply`, which
/// needs no network access at all.
#[derive(Debug, Clone, Serialize)]
pub struct ChatReply {
    pub reply: String,
    pub used_ai: bool,
}

/// Section 45's short, personality/mood-flavored dialogue — no full
/// sentences, no AI required. This is the always-available fallback (and
/// the only behavior at all when AI is disabled, which is the default).
pub fn canned_reply(mood: &str, traits: &PersonalityTraits, message: &str) -> String {
    let m = message.to_lowercase();

    if m.contains("play") {
        return if traits.playfulness > 60 {
            "Catch me!".to_string()
        } else {
            "...maybe later?".to_string()
        };
    }
    if m.contains("food") || m.contains("hungry") || m.contains("eat") {
        return "Food?".to_string();
    }
    if m.contains("sleep") || m.contains("tired") {
        return "I'm sleepy...".to_string();
    }
    if m.contains("hi") || m.contains("hello") || m.contains("morning") {
        return if traits.affection > 60 {
            "You're back!".to_string()
        } else {
            "Oh, hi.".to_string()
        };
    }

    match mood {
        "hungry" => "Food?".to_string(),
        "sleepy" => "*yawn*".to_string(),
        "excited" => "Yay!".to_string(),
        "curious" => "What's that?".to_string(),
        "mischievous" => "You can't catch me!".to_string(),
        "bored" => "...".to_string(),
        "happy" => "This is nice.".to_string(),
        _ => "Mrow.".to_string(),
    }
}

#[derive(Serialize)]
struct AnthropicRequest<'a> {
    model: &'a str,
    max_tokens: u32,
    system: String,
    messages: Vec<AnthropicMessage<'a>>,
}

#[derive(Serialize)]
struct AnthropicMessage<'a> {
    role: &'a str,
    content: &'a str,
}

#[derive(Deserialize)]
struct AnthropicResponse {
    content: Vec<AnthropicContentBlock>,
}

#[derive(Deserialize)]
struct AnthropicContentBlock {
    #[serde(default)]
    text: String,
}

/// Real network call, used only when explicitly enabled. Keeps the prompt
/// tightly scoped (a couple of sentences, in-character) rather than a
/// general-purpose assistant persona — this is meant to feel like the pet
/// talking, not like a chatbot wearing a pet costume.
pub async fn call_anthropic(
    api_key: &str,
    mood: &str,
    traits: &PersonalityTraits,
    message: &str,
) -> Result<String, String> {
    let system = format!(
        "You are a small virtual desktop pet named Mochi. Current mood: {mood}. \
         Personality (0-100): playfulness {}, curiosity {}, affection {}, mischief {}, \
         shyness {}, laziness {}, friendliness {}, independence {}, bravery {}. \
         Reply to the user's message in at most one short sentence (under 10 words), \
         in character, playful and warm, never as a generic assistant.",
        traits.playfulness,
        traits.curiosity,
        traits.affection,
        traits.mischief,
        traits.shyness,
        traits.laziness,
        traits.friendliness,
        traits.independence,
        traits.bravery,
    );

    let body = AnthropicRequest {
        model: "claude-haiku-4-5-20251001",
        max_tokens: 60,
        system,
        messages: vec![AnthropicMessage { role: "user", content: message }],
    };

    let client = reqwest::Client::new();
    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("network error: {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Anthropic API error ({status}): {text}"));
    }

    let parsed: AnthropicResponse = resp
        .json()
        .await
        .map_err(|e| format!("failed to parse API response: {e}"))?;

    let text = parsed
        .content
        .into_iter()
        .map(|b| b.text)
        .collect::<Vec<_>>()
        .join("");

    if text.trim().is_empty() {
        Err("empty response from API".to_string())
    } else {
        Ok(text.trim().to_string())
    }
}
