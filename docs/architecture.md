# Architecture Overview

## System Design

The game follows a **modular event-driven architecture**. All systems are decoupled and communicate through a central **EventBus**.

### Core Layers

```
┌─────────────────────────────────────────┐
│  UI Layer (Menus, HUD, Overlays)       │
├─────────────────────────────────────────┤
│  Game Logic Layer (Match, Rules, AI)    │
├─────────────────────────────────────────┤
│  Entity Layer (Character, Ball, Arena)  │
├─────────────────────────────────────────┤
│  Physics Layer (Havok)                  │
├─────────────────────────────────────────┤
│  Rendering Layer (BabylonJS)            │
├─────────────────────────────────────────┤
│  EventBus (All-to-All Communication)    │
└─────────────────────────────────────────┘
```

## System Responsibilities

### Core (`src/core/`)

**Engine.ts** - Singleton BabylonJS Engine
- Creates WebGL context
- Manages render loop
- Handles window resize

**SceneManager.ts** - Scene lifecycle
- Switch between menu/match scenes
- Load/unload scenes
- Manage camera per scene

**AssetManager.ts** - Asset loading
- Queue all textures, models, audio
- Progress tracking
- Caching

**EventBus.ts** - Central pub/sub
- `emit(event, data)` - broadcast
- `on(event, callback)` - subscribe
- `off(event, callback)` - unsubscribe

**GameLoop.ts** - Main update cycle
- Calls `update(delta)` on all entities
- Maintains correct order (physics → logic → rendering)

### Systems (`src/systems/`)

**InputManager** - Keyboard + Gamepad
- Maps inputs to GameActions
- Per-player input state
- Handles rebinding

**PhysicsWorld** - Havok initialization
- Gravity setup
- Physics materials
- Collision groups

**CollisionDetector** - Collision observation
- Listens to Havok events
- Tags meshes with metadata
- Emits typed collision events

**CameraManager** - Camera control
- Follow camera tracking
- Zoom for 2v2 mode
- Smooth lerping

**RenderPipeline** - Post-processing
- Bloom, chromatic aberration
- Intesify effects on events
- Surreal visual effects

### Entities (`src/entities/`)

**Character.ts** - Player controller
- Mesh + skeleton + physics
- State machine (IDLE → MOVING → KICKING)
- Input handling

**Ball.ts** - Ball physics body
- Sphere with Havok aggregate
- Kick impulse application
- Effect modifications

**Arena.ts** - Environment
- Skybox, fog, lighting
- Gravity modifiers
- Ambient particles

**TeqballTable.ts** - Static physics table
- Loaded from model
- Mesh tagging for collision detection
- Net mesh

### Gameplay (`src/gameplay/`)

**MatchManager** - Match state
- Score tracking
- Set wins
- Server rotation
- Observables for UI updates

**RuleEngine** - Pure rule evaluation
- `evaluatePlayerTouch()` → fault or valid
- `evaluateBoundary()` → in/out
- `recordPoint()` → score + set win?
- No side effects, fully testable

**SuperpowerSystem** - Ability management
- Cooldown tracking per ability
- Activation / deactivation
- Duration countdown

**Abilities** (GravityFlip, SpeedBurst, etc)
- Implement `IAbility` interface
- `activate()` - start effect
- `deactivate()` - cleanup
- `tick()` - update duration/cooldown

### Animation (`src/animation/`)

**AnimationSystem** - AnimationGroup management
- Holds map of state → animation
- Plays/stops animations
- Phase 4: Blending between clips

**AnimationEvents** - Frame-based triggers
- Fire events at specific frames
- Used for kick timing windows
- Synchronize VFX with animation

### VFX (`src/vfx/`)

**VFXSystem** - Particle effects
- Loads particle JSON configs
- `playEffect(id, position)` → spawn
- Manages emitter lifecycles

**ParticleLibrary** - Effect ID mapping
- Maps "kick_impact" → config path
- Single source of truth

**ShaderLibrary** - Custom materials
- NodeMaterial JSON loading
- Apply shader to mesh

**TrailManager** - Ball trail mesh
- Tracks ball movement
- Modulates color/width by speed

### UI (`src/ui/`)

**UIManager** - AdvancedDynamicTexture manager
- Owns all UI layers
- Show/hide by scene state

**MainMenu** - Start screen
- Play, Settings, Quit buttons

**CharacterSelect** - Character picker
- 3D model previews
- Stats display

**ArenaSelect** - Arena picker
- Visual preview
- Difficulty/gravity info

**HUD** - In-match overlay
- Score (real-time)
- Cooldown bars
- Serve indicator

**PointAnnouncement** - Score popup
- Shows for 2 seconds
- Fades out

**PostMatch** - Results screen
- Winner, stats table
- Play Again / Menu buttons

**CooldownRing** - Visual indicator
- Arc fills as cooldown recharges
- Glows when ready

### Audio (`src/audio/`)

**AudioSystem** - Sound management
- BabylonJS Sound + Howler.js
- `play(id)` - one-shot
- `playLoop(id)` - background

**MusicManager** - Background music
- Cross-fade between arena tracks
- Intensify on match point

**AudioLibrary** - Sound ID mapping
- Central reference for all sounds

## Event Flow Example: Kick

```
User presses KICK button
         ↓
InputManager emits 'player:kick'
         ↓
Character listens, enters KICKING state
         ↓
AnimationSystem plays kick animation
         ↓
AnimationEvents fires 'kick:frame:20'
         ↓
Ball receives kick impulse
         ↓
PhysicsWorld simulates ball trajectory
         ↓
CollisionDetector detects ball-table collision
         ↓
RuleEngine.evaluatePlayerTouch() validates
         ↓
MatchManager records touch count
         ↓
EventBus emits 'ball:kicked' with metadata
         ↓
VFXSystem plays kick particle effect
         ↓
AudioSystem plays kick SFX
         ↓
HUD updates Touch Counter display
```

## Data Flow

### Constants
All magic numbers in `constants.ts`:
```ts
BALL_RESTITUTION = 0.75
CHARACTER_SPEED = 8 // m/s
KICK_POWER_MAX = 150
```

**Never** hardcode values. Always reference constants.

### Interfaces (`interfaces.ts`)
Contracts for all major systems:
```ts
interface ICharacter {
  readonly position: Vector3
  playAnimation(name: string): void
}
```

All implementations must satisfy interfaces. Enables:
- Swapping implementations (e.g., local AI vs networked)
- Type checking at compile time
- Clear contracts between systems

### JSON Configs
Character/Arena/Ability configs loaded at startup:
```json
{
  "id": "flamingo",
  "stats": { "speed": 8.5, "power": 100 }
}
```

Loaded by `AssetManager`, parsed by respective systems.

## Dependency Graph

```
BabylonEngine (bottom)
    ↓
PhysicsWorld, InputManager, EventBus
    ↓
GameLoop, SceneManager, AssetManager
    ↓
Entities (Character, Ball, Arena)
    ↓
Systems (CameraManager, RenderPipeline, AudioSystem)
    ↓
Gameplay (MatchManager, RuleEngine, SuperpowerSystem)
    ↓
UI & VFX (top)
```

**No circular dependencies.** If A depends on B, B cannot depend on A.

## Phase-by-Phase Build-Out

**Phase 0:** Engine + interfaces only
**Phase 1:** Add Ball + Table + Physics
**Phase 2:** Add Character + Controller
**Phase 3:** Add MatchManager + Rules
**Phase 4:** Add VFX + UI + Audio
**Phase 5:** Optimize + Deploy

This structure ensures:
- ✅ Clear ownership per developer
- ✅ Easy to test (EventBus mocking)
- ✅ Scalable (add features without refactoring core)
- ✅ Debuggable (trace events instead of call stacks)
