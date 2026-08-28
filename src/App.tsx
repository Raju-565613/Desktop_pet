import { useEffect, useMemo, useRef, useState } from "react";
import { BreakPrompt } from "./components/BreakPrompt";
import { MiniGame } from "./components/MiniGame";
import { Pet } from "./components/Pet";
import {
  beginDrag,
  createInitialState,
  endDrag,
  step,
  triggerReaction,
} from "./engine/PetStateMachine";
import {
  DEFAULT_PERSONALITY_CONTEXT,
  EngineConfig,
  PersonalityContext,
  PetState,
  timeOfDayFromHour,
} from "./engine/types";
import {
  getActiveAppCategory,
  getPetStatus,
  getSettings,
  listenPetStatus,
  minigameComplete,
  petInteract,
  restTick,
} from "./lib/api";
import { isTauri } from "./lib/platform";
import { Appearance, PetStatus } from "./types/petStatus";
import { DEFAULT_SETTINGS, Settings } from "./types/settings";

async function setClickThrough(ignore: boolean) {
  if (!isTauri) return;
  try {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().setIgnoreCursorEvents(ignore);
  } catch (err) {
    console.error("Failed to toggle click-through", err);
  }
}

function useEngineConfig(): EngineConfig {
  const [config, setConfig] = useState<EngineConfig>({
    minX: 16,
    maxX: window.innerWidth - 112,
    floorY: 0,
  });

  useEffect(() => {
    const onResize = () =>
      setConfig((c) => ({ ...c, maxX: window.innerWidth - 112 }));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return config;
}

/** Section 27: recomputed every minute rather than once, so a long-running
 *  session naturally drifts from "afternoon" into "evening" etc. */
function useTimeOfDay() {
  const [hour, setHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const id = window.setInterval(() => setHour(new Date().getHours()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return timeOfDayFromHour(hour);
}

export default function App() {
  const config = useEngineConfig();
  const [state, setState] = useState<PetState>(() => createInitialState(config));
  const [petStatus, setPetStatus] = useState<PetStatus | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [showBreakPrompt, setShowBreakPrompt] = useState(false);
  const [showMiniGame, setShowMiniGame] = useState(false);
  const [appCategory, setAppCategory] = useState<string>("disabled");
  const dragOffset = useRef({ x: 0, y: 0 });
  const timeOfDay = useTimeOfDay();

  // Everything the behavior engine needs beyond raw traits — recomputed
  // only when its inputs actually change, not every animation frame.
  const personalityContext: PersonalityContext = useMemo(
    () =>
      petStatus
        ? {
            traits: petStatus.traits,
            mood: petStatus.mood,
            timeOfDay,
            favoriteActivity: petStatus.favorite_activity,
            roamingEnabled: settings.roaming_enabled,
          }
        : { ...DEFAULT_PERSONALITY_CONTEXT, timeOfDay, roamingEnabled: settings.roaming_enabled },
    [petStatus, timeOfDay, settings.roaming_enabled]
  );

  // Section 28's example: "Coding -> pet may wear glasses." A purely
  // visual, non-persisted override — it never touches the saved
  // appearance, and only applies when the user hasn't already chosen an
  // accessory of their own (never fights a deliberate customization).
  const effectiveAppearance: Appearance | undefined = useMemo(() => {
    if (!petStatus) return undefined;
    if (appCategory === "coding" && petStatus.appearance.accessory === "none") {
      return { ...petStatus.appearance, accessory: "glasses" };
    }
    return petStatus.appearance;
  }, [petStatus, appCategory]);

  // Fetch status + settings once, then stay in sync via the backend's
  // broadcast event (fired on every feed/interact/rest/decay/settings call
  // that touches status).
  useEffect(() => {
    getPetStatus().then(setPetStatus);
    getSettings().then(setSettings);
    let unlisten: (() => void) | undefined;
    listenPetStatus(setPetStatus).then((fn) => (unlisten = fn));
    return () => unlisten?.();
  }, []);

  // Section 28: only polls at all when the user has opted in — the command
  // also checks the setting server-side, this just avoids polling for
  // nothing when it's off. Used only for the small "glasses while coding"
  // visual touch below, never to change persisted data.
  useEffect(() => {
    if (!settings.detect_active_app) {
      setAppCategory("disabled");
      return;
    }
    const poll = () => getActiveAppCategory().then(setAppCategory).catch(() => {});
    poll();
    const id = window.setInterval(poll, 15_000);
    return () => window.clearInterval(id);
  }, [settings.detect_active_app]);

  // Main behavior loop — a single requestAnimationFrame driving the pure
  // state-machine `step` function. This is the only place PetState mutates.
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.25); // clamp to avoid huge jumps on tab-throttle
      last = now;
      setState((s) => step(s, dt, config, personalityContext));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [config, personalityContext]);

  // The overlay spans the whole screen, so by default every click must pass
  // through to whatever the user is working in underneath. Only the pet's
  // own hit area (toggled via onHoverChange) should ever capture the mouse.
  useEffect(() => {
    setClickThrough(true);
  }, []);

  // While the local behavior engine has chosen "sleep", periodically tell
  // the backend to actually restore energy — the visual decision to sleep
  // stays client-side, but its effect on the persisted resource doesn't.
  useEffect(() => {
    if (state.activity !== "sleep") return;
    const id = window.setInterval(() => {
      restTick().then(setPetStatus).catch(() => {});
    }, 4000);
    return () => window.clearInterval(id);
  }, [state.activity]);

  // Section 24/26: break timer. Counts elapsed time since the last break
  // (played, skipped, or app start) and gently offers a break once the
  // configured interval passes — never while Deep Work is active, never as
  // a blocking dialog.
  const lastBreakAt = useRef(Date.now());
  useEffect(() => {
    if (!settings.break_reminders_enabled || petStatus?.deep_work_active) return;
    const id = window.setInterval(() => {
      const elapsedMinutes = (Date.now() - lastBreakAt.current) / 60000;
      if (elapsedMinutes >= settings.break_interval_minutes && !showBreakPrompt && !showMiniGame) {
        setShowBreakPrompt(true);
      }
    }, 15_000);
    return () => window.clearInterval(id);
  }, [settings.break_reminders_enabled, settings.break_interval_minutes, petStatus?.deep_work_active, showBreakPrompt, showMiniGame]);

  const resetBreakTimer = () => {
    lastBreakAt.current = Date.now();
    setShowBreakPrompt(false);
  };

  const handleMinigameComplete = async () => {
    setShowMiniGame(false);
    resetBreakTimer();
    const { status } = await minigameComplete();
    setPetStatus(status);
  };

  const handleClick = () => {
    setState((s) => triggerReaction(s, personalityContext));
    petInteract().then(({ status }) => setPetStatus(status)).catch(() => {});
  };

  const handleDragStart = (screenX: number, screenY: number) => {
    dragOffset.current = { x: screenX - state.x, y: screenY - state.y };
    setState((s) => beginDrag(s));
  };

  const handleDrag = (screenX: number, screenY: number) => {
    setState((s) => ({
      ...s,
      x: screenX - dragOffset.current.x,
      y: Math.max(0, screenY - dragOffset.current.y),
    }));
  };

  const handleDragEnd = (screenX: number, _screenY: number) => {
    const x = screenX - dragOffset.current.x;
    const y = 0; // releasing always drops the pet back onto the floor line.
    setState((s) => endDrag(s, Math.max(config.minX, Math.min(config.maxX, x)), y));
  };

  // Defense-in-depth: the backend also hides this whole OS window when
  // Deep Work is active (see toggle_deep_work in main.rs), but checking
  // here too means the pet disappears immediately even if that hasn't
  // taken effect yet, and interactions can't fire in the gap.
  if (petStatus?.deep_work_active) {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none", // the transparent overlay itself never blocks clicks
      }}
    >
      <div
        style={{
          position: "absolute",
          left: state.x,
          bottom: 0,
          pointerEvents: "auto", // only the pet's own hit area is interactive
          userSelect: "none",
        }}
      >
        {showBreakPrompt && (
          <div style={{ position: "absolute", bottom: 104, left: -50 }}>
            <BreakPrompt
              onPlay={() => {
                setShowBreakPrompt(false);
                setShowMiniGame(true);
              }}
              onSkip={resetBreakTimer}
            />
          </div>
        )}
        {showMiniGame && (
          <div style={{ position: "absolute", bottom: 104, left: -80 }}>
            <MiniGame onComplete={handleMinigameComplete} onCancel={() => { setShowMiniGame(false); resetBreakTimer(); }} />
          </div>
        )}
        <Pet
          state={state}
          appearance={effectiveAppearance}
          reduceMotion={settings.reduce_motion}
          onClick={handleClick}
          onDragStart={handleDragStart}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          onHoverChange={(hovering) => setClickThrough(!hovering)}
        />
      </div>
    </div>
  );
}
