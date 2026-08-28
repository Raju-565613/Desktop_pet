// Core types for the Phase 1 pet engine.
// Kept intentionally small — later phases (personality, mood, hunger, bond)
// plug into this same PetState shape without changing the renderer's contract.

import { Mood, PersonalityTraits } from "../types/petStatus";

export type PetActivity =
  | "idle"
  | "walk"
  | "sit"
  | "sleep"
  | "drag"
  | "happy" // brief reaction to a click/pet
  | "jump"
  | "curious" // head-tilt investigate, biased by traits.curiosity
  | "stretch" // biased to follow sit/sleep, more likely for low-laziness pets
  | "excited" // bigger, faster version of happy — biased by mood === "excited"
  | "dance"; // playful flourish — biased by traits.playfulness + mood === "happy"

export type FacingDirection = "left" | "right";

export interface PetState {
  /** X position in pixels, measured from the left edge of the screen. */
  x: number;
  /** Y position in pixels. In Phase 1 the pet stays glued to the taskbar line. */
  y: number;
  facing: FacingDirection;
  activity: PetActivity;
  /** Seconds remaining in the current activity before the engine re-decides. */
  activityTimeLeft: number;
  /** Walking speed in px/sec, varies slightly per decision for a livelier feel. */
  walkSpeed: number;
  /** Set while the user is actively dragging the pet with the mouse. */
  isDragging: boolean;
}

export interface EngineConfig {
  /** Left/right bounds the pet is allowed to roam within (usually the screen width). */
  minX: number;
  maxX: number;
  /** The y position corresponding to "standing on the desktop floor". */
  floorY: number;
}

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

/**
 * Everything the behavior engine needs to bias its transition weights,
 * beyond the pet's own traits/mood. Kept as a small separate type (rather
 * than taking the full PetStatus) so PetStateMachine.ts doesn't need to
 * know about food/bond/name — only the things that actually change
 * *behavior*.
 */
export interface PersonalityContext {
  traits: PersonalityTraits;
  mood: Mood;
  /** Section 27: morning/afternoon/evening/night, computed from the local clock. */
  timeOfDay: TimeOfDay;
  /** Section 12: the interaction kind (e.g. "play", "pet") the user engages
   *  with most, nudging the engine toward the matching activity. Null until
   *  enough history exists. */
  favoriteActivity: string | null;
  /** Section 40 accessibility: when false, "walk" is suppressed entirely —
   *  the pet stays in place (idle/sit/sleep/reactions only). */
  roamingEnabled: boolean;
}

export function timeOfDayFromHour(hour: number): TimeOfDay {
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

export const DEFAULT_PERSONALITY_CONTEXT: PersonalityContext = {
  traits: {
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
  },
  mood: "calm",
  timeOfDay: "afternoon",
  favoriteActivity: null,
  roamingEnabled: true,
};

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  minX: 16,
  maxX: 800,
  floorY: 0,
};
