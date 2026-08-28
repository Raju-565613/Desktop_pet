import { isTauri } from "./platform";
import { AchievementStatus } from "../types/achievements";
import { DailyEvent } from "../types/dailyEvent";
import { FOOD_EMOJI, FoodCatalogEntry, MOCK_FOOD_CATALOG } from "../types/food";
import { Appearance, MOCK_PET_STATUS, PetStatus } from "../types/petStatus";
import { DEFAULT_SETTINGS, Settings, SettingsUpdate } from "../types/settings";

// One shared module for every Tauri command, each with a browser-dev mock
// fallback so the whole loop (behavior, feeding, appearance, settings,
// chat) is testable via `npm run dev` without compiling the Rust shell —
// useful generally, and necessary in this sandbox specifically, which has
// no Rust toolchain at all.

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  return tauriInvoke<T>(cmd, args);
}

// ---- status -----------------------------------------------------------

export async function getPetStatus(): Promise<PetStatus> {
  if (!isTauri) return { ...MOCK_PET_STATUS };
  return invoke<PetStatus>("get_pet_status");
}

export async function listenPetStatus(cb: (status: PetStatus) => void): Promise<() => void> {
  if (!isTauri) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<PetStatus>("pet-status-updated", (event) => cb(event.payload));
}

// ---- food / feeding (Phase 4) -----------------------------------------

export async function getFoodCatalog(): Promise<FoodCatalogEntry[]> {
  if (!isTauri) return MOCK_FOOD_CATALOG;
  return invoke<FoodCatalogEntry[]>("get_food_catalog");
}

export async function feedPet(foodId: string): Promise<PetStatus> {
  if (!isTauri) {
    const count = MOCK_PET_STATUS.food_inventory[foodId] ?? 0;
    if (count <= 0) throw new Error("out_of_food");
    const def = MOCK_FOOD_CATALOG.find((f) => f.id === foodId)!;
    MOCK_PET_STATUS.food_inventory[foodId] = count - 1;
    MOCK_PET_STATUS.hunger = Math.min(100, MOCK_PET_STATUS.hunger + def.hunger);
    MOCK_PET_STATUS.energy = Math.min(100, MOCK_PET_STATUS.energy + def.happiness * 0.3);
    MOCK_PET_STATUS.bond += def.bond;
    return { ...MOCK_PET_STATUS };
  }
  return invoke<PetStatus>("feed_pet", { foodId });
}

export interface InteractResult {
  status: PetStatus;
  earned_food: FoodCatalogEntry | null;
}

/** A click/pet on the overlay pet. */
export async function petInteract(): Promise<InteractResult> {
  if (!isTauri) {
    MOCK_PET_STATUS.bond += 1;
    return { status: { ...MOCK_PET_STATUS }, earned_food: null };
  }
  return invoke<InteractResult>("pet_interact");
}

export async function playWithPet(): Promise<InteractResult> {
  if (!isTauri) {
    MOCK_PET_STATUS.bond += 2;
    MOCK_PET_STATUS.energy = Math.min(100, MOCK_PET_STATUS.energy + 5);
    return { status: { ...MOCK_PET_STATUS }, earned_food: MOCK_FOOD_CATALOG[0] };
  }
  return invoke<InteractResult>("play_with_pet");
}

export interface MinigameResult {
  status: PetStatus;
  earned_food: FoodCatalogEntry;
}

export async function minigameComplete(): Promise<MinigameResult> {
  if (!isTauri) {
    MOCK_PET_STATUS.bond += 3;
    MOCK_PET_STATUS.energy = Math.min(100, MOCK_PET_STATUS.energy + 10);
    return { status: { ...MOCK_PET_STATUS }, earned_food: MOCK_FOOD_CATALOG[2] };
  }
  return invoke<MinigameResult>("minigame_complete");
}

export async function restTick(): Promise<PetStatus> {
  if (!isTauri) {
    MOCK_PET_STATUS.energy = Math.min(100, MOCK_PET_STATUS.energy + 3);
    return { ...MOCK_PET_STATUS };
  }
  return invoke<PetStatus>("rest_tick");
}

// ---- appearance (Phase 5) ----------------------------------------------

export async function getAppearance(): Promise<Appearance> {
  if (!isTauri) return { ...MOCK_PET_STATUS.appearance };
  return invoke<Appearance>("get_appearance");
}

export async function updateAppearance(appearance: Appearance): Promise<PetStatus> {
  if (!isTauri) {
    MOCK_PET_STATUS.appearance = { ...appearance };
    return { ...MOCK_PET_STATUS };
  }
  return invoke<PetStatus>("update_appearance", { appearance });
}

// ---- Deep Work (Phase 6) -----------------------------------------------

export async function toggleDeepWork(): Promise<PetStatus> {
  if (!isTauri) {
    MOCK_PET_STATUS.deep_work_active = !MOCK_PET_STATUS.deep_work_active;
    return { ...MOCK_PET_STATUS };
  }
  return invoke<PetStatus>("toggle_deep_work");
}

// ---- memory (Phase 7) ---------------------------------------------------

export interface MemoryStat {
  kind: string;
  count: number;
}

export async function getMemoryStats(): Promise<MemoryStat[]> {
  if (!isTauri) return [];
  return invoke<MemoryStat[]>("get_memory_stats");
}

// ---- settings (Phase 9) --------------------------------------------------

let mockSettings: Settings = { ...DEFAULT_SETTINGS };

export async function getSettings(): Promise<Settings> {
  if (!isTauri) return { ...mockSettings };
  return invoke<Settings>("get_settings");
}

export async function updateSettings(update: SettingsUpdate): Promise<Settings> {
  if (!isTauri) {
    mockSettings = {
      ...mockSettings,
      ...update,
      ai_api_key_set:
        update.ai_api_key !== undefined ? update.ai_api_key.trim().length > 0 : mockSettings.ai_api_key_set,
    };
    return { ...mockSettings };
  }
  return invoke<Settings>("update_settings", { update });
}

// ---- AI chat (Phase 8) ---------------------------------------------------

export interface ChatReply {
  reply: string;
  used_ai: boolean;
}

export async function chatWithPet(message: string): Promise<ChatReply> {
  if (!isTauri) {
    return { reply: "Mrow. (AI chat needs the Rust shell to actually run.)", used_ai: false };
  }
  return invoke<ChatReply>("chat_with_pet", { message });
}

// ---- achievements ---------------------------------------------------------

export async function getAchievements(): Promise<AchievementStatus[]> {
  if (!isTauri) return [];
  return invoke<AchievementStatus[]>("get_achievements");
}

// ---- daily events -----------------------------------------------------------

export async function getDailyEvent(): Promise<DailyEvent> {
  if (!isTauri) return { id: "sunny", label: "Sunny Day", emoji: "☀️" };
  return invoke<DailyEvent>("get_daily_event");
}

// ---- application-awareness (Phase 7, opt-in) -------------------------------

export async function getActiveAppCategory(): Promise<string> {
  if (!isTauri) return "disabled";
  return invoke<string>("get_active_app_category");
}

export { FOOD_EMOJI };
