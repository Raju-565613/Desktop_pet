// Mirrors src-tauri/src/db.rs's structs field-for-field — keep these in
// sync by hand; codegen (e.g. specta/tauri-specta) is worth adding once
// the command surface grows much further.

export interface PersonalityTraits {
  playfulness: number;
  curiosity: number;
  affection: number;
  mischief: number;
  energy: number; // trait: general energy level, distinct from PetStatus.energy below
  shyness: number;
  laziness: number;
  friendliness: number;
  independence: number;
  bravery: number;
}

export type Mood =
  | "hungry"
  | "sleepy"
  | "excited"
  | "curious"
  | "mischievous"
  | "bored"
  | "happy"
  | "calm";

export type EarStyle = "cat" | "bunny" | "bear" | "fox";
export type TailStyle = "cat" | "fox" | "bunny" | "none";
export type Accessory = "none" | "bow" | "glasses";
export type Outfit = "none" | "bow_tie" | "hoodie" | "scarf";

export interface Appearance {
  body_color: string;
  ear_color: string;
  ear_style: EarStyle;
  tail_style: TailStyle;
  accessory: Accessory;
  outfit: Outfit;
  outfit_color: string;
}

export interface PetStatus {
  name: string;
  /** 0-100 */
  hunger: number;
  /** 0-100, dynamic resource — distinct from traits.energy */
  energy: number;
  /** food id -> count on hand */
  food_inventory: Record<string, number>;
  bond: number;
  mood: Mood;
  traits: PersonalityTraits;
  appearance: Appearance;
  deep_work_active: boolean;
  favorite_activity: string | null;
}

const DEFAULT_TRAITS: PersonalityTraits = {
  playfulness: 70,
  curiosity: 60,
  affection: 75,
  mischief: 20,
  energy: 65,
  shyness: 20,
  laziness: 25,
  friendliness: 80,
  independence: 40,
  bravery: 55,
};

const DEFAULT_APPEARANCE: Appearance = {
  body_color: "#f6b8c4",
  ear_color: "#f191a5",
  ear_style: "cat",
  tail_style: "cat",
  accessory: "none",
  outfit: "none",
  outfit_color: "#e0577a",
};

export const MOCK_PET_STATUS: PetStatus = {
  name: "Mochi",
  hunger: 70,
  energy: 80,
  food_inventory: { basic: 5 },
  bond: 0,
  mood: "calm",
  traits: DEFAULT_TRAITS,
  appearance: DEFAULT_APPEARANCE,
  deep_work_active: false,
  favorite_activity: null,
};
