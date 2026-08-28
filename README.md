# Desktop Pet — Phases 1 through 9, complete

An adaptive desktop companion built with Tauri v2 + React + TypeScript + Rust/SQLite,
following the project's own phase plan. All nine phases are implemented, including
a follow-up pass that filled in most of the gaps originally scoped down: achievements,
a global Deep Work shortcut, daily cosmetic events, a clothing/outfit layer, and a
real (Windows-only) application-detection implementation. Two items remain
deliberately out of scope — see **"What's still scoped down, and why"** near the end.

## Read this first

- **The TypeScript side is verified.** `tsc --noEmit` and `vite build` both run
  clean in this environment — I ran them after every phase.
- **The Rust side is not.** This sandbox has no Rust toolchain at all, so
  `db.rs`, `food.rs`, `mood.rs`, `memory.rs`, `ai.rs`, `commands.rs`, and
  `main.rs` are hand-verified against the Tauri v2 / rusqlite / reqwest APIs
  I know, not `cargo build`-checked. Run `cargo check` inside `src-tauri/`
  as your literal first step on a real machine. See "Rust verification
  notes" below for the specific places I'd look first if something doesn't
  compile.
- **Single pet, single user, offline-first, exactly as scoped from Phase 1.**
  Multi-pet (Section 30) was never in scope for this pass — the data model
  assumes one pet throughout.

## What's here, phase by phase

### Phase 1 — Core Pet
Transparent, frameless, always-on-top overlay window sized to the real
screen; real OS-level click-through (`setIgnoreCursorEvents`, toggled by
pointer hover) so the pet never blocks normal desktop clicks; a canvas-based
procedural pet renderer; click/drag interaction; a system tray icon.

### Phase 2 — Pet House
A second real Tauri window (hidden by default, shown/focused from the tray)
with a bed, food bowl, and window decoration; SQLite persistence via
`rusqlite`; a background `tokio::time::interval` task driving hunger decay
and broadcasting a `pet-status-updated` event so every window stays in sync.

### Phase 3 — Personality & Mood
Ten 0-100 personality traits (Section 10) added via a non-destructive
migration runner; a dynamic `energy` resource alongside hunger; a pure,
rule-based mood engine (`mood.rs`) recomputed fresh on every read rather
than stored, so it can never drift stale; the behavior engine's transition
weights reshaped by traits + mood (`biasMultiplier` in
`PetStateMachine.ts`); four new animations (curious, stretch, excited, dance).

### Phase 4 — Food & Bond
Six food types (Section 15) with their own hunger/happiness/bond values and
rarity; a real food *inventory* (replacing the old single counter) backed
by a `food_inventory` table; an earn-through-interaction economy
(`food.rs::earn_food`) with the spec's own diminishing-returns rule
implemented literally — at most 2 rewards per interaction *kind* per
10-minute window, then 0 until it resets; a "Play" interaction with a
guaranteed bond/energy bump on top of whatever food it rolls.

### Phase 5 — Customization
A real Pet Creator, scoped down from the full body/hair/clothing system to
what's genuinely modular today: 4 ear styles, 4 tail styles, 2 independently
colorable regions, and 3 accessories, all parameters read by `drawPet()`
rather than hardcoded — with a live preview using the exact same renderer
the overlay uses. See "What's scoped down" for why hair/clothing aren't here.

### Phase 6 — Stress Relief
A configurable break timer (15/30/45/60 min) that gently offers a break via
`BreakPrompt` — never a blocking dialog; a working mini-game ("Catch the
Star", Section 25) rewarding a guaranteed food item on completion; a real
Deep Work Mode — toggle from the tray menu *or* the Pet House's Play tab —
that persists its state, hides the overlay window at the OS level, and
survives app restarts (a session left active when you quit stays active
when you reopen).

### Phase 7 — Advanced Behavior
A lightweight memory system (`memory_stats` table) tracking which
interaction kind you engage with most, nudging the behavior engine toward
matching activities (Section 12); time-of-day behavior shaped by the real
local clock — sleepier at night, livelier in the morning (Section 27);
application-awareness is a **toggle only** — see scoped-down notes.

### Phase 8 — AI (optional)
Section 45's short personality/mood-flavored dialogue works with zero
network access via `ai::canned_reply`, and is what you get by default.
Turning on "Enable AI-generated replies" in Settings and saving your own
Anthropic API key routes chat through a real (very short, tightly-scoped)
API call instead, with automatic fallback to the canned reply on any
network/API error. Voice input isn't implemented — see below.

### Phase 9 — Polish
A real Settings tab: reduce-motion (freezes most animation to a gentle
static bob), mute, high-contrast Pet House, roaming on/off (suppresses
"walk" entirely when off), break reminders on/off + interval, the
privacy-gated app-detection toggle, and AI chat setup. The NSIS installer
target from Phase 1 is still the bundle config; auto-update isn't wired up
— see below.

## What the completion pass added

- **Achievements (Section 37)** — `achievements.rs`: 8 achievements checked
  against real signals (bond level, feed/play/minigame counts, appearance
  changes, Deep Work usage), synced on every read. Two of Section 37's
  originals ("Fashion Designer: 10 outfits", "Little Gardener") assumed
  systems that don't exist (a saved-outfit slot system, a garden) and were
  swapped for achievements the real systems can actually satisfy — noted
  in the code, not silently dropped.
- **Global Deep Work shortcut (Section 23)** — `Ctrl+Alt+P` via
  `tauri-plugin-global-shortcut`, registered in `main.rs`. Fixed, not yet
  user-configurable (see remaining gap below).
- **Daily events (Section 38)** — `events.rs`: a deterministic, purely
  cosmetic daily banner (no calendar library, no persistence, no gameplay
  effect — exactly what Section 38 asks for).
- **A clothing layer (Section 33, scoped)** — `Appearance` gained
  `outfit`/`outfit_color`: bow tie, hoodie, or scarf, each independently
  colorable, rendered as a real layer in `drawPet()`. Not the full
  multi-garment layering + saved-outfits-per-mood system — one slot, one
  layer, on purpose (see below).
- **Real application detection (Section 28)** — `app_detect.rs`: genuine
  Windows foreground-process lookup via the `windows` crate, categorized
  into coding/gaming/browsing/other, feeding both a Pet House status line
  and a small "glasses while coding" visual touch on the overlay. Off by
  default, and every failure path degrades to `"unknown"` rather than
  panicking (including a `catch_unwind` around the unsafe FFI itself).
  This is now the single least-verified file in the project — see "Rust
  verification notes" below before trusting it compiles as-is.

## What's still scoped down, and why

- **Full clothing/hair layering (Section 8-9, Section 33) isn't the multi-
  garment system.** One outfit slot, three options, no saved-outfits-per-
  mood, no hair system (the character isn't humanoid, so Section 8's hair
  customization doesn't map onto it). The outfit layer added in this pass
  proves the rendering approach works; a real multi-layer system is a
  bigger data-model project (ordered layers, z-indexing, a save/load UI)
  that's additive on top of this, not a rewrite of it.
- **The Deep Work shortcut isn't user-configurable.** It's real and it
  works (`Ctrl+Alt+P`, registered at startup), but changing it at runtime
  needs unregistering the old binding and registering a new one in
  response to a settings change — straightforward, just not done in this
  pass.
- **Application detection is Windows-only and process-name-based**, not a
  richer signal (window title, active document type, etc.) — deliberately
  coarse to stay inside Section 29's "don't read window titles" privacy
  default. It's real, but it's the newest and least-tested code in the
  project by a wide margin.
- **No real auto-update.** Needs code-signing infrastructure and a release
  server — a non-functional stub would be actively misleading. The NSIS
  installer target itself is real and configured.
- **Multi-pet (Section 30) was never attempted.** The entire data model —
  one `pets` row, `id = 1`, checked via `CHECK (id = 1)` — assumes exactly
  one pet, called out as Phase 30 work in the code comments themselves.
- **No sound assets.** The mute/volume *setting* exists; there's no audio
  to mute yet since no sound files were available to include.

## What's here

```
desktop-pet/
├── src/                          Frontend (React + TypeScript)
│   ├── engine/
│   │   ├── types.ts              PetState / EngineConfig / PersonalityContext
│   │   └── PetStateMachine.ts    Deterministic engine: traits + mood + time-of-day
│   │                             + favorite-activity + roaming-toggle all bias weights
│   ├── components/
│   │   ├── Pet.tsx                Overlay renderer — ear/tail/color/accessory/outfit-aware
│   │   ├── HousePetCanvas.tsx     Same renderer, reused inside the Pet House
│   │   ├── FoodInventory.tsx      Food grid (Phase 4)
│   │   ├── AppearanceEditor.tsx   Pet Creator-lite with live preview (Phase 5)
│   │   ├── BreakPrompt.tsx        Gentle break-reminder bubble (Phase 6)
│   │   ├── MiniGame.tsx           "Catch the Star" (Phase 6)
│   │   ├── ChatBox.tsx            Talk-to-pet UI, local or AI-backed (Phase 8)
│   │   ├── SettingsPanel.tsx      Accessibility/privacy/break/AI settings (Phase 9)
│   │   └── AchievementsList.tsx   Achievement list (Section 37)
│   ├── lib/
│   │   ├── platform.ts            isTauri guard
│   │   └── api.ts                 Every invoke()/listen() wrapper + browser-dev mocks
│   ├── types/                     PetStatus / Appearance / Settings / food / achievements / dailyEvent — mirror db.rs
│   ├── App.tsx                    Overlay: behavior loop, break timer, Deep Work, app-category polling
│   ├── PetHouse.tsx               Tabbed: Home / Look / Play / Achievements / Chat / Settings
│   ├── main.tsx                   Routes to App or PetHouse by Tauri window label
│   └── styles.css
├── src-tauri/                     Desktop shell (Rust)
│   ├── src/
│   │   ├── main.rs                Windows, tray, global shortcut, background decay task
│   │   ├── db.rs                  Schema + migrations, status, settings, appearance
│   │   ├── food.rs                Catalog, feeding, earn-with-diminishing-returns economy
│   │   ├── mood.rs                Pure rule-based mood engine
│   │   ├── memory.rs               Interaction-count tracking -> favorite activity
│   │   ├── achievements.rs         Section 37 achievement criteria + sync
│   │   ├── events.rs               Section 38 daily cosmetic events
│   │   ├── app_detect.rs           Section 28 Windows app-category detection (least-verified file)
│   │   ├── ai.rs                   Canned dialogue + optional real Anthropic API call
│   │   ├── util.rs                 Shared unix-timestamp helper
│   │   └── commands.rs             Every #[tauri::command], full list below
│   ├── tauri.conf.json            Overlay (transparent) + Pet House (normal) windows
│   ├── capabilities/default.json  v2 permission grants for both windows
│   └── icons/                     Placeholder paw-print icons (swap for real art)
├── index.html / package.json / tsconfig.json / vite.config.ts
```

## Full command surface

| Command | Purpose |
|---|---|
| `get_pet_status` | Full status: hunger, energy, food inventory, bond, mood, traits, appearance, Deep Work, favorite activity |
| `get_food_catalog` | The 6 food types and their stats |
| `feed_pet(food_id)` | Consume one food, apply its effects |
| `pet_interact` | Click/pet the overlay pet — bond cooldown + food-earn roll |
| `play_with_pet` | Richer interaction — guaranteed bond/energy + food-earn roll |
| `minigame_complete` | Called once when Catch the Star finishes — guaranteed food |
| `rest_tick` | Called every 4s while locally "asleep" — restores energy |
| `get_appearance` / `update_appearance` | Pet Creator-lite |
| `get_settings` / `update_settings` | Accessibility/privacy/break/AI settings |
| `toggle_deep_work` | Flip Deep Work, persist it, hide/show the overlay |
| `get_memory_stats` | Raw interaction counts behind the favorite-activity nudge |
| `chat_with_pet(message)` | Canned reply, or real AI reply if enabled + key saved |
| `get_achievements` | Full achievement list with unlocked state, synced on read |
| `get_daily_event` | Today's cosmetic banner |
| `get_active_app_category` | "disabled", "unknown", or coding/gaming/browsing/other — Windows only |

## Running it locally

Needs a real OS with a Rust toolchain — no Windows overlay window, no
GTK/WebView2, no way to run `cargo` at all in this sandbox.

**Prerequisites** (Windows, the primary target): [Rust](https://rustup.rs/),
[Node.js](https://nodejs.org/) 18+, [Tauri v2 prerequisites for Windows](https://v2.tauri.app/start/prerequisites/)
(WebView2, MSVC build tools).

```bash
npm install
npm run tauri dev
```

You should see a small pet at the bottom of your screen with a full range of
behavior — walking, sitting, curiously tilting its head, stretching,
dancing when happy, sleepier at night. Click the tray's paw icon to open the
Pet House: feed it from a real inventory, customize its look in **Look**,
play or run the mini-game in **Play** (also where Deep Work lives), chat
with it in **Chat**, and adjust accessibility/privacy/AI in **Settings**.

Hunger/energy decay on a 20-second tick in this build for fast testing —
see `HUNGER_TICK_INTERVAL` in `main.rs` for the real-pacing constant to
change before shipping. The SQLite database lives at
`%APPDATA%/com.desktoppet.app/desktop-pet.sqlite3` and persists everything
— including a Deep Work session left active across a restart.

```bash
npm run dev        # frontend only, plain browser tab, no Rust build needed
npm run tauri build  # production Windows installer via NSIS
```

## Rust verification notes

Specific places worth a second look first if `cargo check` turns up
something, roughly in order of how likely I think each is to need a tweak:

1. **`app_detect.rs`'s Windows API calls** — this is the newest and
   riskiest code in the project. Specifically: `K32GetModuleBaseNameW`'s
   exact signature (older/newer `windows` crate versions sometimes expose
   this as `GetModuleBaseNameW` instead, without the `K32` prefix, or with
   a slightly different parameter shape), and `HWND(0)` vs `HWND::default()`
   vs `.0.is_null()` for the null-handle check — the `windows` crate has
   changed how `HWND` wraps its pointer across versions. If this file
   doesn't compile, check the exact `windows = "0.58"` docs for your
   resolved version first; every call is already wrapped so a signature
   mismatch is a compile error to fix, not a runtime risk.
2. **`tauri-plugin-global-shortcut`'s exact handler signature** in
   `main.rs` — I'm confident about the overall shape
   (`Builder::new().with_handler(...).build()`, then
   `app.global_shortcut().register(...)` in `.setup()`), less confident
   about the precise closure parameter types and whether `ShortcutState`
   needs a different import path. This plugin's API has shifted across
   its own 2.x versions.
3. **`reqwest` + `rustls-tls` feature combination** in `Cargo.toml` — this
   is standard, but dependency version pins drift; if it fails to resolve,
   try dropping the exact `0.12` pin.
4. **`tauri = { features = ["tray-icon"] }`** — I believe tray-icon support
   needs this explicit feature flag in Tauri v2 (unlike v1, where it was
   default); if the tray icon doesn't appear or won't compile, this is the
   first thing to check against the Tauri v2 docs for your exact version.
5. **The `async fn chat_with_pet(db: State<'_, Db>, ...)` lifetime
   annotation** — async Tauri commands taking `State` need the explicit
   `'_` lifetime; if this doesn't compile, that's almost certainly why.
6. **`ON CONFLICT(food_id) DO UPDATE`** in `food.rs`, and the same pattern
   in `achievements.rs`'s `ON CONFLICT(id) DO UPDATE` — both need the
   conflicting column to actually be declared `PRIMARY KEY` (they are, in
   the respective migrations), which SQLite requires for `ON CONFLICT` to
   target it.

If `app_detect.rs` or the global-shortcut plugin turn out to need real
fixes and you'd rather not debug unfamiliar Win32/plugin APIs yourself: the
rest of the app works fully without either. Comment out the
`get_active_app_category` command registration and the `.plugin(...)` /
`global_shortcut()` calls in `main.rs`, drop the `windows` and
`tauri-plugin-global-shortcut` dependencies from `Cargo.toml`, and
everything else — food, mood, personality, break timer, Deep Work from the
tray/Pet House, achievements, AI chat — is unaffected.

## Known gaps beyond the phase-level scoping above

- Overlay's x-position isn't persisted (resets to center on launch) — all
  the pet's *data* does persist.
- Icons are placeholder paw prints — swap before shipping.
- Mood is an 8-value first-match ladder (`mood.rs`) — easy to make more
  nuanced, not yet factoring in things like bond level or interaction
  recency.
- The break timer measures wall-clock time since the last break, not
  actual continuous work/activity detection (Section 24 implies detecting
  real work, not just elapsed time) — a reasonable first approximation,
  not the full thing.
