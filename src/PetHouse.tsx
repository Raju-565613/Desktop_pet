import { useCallback, useEffect, useRef, useState } from "react";
import { AchievementsList } from "./components/AchievementsList";
import { AppearanceEditor } from "./components/AppearanceEditor";
import { ChatBox } from "./components/ChatBox";
import { FoodInventory } from "./components/FoodInventory";
import { HouseActivity, HousePetCanvas } from "./components/HousePetCanvas";
import { MiniGame } from "./components/MiniGame";
import { SettingsPanel } from "./components/SettingsPanel";
import {
  feedPet,
  getAchievements,
  getActiveAppCategory,
  getDailyEvent,
  getFoodCatalog,
  getPetStatus,
  getSettings,
  listenPetStatus,
  minigameComplete,
  playWithPet,
  toggleDeepWork,
  updateAppearance,
  updateSettings,
} from "./lib/api";
import { AchievementStatus } from "./types/achievements";
import { DailyEvent } from "./types/dailyEvent";
import { FoodCatalogEntry } from "./types/food";
import { Appearance, PetStatus } from "./types/petStatus";
import { DEFAULT_SETTINGS, Settings, SettingsUpdate } from "./types/settings";

type Tab = "home" | "look" | "play" | "achievements" | "chat" | "settings";

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
          color: "#7a5a63",
          marginBottom: 3,
        }}
      >
        <span>{label}</span>
        <span>{Math.round(value)}%</span>
      </div>
      <div style={{ background: "#f0dfe3", borderRadius: 8, height: 8, overflow: "hidden" }}>
        <div
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
            background: color,
            height: "100%",
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}

function moodEmoji(mood: PetStatus["mood"]): string {
  switch (mood) {
    case "hungry": return "🍽️";
    case "sleepy": return "😴";
    case "excited": return "🤩";
    case "curious": return "🧐";
    case "mischievous": return "😼";
    case "bored": return "😐";
    case "happy": return "😊";
    default: return "🙂";
  }
}

export default function PetHouse() {
  const [status, setStatus] = useState<PetStatus | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [catalog, setCatalog] = useState<FoodCatalogEntry[]>([]);
  const [tab, setTab] = useState<Tab>("home");
  const [activity, setActivity] = useState<HouseActivity>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [showMiniGame, setShowMiniGame] = useState(false);
  const [achievementsList, setAchievementsList] = useState<AchievementStatus[]>([]);
  const [dailyEvent, setDailyEvent] = useState<DailyEvent | null>(null);
  const [appCategory, setAppCategory] = useState<string>("disabled");
  const messageTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    getPetStatus().then(setStatus);
    getSettings().then(setSettings);
    getFoodCatalog().then(setCatalog);
    getDailyEvent().then(setDailyEvent);
    getAchievements().then(setAchievementsList);
  }, []);

  // Re-fetch achievements whenever status changes — cheap on the backend
  // (a handful of indexed queries) and keeps newly-unlocked achievements
  // showing up without a manual refresh.
  useEffect(() => {
    if (status) getAchievements().then(setAchievementsList);
  }, [status?.bond, status?.deep_work_active]);

  // Section 28: only polls at all if the user has opted in — the command
  // itself also checks the setting server-side, this just avoids polling
  // for nothing when it's off.
  useEffect(() => {
    if (!settings.detect_active_app) {
      setAppCategory("disabled");
      return;
    }
    const poll = () => getActiveAppCategory().then(setAppCategory).catch(() => {});
    poll();
    const id = window.setInterval(poll, 10_000);
    return () => window.clearInterval(id);
  }, [settings.detect_active_app]);

  // Stay in sync with the overlay window and the background decay task.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listenPetStatus(setStatus).then((fn) => (unlisten = fn));
    return () => unlisten?.();
  }, []);

  const showMessage = useCallback((text: string) => {
    setMessage(text);
    window.clearTimeout(messageTimer.current);
    messageTimer.current = window.setTimeout(() => setMessage(null), 2600);
  }, []);

  const handleFeed = useCallback(
    async (foodId: string) => {
      if (!status || activity !== "idle") return;
      setActivity("eating");
      try {
        const updated = await feedPet(foodId);
        window.setTimeout(() => {
          setStatus(updated);
          setActivity("happy");
          window.setTimeout(() => setActivity("idle"), 900);
        }, 700);
      } catch {
        setActivity("idle");
        showMessage("Couldn't feed that — try earning more food outside first.");
      }
    },
    [status, activity, showMessage]
  );

  const handlePlay = useCallback(async () => {
    if (activity !== "idle") return;
    setActivity("excited");
    try {
      const { status: updated, earned_food } = await playWithPet();
      setStatus(updated);
      showMessage(earned_food ? `Earned ${earned_food.label}!` : "Mochi had fun playing!");
    } finally {
      window.setTimeout(() => setActivity("idle"), 1200);
    }
  }, [activity, showMessage]);

  const handleMinigameComplete = useCallback(async () => {
    setShowMiniGame(false);
    const { status: updated, earned_food } = await minigameComplete();
    setStatus(updated);
    showMessage(`Great game! Earned ${earned_food.label}.`);
  }, [showMessage]);

  const handleAppearanceChange = useCallback(async (appearance: Appearance) => {
    const updated = await updateAppearance(appearance);
    setStatus(updated);
  }, []);

  const handleSettingsUpdate = useCallback(async (update: SettingsUpdate) => {
    const updated = await updateSettings(update);
    setSettings(updated);
  }, []);

  const handleDeepWork = useCallback(async () => {
    const updated = await toggleDeepWork();
    setStatus(updated);
  }, []);

  if (!status) {
    return (
      <div style={roomStyle(settings.high_contrast)}>
        <p style={{ color: "#7a5a63", fontFamily: "sans-serif" }}>Opening the house…</p>
      </div>
    );
  }

  return (
    <div style={roomStyle(settings.high_contrast)}>
      <header style={{ marginBottom: 10 }}>
        <h1 style={{ margin: 0, fontSize: 20, color: "#5c3a44", fontFamily: "sans-serif" }}>
          {status.name}'s House
        </h1>
        <p style={{ margin: "2px 0 0", fontSize: 12, color: "#9c7a84", fontFamily: "sans-serif" }}>
          {moodEmoji(status.mood)} {status.mood} · Bond {status.bond}
          {status.favorite_activity && ` · loves ${status.favorite_activity}`}
          {status.deep_work_active && " · 💻 Deep Work active"}
        </p>
        <p style={{ margin: "2px 0 0", fontSize: 11, color: "#b78a94", fontFamily: "sans-serif" }}>
          {dailyEvent && `${dailyEvent.emoji} ${dailyEvent.label}`}
          {appCategory !== "disabled" && ` · you seem to be ${appCategory === "other" ? "around" : appCategory}`}
        </p>
      </header>

      <nav style={{ display: "flex", gap: 4, marginBottom: 12 }}>
        {(["home", "look", "play", "achievements", "chat", "settings"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: "6px 0",
              fontSize: 12,
              textTransform: "capitalize",
              borderRadius: 8,
              border: "none",
              background: tab === t ? "#f6b8c4" : "transparent",
              color: "#5c3a44",
              cursor: "pointer",
              fontFamily: "sans-serif",
            }}
          >
            {t}
          </button>
        ))}
      </nav>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "home" && (
          <>
            <StatBar label="Hunger" value={status.hunger} color="#f6b8c4" />
            <StatBar label="Energy" value={status.energy} color="#a7d1e8" />

            <div
              style={{
                position: "relative",
                height: 200,
                borderRadius: 16,
                background:
                  "linear-gradient(180deg, #fdf3f0 0%, #fdf3f0 68%, #e8c9a8 68%, #e8c9a8 100%)",
                overflow: "hidden",
                marginTop: 8,
              }}
            >
              <div style={{ position: "absolute", left: 20, bottom: 24, width: 90, height: 46, background: "#d9a0ae", borderRadius: 12 }} />
              <div style={{ position: "absolute", left: 26, bottom: 54, width: 34, height: 22, background: "#fbe4e9", borderRadius: 10 }} />
              <div style={{ position: "absolute", right: 24, top: 24, width: 54, height: 54, borderRadius: 8, background: "#cfe8f2", border: "4px solid #fff" }} />
              <div style={{ position: "absolute", bottom: 14, left: activity === "idle" ? 60 : 108, transition: "left 0.5s ease" }}>
                <HousePetCanvas activity={activity} appearance={status.appearance} reduceMotion={settings.reduce_motion} />
              </div>
            </div>

            <p style={{ fontSize: 12, color: "#7a5a63", margin: "10px 0 0" }}>Feed Mochi:</p>
            <FoodInventory
              catalog={catalog}
              inventory={status.food_inventory}
              disabled={activity !== "idle"}
              onSelect={handleFeed}
            />
          </>
        )}

        {tab === "look" && <AppearanceEditor appearance={status.appearance} onChange={handleAppearanceChange} />}

        {tab === "play" && (
          <div>
            <p style={{ fontSize: 13, color: "#5c3a44" }}>
              Play with Mochi for a bond boost and a chance at food, or start a quick mini-game.
            </p>
            <div style={{ display: "flex", justifyContent: "center", padding: 12 }}>
              <HousePetCanvas activity={activity === "idle" ? "idle" : "excited"} appearance={status.appearance} reduceMotion={settings.reduce_motion} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handlePlay} disabled={activity !== "idle"} style={primaryButton}>
                🎾 Play
              </button>
              <button onClick={() => setShowMiniGame(true)} style={primaryButton}>
                ⭐ Catch the Star
              </button>
            </div>
            <button onClick={handleDeepWork} style={{ ...primaryButton, marginTop: 10, width: "100%", background: "#dce6f5" }}>
              {status.deep_work_active ? "💻 End Deep Work" : "💻 Start Deep Work"}
            </button>
            {showMiniGame && (
              <div style={{ marginTop: 12, display: "flex", justifyContent: "center" }}>
                <MiniGame onComplete={handleMinigameComplete} onCancel={() => setShowMiniGame(false)} />
              </div>
            )}
          </div>
        )}

        {tab === "achievements" && <AchievementsList achievements={achievementsList} />}

        {tab === "chat" && (
          <div style={{ height: 320 }}>
            <ChatBox />
          </div>
        )}

        {tab === "settings" && <SettingsPanel settings={settings} onUpdate={handleSettingsUpdate} />}
      </div>

      {message && (
        <p
          style={{
            marginTop: 10,
            fontSize: 12,
            color: "#7a5a63",
            background: "#fbe9ec",
            borderRadius: 8,
            padding: "6px 10px",
            fontFamily: "sans-serif",
          }}
        >
          {message}
        </p>
      )}
    </div>
  );
}

const primaryButton: React.CSSProperties = {
  flex: 1,
  padding: "8px 0",
  borderRadius: 10,
  border: "none",
  background: "#f6b8c4",
  color: "#5c3a44",
  fontSize: 13,
  cursor: "pointer",
  fontFamily: "sans-serif",
};

function roomStyle(highContrast: boolean): React.CSSProperties {
  return {
    height: "100vh",
    width: "100vw",
    boxSizing: "border-box",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    background: highContrast ? "#ffffff" : "#fff8f5",
    color: highContrast ? "#000000" : undefined,
    fontFamily: "sans-serif",
  };
}
