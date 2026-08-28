import {
  DEFAULT_ENGINE_CONFIG,
  DEFAULT_PERSONALITY_CONTEXT,
  EngineConfig,
  PersonalityContext,
  PetActivity,
  PetState,
} from "./types";

/**
 * Phase 3 behavior engine.
 *
 * Still a plain deterministic-ish state machine (Section 35: "do not rely
 * on random actions" — the *structure* isn't random, only which allowed
 * transition wins a weighted roll). What's new versus Phase 1 is that the
 * weights are no longer constants: `biasMultiplier` reshapes them every
 * decision based on the pet's personality traits and current mood, so a
 * lazy, low-energy pet visibly sits and sleeps more, a curious one
 * wanders into "curious" more often, and a pet in an "excited" mood is
 * more likely to dance or bounce than one that's "bored".
 */

const BASE_TRANSITIONS: Record<
  PetActivity,
  { next: PetActivity; weight: number; duration: [number, number] }[]
> = {
  idle: [
    { next: "walk", weight: 5, duration: [1.5, 4] },
    { next: "sit", weight: 2, duration: [2, 5] },
    { next: "idle", weight: 3, duration: [1, 2.5] },
    { next: "sleep", weight: 1, duration: [6, 14] },
    { next: "curious", weight: 1.5, duration: [1.5, 3] },
    { next: "dance", weight: 0.8, duration: [1.5, 2.5] },
  ],
  walk: [
    { next: "idle", weight: 4, duration: [1, 3] },
    { next: "sit", weight: 2, duration: [2, 4] },
    { next: "walk", weight: 2, duration: [1.5, 3.5] },
  ],
  sit: [
    { next: "idle", weight: 4, duration: [1, 2] },
    { next: "walk", weight: 3, duration: [1.5, 3] },
    { next: "sleep", weight: 1, duration: [5, 10] },
    { next: "stretch", weight: 1.2, duration: [1, 1.6] },
  ],
  sleep: [
    { next: "stretch", weight: 2, duration: [1, 1.6] },
    { next: "idle", weight: 1, duration: [1, 2] },
  ],
  curious: [{ next: "idle", weight: 1, duration: [1, 2] }],
  stretch: [
    { next: "idle", weight: 2, duration: [1, 2] },
    { next: "walk", weight: 1, duration: [1.5, 3] },
  ],
  excited: [
    { next: "dance", weight: 2, duration: [1.5, 2.5] },
    { next: "idle", weight: 1, duration: [1, 2] },
  ],
  dance: [{ next: "idle", weight: 1, duration: [1, 2] }],
  drag: [{ next: "idle", weight: 1, duration: [0.5, 1] }],
  happy: [
    { next: "excited", weight: 1, duration: [1, 1.5] },
    { next: "idle", weight: 2, duration: [1, 2] },
  ],
  jump: [{ next: "idle", weight: 1, duration: [0.5, 1] }],
};

function randRange([min, max]: [number, number]): number {
  return min + Math.random() * (max - min);
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Returns a multiplier applied to a transition's base weight. >1 makes an
 * activity more likely for this pet/mood/time/history right now, <1 less
 * likely. Every branch is intentionally simple and explainable rather than
 * a black-box formula — Section 10/11's whole point is that traits and
 * mood should produce *legible* behavior a user can learn to read.
 */
function biasMultiplier(to: PetActivity, ctx: PersonalityContext): number {
  const { traits, mood, timeOfDay, favoriteActivity } = ctx;

  // Section 40: roaming can be turned off entirely — walking away is
  // suppressed no matter what traits/mood would otherwise suggest.
  if (to === "walk" && !ctx.roamingEnabled) return 0.02;

  let m: number;
  switch (to) {
    case "walk":
      m = clamp(
        0.6 + traits.energy / 100 - traits.laziness / 150 + (mood === "excited" ? 0.4 : 0),
        0.15,
        2.5
      );
      break;
    case "sleep":
      m = clamp(
        0.3 + traits.laziness / 80 + (mood === "sleepy" ? 2 : 0) - traits.energy / 200,
        0.1,
        4
      );
      break;
    case "sit":
      m = clamp(0.5 + traits.laziness / 120 + (mood === "bored" ? 0.4 : 0), 0.2, 2);
      break;
    case "curious":
      m = clamp(0.2 + traits.curiosity / 80 + (mood === "curious" ? 1.2 : 0), 0.05, 3);
      break;
    case "stretch":
      m = clamp(0.4 + (100 - traits.laziness) / 150, 0.2, 1.8);
      break;
    case "excited":
      m = clamp(0.15 + traits.playfulness / 100 + (mood === "excited" ? 1.5 : 0), 0.05, 3.5);
      break;
    case "dance":
      m = clamp(0.15 + traits.playfulness / 120 + (mood === "happy" ? 0.5 : 0), 0.05, 3);
      break;
    default:
      m = 1;
  }

  // Section 27: time-of-day mood, layered on top of the trait/mood bias
  // rather than replacing it — a lazy pet is still lazier than an
  // energetic one at 3am, just both are sleepier than they'd be at noon.
  if (timeOfDay === "night") {
    if (to === "sleep") m *= 1.8;
    if (to === "walk" || to === "excited" || to === "dance") m *= 0.5;
  } else if (timeOfDay === "morning") {
    if (to === "walk" || to === "excited" || to === "curious") m *= 1.3;
    if (to === "sleep") m *= 0.6;
  } else if (timeOfDay === "evening") {
    if (to === "sit" || to === "curious") m *= 1.15;
    if (to === "excited" || to === "dance") m *= 0.85;
  }

  // Section 12: nudge toward whatever the user engages with most. This is
  // deliberately a small effect (a favorite doesn't override mood/traits,
  // it just tips the balance) rather than a hard override.
  if (favoriteActivity === "play" && (to === "dance" || to === "excited")) m *= 1.25;
  if (favoriteActivity === "pet" && to === "happy") m *= 1.2;
  if (favoriteActivity === "feed" && to === "sit") m *= 1.1;

  return m;
}

function pickNextActivity(
  current: PetActivity,
  ctx: PersonalityContext
): { activity: PetActivity; duration: number } {
  const options = BASE_TRANSITIONS[current];
  const weighted = options.map((o) => ({
    ...o,
    weight: o.weight * biasMultiplier(o.next, ctx),
  }));
  const totalWeight = weighted.reduce((sum, o) => sum + o.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const option of weighted) {
    roll -= option.weight;
    if (roll <= 0) {
      return { activity: option.next, duration: randRange(option.duration) };
    }
  }
  const fallback = weighted[weighted.length - 1];
  return { activity: fallback.next, duration: randRange(fallback.duration) };
}

export function createInitialState(config: EngineConfig = DEFAULT_ENGINE_CONFIG): PetState {
  return {
    x: (config.minX + config.maxX) / 2,
    y: config.floorY,
    facing: "right",
    activity: "idle",
    activityTimeLeft: randRange([1, 3]),
    walkSpeed: 40,
    isDragging: false,
  };
}

/**
 * Advance the state machine by `dt` seconds. Pure function: takes a state
 * plus the current personality context, returns the next state. Keeping
 * this pure (no hidden dependency on a global "current traits") makes it
 * trivial to unit test with different pets/moods side by side.
 */
export function step(
  state: PetState,
  dt: number,
  config: EngineConfig,
  ctx: PersonalityContext = DEFAULT_PERSONALITY_CONTEXT
): PetState {
  if (state.isDragging) {
    // While dragging, the engine idles — position is driven externally by
    // pointer events, not by this function.
    return state;
  }

  let { activity, activityTimeLeft, x, facing, walkSpeed } = state;

  if (activity === "walk") {
    const direction = facing === "right" ? 1 : -1;
    x += direction * walkSpeed * dt;

    // Bounce off the screen edges and flip to face the new direction.
    if (x <= config.minX) {
      x = config.minX;
      facing = "right";
    } else if (x >= config.maxX) {
      x = config.maxX;
      facing = "left";
    }
  }

  activityTimeLeft -= dt;

  if (activityTimeLeft <= 0) {
    const decision = pickNextActivity(activity, ctx);
    activity = decision.activity;
    activityTimeLeft = decision.duration;
    if (activity === "walk") {
      // Base speed randomized for variety, then scaled by energy/laziness so
      // a high-energy, low-laziness pet visibly moves faster than a lazy one.
      const base = 30 + Math.random() * 30;
      const traitScale = clamp(0.6 + ctx.traits.energy / 150 - ctx.traits.laziness / 250, 0.4, 1.6);
      walkSpeed = base * traitScale;
      if (Math.random() < 0.5) {
        facing = facing === "right" ? "left" : "right";
      }
    }
  }

  return { ...state, activity, activityTimeLeft, x, facing, walkSpeed };
}

/**
 * Interrupts whatever the pet is doing with a short reaction to a click.
 * Which reaction depends on mood/traits: a pet that's already excited (or
 * simply very playful) is more likely to burst into "excited" than settle
 * for a plain "happy".
 */
export function triggerReaction(state: PetState, ctx: PersonalityContext): PetState {
  const goExcited =
    ctx.mood === "excited" || (ctx.traits.playfulness > 75 && Math.random() < 0.5);
  const activity: PetActivity = goExcited ? "excited" : "happy";
  return {
    ...state,
    activity,
    activityTimeLeft: activity === "excited" ? 1.5 : 1.2,
  };
}

export function beginDrag(state: PetState): PetState {
  return { ...state, isDragging: true, activity: "drag" };
}

export function endDrag(state: PetState, x: number, y: number): PetState {
  return {
    ...state,
    isDragging: false,
    x,
    y,
    activity: "idle",
    activityTimeLeft: randRange([0.8, 1.6]),
  };
}
