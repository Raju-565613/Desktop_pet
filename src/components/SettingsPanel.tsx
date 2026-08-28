import { useState } from "react";
import { Settings, SettingsUpdate } from "../types/settings";

interface SettingsPanelProps {
  settings: Settings;
  onUpdate: (update: SettingsUpdate) => void;
}

function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 10, cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ marginTop: 2 }} />
      <span>
        <div style={{ fontSize: 13, color: "#5c3a44" }}>{label}</div>
        {hint && <div style={{ fontSize: 11, color: "#9c7a84" }}>{hint}</div>}
      </span>
    </label>
  );
}

/** Section 29 (privacy) + Section 40 (accessibility) + Section 24/26 (break
 *  config) + Section 43 (optional AI), consolidated into one tab. */
export function SettingsPanel({ settings, onUpdate }: SettingsPanelProps) {
  const [apiKeyInput, setApiKeyInput] = useState("");

  return (
    <div>
      <h3 style={sectionTitle}>Accessibility</h3>
      <Toggle
        label="Reduce motion"
        checked={settings.reduce_motion}
        onChange={(v) => onUpdate({ reduce_motion: v })}
        hint="Keeps the pet to a gentle idle bob, no bouncing or fast animations."
      />
      <Toggle
        label="High contrast Pet House"
        checked={settings.high_contrast}
        onChange={(v) => onUpdate({ high_contrast: v })}
      />
      <Toggle label="Mute sound" checked={settings.muted} onChange={(v) => onUpdate({ muted: v })} />
      <Toggle
        label="Desktop roaming"
        checked={settings.roaming_enabled}
        onChange={(v) => onUpdate({ roaming_enabled: v })}
        hint="Turn off to keep the pet in place instead of walking around."
      />

      <h3 style={sectionTitle}>Breaks</h3>
      <Toggle
        label="Break reminders"
        checked={settings.break_reminders_enabled}
        onChange={(v) => onUpdate({ break_reminders_enabled: v })}
      />
      <label style={{ fontSize: 13, color: "#5c3a44", display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        Remind me every
        <select
          value={settings.break_interval_minutes}
          onChange={(e) => onUpdate({ break_interval_minutes: Number(e.target.value) })}
          style={{ padding: "4px 6px", borderRadius: 6, border: "1px solid #f0d5da" }}
        >
          {[15, 30, 45, 60].map((m) => (
            <option key={m} value={m}>
              {m} min
            </option>
          ))}
        </select>
      </label>

      <h3 style={sectionTitle}>Privacy</h3>
      <Toggle
        label="Detect active application"
        checked={settings.detect_active_app}
        onChange={(v) => onUpdate({ detect_active_app: v })}
        hint="Off by default. Note: this toggle exists but the detection itself isn't implemented yet — see the README."
      />

      <h3 style={sectionTitle}>AI chat (optional)</h3>
      <Toggle
        label="Enable AI-generated replies"
        checked={settings.ai_enabled}
        onChange={(v) => onUpdate({ ai_enabled: v })}
        hint="Off by default. Without this, chat uses short built-in dialogue only — no network calls."
      />
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <input
          type="password"
          placeholder={settings.ai_api_key_set ? "API key saved" : "Anthropic API key"}
          value={apiKeyInput}
          onChange={(e) => setApiKeyInput(e.target.value)}
          style={{ flex: 1, padding: "6px 8px", borderRadius: 6, border: "1px solid #f0d5da", fontSize: 12 }}
        />
        <button
          onClick={() => {
            onUpdate({ ai_api_key: apiKeyInput });
            setApiKeyInput("");
          }}
          disabled={!apiKeyInput}
          style={{
            padding: "6px 12px",
            borderRadius: 6,
            border: "none",
            background: "#f6b8c4",
            fontSize: 12,
            cursor: apiKeyInput ? "pointer" : "default",
            opacity: apiKeyInput ? 1 : 0.6,
          }}
        >
          Save
        </button>
      </div>
      <p style={{ fontSize: 11, color: "#9c7a84", marginTop: 4 }}>
        Stored locally in the pet's own database, only sent directly to Anthropic's API when you
        chat with AI enabled. Never bundled with the app, never sent anywhere else.
      </p>
    </div>
  );
}

const sectionTitle: React.CSSProperties = {
  fontSize: 13,
  color: "#5c3a44",
  margin: "14px 0 8px",
  borderTop: "1px solid #f0dfe3",
  paddingTop: 10,
};
