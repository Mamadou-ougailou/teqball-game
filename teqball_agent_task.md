# TEQBALL ARCADE — Coding Agent Implementation Task
### BabylonJS + TypeScript — Full System Specification

---

## Quick Reference

| Item | Value |
|---|---|
| Engine | BabylonJS 6.x + Havok physics |
| Language | TypeScript (strict mode) |
| Bundler | Vite |
| Debug URL | `http://localhost:5173/?debug` |
| Scene file | `bleacher.glb` (court + table + serve lines) |
| Player models | `messi.glb`, `howard.glb`, `maradona.glb` |
| Playable characters | Messi, Maradona (external player chooses) |
| AI opponent | Howard (always AI, greedy strategy) |
| Animation format | All animations baked into each character `.glb` as named `AnimationGroup`s |
| Physics scope | Gravity + table bouncing only. All other ball motion is code-controlled. |

---

## 1. Project Overview and Goals

This document is a complete implementation specification for a coding agent. It covers every system required to produce a playable teqball arcade game with two human-selectable characters (Messi and Maradona) and one permanent AI opponent (Howard). The game targets an arcade feel: intentional, controlled ball trajectories with scripted arc motion, not a pure physics simulation.

### 1.1 Arcade Physics Contract

The following contract defines what physics does and does not control. The agent must not deviate from this.

| System | Controlled by |
|---|---|
| Ball gravity between touches | Havok physics (active at all times) |
| Ball bounce off table surface | Havok physics collision response |
| Ball trajectory after a kick | Code: `BallGuide.computeArcVelocity()` sets velocity directly |
| Ball trajectory after reception | Code: near-vertical arc, height chosen by system |
| Ball trajectory after preparation | Code: arc chosen to optimise kick position |
| Player movement on court | Code: discrete grid-box stepping, not physics bodies |
| Player rotation toward ball | Code: `mesh.lookAt()` every frame while ball is alive |
| Contact detection | Code: bone world position vs ball position distance check |
| Ball snap at contact | Code: one-frame snap to bone position before impulse |

### 1.2 Debug Mode

When the URL contains `?debug`, the game launches in debug mode automatically. In debug mode:

- Two AI players (Howard vs Howard, or Howard vs Maradona-AI) play against each other continuously
- All grid boxes are rendered as wireframe volumes with labels
- Table zone squares are rendered as coloured overlays showing current probability weights
- The active animation name, current phase, ball predicted arrival position, and target zone are displayed as a HUD overlay
- Bone position markers (red wireframe spheres, radius 0.08) follow the active bone every frame
- Contact reach radius is rendered as a yellow sphere at contact frame
- No external player input is processed in debug mode

> **CONSTRAINT:** The debug endpoint is the primary validation environment. The agent must ensure every system listed in this document is visually verifiable from the debug view before considering implementation complete.

---

## 2. Asset Inventory

### 2.1 Scene

`bleacher.glb` contains the full environment. At load time the agent must measure the following from mesh bounds at runtime using `mesh.getBoundingInfo()`:

- Court outer boundary (min/max X and Z)
- Table surface Y position (table top face)
- Net X position and height
- Serve line Z positions for both players

> **NOTE:** Do not hardcode world coordinates. Derive them from the loaded mesh at runtime and store in a `SceneMetrics` singleton used by all other systems.

### 2.2 Character Models

Each model file contains the full skeleton and all animations as named `AnimationGroup`s. The agent must load all three at startup and keep them in a `CharacterRegistry` even if not currently spawned.

| File | Role | Controlled by |
|---|---|---|
| `messi.glb` | Playable character option 1 | External player or AI in debug |
| `howard.glb` | Permanent AI opponent | AI (greedy) |
| `maradona.glb` | Playable character option 2 | External player or AI in debug |

### 2.3 Animation Manifest

All timings are at 30 fps. `NoFrames` is the total frame count of the clip. `contactFrame` is the frame at which the ball impulse fires. `BLH` (Ball Leaves Hand) applies only to serve animations and is the frame at which the ball detaches from the hand bone and begins its toss arc.

| Animation name | Contact frame | BLH frame | Total frames | Phase | Notes |
|---|---|---|---|---|---|
| RightKneeReception | 40 | — | 76 | Reception | |
| CenterHeadKick | 24 | — | 61 | Kick | |
| ChestKick | 35 | — | 67 | Kick | |
| ChestPrepLeft | 51 | — | 61 | Preparation | Ball set left |
| ChestPrepRight | 50 | — | 61 | Preparation | Ball set right |
| ChestReception | 51 | — | 74 | Reception | |
| HeadServeLeft | 73 | 26 | 121 | Serve | BLH=26, contact=73 |
| HeadServeRight | 69 | 28 | 104 | Serve | BLH=28, contact=69 |
| InnerLeftFootReception | 19 | — | 40 | Reception | |
| InnerRightFootReception | 48 | — | 72 | Reception | |
| LeftFootKick | 40 | — | 85 | Kick | |
| LeftHeadKick | 24 | — | 52 | Kick | |
| LeftKneeReception | 53 | — | 69 | Reception | |
| RightFootKick | 23 | — | 75 | Kick | |
| RightHeadKick | 16 | — | 53 | Kick | |
| ServeLeftFoot | 65 | 21 | 120 | Serve | BLH=21, contact=65 |
| ServeRightFoot | 92 | 44 | 120 | Serve | BLH=44, contact=92 |
| Idle | — | — | 40 | Idle | Loops |
| jogBackward | — | — | 53 | Locomotion | Loops |
| JogForward | — | — | 72 | Locomotion | Loops |
| JogStrafeLeft | — | — | 41 | Locomotion | Loops |
| JogStrafeRight | — | — | 40 | Locomotion | Loops |
| Celebration1 | — | — | 102 | Result | Plays on point won |
| Celebration2 | — | — | 113 | Result | Alternate celebration |
| Defeat | — | — | 201 | Result | Plays on point lost |

> **NOTE:** `ServeRightFoot` had ambiguous source data (BLH=44 same as contact). Treat BLH=44 and contact=92 as the correct interpretation based on animation timing context.

---

## 3. Space Grid System

The play area is divided into a 3D grid of equal-volume boxes. This grid is the substrate for controlling ball arcs, player positioning, animation selection, and probability weighting. All measurements derive from `SceneMetrics` at runtime.

### 3.1 Grid Dimensions

| Axis | Divisions | Labels | Purpose |
|---|---|---|---|
| X (horizontal) | 5 | SuperLeft, MidLeft, Center, MidRight, SuperRight | Left-right positioning |
| Y (height) | 4 | Low, Mid, High, VeryHigh | Ball height at each phase |
| Z (depth) | 3 | NearLine, TableLevel, FarLine | Depth from player perspective |

Total boxes: 5 × 4 × 3 = 60. Each box is identified by a `GridCell` type:

```ts
type GridCell = { x: XZone; y: YZone; z: ZZone }
type XZone    = 'SuperLeft' | 'MidLeft' | 'Center' | 'MidRight' | 'SuperRight'
type YZone    = 'Low' | 'Mid' | 'High' | 'VeryHigh'
type ZZone    = 'NearLine' | 'TableLevel' | 'FarLine'
```

### 3.2 Grid Construction

The agent must compute cell boundaries at runtime from `SceneMetrics`:

- **X:** divide court width equally into 5 bands
- **Y:** Low = table surface to 0.6 m above · Mid = 0.6–1.2 m · High = 1.2–1.8 m · VeryHigh = 1.8 m and above
- **Z:** NearLine = player serve line to 1/3 depth · TableLevel = table zone · FarLine = net to opponent serve line

### 3.3 Grid Utilities

Implement a `GridSystem` class with the following methods:

```ts
GridSystem.cellFromWorld(pos: Vector3): GridCell
GridSystem.cellCenter(cell: GridCell): Vector3
GridSystem.cellBounds(cell: GridCell): { min: Vector3; max: Vector3 }
GridSystem.adjacentCells(cell: GridCell): GridCell[]
```

### 3.4 Table Zone Grid

The table is divided into 2 × 3 squares per player side (6 squares per side, 12 total). Columns are Left / Center / Right. Rows are NetRow (closest to net) and EdgeRow (closest to player edge).

| Zone ID | Column | Row | Description |
|---|---|---|---|
| TL_NET_L | Left | NetRow | Opponent's left near net |
| TL_NET_C | Center | NetRow | Opponent's center near net |
| TL_NET_R | Right | NetRow | Opponent's right near net |
| TL_EDGE_L | Left | EdgeRow | Opponent's left near edge |
| TL_EDGE_C | Center | EdgeRow | Opponent's center near edge |
| TL_EDGE_R | Right | EdgeRow | Opponent's right near edge |

> **NOTE:** The same 6 zones exist mirrored for each player side. Prefix with player identifier when storing: `P1_TL_NET_L`, `P2_TL_NET_L`, etc.

---

## 4. Ball System

### 4.1 Ball Properties

The ball mesh is a sphere. Its visual radius must be set so it visually fills approximately 80% of one grid box. Compute the box size from `SceneMetrics` at runtime and set the ball diameter accordingly. The physics shape uses the same radius for Havok collision.

### 4.2 Ball State Machine

| State | Description | Physics active? |
|---|---|---|
| PARENTED | Ball attached to hand bone (serve only). Follows bone transform. | No |
| TOSS | Ball released at BLH frame. Scripted arc upward to toss peak. | No (scripted) |
| LIVE | Ball in play. Physics gravity active. Velocity set by code after each touch. | Yes (gravity only) |
| BOUNCING | Ball has hit table surface. Havok handles bounce response. Returns to LIVE. | Yes (full) |
| DEAD | Ball has hit ground (not table). Rally ends. Triggers point award. | No |
| IDLE_RESET | Ball teleports to serve position for next rally start. | No |

### 4.3 Scripted Arc Motion

After every touch (reception, preparation, kick), the agent sets the ball velocity directly using `BallGuide.computeArcVelocity()`. Havok gravity then acts on this velocity naturally producing a parabolic arc. The agent must not disable gravity between touches; the computed velocity already accounts for it.

```ts
static computeArcVelocity(
  from: Vector3,
  to: Vector3,
  arcHeight: number,
  gravity = 9.8
): Vector3
```

**Formula:**

- `tUp   = sqrt(2 * arcHeight / gravity)`
- `tDown = sqrt(2 * max(0.01, arcHeight - (to.y - from.y)) / gravity)`
- `tTotal = tUp + tDown`
- `vx = (to.x - from.x) / tTotal`
- `vz = (to.z - from.z) / tTotal`
- `vy = gravity * tUp`

### 4.4 Ball Alive Tracking

The ball is considered **alive** when its state is `LIVE` or `BOUNCING`. When alive, all players rotate to face the ball every frame. When the ball is `DEAD` or `PARENTED`, players face the table (toward net).

---

## 5. The Three Touch Phases

A teqball rally consists of three distinct touch types per player turn. Each has different ball trajectory goals, animation sets, and timing logic. The serve counts as an additional entry state and follows separate rules.

### 5.1 Phase Overview

| Phase | Touch | Ball trajectory goal | Player control | Typical arc height |
|---|---|---|---|---|
| Serve | 0 (entry) | Place ball in play, cross net | Full (anim chosen at start) | 1.5–2.0 m |
| Reception | 1st | Go near-vertical, gain height for prep | None once ball contacts | 1.8–2.5 m above contact |
| Preparation | 2nd | Set ball at optimal kick position | Position player before contact | 0.6–1.5 m depending on target kick |
| Kick | 3rd | Cross net fast, target table zone | Choose target zone + speed | 0.4–1.8 m (varies by kick type) |

### 5.2 Reception Phase

Reception begins when the ball crosses into the player's half of the court and ends when a reception animation's contact frame fires.

1. Ball enters player half. `RallyManager` sets `activePhase = RECEPTION`.
2. `PlayerController` predicts ball arrival position using `BallPredictor.ballAtArrival()`.
3. `AnimSelector.selectReception(arrivalPos)` picks the appropriate reception animation based on ball height and X zone.
4. Animation starts with `speedRatio` adjusted so `contactFrame` lands at ball arrival time (`AnimTimer.computeSpeedRatio`).
5. At `contactFrame`: bone position vs ball position checked. If within `reach * 1.5`: snap ball to bone, apply near-vertical upward velocity.
6. Reception arc: `arcHeight = 2.0 m` above contact point. Target X/Z = same position or slight center correction. This gives time for preparation.
7. Phase transitions to PREPARATION.

**Reception animation selection by ball position:**

| Ball height at arrival | X zone | Animation |
|---|---|---|
| Low (below 0.6 m) | Any | `InnerRightFootReception` or `InnerLeftFootReception` (prefer foot matching ball side) |
| Mid (0.6–1.2 m) | Any | `RightKneeReception` or `LeftKneeReception` |
| High (1.2–1.8 m) | Any | `ChestReception` |
| VeryHigh (> 1.8 m) | Any | `RightKneeReception` (extended) or `ChestReception` |

### 5.3 Preparation Phase

Preparation begins immediately after a successful reception. The player has control over the ball position before the kick.

1. Ball is in air on near-vertical arc from reception.
2. `PlayerController` evaluates current grid cell of ball's predicted peak vs ideal kick cell.
3. If player is not in optimal grid cell for the desired kick: trigger a move to the better cell (locomotion animation, discrete grid step).
4. `AnimSelector.selectPreparation(ballPeakCell, targetKickSide)` picks `ChestPrepLeft` or `ChestPrepRight` based on which side the player intends to kick.
5. Preparation contact frame fires: ball is set to a scripted arc targeting the player's ideal kick contact position (chest height, 0.3–0.5 m in front of player).
6. Phase transitions to KICK.

> **CONSTRAINT:** The preparation animation's purpose is to place the ball at the perfect position for the kick. The agent must compute the prep ball arc target based on which kick animation will follow and where its active bone will be at its contact frame.

### 5.4 Kick Phase

Kick is the final touch. The external player chooses the target table zone and relative speed before this phase executes.

1. External player has made a target zone choice (or system assists if no choice made).
2. `AnimSelector.selectKick(ballPos, targetZone, playerPos)` picks the kick animation.
3. Animation starts with speed ratio adjusted to contact frame timing.
4. At `contactFrame`: bone snap + `BallGuide.computeArcVelocity(bonePos, targetZonePoint, arcHeight)`.
5. Variance applied via `BallGuide.addVariance(zone, accuracy)`. Accuracy from `AnimConfig`.
6. Ball velocity set. Phase transitions to opponent's RECEPTION.

### 5.5 Kick Animation Selection by Ball Position

| Ball height at kick | X zone | Preferred animation | Arc height out | Accuracy |
|---|---|---|---|---|
| Low (< 0.6 m) | Any | `RightFootKick` or `LeftFootKick` | 0.6–0.9 m | 0.85 |
| Mid (0.6–1.2 m) | Center / Right | `RightFootKick` | 0.8–1.2 m | 0.85 |
| Mid (0.6–1.2 m) | Left | `LeftFootKick` | 0.8–1.2 m | 0.85 |
| High (1.2–1.8 m) | Any | `ChestKick` | 1.0–1.4 m | 0.75 |
| High (1.2–1.8 m) | Left | `LeftHeadKick` | 1.2–1.6 m | 0.70 |
| High (1.2–1.8 m) | Right | `RightHeadKick` | 1.2–1.6 m | 0.70 |
| VeryHigh (> 1.8 m) | Center | `CenterHeadKick` | 1.6–2.0 m | 0.65 |
| VeryHigh (> 1.8 m) | Left | `LeftHeadKick` | 1.8–2.2 m | 0.65 |
| VeryHigh (> 1.8 m) | Right | `RightHeadKick` | 1.8–2.2 m | 0.65 |

---

## 6. Serve System

### 6.1 Serve Rules

- At match start: coin flip (`Math.random() < 0.5`) determines first server.
- After each point: the player who **lost** the point serves next.
- Server spawns at their serve line in `Idle` animation, ball parented to right hand bone.
- Receiver spawns at their serve line in `Idle` animation, no ball, facing table.

### 6.2 Serve Animation Sequence

| Stage | Frames | What happens |
|---|---|---|
| Pre-toss (0 → BLH) | Ball parented to `RightHand` bone. Follows bone transform exactly. Player winds up. | |
| Toss (BLH → contact) | Ball detaches from bone. Scripted arc upward. Arc peaks at height that places ball at correct position for contact frame. Height computed from animation timing: `tossHeight = 0.5 * g * ((contact - BLH) / 30)²` | |
| Contact (contact frame) | Contact check: if ball within reach of active serve bone, snap + apply kick velocity toward a random valid table zone on opponent side. Serve always targets opponent half. | |
| Follow-through (contact → end) | Animation plays to completion. Returns to Idle. Rally starts. | |

### 6.3 Serve Animation Selection

The serving player randomly selects one of the four serve animations at the start of each serve (uniform random). The external player does not choose the serve animation.

- `HeadServeLeft`
- `HeadServeRight`
- `ServeLeftFoot`
- `ServeRightFoot`

### 6.4 Ball Parenting Implementation

Before the serve animation starts:

1. Locate the RightHand bone: `skeleton.bones.find(b => b.name === 'mixamorig:RightHand')`
2. On every frame from 0 to BLH: compute bone world matrix, set `ball.mesh.position = Vector3.TransformCoordinates(Vector3.Zero(), boneMatrix * meshWorldMatrix)`
3. At BLH frame: unparent ball, set `ballState = TOSS`, compute toss arc velocity

> **NOTE:** Do not actually parent the mesh in the Babylon scene graph. Manually update position every frame to avoid transform inheritance issues with physics.

---

## 7. Player Control System

### 7.1 External Player Control Windows

| Window | Opens when | Closes when | What player controls |
|---|---|---|---|
| Pre-reception movement | Opponent kicks ball (ball crosses net) | Ball contacts controlled player | Move player freely (WASD / gamepad) |
| Target selection | Ball crosses net toward player | Player's kick contact frame fires | Choose target table zone + speed tier |
| Post-kick (none) | Kick contact frame fires | Ball reaches opponent | Nothing (fully automatic) |

### 7.2 Movement Input

During the pre-reception movement window:

- **WASD or left stick:** move player in court XZ plane
- Movement is **discrete**: player snaps between grid cell centers
- Speed: one grid cell per 0.25 seconds (4 cells/sec max)
- Locomotion animation selected from current velocity direction
- Player always faces ball while ball is alive (`mesh.lookAt` updated every frame, Y-axis only)
- Player faces table (net direction) when ball is DEAD or PARENTED

### 7.3 Target Zone Input

During the target selection window the player sees a visual overlay on the opponent's table showing the 6 zone squares with colour coding. The player selects a zone:

- **Keyboard:** arrow keys highlight zone, Enter confirms
- **Gamepad:** right stick direction maps to zone column, button A confirms
- **If no input before kick contact frame:** system auto-selects using AI greedy logic

### 7.4 Speed Tier Input

| Tier | Input | Speed multiplier | Accuracy penalty |
|---|---|---|---|
| Normal | No modifier held | 1.0× | None |
| Fast | Hold Shift / L2 | 1.3× | −0.10 accuracy |
| Maximum | Hold Ctrl / R2 | 1.6× | −0.20 accuracy |

### 7.5 Player Assistance

If the external player has not moved the player to a cell where the selected target zone is reachable:

1. System detects the mismatch during the target selection window.
2. Plays a subtle highlight on the optimal cell (pulse effect on grid overlay).
3. If player ignores and kick fires: best available zone given current position is substituted. HUD shows **Assisted** indicator.

---

## 8. AI System (Howard)

### 8.1 AI Strategy: Greedy

Howard plays greedily: at every decision point, Howard selects the action that maximises difficulty for the opponent. Decisions are made with a small stochastic variance (15% random substitution) to avoid being perfectly predictable.

### 8.2 AI Decision Points

| Decision | AI logic |
|---|---|
| Pre-reception movement | Move to the grid cell that maximises reach accuracy for the predicted ball arrival position. If multiple cells equally good, prefer the one closer to center. |
| Target zone selection | Score each table zone: `score = distanceFromOpponent * 1.5 + cornerBonus (1.5 if corner) + netBonus (1.2 if NetRow) - opponentCoverageBonus`. Pick highest score with 15% random substitution. |
| Speed tier | Low difficulty reception → Maximum. Medium → Fast. High → Normal (precision over speed). |
| Serve animation | Uniform random selection from four serve animations. |
| Serve target zone | Target the table zone farthest from opponent's current position. |

### 8.3 AI Opponent Coverage

For AI zone scoring, opponent coverage is computed as the time the opponent would need to reach a ball landing in each zone:

```ts
opponentTravelTime(zone: TableZone, opponentPos: Vector3): number
// steps = grid distance from opponentPos to zone center
// time  = steps * 0.25 seconds per step
```

### 8.4 AI in Debug Mode

In debug mode both players are AI-controlled. Expose an `AIController` class that wraps any `Character` and drives all decision points. Both Howard and the debug-mode character use the same `AIController` with greedy strategy.

---

## 9. Rally Manager

### 9.1 Rally State Machine

| State | Entry condition | Exit condition | Actions |
|---|---|---|---|
| SERVE_SETUP | Match start or point scored | Serve animation starts | Spawn players at serve lines. Parent ball to server hand. Open external player movement window. |
| SERVING | Server presses serve / AI decides | Contact frame fires on serve | Play serve animation. Track BLH. Handle toss arc. Close movement window at contact frame. |
| RECEPTION_OPEN | Ball crosses net | Ball contacts receiver | Open external player movement window. Open target selection window. AI begins movement. |
| RECEIVING | Contact detected | Reception contactFrame fires | Close movement window. Play reception animation synced to ball. Apply upward arc. |
| PREPARATION | Reception arc starts | Prep contactFrame fires | AI or player moves to optimal prep cell. Play prep animation. Set ball to kick-ready position. |
| KICK_PENDING | Prep contact fires | Kick contactFrame fires | Player selects zone/speed. AI selects greedy zone. Play kick animation synced. |
| BALL_IN_FLIGHT | Kick impulse applied | Ball crosses net OR hits ground | Track ball. Update player rotations. If ball hits ground: FAULT. If crosses net: opponent RECEPTION_OPEN. |
| FAULT | Ball hits ground | Automatic | Award point to non-faulty player. Play Celebration/Defeat. Transition to SERVE_SETUP. |

### 9.2 Teqball Rules Enforcement

- Maximum 3 touches per player per rally (reception + preparation + kick = exactly 3)
- Ball must cross the net and bounce on opponent table side to be valid
- If ball hits ground before crossing net: server/kicker loses point
- If ball bounces twice on one side: that player loses point
- No hand contact allowed
- Serve must land on opponent table side

### 9.3 Fault Detection

```ts
RuleEngine.evaluate(event: BallEvent): RuleResult

type BallEvent = {
  type: 'ground_hit' | 'table_bounce' | 'net_hit' | 'out_of_bounds'
  side: 'P1' | 'P2'
  bounceCount: number
}

type RuleResult = {
  type: 'fault' | 'valid' | 'point'
  scorer?: 'P1' | 'P2'
  reason: string
}
```

---

## 10. Animation Synchronisation System

### 10.1 The Full Sync Pipeline

For every touch (reception, preparation, kick), the system executes the following pipeline in order:

1. **PREDICT:** `BallPredictor.ballAtArrival()` returns predicted position and time until arrival.
2. **SELECT:** `AnimSelector` picks the animation matching ball position at arrival.
3. **INTENT:** `ZoneSelector` picks target zone (player choice or AI greedy).
4. **TIME:** `AnimTimer.computeSpeedRatio()` adjusts playback speed so `contactFrame` lands at arrival time.
5. **PLAY:** Animation starts at computed `speedRatio`. Pre-rotation correction applied from `AnimConfig`.
6. **CONTACT:** At `contactFrame` (scheduled via `setTimeout` at adjusted timing): bone distance check, one-frame snap, velocity applied.
7. **GUIDE:** `BallGuide.computeArcVelocity()` sets post-contact trajectory. Variance added.

### 10.2 AnimConfig Structure

```ts
interface AnimConfig {
  contactFramePeak:  number    // frame number from manifest
  activeBone:        string    // bone name at contact
  contactBoneReach:  number    // hit radius in world units
  arcHeight:         number    // post-contact arc height
  accuracy:          number    // 0–1 zone targeting precision
  preferredXZones:   XZone[]  // table columns this clip favours
  preRotationY:      number    // degrees correction before play
  idleReturnRotY:    number    // degrees correction on idle return
  mirrorSafe:        boolean   // can flip scaling.x
}
```

### 10.3 Speed Ratio Clamping

The `speedRatio` is always clamped: `Math.max(0.6, Math.min(1.4, ratio))`. If the ball will arrive faster than `0.6×` or slower than `1.4×` can accommodate, the system must move the player one grid cell toward the optimal position instead of exceeding the clamp.

### 10.4 One-Frame Ball Snap

At `contactFrame`, before applying velocity, execute `ball.mesh.position.copyFrom(boneWorldPos)`. This ensures contact always looks visually clean regardless of minor prediction drift. The snap is imperceptible at game speed.

---

## 11. Guided Physics and Zone Targeting

### 11.1 Zone Probability Weighting

At kick time, each table zone on the opponent's side receives a weight sampled from a weighted distribution:

- Base weight: 1.0 for all zones
- Preferred zones for the active kick animation: ×2.0
- Distance from opponent position: `weight += distanceFromOpponent * 1.0`
- Corner zones (left or right column): ×1.8 if intent is attack or corner
- Center zone: ×2.0 if intent is safe
- NetRow zones: ×1.3 (harder to reach quickly)
- Speed tier multiplier on distance weight: Fast ×1.2, Maximum ×1.4

### 11.2 Variance Application

After selecting a zone, the actual landing target is offset within the zone radius:

```ts
actualTarget = zone.center + randomDirection * zone.radius * (1 - accuracy)
```

Zone radius is 1/3 of the table square width. At `accuracy=1.0` ball lands exactly at center. At `accuracy=0.65` ball lands anywhere within the zone.

### 11.3 Reception Arc Profile

Reception always sends the ball near-vertically upward to give the player time for preparation:

- **X:** same as contact point (no horizontal movement)
- **Z:** same as contact point
- **Y arc height:** 2.0 m above contact point
- Lands the ball 1.5–2.0 seconds later at roughly the same XZ position, giving preparation time

### 11.4 Preparation Arc Profile

Preparation sets the ball at the ideal kick contact position. The agent must:

1. Look up which kick animation will be used based on target zone.
2. Compute where that kick animation's active bone will be at its `contactFrame` (using the player's current or target grid cell position).
3. Set prep arc target to: `kickBoneRestPosition + Vector3(0, 0, 0.3)` facing player. Height from `AnimConfig`: Low kick needs ball at 0.5 m · Mid at 0.9 m · High at 1.5 m · VeryHigh at 2.0 m.

---

## 12. Locomotion and Player Positioning

### 12.1 Discrete Grid Movement

Players do not use physics bodies for horizontal movement. Movement is discrete: the player steps from grid cell center to grid cell center. Each step takes 0.25 seconds and plays the appropriate locomotion animation.

### 12.2 Locomotion Animation Selection

Direction is computed relative to the player's current facing direction:

| Move direction relative to facing | Animation |
|---|---|
| Forward (same direction as facing) | `JogForward` |
| Backward (opposite facing) | `jogBackward` |
| Left (90° left of facing) | `JogStrafeLeft` |
| Right (90° right of facing) | `JogStrafeRight` |
| Diagonal | Blend `JogForward` + strafe at equal weights |

### 12.3 Player Rotation

**While ball is alive:** every frame compute direction from player position to ball position. Apply to `mesh.rotation.y` (Y-axis only). Use `Scalar.Lerp` for smooth rotation at rate `8.0 * delta`.

**While ball is DEAD or PARENTED:** player faces net direction. Same lerp rate.

### 12.4 Court Boundaries

Players cannot move outside the court boundaries. Constrain grid cell selection to cells within the court bounds from `SceneMetrics`. The serve line is the maximum depth boundary on each player's side.

---

## 13. Required File Structure

| File path | Purpose |
|---|---|
| `src/core/SceneMetrics.ts` | Runtime court dimensions. Measured from `bleacher.glb` at load time. |
| `src/core/interfaces.ts` | All shared TypeScript interfaces and enums. |
| `src/core/EventBus.ts` | Central pub/sub for all cross-system events. |
| `src/core/constants.ts` | Physics constants, animation fps, grid subdivision counts. |
| `src/systems/GridSystem.ts` | Court 3D grid. Cell lookup, bounds, center computation. |
| `src/systems/BallPredictor.ts` | Ball trajectory prediction. `futurePosition`, `arrivalTime`. |
| `src/systems/AnimSelector.ts` | Animation selection for each phase given ball position. |
| `src/systems/AnimTimer.ts` | Speed ratio computation for animation-ball sync. |
| `src/systems/BallGuide.ts` | Arc velocity computation, variance application, zone weighting. |
| `src/systems/ZoneSelector.ts` | Table zone selection from intent and weights. |
| `src/systems/RuleEngine.ts` | Teqball rule evaluation. Pure functions, fully unit testable. |
| `src/systems/RallyManager.ts` | Main rally state machine. Orchestrates all phases. |
| `src/systems/KickSystem.ts` | Unified kick pipeline (predict, select, time, contact, guide). |
| `src/entities/Character.ts` | Base character class. Animations, bone access, state machine. |
| `src/entities/Ball.ts` | Ball mesh, state machine, physics body. |
| `src/entities/Arena.ts` | Loads `bleacher.glb`. Extracts `SceneMetrics`. Table zone overlays. |
| `src/gameplay/ServeSystem.ts` | Serve sequence: parenting, toss arc, contact. |
| `src/gameplay/PhaseController.ts` | Per-player phase progression: reception, prep, kick. |
| `src/ai/AIController.ts` | Greedy AI. Wraps any `Character`. Drives all decision points. |
| `src/input/PlayerInput.ts` | External player input: movement, zone selection, speed tier. |
| `src/ui/HUD.ts` | Score, phase indicator, zone selector overlay, debug overlay. |
| `src/ui/ZoneOverlay.ts` | Visual table zone grid with probability heat colouring. |
| `src/ui/DebugOverlay.ts` | Debug mode HUD: grid wireframes, bone markers, anim info. |
| `src/data/animationConfig.ts` | `AnimConfig` map for all animations with all fields populated. |
| `src/data/courtZones.ts` | `TableZone` definitions. Runtime positions from `SceneMetrics`. |
| `src/CharacterRegistry.ts` | Loads and caches all three character `.glb` files at startup. |
| `src/MatchManager.ts` | Match lifecycle: character selection, score, serve order. |
| `src/main.ts` | Entry point. URL parsing for debug mode. Engine and scene init. |
| `tests/ruleEngine.test.ts` | Unit tests for `RuleEngine` pure functions. |
| `tests/ballGuide.test.ts` | Unit tests for arc velocity computation. |
| `tests/gridSystem.test.ts` | Unit tests for cell lookup and bounds. |

---

## 14. Implementation Order

The agent must implement in this order. Each phase must be verifiable before proceeding.

### Phase A — Foundation
*Verify: scene loads, metrics computed, grid visible in debug*

1. `SceneMetrics`: load `bleacher.glb`, extract court bounds, table Y, net position, serve lines.
2. `GridSystem`: construct 5×4×3 grid from `SceneMetrics`. Verify with debug wireframe overlay.
3. `CharacterRegistry`: load all three `.glb` files. Log all `AnimationGroup` names to console to verify they match the manifest.
4. `Ball`: create sphere mesh with runtime-computed radius. Attach Havok physics. Implement state machine.

### Phase B — Serve
*Verify: serve plays, ball follows hand, tosses, lands on table*

1. `ServeSystem`: implement 4-stage serve sequence.
2. Ball parenting to `RightHand` bone.
3. Toss arc computation from BLH frame.
4. Contact frame detection and first ball impulse.

### Phase C — Single touch loop
*Verify: reception fires, ball goes up, kick fires, crosses net*

1. `KickSystem`: full pipeline for a single touch.
2. `BallPredictor`: `futurePosition` and `arrivalTime`.
3. `AnimSelector`: per-phase selection logic.
4. `AnimTimer`: `speedRatio` computation.
5. `BallGuide`: arc velocity and variance.
6. `ZoneSelector`: weighted zone selection.

### Phase D — Full rally
*Verify in debug: two AIs complete multiple rallies with correct phase progression*

1. `RallyManager`: full state machine.
2. `PhaseController`: per-player phase tracking.
3. `RuleEngine`: fault detection, point award.
4. `AIController`: greedy decisions at all decision points.
5. Locomotion: grid movement, rotation toward ball.

### Phase E — External player input
*Verify: player can move, select zone, kick fires correctly*

1. `PlayerInput`: movement window, zone selection, speed tier.
2. Player assistance: optimal cell highlight, fallback zone.
3. `HUD`: score, phase indicator, zone overlay.

### Phase F — Polish and tests
*Verify: debug mode visually smooth for 10+ consecutive rallies*

1. `DebugOverlay`: all visualisations.
2. `ZoneOverlay`: probability heat map on table.
3. Unit tests for `RuleEngine`, `BallGuide`, `GridSystem`.
4. Bone markers and contact radius visualisation.
5. Celebration/Defeat animations on point scored.

---

## 15. Acceptance Criteria

Implementation is complete when all of the following pass.

### 15.1 Debug mode visual checks (10 consecutive rallies)

- Ball never teleports between touches (always smooth arc or bounce)
- Player animations always sync with ball: contact frame fires when ball is visually near the active bone
- No T-pose or animation snap between phases
- Players always face ball while ball is alive
- Players return to facing table on rally end
- Serve ball follows hand bone until BLH frame, then arcs smoothly
- Ball always bounces on opponent table side after a kick (no net hits unless fault)
- Grid overlay shows correct cell for ball and player at all times
- Active animation name and phase display correctly in HUD
- Bone marker sphere follows active bone through kick arc visibly

### 15.2 Rule correctness

- Point awarded to correct player on every fault type
- Maximum 3 touches enforced: 4th touch attempt triggers fault
- Serve alternates correctly across multiple points
- Match resets to serve setup after every point

### 15.3 Unit tests

- `RuleEngine`: all 6 fault types produce correct `RuleResult`
- `BallGuide`: arc velocity produces correct landing position when simulated
- `GridSystem`: `cellFromWorld` and `cellCenter` are inverse operations within epsilon

### 15.4 External player mode

- Player moves during pre-reception window, stops on ball contact
- Zone selector overlay appears on ball crossing net, disappears after kick
- Selected zone receives ball within zone radius 90% of the time at `accuracy=0.85`
- If no zone selected before kick: system auto-selects and shows **Assisted** indicator
- Speed tier modifier visibly affects ball travel time across net

---

*End of task specification*
