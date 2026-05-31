/**
 * MAIN ENTRY POINT
 * Phase 0: Load assets and display scene with proper positioning
 * 
 * SCALING GUIDE:
 * - All measurements use SCALE as a multiplier (currently 1.5)
 * - Court dimensions: 16m (length) × 12m (width)
 * - Table dimensions: 3m (length) × 1.7m (width)
 * - To scale entire scene: change SCALE constant below
 *   Example: SCALE = 0.5 makes everything half-size
 *   Example: SCALE = 2.0 makes everything double-size
 * 
 * COORDINATE SYSTEM:
 * - X axis: Left (-) to Right (+)
 * - Y axis: Down (-) to Up (+)
 * - Z axis: Front (-) to Back (+)
 * 
 * Court reference for positioning:
 * - Court center: (0, 0, 0)
 * - Court extends from -6m to +6m on X axis
 * - Court extends from -8m to +8m on Z axis
 * - Table sits at center on Y=0.5m
 * - Players positioned on opposite sides of table along Z axis
 */

import { SceneBuilder } from './core/SceneBuilder';
import { BabylonEngine } from './core/Engine';
import { AssetManager } from './core/AssetManager';
import { EventBus } from './core/EventBus';
import { UIManager } from './ui/UIManager';
import { playKickSfx, playApplauseSfx } from './audio/Sfx';
import type { PointScoredEvent } from './ui/HUD';
import { Scene } from '@babylonjs/core/scene';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import { TrailMesh } from '@babylonjs/core/Meshes/trailMesh';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { Ball } from './entities/Ball';
import { Character } from './entities/Character';
import { PointVFXSystem } from './systems/PointVFXSystem';
import { CharacterStats } from './core/interfaces';
import { MatchManager } from './gameplay/MatchManager';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import HavokPhysics from '@babylonjs/havok';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsBody } from '@babylonjs/core/Physics/v2/physicsBody';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import '@babylonjs/core/Physics/physicsEngineComponent';
import {
  ANIM_CONFIG_FPS,
  getAnimConfigForAction,
  getAnimConfigForClip,
  getContactFrameRatio,
  resolveAnimBallSpeedValue,
  resolveAnimReachUnits,
} from './data/animationConfig';
import { InputManager } from './systems/InputManager';
import { BallPredictor } from './systems/BallPredictor';
import { PlayerAnimKey } from './animation/AnimationSystem';
import howardAnimData from './data/characters/howard.json';
import messiAnimData from './data/characters/messi.json';
import maradonaAnimData from './data/characters/maradona.json';

import {
  SCALE, DOUBLE_TAP_WINDOW_MS,
  BALL_SPAWN_POSITION, BALL_MAX_UPWARD_SPEED, BALL_MAX_DOWNWARD_SPEED,
  BALL_RESET_HEIGHT, BALL_RESET_MIN_Y, BALL_RESET_X_LIMIT, BALL_RESET_Z_LIMIT,
  PLAYER_MODEL_YAW_OFFSET, ENABLE_P1_AI, ENABLE_P2_AI, SERVE_LINE_Z,
  PLAYER_SPAWN_Z, PLAYER_TABLE_CLEARANCE_Z, PURE_BALL_PHYSICS, ENABLE_BALL_ASSIST,
  TABLE_SCALE, WORLD_BOUNCE_RESTITUTION, TABLE_BOUNCE_RESTITUTION,
  BALL_BOUNCE_RESTITUTION, GLOBAL_KICK_VELOCITY_MULTIPLIER,
  ENABLE_NO_GROUND_FALL_GUARD, NO_GROUND_FALL_TRIGGER_HEIGHT,
  NO_GROUND_FALL_REBOUND_MIN_SPEED, NO_GROUND_FALL_RESTITUTION,
  NO_GROUND_FALL_LATERAL_DAMPING, getCourtCenterFacing, getLateralReceptionFacing,
  AI_BEHIND_SERVE_TARGET_Z, AI_PREP_STEP_IN_TARGET_Z, AI_FINAL_KICK_TARGET_Z,
  AI_SHORT_RETURN_STEP_IN_Z, AI_LOW_SPEED_RETURN_THRESHOLD,
  SERVE_READY_PAUSE_SECONDS, SERVE_FLIGHT_LOCK_MAX_SECONDS,
  SERVE_TOSS_RIGHT_ANGLE_DEG, SERVE_TOSS_FORWARD_ANGLE_DEG,
  SERVE_TOSS_HEIGHT_MULT, SERVE_TOSS_CONTACT_RIGHT_MAX,
  SERVE_TOSS_CONTACT_FORWARD_MAX, CourtSide, OffensiveAction,
  SOCKET_HEIGHT_CALIBRATION_ACTIONS, ServePhase, ServeState, ServeType
} from './config/GameConfig';

let gameScene: Scene;
let _babylonEngine: BabylonEngine | null = null;

// Deferred until the user actually clicks Play, so the character chosen in the
// menu is the one instantiated as P1.  Defaults to 'messi' if never confirmed
// (e.g. ?debug mode or anyone who skips the menu).
type P1CharacterId = 'messi' | 'maradona';
let _resolveP1Character: (id: P1CharacterId) => void = () => {};
const _p1CharacterPromise: Promise<P1CharacterId> = new Promise<P1CharacterId>((resolve) => {
  _resolveP1Character = resolve;
});

export function confirmCharacterSelection(id: string): void {
  _resolveP1Character(id === 'maradona' ? 'maradona' : 'messi');
}
let assetManager: AssetManager;
let ball: Ball;
let player1: Character;
let player2: Character;
let matchManager: MatchManager;
let inputManager: InputManager;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let uiManager: UIManager | undefined;
let pointVFXSystem: PointVFXSystem | undefined;

const pressedKeys = new Set<string>();
const controlKeys = new Set(['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's', 'space']);
controlKeys.add('enter');
controlKeys.add('q');
controlKeys.add('e');
controlKeys.add('f');
controlKeys.add('r');
controlKeys.add('t');
controlKeys.add('u');
controlKeys.add('i');
controlKeys.add('o');
controlKeys.add('y');
controlKeys.add('f9');
controlKeys.add('b');
controlKeys.add('1');
controlKeys.add('2');
controlKeys.add('3');
controlKeys.add('4');
let lastP1LiftPress = 0;
let lastP2LiftPress = 0;
let lastP1ActionPress = 0;
let lastP2ActionPress = 0;

let lastP1KickButtonPress = 0;
let lastP2KickButtonPress = 0;
let p1KickButtonHeld = false;
let p2KickButtonHeld = false;
let p1ForcedKickAction: OffensiveAction | null = null;

// ── Superpower (P1 human only) ───────────────────────────────────────────────
// Messi: supercharged fiery kick.  Maradona: erratic ball after its table bounce.
// One use per set.  A single F press is enough: it arms the power, and the kick
// auto-fires as soon as P1 can kick (no separate kick key needed).
// A banked charge resets/recharges whenever a new set begins.
let p1SuperArmed = false;
// Supercharge is EARNED, not free: winning two points in a row grants one charge,
// and a fresh charge is also granted at the start of every set.  `p1SuperAvailable`
// is true when a charge is banked and ready to arm with F.
let p1SuperAvailable = true; // a charge is available from the opening set
let p1PointStreak = 0;
let lastSetCountForSuper = 0;
// Set when a Maradona super kick launches; the ball's first table bounce on the
// opponent side triggers a mirrored direction-cut (handled in the physics loop).
let maradonaCurveArmedBall = false;
// True while a super-kick ball is live.  Makes the kick UNSTOPPABLE: the AI
// opponent (P2/Howard) is blocked from receiving or touching the ball at all,
// so it always bounces twice on his side → the point goes to P1.  Cleared when
// the rally ends (clearRallyState).
let superKickInFlight = false;

const pendingPrepSuperHigh: [boolean, boolean] = [false, false];
const pendingKickPowerBoost: [boolean, boolean] = [false, false];
// D-pad aim snapshot captured at the moment the human player presses the kick button.
// x: -1 (left) / 0 (center) / +1 (right), z: -1 (near/net) / 0 / +1 (far/deep)
const p1KickAim = { x: 0, z: 0 };
// Grace-period auto-kick: timestamp (ms) when the kick phase started for P1, -1 = not counting.
let p1KickGraceStart = -1;

let animationPreviewMode = false;
let animationPreviewPlayer = 1;
let animationPreviewClipIndex = 0;
let animationPreviewMirror = false;
let animationPreviewSpeed = 1.0;
let animationPreviewFacingFlip = false;
let animationPreviewLockedYaw: number | null = null;


// Persistent serve-type preference per player — survives point resets.
// Default: P1 uses right-foot, P2 uses left-foot (mirrors their default stance).
let p1ServeType: ServeType = 'rightFoot';
let p2ServeType: ServeType = 'leftFoot';

const SERVE_TYPE_ORDER: ServeType[] = ['leftFoot', 'rightFoot', 'headLeft', 'headRight'];
const SERVE_TYPE_LABEL: Record<ServeType, string> = {
  leftFoot:  '← Foot',
  rightFoot: 'Foot →',
  headLeft:  '← Head',
  headRight: 'Head →',
};

// ── Serve-type selector HUD ──────────────────────────────────────────────────
let _serveSelectorEl: HTMLDivElement | null = null;
let _serveSelectorItems: Array<{ el: HTMLDivElement; type: ServeType }> = [];
let _serveSelectorVisible = false;
let _serveSelectorActiveType: ServeType | null = null;

function initServeSelectorUI(): void {
  const root = document.createElement('div');
  Object.assign(root.style, {
    position: 'fixed',
    bottom: '40px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'none',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '6px',
    background: 'rgba(0,0,0,0.60)',
    backdropFilter: 'blur(6px)',
    borderRadius: '12px',
    padding: '8px 16px',
    fontFamily: 'Inter, Arial, sans-serif',
    zIndex: '200',
    pointerEvents: 'none',
    userSelect: 'none',
    boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
  });

  // "Q →" cycle hint badge
  const hint = document.createElement('div');
  hint.textContent = 'Q';
  Object.assign(hint.style, {
    color: 'rgba(255,255,255,0.45)',
    fontSize: '10px',
    fontWeight: '600',
    border: '1px solid rgba(255,255,255,0.25)',
    borderRadius: '4px',
    padding: '2px 6px',
    marginRight: '6px',
    letterSpacing: '0.03em',
  });
  root.appendChild(hint);

  _serveSelectorItems = [];
  for (const type of SERVE_TYPE_ORDER) {
    const pill = document.createElement('div');
    pill.textContent = SERVE_TYPE_LABEL[type];
    Object.assign(pill.style, {
      color: 'rgba(255,255,255,0.30)',
      fontSize: '13px',
      fontWeight: '600',
      padding: '5px 13px',
      borderRadius: '8px',
      border: '1px solid transparent',
      letterSpacing: '0.02em',
      whiteSpace: 'nowrap',
    });
    root.appendChild(pill);
    _serveSelectorItems.push({ el: pill, type });
  }

  document.body.appendChild(root);
  _serveSelectorEl = root;
}

function updateServeSelectorUI(activeType: ServeType, visible: boolean): void {
  if (!_serveSelectorEl) return;
  if (visible !== _serveSelectorVisible || activeType !== _serveSelectorActiveType) {
    _serveSelectorVisible = visible;
    _serveSelectorActiveType = activeType;
    _serveSelectorEl.style.display = visible ? 'flex' : 'none';
    if (visible) {
      for (const { el, type } of _serveSelectorItems) {
        const active = type === activeType;
        el.style.color    = active ? '#ffffff' : 'rgba(255,255,255,0.30)';
        el.style.background = active ? 'rgba(255,255,255,0.15)' : 'transparent';
        el.style.border   = active ? '1px solid rgba(255,255,255,0.35)' : '1px solid transparent';
      }
    }
  }
}

/** Derive the anim key, foot, and hand from a ServeType + its animConfig. */
function serveTypeToProps(type: ServeType): { animKey: PlayerAnimKey; foot: 'left' | 'right'; hand: 'left' | 'right' } {
  const animKey: PlayerAnimKey =
    type === 'leftFoot'  ? 'serveLeft'     :
    type === 'rightFoot' ? 'serveRight'    :
    type === 'headLeft'  ? 'headServeLeft' :
                           'headServeRight';
  const cfg = getAnimConfigForClip(animKey);
  const foot: 'left' | 'right' = (type === 'leftFoot' || type === 'headLeft') ? 'left' : 'right';
  const hand: 'left' | 'right' = cfg?.serveHand ?? (foot === 'left' ? 'right' : 'left');
  return { animKey, foot, hand };
}

const serveState: ServeState = {
  active: false,
  server: 0,
  phase: 'ready',
  timer: 0,
  tossReleased: false,
  strikeApplied: false,
  animationStarted: false,
  serveType: p1ServeType,
  foot: 'right',
  hand: 'left',
  tossBallTarget: null,
  tossStartPos: null,
};

// Grace period (seconds) during which queueAutoAction is suppressed after a
// serve completes, preventing immediate unwanted reception animations on the
// serving player before the rally has properly resumed.
let postServeGraceTimer = 0;
const POST_SERVE_GRACE_SECONDS = 1.4;

// Visual pre-serve countdown: after a point is awarded (or at match start),
// the ball is parked at the serve position and the HUD shows a 3-2-1 timer.
// While >0, all gameplay actions (input, AI, serve trigger) are suppressed so
// the players can reset.
let preServeCountdownTimer = 0;
const PRE_SERVE_COUNTDOWN_SECONDS = 3.0;
// Celebration / defeat window: runs after a point and BEFORE the pre-serve
// countdown starts so the celebration1/celebration2/defeat clips get
// uninterrupted playback time.  Celebration1 = 102f / 30fps ≈ 3.4s and the
// longer defeat clip = 201f ≈ 6.7s; 3.6s lets the winner finish and gives the
// loser a meaningful chunk of their reaction before play resumes.
let celebrationWindowTimer = 0;
const CELEBRATION_WINDOW_SECONDS = 3.6;
// Set true the moment a point is awarded; cleared once the next countdown
// finishes.  While true, no kick/reception animations may play — only
// celebration / defeat clips, and the ball is held at the serve anchor.
let pointFreezeActive = false;
let pointFreezeWinner: CourtSide | null = null;
// Set when awardPoint runs and consumed by the per-frame loop to start the
// pre-serve countdown after the celebration window expires.  We can't start
// the countdown immediately or the HUD would overlap the celebration.
let pendingPreServeCountdown = false;

// Per-player timers that keep setMovement locked for the full duration of the
// serve animation clip, independent of serveState.active.  The physics state
// machine can deactivate the serve (missed contact window) well before the
// kick frame is reached; without this lock the animation is overwritten by
// a locomotion clip the very next frame.
let p1ServeAnimLockTimer = 0;
let p2ServeAnimLockTimer = 0;
let pointResultAnimationsActive = 0;
let pointResultAnimationToken = 0;

export async function main(): Promise<void> {
  try {
    // Get canvas
    const canvasElement = document.getElementById('renderCanvas');
    if (!canvasElement || !(canvasElement instanceof HTMLCanvasElement)) {
      throw new Error('Canvas element not found or invalid');
    }
    const canvas = canvasElement;

    const isDebug = new URLSearchParams(window.location.search).has('debug');
    const { engine, scene, camera, havokPlugin } = await SceneBuilder.createSurrealisticScene(canvas, { debug: isDebug });
    gameScene = scene;
    _babylonEngine = engine;
    const hk = (havokPlugin as unknown as { _hknp?: Record<string, (...a: unknown[]) => unknown> })._hknp;

    // Camera follows the ball target subtly (not a hard chase cam).
    const cameraBaseTarget = new Vector3(0, 0, 0);
    const cameraFollowStrength = 0.18;
    const cameraFollowMaxOffsetX = 1.8 * SCALE;
    const cameraFollowMaxOffsetZ = 2.2 * SCALE;

    // Opening cinematic establishing shot: when the render loop first runs
    // (start of a match) the camera opens on a high, wide near-overhead view and
    // sweeps one full turn around the arena, then descends and zooms into the
    // normal play framing.  alpha (orbit), beta (overhead → play angle) and
    // radius (wide → close) are all animated; the per-frame follow below only
    // moves camera.target, so the framing stays fixed once the intro settles.
    // The pre-serve countdown is held until this finishes (see the countdown
    // tick) so the fly-around truly plays *before* the match begins.
    const cameraIntroDuration = 4.0; // seconds for the full establishing shot
    const cameraIntroBaseAlpha = camera.alpha;
    const cameraIntroBaseBeta = camera.beta;
    const cameraIntroBaseRadius = camera.radius;
    const cameraIntroStartBeta = 0.32;                  // near-overhead opening angle
    const cameraIntroStartRadius = camera.radius * 1.7; // pulled back for a wide shot
    let cameraIntroElapsed = 0;
    let cameraIntroDone = false;
    let cameraIntroHudHidden = false;

    // ------------------------------------------------------------------
    // Collision layers (bit masks)
    //   COL_BALL   = 1  — ball; listens for and triggers everything
    //   COL_WORLD  = 2  — static geometry (floor, walls, table)
    //   COL_PLAYER = 4  — player bodies (no player-player collisions)
    // ------------------------------------------------------------------
    const COL_BALL   = 1;
    const COL_WORLD  = 2;
    const COL_PLAYER = 4;

    // Initialize asset manager
    assetManager = new AssetManager(gameScene);
    matchManager = new MatchManager();
    // HUD and PointAnnouncement are created by UIManager (BabylonJS GUI layer).

    // Show loading progress
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      const p = loadingScreen.querySelector('p');
      if (p) {
        p.textContent = 'Loading assets...';
      }
    }

    // Load all assets
    await assetManager.loadAllAssets();

    // Runtime table profile (derived from bleachers geometry; fallback to legacy values).
    const tableProfile = {
      centerX: 0,
      centerZ: 0,
      halfWidth: 0.85 * TABLE_SCALE,
      halfLength: 1.5 * TABLE_SCALE,
      surfaceY: 0.76 * TABLE_SCALE,
    };
    const DEBUG_POST_RECEPTION_KICK = true;
    const BALL_SIZE_SCALE = 0.95;
    const PLAYER_SIZE_SCALE = 0.95;
    const tableSurfaceEdgeDrop = 0.195 * TABLE_SCALE;

    // ── Load bleachers.glb (stands + playing surface + Teqboard visual) ──────
    const bleachersData = await assetManager.loadModel('bleachers');
    if (bleachersData.meshes.length > 0) {
      bleachersData.meshes[0].position = Vector3.Zero();
    }

    // Recolor the bleachers by GLB material name (PBR materials → albedoColor).
    // Seats go two-tone gold + teal; the structure is darkened to match the
    // dark court.
    const recolorMaterial = (matName: string, rgb: Color3): void => {
      const mat = gameScene.materials.find((m) => m.name === matName);
      if (!mat) return;
      if ('albedoColor' in mat) {
        (mat as unknown as { albedoColor: Color3 }).albedoColor = rgb;
      } else if ('diffuseColor' in mat) {
        (mat as unknown as { diffuseColor: Color3 }).diffuseColor = rgb;
      }
    };
    recolorMaterial('BLCH_Seat_Blue', new Color3(0.45, 0.7, 0.95)); // → light blue
    recolorMaterial('BLCH_Seat_Red', new Color3(0.05, 0.12, 0.42)); // → dark navy blue
    recolorMaterial('BLCH_Structure', new Color3(0.09, 0.09, 0.1)); // → dark neutral

    // Prefer the authored Teqboard top mesh for accurate table bounds/height.
    const tableTopMesh = bleachersData.meshes.find((mesh) => mesh.name.toLowerCase().includes('teqboard_top'));
    const tableBoundsMesh = tableTopMesh
      ?? bleachersData.meshes.find((mesh) => {
        const key = mesh.name.toLowerCase();
        return key.includes('teqboard') || key.includes('table') || key.includes('board');
      });
    if (tableBoundsMesh) {
      const bounds = tableBoundsMesh.getHierarchyBoundingVectors(true);
      const sizeX = Math.max(0.001, bounds.max.x - bounds.min.x);
      const sizeZ = Math.max(0.001, bounds.max.z - bounds.min.z);
      tableProfile.centerX = (bounds.min.x + bounds.max.x) * 0.5;
      tableProfile.centerZ = (bounds.min.z + bounds.max.z) * 0.5;
      tableProfile.halfWidth = Math.min(sizeX, sizeZ) * 0.5;
      tableProfile.halfLength = Math.max(sizeX, sizeZ) * 0.5;
      tableProfile.surfaceY = bounds.max.y;
    }

    if (DEBUG_POST_RECEPTION_KICK) {
      console.log('[table-debug] bleachers table profile', {
        meshName: tableBoundsMesh?.name ?? null,
        hasTableMesh: !!tableBoundsMesh,
        tableProfile: {
          centerX: tableProfile.centerX,
          centerZ: tableProfile.centerZ,
          halfWidth: tableProfile.halfWidth,
          halfLength: tableProfile.halfLength,
          surfaceY: tableProfile.surfaceY,
        },
      });
    }

    // All world collisions now come from bleachers.glb geometry.
    // This includes the court floor, table, and surrounding structures.
    const bleacherCollisionMeshes = bleachersData.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
    const tableNameHints = ['table', 'teq', 'board'];

    // Physics bodies for "out-of-court" geometry — the surrounding stands, walls
    // and seats from bleachers.glb (everything that is neither the table nor the
    // court floor).  A ball that contacts any of these has clearly left play, so
    // the rally is decided by the standard return-validity ruleset.
    const outOfCourtBodies = new Set<PhysicsBody>();
    // Set by the ball's collision callback when it strikes out-of-court geometry;
    // consumed (and cleared) once per rally by the main loop.
    let ballHitOutOfCourtGeometry = false;
    for (const mesh of bleacherCollisionMeshes) {
      const meshName = mesh.name.toLowerCase();
      const isTableMesh = tableNameHints.some((hint) => meshName.includes(hint));
      const restitution = isTableMesh ? TABLE_BOUNCE_RESTITUTION : WORLD_BOUNCE_RESTITUTION;

      let shapeUsed: PhysicsShapeType = PhysicsShapeType.MESH;
      try {
        new PhysicsAggregate(
          mesh,
          PhysicsShapeType.MESH,
          { mass: 0, restitution, friction: 0.25 },
          gameScene,
        );
      } catch (_err) {
        shapeUsed = PhysicsShapeType.CONVEX_HULL;
        try {
          new PhysicsAggregate(
            mesh,
            PhysicsShapeType.CONVEX_HULL,
            { mass: 0, restitution, friction: 0.25 },
            gameScene,
          );
        } catch (_err2) {
          continue;
        }
      }

      if (mesh.physicsBody?.shape) {
        mesh.physicsBody.shape.filterMembershipMask = COL_WORLD;
        mesh.physicsBody.shape.filterCollideMask = COL_BALL | COL_PLAYER;

        if (shapeUsed === PhysicsShapeType.MESH) {
          // Mesh welding smooths adjacent triangle normals for rolling contacts.
          const hpShape = (mesh.physicsBody.shape as unknown as { _pluginData?: { hpShape?: unknown } })._pluginData?.hpShape;
          if (hk && hpShape !== undefined) {
            (hk['HP_Shape_SetWeldingType'] as (...args: unknown[]) => void)?.(hpShape, 3);
          }
        }
      }

      // Tag surrounding arena geometry (anything that is neither the table nor
      // the court floor) so a ball that hits it can be ruled out of play.
      const isCourtFloor = meshName.includes('court_floor');
      if (mesh.physicsBody && !isTableMesh && !isCourtFloor) {
        outOfCourtBodies.add(mesh.physicsBody);
      }
    }

    // Restore visual court markings over the bleachers court floor so players can
    // read serve zones and side split exactly like the procedural setup.
    const courtFloorMesh = bleachersData.meshes.find((mesh) => mesh.name.toLowerCase().includes('court_floor'));
    let courtCenterX = 0;
    let courtCenterZ = 0;
    let courtHalfWidth = 6 * SCALE;
    let courtHalfLength = 8 * SCALE;
    let lineY = 0.01 * SCALE;
    if (courtFloorMesh) {
      // Dark neutral-grey court.  The scene's hemispheric light is purple/blue,
      // which would tint the floor; a neutral emissive grey (equal R=G=B) lets the
      // floor's own colour dominate so it reads as true neutral grey — no blue and
      // no rosy cast — while staying dark.
      const courtMaterial = new StandardMaterial('courtGrey', gameScene);
      courtMaterial.diffuseColor = new Color3(0.14, 0.14, 0.14);
      courtMaterial.emissiveColor = new Color3(0.12, 0.12, 0.12); // neutralise the coloured light
      courtMaterial.specularColor = new Color3(0.08, 0.08, 0.08);
      courtMaterial.specularPower = 64;
      courtFloorMesh.material = courtMaterial;

      const courtBounds = courtFloorMesh.getHierarchyBoundingVectors(true);
      courtCenterX = (courtBounds.min.x + courtBounds.max.x) * 0.5;
      courtCenterZ = (courtBounds.min.z + courtBounds.max.z) * 0.5;
      courtHalfWidth = Math.max(0.001, (courtBounds.max.x - courtBounds.min.x) * 0.5);
      courtHalfLength = Math.max(0.001, (courtBounds.max.z - courtBounds.min.z) * 0.5);
      lineY = courtBounds.max.y + 0.004 * SCALE;
    }

    const neonCyan = new Color3(0, 1, 1);
    const serviceLineWidth = 1.5 * SCALE;
    const serviceLinesDist = SERVE_LINE_Z;

    const halfwayLine = MeshBuilder.CreateLines(
      'halfwayLine',
      {
        points: [
          new Vector3(courtCenterX - 2 * SCALE, lineY, courtCenterZ),
          new Vector3(courtCenterX + 2 * SCALE, lineY, courtCenterZ),
        ],
      },
      gameScene,
    );
    halfwayLine.color = new Color3(1, 1, 1); // center line — white

    const serviceLineTop = MeshBuilder.CreateLines(
      'serviceLineTop',
      {
        points: [
          new Vector3(courtCenterX - serviceLineWidth / 2, lineY, courtCenterZ + serviceLinesDist),
          new Vector3(courtCenterX + serviceLineWidth / 2, lineY, courtCenterZ + serviceLinesDist),
        ],
      },
      gameScene,
    );
    serviceLineTop.color = new Color3(1, 1, 1); // serve line — white

    const serviceLineBottom = MeshBuilder.CreateLines(
      'serviceLineBottom',
      {
        points: [
          new Vector3(courtCenterX - serviceLineWidth / 2, lineY, courtCenterZ - serviceLinesDist),
          new Vector3(courtCenterX + serviceLineWidth / 2, lineY, courtCenterZ - serviceLinesDist),
        ],
      },
      gameScene,
    );
    serviceLineBottom.color = new Color3(1, 1, 1); // serve line — white

    const boundary = MeshBuilder.CreateLines(
      'boundary',
      {
        points: [
          new Vector3(courtCenterX - courtHalfWidth, lineY, courtCenterZ + courtHalfLength),
          new Vector3(courtCenterX + courtHalfWidth, lineY, courtCenterZ + courtHalfLength),
          new Vector3(courtCenterX + courtHalfWidth, lineY, courtCenterZ - courtHalfLength),
          new Vector3(courtCenterX - courtHalfWidth, lineY, courtCenterZ - courtHalfLength),
          new Vector3(courtCenterX - courtHalfWidth, lineY, courtCenterZ + courtHalfLength),
        ],
      },
      gameScene,
    );
    boundary.color = neonCyan;

    const desiredDiameter = 0.22 * SCALE * BALL_SIZE_SCALE;
    const ballRadius = desiredDiameter / 2;
    const getTableSurfaceYAt = (worldZ = tableProfile.centerZ): number => {
      const halfLength = Math.max(0.001, tableProfile.halfLength);
      const localZ = Math.max(-halfLength, Math.min(halfLength, worldZ - tableProfile.centerZ));
      const normalized = localZ / halfLength;
      return tableProfile.surfaceY - tableSurfaceEdgeDrop * normalized * normalized;
    };
    const getTableBallContactY = (worldZ = tableProfile.centerZ): number => getTableSurfaceYAt(worldZ) + ballRadius;
    const BALL_VISUAL_SPIN_MAX = 26.0;
    let ballSpinTwist = 0;
    const ballOscillationWindow = 0.16;
    const ballOscillationMinFlipSpeed = 1.45 * SCALE;
    const ballOscillationMaxTravelPerFrame = 0.16 * SCALE;
    const ballOscillationFlipThreshold = 3;
    const ballOscillationDampFactor = 0.22;
    const ballOscillationPopY = 1.55 * SCALE;
    const ballOscillationNudge = 0.08 * SCALE;
    let oscillationWindowTimer = 0;
    let oscillationFlipCountX = 0;
    let oscillationFlipCountZ = 0;
    const oscillationPrevVelocity = Vector3.Zero();
    const oscillationPrevPosition = BALL_SPAWN_POSITION.clone();
    const previousBallPosition = BALL_SPAWN_POSITION.clone();
    let ballInteractionLockSide: CourtSide | null = null;
    let ballInteractionLockTimer = 0;
    let previousBallVelocityY = 0;
    // Watchdog: how long the live ball has been (nearly) stationary somewhere it
    // shouldn't be — e.g. wedged in the bleachers, where the floor-contact and
    // out-of-bounds resets never fire and the game would otherwise hang forever.
    let ballStuckTimer = 0;

    const ballData = await assetManager.loadModel('ball01');
    if (ballData.meshes.length === 0) throw new Error('ball01 model has no meshes');

    const ballPhysicsMesh = MeshBuilder.CreateSphere(
      'ballPhysics',
      { diameter: desiredDiameter, segments: 24 },
      gameScene,
    );
    ballPhysicsMesh.position = BALL_SPAWN_POSITION.clone();
    ballPhysicsMesh.visibility = 0;
    ballPhysicsMesh.isPickable = false;

    const ballRootMesh = ballData.meshes[0];
    ballRootMesh.computeWorldMatrix(true);
    const ballBounds = ballRootMesh.getHierarchyBoundingVectors(true);
    const ballSize = ballBounds.max.subtract(ballBounds.min);
    const ballModelDiameter = Math.max(ballSize.x, ballSize.y, ballSize.z, 0.001);
    const ballScale = (desiredDiameter * 0.985) / ballModelDiameter;
    const ballVisualRoot = new TransformNode('ballVisualRoot', gameScene);
    ballVisualRoot.setParent(ballPhysicsMesh);
    ballVisualRoot.position = ballBounds.min.add(ballBounds.max).scale(-0.5 * ballScale);
    ballVisualRoot.scaling = new Vector3(ballScale, ballScale, ballScale);

    ballRootMesh.setParent(ballVisualRoot);
    ballRootMesh.position = Vector3.Zero();
    ballRootMesh.rotation = Vector3.Zero();
    ballRootMesh.scaling = Vector3.One();
    ballRootMesh.isPickable = false;
    for (const childMesh of ballRootMesh.getChildMeshes()) {
      childMesh.isPickable = false;
    }

    ball = new Ball(ballPhysicsMesh);

    new PhysicsAggregate(
      ballPhysicsMesh,
      PhysicsShapeType.SPHERE,
      { mass: 0.057, restitution: BALL_BOUNCE_RESTITUTION, friction: 0.3 },
      gameScene
    );

    if (ballPhysicsMesh.physicsBody) {
      // Allow mesh.position writes to sync the physics body (needed for serve toss placement).
      ballPhysicsMesh.physicsBody.disablePreStep = false;

      ballPhysicsMesh.physicsBody.setLinearDamping(0.05);
      ballPhysicsMesh.physicsBody.setAngularDamping(0.2);

      if (ballPhysicsMesh.physicsBody.shape) {
        ballPhysicsMesh.physicsBody.shape.filterMembershipMask = COL_BALL;
        ballPhysicsMesh.physicsBody.shape.filterCollideMask    = PURE_BALL_PHYSICS ? COL_WORLD : (COL_WORLD | COL_PLAYER);
      }

      const hpBallBody = (ballPhysicsMesh.physicsBody as unknown as { _pluginData?: { hpBody?: unknown } })._pluginData?.hpBody;
      if (hk && hpBallBody !== undefined) {
        (hk['HP_Body_SetDeactivationEnabled'] as (...args: unknown[]) => void)?.(hpBallBody, false);
        (hk['HP_Body_SetQualityType'] as (...args: unknown[]) => void)?.(hpBallBody, 5);
      }

      // Flag contact with out-of-court geometry (stands / walls / seats).  The
      // main loop consumes the flag and decides the point per the standard rules:
      // the toucher scores if their return was valid, otherwise the opponent.
      ballPhysicsMesh.physicsBody.setCollisionCallbackEnabled(true);
      ballPhysicsMesh.physicsBody.getCollisionObservable().add((event) => {
        const other = event.collidedAgainst;
        if (other && outOfCourtBodies.has(other)) {
          ballHitOutOfCourtGeometry = true;
        }
      });
    }

    // ── Fire VFX for Messi's supercharged kick ──────────────────────────────
    // Lazily-built ParticleSystem + TrailMesh that ride the ball.
    type SuperKickVfxMode = 'messi' | 'maradona';
    const SUPER_KICK_VFX_DURATION = 1.15;

    let fireParticles: ParticleSystem | null = null;
    let fireTrail: TrailMesh | null = null;
    let fireTrailMaterial: StandardMaterial | null = null;
    let ballFireActive = false;
    let ballFireTimer = 0;
    let ballFireMode: SuperKickVfxMode | null = null;

    const makeSoftFlameTexture = (): DynamicTexture => {
      const tex = new DynamicTexture('ballFireTex', 64, gameScene, false);
      const ctx = tex.getContext();
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.35, 'rgba(255,210,110,0.95)');
      grad.addColorStop(0.7, 'rgba(255,110,20,0.55)');
      grad.addColorStop(1, 'rgba(120,20,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      tex.update();
      return tex;
    };

    const ensureFireVfx = (): void => {
      if (fireParticles) return;

      const ps = new ParticleSystem('ballFire', 260, gameScene);
      ps.particleTexture = makeSoftFlameTexture();
      ps.emitter = ballPhysicsMesh as AbstractMesh;
      ps.minEmitBox = new Vector3(-ballRadius * 0.3, -ballRadius * 0.3, -ballRadius * 0.3);
      ps.maxEmitBox = new Vector3(ballRadius * 0.3, ballRadius * 0.3, ballRadius * 0.3);
      ps.color1 = new Color4(1.0, 0.65, 0.15, 1.0);
      ps.color2 = new Color4(1.0, 0.25, 0.0, 1.0);
      ps.colorDead = new Color4(0.25, 0.0, 0.0, 0.0);
      ps.minSize = 0.18 * SCALE;
      ps.maxSize = 0.52 * SCALE;
      ps.minLifeTime = 0.10;
      ps.maxLifeTime = 0.30;
      ps.emitRate = 420;
      ps.blendMode = ParticleSystem.BLENDMODE_ADD;
      ps.gravity = new Vector3(0, 3.5 * SCALE, 0);
      ps.direction1 = new Vector3(-1.2, 0.6, -1.2);
      ps.direction2 = new Vector3(1.2, 1.8, 1.2);
      ps.minEmitPower = 0.4 * SCALE;
      ps.maxEmitPower = 1.3 * SCALE;
      ps.updateSpeed = 0.02;
      fireParticles = ps;

      const trail = new TrailMesh('ballFireTrail', ballPhysicsMesh as AbstractMesh, gameScene, 0.45 * SCALE, 40, true);
      const trailMat = new StandardMaterial('ballFireTrailMat', gameScene);
      trailMat.emissiveColor = new Color3(1.0, 0.45, 0.06);
      trailMat.diffuseColor = new Color3(1.0, 0.3, 0.0);
      trailMat.specularColor = new Color3(0, 0, 0);
      trailMat.disableLighting = true;
      trail.material = trailMat;
      trail.setEnabled(false);
      fireTrail = trail;
      fireTrailMaterial = trailMat;
    };

    const applyFirePalette = (mode: SuperKickVfxMode): void => {
      const isMaradona = mode === 'maradona';
      const primary = isMaradona
        ? new Color4(0.34, 0.88, 1.0, 1.0)
        : new Color4(1.0, 0.65, 0.15, 1.0);
      const secondary = isMaradona
        ? new Color4(0.18, 0.35, 1.0, 1.0)
        : new Color4(1.0, 0.25, 0.0, 1.0);
      const dead = isMaradona
        ? new Color4(0.05, 0.08, 0.22, 0.0)
        : new Color4(0.25, 0.0, 0.0, 0.0);

      if (fireParticles) {
        fireParticles.color1 = primary;
        fireParticles.color2 = secondary;
        fireParticles.colorDead = dead;
        fireParticles.minSize = isMaradona ? 0.14 * SCALE : 0.18 * SCALE;
        fireParticles.maxSize = isMaradona ? 0.42 * SCALE : 0.52 * SCALE;
        fireParticles.minLifeTime = isMaradona ? 0.12 : 0.10;
        fireParticles.maxLifeTime = isMaradona ? 0.26 : 0.30;
        fireParticles.emitRate = isMaradona ? 320 : 420;
        fireParticles.gravity = isMaradona
          ? new Vector3(0, 1.8 * SCALE, 0)
          : new Vector3(0, 3.5 * SCALE, 0);
        fireParticles.direction1 = isMaradona
          ? new Vector3(-0.9, 0.25, -1.0)
          : new Vector3(-1.2, 0.6, -1.2);
        fireParticles.direction2 = isMaradona
          ? new Vector3(0.9, 1.0, 1.0)
          : new Vector3(1.2, 1.8, 1.2);
      }

      if (fireTrailMaterial) {
        fireTrailMaterial.emissiveColor = isMaradona
          ? new Color3(0.28, 0.82, 1.0)
          : new Color3(1.0, 0.45, 0.06);
        fireTrailMaterial.diffuseColor = isMaradona
          ? new Color3(0.12, 0.42, 1.0)
          : new Color3(1.0, 0.3, 0.0);
      }
    };

    const enableBallFire = (mode: SuperKickVfxMode, duration = SUPER_KICK_VFX_DURATION): void => {
      ensureFireVfx();
      if (ballFireMode !== mode) {
        applyFirePalette(mode);
      }
      ballFireMode = mode;
      ballFireTimer = Math.max(ballFireTimer, duration);
      ballFireActive = true;
      fireParticles?.start();
      fireTrail?.setEnabled(true);
    };

    const disableBallFire = (): void => {
      if (!ballFireActive) return;
      ballFireActive = false;
      ballFireTimer = 0;
      ballFireMode = null;
      fireParticles?.stop();
      fireTrail?.setEnabled(false);
    };

    const updateBallFireVfx = (deltaTime: number): void => {
      if (!ballFireActive) return;
      ballFireTimer = Math.max(0, ballFireTimer - deltaTime);
      if (ballFireTimer <= 0) {
        disableBallFire();
      }
    };

    const addBallSpinTwist = (amount: number): void => {
      ballSpinTwist = Math.max(-18, Math.min(18, ballSpinTwist + amount));
    };

    const updateBallVisualSpin = (deltaTime: number): void => {
      if (!ball?.mesh?.physicsBody) return;

      const v = ball.mesh.physicsBody.getLinearVelocity();

      if (PURE_BALL_PHYSICS) {
        // In pure-physics mode Havok computes realistic angular velocity from
        // friction contacts, but soft contacts (chest receptions, glancing
        // bounces, scripted serve toss) can leave the body with almost no spin
        // while the ball still travels.  To keep rotation looking natural we
        // blend Havok's angular velocity with a velocity-derived rolling spin
        // so the ball always visibly tumbles in its travel direction.
        const ang = ball.mesh.physicsBody.getAngularVelocity();
        const clamp = (x: number): number => Math.max(-BALL_VISUAL_SPIN_MAX, Math.min(BALL_VISUAL_SPIN_MAX, x));
        const rollWx = v.z / Math.max(0.001, ballRadius);
        const rollWz = -v.x / Math.max(0.001, ballRadius);
        // When physics already supplies vigorous spin, trust it; when it's
        // weak (typical after assist-driven contacts) fall back to rolling.
        const angMag = Math.abs(ang.x) + Math.abs(ang.y) + Math.abs(ang.z);
        const rollWeight = Math.max(0, Math.min(1, 1 - angMag / 6));
        const visualWx = clamp(ang.x) + rollWx * rollWeight * 0.85;
        const visualWz = clamp(ang.z) + rollWz * rollWeight * 0.85;
        ballRootMesh.rotation.x += visualWx * deltaTime;
        ballRootMesh.rotation.z += visualWz * deltaTime;
        // y-axis (side-spin / slice) blends physics yaw + arcade twist for extra readability.
        ballRootMesh.rotation.y += (clamp(ang.y) + ballSpinTwist * 0.15) * deltaTime;
      } else {
        // Arcade / assist mode: derive spin from linear velocity so the ball
        // always appears to roll in the direction of travel regardless of physics.
        const wx = v.z / Math.max(0.001, ballRadius);
        const wz = -v.x / Math.max(0.001, ballRadius);
        ballRootMesh.rotation.x += wx * deltaTime * 0.85;
        ballRootMesh.rotation.z += wz * deltaTime * 0.85;
        ballRootMesh.rotation.y += ballSpinTwist * deltaTime * 0.25;

        const ang = ball.mesh.physicsBody.getAngularVelocity();
        const targetAng = new Vector3(
          Math.max(-BALL_VISUAL_SPIN_MAX, Math.min(BALL_VISUAL_SPIN_MAX, wx * 0.22)),
          Math.max(-BALL_VISUAL_SPIN_MAX, Math.min(BALL_VISUAL_SPIN_MAX, ballSpinTwist * 0.35)),
          Math.max(-BALL_VISUAL_SPIN_MAX, Math.min(BALL_VISUAL_SPIN_MAX, wz * 0.22)),
        );
        const blend = 0.14;
        ball.mesh.physicsBody.setAngularVelocity(new Vector3(
          ang.x + (targetAng.x - ang.x) * blend,
          ang.y + (targetAng.y - ang.y) * blend,
          ang.z + (targetAng.z - ang.z) * blend,
        ));
      }

      ballSpinTwist *= Math.max(0, 1 - deltaTime * 1.6);
      if (Math.abs(ballSpinTwist) < 0.05) ballSpinTwist = 0;
    };

    const resetBallOscillationGuard = (): void => {
      oscillationWindowTimer = 0;
      oscillationFlipCountX = 0;
      oscillationFlipCountZ = 0;
      previousBallVelocityY = 0;
      oscillationPrevVelocity.set(0, 0, 0);
      ballInteractionLockSide = null;
      ballInteractionLockTimer = 0;
      if (ball?.mesh) {
        oscillationPrevPosition.copyFrom(ball.mesh.position);
        previousBallPosition.copyFrom(ball.mesh.position);
      } else {
        oscillationPrevPosition.copyFrom(BALL_SPAWN_POSITION);
        previousBallPosition.copyFrom(BALL_SPAWN_POSITION);
      }
    };

    const applyTableAntiTunnelBounce = (): void => {
      if (!PURE_BALL_PHYSICS || !ball?.mesh?.physicsBody) {
        return;
      }

      const vel = ball.mesh.physicsBody.getLinearVelocity();
      if (vel.y >= -0.05 * SCALE) {
        return;
      }

      const tableHalfWidth = tableProfile.halfWidth + 0.14 * SCALE;
      const tableHalfLength = tableProfile.halfLength + 0.16 * SCALE;
      const tableCenterX = tableProfile.centerX;
      const tableCenterZ = tableProfile.centerZ;
      const tableContactCenterY = getTableBallContactY(ball.mesh.position.z);
      const crossTolerance = 0.03 * SCALE;

      const isInsideTableXZ = (p: Vector3): boolean => (
        Math.abs(p.x - tableCenterX) <= tableHalfWidth &&
        Math.abs(p.z - tableCenterZ) <= tableHalfLength
      );

      // Swept segment vs AABB in XZ to detect crossing even when both endpoints
      // are just outside due high lateral speed.
      const segmentCrossesTableXZ = (from: Vector3, to: Vector3): boolean => {
        const minX = tableCenterX - tableHalfWidth;
        const maxX = tableCenterX + tableHalfWidth;
        const minZ = tableCenterZ - tableHalfLength;
        const maxZ = tableCenterZ + tableHalfLength;

        let tMin = 0;
        let tMax = 1;

        const dx = to.x - from.x;
        if (Math.abs(dx) < 1e-6) {
          if (from.x < minX || from.x > maxX) return false;
        } else {
          const tx1 = (minX - from.x) / dx;
          const tx2 = (maxX - from.x) / dx;
          const tEnterX = Math.min(tx1, tx2);
          const tExitX = Math.max(tx1, tx2);
          tMin = Math.max(tMin, tEnterX);
          tMax = Math.min(tMax, tExitX);
          if (tMin > tMax) return false;
        }

        const dz = to.z - from.z;
        if (Math.abs(dz) < 1e-6) {
          if (from.z < minZ || from.z > maxZ) return false;
        } else {
          const tz1 = (minZ - from.z) / dz;
          const tz2 = (maxZ - from.z) / dz;
          const tEnterZ = Math.min(tz1, tz2);
          const tExitZ = Math.max(tz1, tz2);
          tMin = Math.max(tMin, tEnterZ);
          tMax = Math.min(tMax, tExitZ);
          if (tMin > tMax) return false;
        }

        return tMax >= 0 && tMin <= 1;
      };

      const crossedPlaneFromAbove =
        previousBallPosition.y >= tableContactCenterY + crossTolerance &&
        ball.mesh.position.y <= tableContactCenterY - crossTolerance;
      const sweptOverTable =
        segmentCrossesTableXZ(previousBallPosition, ball.mesh.position) ||
        isInsideTableXZ(previousBallPosition) ||
        isInsideTableXZ(ball.mesh.position);

      const deepInsideFallback =
        vel.y < -0.35 * SCALE &&
        ball.mesh.position.y < tableContactCenterY - 0.06 * SCALE &&
        isInsideTableXZ(ball.mesh.position);

      const directTableCapture =
        vel.y < -0.05 * SCALE &&
        sweptOverTable &&
        ball.mesh.position.y <= tableContactCenterY + Math.max(ballRadius * 0.85, 0.18 * SCALE);

      if (!((crossedPlaneFromAbove && sweptOverTable) || deepInsideFallback || directTableCapture)) {
        return;
      }

      let impactX = ball.mesh.position.x;
      let impactZ = ball.mesh.position.z;
      const dy = ball.mesh.position.y - previousBallPosition.y;
      if (Math.abs(dy) > 1e-6) {
        const t = (tableContactCenterY - previousBallPosition.y) / dy;
        const clampedT = Math.max(0, Math.min(1, t));
        impactX = previousBallPosition.x + (ball.mesh.position.x - previousBallPosition.x) * clampedT;
        impactZ = previousBallPosition.z + (ball.mesh.position.z - previousBallPosition.z) * clampedT;
      }

      ball.mesh.position.x = Math.max(tableCenterX - tableHalfWidth, Math.min(tableCenterX + tableHalfWidth, impactX));
      ball.mesh.position.z = Math.max(tableCenterZ - tableHalfLength, Math.min(tableCenterZ + tableHalfLength, impactZ));
      ball.mesh.position.y = tableContactCenterY + 0.002 * SCALE;

      const reboundVy = Math.max(1.35 * SCALE, Math.abs(vel.y) * TABLE_BOUNCE_RESTITUTION);
      ball.mesh.physicsBody.setLinearVelocity(new Vector3(vel.x * 0.985, reboundVy, vel.z * 0.985));
      bounceEventCooldown = Math.max(bounceEventCooldown, 0.18);

      if (DEBUG_POST_RECEPTION_KICK && lastPostReceptionKickDebug) {
        console.log('[kick-debug] table impact', {
          impactX: ball.mesh.position.x,
          impactY: ball.mesh.position.y,
          impactZ: ball.mesh.position.z,
          deltaX: ball.mesh.position.x - lastPostReceptionKickDebug.targetX,
          deltaZ: ball.mesh.position.z - lastPostReceptionKickDebug.targetZ,
          expectedTarget: {
            x: lastPostReceptionKickDebug.targetX,
            y: lastPostReceptionKickDebug.targetY,
            z: lastPostReceptionKickDebug.targetZ,
          },
          launch: lastPostReceptionKickDebug,
        });
        lastPostReceptionKickDebug = null;
      }
    };

    const applyNoGroundFallGuard = (): void => {
      if (!ENABLE_NO_GROUND_FALL_GUARD || !ball?.mesh?.physicsBody) {
        return;
      }

      const vel = ball.mesh.physicsBody.getLinearVelocity();
      const floorGuardY = ballRadius + NO_GROUND_FALL_TRIGGER_HEIGHT;
      const closeToGround = ball.mesh.position.y <= floorGuardY + 0.03 * SCALE;
      const descending = vel.y <= -0.03 * SCALE;
      if (!closeToGround || !descending) {
        return;
      }

      ball.mesh.position.y = floorGuardY;
      const reboundVy = Math.max(NO_GROUND_FALL_REBOUND_MIN_SPEED, Math.abs(vel.y) * NO_GROUND_FALL_RESTITUTION);
      ball.mesh.physicsBody.setLinearVelocity(new Vector3(
        vel.x * NO_GROUND_FALL_LATERAL_DAMPING,
        reboundVy,
        vel.z * NO_GROUND_FALL_LATERAL_DAMPING,
      ));

      bounceEventCooldown = Math.max(bounceEventCooldown, 0.14);

      // Keep rally interaction enabled even if a serve trajectory reaches floor level.
      if (serveState.active && serveState.phase === 'flight') {
        serveState.active = false;
        serveState.phase = 'ready';
        serveState.timer = 0;
        postServeGraceTimer = POST_SERVE_GRACE_SECONDS;
      }
    };

    const resetBall = (): void => {
      if (!ball?.mesh || !ball.mesh.physicsBody) {
        return;
      }

      ball.mesh.position.copyFrom(BALL_SPAWN_POSITION);
      ball.mesh.rotation.set(0, 0, 0);
      ball.mesh.physicsBody.setLinearVelocity(Vector3.Zero());
      ball.mesh.physicsBody.setAngularVelocity(Vector3.Zero());
      resetBallOscillationGuard();
    };

    // Compute the toss anchor for the current serveState and place the ball
    // there.  Always re-shows the ball mesh in case it was hidden during a
    // celebration window.  Caller must have populated serveState first.
    const placeBallAtServeHand = (): void => {
      if (!ball?.mesh || !ball.mesh.physicsBody) return;
      const serverSide = serveState.server;
      const servingPlayer = serverSide === 0 ? charRoot1 : charRoot2;
      const servingCharacter = serverSide === 0 ? player1 : player2;
      const serveConfig = getAnimConfigForClip(serveTypeToProps(serveState.serveType).animKey);
      const serveLoft = serveConfig ? Math.max(0, Math.min(1, serveConfig.ballLoft)) : 0.4;
      const handHeight = (0.94 + serveLoft * 0.07) * SCALE;
      const facing = servingPlayer.rotation.y;
      const forward = new Vector3(Math.sin(facing), 0, Math.cos(facing));
      const handBase = servingCharacter?.getHandControlPosition(serveState.hand)
        ?? servingPlayer.position.add(new Vector3(0, handHeight, 0));
      const bodyToHand = handBase.subtract(servingPlayer.position);
      bodyToHand.y = 0;
      const bodySeparation = bodyToHand.lengthSquared() > 1e-6
        ? bodyToHand.normalize().scale(0.02 * SCALE)
        : Vector3.Zero();
      const frontOffset = forward.scale(0.11 * SCALE);
      const backOfHandBias = forward.scale(-0.02 * SCALE);
      const tossAnchor = handBase
        .add(bodySeparation)
        .add(frontOffset)
        .add(backOfHandBias)
        .add(new Vector3(0, 0.02 * SCALE, 0));

      ball.mesh.position.copyFrom(tossAnchor);
      ball.mesh.rotation.set(0, 0, 0);
      ball.mesh.physicsBody.setLinearVelocity(Vector3.Zero());
      ball.mesh.physicsBody.setAngularVelocity(Vector3.Zero());
      ball.mesh.isVisible = true;
    };

    const resetBallForServe = (server: number, placeBallAtHand: boolean = true): void => {
      if (!ball?.mesh || !ball.mesh.physicsBody) {
        return;
      }

      const serverSide: CourtSide = server === 0 ? 0 : 1;
      // For AI-controlled servers, pick a random serve type each rally so the
      // AI exercises all four serves (leftFoot, rightFoot, headLeft, headRight)
      // rather than spamming a single preference.
      const serverIsAI = serverSide === 0 ? ENABLE_P1_AI : ENABLE_P2_AI;
      if (serverIsAI) {
        const randomServe = SERVE_TYPE_ORDER[Math.floor(Math.random() * SERVE_TYPE_ORDER.length)];
        if (serverSide === 0) p1ServeType = randomServe;
        else                  p2ServeType = randomServe;
      }
      // Restore the persistent serve-type preference for this player.
      const serveType: ServeType = serverSide === 0 ? p1ServeType : p2ServeType;
      const { animKey: serveAnimKey, foot, hand } = serveTypeToProps(serveType);
      const serveConfig = getAnimConfigForClip(serveAnimKey);
      serveState.active = true;
      serveState.server = serverSide;
      serveState.phase = 'ready';
      serveState.timer = 0;
      serveState.tossReleased = false;
      serveState.strikeApplied = false;
      serveState.animationStarted = false;
      serveState.serveType = serveType;
      serveState.foot = foot;
      serveState.hand = hand;
      serveState.tossBallTarget = null;
      serveState.tossStartPos = null;

      const servingPlayer = server === 0 ? charRoot1 : charRoot2;
      const receivingPlayer = server === 0 ? charRoot2 : charRoot1;
      const serveLineZ = SERVE_LINE_Z;
      const receiveAnticipationDepth = 0.92 * SCALE;

      // Deterministic serve reset: always return players to centered initial serve positions.
      const serverX = 0;
      const anticipatedReceiverX = 0;
      const serverZ = serverSide === 0 ? -(serveLineZ + 0.12 * SCALE) : (serveLineZ + 0.12 * SCALE);
      const receiverZ = serverSide === 0
        ? serveLineZ + receiveAnticipationDepth
        : -(serveLineZ + receiveAnticipationDepth);

      servingPlayer.position.x = serverX;
      servingPlayer.position.z = serverZ;
      receivingPlayer.position.x = anticipatedReceiverX;
      receivingPlayer.position.z = receiverZ;

      // Reset both players facing toward the table for consistent serve direction.
      charRoot1.rotation.y = getCourtCenterFacing(charRoot1.position) + PLAYER_MODEL_YAW_OFFSET;
      charRoot2.rotation.y = getCourtCenterFacing(charRoot2.position) + PLAYER_MODEL_YAW_OFFSET;
      charRoot1.computeWorldMatrix(true);
      charRoot2.computeWorldMatrix(true);

      // If restart happens mid-serve, cancel any active one-shot pose so the
      // next toss/strike anchors are computed from a clean idle stance.
      player1?.playAnimation('idle', true);
      player2?.playAnimation('idle', true);

      if (p1Capsule) {
        p1Capsule.position.x = charRoot1.position.x;
        p1Capsule.position.z = charRoot1.position.z;
      }
      if (p2Capsule) {
        p2Capsule.position.x = charRoot2.position.x;
        p2Capsule.position.z = charRoot2.position.z;
      }

      if (placeBallAtHand) {
        placeBallAtServeHand();
      }
      resetBallOscillationGuard();

      // Start the visual 3-second pre-serve countdown so players can reset
      // before the next rally begins — UNLESS a celebration window is active
      // (post-point), in which case the countdown is scheduled to begin AFTER
      // the celebration finishes so the celebration/defeat clip is not buried
      // under the countdown numeral.
      if (celebrationWindowTimer > 0) {
        pendingPreServeCountdown = true;
        preServeCountdownTimer = 0;
        EventBus.emit('serve:countdown', null);
      } else {
        preServeCountdownTimer = PRE_SERVE_COUNTDOWN_SECONDS;
        EventBus.emit('serve:countdown', PRE_SERVE_COUNTDOWN_SECONDS);
      }
    };

    const clearRallyState = (): void => {
      clearReceptionForecasts();
      p1Request.action = null;
      p1Request.ttl = 0;
      requestPowerByPlayer[0] = 1;
      p2Request.action = null;
      p2Request.ttl = 0;
      requestPowerByPlayer[1] = 1;
      p1Assist.active = false;
      p1Assist.action = null;
      p1Assist.timer = 0;
      p1Assist.hitApplied = false;
      p2Assist.active = false;
      p2Assist.action = null;
      p2Assist.timer = 0;
      p2Assist.hitApplied = false;
      p1StrikeState.action = null;
      p1StrikeState.timer = 0;
      p2StrikeState.action = null;
      p2StrikeState.timer = 0;
      postKickLockTimer = 0;
      postKickLockSpeed = 0;
      lastTouchPlayer = null;
      touchesByPlayer[0] = 0;
      touchesByPlayer[1] = 0;
      canKickAfterReceptionByPlayer[0] = false;
      canKickAfterReceptionByPlayer[1] = false;
      rallyPhaseByPlayer[0] = 'defense';
      rallyPhaseByPlayer[1] = 'defense';
      tableBouncesOnSideSinceLastTouch[0] = 0;
      tableBouncesOnSideSinceLastTouch[1] = 0;
      ballReachedOpponentSideSinceLastTouch = false;
      ballOutOfCourtTriggered = false;
      ballHitOutOfCourtGeometry = false;
      bounceEventCooldown = 0;
      serveBounceGrace = 0;
      pendingPrepSuperHigh[0] = false;
      pendingPrepSuperHigh[1] = false;
      pendingKickPowerBoost[0] = false;
      pendingKickPowerBoost[1] = false;
      // End any active superpower effect with the rally.
      disableBallFire();
      maradonaCurveArmedBall = false;
      superKickInFlight = false;
    };

    const emitPointScored = (team: 1 | 2): void => {
      EventBus.emit<PointScoredEvent>('match:pointScored', {
        team,
        score: [matchManager.score[0], matchManager.score[1]],
        sets:  [matchManager.sets[0],  matchManager.sets[1]],
      });
    };

    const startPointResultAnimations = (scoringTeam: number): void => {
      pointResultAnimationToken += 1;
      const animationToken = pointResultAnimationToken;
      pointResultAnimationsActive = 0;

      const trackAnimationEnd = (): void => {
        if (animationToken !== pointResultAnimationToken) {
          return;
        }
        pointResultAnimationsActive = Math.max(0, pointResultAnimationsActive - 1);
      };

      const winnerCharacter = scoringTeam === 0 ? player1 : player2;
      const loserCharacter = scoringTeam === 0 ? player2 : player1;

      // Two celebration variants in the rig — alternate so consecutive points
      // don't feel canned. Both clips queue in the same synchronous block on
      // independent character animation systems, so they start simultaneously.
      const celebrationKey: PlayerAnimKey = Math.random() < 0.5 ? 'celebration' : 'celebrationAlt';
      if (winnerCharacter.playAnimation(celebrationKey, false, false, trackAnimationEnd)) {
        pointResultAnimationsActive += 1;
      }
      if (loserCharacter.playAnimation('defeat', false, false, trackAnimationEnd)) {
        pointResultAnimationsActive += 1;
      }
    };

    const clearPointResultAnimations = (): void => {
      pointResultAnimationToken += 1;
      pointResultAnimationsActive = 0;
    };

    const finalizePointAward = (
      scoringTeam: number,
      previousSets: [number, number],
      matchWasActive: boolean,
    ): void => {
      const setWon = matchManager.sets[0] !== previousSets[0] || matchManager.sets[1] !== previousSets[1];
      const matchWon = matchWasActive && !matchManager.isMatchActive;
      const winnerIndex = scoringTeam === 0 ? 0 : 1;
      const winnerRoot = winnerIndex === 0 ? charRoot1 : charRoot2;

      emitPointScored((scoringTeam + 1) as 1 | 2);
      if (setWon) {
        if (matchWon) {
          pointVFXSystem?.triggerMatchWinCelebration(winnerRoot, winnerIndex);
        } else {
          pointVFXSystem?.triggerSetWinCelebration(winnerRoot, winnerIndex);
        }
      }
      clearRallyState();

      pointFreezeActive = true;
      pointFreezeWinner = scoringTeam === 0 ? 0 : 1;
      celebrationWindowTimer = CELEBRATION_WINDOW_SECONDS;

      // Reset positions FIRST (this resets both characters to idle).  Then
      // queue the celebration + defeat clips in the SAME synchronous block so
      // they start on the same frame on their independent animation systems.
      if (matchManager.isMatchActive) {
        // Leave the ball wherever the rally ended (typically on the floor or
        // bleachers) for the duration of the celebration / defeat clip.  The
        // ball is teleported back to the server's hand only when the
        // celebration window expires (see the celebrationWindowTimer tick),
        // which is the moment the player is "ready to serve".
        resetBallForServe(matchManager.currentServer, false);
      }
      startPointResultAnimations(scoringTeam);
    };

    const awardPoint = (scoringTeam: number): void => {
      const previousSets: [number, number] = [matchManager.sets[0], matchManager.sets[1]];
      const matchWasActive = matchManager.isMatchActive;
      playApplauseSfx(); // crowd applause on every awarded point
      matchManager.recordPoint(scoringTeam);
      // Supercharge economy: P1 (team 0) banks a charge for every two points won
      // in a row.  Losing a point breaks the streak.
      if (scoringTeam === 0) {
        p1PointStreak += 1;
        if (p1PointStreak >= 2) {
          p1SuperAvailable = true;
          p1PointStreak = 0;
        }
      } else {
        p1PointStreak = 0;
      }
      finalizePointAward(scoringTeam, previousSets, matchWasActive);
    };

    const restartServeNoPoint = (): void => {
      if (serveState.active) {
        const previousSets: [number, number] = [matchManager.sets[0], matchManager.sets[1]];
        const matchWasActive = matchManager.isMatchActive;
        const doubleFaultOpponent = matchManager.recordFailedServe(serveState.server);
        if (doubleFaultOpponent !== null) {
          // Double fault: point already recorded inside recordFailedServe; just
          // run the post-point side effects (announcement, reset).
          finalizePointAward(doubleFaultOpponent, previousSets, matchWasActive);
          return;
        }
      }
      clearRallyState();
      resetBallForServe(matchManager.currentServer);
    };

    const quickRestartRally = (server: CourtSide = 0): void => {
      // Preserve score/sets but restart a clean serve instantly for fast visual iteration.
      clearPointResultAnimations();
      matchManager.resetServe(server);
      clearRallyState();
      resetBallForServe(server);
    };

    const getPreviewTarget = (): { character: Character | undefined; baseYaw: number } => {
      if (animationPreviewPlayer === 1) {
        return { character: player1, baseYaw: PLAYER_MODEL_YAW_OFFSET };
      }
      return { character: player2, baseYaw: Math.PI + PLAYER_MODEL_YAW_OFFSET };
    };

    type PreviewPoseRule = {
      startYawDeg?: number;
      mirrorStartYawDeg?: number;
      endYawDeg?: number;
      mirrorEndYawDeg?: number;
    };

    const normalizeClipToken = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '');

    const PREVIEW_POSE_RULES: Record<string, PreviewPoseRule> = {
      // The first 3 unnamed tracks correspond to BicycleLeftFootKick variants.
      armature001mixamotpose1baselayer: { startYawDeg: 180, mirrorStartYawDeg: 180, endYawDeg: 5, mirrorEndYawDeg: 5 },
      armature001mixamotpose1baselayer001: { startYawDeg: 180, mirrorStartYawDeg: 180, endYawDeg: 5, mirrorEndYawDeg: 5 },
      armature001mixamotpose1baselayer001retarget: { startYawDeg: 180, mirrorStartYawDeg: 180, endYawDeg: 5, mirrorEndYawDeg: 5 },
      idle: { startYawDeg: 5, mirrorStartYawDeg: 5, endYawDeg: 5, mirrorEndYawDeg: 5 },
      bridgereceptionleftfoot: { startYawDeg: 45, mirrorStartYawDeg: -135, endYawDeg: 5, mirrorEndYawDeg: 5 },
      bridgereceptionrightfoot: { startYawDeg: 90, mirrorStartYawDeg: 90, endYawDeg: 5, mirrorEndYawDeg: 5 },
      chestkick: { startYawDeg: 180, mirrorStartYawDeg: 180, endYawDeg: 5, mirrorEndYawDeg: 5 },
      chestreception: { startYawDeg: 180, mirrorStartYawDeg: 180, endYawDeg: 5, mirrorEndYawDeg: 5 },
      chestprepleft: { startYawDeg: 180, mirrorStartYawDeg: 180, endYawDeg: 5, mirrorEndYawDeg: 5 },
      chestprepright: { startYawDeg: 180, mirrorStartYawDeg: 180, endYawDeg: 5, mirrorEndYawDeg: 5 },
      closetablelowheadkick: { startYawDeg: 180, mirrorStartYawDeg: 180, endYawDeg: 5, mirrorEndYawDeg: 5 },
      closetablelowheadkick001: { startYawDeg: 180, mirrorStartYawDeg: 180, endYawDeg: 5, mirrorEndYawDeg: 5 },
      closetablerightfootkick: { startYawDeg: 0, mirrorStartYawDeg: 0, endYawDeg: 5, mirrorEndYawDeg: 5 },
      headkick: { startYawDeg: 0, mirrorStartYawDeg: 0, endYawDeg: 5, mirrorEndYawDeg: 5 },
      hearserve: { startYawDeg: 0, mirrorStartYawDeg: 0, endYawDeg: 5, mirrorEndYawDeg: 5 },
      innerleftfootreception: { startYawDeg: 45, mirrorStartYawDeg: -135, endYawDeg: 5, mirrorEndYawDeg: 5 },
      innerrightfootreception: { startYawDeg: 90, mirrorStartYawDeg: 90, endYawDeg: 5, mirrorEndYawDeg: 5 },
      highkickleftfoot: { startYawDeg: 180, mirrorStartYawDeg: 180, endYawDeg: 5, mirrorEndYawDeg: 5 },
      leftfootkick: { startYawDeg: 180, mirrorStartYawDeg: 180, endYawDeg: 5, mirrorEndYawDeg: 5 },
      jogbackward: { startYawDeg: 180, mirrorStartYawDeg: 180, endYawDeg: 5, mirrorEndYawDeg: 5 },
      jogforward: { startYawDeg: 180, mirrorStartYawDeg: 180, endYawDeg: 5, mirrorEndYawDeg: 5 },
      jogforward001: { startYawDeg: 0, mirrorStartYawDeg: 0, endYawDeg: 5, mirrorEndYawDeg: 5 },
      jogstrafeleft: { startYawDeg: 90, mirrorStartYawDeg: 90, endYawDeg: 5, mirrorEndYawDeg: 5 },
      jogstraferight: { startYawDeg: 0, mirrorStartYawDeg: 0, endYawDeg: 5, mirrorEndYawDeg: 5 },
      jumpheadkick: { startYawDeg: 180, mirrorStartYawDeg: 180, endYawDeg: 5, mirrorEndYawDeg: 5 },
      quickjogforward: { startYawDeg: 180, mirrorStartYawDeg: 180, endYawDeg: 5, mirrorEndYawDeg: 5 },
      leftkneereception: { startYawDeg: 90, mirrorStartYawDeg: 90, endYawDeg: 5, mirrorEndYawDeg: 5 },
      rightkneereception: { startYawDeg: 90, mirrorStartYawDeg: 90, endYawDeg: 5, mirrorEndYawDeg: 5 },
      righttoefootreception: { startYawDeg: 5, mirrorStartYawDeg: 5, endYawDeg: 5, mirrorEndYawDeg: 5 },
      serveleftfoot: { startYawDeg: 60, mirrorStartYawDeg: 60, endYawDeg: 5, mirrorEndYawDeg: 5 },
      serverightfoot: { startYawDeg: 60, mirrorStartYawDeg: 60, endYawDeg: 5, mirrorEndYawDeg: 5 },
      solerightfootkick: { startYawDeg: 0, mirrorStartYawDeg: 0, endYawDeg: 5, mirrorEndYawDeg: 5 },
    };

    const getPreviewPoseRule = (clipName: string): PreviewPoseRule => {
      const token = normalizeClipToken(clipName);
      return PREVIEW_POSE_RULES[token] ?? { endYawDeg: 5 };
    };

    const playPreviewClip = (loop: boolean): void => {
      const { character, baseYaw } = getPreviewTarget();
      const clips = character?.getAnimationClipNames() ?? [];
      if (!character || clips.length === 0) {
        console.log('[Debug] preview target has no animation clips');
        return;
      }

      const index = Math.max(0, Math.min(animationPreviewClipIndex, clips.length - 1));
      const clipName = clips[index];
      const poseRule = getPreviewPoseRule(clipName);
      const facingOffset = animationPreviewFacingFlip ? Math.PI : 0;
      const startYawDeg = animationPreviewMirror && poseRule.mirrorStartYawDeg !== undefined
        ? poseRule.mirrorStartYawDeg
        : (poseRule.startYawDeg ?? 0);
      const endYawDeg = animationPreviewMirror && poseRule.mirrorEndYawDeg !== undefined
        ? poseRule.mirrorEndYawDeg
        : (poseRule.endYawDeg ?? startYawDeg);
      const mirrorYawComp = animationPreviewMirror ? Math.PI : 0;
      const startYawRad = baseYaw + facingOffset + mirrorYawComp + (startYawDeg * Math.PI / 180);
      const endYawRad = baseYaw + facingOffset + mirrorYawComp + (endYawDeg * Math.PI / 180);
      character.mesh.rotation.y = startYawRad;
      animationPreviewLockedYaw = startYawRad;
      character.mesh.computeWorldMatrix(true);
      character.playAnimationClipByIndex(
        index,
        loop,
        animationPreviewMirror,
        animationPreviewSpeed,
        loop
          ? undefined
          : () => {
              character.mesh.rotation.y = endYawRad;
              animationPreviewLockedYaw = endYawRad;
              character.mesh.computeWorldMatrix(true);
            },
      );
      console.log(
        `[Debug] P${animationPreviewPlayer} ${loop ? 'loop' : 'playOnce'} clip[${index}] ${clipName} | ` +
        `speed=${animationPreviewSpeed.toFixed(2)} mirror=${animationPreviewMirror} facingFlip=${animationPreviewFacingFlip} ` +
        `yaw=${startYawDeg} endYaw=${endYawDeg}`
      );
    };

    const sideFromZ = (z: number): CourtSide => (z < 0 ? 0 : 1);

    const updateServeSequence = (deltaTime: number): void => {
      if (!serveState.active || !ball?.mesh?.physicsBody) {
        return;
      }
      // During the celebration / defeat window the ball is meant to lie on the
      // floor where the rally ended; do NOT pin it to the server's hand here
      // (the per-frame toss/ready logic below would otherwise teleport it
      // every frame).  The ball is brought back to the hand exactly once when
      // the celebration timer expires (see the celebrationWindowTimer tick).
      if (celebrationWindowTimer > 0) {
        return;
      }

      const servingPlayer = serveState.server === 0 ? charRoot1 : charRoot2;
      const servingCharacter = serveState.server === 0 ? player1 : player2;
      const strikeDirection = serveState.server === 0 ? 1 : -1;
      const facing = servingPlayer.rotation.y;
      const forward = new Vector3(Math.sin(facing), 0, Math.cos(facing));
      const right = new Vector3(forward.z, 0, -forward.x);
      const { animKey: serveAnimKey } = serveTypeToProps(serveState.serveType);
      const serveConfig = getAnimConfigForClip(serveAnimKey);
      const serveLoft = serveConfig ? Math.max(0, Math.min(1, serveConfig.ballLoft)) : 0.4;
      const clipLengthFrames = Math.max(1, Math.round(serveConfig?.clipLengthFrames ?? 146));
      const tossFrame = Math.max(1, Math.min(clipLengthFrames, Math.round(serveConfig?.tossFrame ?? 1)));
      const contactFrame = Math.max(tossFrame + 1, Math.min(clipLengthFrames, Math.round(serveConfig?.contactFrame ?? 55)));
      const rawWindowStart = serveConfig?.contactWindow?.[0] ?? contactFrame;
      const rawWindowEnd = serveConfig?.contactWindow?.[1] ?? Math.min(clipLengthFrames, contactFrame + 11);
      const strikeWindowStartFrame = Math.max(0, Math.min(contactFrame, Math.min(rawWindowStart, rawWindowEnd)));
      const strikeWindowEndFrame = Math.max(strikeWindowStartFrame, Math.min(clipLengthFrames, Math.max(rawWindowStart, rawWindowEnd)));

      // Detect foot-serve vs head-serve from the animConfig activeBone field.
      const isFootServe = /foot/i.test(serveConfig?.activeBone ?? '');

      const handHeight = (0.94 + serveLoft * 0.07) * SCALE;
      const handBase = servingCharacter?.getHandControlPosition(serveState.hand)
        ?? servingPlayer.position.add(new Vector3(0, handHeight, 0));
      const bodyToHand = handBase.subtract(servingPlayer.position);
      bodyToHand.y = 0;
      const bodySeparation = bodyToHand.lengthSquared() > 1e-6
        ? bodyToHand.normalize().scale(0.02 * SCALE)
        : Vector3.Zero();
      const frontOffset = forward.scale(0.11 * SCALE);
      const backOfHandBias = forward.scale(-0.02 * SCALE);
      const tossAnchor = handBase
        .add(bodySeparation)
        .add(frontOffset)
        .add(backOfHandBias)
        .add(new Vector3(0, 0.02 * SCALE, 0));

      // Contact anchor: foot position for foot-serves, head position for header serves.
      let contactBase: Vector3;
      let targetApexY: number;
      if (isFootServe) {
        const footControlPos = servingCharacter?.getFootControlPosition(serveState.foot)
          ?? servingPlayer.position.add(new Vector3(0, 0.35 * SCALE, 0));
        const footHeightFromGround = Math.max(0.10 * SCALE, footControlPos.y - servingPlayer.position.y);
        contactBase = new Vector3(
          footControlPos.x,
          servingPlayer.position.y + footHeightFromGround,
          footControlPos.z,
        );
        // Toss arc goes above the hand then falls back down to foot level.
        targetApexY = tossAnchor.y + (0.55 + serveLoft * 0.20) * SCALE;
      } else {
        const headControlPos = servingCharacter?.getHeadControlPosition() ?? servingPlayer.position.add(new Vector3(0, 1.72 * SCALE, 0));
        const headHeightFromGround = Math.max(1.40 * SCALE, headControlPos.y - servingPlayer.position.y);
        contactBase = new Vector3(
          headControlPos.x,
          servingPlayer.position.y + headHeightFromGround,
          headControlPos.z,
        );
        targetApexY = contactBase.y + ((0.17 + serveLoft * 0.04) * SERVE_TOSS_HEIGHT_MULT) * SCALE;
      }

      // Keep authored frame order but let apex happen slightly before contact.
      const frameSpanToContact = Math.max(1, contactFrame - tossFrame);
      const riseToApex = Math.max(0.10 * SCALE, targetApexY - tossAnchor.y);
      const timeToApex = Math.max(0.26, Math.min(0.76, Math.sqrt((2 * riseToApex) / gravityAbs)));
      const preContactFallTime = 0.10;
      const frameTimeScale = (timeToApex + preContactFallTime) / frameSpanToContact;
      const frameToTime = (frame: number): number => Math.max(0, (Math.max(tossFrame, frame) - tossFrame) * frameTimeScale);
      const tossReleaseTime = 0;
      const strikeWindowStartTime = frameToTime(strikeWindowStartFrame);
      const strikeWindowEndTime = frameToTime(strikeWindowEndFrame + 1);
      const contactTime = frameToTime(contactFrame);
      const timeFromTossToContact = Math.max(0.12, contactTime - tossReleaseTime);

      // Shape toss direction from launch: 15 degrees right and 10 degrees forward relative to vertical.
      const rightLaunchAngleRad = SERVE_TOSS_RIGHT_ANGLE_DEG * Math.PI / 180;
      const forwardLaunchAngleRad = SERVE_TOSS_FORWARD_ANGLE_DEG * Math.PI / 180;
      const launchVerticalSpeed = gravityAbs * timeToApex;
      const desiredRightOffset = Math.tan(rightLaunchAngleRad) * launchVerticalSpeed * timeFromTossToContact;
      const desiredForwardOffset = Math.tan(forwardLaunchAngleRad) * launchVerticalSpeed * timeFromTossToContact;
      const maxRightOffset = SERVE_TOSS_CONTACT_RIGHT_MAX * SCALE;
      const maxForwardOffset = SERVE_TOSS_CONTACT_FORWARD_MAX * SCALE;
      const clampedRightOffset = Math.max(-maxRightOffset, Math.min(maxRightOffset, desiredRightOffset));
      const clampedForwardOffset = Math.max(-maxForwardOffset, Math.min(maxForwardOffset, desiredForwardOffset));
      const contactAnchor = new Vector3(
        contactBase.x + right.x * clampedRightOffset + forward.x * clampedForwardOffset,
        contactBase.y,
        contactBase.z + right.z * clampedRightOffset + forward.z * clampedForwardOffset,
      );

      const serveBounceHalfWidth = Math.max(0.35 * SCALE, Math.min(0.65 * TABLE_SCALE, tableProfile.halfWidth * 0.78));
      const serveBounceDepth = Math.max(0.28 * SCALE, Math.min(0.58 * TABLE_SCALE, tableProfile.halfLength * 0.35));
      const serveBounceZ = tableProfile.centerZ + strikeDirection * serveBounceDepth;
      const serveBounceTarget = new Vector3(
        Math.max(
          tableProfile.centerX - serveBounceHalfWidth,
          Math.min(tableProfile.centerX + serveBounceHalfWidth, tableProfile.centerX + servingPlayer.position.x * 0.22),
        ),
        getTableBallContactY(serveBounceZ) + ballRadius * 0.96,
        serveBounceZ,
      );
      const tossDelta = contactAnchor.subtract(tossAnchor);
      const tossVelocity = new Vector3(
        tossDelta.x / timeFromTossToContact,
        gravityAbs * timeToApex,
        tossDelta.z / timeFromTossToContact,
      );
      tossVelocity.y = Math.max(2.2 * SCALE, Math.min(6.8 * SCALE, tossVelocity.y));

      if (serveState.phase === 'ready') {
        serveState.timer += deltaTime;
        ball.mesh.position.copyFrom(tossAnchor);
        ball.mesh.physicsBody.setLinearVelocity(Vector3.Zero());
        ball.mesh.physicsBody.setAngularVelocity(Vector3.Zero());

        if (pointResultAnimationsActive > 0) {
          return;
        }

        // Keep server in neutral pose during ready so R-interrupted serves
        // cannot carry over stale head/hand transforms into a new toss.
        servingCharacter?.playAnimation('idle', true);
        return;
      }

      if (serveState.phase === 'toss') {
        // --- Frame constants (stable across the whole toss phase) ---
        const clipFrom = servingCharacter?.getActiveAnimationFrom() ?? 0;
        const startupTrim = serveConfig?.startupTrimFrames ?? 0;
        const safeStart = clipFrom + startupTrim;
        // contactFrame / tossFrame in ANIM_CONFIG are post-trim; convert to
        // absolute clip frames by adding back the trim / clip start.
        const tossFramePost = serveConfig?.tossFrame ?? 0;
        const tossFrameAbs = safeStart + tossFramePost;
        const contactFrameAbs = safeStart + contactFrame;
        const flightFrames = Math.max(1, contactFrameAbs - tossFrameAbs);

        if (serveState.timer <= 0) {
          ball.mesh.position.copyFrom(tossAnchor);
          ball.mesh.physicsBody.setAngularVelocity(Vector3.Zero());
          ball.mesh.physicsBody.setLinearVelocity(Vector3.Zero());
          serveState.tossReleased = false;

          if (!serveState.animationStarted) {
            serveState.animationStarted = true;
            servingCharacter?.playAnimation(serveAnimKey, false);
          }
        }

        // Sample the strike-bone position once for the toss arc endpoint.
        // Restore to safeStart so the live animation continues from there.
        if (serveState.tossBallTarget === null && serveState.animationStarted) {
          const sampled = servingCharacter?.sampleServeBoneAtFrame(
            contactFrameAbs, safeStart, isFootServe, serveState.foot,
          ) ?? null;

          if (isFootServe) {
            // Y: sampled bone height when valid, otherwise mid-thigh fallback.
            // XZ: set later, relative to the actual toss-release position (see below).
            //     Using an absolute player-center offset here is unreliable because
            //     the tossing hand may already be far toward the kick side at the
            //     release frame, making dx ≈ 0 and the arc go straight up/down.
            const FOOT_HIT_Y = 0.58 * SCALE;
            const validBoneY = sampled !== null && sampled.y > servingPlayer.position.y + 0.05;
            const targetY    = validBoneY ? sampled!.y : servingPlayer.position.y + FOOT_HIT_Y;
            serveState.tossBallTarget = new Vector3(0, targetY, 0);  // XZ placeholder
          } else {
            // Head serves: sampled bone position is reliable for XYZ.
            const fallbackY = servingPlayer.position.y + 1.65 * SCALE;
            serveState.tossBallTarget = sampled
              ?? new Vector3(tossAnchor.x, fallbackY, tossAnchor.z);
          }
        }

        // --- Kinematic toss: ball tracks the hand until release, then arcs ---
        //
        // PRE-RELEASE  (frame < tossFrameAbs):
        //   Ball follows the live hand bone (tossAnchor) so it smoothly rides
        //   the animation from the idle pose through the serve wind-up.
        //
        // RELEASE (frame == tossFrameAbs):
        //   Snapshot the live hand position → frozenStart (the arc origin).
        //
        // POST-RELEASE (frame > tossFrameAbs):
        //   Ballistic arc from frozenStart toward the strike bone, arriving at
        //   contactFrameAbs.
        //
        // TIMING: driven by masterFrame so the arc is always in sync with the
        //   animation regardless of speedRatio.
        //
        // XZ DIRECTION:
        //   Foot serves  — arc toward tossBallTarget (player-right-vector offset,
        //     set above) so the ball reliably arcs to the kick side.
        //   Head serves  — slight forward lean only; head is roughly centered.
        //
        // Y HEIGHT:
        //   Foot serves  — target the sampled bone Y; min apex 0.45 SCALE.
        //   Head serves  — add a height lift above the tilted-head contact pose
        //     so the ball arrives at proper striking height; min apex 0.85 SCALE.
        {
          const masterFrame = servingCharacter?.getActiveAnimationFrame();
          const frameForGate = (masterFrame !== null && masterFrame !== undefined)
            ? masterFrame
            : safeStart + serveState.timer * ANIM_CONFIG_FPS;

          if (frameForGate < tossFrameAbs) {
            // Pre-release: ball rides the hand bone.
            ball.mesh.position.copyFrom(tossAnchor);
            serveState.tossReleased = false;
          } else {
            // Snapshot the release position exactly once, at the toss frame.
            if (serveState.tossStartPos === null) {
              serveState.tossStartPos = tossAnchor.clone();
              // Foot serves: now that we know exactly where the hand releases,
              // pin the toss-target XZ to a fixed lateral offset from that point.
              // This guarantees a visible arc regardless of how far the hand has
              // already drifted during the wind-up (which would make dx ≈ 0 if
              // we used a player-center-based absolute target).
              if (isFootServe && serveState.tossBallTarget) {
                const footSideSign    = serveState.foot === 'right' ? -1 : 1; // model L/R is inverted vs world right vector
                const FOOT_LATERAL    = 0.70 * SCALE; // lateral travel from release to kick
                serveState.tossBallTarget.x = serveState.tossStartPos.x + right.x * footSideSign * FOOT_LATERAL;
                serveState.tossBallTarget.z = serveState.tossStartPos.z + right.z * footSideSign * FOOT_LATERAL;
              }
            }
            const frozenStart = serveState.tossStartPos;

            // Normalised progress [0, 1] from release to contact.
            const alpha = Math.max(0, Math.min(1, (frameForGate - tossFrameAbs) / flightFrames));
            const visualFlightTime = Math.min(flightFrames / ANIM_CONFIG_FPS, 0.75);
            const t = alpha * visualFlightTime;

            // --- XZ + Y arc targets ---
            let dx: number;
            let dz: number;
            let boneY: number;

            if (isFootServe && serveState.tossBallTarget) {
              // Aim at the exact world-XZ of the kicking-foot bone at contact.
              // This is rotation-agnostic and needs no manual lateral tuning.
              dx = serveState.tossBallTarget.x - frozenStart.x;
              dz = serveState.tossBallTarget.z - frozenStart.z;
              boneY = serveState.tossBallTarget.y;
            } else {
              // Head serve: slight forward lean, no lateral drift.
              const forwardAmt = 0.12 * SCALE;
              dx = forward.x * forwardAmt;
              dz = forward.z * forwardAmt;
              // The head tilts down at contactFrame so its sampled Y is too low.
              // Add a lift so the ball arrives at proper head-strike height.
              const rawBoneY = serveState.tossBallTarget?.y
                ?? (servingPlayer.position.y + 1.65 * SCALE);
              boneY = rawBoneY + 0.30 * SCALE;
            }

            const dy = boneY - frozenStart.y;
            const rawVy0 = (dy + 0.5 * gravityAbs * visualFlightTime * visualFlightTime)
              / visualFlightTime;

            // Foot serves: use rawVy0 directly so the ball genuinely descends to
            // ankle level (a large minVy0 floor would make it land near hand height).
            // Small floor (0.2 SCALE) just prevents an unnatural downward launch.
            //
            // Head serves: enforce a tall arc (min apex 0.85 SCALE) so the ball
            // goes clearly above the player and comes back down to head height.
            const vy0 = isFootServe
              ? Math.max(rawVy0 * 3.5, 0.2 * SCALE)  // ×√2 → 2× apex height
              : Math.max(rawVy0, Math.sqrt(2.0 * gravityAbs * 0.85 * SCALE));
            const vx = dx / visualFlightTime;
            const vz = dz / visualFlightTime;

            ball.mesh.position.set(
              frozenStart.x + vx * t,
              frozenStart.y + vy0 * t - 0.5 * gravityAbs * t * t,
              frozenStart.z + vz * t,
            );
            serveState.tossReleased = true;
          }

          ball.mesh.physicsBody.setLinearVelocity(Vector3.Zero());
          ball.mesh.physicsBody.setAngularVelocity(Vector3.Zero());

          if (frameForGate >= contactFrameAbs) {
            serveState.phase = 'strike';
            serveState.timer = 0;
            serveState.strikeApplied = false;
            return;
          }
        }

        serveState.timer += deltaTime;
        return;
      }

      if (serveState.phase === 'flight') {
        serveState.timer += deltaTime;
        if (serveState.timer >= SERVE_FLIGHT_LOCK_MAX_SECONDS) {
          if (PURE_BALL_PHYSICS) {
            serveState.active = false;
            serveState.phase = 'ready';
            serveState.timer = 0;
            postServeGraceTimer = POST_SERVE_GRACE_SECONDS;
          } else {
            restartServeNoPoint();
          }
        }
        return;
      }

      // Strike phase — ball was kinematically placed at the foot, so apply launch immediately.
      serveState.timer += deltaTime;
      const strikeControl = isFootServe
        ? (servingCharacter?.getFootControlPosition(serveState.foot) ?? contactAnchor)
        : (servingCharacter?.getHeadControlPosition() ?? contactAnchor);
      const strikeAnchor = new Vector3(
        strikeControl.x + forward.x * (0.04 * SCALE * strikeDirection),
        strikeControl.y + (isFootServe ? 0.0 : 0.02) * SCALE,
        strikeControl.z + forward.z * (0.04 * SCALE * strikeDirection),
      );
      const strikeWindowDuration = Math.max(0.06, strikeWindowEndTime - strikeWindowStartTime);

      // Since the toss is kinematic the ball is guaranteed to be at the foot on entry.
      // Skip distance/descending checks — apply on the very first tick of the strike phase.
      const applyThisFrame = serveState.timer <= deltaTime * 2;

      if (!serveState.strikeApplied && applyThisFrame) {
        const contactLift = new Vector3(0, 0.03 * SCALE, 0);
        ball.mesh.position.copyFrom(strikeAnchor.add(contactLift));

        const from = ball.mesh.position.clone();
        const to = serveBounceTarget.subtract(from);
        const flat = new Vector3(to.x, 0, to.z);
        const dist = Math.max(0.15 * SCALE, flat.length());
        const defaultServeSpeedRaw = (headerKickSpeed * 0.95) / Math.max(1e-4, animConfigBallSpeedScale);
        const resolvedServeSpeedRaw = resolveAnimBallSpeedValue(serveConfig, defaultServeSpeedRaw);
        const serveSpeed = Math.max(
          3.6 * SCALE,
          Math.min(11.8 * SCALE, resolvedServeSpeedRaw * animConfigBallSpeedScale * GLOBAL_KICK_VELOCITY_MULTIPLIER),
        );
        const time = Math.max(0.34, Math.min(0.72, dist / Math.max(0.001, serveSpeed * 0.82)));
        const vxz = dist / time;
        const dir = flat.lengthSquared() > 1e-5 ? flat.normalize() : new Vector3(0, 0, strikeDirection);
        let vy = (to.y + 0.5 * gravityAbs * time * time) / time;
        vy += (serveLoft - 0.25) * 1.6 * SCALE;
        vy = Math.max(0.18 * SCALE, Math.min(7.8 * SCALE, vy));

        const serveLaunchVelocity = new Vector3(dir.x * vxz, vy, dir.z * vxz);
        ball.mesh.physicsBody.setLinearVelocity(serveLaunchVelocity);
        playKickSfx(); // serve is also a kick — play the kick sound
        buildReceptionForecastFromLaunch(serveState.server, ball.mesh.position.clone(), serveLaunchVelocity, serveBounceTarget.z);
        addBallSpinTwist(dir.x * 6.0 + strikeDirection * 2.0);
        registerPlayerTouch(serveState.server);
        serveBounceGrace = 8;
        serveState.strikeApplied = true;
      }

      if (!serveState.strikeApplied && serveState.timer >= strikeWindowDuration) {
        if (PURE_BALL_PHYSICS) {
          serveState.active = false;
          serveState.phase = 'ready';
          serveState.timer = 0;
          postServeGraceTimer = POST_SERVE_GRACE_SECONDS;
        } else {
          restartServeNoPoint();
        }
        return;
      }

      if (serveState.strikeApplied && serveState.timer >= strikeWindowDuration + 0.18) {
        serveState.phase = 'flight';
        serveState.timer = 0;
      }
    };

    const registerPlayerTouch = (playerIndex: CourtSide): void => {
      if (serveState.active && serveState.phase !== 'strike') {
        return;
      }
      const other: CourtSide = playerIndex === 0 ? 1 : 0;

      if (lastTouchPlayer === playerIndex) {
        touchesByPlayer[playerIndex] += 1;
      } else {
        touchesByPlayer[playerIndex] = 1;
        touchesByPlayer[other] = 0;
        // Reset opponent phase when possession switches
        rallyPhaseByPlayer[other] = 'defense';
      }

      // No preparation phase: first touch (reception) immediately arms kick.
      rallyPhaseByPlayer[playerIndex] = 'kick';

      lastTouchPlayer = playerIndex;
      clearReceptionForecasts();
      tableBouncesOnSideSinceLastTouch[0] = 0;
      tableBouncesOnSideSinceLastTouch[1] = 0;
      ballReachedOpponentSideSinceLastTouch = false;
      ballOutOfCourtTriggered = false;
      ballHitOutOfCourtGeometry = false;

      // Two-touch rally rule: reception + kick only.
      if (touchesByPlayer[playerIndex] > 2) {
        awardPoint(other);
      }
    };

    const isTableSurfaceBounce = (ballPos: Vector3): boolean => {
      const tableHalfWidth = tableProfile.halfWidth;
      const tableHalfLength = tableProfile.halfLength;
      const tableTopY = getTableBallContactY(ballPos.z);
      const tableTopBand = 0.34 * TABLE_SCALE;
      const withinTableX = Math.abs(ballPos.x - tableProfile.centerX) <= tableHalfWidth + 0.10 * TABLE_SCALE;
      const withinTableZ = Math.abs(ballPos.z - tableProfile.centerZ) <= tableHalfLength + 0.14 * TABLE_SCALE;
      const nearTop = Math.abs(ballPos.y - tableTopY) <= tableTopBand;
      return withinTableX && withinTableZ && nearTop;
    };

    // Simplified ruleset. A player scores if the opponent:
    //   1. returns the ball without it bouncing on the player's side, OR
    //   2. fails to return the ball to the player's side, OR
    //   3. touches the ball more than twice in a row.
    // Rule 3 lives in registerPlayerTouch(); 1 and 2 are both detected here
    // as "after the opponent's last touch, the ball didn't bounce on the
    // player's side" (it bounced on the opponent's own side, hit the ground,
    // went out, or never reached the table).
    const handleBounceRules = (): void => {
      if (!matchManager.isMatchActive) return;
      // While a celebration / defeat clip is playing the previous point has
      // already been awarded; let the ball settle naturally on whatever
      // surface it lands on without firing new rule checks.
      if (celebrationWindowTimer > 0) return;
      if (serveBounceGrace > 0) { serveBounceGrace -= 1; return; }

      const bouncedOnTable = isTableSurfaceBounce(ball.mesh.position);
      const bounceSide = sideFromZ(ball.mesh.position.z);

      // No player has touched the ball yet (serve in flight or just past).
      if (lastTouchPlayer === null) {
        if (!bouncedOnTable && serveState.active) {
          if (serveState.phase === 'flight') {
            // Serve was actually struck but missed the receiver's table →
            // server's opponent scores.
            const serverOpponent: CourtSide = serveState.server === 0 ? 1 : 0;
            awardPoint(serverOpponent);
          } else {
            // Ball dropped during pre-serve setup (ready / toss / strike): no
            // serve has been performed yet, so this must NOT score.  Quietly
            // restart the serve without recording a fault.
            clearRallyState();
            resetBallForServe(matchManager.currentServer);
          }
        }
        return;
      }

      const touchingPlayer = lastTouchPlayer;
      const opponent: CourtSide = touchingPlayer === 0 ? 1 : 0;
      // Once the toucher's hit has bounced on opponent's table side, the
      // return is "valid" — any subsequent bounce without an opponent touch
      // means the opponent failed to return.  We accept either a clean
      // bounce-event-detected hit OR a position-based sighting of the ball
      // on the opponent's side, since the bounce detector may miss soft rebounds.
      // A valid return is only *confirmed* by an actual counted bounce on the
      // opponent's table side.  The position-based sighting
      // (ballReachedOpponentSideSinceLastTouch) fires as soon as the ball merely
      // descends onto the opponent's side near table height — i.e. on its way
      // into its very first bounce — so it must NOT be used to decide whether a
      // table bounce is a "second bounce" fault.  Otherwise the receiver's first
      // legitimate bounce gets scored as a phantom fault while they are still
      // receiving.  It is only used to arbitrate balls that leave play (ground /
      // off-court) without bouncing on the table at all.
      const validReturnByBounce = tableBouncesOnSideSinceLastTouch[opponent] > 0;

      // Ball missed the table entirely (ground / off-court).
      if (!bouncedOnTable) {
        // A direct ground / out-of-court contact with no confirmed table bounce
        // is a fault for the toucher.  Only a real opponent-side table bounce
        // can turn a later miss into a point for the toucher.
        awardPoint(tableBouncesOnSideSinceLastTouch[opponent] > 0 ? touchingPlayer : opponent);
        return;
      }

      if (!validReturnByBounce) {
        // No confirmed opponent-side bounce yet → this bounce decides the return.
        if (bounceSide === touchingPlayer) {
          // Bounced on toucher's own side first → toucher faulted.
          awardPoint(opponent);
          return;
        }
        // First bounce on opponent's side — valid return, never a fault.
        tableBouncesOnSideSinceLastTouch[bounceSide] += 1;
        // Serve transitions into a live rally on the first legal opponent-side bounce.
        if (serveState.active && serveState.phase === 'flight') {
          serveState.active = false;
          serveState.phase = 'ready';
          serveState.timer = 0;
          postServeGraceTimer = POST_SERVE_GRACE_SECONDS;
        }
        return;
      }

      // A confirmed opponent-side bounce already happened, so any further table
      // bounce without an opponent touch (registerPlayerTouch resets the counter)
      // means the opponent failed to return the ball → toucher scores.
      tableBouncesOnSideSinceLastTouch[bounceSide] += 1;
      awardPoint(touchingPlayer);
    };

    const normalizeCharacterRoot = (
      root: AbstractMesh,
      skeleton: Skeleton | null,
    ): { scale: number; tiltX: number; tiltZ: number; yOffset: number } => {
      root.scaling = new Vector3(1, 1, 1);

      const evaluate = (tiltX: number, tiltZ: number) => {
        root.rotation = new Vector3(tiltX, 0, tiltZ);
        root.computeWorldMatrix(true);
        const bounds = root.getHierarchyBoundingVectors(true);
        const size = bounds.max.subtract(bounds.min);

        let headMinusFoot = 0;
        if (skeleton) {
          const names = skeleton.bones.map(b => ({
            bone: b,
            key: b.name.toLowerCase().replace(/[._\s-]/g, ''),
          }));
          const head = names.find(n => n.key.includes('head'))?.bone;
          const foot =
            names.find(n => n.key.includes('foot') && (n.key.includes('right') || n.key.includes('left')))?.bone ??
            names.find(n => n.key.includes('foot'))?.bone ??
            names.find(n => n.key.includes('toe'))?.bone;
          if (head && foot) {
            const headY = head.getAbsolutePosition(root).y;
            const footY = foot.getAbsolutePosition(root).y;
            headMinusFoot = headY - footY;
          }
        }

        return { tiltX, tiltZ, size, headMinusFoot };
      };

      const candidates = [
        evaluate(0, 0),
        evaluate(-Math.PI / 2, 0),
        evaluate(Math.PI / 2, 0),
        evaluate(0, Math.PI / 2),
        evaluate(0, -Math.PI / 2),
      ];

      let best = candidates[0];
      for (const c of candidates) {
        const heightBetter = c.size.y > best.size.y + 1e-3;
        const heightClose = Math.abs(c.size.y - best.size.y) <= 1e-3;
        const orientationBetter = c.headMinusFoot > best.headMinusFoot + 1e-3;
        if (heightBetter || (heightClose && orientationBetter)) best = c;
      }

      // Keep whichever orientation gives the tallest vertical extent.
      root.rotation = new Vector3(best.tiltX, 0, best.tiltZ);
      root.computeWorldMatrix(true);
      const uprightBounds = root.getHierarchyBoundingVectors(true);
      const uprightSize = uprightBounds.max.subtract(uprightBounds.min);
      const measuredHeight = Math.max(0.001, uprightSize.y);
      const scale = (1.95 * SCALE * PLAYER_SIZE_SCALE) / measuredHeight;

      root.scaling = new Vector3(scale, scale, scale);
      root.computeWorldMatrix(true);
      const scaledBounds = root.getHierarchyBoundingVectors(true);
      const yOffset = -scaledBounds.min.y;

      return { scale, tiltX: best.tiltX, tiltZ: best.tiltZ, yOffset };
    };

    const getFootMinY = (root: AbstractMesh, skeleton: Skeleton | null): number => {
      if (skeleton) {
        const keys = ['foot', 'toe', 'ankle'];
        const candidates = skeleton.bones.filter(b => {
          const n = b.name.toLowerCase();
          return keys.some(k => n.includes(k));
        });
        if (candidates.length > 0) {
          let minY = Number.POSITIVE_INFINITY;
          for (const bone of candidates) {
            const y = bone.getAbsolutePosition(root).y;
            if (y < minY) minY = y;
          }
          if (Number.isFinite(minY)) return minY;
        }
      }

      root.computeWorldMatrix(true);
      return root.getHierarchyBoundingVectors(true).min.y;
    };

    const placeCharacterSafely = (
      root: AbstractMesh,
      skeleton: Skeleton | null,
      side: CourtSide,
      baseY: number,
    ): void => {
      const desiredZ = side === 0 ? -PLAYER_SPAWN_Z : PLAYER_SPAWN_Z;
      root.position.set(0, baseY, desiredZ);

      const footMinY = getFootMinY(root, skeleton);
      const lift = 0.03 * SCALE - footMinY;
      root.position.y += lift;

      const minAbsZ = PLAYER_TABLE_CLEARANCE_Z;
      if (Math.abs(root.position.z) < minAbsZ) {
        root.position.z = root.position.z < 0 ? -minAbsZ : minAbsZ;
      }
      root.computeWorldMatrix(true);
    };

    // Create player 1 — Messi or Maradona based on the menu selection.
    // Wait for the user's Play click to finalize the choice.
    const p1SelectedId: P1CharacterId = await _p1CharacterPromise;
    const p1AnimData = p1SelectedId === 'maradona' ? maradonaAnimData : messiAnimData;
    const p1Stats: CharacterStats = p1AnimData.stats;
    const charData1 = await assetManager.loadModel(p1SelectedId);
    if (charData1.meshes.length === 0) throw new Error(`${p1SelectedId} model has no meshes`);

    // Normalize orientation and scale to ~1.8 m tall.
    const charRoot1 = charData1.meshes[0];
    const charNorm = normalizeCharacterRoot(charRoot1, charData1.skeletons[0] ?? null);

    player1 = new Character(0, charRoot1, charData1.skeletons[0] ?? null, p1Stats, charData1.animationGroups, PLAYER_MODEL_YAW_OFFSET, p1AnimData);
    charRoot1.position = new Vector3(0, charNorm.yOffset, -PLAYER_SPAWN_Z);
    charRoot1.rotation = new Vector3(charNorm.tiltX, PLAYER_MODEL_YAW_OFFSET, charNorm.tiltZ);  // faces +Z (toward table)
    placeCharacterSafely(charRoot1, charData1.skeletons[0] ?? null, 0, charNorm.yOffset);

    // Capsule collider on a SEPARATE invisible mesh — never attached to the
    // animated hierarchy so that animation root-motion cannot teleport the body
    // and create phantom impulses on the ball.
    const p1Capsule = MeshBuilder.CreateCapsule('p1Capsule',
      { height: 1.8 * SCALE * PLAYER_SIZE_SCALE, radius: 0.3 * SCALE * PLAYER_SIZE_SCALE }, gameScene);
    p1Capsule.isVisible = false;
    p1Capsule.isPickable = false;
    p1Capsule.position = new Vector3(
      charRoot1.position.x,
      0.9 * SCALE * PLAYER_SIZE_SCALE,
      charRoot1.position.z
    );
    new PhysicsAggregate(p1Capsule, PhysicsShapeType.CAPSULE,
      { mass: 0, restitution: 0.3, friction: 0.8 }, gameScene);
    if (p1Capsule.physicsBody?.shape) {
      p1Capsule.physicsBody.shape.filterMembershipMask = COL_PLAYER;
      p1Capsule.physicsBody.shape.filterCollideMask    = COL_WORLD;
    }

    // Create player 2 — Howard on the positive-Z side of the table
    const p2Stats: CharacterStats = howardAnimData.stats;
    const charData2 = await assetManager.loadModel('howard');
    if (charData2.meshes.length === 0) throw new Error('howard model (p2) has no meshes');

    const charRoot2 = charData2.meshes[0];
    const charNorm2 = normalizeCharacterRoot(charRoot2, charData2.skeletons[0] ?? null);
    charRoot2.scaling = new Vector3(charNorm2.scale, charNorm2.scale, charNorm2.scale);

    player2 = new Character(1, charRoot2, charData2.skeletons[0] ?? null, p2Stats, charData2.animationGroups, PLAYER_MODEL_YAW_OFFSET, howardAnimData);
    charRoot2.position = new Vector3(0, charNorm2.yOffset, PLAYER_SPAWN_Z);
    charRoot2.rotation = new Vector3(charNorm2.tiltX, Math.PI + PLAYER_MODEL_YAW_OFFSET, charNorm2.tiltZ); // faces -Z (toward table)
    placeCharacterSafely(charRoot2, charData2.skeletons[0] ?? null, 1, charNorm2.yOffset);

    // Sample socket-to-ground distances at contact frames for all gameplay
    // touches so ball placement can use animation-accurate heights.
    player1.precomputeActionSocketGroundDistances(SOCKET_HEIGHT_CALIBRATION_ACTIONS);
    player2.precomputeActionSocketGroundDistances(SOCKET_HEIGHT_CALIBRATION_ACTIONS);

    // Capsule collider for player 2 — same approach: separate mesh, not animated
    const p2Capsule = MeshBuilder.CreateCapsule('p2Capsule',
      { height: 1.8 * SCALE * PLAYER_SIZE_SCALE, radius: 0.3 * SCALE * PLAYER_SIZE_SCALE }, gameScene);
    p2Capsule.isVisible = false;
    p2Capsule.isPickable = false;
    p2Capsule.position = new Vector3(
      charRoot2.position.x,
      0.9 * SCALE * PLAYER_SIZE_SCALE,
      charRoot2.position.z
    );
    new PhysicsAggregate(p2Capsule, PhysicsShapeType.CAPSULE,
      { mass: 0, restitution: 0.3, friction: 0.8 }, gameScene);
    if (p2Capsule.physicsBody?.shape) {
      p2Capsule.physicsBody.shape.filterMembershipMask = COL_PLAYER;
      p2Capsule.physicsBody.shape.filterCollideMask    = COL_WORLD;
    }

    type BoneHitbox = {
      name: string;
      bone: Skeleton['bones'][number] | null;
      radius: number;
      restitution: number;
      fallbackLocal: Vector3;
      offset: Vector3;
      debugMesh: AbstractMesh | null;
    };

    type PlayerHitboxRig = {
      root: AbstractMesh;
      skeleton: Skeleton | null;
      hitboxes: BoneHitbox[];
    };

    const makeHitboxRig = (
      prefix: string,
      root: AbstractMesh,
      skeleton: Skeleton | null,
      color: Color3,
    ): PlayerHitboxRig => {
      const namedBones = (skeleton?.bones ?? []).map((bone) => ({
        bone,
        key: bone.name.toLowerCase().replace(/[._\s-]/g, ''),
      }));

      const findBone = (...alternatives: string[][]): Skeleton['bones'][number] | null => {
        for (const parts of alternatives) {
          const match = namedBones.find((entry) => parts.every((part) => entry.key.includes(part)));
          if (match) return match.bone;
        }
        return null;
      };

      const createHitbox = (
        name: string,
        radius: number,
        restitution: number,
        fallbackLocal: Vector3,
        offset: Vector3,
        bone: Skeleton['bones'][number] | null,
      ): BoneHitbox => {
        const debugMesh = MeshBuilder.CreateSphere(
          `${prefix}_${name}_hitbox`,
          { diameter: radius * 2, segments: 10 },
          gameScene,
        );
        debugMesh.isPickable = false;
        debugMesh.visibility = 0;

        const debugMat = new StandardMaterial(`${prefix}_${name}_hitboxMat`, gameScene);
        debugMat.diffuseColor = color;
        debugMat.alpha = 0.26;
        debugMat.specularColor = new Color3(0, 0, 0);
        debugMesh.material = debugMat;

        return { name, radius, restitution, fallbackLocal, offset, bone, debugMesh };
      };

      return {
        root,
        skeleton,
        hitboxes: [
          createHitbox('head', 0.16 * SCALE, 0.80, new Vector3(0, 1.75 * SCALE, 0), Vector3.Zero(), findBone(['head'], ['neck'])),
          createHitbox('chest', 0.24 * SCALE, 0.70, new Vector3(0, 1.28 * SCALE, 0), Vector3.Zero(), findBone(['chest'], ['sternum'], ['spine2'], ['spine1'], ['spine'], ['torso'])),
          createHitbox('hips', 0.21 * SCALE, 0.66, new Vector3(0, 1.00 * SCALE, 0), Vector3.Zero(), findBone(['hips'], ['pelvis'])),
          createHitbox('leftThigh', 0.16 * SCALE, 0.62, new Vector3(-0.14 * SCALE, 0.86 * SCALE, 0), Vector3.Zero(), findBone(['left', 'thigh'], ['left', 'upleg'])),
          createHitbox('rightThigh', 0.16 * SCALE, 0.62, new Vector3(0.14 * SCALE, 0.86 * SCALE, 0), Vector3.Zero(), findBone(['right', 'thigh'], ['right', 'upleg'])),
          createHitbox('leftKnee', 0.13 * SCALE, 0.66, new Vector3(-0.14 * SCALE, 0.62 * SCALE, 0.02 * SCALE), Vector3.Zero(), findBone(['left', 'calf'], ['left', 'leg'])),
          createHitbox('rightKnee', 0.13 * SCALE, 0.66, new Vector3(0.14 * SCALE, 0.62 * SCALE, 0.02 * SCALE), Vector3.Zero(), findBone(['right', 'calf'], ['right', 'leg'])),
          createHitbox('leftFoot', 0.11 * SCALE, 0.74, new Vector3(-0.12 * SCALE, 0.24 * SCALE, 0.08 * SCALE), Vector3.Zero(), findBone(['left', 'foot'], ['left', 'toe'])),
          createHitbox('rightFoot', 0.11 * SCALE, 0.74, new Vector3(0.12 * SCALE, 0.24 * SCALE, 0.08 * SCALE), Vector3.Zero(), findBone(['right', 'foot'], ['right', 'toe'])),
        ],
      };
    };

    const getHitboxCenter = (rig: PlayerHitboxRig, hitbox: BoneHitbox): Vector3 => {
      if (hitbox.bone) {
        return hitbox.bone.getAbsolutePosition(rig.root).add(hitbox.offset);
      }

      rig.root.computeWorldMatrix(true);
      return Vector3.TransformCoordinates(hitbox.fallbackLocal, rig.root.getWorldMatrix()).add(hitbox.offset);
    };

    const p1HitboxRig = makeHitboxRig('p1', charRoot1, charData1.skeletons[0] ?? null, new Color3(0.18, 0.84, 0.56));
    const p2HitboxRig = makeHitboxRig('p2', charRoot2, charData2.skeletons[0] ?? null, new Color3(0.16, 0.64, 0.92));
    const allHitboxRigs = [p1HitboxRig, p2HitboxRig];

    const setHitboxDebugVisible = (visible: boolean): void => {
      for (const rig of allHitboxRigs) {
        for (const hitbox of rig.hitboxes) {
          if (hitbox.debugMesh) {
            hitbox.debugMesh.visibility = visible ? 0.3 : 0;
          }
        }
      }
    };

    const syncHitboxDebugMeshes = (): void => {
      for (const rig of allHitboxRigs) {
        for (const hitbox of rig.hitboxes) {
          if (!hitbox.debugMesh) continue;
          hitbox.debugMesh.position.copyFrom(getHitboxCenter(rig, hitbox));
        }
      }
    };

    const collisionDrill = {
      enabled: false,
      action: 'header' as OffensiveAction,
      side: 0 as CourtSide,
      activeFlight: false,
      timeToImpact: 0,
      tossCooldown: 0,
      actionQueued: false,
    };
    let collisionDrillForceToss = false;
    let collisionDrillAssistMoveX = 0;
    let collisionDrillAssistMoveZ = 0;

    const setCollisionDrillAction = (action: OffensiveAction): void => {
      collisionDrill.action = action;
      collisionDrill.actionQueued = false;
      console.log(`[Debug] collisionDrill action=${action}`);
    };

    setHitboxDebugVisible(false);

    matchManager.resetServe(0);
    resetBallForServe(0);



    // Hide loading screen
    if (loadingScreen) {
      loadingScreen.style.display = 'none';
    }

    // ── UI ────────────────────────────────────────────────────────────────
    uiManager = new UIManager(gameScene);
    pointVFXSystem = new PointVFXSystem(gameScene, camera);

    // InputManager wraps the shared pressedKeys set and provides consume-once helpers.
    inputManager = new InputManager(pressedKeys);

    // Keyboard controls for ball
    window.addEventListener('keydown', (event) => {
      const key = event.key === ' ' ? 'space' : event.key.toLowerCase();
      const code = event.code.toLowerCase();
      const isPreviewToggle =
        code === 'backquote' ||
        code === 'f8' ||
        key === '²' ||
        key === '`';
      const isCollisionDrillToggle = code === 'f9';

      // Q — cycle serve type for the serving player during the ready phase.
      if (!animationPreviewMode && !collisionDrill.enabled && key === 'q' && !event.repeat) {
        if (serveState.active && serveState.phase === 'ready') {
          const idx = SERVE_TYPE_ORDER.indexOf(serveState.serveType);
          const next = SERVE_TYPE_ORDER[(idx + 1) % SERVE_TYPE_ORDER.length];
          const { foot, hand } = serveTypeToProps(next);
          serveState.serveType = next;
          serveState.foot = foot;
          serveState.hand = hand;
          if (serveState.server === 0) p1ServeType = next;
          else                         p2ServeType = next;
          console.log(`[Serve] ${serveState.server === 0 ? 'P1' : 'P2'} → ${SERVE_TYPE_LABEL[next]}`);
          event.preventDefault();
          return;
        }
      }

      // F — arm P1's superpower (one use per set).  Consumed by the next kick.
      if (!animationPreviewMode && !collisionDrill.enabled && key === 'f' && !event.repeat) {
        event.preventDefault();
        if (matchManager.isMatchActive && p1SuperAvailable && !p1SuperArmed) {
          p1SuperArmed = true;
          console.log('[Superpower] P1 armed — next kick unleashes the super ability');
        }
        return;
      }

      if (!animationPreviewMode && !collisionDrill.enabled && key === 'r' && !event.repeat) {
        event.preventDefault();
        quickRestartRally(0);
        console.log('[Debug] quick rally restart (P1 serve)');
        return;
      }

      if (isCollisionDrillToggle) {
        collisionDrill.enabled = !collisionDrill.enabled;
        collisionDrill.side = 0;
        collisionDrill.activeFlight = false;
        collisionDrill.timeToImpact = 0;
        collisionDrill.tossCooldown = 0;
        collisionDrill.actionQueued = false;
        collisionDrillAssistMoveX = 0;
        collisionDrillAssistMoveZ = 0;
        collisionDrillForceToss = collisionDrill.enabled;

        event.preventDefault();
        serveState.active = false;
        clearRallyState();
        resetBall();
        setHitboxDebugVisible(collisionDrill.enabled);

        if (collisionDrill.enabled && animationPreviewMode) {
          animationPreviewMode = false;
          animationPreviewLockedYaw = null;
          player1?.playAnimation('idle', true);
          player2?.playAnimation('idle', true);
        }

        if (collisionDrill.enabled) {
          console.log('[Debug] collisionDrill=on | player=P1 | movement=WASD (manual) + auto assist, controls: F9 toggle, 1 header, 2 chest, 3 knee, 4 scissor, B toss now');
        } else {
          console.log('[Debug] collisionDrill=off');
        }
        return;
      }

      if (collisionDrill.enabled && !animationPreviewMode) {
        if (code === 'digit1' || code === 'numpad1') {
          event.preventDefault();
          setCollisionDrillAction('header');
          return;
        }
        if (code === 'digit2' || code === 'numpad2') {
          event.preventDefault();
          setCollisionDrillAction('chest');
          return;
        }
        if (code === 'digit3' || code === 'numpad3') {
          event.preventDefault();
          setCollisionDrillAction('knee');
          return;
        }
        if (code === 'digit4' || code === 'numpad4') {
          event.preventDefault();
          setCollisionDrillAction('scissor');
          return;
        }
        if (key === 'b') {
          event.preventDefault();
          collisionDrillForceToss = true;
          return;
        }
      }

      if (isPreviewToggle) {
        animationPreviewMode = !animationPreviewMode;
        event.preventDefault();
        animationPreviewClipIndex = 0;
        animationPreviewMirror = false;
        animationPreviewSpeed = 1.0;
        animationPreviewFacingFlip = false;
        animationPreviewLockedYaw = null;
        if (animationPreviewMode) {
          console.log('[Debug] animationPreviewMode=on | controls: F8/`/² toggle, Tab/F7 switch player, [ ] or arrows prev/next, m mirror, o facing flip, -/+ or K/I speed, p play once, l loop, 0-9 quick map');
          playPreviewClip(false);
        } else {
          console.log('[Debug] animationPreviewMode=off');
          player1?.playAnimation('idle', true);
          player2?.playAnimation('idle', true);
        }
        return;
      }
      if (animationPreviewMode && (code === 'tab' || code === 'f7')) {
        animationPreviewPlayer = animationPreviewPlayer === 1 ? 2 : 1;
        event.preventDefault();
        animationPreviewClipIndex = 0;
        console.log(`[Debug] animationPreviewPlayer=P${animationPreviewPlayer}`);
        playPreviewClip(false);
        return;
      }
      if (animationPreviewMode) {
        const target = animationPreviewPlayer === 1 ? player1 : player2;
        const clips = target?.getAnimationClipNames() ?? [];

        if (code === 'bracketleft' || code === 'arrowleft' || code === 'pageup') {
          event.preventDefault();
          if (clips.length > 0) {
            animationPreviewClipIndex = (animationPreviewClipIndex - 1 + clips.length) % clips.length;
            console.log(`[Debug] P${animationPreviewPlayer} clip[${animationPreviewClipIndex}] ${clips[animationPreviewClipIndex]}`);
            playPreviewClip(false);
          }
          return;
        }
        if (code === 'bracketright' || code === 'arrowright' || code === 'pagedown') {
          event.preventDefault();
          if (clips.length > 0) {
            animationPreviewClipIndex = (animationPreviewClipIndex + 1) % clips.length;
            console.log(`[Debug] P${animationPreviewPlayer} clip[${animationPreviewClipIndex}] ${clips[animationPreviewClipIndex]}`);
            playPreviewClip(false);
          }
          return;
        }
        if (key === 'm' || code === 'comma' || code === 'slash' || code === 'f6') {
          event.preventDefault();
          if (event.repeat) {
            return;
          }
          animationPreviewMirror = !animationPreviewMirror;
          console.log(`[Debug] preview mirror=${animationPreviewMirror}`);
          playPreviewClip(false);
          return;
        }
        if (key === 'o') {
          event.preventDefault();
          animationPreviewFacingFlip = !animationPreviewFacingFlip;
          console.log(`[Debug] preview facingFlip=${animationPreviewFacingFlip}`);
          playPreviewClip(false);
          return;
        }
        if (code === 'minus' || code === 'numpadsubtract' || key === 'k') {
          event.preventDefault();
          animationPreviewSpeed = Math.max(0.1, animationPreviewSpeed - 0.1);
          console.log(`[Debug] preview speed=${animationPreviewSpeed.toFixed(2)}`);
          playPreviewClip(false);
          return;
        }
        if (code === 'equal' || code === 'numpadadd' || key === 'i') {
          event.preventDefault();
          animationPreviewSpeed = Math.min(3.0, animationPreviewSpeed + 0.1);
          console.log(`[Debug] preview speed=${animationPreviewSpeed.toFixed(2)}`);
          playPreviewClip(false);
          return;
        }
        if (key === 'p') {
          event.preventDefault();
          if (target && clips.length > 0) {
            const idx = Math.max(0, Math.min(animationPreviewClipIndex, clips.length - 1));
            animationPreviewClipIndex = idx;
            playPreviewClip(false);
          }
          return;
        }
        if (key === 'l') {
          event.preventDefault();
          if (target && clips.length > 0) {
            const idx = Math.max(0, Math.min(animationPreviewClipIndex, clips.length - 1));
            animationPreviewClipIndex = idx;
            playPreviewClip(true);
          }
          return;
        }

        const previewMap: Record<string, { key: string; mirrorX?: boolean }> = {
          '1': { key: 'idle' },
          '2': { key: 'jogForward' },
          '3': { key: 'jogBack' },
          '4': { key: 'strafeLeft' },
          '5': { key: 'strafeRight' },
          '6': { key: 'header' },
          '7': { key: 'knee1', mirrorX: false },
          '8': { key: 'knee1', mirrorX: true },
          '9': { key: 'scissorKick', mirrorX: false },
          '0': { key: 'scissorKick', mirrorX: true },
        };
        const entry = previewMap[key];
        if (entry && target) {
          event.preventDefault();
          animationPreviewMirror = entry.mirrorX ?? false;
          animationPreviewFacingFlip = false;
          target.playAnimation(entry.key, false, animationPreviewMirror);
          console.log(`[Debug] P${animationPreviewPlayer} play ${entry.key}${animationPreviewMirror ? ' mirrorX' : ''}`);
          return;
        }
      }
      if (controlKeys.has(key)) {
        event.preventDefault();
      }
      pressedKeys.add(key);
    });

    window.addEventListener('keyup', (event) => {
      const key = event.key === ' ' ? 'space' : event.key.toLowerCase();
      if (controlKeys.has(key)) {
        event.preventDefault();
      }
      pressedKeys.delete(key);
    });

    // Player-driven gameplay constants
    const playerMoveSpeed = 6.0 * SCALE;
    // Asymmetric difficulty: when the *defender* is AI-controlled, give it less
    // slack to reach a reception so well-placed (wide/deep/diagonal) human kicks
    // slip past it for winners.  Human reception keeps its forgiving reach so the
    // player can still reliably return the ball (see reception-reliability note).
    // Tune these up to make the AI tougher, down to make it easier to score on.
    const AI_RECEIVE_TIME_GRACE = 0.14;        // extra reach time (human ≈ 0.90s)
    const AI_RECEIVE_RANGE_PAD = 0.10 * SCALE; // positional slack (human ≈ 0.70)
    const AI_RECEIVE_SPEED_MULT = 0.72;        // AI can't over-run to the ball
    // Higher accel = the velocity reaches top speed almost immediately, so the
    // player darts toward an oncoming ball instead of easing in.  Decel raised
    // in step so stops stay crisp rather than sliding.
    const playerAccel = 26;
    const playerDecel = 24;
    // AI-controlled players move at a believable pace instead of teleporting to
    // the ball.  The previous shared accel (26) reached top speed in a single
    // frame, which read as the opponent "snapping" into position and made points
    // nearly impossible to win.  Lower speed + gentler accel give the AI human
    // reactions so well-placed shots can beat it.  Tune up for a tougher AI.
    const aiMoveSpeedScale = 0.48; // fraction of playerMoveSpeed (slower than human)
    const aiAccel = 4.25;
    const playerJogAnimSpeed = 1.2;
    const playerTurnSpeed = 8.5; // rad/s
    const actionPressCooldown = 220; // ms
    const setupLiftCooldown = 260; // ms
    const playerPushRange = 0.95 * SCALE;
    const playerKickRange = 1.85 * SCALE;
    const setupLiftRange = 1.65 * SCALE;
    const setupLiftMinY = 2.2 * SCALE;
    const setupLiftVelocity = 5.2 * SCALE;
    const headerKickSpeed = 6.6 * SCALE;
    const kneeKickSpeed = 7.1 * SCALE;
    const scissorKickSpeed = 8.2 * SCALE;
    const animConfigBallSpeedScale = 0.01 * SCALE;
    const actionAssistDuration = 0.34; // seconds
    const actionAssistImpactTime = 0.20; // remaining-time threshold for impact frame
    const actionAssistRepositionSpeed = 5.0 * SCALE;
    const actionAssistContactDistance = 0.55 * SCALE;
    const actionAssistMagnetRange = 0.65 * SCALE;
    const actionAssistMagnetStrength = 20.0 * SCALE;
    const actionRequestTtl = 1.60; // seconds
    const actionFallingMinYSpeed = -0.2 * SCALE;
    const actionHeaderStartRange = 1.7 * SCALE;
    const actionHeaderHeightMin = 1.35 * SCALE;
    const actionKneeStartRange = 2.05 * SCALE;
    const actionFootStartRange = 2.15 * SCALE;
    const actionScissorStartRange = 2.35 * SCALE;
    const actionKneeHeightMin = 0.95 * SCALE;
    const actionKneeHeightMax = 2.20 * SCALE;
    // Foot kicks intentionally accept lower contact heights than knee so a ball
    // descending past the knee is still treated as a foot strike rather than
    // grazing the toe at near-ground level.
    const actionFootHeightMin = 0.45 * SCALE;
    const actionFootHeightMax = 1.40 * SCALE;
    const actionScissorHeightMin = 0.61 * SCALE;  // Allow foot kicks on higher ball arcs for snappier response
    const actionScissorHeightMax = 2.85 * SCALE;
    const actionKneeDuration = 0.40;
    const actionFootDuration = 0.44;
    const actionScissorDuration = 0.48;
    const actionKneeImpactTime = 0.20;
    const actionFootImpactTime = 0.20;
    const actionScissorImpactTime = 0.18;
    const actionKneeContactDistance = 0.52 * SCALE;
    const actionFootContactDistance = 0.54 * SCALE;
    const actionScissorContactDistance = 0.56 * SCALE;
    const actionKneeMagnetRange = 0.62 * SCALE;
    const actionFootMagnetRange = 0.68 * SCALE;
    const actionScissorMagnetRange = 0.66 * SCALE;
    const actionKneeDepth = 0.66 * SCALE;
    const actionFootDepth = 0.74 * SCALE;
    const actionScissorDepth = 0.86 * SCALE;
    const actionKneeLateral = 0.20 * SCALE;
    const actionFootLateral = 0.24 * SCALE;
    const actionScissorLateral = 0.34 * SCALE;
    const actionKneeFallbackY = 0.92 * SCALE;
    const actionFootFallbackY = 0.72 * SCALE;
    const actionScissorFallbackY = 0.62 * SCALE;
    const actionKneeFallbackForward = 0.50 * SCALE;
    const actionFootFallbackForward = 0.58 * SCALE;
    const actionScissorFallbackForward = 0.72 * SCALE;
    const actionAnimationSpeedRatio = 1.35;
    const actionTimingContactTailSeconds = 0.10;
    const actionTimingMaxDuration = 1.45;
    const actionMirrorLeadTime = 0.12;
    const actionEarlyContactCaptureExtra = 0.30 * SCALE;
    const actionEarlyContactRootRadius = 1.65 * SCALE;
    const actionPrecontactHeightTolerance = 0.18 * SCALE;
    const actionPrecontactRangePaddingFactor = 0.78;
    const vicinityInterceptionRange = 1.85 * SCALE;
    const vicinityInterceptionAirMinY = 0.06 * SCALE;
    const vicinityInterceptionHeightMax = 2.90 * SCALE;
    const gravityAbs = 9.81;
    const impactWindowGrace = 0.08;
    const antiTunnelBodyRadius = 0.42 * SCALE * PLAYER_SIZE_SCALE;
    const antiTunnelBodyBottom = 0.20 * SCALE * PLAYER_SIZE_SCALE;
    const antiTunnelBodyTop = 1.95 * SCALE * PLAYER_SIZE_SCALE;
    const antiTunnelPushOut = 0.05 * SCALE;
    const antiTunnelMinReboundY = 2.2 * SCALE;
    const ENABLE_PLAYER_ANTI_TUNNEL_GUARD = true;
    const ENABLE_PLAYER_FALLBACK_BODY_VOLUME = true;
    const ballInteractionOwnerHoldSeconds = 0.12;
    const playerBodyRadius = 0.42 * SCALE * PLAYER_SIZE_SCALE;
    const playerBodyBottom = 0.22 * SCALE * PLAYER_SIZE_SCALE;
    const playerBodyTop = 1.95 * SCALE * PLAYER_SIZE_SCALE;
    const playerBodyRestitution = 0.42;
    const playerBodyPush = 0.35 * SCALE;
    const playerDribbleSpeed = 3.8 * SCALE;
    // Keep player capsules out of the table volume around the center line.
    // 0.85m table half-width + ~0.35m player body radius ~= 1.2m safety split.
    const minCourtSplitZ = 2.35 * SCALE;
    const playerCourtEdgePadding = 0.42 * SCALE;
    const basePlayerHalfCourtX = 5.4 * SCALE;
    const basePlayerHalfCourtZ = 7.2 * SCALE;
    const playerHalfCourtX = Math.max(
      2.2 * SCALE,
      Math.min(basePlayerHalfCourtX, courtHalfWidth - playerCourtEdgePadding),
    );
    const playerHalfCourtZ = Math.max(
      minCourtSplitZ + 0.85 * SCALE,
      Math.min(basePlayerHalfCourtZ, courtHalfLength - playerCourtEdgePadding),
    );
    const ENABLE_BALL_MOTION_ASSIST = ENABLE_BALL_ASSIST && !PURE_BALL_PHYSICS;
    const ENABLE_POST_KICK_DIRECTION_LOCK = ENABLE_BALL_ASSIST && !PURE_BALL_PHYSICS;
    const ENABLE_PLAYER_BODY_COLLISION_RESOLUTION = true;
    const ENABLE_BALL_OSCILLATION_GUARD = ENABLE_BALL_ASSIST && !PURE_BALL_PHYSICS;
    const ENABLE_DRIBBLE_PUSH = false;
    const ENABLE_ARCADE_RALLY_SCRIPT = false; // disabled: ball uses natural Havok physics after kicks/bounces

    const p1Motion = { vx: 0, vz: 0, facing: 0 };
    const p2Motion = { vx: 0, vz: 0, facing: Math.PI };
    type HeightBand = 'low' | 'mid' | 'high' | 'veryHigh';
    type TouchPhase = 'defense' | 'reception' | 'preparation' | 'kick';
    type BoxIndex = { x: number; y: number; z: number; key: string };
    type TableCell = { row: number; col: number; center: Vector3; score: number };
    type ArcadeCurve = {
      start: Vector3;
      control: Vector3;
      end: Vector3;
      duration: number;
      elapsed: number;
    };
    type ArcadeRallyFlightState = {
      active: boolean;
      stage: 'toTable' | 'toReceive';
      attackerSide: CourtSide;
      receiverSide: CourtSide;
      receiveTarget: Vector3;
      toTable: ArcadeCurve | null;
      toReceive: ArcadeCurve | null;
    };
    const p1StrikeState: { action: OffensiveAction | null; timer: number } = {
      action: null,
      timer: 0,
    };
    const p2StrikeState: { action: OffensiveAction | null; timer: number } = {
      action: null,
      timer: 0,
    };
    type AssistState = {
      active: boolean;
      followPlayer: boolean;
      action: OffensiveAction | null;
      timer: number;
      impactTime: number;
      hitApplied: boolean;
      targetX: number;
      targetZ: number;
    };
    const p1Assist: AssistState = {
      active: false,
      followPlayer: true,
      action: null,
      timer: 0,
      impactTime: actionAssistImpactTime,
      hitApplied: false,
      targetX: charRoot1.position.x,
      targetZ: charRoot1.position.z,
    };
    const p2Assist: AssistState = {
      active: false,
      followPlayer: true,
      action: null,
      timer: 0,
      impactTime: actionAssistImpactTime,
      hitApplied: false,
      targetX: charRoot2.position.x,
      targetZ: charRoot2.position.z,
    };
    type ActionRequestState = { action: OffensiveAction | null; ttl: number };
    const p1Request: ActionRequestState = { action: null, ttl: 0 };
    const p2Request: ActionRequestState = { action: null, ttl: 0 };
    const requestPowerByPlayer: [number, number] = [1, 1];
    let postKickLockTimer = 0;
    let postKickLockSpeed = 0;
    let postKickLockDir = new Vector3(0, 0, 1);
    let postKickGuideTimer = 0;
    let lastTouchPlayer: CourtSide | null = null;
    const touchesByPlayer: [number, number] = [0, 0];
    const canKickAfterReceptionByPlayer: [boolean, boolean] = [false, false];
    const rallyPhaseByPlayer: [TouchPhase, TouchPhase] = ['defense', 'defense'];
    const tableBouncesOnSideSinceLastTouch: [number, number] = [0, 0];
    // Position-based ground truth: set true the moment the ball physically
    // enters opponent-of-toucher airspace above their table side.  Robust
    // against missed bounce-detector events when the rebound is too soft.
    let ballReachedOpponentSideSinceLastTouch = false;
    let bounceEventCooldown = 0;
    let serveBounceGrace = 0;
    // Set true the moment the ball physically exits the court XZ envelope
    // (e.g. lands on the bleachers, a wall, or rolls past the lines).  Used as
    // a position-based fallback so a glancing bleacher contact that doesn't
    // produce a clean vertical-velocity sign flip still awards the point.
    let ballOutOfCourtTriggered = false;

    type ReceptionForecast = {
      apex: Vector3;
      target: Vector3;
      action: OffensiveAction;
      ballBand: HeightBand;
      socketHeight: number;
      timeToFallStart: number;
      ttl: number;
    };
    const receptionForecastByPlayer: [ReceptionForecast | null, ReceptionForecast | null] = [null, null];
    const prepControlTargetByPlayer: [Vector3 | null, Vector3 | null] = [null, null];
    type KickDebugContext = {
      playerSide: CourtSide;
      action: OffensiveAction | null;
      strikeFamily: 'header' | 'chest' | 'knee' | 'foot' | 'scissor';
      targetX: number;
      targetY: number;
      targetZ: number;
      strikeX: number;
      strikeY: number;
      strikeZ: number;
      launchX: number;
      launchY: number;
      launchZ: number;
      distToTable: number;
      timeToTable: number;
      horizontalSpeed: number;
      vyBallistic: number;
      kickFlightDistanceT: number;
      kickFlightTimeScale: number;
      requestPower: number;
      ballLoft: number;
    };
    let lastPostReceptionKickDebug: KickDebugContext | null = null;

    const GRID_X_BANDS = 5;
    const GRID_Z_BANDS = 3;
    const TABLE_ROWS = 2;
    const TABLE_COLS = 3;
    const BOX_Y_CENTERS = [0.82 * SCALE, 1.35 * SCALE, 2.02 * SCALE, 2.72 * SCALE];

    const arcadeRallyFlight: ArcadeRallyFlightState = {
      active: false,
      stage: 'toTable',
      attackerSide: 0,
      receiverSide: 1,
      receiveTarget: new Vector3(0, 1.35 * SCALE, minCourtSplitZ + 0.5 * (playerHalfCourtZ - minCourtSplitZ)),
      toTable: null,
      toReceive: null,
    };

    const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
    const clampi = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
    const isBallInsidePlayableCourtXZ = (margin = 0): boolean => (
      Math.abs(ball.mesh.position.x) <= playerHalfCourtX + margin &&
      Math.abs(ball.mesh.position.z) <= playerHalfCourtZ + margin
    );
    // Resolve a ball that has left play (off-court, below floor, or stuck) into a
    // point using the standard teqball arbitration: if the last toucher's hit
    // had already produced a valid return (a bounce on the opponent's table side,
    // or the ball physically reaching the opponent's airspace), the opponent
    // failed to return it → toucher scores; otherwise the toucher's hit went out
    // → opponent scores.  With no toucher, a struck serve faults to the server's
    // opponent; anything else just re-serves without a phantom point.
    const resolveRallyOutOfPlay = (): void => {
      if (lastTouchPlayer !== null) {
        const toucher = lastTouchPlayer;
        const opponent: CourtSide = toucher === 0 ? 1 : 0;
        const validReturn = tableBouncesOnSideSinceLastTouch[opponent] > 0;
        awardPoint(validReturn ? toucher : opponent);
      } else if (serveState.active) {
        awardPoint(serveState.server === 0 ? 1 : 0);
      } else {
        restartServeNoPoint();
      }
    };
    const clearReceptionForecasts = (): void => {
      receptionForecastByPlayer[0] = null;
      receptionForecastByPlayer[1] = null;
      prepControlTargetByPlayer[0] = null;
      prepControlTargetByPlayer[1] = null;
    };

    const receptionActionCandidates: OffensiveAction[] = [
      'receptionToe',
      'receptionInnerRight',
      'receptionChest',
    ];
    const isLimbReceptionAction = (action: OffensiveAction): boolean => (
      action === 'receptionToe' || action === 'receptionInnerRight'
    );

    const getReceptionSocketHeight = (player: CourtSide, action: OffensiveAction): number => {
      const receiverCharacter = player === 0 ? player1 : player2;
      const fallback =
        action === 'receptionToe'
          ? 0.86 * SCALE
          : action === 'receptionInnerRight'
            ? 1.10 * SCALE
            : 1.52 * SCALE;
      return receiverCharacter?.getActionSocketGroundDistanceAtContact(action) ?? fallback;
    };

    const shouldForceKneeReception = (player: CourtSide, ballY: number): boolean => {
      const chestY = getReceptionSocketHeight(player, 'receptionChest');
      const kneeY = getReceptionSocketHeight(player, 'receptionInnerRight');
      const upper = Math.max(chestY, kneeY);
      const lower = Math.min(chestY, kneeY);

      // If the ball is in the chest-to-knee band, prefer knee reception.
      return ballY <= upper - 0.03 * SCALE && ballY >= lower - 0.10 * SCALE;
    };

    const chooseReceptionActionBySocketHeight = (
      receiver: CourtSide,
      apexY: number,
    ): { action: OffensiveAction; socketHeight: number } => {
      if (shouldForceKneeReception(receiver, apexY)) {
        return {
          action: 'receptionInnerRight',
          socketHeight: getReceptionSocketHeight(receiver, 'receptionInnerRight'),
        };
      }

      let bestAction: OffensiveAction = 'receptionChest';
      let bestSocketHeight = getReceptionSocketHeight(receiver, bestAction);
      let bestScore = Math.abs(bestSocketHeight - apexY);

      for (const action of receptionActionCandidates) {
        const socketHeight = getReceptionSocketHeight(receiver, action);
        const score = Math.abs(socketHeight - apexY);

        if (score < bestScore) {
          bestScore = score;
          bestAction = action;
          bestSocketHeight = socketHeight;
        }
      }

      return { action: bestAction, socketHeight: bestSocketHeight };
    };

    const buildReceptionForecastFromLaunch = (
      attackerSide: CourtSide,
      launchPos: Vector3,
      launchVelocity: Vector3,
      targetZ: number,
    ): void => {
      if (collisionDrill.enabled || !matchManager.isMatchActive) return;

      const receiver: CourtSide = attackerSide === 0 ? 1 : 0;
      const targetTableContactY = getTableBallContactY(targetZ);

      // Solve launchPos.y + vy*t - 0.5*g*t^2 = targetTableContactY (first downward table crossing).
      const a = -0.5 * gravityAbs;
      const b = launchVelocity.y;
      const c = launchPos.y - targetTableContactY;
      const disc = b * b - 4 * a * c;
      if (disc < 0) {
        receptionForecastByPlayer[receiver] = null;
        return;
      }

      const sqrtDisc = Math.sqrt(disc);
      const t1 = (-b - sqrtDisc) / (2 * a);
      const t2 = (-b + sqrtDisc) / (2 * a);
      const candidates = [t1, t2].filter((t) => t > 1e-4).sort((x, y) => x - y);

      let tImpact = -1;
      for (const t of candidates) {
        const vyAtT = launchVelocity.y - gravityAbs * t;
        if (vyAtT < 0) {
          tImpact = t;
          break;
        }
      }
      if (tImpact <= 0) {
        receptionForecastByPlayer[receiver] = null;
        return;
      }

      const impactPos = new Vector3(
        launchPos.x + launchVelocity.x * tImpact,
        targetTableContactY,
        launchPos.z + launchVelocity.z * tImpact,
      );

      const tableInBounds =
        Math.abs(impactPos.x - tableProfile.centerX) <= tableProfile.halfWidth + 0.24 * SCALE &&
        Math.abs(impactPos.z - tableProfile.centerZ) <= tableProfile.halfLength + 0.28 * SCALE;
      if (!tableInBounds) {
        receptionForecastByPlayer[receiver] = null;
        return;
      }

      const vyAtImpact = launchVelocity.y - gravityAbs * tImpact;
      const postBounceVelocity = new Vector3(
        launchVelocity.x * 0.985,
        Math.max(0.18 * SCALE, Math.abs(vyAtImpact) * TABLE_BOUNCE_RESTITUTION),
        launchVelocity.z * 0.985,
      );

      const tApex = postBounceVelocity.y / Math.max(1e-4, gravityAbs);
      const apex = new Vector3(
        impactPos.x + postBounceVelocity.x * tApex,
        targetTableContactY + (postBounceVelocity.y * postBounceVelocity.y) / (2 * gravityAbs),
        impactPos.z + postBounceVelocity.z * tApex,
      );

      let postBounceDir = new Vector3(postBounceVelocity.x, 0, postBounceVelocity.z);
      if (postBounceDir.lengthSquared() < 1e-6) {
        postBounceDir = new Vector3(0, 0, receiver === 0 ? -1 : 1);
      } else {
        postBounceDir = postBounceDir.normalize();
      }

      const furtherOfApex = 0.30 * SCALE;
      const minZ = receiver === 0 ? -playerHalfCourtZ : minCourtSplitZ;
      const maxZ = receiver === 0 ? -minCourtSplitZ : playerHalfCourtZ;
      const target = new Vector3(
        clampi(apex.x + postBounceDir.x * furtherOfApex, -playerHalfCourtX * 0.95, playerHalfCourtX * 0.95),
        apex.y,
        clampi(apex.z + postBounceDir.z * furtherOfApex, minZ, maxZ),
      );

      const { action, socketHeight } = chooseReceptionActionBySocketHeight(receiver, apex.y);
      const timeToFallStart = Math.max(0.08, tImpact + tApex);
      const ttl = Math.max(0.9, Math.min(2.6, timeToFallStart + 0.85));

      receptionForecastByPlayer[receiver] = {
        apex,
        target,
        action,
        ballBand: getHeightBand(apex.y),
        socketHeight,
        timeToFallStart,
        ttl,
      };
      // Inform AI state machine that a reception is expected for the receiver
      rallyPhaseByPlayer[receiver] = 'reception';
    };

    const getHeightBand = (y: number): HeightBand => {
      if (y < 0.95 * SCALE) return 'low';
      if (y < 1.55 * SCALE) return 'mid';
      if (y < 2.35 * SCALE) return 'high';
      return 'veryHigh';
    };

    const toBandIndex = (band: HeightBand): number => {
      if (band === 'low') return 0;
      if (band === 'mid') return 1;
      if (band === 'high') return 2;
      return 3;
    };

    const classifyBox = (pos: Vector3, side: CourtSide): BoxIndex => {
      const nx = clamp01((pos.x + playerHalfCourtX) / (2 * playerHalfCourtX));
      const x = clampi(Math.floor(nx * GRID_X_BANDS), 0, GRID_X_BANDS - 1);

      const band = getHeightBand(pos.y);
      const y = toBandIndex(band);

      const localZ = side === 0
        ? (-minCourtSplitZ - pos.z)
        : (pos.z - minCourtSplitZ);
      const zNorm = clamp01(localZ / Math.max(0.001, playerHalfCourtZ - minCourtSplitZ));
      const z = clampi(Math.floor(zNorm * GRID_Z_BANDS), 0, GRID_Z_BANDS - 1);
      return { x, y, z, key: `${x}-${y}-${z}` };
    };

    const getBoxCenter = (box: BoxIndex, side: CourtSide): Vector3 => {
      const laneWidth = (2 * playerHalfCourtX) / GRID_X_BANDS;
      const x = -playerHalfCourtX + laneWidth * (box.x + 0.5);

      const y = BOX_Y_CENTERS[clampi(box.y, 0, BOX_Y_CENTERS.length - 1)];

      const depthSpan = playerHalfCourtZ - minCourtSplitZ;
      const depth = depthSpan * ((box.z + 0.5) / GRID_Z_BANDS);
      const z = side === 0 ? (-minCourtSplitZ - depth) : (minCourtSplitZ + depth);
      return new Vector3(x, y, z);
    };

    const buildArcadeCurve = (start: Vector3, end: Vector3, extraPeak: number, duration: number): ArcadeCurve => {
      const midX = (start.x + end.x) * 0.5;
      const midZ = (start.z + end.z) * 0.5;
      const control = new Vector3(
        midX,
        Math.max(start.y, end.y) + extraPeak,
        midZ,
      );
      return {
        start: start.clone(),
        control,
        end: end.clone(),
        duration: Math.max(0.12, duration),
        elapsed: 0,
      };
    };

    const evaluateArcadeCurvePosition = (curve: ArcadeCurve, t: number): Vector3 => {
      const clampedT = clamp01(t);
      const omt = 1 - clampedT;
      return new Vector3(
        omt * omt * curve.start.x + 2 * omt * clampedT * curve.control.x + clampedT * clampedT * curve.end.x,
        omt * omt * curve.start.y + 2 * omt * clampedT * curve.control.y + clampedT * clampedT * curve.end.y,
        omt * omt * curve.start.z + 2 * omt * clampedT * curve.control.z + clampedT * clampedT * curve.end.z,
      );
    };

    const evaluateArcadeCurveVelocity = (curve: ArcadeCurve, t: number): Vector3 => {
      const clampedT = clamp01(t);
      const omt = 1 - clampedT;
      const dt = Math.max(1e-4, curve.duration);
      const dx = (2 * omt * (curve.control.x - curve.start.x) + 2 * clampedT * (curve.end.x - curve.control.x)) / dt;
      const dy = (2 * omt * (curve.control.y - curve.start.y) + 2 * clampedT * (curve.end.y - curve.control.y)) / dt;
      const dz = (2 * omt * (curve.control.z - curve.start.z) + 2 * clampedT * (curve.end.z - curve.control.z)) / dt;
      return new Vector3(dx, dy, dz);
    };

    const clearArcadeRallyFlight = (): void => {
      arcadeRallyFlight.active = false;
      arcadeRallyFlight.toTable = null;
      arcadeRallyFlight.toReceive = null;
    };

    const startArcadeRallyFlight = (
      attackerSide: CourtSide,
      strikeBand: HeightBand,
      strikeSpeed: number,
      tableTarget: Vector3,
      attackerPos: Vector3,
      defenderPos: Vector3,
    ): void => {
      if (!ENABLE_ARCADE_RALLY_SCRIPT || serveState.active || collisionDrill.enabled) {
        return;
      }

      const receiverSide: CourtSide = attackerSide === 0 ? 1 : 0;
      const start = ball.mesh.position.clone();
      const tableHit = new Vector3(tableTarget.x, getTableBallContactY(tableTarget.z), tableTarget.z);

      const defenderBox = classifyBox(defenderPos, receiverSide);
      const tableXNorm = clamp01((tableHit.x + playerHalfCourtX) / (2 * playerHalfCourtX));
      const tableXBand = clampi(Math.round(tableXNorm * (GRID_X_BANDS - 1)), 0, GRID_X_BANDS - 1);
      const targetBox: BoxIndex = {
        x: clampi(Math.round(defenderBox.x * 0.35 + tableXBand * 0.65), 0, GRID_X_BANDS - 1),
        y: strikeBand === 'veryHigh' ? 2 : 1,
        z: 1,
        key: '',
      };
      targetBox.key = `${targetBox.x}-${targetBox.y}-${targetBox.z}`;

      const receiveTarget = getBoxCenter(targetBox, receiverSide);
      receiveTarget.x = clampi(receiveTarget.x * 0.72 + defenderPos.x * 0.28, -playerHalfCourtX * 0.92, playerHalfCourtX * 0.92);
      receiveTarget.z = clampi(
        receiveTarget.z,
        receiverSide === 0 ? -playerHalfCourtZ : minCourtSplitZ,
        receiverSide === 0 ? -minCourtSplitZ : playerHalfCourtZ,
      );

      const strikeSpeedClamped = Math.max(2.6 * SCALE, Math.min(12.0 * SCALE, strikeSpeed));
      const distToTable = Vector3.Distance(start, tableHit);
      const distToReceive = Vector3.Distance(tableHit, receiveTarget);
      const toTableDuration = Math.max(0.18, Math.min(0.52, distToTable / Math.max(1e-4, strikeSpeedClamped * 1.18)));
      const toReceiveDuration = Math.max(0.30, Math.min(0.82, distToReceive / Math.max(1e-4, strikeSpeedClamped * 0.82)));

      const firstArcPeak =
        0.34 * SCALE +
        (strikeBand === 'veryHigh' ? 0.18 * SCALE : strikeBand === 'high' ? 0.10 * SCALE : 0);
      const secondArcPeak =
        0.50 * SCALE +
        (strikeBand === 'veryHigh' ? 0.20 * SCALE : strikeBand === 'high' ? 0.12 * SCALE : 0);

      arcadeRallyFlight.active = true;
      arcadeRallyFlight.stage = 'toTable';
      arcadeRallyFlight.attackerSide = attackerSide;
      arcadeRallyFlight.receiverSide = receiverSide;
      arcadeRallyFlight.receiveTarget.copyFrom(receiveTarget);
      arcadeRallyFlight.toTable = buildArcadeCurve(start, tableHit, firstArcPeak, toTableDuration);
      arcadeRallyFlight.toReceive = buildArcadeCurve(tableHit, receiveTarget, secondArcPeak, toReceiveDuration);

      bounceEventCooldown = Math.max(bounceEventCooldown, 0.16);
      postKickLockTimer = 0;
      postKickLockSpeed = 0;
    };

    const updateArcadeRallyFlight = (deltaTime: number): void => {
      if (!ENABLE_ARCADE_RALLY_SCRIPT || !ball?.mesh?.physicsBody) {
        return;
      }
      if (serveState.active || !matchManager.isMatchActive) {
        if (arcadeRallyFlight.active) {
          clearArcadeRallyFlight();
        }
        return;
      }
      if (!arcadeRallyFlight.active) {
        return;
      }

      const activeCurve = arcadeRallyFlight.stage === 'toTable'
        ? arcadeRallyFlight.toTable
        : arcadeRallyFlight.toReceive;
      if (!activeCurve) {
        clearArcadeRallyFlight();
        return;
      }

      activeCurve.elapsed = Math.min(activeCurve.duration, activeCurve.elapsed + deltaTime);
      const t = activeCurve.duration > 0 ? activeCurve.elapsed / activeCurve.duration : 1;
      const pos = evaluateArcadeCurvePosition(activeCurve, t);
      const vel = evaluateArcadeCurveVelocity(activeCurve, t);

      ball.mesh.position.copyFrom(pos);
      ball.mesh.physicsBody.setLinearVelocity(vel);
      ball.mesh.physicsBody.setAngularVelocity(Vector3.Zero());

      if (activeCurve.elapsed >= activeCurve.duration - 1e-4) {
        if (arcadeRallyFlight.stage === 'toTable') {
          const bounceSide = sideFromZ(activeCurve.end.z);
          tableBouncesOnSideSinceLastTouch[bounceSide] += 1;
          bounceEventCooldown = Math.max(bounceEventCooldown, 0.22);
          arcadeRallyFlight.stage = 'toReceive';
        } else {
          clearArcadeRallyFlight();
        }
      }
    };

    const getTouchPhaseForPlayer = (player: CourtSide): TouchPhase => {
      return getPlannedPhase(player, sideFromZ(ball.mesh.position.z));
    };

    const chooseActionForPhase = (
      phase: TouchPhase,
      ballBand: HeightBand,
      playerPos: Vector3,
      trackPos: Vector3 = ball.mesh.position,
    ): OffensiveAction => {
      const lateralOffset = Math.abs(trackPos.x - playerPos.x);
      const centerLane = lateralOffset <= 0.42 * SCALE;
      const midLane = lateralOffset > 0.42 * SCALE && lateralOffset <= 1.12 * SCALE;
      const superWideLane = lateralOffset > 1.12 * SCALE;

      if (phase === 'reception') {
        if (ballBand === 'low') return 'receptionToe';
        if (ballBand === 'mid') return 'receptionInnerRight';
        return 'receptionChest';
      }

      // Kick phase subdivision from the provided clip grouping:
      // mid  -> CloseTableRightFootKick / CloseTableLowHeadKick
      // high -> HeadKick (center) or SoleRightFootKick (lateral)
      // veryHigh -> JumpHeadKick (center), HighKickLeftFoot (mid lateral), Bicycle (super lateral)
      if (ballBand === 'low') {
        return 'kickChest';
      }
      if (ballBand === 'mid') {
        if (centerLane) return 'kickCloseRightFoot';
        if (midLane) {
          return lateralOffset <= 0.82 * SCALE ? 'kickCloseRightFoot' : 'kickCloseHead';
        }
        return 'kickCloseHead';
      }
      if (ballBand === 'high') {
        return centerLane ? 'kickHead' : 'kickSoleRight';
      }
      if (centerLane) {
        return 'kickJumpHead';
      }
      if (superWideLane) {
        return 'kickBicycleLeft';
      }
      return 'kickHighLeft';
    };

    const getKickRiseProfile = (action: OffensiveAction, attackerSide: CourtSide): { vx: number; vyMult: number; vz: number } => {
      const worldRight = attackerSide === 0 ? 1 : -1;
      const worldForward = attackerSide === 0 ? 1 : -1;

      switch (action) {
        case 'kickHead':
        case 'kickJumpHead':
          return { vx: 0, vyMult: 1.12, vz: worldForward * 0.18 * SCALE };
        case 'kickCloseHead':
          return { vx: 0, vyMult: 1.05, vz: worldForward * 0.12 * SCALE };
        case 'kickChest':
          return { vx: 0, vyMult: 1.00, vz: worldForward * 0.14 * SCALE };
        case 'kickCloseRightFoot':
          return { vx: worldRight * 0.16 * SCALE, vyMult: 0.99, vz: worldForward * 0.10 * SCALE };
        case 'kickSoleRight':
          return { vx: worldRight * 0.20 * SCALE, vyMult: 1.02, vz: worldForward * 0.12 * SCALE };
        case 'kickHighLeft':
          return { vx: -worldRight * 0.18 * SCALE, vyMult: 1.06, vz: worldForward * 0.14 * SCALE };
        case 'kickBicycleLeft':
          return { vx: -worldRight * 0.24 * SCALE, vyMult: 1.15, vz: worldForward * 0.16 * SCALE };
        default:
          return { vx: 0, vyMult: 1.0, vz: worldForward * 0.10 * SCALE };
      }
    };

    const getActionFamily = (action: OffensiveAction): 'header' | 'chest' | 'knee' | 'foot' | 'scissor' => {
      if (
        action === 'header' ||
        action === 'kickHead' ||
        action === 'kickJumpHead' ||
        action === 'kickCloseHead'
      ) {
        return 'header';
      }
      if (
        action === 'chest' ||
        action === 'receptionChest' ||
        action === 'prepChest' ||
        action === 'kickChest'
      ) {
        return 'chest';
      }
      if (
        action === 'kickCloseRightFoot' ||
        action === 'kickSoleRight'
      ) {
        return 'foot';
      }
      if (
        action === 'knee' ||
        action === 'receptionToe' ||
        action === 'receptionInnerRight' ||
        action === 'prepInnerRight'
      ) {
        return 'knee';
      }
      return 'scissor';
    };

    const getEstimatedActionStartRange = (action: OffensiveAction): number => {
      const family = getActionFamily(action);
      if (family === 'header' || family === 'chest') {
        return actionHeaderStartRange;
      }
      if (family === 'knee') {
        return actionKneeStartRange;
      }
      if (family === 'foot') {
        return actionFootStartRange;
      }
      return actionScissorStartRange;
    };

    const predictReceptionFallSnapshot = (
      player: CourtSide,
      playerPos: Vector3,
    ): {
      target: Vector3;
      ballBand: HeightBand;
      action: OffensiveAction;
      reachable: boolean;
      inCourt: boolean;
      timeToFallStart: number;
    } | null => {
      if (!ball?.mesh?.physicsBody) return null;

      const minZ = player === 0 ? -playerHalfCourtZ : minCourtSplitZ;
      const maxZ = player === 0 ? -minCourtSplitZ : playerHalfCourtZ;

      const forecast = receptionForecastByPlayer[player];
      if (forecast) {
        const target = new Vector3(
          clampi(forecast.target.x, -playerHalfCourtX * 0.95, playerHalfCourtX * 0.95),
          forecast.target.y,
          clampi(forecast.target.z, minZ, maxZ),
        );
        const horizontalDist = Vector3.Distance(
          new Vector3(playerPos.x, 0, playerPos.z),
          new Vector3(target.x, 0, target.z),
        );
        const currentFlatDist = Vector3.Distance(
          new Vector3(playerPos.x, 0, playerPos.z),
          new Vector3(ball.mesh.position.x, 0, ball.mesh.position.z),
        );
        const isAiReceiver = player === 0 ? ENABLE_P1_AI : ENABLE_P2_AI;
        const rangePad = isAiReceiver ? AI_RECEIVE_RANGE_PAD : 0.88 * SCALE;
        const speedMult = isAiReceiver ? AI_RECEIVE_SPEED_MULT : 1.06;
        const timeGrace = isAiReceiver ? AI_RECEIVE_TIME_GRACE : 1.05;
        const startRange = getEstimatedActionStartRange(forecast.action) + rangePad;
        const timeToReach = horizontalDist / Math.max(0.001, playerMoveSpeed * speedMult);
        const closeNow = isAiReceiver
          ? currentFlatDist <= Math.max(1.05 * SCALE, startRange * 0.72)
          : currentFlatDist <= Math.max(1.18 * SCALE, startRange * 0.86);
        const reachable = closeNow || (horizontalDist <= startRange && timeToReach <= (forecast.timeToFallStart + timeGrace));

        return {
          target,
          ballBand: forecast.ballBand,
          action: forecast.action,
          reachable,
          inCourt: true,
          timeToFallStart: forecast.timeToFallStart,
        };
      }

      const vel = ball.mesh.physicsBody.getLinearVelocity();
      const ballSide = sideFromZ(ball.mesh.position.z);
      const phase = getPlannedPhase(player, ballSide);
      const incomingFromOpponent = lastTouchPlayer !== null && lastTouchPlayer !== player;
      const towardPlayerSide = player === 0 ? vel.z <= -0.02 * SCALE : vel.z >= 0.02 * SCALE;
      const allowPrediction = ballSide === player || (incomingFromOpponent && towardPlayerSide);
      if (!allowPrediction || (phase !== 'reception' && !incomingFromOpponent)) {
        return null;
      }

      const tToFallStart = vel.y > 0 ? Math.min(1.25, vel.y / gravityAbs) : 0.10;
      const rawX = ball.mesh.position.x + vel.x * tToFallStart;
      const rawZ = ball.mesh.position.z + vel.z * tToFallStart;
      const apexY = ball.mesh.position.y + vel.y * tToFallStart - 0.5 * gravityAbs * tToFallStart * tToFallStart;

      const inCourt =
        rawX >= -playerHalfCourtX - 0.32 * SCALE &&
        rawX <= playerHalfCourtX + 0.32 * SCALE &&
        rawZ >= minZ - 0.32 * SCALE &&
        rawZ <= maxZ + 0.32 * SCALE;

      const predictedPos = new Vector3(
        clampi(rawX, -playerHalfCourtX * 0.95, playerHalfCourtX * 0.95),
        apexY,
        clampi(rawZ, minZ, maxZ),
      );

      const ballBand = getHeightBand(apexY);
      const action = chooseActionForPhase('reception', ballBand, playerPos, predictedPos);

      const incomingFlat = new Vector3(vel.x, 0, vel.z);
      const incomingDir = incomingFlat.lengthSquared() > 1e-5
        ? incomingFlat.normalize()
        : new Vector3(0, 0, player === 0 ? -1 : 1);
      const rightAxis = player === 0 ? 1 : -1;

      let depthBack = 0.06 * SCALE;
      let lateral = 0;
      if (action === 'receptionToe') {
        depthBack = 0.24 * SCALE;
      } else if (action === 'receptionInnerRight') {
        depthBack = 0.16 * SCALE;
        lateral = 0.14 * SCALE * rightAxis;
      }

      const target = new Vector3(
        clampi(predictedPos.x + lateral - incomingDir.x * depthBack, -playerHalfCourtX * 0.95, playerHalfCourtX * 0.95),
        predictedPos.y,
        clampi(predictedPos.z - incomingDir.z * depthBack, minZ, maxZ),
      );

      const horizontalDist = Vector3.Distance(
        new Vector3(playerPos.x, 0, playerPos.z),
        new Vector3(target.x, 0, target.z),
      );
      const currentFlatDist = Vector3.Distance(
        new Vector3(playerPos.x, 0, playerPos.z),
        new Vector3(ball.mesh.position.x, 0, ball.mesh.position.z),
      );
      const isAiReceiver = player === 0 ? ENABLE_P1_AI : ENABLE_P2_AI;
      const rangePad = isAiReceiver ? AI_RECEIVE_RANGE_PAD : 0.80 * SCALE;
      const speedMult = isAiReceiver ? AI_RECEIVE_SPEED_MULT : 1.04;
      const timeGrace = isAiReceiver ? AI_RECEIVE_TIME_GRACE : 1.06;
      const startRange = getEstimatedActionStartRange(action) + rangePad;
      const timeToReach = horizontalDist / Math.max(0.001, playerMoveSpeed * speedMult);
      const closeNow = isAiReceiver
        ? currentFlatDist <= Math.max(1.05 * SCALE, startRange * 0.72)
        : currentFlatDist <= Math.max(1.15 * SCALE, startRange * 0.84);
      const reachable = closeNow || (horizontalDist <= startRange && timeToReach <= (tToFallStart + timeGrace));

      return {
        target,
        ballBand,
        action,
        reachable,
        inCourt,
        timeToFallStart: tToFallStart,
      };
    };

    const planInferredAction = (
      player: CourtSide,
      playerPos: Vector3,
      opponentPos: Vector3,
    ): { phase: TouchPhase; effectivePhase: TouchPhase; action: OffensiveAction; ballBand: HeightBand; reachable: boolean } => {
      const ballSide = sideFromZ(ball.mesh.position.z);
      const phase = getPlannedPhase(player, ballSide);
      const receptionSnapshot = predictReceptionFallSnapshot(player, playerPos);
      const ballBand = receptionSnapshot?.ballBand ?? getHeightBand(ball.mesh.position.y);
      let horizontalDist = Vector3.Distance(
        new Vector3(playerPos.x, 0, playerPos.z),
        new Vector3(ball.mesh.position.x, 0, ball.mesh.position.z),
      );

      if (receptionSnapshot) {
        horizontalDist = Vector3.Distance(
          new Vector3(playerPos.x, 0, playerPos.z),
          new Vector3(receptionSnapshot.target.x, 0, receptionSnapshot.target.z),
        );
      }

      let effectivePhase = phase;
      if (receptionSnapshot && (phase === 'defense' || phase === 'reception')) {
        effectivePhase = 'reception';
      }
      // No preparation phase: reception goes directly to kick.

      const action = receptionSnapshot && effectivePhase === 'reception'
        ? receptionSnapshot.action
        : chooseActionForPhase(
          effectivePhase,
          ballBand,
          playerPos,
          receptionSnapshot?.target ?? ball.mesh.position,
        );

      const reachable = receptionSnapshot && effectivePhase === 'reception'
        ? receptionSnapshot.reachable
        : horizontalDist <= getEstimatedActionStartRange(action) + 0.35 * SCALE;
      return { phase, effectivePhase, action, ballBand, reachable };
    };

    const buildTableCells = (attackerSide: CourtSide): TableCell[] => {
      const cells: TableCell[] = [];
      const rowHalfDepth = tableProfile.halfLength;
      const colHalfWidth = tableProfile.halfWidth;
      const minX = tableProfile.centerX - colHalfWidth;
      const maxX = tableProfile.centerX + colHalfWidth;
      const minZ = tableProfile.centerZ - rowHalfDepth;
      const maxZ = tableProfile.centerZ + rowHalfDepth;
      const zNear = tableProfile.centerZ + (attackerSide === 0 ? rowHalfDepth * 0.366 : -rowHalfDepth * 0.366);
      const zFar = tableProfile.centerZ + (attackerSide === 0 ? rowHalfDepth * 0.833 : -rowHalfDepth * 0.833);
      const rows = [zNear, zFar];
      const cols = [
        tableProfile.centerX - colHalfWidth * 0.67,
        tableProfile.centerX,
        tableProfile.centerX + colHalfWidth * 0.67,
      ];
      for (let r = 0; r < TABLE_ROWS; r++) {
        for (let c = 0; c < TABLE_COLS; c++) {
          cells.push({
            row: r,
            col: c,
            center: new Vector3(
              clampi(cols[c], minX, maxX),
              getTableBallContactY(rows[r]),
              clampi(rows[r], minZ, maxZ),
            ),
            score: 0,
          });
        }
      }
      return cells;
    };

    // Pick a landing cell on the opponent's table for a kick.  Instead of always
    // hammering the same deep cross-court corner (which makes every rally look
    // identical), spread targets across columns and depth for varied bounce
    // angles, then add a little intra-cell jitter so even repeats differ.  A
    // human attacker can steer the column with their D-pad (aimX); the AI and
    // un-steered kicks use a cross-court-biased random spread.
    const chooseDiagonalOpponentTableCell = (
      attackerSide: CourtSide,
      attackerPos: Vector3,
      aimX = 0,
    ): Vector3 => {
      const cells = buildTableCells(attackerSide);
      const crossCol = attackerPos.x <= tableProfile.centerX ? 2 : 0;
      const lineCol = crossCol === 0 ? 2 : 0;

      let targetCol: number;
      if (Math.abs(aimX) > 0.35) {
        // Human steering: stick left → -x column (0), right → +x column (2).
        targetCol = aimX > 0 ? 2 : 0;
      } else {
        // Favour the corners (cross-court & down-the-line) over the middle so
        // un-steered kicks are aggressively diagonal and hard to defend.
        const roll = Math.random();
        if (roll < 0.50) targetCol = crossCol;       // cross-court corner
        else if (roll < 0.85) targetCol = lineCol;   // down-the-line corner
        else targetCol = 1;                          // occasional middle
      }

      const isCornerCol = targetCol !== 1;
      // Corners go deep most of the time — deep + wide is the hardest cell to
      // reach.  Middle balls keep a more even short/deep mix.
      const targetRow = isCornerCol
        ? (Math.random() < 0.80 ? 1 : 0)
        : (Math.random() < 0.55 ? 1 : 0);

      const match = cells.find(c => c.col === targetCol && c.row === targetRow);
      const base = (match ?? cells[cells.length - 1]).center;

      const colHalfWidth = tableProfile.halfWidth;
      const rowHalfDepth = tableProfile.halfLength;
      const minX = tableProfile.centerX - colHalfWidth;
      const maxX = tableProfile.centerX + colHalfWidth;
      const minZ = tableProfile.centerZ - rowHalfDepth;
      const maxZ = tableProfile.centerZ + rowHalfDepth;

      // For corner targets, shove the landing point toward the sideline so the
      // ball hugs the corner instead of sitting mid-column.  Middle keeps a
      // small symmetric jitter so repeats still differ.
      let jitterX: number;
      if (isCornerCol) {
        const sidelineSign = targetCol === 2 ? 1 : -1;
        jitterX = sidelineSign * colHalfWidth * (0.40 + Math.random() * 0.45);
      } else {
        jitterX = (Math.random() - 0.5) * colHalfWidth * 0.42;
      }
      // Push deep corners a little further toward the back edge for extra reach.
      const jitterZ = (Math.random() - 0.5) * rowHalfDepth * 0.30
        + (isCornerCol && targetRow === 1 ? rowHalfDepth * 0.20 : 0);

      const jx = clampi(base.x + jitterX, minX, maxX);
      const jz = clampi(base.z + jitterZ, minZ, maxZ);
      return new Vector3(jx, getTableBallContactY(jz), jz);
    };

    const computeKickFlightShape = (baseTimeScale: number, distToTable: number): { distanceT: number; timeScale: number } => {
      const distanceT = clamp01((distToTable - playerHalfCourtZ * 0.28) / Math.max(1e-3, playerHalfCourtZ * 0.95));
      return {
        distanceT,
        timeScale: clampi(baseTimeScale * (0.78 + 0.52 * distanceT), 0.62, 1.20),
      };
    };

    const chooseBestTableCell = (
      attackerSide: CourtSide,
      attackerPos: Vector3,
      defenderPos: Vector3,
      phase: TouchPhase,
      band: HeightBand,
    ): Vector3 => {
      const cells = buildTableCells(attackerSide);
      for (const cell of cells) {
        const distDef = Vector3.Distance(defenderPos, cell.center);
        const distAtk = Vector3.Distance(attackerPos, cell.center);
        let score = distDef * 1.1 - distAtk * 0.35;
        if (phase === 'kick') {
          // Kicks should land deep enough on the opponent's table to force a
          // visible table bounce instead of turning into a direct aerial pass.
          score += 0.9;
          score += cell.row === 1 ? 1.15 : -0.20;
        }
        if (band === 'veryHigh' && cell.row === 1) score += 0.6;
        if (band === 'mid' && cell.row === 0) score += 0.35;
        if (Math.abs(attackerPos.x) > 2.5 * SCALE) {
          const sideCol = attackerPos.x > 0 ? 2 : 0;
          if (cell.col === sideCol) score += 0.45;
        }
        cell.score = score;
      }
      cells.sort((a, b) => b.score - a.score);
      return cells[0].center;
    };

    const isKickAction = (action: OffensiveAction): boolean => action.startsWith('kick');

    const chooseAiActionDecision = (
      phase: TouchPhase,
      ballBand: HeightBand,
      action: OffensiveAction,
      attackerPos: Vector3,
      defenderPos: Vector3,
    ): { powerMult: number; ttl: number } => {
      const attackerToDefender = Vector3.Distance(
        new Vector3(attackerPos.x, 0, attackerPos.z),
        new Vector3(defenderPos.x, 0, defenderPos.z),
      );
      const bandFactor = ballBand === 'veryHigh'
        ? 1.16
        : ballBand === 'high'
          ? 1.08
          : ballBand === 'mid'
            ? 1.00
            : 0.92;

      if (phase === 'reception') {
        return {
          powerMult: 0.82,
          ttl: Math.max(0.24, Math.min(0.55, actionRequestTtl * 0.42)),
        };
      }

      if (phase === 'preparation') {
        return {
          powerMult: 0.88,
          ttl: Math.max(0.30, Math.min(0.75, actionRequestTtl * 0.58)),
        };
      }

      const reachFactor = Math.max(0.90, Math.min(1.18, attackerToDefender / Math.max(0.001, playerHalfCourtX * 0.92)));
      const actionFactor = action === 'kickHighLeft'
        ? 1.08
        : action === 'kickJumpHead'
          ? 1.06
          : action === 'kickChest'
            ? 0.96
            : action === 'kickBicycleLeft'
              ? 1.12
              : 1.0;

      return {
        powerMult: Math.max(0.88, Math.min(1.28, bandFactor * reachFactor * actionFactor)),
        ttl: Math.max(0.45, Math.min(1.00, actionRequestTtl * (ballBand === 'veryHigh' ? 1.06 : ballBand === 'high' ? 0.96 : 0.82))),
      };
    };

    const getPlannedPhase = (player: CourtSide, ballSide: CourtSide): TouchPhase => {
      if (lastTouchPlayer === player) {
        // Use authoritative rally phase state when present
        const phase = rallyPhaseByPlayer[player];
        if (phase) return phase;
        const nextTouch = touchesByPlayer[player] + 1;
        if (nextTouch <= 1) return 'reception';
        return 'kick';
      }
      if (ballSide === player) {
        const bouncedOnMyTableSide = tableBouncesOnSideSinceLastTouch[player] >= 1;
        if (bouncedOnMyTableSide) {
          return 'reception';
        }

        // Fallback for pure-physics / fast-rally frames where bounce counters
        // can lag: if opponent touched last and ball is arriving on my side,
        // treat as reception so receiver can still react.
        const incomingFromOpponent = lastTouchPlayer !== null && lastTouchPlayer !== player;
        if (incomingFromOpponent && ball?.mesh?.physicsBody) {
          const vel = ball.mesh.physicsBody.getLinearVelocity();
          const descendingOrNearApex = vel.y <= 0.25 * SCALE;
          const towardMySide = player === 0 ? vel.z <= 0.10 * SCALE : vel.z >= -0.10 * SCALE;
          if (descendingOrNearApex && towardMySide) {
            return 'reception';
          }
        }

        return 'defense';
      }
      return 'defense';
    };

    const queueAutoAction = (
      player: CourtSide,
      request: ActionRequestState,
      assist: AssistState,
      character: Character | undefined,
      strikeState: { action: OffensiveAction | null; timer: number },
      playerPos: Vector3,
      opponentPos: Vector3,
      serveSetupActive: boolean,
    ): void => {
      if (request.action || assist.active || serveSetupActive) return;
      if (character?.isInStrike() || (strikeState.action !== null && strikeState.timer > 0)) return;
      if (!isBallInsidePlayableCourtXZ(0.16 * SCALE)) return;

      const plan = planInferredAction(player, playerPos, opponentPos);
      if (plan.effectivePhase === 'defense' || !plan.reachable) return;
      // Allow kick after at least 1 reception touch (no preparation phase)
      if (plan.effectivePhase === 'kick' && (touchesByPlayer[player] < 1 || !canKickAfterReceptionByPlayer[player])) return;
      if (plan.effectivePhase === 'reception') return; // handled by tryGuaranteedReception

      const aiDecision = chooseAiActionDecision(plan.effectivePhase, plan.ballBand, plan.action, playerPos, opponentPos);

      const playerBox = classifyBox(playerPos, player);
      const ballBox = classifyBox(ball.mesh.position, player);

      // Keep request short; it will be re-evaluated every frame.
      request.action = plan.action;
      request.ttl = Math.max(0.18, Math.min(0.55, aiDecision.ttl + (ballBox.y - playerBox.y) * 0.02 + (playerBox.y > ballBox.y ? 0.04 : 0)));
      requestPowerByPlayer[player] = aiDecision.powerMult;
    };

    const getActionAssistProfile = (action: OffensiveAction) => {
      const family = getActionFamily(action);

      if (family === 'header') {
        return {
          startRange: actionHeaderStartRange,
          minHeight: actionHeaderHeightMin,
          maxHeight: Number.POSITIVE_INFINITY,
          duration: actionAssistDuration,
          impactTime: actionAssistImpactTime,
          depth: 0.50 * SCALE,
          lateral: 0,
          contactDistance: actionAssistContactDistance,
          magnetRange: actionAssistMagnetRange,
          fallbackY: 1.55 * SCALE,
          fallbackForward: 0.08 * SCALE,
          flightTimeScale: 0.84,
          verticalVelocityBias: -0.30 * SCALE,
        };
      }
      if (family === 'chest') {
        return {
          startRange: actionHeaderStartRange,
          minHeight: 0.95 * SCALE,
          maxHeight: 2.05 * SCALE,
          duration: actionAssistDuration,
          impactTime: actionAssistImpactTime,
          depth: 0.42 * SCALE,
          lateral: 0,
          contactDistance: actionAssistContactDistance,
          magnetRange: actionAssistMagnetRange,
          fallbackY: 1.18 * SCALE,
          fallbackForward: 0.14 * SCALE,
          flightTimeScale: 1.10,
          verticalVelocityBias: 0.28 * SCALE,
        };
      }
      if (family === 'knee') {
        return {
          startRange: actionKneeStartRange,
          minHeight: actionKneeHeightMin,
          maxHeight: actionKneeHeightMax,
          duration: actionKneeDuration,
          impactTime: actionKneeImpactTime,
          depth: actionKneeDepth,
          lateral: actionKneeLateral,
          contactDistance: actionKneeContactDistance,
          magnetRange: actionKneeMagnetRange,
          fallbackY: actionKneeFallbackY,
          fallbackForward: actionKneeFallbackForward,
          flightTimeScale: 0.94,
          verticalVelocityBias: 0.04 * SCALE,
        };
      }
      if (family === 'foot') {
        return {
          startRange: actionFootStartRange,
          minHeight: actionFootHeightMin,
          maxHeight: actionFootHeightMax,
          duration: actionFootDuration,
          impactTime: actionFootImpactTime,
          depth: actionFootDepth,
          lateral: actionFootLateral,
          contactDistance: actionFootContactDistance,
          magnetRange: actionFootMagnetRange,
          fallbackY: actionFootFallbackY,
          fallbackForward: actionFootFallbackForward,
          flightTimeScale: 1.14,
          verticalVelocityBias: 0.32 * SCALE,
        };
      }
      return {
        startRange: actionScissorStartRange,
        minHeight: actionScissorHeightMin,
        maxHeight: actionScissorHeightMax,
        duration: actionScissorDuration,
        impactTime: actionScissorImpactTime,
        depth: actionScissorDepth,
        lateral: actionScissorLateral,
        contactDistance: actionScissorContactDistance,
        magnetRange: actionScissorMagnetRange,
        fallbackY: actionScissorFallbackY,
        fallbackForward: actionScissorFallbackForward,
        flightTimeScale: 1.00,
        verticalVelocityBias: 0.08 * SCALE,
      };
    };

    const resolveStrikeTiming = (
      profile: ReturnType<typeof getActionAssistProfile>,
      animConfig: ReturnType<typeof getAnimConfigForAction>,
    ): { strikeDuration: number; impactTime: number } => {
      let strikeDuration = profile.duration;
      let impactTime = profile.impactTime;

      if (!animConfig) {
        return { strikeDuration, impactTime };
      }

      const fps = Math.max(1, ANIM_CONFIG_FPS);
      const speedRatio = Math.max(0.1, actionAnimationSpeedRatio);
      const clipLengthFrames = Math.max(
        1,
        Math.round(animConfig.clipLengthFrames ?? Math.max(1, animConfig.contactFrame + 1)),
      );
      const contactFrame = animConfig.contactWindow
        ? 0.5 * (animConfig.contactWindow[0] + animConfig.contactWindow[1])
        : animConfig.contactFrame;
      const clampedContactFrame = Math.max(0, Math.min(clipLengthFrames, contactFrame));
      const contactFromStartSec = clampedContactFrame / fps / speedRatio;

      strikeDuration = Math.max(
        profile.duration,
        Math.min(actionTimingMaxDuration, contactFromStartSec + actionTimingContactTailSeconds),
      );
      impactTime = Math.max(
        0.02,
        Math.min(strikeDuration - 0.02, strikeDuration - contactFromStartSec),
      );

      return { strikeDuration, impactTime };
    };

    const applyRealisticBallConvergence = (
      target: Vector3,
      range: number,
      strength: number,
      maxAccel: number,
      verticalWeight: number,
      deltaTime: number,
    ): void => {
      if (!ball?.mesh?.physicsBody) return;

      const toTarget = target.subtract(ball.mesh.position);
      const dist = toTarget.length();
      if (!Number.isFinite(dist) || dist < 1e-4 || dist > range) return;

      const dir = toTarget.scale(1 / dist);
      const influence = Math.max(0, Math.min(1, 1 - (dist / Math.max(1e-4, range))));
      const vel = ball.mesh.physicsBody.getLinearVelocity();
      const radialSpeed = Vector3.Dot(vel, dir);

      // Soft acceleration with damping keeps this physically plausible.
      const desiredAccel = strength * influence * influence;
      const damp = Math.max(0, radialSpeed) * 0.45;
      const accelMag = Math.max(0, Math.min(maxAccel, desiredAccel - damp));
      if (accelMag <= 1e-4) return;

      const accel = dir.scale(accelMag);
      ball.mesh.physicsBody.setLinearVelocity(new Vector3(
        vel.x + accel.x * deltaTime,
        vel.y + accel.y * verticalWeight * deltaTime,
        vel.z + accel.z * deltaTime,
      ));
    };

    const getCollisionDrillStrikeHeight = (action: OffensiveAction): number => {
      const family = getActionFamily(action);
      if (family === 'header') return 1.82 * SCALE;
      if (family === 'chest') return 1.26 * SCALE;
      if (family === 'knee') return 1.02 * SCALE;
      if (family === 'foot') return 0.78 * SCALE;
      return 1.18 * SCALE;
    };

    const solveDescendingImpactTime = (startY: number, launchVy: number, targetY: number): number => {
      const a = -0.5 * gravityAbs;
      const b = launchVy;
      const c = startY - targetY;
      const disc = b * b - 4 * a * c;
      if (disc < 0) {
        return 0.9;
      }

      const sqrtDisc = Math.sqrt(disc);
      const t1 = (-b - sqrtDisc) / (2 * a);
      const t2 = (-b + sqrtDisc) / (2 * a);
      const positive = [t1, t2].filter((t) => Number.isFinite(t) && t > 0);
      if (positive.length === 0) {
        return 0.9;
      }
      return Math.max(...positive);
    };

    const launchCollisionDrillToss = (): void => {
      if (!ball?.mesh?.physicsBody) {
        return;
      }

      const strikerRoot = collisionDrill.side === 0 ? charRoot1 : charRoot2;
      const towardTable = collisionDrill.side === 0 ? 1 : -1;
      const profile = getActionAssistProfile(collisionDrill.action);
      const strikeY = strikerRoot.position.y + getCollisionDrillStrikeHeight(collisionDrill.action);
      const contactTarget = new Vector3(
        Math.max(-playerHalfCourtX, Math.min(playerHalfCourtX, strikerRoot.position.x + (Math.random() - 0.5) * 0.45 * SCALE)),
        strikeY,
        strikerRoot.position.z + towardTable * Math.max(0.16 * SCALE, profile.depth * 0.55),
      );
      const start = new Vector3(
        contactTarget.x + (Math.random() - 0.5) * 0.32 * SCALE,
        1.45 * SCALE,
        strikerRoot.position.z + towardTable * (1.25 + Math.random() * 0.45) * SCALE,
      );
      const flightTime = 0.92 + Math.random() * 0.20;
      const delta = contactTarget.subtract(start);
      const launchVel = new Vector3(
        delta.x / flightTime,
        Math.max(7.2 * SCALE, (delta.y + 0.5 * gravityAbs * flightTime * flightTime) / Math.max(0.001, flightTime)),
        delta.z / flightTime,
      );

      serveState.active = false;
      clearRallyState();
      postKickLockTimer = 0;
      postKickLockSpeed = 0;

      ball.mesh.position.copyFrom(start);
      ball.mesh.physicsBody.setAngularVelocity(Vector3.Zero());
      ball.mesh.physicsBody.setLinearVelocity(launchVel);

      const impactT = solveDescendingImpactTime(start.y, launchVel.y, strikeY);
      collisionDrill.timeToImpact = Math.max(0.45, Math.min(1.9, impactT));
      collisionDrill.tossCooldown = 0.75;
      collisionDrill.activeFlight = true;
      collisionDrill.actionQueued = false;

      console.log(
        `[Debug] collisionDrill toss | action=${collisionDrill.action} | tImpact=${collisionDrill.timeToImpact.toFixed(2)}s`,
      );
    };

    // One-time setup for DOM overlays that live alongside the game canvas.
    initServeSelectorUI();

    // ── Superpower HUD indicator (P1) ──────────────────────────────────────
    const superAbilityLabel = p1SelectedId === 'messi' ? 'SUPERCHARGE' : 'CHAOS CURVE';
    const superHudEl = document.createElement('div');
    superHudEl.id = 'p1-super-hud';
    superHudEl.style.cssText =
      // top:70px keeps this clear of the "← Menu" back button (top:24px) which
      // shares the top-left corner; otherwise this banner overlaps it.
      'position:fixed;left:18px;top:70px;z-index:9999;font-family:Arial,sans-serif;' +
      'font-weight:800;font-size:16px;letter-spacing:0.6px;padding:11px 16px;border-radius:10px;' +
      'pointer-events:none;border:1px solid rgba(255,255,255,0.3);transition:all 0.15s;';
    document.body.appendChild(superHudEl);

    // One superpower kick is available per set; show it as a charge pip so the
    // player can tell at a glance how many uses remain (filled = available,
    // hollow = spent).
    const SUPER_KICKS_PER_SET = 1;
    const renderSuperPips = (remaining: number, color: string): string => {
      let pips = '';
      for (let i = 0; i < SUPER_KICKS_PER_SET; i++) {
        const filled = i < remaining;
        pips += `<span style="display:inline-block;width:11px;height:11px;border-radius:50%;` +
          `margin-left:6px;vertical-align:-1px;border:1.5px solid ${color};` +
          `background:${filled ? color : 'transparent'};` +
          `box-shadow:${filled ? `0 0 6px ${color}` : 'none'};"></span>`;
      }
      return pips;
    };

    const updateSuperHud = (): void => {
      if (!matchManager.isMatchActive) {
        superHudEl.style.display = 'none';
        return;
      }
      superHudEl.style.display = 'block';
      const key = `[F] ${superAbilityLabel}`;
      const remaining = p1SuperAvailable ? SUPER_KICKS_PER_SET : 0;
      if (p1SuperArmed) {
        superHudEl.innerHTML = `${key} — ARMÉ ! frappez maintenant ${renderSuperPips(remaining, '#fff')}`;
        superHudEl.style.background = 'rgba(255,120,0,0.9)';
        superHudEl.style.color = '#fff';
        superHudEl.style.boxShadow = '0 0 16px rgba(255,140,0,0.95)';
      } else if (p1SuperAvailable) {
        superHudEl.innerHTML = `${key} — PRÊT · appuyez sur F ${renderSuperPips(remaining, '#eafcff')}`;
        superHudEl.style.background = 'rgba(0,170,200,0.75)';
        superHudEl.style.color = '#eafcff';
        superHudEl.style.boxShadow = '0 0 12px rgba(0,200,230,0.6)';
      } else {
        superHudEl.innerHTML = `${key} — indisponible · 2 points d'affilée (${p1PointStreak}/2) ${renderSuperPips(0, 'rgba(255,255,255,0.5)')}`;
        superHudEl.style.background = 'rgba(20,20,30,0.7)';
        superHudEl.style.color = 'rgba(255,255,255,0.6)';
        superHudEl.style.boxShadow = 'none';
      }
    };

    gameScene.registerBeforeRender(() => {
      if (!ball || !ball.mesh.physicsBody) {
        return;
      }

      const physicsBody = ball.mesh.physicsBody;
      const deltaTime = engine.getNativeEngine().getDeltaTime() / 1000;
      let currentVelocity = physicsBody.getLinearVelocity();

      for (let side = 0 as CourtSide; side <= 1; side = (side + 1) as CourtSide) {
        const forecast = receptionForecastByPlayer[side];
        if (!forecast) continue;

        forecast.ttl = Math.max(0, forecast.ttl - deltaTime);
        forecast.timeToFallStart = Math.max(0, forecast.timeToFallStart - deltaTime);
        if (forecast.ttl <= 0) {
          receptionForecastByPlayer[side] = null;
        }
      }

      ballInteractionLockTimer = Math.max(0, ballInteractionLockTimer - deltaTime);
      if (ballInteractionLockTimer <= 0) {
        ballInteractionLockSide = null;
      }

      updateBallVisualSpin(deltaTime);
      updateBallFireVfx(deltaTime);

      // Every new set recharges the supercharge and resets the point streak.
      const superSetCount = matchManager.sets[0] + matchManager.sets[1];
      if (superSetCount !== lastSetCountForSuper) {
        lastSetCountForSuper = superSetCount;
        p1SuperAvailable = true;
        p1PointStreak = 0;
        p1SuperArmed = false;
      }

      updateSuperHud();

      if (
        ball.mesh.position.y > BALL_RESET_HEIGHT ||
        ball.mesh.position.y < BALL_RESET_MIN_Y ||
        Math.abs(ball.mesh.position.x) > BALL_RESET_X_LIMIT ||
        Math.abs(ball.mesh.position.z) > BALL_RESET_Z_LIMIT
      ) {
        clearArcadeRallyFlight();
        const belowFloor = ball.mesh.position.y < BALL_RESET_MIN_Y;
        const leftCourtLaterally =
          Math.abs(ball.mesh.position.x) > BALL_RESET_X_LIMIT ||
          Math.abs(ball.mesh.position.z) > BALL_RESET_Z_LIMIT;
        if (matchManager.isMatchActive && !pointFreezeActive && (belowFloor || leftCourtLaterally)) {
          if (belowFloor && !leftCourtLaterally && PURE_BALL_PHYSICS) {
            // Pure physics: the per-frame floor-contact check already scored this
            // rally as the ball descended through floor level; reaching the
            // safety floor below the court is just cleanup, so don't double-score.
            clearRallyState();
            serveState.active = false;
            resetBall();
          } else {
            // The ball left the playing volume out the side (or below floor in
            // assist mode) without a scored floor contact — award the point so
            // the rally never hangs on a ball lost off-court / in the stands.
            resolveRallyOutOfPlay();
          }
        } else {
          // Over-the-top resets and any non-match state just recenter the ball.
          resetBall();
        }
        currentVelocity = physicsBody.getLinearVelocity();
      }

      if (ENABLE_ARCADE_RALLY_SCRIPT) {
        updateArcadeRallyFlight(deltaTime);
        currentVelocity = physicsBody.getLinearVelocity();
      }

      if (postKickGuideTimer > 0 && lastPostReceptionKickDebug) {
        postKickGuideTimer = Math.max(0, postKickGuideTimer - deltaTime);
        const guideTarget = new Vector3(
          lastPostReceptionKickDebug.targetX,
          lastPostReceptionKickDebug.targetY,
          lastPostReceptionKickDebug.targetZ,
        );
        const remaining = Math.max(0.10, postKickGuideTimer);
        const posNow = ball.mesh.position;
        const velNow = physicsBody.getLinearVelocity();
        const desiredGuideVelocity = new Vector3(
          (guideTarget.x - posNow.x) / remaining,
          (guideTarget.y - posNow.y + 0.5 * gravityAbs * remaining * remaining) / remaining,
          (guideTarget.z - posNow.z) / remaining,
        );
        const guideBlend = 0.42;
        physicsBody.setLinearVelocity(new Vector3(
          velNow.x + (desiredGuideVelocity.x - velNow.x) * guideBlend,
          velNow.y + (desiredGuideVelocity.y - velNow.y) * guideBlend,
          velNow.z + (desiredGuideVelocity.z - velNow.z) * guideBlend,
        ));
        currentVelocity = physicsBody.getLinearVelocity();
      }

      if (!PURE_BALL_PHYSICS && currentVelocity.y > BALL_MAX_UPWARD_SPEED) {
        physicsBody.setLinearVelocity(
          new Vector3(currentVelocity.x, BALL_MAX_UPWARD_SPEED, currentVelocity.z)
        );
        currentVelocity = physicsBody.getLinearVelocity();
      }

      if (currentVelocity.y < -BALL_MAX_DOWNWARD_SPEED) {
        physicsBody.setLinearVelocity(
          new Vector3(currentVelocity.x, -BALL_MAX_DOWNWARD_SPEED, currentVelocity.z)
        );
        currentVelocity = physicsBody.getLinearVelocity();
      }

      applyTableAntiTunnelBounce();
      applyNoGroundFallGuard();
      currentVelocity = physicsBody.getLinearVelocity();

      // Robust serve unlock: do not depend on bounceEventCooldown; as soon as
      // the serve legally rebounds on receiver-side table and starts rising,
      // allow reception/action systems to run.
      if (serveState.active && serveState.phase === 'flight') {
        const bounceSide = sideFromZ(ball.mesh.position.z);
        const reboundingUpward = currentVelocity.y >= 0.03 * SCALE;
        if (bounceSide !== serveState.server && reboundingUpward && isTableSurfaceBounce(ball.mesh.position)) {
          serveState.active = false;
          serveState.phase = 'ready';
          serveState.timer = 0;
        }
      }

      // Safety recovery: if we end up with no active serve/rally and the ball
      // resting on the court, schedule a clean re-serve instead of idling forever.
      const ballSpeed = currentVelocity.length();
      const ballGrounded = ball.mesh.position.y <= lineY + ballRadius + 0.28 * SCALE;

      // Authoritative "ball touched the floor" check.  Runs every frame, not
      // just on bounce events — so a ball that *rolls* onto the court (or
      // settles without a clean rebound) still triggers the point award.
      // Guarded by `pointFreezeActive` so we don't fire repeatedly while the
      // celebration / countdown plays, and by `ballSpeed` so we ignore the
      // resting serve ball before the toss.
      const ballOnFloor = ball.mesh.position.y <= lineY + ballRadius + 0.06 * SCALE;
      if (
        ballOnFloor &&
        matchManager.isMatchActive &&
        !collisionDrill.enabled &&
        !pointFreezeActive &&
        preServeCountdownTimer <= 0 &&
        !(serveState.active && serveState.phase === 'ready') &&
        !isTableSurfaceBounce(ball.mesh.position)
      ) {
        if (lastTouchPlayer !== null) {
          const toucher = lastTouchPlayer;
          const opponent: CourtSide = toucher === 0 ? 1 : 0;
          // If the toucher's hit reached opponent's table side, the opponent
          // failed to return it → toucher scores.  Otherwise the toucher's hit
          // never made it across → opponent scores.
          const validReturn =
            tableBouncesOnSideSinceLastTouch[opponent] > 0 ||
            ballReachedOpponentSideSinceLastTouch;
          if (validReturn) {
            awardPoint(toucher);
          } else {
            awardPoint(opponent);
          }
          currentVelocity = physicsBody.getLinearVelocity();
        } else if (serveState.active) {
          // Serve missed the receiver's table and reached the floor.
          restartServeNoPoint();
          currentVelocity = physicsBody.getLinearVelocity();
        } else {
          // Degenerate state (rally was cleared but no serve active).  Just
          // restart the serve rather than guessing a point.
          restartServeNoPoint();
          currentVelocity = physicsBody.getLinearVelocity();
        }
      } else if (
        !PURE_BALL_PHYSICS &&
        matchManager.isMatchActive &&
        !collisionDrill.enabled &&
        !serveState.active &&
        lastTouchPlayer === null &&
        ballGrounded &&
        ballSpeed <= 1.05 * SCALE
      ) {
        restartServeNoPoint();
        currentVelocity = physicsBody.getLinearVelocity();
      }

      // ── Stuck-ball watchdog ──────────────────────────────────────────────────
      // The floor-contact and out-of-bounds resets only fire when the ball is at
      // floor level or beyond the (very wide) reset limits.  A ball that comes to
      // rest somewhere in between — wedged in the bleachers, on a ledge, against
      // scenery — satisfies neither, so the rally never resolves and the match
      // hangs.  If the live ball stays nearly stationary off the floor for a few
      // seconds during an active rally, treat it as out of play and resolve the
      // point with the same arbitration the floor check uses, then re-serve.
      const ballNearlyStill = ballSpeed <= 0.55 * SCALE;
      const watchdogEligible =
        matchManager.isMatchActive &&
        !collisionDrill.enabled &&
        !pointFreezeActive &&
        preServeCountdownTimer <= 0 &&
        !(serveState.active && serveState.phase === 'ready') &&
        !ballOnFloor;
      if (watchdogEligible && ballNearlyStill) {
        ballStuckTimer += deltaTime;
      } else {
        ballStuckTimer = 0;
      }
      if (ballStuckTimer >= 2.5) {
        ballStuckTimer = 0;
        resolveRallyOutOfPlay();
        currentVelocity = physicsBody.getLinearVelocity();
      }

      if (animationPreviewMode) {
        const previewCharacter = animationPreviewPlayer === 1 ? player1 : player2;
        if (previewCharacter && animationPreviewLockedYaw !== null) {
          previewCharacter.mesh.rotation.y = animationPreviewLockedYaw;
          previewCharacter.mesh.computeWorldMatrix(true);
        }
        previousBallPosition.copyFrom(ball.mesh.position);
        previousBallVelocityY = physicsBody.getLinearVelocity().y;
        return;
      }

      if (ENABLE_POST_KICK_DIRECTION_LOCK && postKickLockTimer > 0) {
        postKickLockTimer = Math.max(0, postKickLockTimer - deltaTime);
        const v = physicsBody.getLinearVelocity();
        const flat = new Vector3(v.x, 0, v.z);
        const flatSpeed = flat.length();
        const flatDir = flatSpeed > 1e-5 ? flat.scale(1 / flatSpeed) : Vector3.Zero();
        const lockAlignment = flatSpeed > 1e-5 ? Vector3.Dot(flatDir, postKickLockDir) : 1;
        const nearBoundary =
          Math.abs(ball.mesh.position.x) >= playerHalfCourtX - 0.35 * SCALE ||
          Math.abs(ball.mesh.position.z) >= playerHalfCourtZ - 0.35 * SCALE;

        // If the ball clearly deflected (or is pressing into outer boundaries),
        // stop forcing the old kick direction to avoid ping-pong oscillation.
        if ((flatSpeed > 0.55 * SCALE && lockAlignment < 0.18) || nearBoundary) {
          postKickLockTimer = 0;
          postKickLockSpeed = 0;
        }

        if (postKickLockTimer <= 0) {
          // no-op: let natural physics continue this frame
        } else {
        const desired = new Vector3(
          postKickLockDir.x * postKickLockSpeed,
          v.y,
          postKickLockDir.z * postKickLockSpeed,
        );
        const blend = 0.22;
        physicsBody.setLinearVelocity(new Vector3(
          v.x + (desired.x - v.x) * blend,
          desired.y,
          v.z + (desired.z - v.z) * blend,
        ));
        }
      } else if (!ENABLE_POST_KICK_DIRECTION_LOCK) {
        postKickLockTimer = 0;
        postKickLockSpeed = 0;
      }

      bounceEventCooldown = Math.max(0, bounceEventCooldown - deltaTime);
      const bounceVelocityY = physicsBody.getLinearVelocity().y;
      const tableHalfWidthForBounce = tableProfile.halfWidth;
      const tableHalfLengthForBounce = tableProfile.halfLength;
      const tableTopYForBounce = getTableBallContactY(ball.mesh.position.z);
      const nearTableImpactZone =
        Math.abs(ball.mesh.position.x - tableProfile.centerX) <= tableHalfWidthForBounce + 0.18 * TABLE_SCALE &&
        Math.abs(ball.mesh.position.z - tableProfile.centerZ) <= tableHalfLengthForBounce + 0.22 * TABLE_SCALE &&
        ball.mesh.position.y <= tableTopYForBounce + ballRadius + 0.12 * TABLE_SCALE;
      // Ground floor is the bleachers court_floor mesh, NOT world Y=0.
      // Use lineY (captured from courtFloor bounds.max.y) so the ball-on-floor
      // detection still works when the bleachers sit at an elevated Y.
      const nearGroundImpactZone = ball.mesh.position.y <= lineY + ballRadius + 0.08 * TABLE_SCALE;
      // Outside-court bounce: the ball clearly went off the playing surface
      // and hit something else from the bleachers.glb world (stands, seats,
      // walls).  The vy sign-flip alone is enough proof of contact in pure
      // physics mode (the ball only collides with COL_WORLD), but we also
      // require the position to be beyond the court_floor XZ extents OR the
      // table envelope so we don't double-count regular table/floor bounces.
      const courtOutsideMarginX = 0.05 * SCALE;
      const courtOutsideMarginZ = 0.05 * SCALE;
      const tableEnvelopeMarginX = 0.30 * TABLE_SCALE;
      const tableEnvelopeMarginZ = 0.30 * TABLE_SCALE;
      const outsideCourtX = Math.abs(ball.mesh.position.x - courtCenterX) > courtHalfWidth + courtOutsideMarginX;
      const outsideCourtZ = Math.abs(ball.mesh.position.z - courtCenterZ) > courtHalfLength + courtOutsideMarginZ;
      const outsideTableEnvelope =
        Math.abs(ball.mesh.position.x - tableProfile.centerX) > tableHalfWidthForBounce + tableEnvelopeMarginX ||
        Math.abs(ball.mesh.position.z - tableProfile.centerZ) > tableHalfLengthForBounce + tableEnvelopeMarginZ;
      const outsideCourtImpactZone = (outsideCourtX || outsideCourtZ) && outsideTableEnvelope;
      const bounceCandidate =
        bounceEventCooldown <= 0 &&
        previousBallVelocityY < -0.45 * SCALE &&
        bounceVelocityY >= 0.08 * SCALE &&
        (nearTableImpactZone || nearGroundImpactZone || outsideCourtImpactZone);
      // Position-based "ball reached opponent's side after the toucher's hit".
      // Updated every frame so a soft bounce that the bounce-event detector
      // misses still counts as a valid return for rule arbitration.
      if (lastTouchPlayer !== null && !ballReachedOpponentSideSinceLastTouch) {
        const ballSideNow = sideFromZ(ball.mesh.position.z);
        const opponentOfToucher: CourtSide = lastTouchPlayer === 0 ? 1 : 0;
        if (ballSideNow === opponentOfToucher) {
          // Require the ball to be at or below table-top height to count —
          // mid-air crossings before the table bounce shouldn't qualify.
          const tableTopY = getTableBallContactY(ball.mesh.position.z);
          if (ball.mesh.position.y <= tableTopY + 0.45 * TABLE_SCALE) {
            ballReachedOpponentSideSinceLastTouch = true;
          }
        }
      }

      if (bounceCandidate) {
        bounceEventCooldown = 0.22;

        // In pure mode, unlock serve as soon as the serve lands legally on the
        // receiver's table side so airborne reception can start immediately.
        const bouncedOnTableNow = isTableSurfaceBounce(ball.mesh.position);
        const bounceSide = sideFromZ(ball.mesh.position.z);

        // Maradona super: the redirect happens only AFTER the ball bounces on
        // the opponent's (Howard, side 1) table — never before.  Snap to a fast
        // rebound that MIRRORS the ball's lateral direction (whichever way it was
        // drifting, it now cuts sharply to the opposite side) while still driving
        // forward (+Z) deeper into Howard's court so it double-bounces there
        // before he can read the sudden change of direction.
        if (maradonaCurveArmedBall && bouncedOnTableNow && bounceSide === 1 && lastTouchPlayer === 0) {
          maradonaCurveArmedBall = false;
          enableBallFire('maradona', 0.75);
          const v = physicsBody.getLinearVelocity();
          const horizNow = Math.sqrt(v.x * v.x + v.z * v.z);
          const speed = Math.max(7.0 * SCALE, horizNow * 1.25);
          // Opposite of the current lateral travel: drifting right (+x) → cut
          // left (−x), and vice-versa.  Forward bias keeps it in Howard's half.
          const lateralSign = v.x >= 0 ? -1 : 1;
          const dir = new Vector3(lateralSign * 1.2, 0, 1);
          dir.normalize();
          physicsBody.setLinearVelocity(new Vector3(
            dir.x * speed,
            Math.max(2.2 * SCALE, v.y * 0.85),
            dir.z * speed,
          ));
          currentVelocity = physicsBody.getLinearVelocity();
        }

        if (
          serveState.active &&
          serveState.phase === 'flight' &&
          bouncedOnTableNow &&
          bounceSide !== serveState.server
        ) {
          serveState.active = false;
          serveState.phase = 'ready';
          serveState.timer = 0;
        }

        if (!collisionDrill.enabled) {
          handleBounceRules();
        }
      }

      // Position-based fallback for off-court contacts (bleachers, walls, far
      // ground) whose impact didn't produce a clean vertical-velocity sign
      // flip — e.g. a glancing seat hit that just damps the ball.  The moment
      // the ball's XZ leaves the court envelope, treat it as an out and let
      // handleBounceRules award the point per the standard ruleset.  Fires
      // exactly once per rally thanks to ballOutOfCourtTriggered.
      const positionOutOfCourt = (outsideCourtX || outsideCourtZ) && outsideTableEnvelope;
      if (
        !ballOutOfCourtTriggered &&
        !collisionDrill.enabled &&
        matchManager.isMatchActive &&
        celebrationWindowTimer <= 0 &&
        (positionOutOfCourt || ballHitOutOfCourtGeometry) &&
        (lastTouchPlayer !== null || serveState.active)
      ) {
        ballOutOfCourtTriggered = true;
        ballHitOutOfCourtGeometry = false;
        handleBounceRules();
      }

      // Player 1 controls (WASD + Space) — routed through InputManager
      let p1MoveX = inputManager.getMoveX(0);
      let p1MoveZ = inputManager.getMoveZ(0);

      // Player 2 controls (Arrow Keys + Enter) — routed through InputManager
      let p2MoveX = inputManager.getMoveX(1);
      let p2MoveZ = inputManager.getMoveZ(1);

      const clampSideZ = (side: CourtSide, z: number): number => {
        if (side === 0) {
          return Math.max(-playerHalfCourtZ, Math.min(-minCourtSplitZ, z));
        }
        return Math.max(minCourtSplitZ, Math.min(playerHalfCourtZ, z));
      };

      const getAIDepthPlan = (side: CourtSide): { targetAbsZ: number; followWeight: number } => {
        const vel = physicsBody.getLinearVelocity();
        const ballSide = sideFromZ(ball.mesh.position.z);
        const myPhase = getPlannedPhase(side, ballSide);
        const opponent: CourtSide = side === 0 ? 1 : 0;
        const opponentPhase = getPlannedPhase(opponent, ballSide);

        if (myPhase === 'kick') {
          return { targetAbsZ: AI_FINAL_KICK_TARGET_Z, followWeight: 0.72 };
        }

        const horizontalSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
        const movingTowardMe = side === 0 ? vel.z < -0.04 * SCALE : vel.z > 0.04 * SCALE;
        const likelyShortIncoming =
          movingTowardMe &&
          horizontalSpeed < AI_LOW_SPEED_RETURN_THRESHOLD &&
          ball.mesh.position.y < 2.2 * SCALE;
        const opponentLikelySoftKick =
          ballSide === opponent &&
          opponentPhase === 'reception' &&
          horizontalSpeed < AI_LOW_SPEED_RETURN_THRESHOLD * 1.15;

        if (likelyShortIncoming || opponentLikelySoftKick) {
          return { targetAbsZ: AI_SHORT_RETURN_STEP_IN_Z, followWeight: 0.50 };
        }

        return { targetAbsZ: AI_BEHIND_SERVE_TARGET_Z, followWeight: 0.18 };
      };

      if (ENABLE_P1_AI && !collisionDrill.enabled) {
        const ballInCourt = isBallInsidePlayableCourtXZ(0.20 * SCALE);
        const receptionPlan = ballInCourt ? predictReceptionFallSnapshot(0, charRoot1.position) : null;
        const inKickPhase = !receptionPlan && ballInCourt &&
          getPlannedPhase(0, sideFromZ(ball.mesh.position.z)) === 'kick';
        const kickFootOffset = inKickPhase ? (ball.mesh.position.x >= 0 ? -1 : 1) * 0.62 * SCALE : 0;
        const targetX = receptionPlan
          ? receptionPlan.target.x
          : (ballInCourt
            ? Math.max(-playerHalfCourtX, Math.min(playerHalfCourtX, ball.mesh.position.x + kickFootOffset))
            : 0);
        const depthPlan = getAIDepthPlan(0);
        const depthAnchorZ = clampSideZ(0, -depthPlan.targetAbsZ);
        const trackedBallZ = clampSideZ(0, ball.mesh.position.z);
        const targetZ = receptionPlan
          ? receptionPlan.target.z
          : (ballInCourt
            ? depthAnchorZ + (trackedBallZ - depthAnchorZ) * depthPlan.followWeight
            : depthAnchorZ);
        const dx = targetX - charRoot1.position.x;
        const dz = targetZ - charRoot1.position.z;
        const dead = receptionPlan ? 0.10 * SCALE : 0.24 * SCALE;
        p1MoveX = Math.abs(dx) > dead ? Math.sign(dx) : 0;
        p1MoveZ = Math.abs(dz) > dead ? Math.sign(dz) : 0;
      }

      if (ENABLE_P2_AI && !collisionDrill.enabled) {
        const ballInCourt = isBallInsidePlayableCourtXZ(0.20 * SCALE);
        const receptionPlan = ballInCourt ? predictReceptionFallSnapshot(1, charRoot2.position) : null;
        const targetX = receptionPlan
          ? receptionPlan.target.x
          : (ballInCourt
            ? Math.max(-playerHalfCourtX, Math.min(playerHalfCourtX, ball.mesh.position.x))
            : 0);
        const depthPlan = getAIDepthPlan(1);
        const depthAnchorZ = clampSideZ(1, depthPlan.targetAbsZ);
        const trackedBallZ = clampSideZ(1, ball.mesh.position.z);
        const targetZ = receptionPlan
          ? receptionPlan.target.z
          : (ballInCourt
            ? depthAnchorZ + (trackedBallZ - depthAnchorZ) * depthPlan.followWeight
            : depthAnchorZ);
        const dx = targetX - charRoot2.position.x;
        const dz = targetZ - charRoot2.position.z;
        const dead = receptionPlan ? 0.10 * SCALE : 0.24 * SCALE;
        p2MoveX = Math.abs(dx) > dead ? Math.sign(dx) : 0;
        p2MoveZ = Math.abs(dz) > dead ? Math.sign(dz) : 0;
      }

      const p1TouchPhase = getPlannedPhase(0, sideFromZ(ball.mesh.position.z));
      const p2TouchPhase = getPlannedPhase(1, sideFromZ(ball.mesh.position.z));
      // Keep human receptions steerable so a slightly late or early animation
      // still has a chance to meet the ball instead of freezing in place.
      const p1ReceptionMovementLocked = false;
      const p2ReceptionMovementLocked = false;

      if (!collisionDrill.enabled) {
        // P1 is human-controlled — no automatic defense repositioning so the
        // player only moves when arrow keys are pressed.

      }

      const serveMovementLocked =
        serveState.active &&
        (serveState.phase === 'ready' || serveState.phase === 'toss' || (serveState.phase === 'strike' && !serveState.strikeApplied));

      if (serveMovementLocked && !collisionDrill.enabled) {
        p1MoveX = 0;
        p1MoveZ = 0;
        p2MoveX = 0;
        p2MoveZ = 0;

        // Keep deterministic facing/velocity after quick restart so the serve
        // contact window is sampled from a stable authored pose.
        if (serveState.phase === 'ready' && serveState.timer <= 1e-6) {
          p1Motion.vx = 0;
          p1Motion.vz = 0;
          p1Motion.facing = getCourtCenterFacing(charRoot1.position);
          p2Motion.vx = 0;
          p2Motion.vz = 0;
          p2Motion.facing = getCourtCenterFacing(charRoot2.position);
        }
      }

      // Lock P1 arrow-key movement while a reception or kick animation is playing.
      // The assist system already overrides movement during p1Assist.active (kick phase);
      // this covers the reception animation window (strikeState.timer set by tryGuaranteedReception).
      if (!collisionDrill.enabled && p1StrikeState.timer > 0) {
        p1MoveX = 0;
        p1MoveZ = 0;
      }

      if (!collisionDrill.enabled && p1ReceptionMovementLocked) {
        p1MoveX = 0;
        p1MoveZ = 0;
      }
      if (!collisionDrill.enabled && p2ReceptionMovementLocked) {
        p2MoveX = 0;
        p2MoveZ = 0;
      }

      const now = Date.now();
      postServeGraceTimer = Math.max(0, postServeGraceTimer - deltaTime);

      // Celebration / defeat window tick.  When this expires, bring the ball
      // back to the server's hand and kick off the pre-serve countdown that
      // resetBallForServe deferred.
      if (celebrationWindowTimer > 0) {
        celebrationWindowTimer = Math.max(0, celebrationWindowTimer - deltaTime);
        if (celebrationWindowTimer <= 0) {
          // Celebration ended — snap the ball from the floor (wherever it
          // settled during the clip) back into the server's hand so the next
          // serve can begin.
          if (serveState.active) {
            placeBallAtServeHand();
          }
          if (pendingPreServeCountdown) {
            pendingPreServeCountdown = false;
            preServeCountdownTimer = PRE_SERVE_COUNTDOWN_SECONDS;
            EventBus.emit('serve:countdown', PRE_SERVE_COUNTDOWN_SECONDS);
          }
        }
        // The ball is left under normal physics for the rest of the
        // celebration window — friction and damping settle it on the floor
        // (or wherever it last bounced) without any per-frame intervention.
      }

      // Pre-serve countdown tick.  While >0, gameplay actions are suppressed
      // (handled by serveSetupActive below) and the HUD shows the timer.
      if (preServeCountdownTimer > 0) {
        // Hold the very first countdown until the opening cinematic finishes, so
        // the fly-around plays before "3-2-1". cameraIntroDone latches true after
        // the first ~4s, so every later (post-point) countdown ticks normally.
        if (cameraIntroDone) {
          const prevCeil = Math.ceil(preServeCountdownTimer);
          preServeCountdownTimer = Math.max(0, preServeCountdownTimer - deltaTime);
          const nextCeil = Math.ceil(preServeCountdownTimer);
          if (nextCeil !== prevCeil) {
            EventBus.emit('serve:countdown', preServeCountdownTimer > 0 ? preServeCountdownTimer : null);
          }
          if (preServeCountdownTimer <= 0) {
            // Countdown finished — release the freeze so play can begin.
            pointFreezeActive = false;
            pointFreezeWinner = null;
            EventBus.emit('serve:countdown', null);
          }
        }
        // Hold ball at the serve anchor while the countdown is visible so it
        // never drifts under gravity (also keeps it pinned during the cinematic).
        if (ball?.mesh?.physicsBody && serveState.active) {
          ball.mesh.physicsBody.setLinearVelocity(Vector3.Zero());
          ball.mesh.physicsBody.setAngularVelocity(Vector3.Zero());
        }
      }

      // Suppress all action triggers while the freeze is active OR the
      // pre-serve countdown is running OR a celebration is playing.  The
      // existing serveSetupActive flag is checked by triggerAction /
      // processRequestedAction / queueAutoAction.
      let serveSetupActive =
        serveState.active ||
        postServeGraceTimer > 0 ||
        preServeCountdownTimer > 0 ||
        celebrationWindowTimer > 0 ||
        pointFreezeActive;

      if (collisionDrill.enabled) {
        serveState.active = false;
        serveSetupActive = false;

        collisionDrill.tossCooldown = Math.max(0, collisionDrill.tossCooldown - deltaTime);
        if (collisionDrillForceToss || (!collisionDrill.activeFlight && collisionDrill.tossCooldown <= 0.001)) {
          launchCollisionDrillToss();
          collisionDrillForceToss = false;
        }

        if (collisionDrill.activeFlight) {
          collisionDrill.timeToImpact -= deltaTime;
          const tRemaining = Math.max(0, collisionDrill.timeToImpact);
          const vNow = physicsBody.getLinearVelocity();
          const predictedBallPos = new Vector3(
            ball.mesh.position.x + vNow.x * tRemaining,
            ball.mesh.position.y + vNow.y * tRemaining - 0.5 * gravityAbs * tRemaining * tRemaining,
            ball.mesh.position.z + vNow.z * tRemaining,
          );

          const strikerSide = collisionDrill.side;
          const strikerRoot = strikerSide === 0 ? charRoot1 : charRoot2;

          const strikerFlatDist = Vector3.Distance(
            new Vector3(ball.mesh.position.x, 0, ball.mesh.position.z),
            new Vector3(strikerRoot.position.x, 0, strikerRoot.position.z),
          );
          if (strikerFlatDist > 4.8 * SCALE) {
            collisionDrill.activeFlight = false;
            collisionDrill.actionQueued = false;
            collisionDrill.tossCooldown = 0.06;
            collisionDrillForceToss = true;
          }

          const profile = getActionAssistProfile(collisionDrill.action);
          const towardTable = strikerSide === 0 ? 1 : -1;
          const minZ = strikerSide === 0 ? -playerHalfCourtZ : minCourtSplitZ;
          const maxZ = strikerSide === 0 ? -minCourtSplitZ : playerHalfCourtZ;

          const desiredX = Math.max(-playerHalfCourtX, Math.min(playerHalfCourtX, predictedBallPos.x));
          const desiredZ = Math.max(
            minZ,
            Math.min(maxZ, predictedBallPos.z - towardTable * Math.max(0.28 * SCALE, profile.depth * 0.9)),
          );

          const dx = desiredX - strikerRoot.position.x;
          const dz = desiredZ - strikerRoot.position.z;
          const rawMoveX = Math.max(-1, Math.min(1, dx / (0.45 * SCALE)));
          const rawMoveZ = Math.max(-1, Math.min(1, dz / (0.45 * SCALE)));

          const manualMoveX = strikerSide === 0 ? p1MoveX : p2MoveX;
          const manualMoveZ = strikerSide === 0 ? p1MoveZ : p2MoveZ;
          const manualInput = Math.sqrt(manualMoveX * manualMoveX + manualMoveZ * manualMoveZ);

          const assistDeadzone = 0.18;
          const targetAssistX = Math.abs(rawMoveX) < assistDeadzone ? 0 : rawMoveX;
          const targetAssistZ = Math.abs(rawMoveZ) < assistDeadzone ? 0 : rawMoveZ;
          if (manualInput > 0.05) {
            const assistBlend = 0.14;
            collisionDrillAssistMoveX += (targetAssistX - collisionDrillAssistMoveX) * assistBlend;
            collisionDrillAssistMoveZ += (targetAssistZ - collisionDrillAssistMoveZ) * assistBlend;
            if (Math.abs(collisionDrillAssistMoveX) < 0.035) collisionDrillAssistMoveX = 0;
            if (Math.abs(collisionDrillAssistMoveZ) < 0.035) collisionDrillAssistMoveZ = 0;
          } else {
            collisionDrillAssistMoveX = 0;
            collisionDrillAssistMoveZ = 0;
          }

          const mergedMoveX = manualInput > 0.05
            ? Math.max(-1, Math.min(1, manualMoveX * 0.78 + collisionDrillAssistMoveX * 0.36))
            : 0;
          const mergedMoveZ = manualInput > 0.05
            ? Math.max(-1, Math.min(1, manualMoveZ * 0.78 + collisionDrillAssistMoveZ * 0.36))
            : 0;

          if (strikerSide === 0) {
            p1MoveX = mergedMoveX;
            p1MoveZ = mergedMoveZ;
            p2MoveX = 0;
            p2MoveZ = 0;
          } else {
            p2MoveX = mergedMoveX;
            p2MoveZ = mergedMoveZ;
            p1MoveX = 0;
            p1MoveZ = 0;
          }

          if (!collisionDrill.actionQueued && tRemaining <= profile.impactTime + 0.08) {
            const request = strikerSide === 0 ? p1Request : p2Request;
            request.action = collisionDrill.action;
            request.ttl = Math.max(request.ttl, actionRequestTtl);
            collisionDrill.actionQueued = true;
          }

          const flightDone =
            collisionDrill.timeToImpact < -0.35 ||
            (ball.mesh.position.y < 0.35 * SCALE && physicsBody.getLinearVelocity().y <= 0);
          if (flightDone) {
            collisionDrill.activeFlight = false;
            collisionDrill.actionQueued = false;
            collisionDrill.tossCooldown = 0.58;
          }
        }
      }

      if (serveState.active && serveState.phase === 'ready' && pointResultAnimationsActive === 0) {
        // Block the serve trigger entirely while the pre-serve countdown is on
        // screen so the ball stays at the toss anchor for the full 3 seconds.
        const serveCanStart = serveState.timer >= SERVE_READY_PAUSE_SECONDS
          && preServeCountdownTimer <= 0
          && !pointFreezeActive;
        const p1ServeTrigger = serveCanStart && serveState.server === 0 && (ENABLE_P1_AI || inputManager.isServeDown(0));
        const p2ServeTrigger = serveCanStart && serveState.server === 1 && (ENABLE_P2_AI || inputManager.isServeDown(1));
        if (p1ServeTrigger || p2ServeTrigger) {
          serveState.phase = 'toss';
          serveState.timer = 0;
          serveState.tossReleased = false;
          serveState.strikeApplied = false;
          serveState.animationStarted = true;
          const servingCharacter = serveState.server === 0 ? player1 : player2;
          const { animKey: serveAnimKey } = serveTypeToProps(serveState.serveType);
          servingCharacter?.playAnimation(serveAnimKey, false);
          // Lock setMovement for the full clip duration so the kick follow-through
          // can play even if the physics strike window expires before that frame.
          {
            const serveCfg = getAnimConfigForClip(serveAnimKey);
            const clipFrames = Math.max(30, serveCfg?.clipLengthFrames ?? 57);
            const animDuration = clipFrames / ANIM_CONFIG_FPS;
            if (serveState.server === 0) p1ServeAnimLockTimer = animDuration;
            else                         p2ServeAnimLockTimer = animDuration;
          }
        }
      }

      const tryLiftBall = (playerPos: Vector3): void => {
        const toBall = ball.mesh.position.subtract(playerPos);
        const horizontal = Math.sqrt(toBall.x ** 2 + toBall.z ** 2);
        if (horizontal > setupLiftRange) return;

        const vel = physicsBody.getLinearVelocity();
        const targetY = Math.max(setupLiftMinY, ball.mesh.position.y + 1.2 * SCALE);
        const lift = Math.max(setupLiftVelocity, (targetY - ball.mesh.position.y) * 3.8);
        physicsBody.setLinearVelocity(new Vector3(vel.x * 0.55, lift, vel.z * 0.55));
      };

      if (ENABLE_P1_AI && !collisionDrill.enabled && !serveSetupActive && inputManager.isServeDown(0) && now - lastP1LiftPress > setupLiftCooldown) {
        tryLiftBall(charRoot1.position);
        lastP1LiftPress = now;
      }
      if (!collisionDrill.enabled && !serveSetupActive && inputManager.isServeDown(1) && now - lastP2LiftPress > setupLiftCooldown) {
        tryLiftBall(charRoot2.position);
        lastP2LiftPress = now;
      }

      const queueInferredKickRequest = (player: CourtSide, request: ActionRequestState): void => {
        const playerCharacter = player === 0 ? player1 : player2;
        const playerStrikeState = player === 0 ? p1StrikeState : p2StrikeState;
        if (playerCharacter?.isInStrike() || (playerStrikeState.action !== null && playerStrikeState.timer > 0)) {
          return;
        }

        const playerPos = player === 0 ? charRoot1.position : charRoot2.position;
        const opponentPos = player === 0 ? charRoot2.position : charRoot1.position;
        const plan = planInferredAction(player, playerPos, opponentPos);
        if (plan.phase === 'defense' || !plan.reachable) {
          return;
        }
        // Allow kick after at least 1 reception touch (no preparation phase)
        if (plan.effectivePhase === 'kick' && (touchesByPlayer[player] < 1 || !canKickAfterReceptionByPlayer[player])) {
          return;
        }

        const aiControlled = player === 0 ? ENABLE_P1_AI : ENABLE_P2_AI;
        const aiDecision = chooseAiActionDecision(plan.effectivePhase, plan.ballBand, plan.action, playerPos, opponentPos);

        request.action = plan.action;
        request.ttl = aiControlled ? aiDecision.ttl : actionRequestTtl;
        requestPowerByPlayer[player] = aiControlled
          ? aiDecision.powerMult
          : (player === 0 ? requestPowerByPlayer[0] : 1);

        // Double-tap override: force foot kick on closest-foot side
        if (player === 0 && p1ForcedKickAction !== null) {
          request.action = p1ForcedKickAction;
          p1ForcedKickAction = null;
        }
      };

      const triggerAction = (
        character: Character | undefined,
        root: { position: Vector3; rotation: Vector3 },
        motion: { vx: number; vz: number; facing: number },
        minZ: number,
        maxZ: number,
        assist: AssistState,
        strikeState: { action: OffensiveAction | null; timer: number },
        action: OffensiveAction,
      ): void => {
        if (!character) return;

        const profile = getActionAssistProfile(action);
        const animConfig = getAnimConfigForAction(action);
        const strikeTiming = resolveStrikeTiming(profile, animConfig);
        const strikeDuration = strikeTiming.strikeDuration;
        const contactLead = Math.max(0.06, Math.min(0.55, strikeDuration - strikeTiming.impactTime));
        const configuredReach = resolveAnimReachUnits(animConfig, profile.startRange / SCALE) * SCALE;
        const maxReach = Math.max(
          profile.startRange * 0.72,
          Math.min(profile.startRange * 1.28, configuredReach),
        );

        const launchVel = physicsBody.getLinearVelocity();
        const predictedContactBall = new Vector3(
          ball.mesh.position.x + launchVel.x * contactLead,
          ball.mesh.position.y + launchVel.y * contactLead - 0.5 * gravityAbs * contactLead * contactLead,
          ball.mesh.position.z + launchVel.z * contactLead,
        );

        const toBall = predictedContactBall.subtract(root.position);
        const flatToBall = new Vector3(toBall.x, 0, toBall.z);
        const distance = flatToBall.length();
        if (distance > maxReach + 0.75 * SCALE || distance < 0.05) return;

        const towardBall = flatToBall.normalize();
        const right = new Vector3(towardBall.z, 0, -towardBall.x);
        const playerRight = new Vector3(Math.cos(motion.facing), 0, -Math.sin(motion.facing));
        const sideDot = Vector3.Dot(towardBall, playerRight);
        const sideSign = sideDot >= 0 ? 1 : -1;

        const depth = profile.depth;
        const lateral = sideSign * profile.lateral;
        const target = predictedContactBall
          .subtract(towardBall.scale(depth))
          .add(right.scale(lateral));

        // Choose mirrored symmetric clip side from a short lead prediction so
        // the closest socket/foot is selected before exact overlap happens.
        const mirrorLead = Math.max(0.06, Math.min(0.20, profile.impactTime * 0.7 + actionMirrorLeadTime * 0.2));
        const incomingVel = physicsBody.getLinearVelocity();
        const predictedBallForMirror = ball.mesh.position.add(incomingVel.scale(mirrorLead));
        const mirrorHint = isLimbReceptionAction(action)
          ? predictedBallForMirror
          : predictedContactBall;

        // Compute ball arrival time and derive animation speed ratio for sync
        let syncedSpeedRatio: number | undefined;
        if (animConfig && animConfig.contactFrame > 0) {
          const ballNow = ball.mesh.position.clone();
          const ballVelNow = physicsBody.getLinearVelocity().clone();
          const contactH = root.position.y + (profile.fallbackY ?? 1.0);
          const arrivalPrediction = BallPredictor.ballAtArrival(ballNow, ballVelNow, contactH, gravityAbs);
          const arrivalTime = arrivalPrediction.timeSeconds;
          if (arrivalTime > 0.05) {
            const naturalDuration = animConfig.contactFrame / ANIM_CONFIG_FPS;
            const rawRatio = naturalDuration / arrivalTime;
            // Upper clamp raised to 6.0 so a fast-falling ball (post-reception
            // descent at ~5–6 m/s) can still sync its arrival with the animation
            // contact frame instead of clamping early and firing impact after
            // the ball has fallen past the strike bone.
            syncedSpeedRatio = Math.max(0.75, Math.min(6.0, rawRatio));
          }
        }

        if (!character.performAirAction(action, mirrorHint, false, syncedSpeedRatio)) return;

        assist.active = true;
        assist.followPlayer = true;
        assist.action = action;
        assist.timer = strikeTiming.strikeDuration;
        assist.impactTime = strikeTiming.impactTime;

        // Sync the impact time to match the ball arrival so ball-snap fires correctly
        if (syncedSpeedRatio !== undefined && animConfig && animConfig.contactFrame > 0) {
          const syncedContactSeconds = (animConfig.contactFrame / ANIM_CONFIG_FPS) / syncedSpeedRatio;
          assist.impactTime = syncedContactSeconds;
          assist.timer = Math.max(assist.timer, syncedContactSeconds + 0.35);
        }
        assist.hitApplied = false;
        assist.targetX = Math.max(-playerHalfCourtX, Math.min(playerHalfCourtX, target.x));
        assist.targetZ = Math.max(minZ, Math.min(maxZ, target.z));

        motion.vx = 0;
        motion.vz = 0;

        // Always face the table center — lateral facing caused 90° spin-aways.
        const targetFacing = getCourtCenterFacing(root.position);

        // Keep the player oriented for the action: center-facing for strikes,
        // lateral-facing for inner-foot reception/prep.
        motion.facing = targetFacing;
        root.rotation.y = motion.facing + PLAYER_MODEL_YAW_OFFSET + (character?.getMirrorFacingCompensationYaw() ?? 0) + (character?.getAnimationFacingCompensationYaw() ?? 0);
        strikeState.action = action;
        // Add impactWindowGrace so the impact window opens exactly at the
        // animation's contactFrame.  Without this, inImpactWindow becomes
        // true `grace` seconds early, snapping the ball to whichever bone
        // position is reached at strikeDuration-(impactTime+grace) — which
        // for foot kicks is still mid-windup (low Y, near the ground).
        strikeState.timer = strikeTiming.strikeDuration + impactWindowGrace;
        // Align strikeState.timer with the synced contact frame so the impact window
        // opens exactly when the ball reaches the strike bone.
        //
        // The impact window opens when:
        //   strikeState.timer <= assist.impactTime + impactWindowGrace
        //   = syncedContactSeconds + impactWindowGrace
        //
        // For the window to open at elapsed = syncedContactSeconds (= arrivalTime):
        //   strikeState.timer_start - syncedContactSeconds = syncedContactSeconds + impactWindowGrace
        //   ↔ strikeState.timer_start = 2 * syncedContactSeconds + impactWindowGrace
        //
        // Without this, a fast-playing animation (high rawRatio, e.g. after a
        // reception pop-up) would have its window open AFTER ball arrival, causing
        // the kick impulse to fire once the ball has already fallen past the bone.
        if (syncedSpeedRatio !== undefined && animConfig && animConfig.contactFrame > 0) {
          const sc = (animConfig.contactFrame / ANIM_CONFIG_FPS) / syncedSpeedRatio;
          strikeState.timer = 2.0 * sc + impactWindowGrace;
        }
      };

      const chooseVicinityReceptionAction = (
        playerSide: CourtSide,
        rootPos: Vector3,
        facing: number,
      ): OffensiveAction => {
        if (shouldForceKneeReception(playerSide, ball.mesh.position.y)) {
          return 'receptionInnerRight';
        }

        const toBall = ball.mesh.position.subtract(rootPos);
        const flatToBall = new Vector3(toBall.x, 0, toBall.z);
        const defaultAction = chooseReceptionActionBySocketHeight(playerSide, ball.mesh.position.y).action;
        if (flatToBall.lengthSquared() <= 1e-6) {
          return defaultAction;
        }

        const towardBall = flatToBall.normalize();
        const right = new Vector3(towardBall.z, 0, -towardBall.x);
        const playerRight = new Vector3(Math.cos(facing), 0, -Math.sin(facing));
        const sideSign = Vector3.Dot(towardBall, playerRight) >= 0 ? 1 : -1;

        let bestAction = defaultAction;
        let bestScore = Number.POSITIVE_INFINITY;

        for (const action of receptionActionCandidates) {
          const profile = getActionAssistProfile(action);
          if (
            ball.mesh.position.y < profile.minHeight - 0.22 * SCALE * BALL_SIZE_SCALE ||
            ball.mesh.position.y > profile.maxHeight + 0.22 * SCALE * BALL_SIZE_SCALE
          ) {
            continue;
          }

          const depth = profile.depth;
          const lateral = sideSign * profile.lateral;
          const socketTarget = ball.mesh.position
            .subtract(towardBall.scale(depth))
            .add(right.scale(lateral));
          const moveDist = Vector3.Distance(
            new Vector3(rootPos.x, 0, rootPos.z),
            new Vector3(socketTarget.x, 0, socketTarget.z),
          );
          const socketHeight = getReceptionSocketHeight(playerSide, action);
          const heightError = Math.abs(socketHeight - ball.mesh.position.y);
          const score = heightError * 1.10 + moveDist * 0.45;

          if (score < bestScore) {
            bestScore = score;
            bestAction = action;
          }
        }

        return bestAction;
      };

      const tryGuaranteedReception = (
        playerSide: CourtSide,
        request: ActionRequestState,
        character: Character | undefined,
        root: { position: Vector3; rotation: Vector3 },
        motion: { vx: number; vz: number; facing: number },
        minZ: number,
        maxZ: number,
        assist: AssistState,
        strikeState: { action: OffensiveAction | null; timer: number },
      ): void => {
        if (!character || collisionDrill.enabled) return;
        // Unstoppable super kick: the opponent (side 1) cannot receive it.
        if (playerSide === 1 && superKickInFlight) return;
        // Only block reception if THIS player is actively serving (toss/strike phases).
        // postServeGraceTimer (1.4 s) must NOT block the receiver — the serve ball
        // arrives during that window and the receiver needs to handle it immediately.
        if (serveState.active && serveState.server === playerSide && serveState.phase !== 'flight') return;
        if (assist.active || character.isInStrike() || (strikeState.action !== null && strikeState.timer > 0)) return;
        if (!isBallInsidePlayableCourtXZ(0.28 * SCALE)) return;

        // Ball must be on this player's side
        const ballSide = sideFromZ(ball.mesh.position.z);
        if (ballSide !== playerSide) return;

        // Phase check: only in reception phase (kick phase means we already received)
        const currentPhase = getPlannedPhase(playerSide, ballSide);
        if (currentPhase === 'kick') return;

        // Ball must be airborne but within receivable height range
        const ballY = ball.mesh.position.y;
        const minBallY = ballRadius + 0.08 * SCALE;
        const maxBallY = 3.5 * SCALE;
        if (ballY < minBallY || ballY > maxBallY) return;

        // Choose action first so proximity gate can use its reach
        const action = chooseVicinityReceptionAction(playerSide, root.position, motion.facing);
        const rcvAnimConfig = getAnimConfigForAction(action);

        const rcvProfile = getActionAssistProfile(action);

        // ── Sync animation speed to ball arrival time ────────────────────────────
        // We want the animation contact frame to fire just as the ball reaches the
        // player, so adjust playback speed to match ball arrival time.
        let syncedSpeedRatio = actionAnimationSpeedRatio;
        const ballVelNow = physicsBody.getLinearVelocity().clone();
        if (rcvAnimConfig && rcvAnimConfig.contactFrame > 0) {
          const contactH = root.position.y + (rcvProfile.fallbackY ?? 0.9 * SCALE * PLAYER_SIZE_SCALE);
          const arrivalPrediction = BallPredictor.ballAtArrival(
            ball.mesh.position.clone(), ballVelNow, contactH, gravityAbs,
          );
          const arrivalTime = arrivalPrediction.timeSeconds;
          if (arrivalTime > 0.05) {
            const naturalDuration = rcvAnimConfig.contactFrame / ANIM_CONFIG_FPS;
            syncedSpeedRatio = Math.max(0.65, Math.min(2.2, naturalDuration / arrivalTime));
          }
        }

        // ── Predict ball position at the contact frame ───────────────────────────
        // Start the animation when the ball will be within reach at contact time.
        const contactFrameSecs = rcvAnimConfig && rcvAnimConfig.contactFrame > 0
          ? rcvAnimConfig.contactFrame / ANIM_CONFIG_FPS / syncedSpeedRatio
          : 0.30;
        const predictedBall = new Vector3(
          ball.mesh.position.x + ballVelNow.x * contactFrameSecs,
          ball.mesh.position.y + ballVelNow.y * contactFrameSecs - 0.5 * gravityAbs * contactFrameSecs * contactFrameSecs,
          ball.mesh.position.z + ballVelNow.z * contactFrameSecs,
        );
        // Generous trigger range — the ball will travel toward the player while the
        // animation winds up, and the assist system fine-tunes player position.
        const receptionTriggerRange = (rcvAnimConfig ? rcvAnimConfig.reach * SCALE : 1.2 * SCALE) * 1.55;
        const predictedFlatDist = Vector3.Distance(
          new Vector3(root.position.x, 0, root.position.z),
          new Vector3(predictedBall.x, 0, predictedBall.z),
        );
        const currentFlatDist = Vector3.Distance(
          new Vector3(root.position.x, 0, root.position.z),
          new Vector3(ball.mesh.position.x, 0, ball.mesh.position.z),
        );
        // Accept when predicted arrival is in reach, or ball is already very close.
        if (predictedFlatDist > receptionTriggerRange && currentFlatDist > receptionTriggerRange * 0.55) return;

        // ── Start the reception animation ────────────────────────────────────────
        // The ball pop-up fires at the contact frame via applyPlayerBallInfluence.
        if (!character.performAirAction(action, ball.mesh.position, false, syncedSpeedRatio)) return;

        const strikeTiming = resolveStrikeTiming(rcvProfile, rcvAnimConfig);
        let rcvImpactTime = strikeTiming.impactTime;
        let rcvStrikeDuration = strikeTiming.strikeDuration;
        if (rcvAnimConfig && rcvAnimConfig.contactFrame > 0) {
          const syncedContactSeconds = (rcvAnimConfig.contactFrame / ANIM_CONFIG_FPS) / syncedSpeedRatio;
          rcvImpactTime = syncedContactSeconds;
          rcvStrikeDuration = Math.max(rcvStrikeDuration, syncedContactSeconds + 0.35);
        }

        strikeState.action = action;
        strikeState.timer = rcvStrikeDuration;

        assist.active = true;
        assist.followPlayer = true;
        assist.action = action;
        assist.timer = rcvStrikeDuration;
        assist.impactTime = rcvImpactTime;
        assist.hitApplied = false;
        assist.targetX = root.position.x;
        assist.targetZ = root.position.z;

        // Human-controlled reception should stay in place; only the ball contact
        // assist remains active so the strike still fires on time.
        const shouldFollowPlayer = playerSide === 0 ? ENABLE_P1_AI : ENABLE_P2_AI;
        assist.followPlayer = shouldFollowPlayer;

        // Face the table
        const targetFacing = getCourtCenterFacing(root.position);
        motion.facing = targetFacing;
        root.rotation.y = motion.facing + PLAYER_MODEL_YAW_OFFSET
          + (character.getMirrorFacingCompensationYaw() ?? 0)
          + (character.getAnimationFacingCompensationYaw() ?? 0);
        motion.vx = 0;
        motion.vz = 0;

        // Clear any pending queued action
        request.action = null;
        request.ttl = 0;
      };

      const tryVicinityInterception = (
        playerSide: CourtSide,
        request: ActionRequestState,
        character: Character | undefined,
        root: { position: Vector3; rotation: Vector3 },
        motion: { vx: number; vz: number; facing: number },
        minZ: number,
        maxZ: number,
        assist: AssistState,
        strikeState: { action: OffensiveAction | null; timer: number },
      ): void => {
        if (!character || serveSetupActive || collisionDrill.enabled) return;
        if (assist.active || character.isInStrike() || (strikeState.action !== null && strikeState.timer > 0)) return;
        if (!isBallInsidePlayableCourtXZ(0.28 * SCALE)) return;

        if (ball.mesh.position.y <= ballRadius + vicinityInterceptionAirMinY) return;
        if (ball.mesh.position.y >= vicinityInterceptionHeightMax) return;

        const flatDist = Vector3.Distance(
          new Vector3(root.position.x, 0, root.position.z),
          new Vector3(ball.mesh.position.x, 0, ball.mesh.position.z),
        );
        if (flatDist > vicinityInterceptionRange) return;

        const action = chooseVicinityReceptionAction(playerSide, root.position, motion.facing);
        triggerAction(character, root, motion, minZ, maxZ, assist, strikeState, action);

        if (assist.active) {
          request.action = null;
          request.ttl = 0;
          requestPowerByPlayer[playerSide] = 1;
        }
      };

      const p1KickPressed = ENABLE_P1_AI ? pressedKeys.has('q') : inputManager.isKickDown(0);

      if (ENABLE_P1_AI) {
        // AI proximity-based trigger
        if (!collisionDrill.enabled && !serveSetupActive && now - lastP1ActionPress > actionPressCooldown) {
          const toBall1 = ball.mesh.position.subtract(charRoot1.position);
          const dist1 = Math.sqrt(toBall1.x * toBall1.x + toBall1.z * toBall1.z);
          const vy1 = physicsBody.getLinearVelocity().y;
          if (dist1 <= 2.15 * SCALE && vy1 < -0.15 * SCALE && ball.mesh.position.y >= 0.85 * SCALE) {
            queueInferredKickRequest(0, p1Request);
            lastP1ActionPress = now;
          }
        }
      } else {
        // Human P1 — single tap = medium power, double tap = high power
        if (!collisionDrill.enabled && !serveSetupActive) {
          const p1Phase = getPlannedPhase(0, sideFromZ(ball.mesh.position.z));

          // Track grace period for kick phase (keep for UX awareness, but no longer auto-fires)
          if (p1Phase === 'kick' && p1KickGraceStart < 0) {
            p1KickGraceStart = now;
          } else if (p1Phase !== 'kick') {
            p1KickGraceStart = -1;
          }

          // Superpower: a single F press is enough.  Once armed, auto-fire the
          // kick the moment P1 is able to kick — no separate kick-key press
          // required (fires immediately if already kickable, otherwise as soon
          // as the auto-reception completes).
          if (p1SuperArmed &&
              p1SuperAvailable &&
              p1Phase === 'kick' &&
              canKickAfterReceptionByPlayer[0] &&
              !p1Assist.active &&
              !player1?.isInStrike() &&
              now - lastP1ActionPress > actionPressCooldown) {
            requestPowerByPlayer[0] = 1.00;
            p1KickAim.x = 0;
            p1KickAim.z = 1;
            queueInferredKickRequest(0, p1Request);
            lastP1ActionPress = now;
            p1KickGraceStart = -1;
          }

          // Rising edge: instant tap decision
          if (p1KickPressed && !p1KickButtonHeld) {
            // Only kick after reception (kick phase), not before
            if (p1Phase === 'kick' &&
                canKickAfterReceptionByPlayer[0] &&
                !p1Assist.active &&
                now - lastP1ActionPress > actionPressCooldown) {

              const isDoubleTap = now - lastP1KickButtonPress <= DOUBLE_TAP_WINDOW_MS;
              if (isDoubleTap) {
                requestPowerByPlayer[0] = 1.45;  // double tap → high power
                // Force a foot kick ONLY when the ball is actually in foot range.
                // Forcing a fixed (high) foot action on a low or still-falling
                // ball made the kick's contact frame fire too late, so the ball
                // dropped to the floor and smashed before the kick launched.  For
                // out-of-foot-range balls we keep the power boost but let the
                // planner pick a height-appropriate action (chest / head).
                const dtBand = getHeightBand(ball.mesh.position.y);
                if (player1 && (dtBand === 'mid' || dtBand === 'high')) {
                  if (dtBand === 'mid') {
                    p1ForcedKickAction = 'kickCloseRightFoot';
                  } else {
                    // High ball: choose foot side by whichever foot is closest.
                    const leftFootPos  = player1.getFootControlPosition('left');
                    const rightFootPos = player1.getFootControlPosition('right');
                    const leftDist  = Vector3.Distance(leftFootPos,  ball.mesh.position);
                    const rightDist = Vector3.Distance(rightFootPos, ball.mesh.position);
                    p1ForcedKickAction = rightDist <= leftDist ? 'kickSoleRight' : 'kickHighLeft';
                  }
                }
                if (p1Phase === 'kick') pendingKickPowerBoost[0] = true;
              } else {
                requestPowerByPlayer[0] = 1.00;  // single tap → medium power
              }
              p1KickAim.x = inputManager.getMoveX(0);
              p1KickAim.z = 1;
              lastP1KickButtonPress = now;
              queueInferredKickRequest(0, p1Request);
              lastP1ActionPress = now;
              p1KickGraceStart = -1;
            } else if (!p1Assist.active &&
                       p1Phase === 'kick' &&
                       now - lastP1ActionPress <= actionPressCooldown) {
              // Just record the tap timestamp for double-tap detection even on cooldown
              lastP1KickButtonPress = now;
            }
          }
        }
      }
      p1KickButtonHeld = p1KickPressed;

      // Power meter charge indicator removed (HUD is now EventBus-driven via UIManager)

      // P2 AI: auto-reception via tryGuaranteedReception; kick via queueInferredKickRequest.
      // queueAutoAction guards touchesByPlayer >= 1 (no preparation phase).
      if (!collisionDrill.enabled && !serveSetupActive && now - lastP2ActionPress > actionPressCooldown) {
        if (ENABLE_P2_AI) {
          const toBall2 = ball.mesh.position.subtract(charRoot2.position);
          const dist2 = Math.sqrt(toBall2.x * toBall2.x + toBall2.z * toBall2.z);
          const vy2 = physicsBody.getLinearVelocity().y;
          if (dist2 <= 2.15 * SCALE && vy2 < -0.15 * SCALE && ball.mesh.position.y >= 0.85 * SCALE) {
            // ~30% chance to charge a power kick instead of a normal one — only
            // in the kick phase so receptions aren't accidentally boosted.
            if (canKickAfterReceptionByPlayer[1] &&
                getPlannedPhase(1, sideFromZ(ball.mesh.position.z)) === 'kick' &&
                Math.random() < 0.30) {
              pendingKickPowerBoost[1] = true;
              requestPowerByPlayer[1] = 1.45;
            }
            queueInferredKickRequest(1, p2Request);
            lastP2ActionPress = now;
          }
        }
      }

      const p2KickPressed = inputManager.isKickDown(1);
      if (!collisionDrill.enabled && !ENABLE_P2_AI && !serveSetupActive && p2KickPressed && !p2KickButtonHeld && now - lastP2ActionPress > actionPressCooldown && canKickAfterReceptionByPlayer[1]) {
        const phase = getPlannedPhase(1, sideFromZ(ball.mesh.position.z));
        const isDoubleTap = now - lastP2KickButtonPress <= DOUBLE_TAP_WINDOW_MS;
        if (isDoubleTap && phase === 'kick') pendingKickPowerBoost[1] = true;
        lastP2KickButtonPress = now;
        queueInferredKickRequest(1, p2Request);
        lastP2ActionPress = now;
      }
      p2KickButtonHeld = p2KickPressed;

      // Arcade autopilot: if player didn't provide an action input, pick one from
      // touch phase + box classification to keep rallies flowing predictably.
      // For human P1, reception is handled by tryGuaranteedReception; kick is manual.
      if (!collisionDrill.enabled) {
        if (ENABLE_P1_AI) {
          queueAutoAction(0, p1Request, p1Assist, player1, p1StrikeState, charRoot1.position, charRoot2.position, serveSetupActive);
        }
        queueAutoAction(1, p2Request, p2Assist, player2, p2StrikeState, charRoot2.position, charRoot1.position, serveSetupActive);
      }

      if (!collisionDrill.enabled && !serveSetupActive) {
        tryGuaranteedReception(
          0,
          p1Request,
          player1,
          charRoot1,
          p1Motion,
          -playerHalfCourtZ,
          -minCourtSplitZ,
          p1Assist,
          p1StrikeState,
        );
        tryGuaranteedReception(
          1,
          p2Request,
          player2,
          charRoot2,
          p2Motion,
          minCourtSplitZ,
          playerHalfCourtZ,
          p2Assist,
          p2StrikeState,
        );
      }

      const updatePlayer = (
        character: Character | undefined,
        root: { position: Vector3; rotation: Vector3 },
        moveX: number,
        moveZ: number,
        capsule: { position: Vector3 } | null,
        motion: { vx: number; vz: number; facing: number },
        assist: AssistState,
        minZ: number,
        maxZ: number,
        isAi = false,
      ): void => {
        if (assist.active) {
          assist.timer = Math.max(0, assist.timer - deltaTime);
          const activeAssistAction = assist.action;

          if (assist.followPlayer) {
            const prevX = root.position.x;
            const prevZ = root.position.z;

            // Recompute assisted strike target every frame so player follows the
            // falling ball trajectory instead of aiming at a stale position.
            if (activeAssistAction) {
              const profile = getActionAssistProfile(activeAssistAction);
              const toBallNow = ball.mesh.position.subtract(root.position);
              const flatToBallNow = new Vector3(toBallNow.x, 0, toBallNow.z);
              if (flatToBallNow.length() > 0.05) {
                const towardBallNow = flatToBallNow.normalize();
                const rightNow = new Vector3(towardBallNow.z, 0, -towardBallNow.x);
                const playerRightNow = new Vector3(Math.cos(motion.facing), 0, -Math.sin(motion.facing));
                const sideDotNow = Vector3.Dot(towardBallNow, playerRightNow);
                const sideSignNow = sideDotNow >= 0 ? 1 : -1;
                const depthNow = profile.depth;
                const lateralNow = sideSignNow * profile.lateral;
                const dynamicTarget = ball.mesh.position
                  .subtract(towardBallNow.scale(depthNow))
                  .add(rightNow.scale(lateralNow));
                assist.targetX = Math.max(-playerHalfCourtX, Math.min(playerHalfCourtX, dynamicTarget.x));
                assist.targetZ = Math.max(minZ, Math.min(maxZ, dynamicTarget.z));
              }
            }

            const dx = assist.targetX - root.position.x;
            const dz = assist.targetZ - root.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            if (dist > 1e-4) {
              const step = Math.min(dist, actionAssistRepositionSpeed * deltaTime);
              root.position.x += (dx / dist) * step;
              root.position.z += (dz / dist) * step;
            }

            root.position.x = Math.max(-playerHalfCourtX, Math.min(playerHalfCourtX, root.position.x));
            root.position.z = Math.max(minZ, Math.min(maxZ, root.position.z));

            motion.vx = (root.position.x - prevX) / Math.max(1e-4, deltaTime);
            motion.vz = (root.position.z - prevZ) / Math.max(1e-4, deltaTime);

            // Always face the table center during assists.
            const targetFacing = getCourtCenterFacing(root.position);
            const delta = Math.atan2(
              Math.sin(targetFacing - motion.facing),
              Math.cos(targetFacing - motion.facing),
            );
            const step = Math.max(-playerTurnSpeed * deltaTime, Math.min(playerTurnSpeed * deltaTime, delta));
            motion.facing += step;
            root.rotation.y = motion.facing + PLAYER_MODEL_YAW_OFFSET + (character?.getMirrorFacingCompensationYaw() ?? 0) + (character?.getAnimationFacingCompensationYaw() ?? 0);

            if (capsule) {
              capsule.position.x = root.position.x;
              capsule.position.z = root.position.z;
            }
          } else {
            motion.vx = 0;
            motion.vz = 0;
          }

          if (assist.timer <= 0) {
            assist.active = false;
            assist.action = null;
          }
          return;
        }

        const hasInput = moveX !== 0 || moveZ !== 0;
        const moveSpeed = isAi ? playerMoveSpeed * aiMoveSpeedScale : playerMoveSpeed;
        let targetVx = 0;
        let targetVz = 0;

        if (hasInput) {
          const dir = new Vector3(moveX, 0, moveZ).normalize();
          targetVx = dir.x * moveSpeed;
          targetVz = dir.z * moveSpeed;
        }

        const accel = isAi ? aiAccel : playerAccel;
        const blend = Math.min(1, (hasInput ? accel : playerDecel) * deltaTime);
        motion.vx += (targetVx - motion.vx) * blend;
        motion.vz += (targetVz - motion.vz) * blend;

        root.position.x += motion.vx * deltaTime;
        root.position.z += motion.vz * deltaTime;

        root.position.x = Math.max(-playerHalfCourtX, Math.min(playerHalfCourtX, root.position.x));
        root.position.z = Math.max(minZ, Math.min(maxZ, root.position.z));

        // Runtime rule: always face the table (both original and mirrored flows).
        const targetFacing = getCourtCenterFacing(root.position);
        const delta = Math.atan2(
          Math.sin(targetFacing - motion.facing),
          Math.cos(targetFacing - motion.facing),
        );
        const step = Math.max(-playerTurnSpeed * deltaTime, Math.min(playerTurnSpeed * deltaTime, delta));
        motion.facing += step;

        root.rotation.y = motion.facing + PLAYER_MODEL_YAW_OFFSET + (character?.getMirrorFacingCompensationYaw() ?? 0) + (character?.getAnimationFacingCompensationYaw() ?? 0);

        if (capsule) {
          capsule.position.x = root.position.x;
          capsule.position.z = root.position.z;
        }
      };

      updatePlayer(
        player1,
        charRoot1,
        p1MoveX,
        p1MoveZ,
        p1Capsule,
        p1Motion,
        p1Assist,
        -playerHalfCourtZ,
        -minCourtSplitZ,
        ENABLE_P1_AI,
      );
      updatePlayer(
        player2,
        charRoot2,
        p2MoveX,
        p2MoveZ,
        p2Capsule,
        p2Motion,
        p2Assist,
        minCourtSplitZ,
        playerHalfCourtZ,
        ENABLE_P2_AI,
      );

      const stabilizeCharacter = (
        root: AbstractMesh,
        skeleton: Skeleton | null,
        side: CourtSide,
        capsule: { position: Vector3 } | null,
        motion: { vx: number; vz: number; facing: number },
      ): void => {
        const desiredMinZ = side === 0 ? -minCourtSplitZ : minCourtSplitZ;
        if (side === 0 && root.position.z > desiredMinZ) {
          root.position.z = desiredMinZ;
          motion.vz = Math.min(0, motion.vz);
        }
        if (side === 1 && root.position.z < desiredMinZ) {
          root.position.z = desiredMinZ;
          motion.vz = Math.max(0, motion.vz);
        }

        const footMinY = getFootMinY(root, skeleton);
        const desiredFootY = 0.045 * SCALE;
        if (footMinY < desiredFootY) {
          // Hard correction: keep feet above the court surface every frame.
          root.position.y += desiredFootY - footMinY;
        }

        if (capsule) {
          capsule.position.x = root.position.x;
          capsule.position.z = root.position.z;
          capsule.position.y = root.position.y + 0.98 * SCALE * PLAYER_SIZE_SCALE;
        }
      };

      stabilizeCharacter(charRoot1, charData1.skeletons[0] ?? null, 0, p1Capsule, p1Motion);
      stabilizeCharacter(charRoot2, charData2.skeletons[0] ?? null, 1, p2Capsule, p2Motion);
      syncHitboxDebugMeshes();

      if (ENABLE_BALL_MOTION_ASSIST && collisionDrill.enabled && collisionDrill.activeFlight) {
        const side = collisionDrill.side;
        const strikerCharacter = side === 0 ? player1 : player2;
        const strikerRoot = side === 0 ? charRoot1 : charRoot2;
        const profile = getActionAssistProfile(collisionDrill.action);
        const forwardSign = side === 0 ? 1 : -1;

        const fallbackTarget = strikerRoot.position
          .add(new Vector3(0, profile.fallbackY, 0))
          .add(new Vector3(0, 0, profile.fallbackForward * forwardSign));
        const target = strikerCharacter?.isInStrike()
          ? strikerCharacter.getStrikeBonePosition()
          : fallbackTarget;

        applyRealisticBallConvergence(
          target,
          profile.magnetRange + 0.8 * SCALE,
          actionAssistMagnetStrength * 0.62,
          13.0 * SCALE,
          0.24,
          deltaTime,
        );
      }

      const processRequestedAction = (
        request: ActionRequestState,
        character: Character | undefined,
        root: { position: Vector3; rotation: Vector3 },
        motion: { vx: number; vz: number; facing: number },
        minZ: number,
        maxZ: number,
        assist: AssistState,
        strikeState: { action: OffensiveAction | null; timer: number },
      ): void => {
        if (!request.action) return;
        // Never execute a queued action while a serve is in progress or in its
        // post-serve grace window.  A stale request from the end of a rally can
        // survive into the first serve frame; this guard is the last line of
        // defence against it triggering a reception animation mid-serve.
        if (serveSetupActive) { request.action = null; request.ttl = 0; return; }
        const playerSide: CourtSide = minZ < 0 ? 0 : 1;

        request.ttl = Math.max(0, request.ttl - deltaTime);
        if (request.ttl <= 0) {
          request.action = null;
          requestPowerByPlayer[playerSide] = 1;
          return;
        }
        if (assist.active) return;

        const vel = physicsBody.getLinearVelocity();
        if (vel.y > actionFallingMinYSpeed) return; // kicks only when ball is falling
        const ballSide = sideFromZ(ball.mesh.position.z);
        const plannedPhase = getPlannedPhase(playerSide, ballSide);

        const toBall = ball.mesh.position.subtract(root.position);
        const horizontal = Math.sqrt(toBall.x ** 2 + toBall.z ** 2);
        const height = ball.mesh.position.y;

        const profile = getActionAssistProfile(request.action);
        const animConfig = getAnimConfigForAction(request.action);
        const strikeTiming = resolveStrikeTiming(profile, animConfig);
        const contactLead = Math.max(0.06, Math.min(0.55, strikeTiming.strikeDuration - strikeTiming.impactTime));
        const configuredReach = resolveAnimReachUnits(animConfig, profile.startRange / SCALE) * SCALE;
        const maxReach = Math.max(
          profile.startRange * 0.72,
          Math.min(profile.startRange * 1.28, configuredReach),
        );
        const rangeOk = horizontal <= maxReach;
        const predictedAtContact = new Vector3(
          ball.mesh.position.x + vel.x * contactLead,
          ball.mesh.position.y + vel.y * contactLead - 0.5 * gravityAbs * contactLead * contactLead,
          ball.mesh.position.z + vel.z * contactLead,
        );
        const horizontalAtContact = Vector3.Distance(
          new Vector3(root.position.x, 0, root.position.z),
          new Vector3(predictedAtContact.x, 0, predictedAtContact.z),
        );
        const precontactRangePadding = Math.max(
          0.25 * SCALE,
          Math.min(1.20 * SCALE, playerMoveSpeed * contactLead * actionPrecontactRangePaddingFactor),
        );
        const rangeOkAtContact = horizontalAtContact <= maxReach + precontactRangePadding;
        const heightOk =
          (height >= profile.minHeight && height <= profile.maxHeight) ||
          (predictedAtContact.y >= profile.minHeight - actionPrecontactHeightTolerance &&
            predictedAtContact.y <= profile.maxHeight + actionPrecontactHeightTolerance);

        if ((!rangeOk && !rangeOkAtContact) || !heightOk) return;
        if (isKickAction(request.action) && plannedPhase !== 'kick') return;
        if (isKickAction(request.action) && !canKickAfterReceptionByPlayer[playerSide]) {
          request.action = null;
          request.ttl = 0;
          requestPowerByPlayer[playerSide] = 1;
          return;
        }

        // Timing gate: ensure the animation contact frame will actually coincide with
        // the ball reaching the strike bone.  The synced speed ratio is clamped at
        // [0.75, 4.0] in triggerAction; below 0.75 the animation can't slow down
        // enough and the impact window would open before the ball arrives.
        // Apply this gate to ALL kick actions regardless of height window, so that
        // header kicks (maxHeight = +Inf) are also deferred while the ball is still
        // descending from a reception pop-up.
        if (isKickAction(request.action) && animConfig && animConfig.contactFrame > 0) {
          const contactH = root.position.y + (profile.fallbackY ?? 1.0);
          const arrivalPred = BallPredictor.ballAtArrival(
            ball.mesh.position.clone(), vel.clone(), contactH, gravityAbs,
          );
          if (arrivalPred.timeSeconds > 0.05) {
            const naturalDuration = animConfig.contactFrame / ANIM_CONFIG_FPS;
            const rawRatio = naturalDuration / arrivalPred.timeSeconds;
            if (rawRatio < 0.75) return; // Ball still above contact zone — wait for it to descend
          }
        }

        triggerAction(character, root, motion, minZ, maxZ, assist, strikeState, request.action);
        if (assist.active) {
          request.action = null;
          request.ttl = 0;
          requestPowerByPlayer[playerSide] = 1;
        }
      };

      processRequestedAction(
        p1Request,
        player1,
        charRoot1,
        p1Motion,
        -playerHalfCourtZ,
        -minCourtSplitZ,
        p1Assist,
        p1StrikeState,
      );
      processRequestedAction(
        p2Request,
        player2,
        charRoot2,
        p2Motion,
        minCourtSplitZ,
        playerHalfCourtZ,
        p2Assist,
        p2StrikeState,
      );

      p1StrikeState.timer = Math.max(0, p1StrikeState.timer - deltaTime);
      if (p1StrikeState.timer === 0) p1StrikeState.action = null;
      p2StrikeState.timer = Math.max(0, p2StrikeState.timer - deltaTime);
      if (p2StrikeState.timer === 0) p2StrikeState.action = null;

      const getBallInteractionOrder = (): [CourtSide, CourtSide] => {
        if (collisionDrill.enabled) {
          return collisionDrill.side === 0 ? [0, 1] : [1, 0];
        }

        if (ballInteractionLockSide !== null && ballInteractionLockTimer > 0) {
          return ballInteractionLockSide === 0 ? [0, 1] : [1, 0];
        }

        const p1Priority = (p1Assist.active ? 2 : 0) + (p1StrikeState.action ? 1 : 0);
        const p2Priority = (p2Assist.active ? 2 : 0) + (p2StrikeState.action ? 1 : 0);
        if (p1Priority > p2Priority) return [0, 1];
        if (p2Priority > p1Priority) return [1, 0];

        const p1DistSq = Vector3.DistanceSquared(charRoot1.position, ball.mesh.position);
        const p2DistSq = Vector3.DistanceSquared(charRoot2.position, ball.mesh.position);
        if (Math.abs(p1DistSq - p2DistSq) <= 1e-4) {
          const ballSide = sideFromZ(ball.mesh.position.z);
          return ballSide === 0 ? [0, 1] : [1, 0];
        }
        return p1DistSq <= p2DistSq ? [0, 1] : [1, 0];
      };

      const preventBallTunnelingThroughPlayer = (playerPos: Vector3, assist: AssistState): boolean => {
        if (!ENABLE_PLAYER_ANTI_TUNNEL_GUARD) return false;
        // Disable anti-tunnel guard whenever a kick/reception assist is active.
        // The assist impact window snaps the ball to the strike bone, so we must
        // NOT deflect the ball on its way down to contact height.  The body-
        // collision system (enforcePlayerBodyCollision) still protects against
        // real tunneling in pure-physics mode.
        if (assist.active) return false;
        const vel = physicsBody.getLinearVelocity();
        if (vel.y >= -0.05) return false;

        const toBall = ball.mesh.position.subtract(playerPos);
        const flat = new Vector3(toBall.x, 0, toBall.z);
        const horizontal = flat.length();
        const y = ball.mesh.position.y;

        if (horizontal > antiTunnelBodyRadius + ballRadius) return false;
        if (y < antiTunnelBodyBottom || y > antiTunnelBodyTop) return false;

        const n = horizontal > 1e-4 ? flat.scale(1 / horizontal) : new Vector3(0, 0, 1);
        const safeDist = antiTunnelBodyRadius + ballRadius + antiTunnelPushOut;
        ball.mesh.position.x = playerPos.x + n.x * safeDist;
        ball.mesh.position.z = playerPos.z + n.z * safeDist;

        const reboundY = Math.max(Math.abs(vel.y) * 0.5, antiTunnelMinReboundY);
        physicsBody.setLinearVelocity(new Vector3(
          n.x * 1.1 * SCALE,
          reboundY,
          n.z * 1.1 * SCALE,
        ));
        return true;
      };

      const enforcePlayerBodyCollision = (rig: PlayerHitboxRig, assist: AssistState): boolean => {
        // In pure mode we still need body interception while an action assist
        // is active, otherwise the ball can cross the torso waiting for socket timing.
        if (assist.active && ENABLE_BALL_MOTION_ASSIST) return false;

        let bestContact: { normal: Vector3; penetration: number; restitution: number; part: string } | null = null;

        for (const hitbox of rig.hitboxes) {
          const center = getHitboxCenter(rig, hitbox);
          const toBall = ball.mesh.position.subtract(center);
          const dist = toBall.length();
          const combinedRadius = hitbox.radius + ballRadius;

          if (dist >= combinedRadius) {
            continue;
          }

          const normal = dist > 1e-4 ? toBall.scale(1 / dist) : new Vector3(0, 1, 0);
          const penetration = combinedRadius - dist;
          if (!bestContact || penetration > bestContact.penetration) {
            bestContact = {
              normal,
              penetration,
              restitution: hitbox.restitution,
              part: hitbox.name,
            };
          }
        }

        if (bestContact) {
          ball.mesh.position.addInPlace(bestContact.normal.scale(bestContact.penetration + 0.006 * SCALE));

          const vel = physicsBody.getLinearVelocity();
          const vn = Vector3.Dot(vel, bestContact.normal);
          const tangential = vel.subtract(bestContact.normal.scale(vn));
          const outNormalRaw = vn < 0 ? -vn * bestContact.restitution : 0.08 * SCALE;
          const outNormal = Math.max(0.06 * SCALE, Math.min(5.2 * SCALE, outNormalRaw));
          let nextVel = tangential.scale(0.985).add(bestContact.normal.scale(outNormal));

          if (bestContact.part.includes('foot') || bestContact.part.includes('knee')) {
            nextVel = new Vector3(nextVel.x, Math.max(nextVel.y, 0.2 * SCALE), nextVel.z);
          }

          physicsBody.setLinearVelocity(nextVel);
          return true;
        }

        if (!ENABLE_PLAYER_FALLBACK_BODY_VOLUME) {
          return false;
        }

        // Fallback body volume for areas not covered by current bone matches.
        const toBall = ball.mesh.position.subtract(rig.root.position);
        const flat = new Vector3(toBall.x, 0, toBall.z);
        const horizontal = flat.length();
        const y = ball.mesh.position.y;
        const combinedRadius = playerBodyRadius + ballRadius;

        if (horizontal >= combinedRadius) return false;
        if (y < playerBodyBottom || y > playerBodyTop) return false;

        const n = horizontal > 1e-4 ? flat.scale(1 / horizontal) : new Vector3(0, 0, 1);
        const penetration = combinedRadius - horizontal;
        ball.mesh.position.x += n.x * (penetration + 0.01 * SCALE);
        ball.mesh.position.z += n.z * (penetration + 0.01 * SCALE);

        const vel = physicsBody.getLinearVelocity();
        const inward = vel.x * n.x + vel.z * n.z;
        let nextVx = vel.x;
        let nextVz = vel.z;

        if (inward < 0) {
          nextVx -= (1 + playerBodyRestitution) * inward * n.x;
          nextVz -= (1 + playerBodyRestitution) * inward * n.z;
        } else {
          nextVx += n.x * playerBodyPush;
          nextVz += n.z * playerBodyPush;
        }

        physicsBody.setLinearVelocity(new Vector3(
          nextVx,
          Math.max(vel.y, 0.15 * SCALE),
          nextVz,
        ));
        return true;
      };

      const serveCollisionLocked = serveState.active;
      const p1CollisionActive = ENABLE_PLAYER_BODY_COLLISION_RESOLUTION && (!collisionDrill.enabled || collisionDrill.side === 0) && !serveCollisionLocked;
      const p2CollisionActive = ENABLE_PLAYER_BODY_COLLISION_RESOLUTION && (!collisionDrill.enabled || collisionDrill.side === 1) && !serveCollisionLocked;

      const interactionOrder = getBallInteractionOrder();
      const getSideInteractionState = (side: CourtSide) => {
        if (side === 0) {
          return {
            active: p1CollisionActive,
            rootPos: charRoot1.position,
            assist: p1Assist,
            rig: p1HitboxRig,
            character: player1,
            velocityX: p1Motion.vx,
            velocityZ: p1Motion.vz,
            strikeState: p1StrikeState,
          };
        }
        return {
          active: p2CollisionActive,
          rootPos: charRoot2.position,
          assist: p2Assist,
          rig: p2HitboxRig,
          character: player2,
          velocityX: p2Motion.vx,
          velocityZ: p2Motion.vz,
          strikeState: p2StrikeState,
        };
      };

      let collisionResolved = false;
      for (const side of interactionOrder) {
        if (collisionResolved) break;
        // Unstoppable super kick: let the ball pass through the opponent (side 1)
        // untouched — no body deflection either.
        if (side === 1 && superKickInFlight) continue;
        const state = getSideInteractionState(side);
        if (!state.active) continue;

        const antiTunnelResolved = preventBallTunnelingThroughPlayer(state.rootPos, state.assist);
        if (antiTunnelResolved) {
          ballInteractionLockSide = side;
          ballInteractionLockTimer = ballInteractionOwnerHoldSeconds;
          collisionResolved = true;
          break;
        }

        const bodyResolved = enforcePlayerBodyCollision(state.rig, state.assist);
        if (bodyResolved) {
          ballInteractionLockSide = side;
          ballInteractionLockTimer = ballInteractionOwnerHoldSeconds;
          collisionResolved = true;
          break;
        }
      }

      const applyPlayerBallInfluence = (
        character: Character | undefined,
        playerPos: Vector3,
        velocityX: number,
        velocityZ: number,
        assist: AssistState,
        strikeState: { action: OffensiveAction | null; timer: number },
        playerSide: CourtSide,
      ): boolean => {
        if (serveState.active) {
          return false;
        }
        if (!character) return false;
        if (ENABLE_ARCADE_RALLY_SCRIPT && arcadeRallyFlight.active) return false;
        const forwardSign = playerSide === 0 ? 1 : -1;

        const toBall = ball.mesh.position.subtract(playerPos);
        const flatToBall = new Vector3(toBall.x, 0, toBall.z);
        const distance = flatToBall.length();
        if (!assist.active && distance > playerKickRange) return false;

        const vel = physicsBody.getLinearVelocity();

        if (assist.active && strikeState.action && strikeState.timer > 0) {
          const profile = getActionAssistProfile(strikeState.action);
          const inHeightWindow = ball.mesh.position.y >= profile.minHeight && ball.mesh.position.y <= profile.maxHeight;
          const socketGroundDistanceAtContact = character.getActionSocketGroundDistanceAtContact(strikeState.action);
          const strikeActionFamily = getActionFamily(strikeState.action);
          let influenced = false;

          // Use strike bone position instead of player root
          const strikePos = character.getStrikeBonePosition();
          const strikeToBall = ball.mesh.position.subtract(strikePos);
          const contactDistance = strikeToBall.length();

          // Optional assist pull (disabled in pure physics mode).
          if (
            ENABLE_BALL_MOTION_ASSIST &&
            !assist.hitApplied &&
            inHeightWindow &&
            contactDistance <= profile.magnetRange &&
            contactDistance > 1e-4
          ) {
            applyRealisticBallConvergence(
              strikePos,
              profile.magnetRange,
              actionAssistMagnetStrength,
              19.0 * SCALE,
              0.34,
              deltaTime,
            );
            influenced = true;
          }

          // Foot kicks after a reception: the ball is in free fall and will
          // usually drop below profile.minHeight before the impact frame.  The
          // normal magnetic pull above is gated on inHeightWindow and so stops
          // helping exactly when we need it most.  Lerp the ball Y directly
          // toward the foot-bone Y during the impact-window lead-in so the ball
          // visually rises to meet the foot instead of being snapped at the
          // last frame.  Targets `socketGroundDistanceAtContact` (the foot Y at
          // the animation contact frame) when known, otherwise the live foot
          // bone Y plus a small lift.
          if (
            ENABLE_BALL_MOTION_ASSIST &&
            !assist.hitApplied &&
            strikeActionFamily === 'foot' &&
            strikeState.timer <= assist.impactTime + 0.22
          ) {
            const targetY = socketGroundDistanceAtContact ?? (strikePos.y + 0.06 * SCALE);
            const horizDist = Math.sqrt(strikeToBall.x * strikeToBall.x + strikeToBall.z * strikeToBall.z);
            // Only pull when reasonably close horizontally — keeps the lerp from
            // yanking a ball that isn't actually heading for the player.
            if (horizDist <= profile.magnetRange * 1.6) {
              const lerpRate = 14.0; // per-second exponential approach
              const alpha = 1 - Math.exp(-lerpRate * deltaTime);
              ball.mesh.position.y += (targetY - ball.mesh.position.y) * alpha;
              const v = physicsBody.getLinearVelocity();
              // Damp downward velocity so the ball does not blow past targetY
              // once it has been pulled up.
              if (v.y < 0) {
                physicsBody.setLinearVelocity(new Vector3(v.x, v.y * Math.max(0, 1 - alpha * 1.2), v.z));
              }
              influenced = true;
            }
          }

          const inImpactWindow = strikeState.timer <= (assist.impactTime + impactWindowGrace);

          const effectiveContactDistance = contactDistance;
          const maxSnapDistance = Math.max(profile.contactDistance * 1.9, profile.magnetRange * 1.2);
          const rootDistance = Vector3.Distance(ball.mesh.position, playerPos);
          const earlyCaptureDistance = profile.contactDistance + actionEarlyContactCaptureExtra;
          const canEarlyCapture =
            inHeightWindow &&
            rootDistance <= actionEarlyContactRootRadius &&
            effectiveContactDistance <= earlyCaptureDistance;

          // Reception reliability net: while a reception strike is active, capture
          // the ball as soon as it is within a generous horizontal range of the
          // player at a sane height — independent of the exact contact-frame
          // timing.  This stops a fast incoming ball from "tunnelling" past the
          // receiver when the synced contact frame lands a hair too late (the
          // ball arrives before the impact window opens, then it is already past
          // by the time it does).  Makes reception forgiving about proximity.
          const isReceptionStrike =
            strikeState.action === 'receptionChest' ||
            strikeState.action === 'receptionInnerRight' ||
            strikeState.action === 'receptionToe';
          const rootHorizDist = Math.hypot(
            ball.mesh.position.x - playerPos.x,
            ball.mesh.position.z - playerPos.z,
          );
          // Catch net must cover the FULL reception-trigger range, otherwise a
          // ball that lands in the band between the old net (2.4u) and the
          // trigger range (~3.1u) tunnels past uncaught — the animation fired,
          // the player is clearly in position, yet the strike just expires and
          // the rally is lost.  Sized to the trigger reach so any reception the
          // player can START is one they will COMPLETE.
          const receptionCatchRadius = Math.max(1.15 * SCALE, profile.magnetRange * 1.35);
          const receptionInReach =
            isReceptionStrike &&
            rootHorizDist <= receptionCatchRadius &&
            ball.mesh.position.y >= ballRadius + 0.03 * SCALE &&
            ball.mesh.position.y <= profile.maxHeight + 0.22 * SCALE;

          const canCaptureNow = inImpactWindow || canEarlyCapture || receptionInReach;

          if (!assist.hitApplied && canCaptureNow) {
            if (ENABLE_BALL_MOTION_ASSIST && effectiveContactDistance > maxSnapDistance) {
              // Ignore impossible contacts instead of teleporting the ball across the court.
              assist.active = false;
              assist.action = null;
              strikeState.action = null;
              strikeState.timer = 0;
              return true;
            }

            if (!ENABLE_BALL_MOTION_ASSIST) {
              // Impact window = contact frame reached: fire unconditionally (ball will be
              // snapped to the bone below).  Outside the window, keep existing gates —
              // but a reception that is already in reach bypasses them so it cannot
              // be skipped on the frames the ball is actually at the player.
              if (!inImpactWindow && !receptionInReach) {
                if (!inHeightWindow) {
                  return influenced;
                }
                if (effectiveContactDistance > profile.contactDistance && !canEarlyCapture) {
                  return influenced;
                }
              }
            }

            // ── Ball position snap ───────────────────────────────────────────────────
            // At the contact frame, teleport the ball onto the exact strike bone so
            // the visual hit always coincides with the animated contact pose.
            // Outside the impact window, only nudge toward the bone for early capture.
            if (!ENABLE_BALL_MOTION_ASSIST) {
              if (inImpactWindow && rootDistance <= 3.0 * SCALE) {
                // Hard snap to bone — this is the visible contact point.
                // 3.0 × SCALE gives comfortable margin even when the ball
                // drifted slightly sideways during the wind-up animation.
                ball.mesh.position.copyFrom(strikePos);
                ball.mesh.position.y = Math.max(ball.mesh.position.y, ballRadius);
              } else if (!inImpactWindow && effectiveContactDistance > profile.contactDistance && canEarlyCapture) {
                const toBallFlat = new Vector3(toBall.x, 0, toBall.z);
                const toBallDir = toBallFlat.lengthSquared() > 1e-5
                  ? toBallFlat.normalize()
                  : new Vector3(0, 0, forwardSign);
                const snapN = strikeToBall.lengthSquared() > 1e-5 ? strikeToBall.normalize() : toBallDir;
                const snapDist = profile.contactDistance * 0.62;
                ball.mesh.position.copyFrom(strikePos.add(snapN.scale(snapDist)));
              }
            }

            // Hard guarantee (assist mode): at impact frame, force contact if needed.
            if (ENABLE_BALL_MOTION_ASSIST && effectiveContactDistance > profile.contactDistance) {
              const toBallFlat = new Vector3(toBall.x, 0, toBall.z);
              const toBallDir = toBallFlat.lengthSquared() > 1e-5
                ? toBallFlat.normalize()
                : new Vector3(0, 0, forwardSign);
              const snapN = strikeToBall.lengthSquared() > 1e-5 ? strikeToBall.normalize() : toBallDir;
              const snapDist = profile.contactDistance * 0.55;
              ball.mesh.position.copyFrom(strikePos.add(snapN.scale(snapDist)));
            }

            const strikeProfile = getActionAssistProfile(strikeState.action);
            const strikeFamily = getActionFamily(strikeState.action);
            const animConfig = getAnimConfigForAction(strikeState.action);
            let strikeSpeed = headerKickSpeed;
            if (strikeFamily === 'chest') strikeSpeed = headerKickSpeed * 0.92;
            if (strikeFamily === 'knee') strikeSpeed = kneeKickSpeed;
            if (strikeFamily === 'foot') strikeSpeed = kneeKickSpeed * 1.02;
            if (strikeFamily === 'scissor') strikeSpeed = scissorKickSpeed;
            const defaultSpeedRaw = strikeSpeed / Math.max(1e-4, animConfigBallSpeedScale);
            const resolvedSpeedRaw = resolveAnimBallSpeedValue(animConfig, defaultSpeedRaw);
            const configSpeed = resolvedSpeedRaw * animConfigBallSpeedScale;
            strikeSpeed = Math.max(
              2.8 * SCALE,
              Math.min(13.5 * SCALE, configSpeed * GLOBAL_KICK_VELOCITY_MULTIPLIER * Math.max(0.55, Math.min(1.55, requestPowerByPlayer[playerSide]))),
            );

            const attackerSide: CourtSide = playerSide;
            const defenderPos = attackerSide === 0 ? charRoot2.position : charRoot1.position;
            const touchPhase = getTouchPhaseForPlayer(attackerSide);
            const band = getHeightBand(ball.mesh.position.y);

            const kickBoostActive = pendingKickPowerBoost[attackerSide] && touchPhase === 'kick';
            if (kickBoostActive) {
              strikeSpeed *= 1.22;
              pendingKickPowerBoost[attackerSide] = false;
            }

            const prepSuperHighActive = pendingPrepSuperHigh[attackerSide] && touchPhase === 'preparation';
            if (prepSuperHighActive) {
              pendingPrepSuperHigh[attackerSide] = false;
            }

            // Treat this contact as a reception pop-up if either the rally phase
            // says 'reception' OR the queued animation is a reception-type clip.
            // The action-type guard is the critical fallback for PURE_BALL_PHYSICS
            // mode where getPlannedPhase() can momentarily lag behind the bounce
            // counter (now fixed) and might still return 'defense' on the very
            // first frame the contact fires.
            const isReceptionActionType =
              strikeState.action === 'receptionChest' ||
              strikeState.action === 'receptionInnerRight' ||
              strikeState.action === 'receptionToe';

            if (touchPhase === 'reception' || isReceptionActionType) {
              // Contact frame reached: ball has been snapped to the strike bone above.
              // Only cancel if the ball is genuinely out of reach horizontally (sync
              // was way off / ball missed) — measured on the flat plane and matched
              // to the catch radius so an in-reach reception is never dropped.
              if (rootHorizDist > receptionCatchRadius + 0.5 * SCALE) {
                assist.hitApplied = true;
                assist.active = false;
                assist.action = null;
                strikeState.action = null;
                strikeState.timer = 0;
                character.clearStrikeBoneContactSnapshot();
                return influenced;
              }
              // Teleport the ball to just above the player's head before applying
              // velocity.  This does two things:
              //  1. Clears the character's physics capsule entirely so Havok never
              //     sees ball-vs-player overlap as it rises (prevents the dirty
              //     lateral push from sliding off the mesh).
              //  2. Locks XZ to the player root so the ball goes straight up from
              //     the player's standing position regardless of where the bone was.
              const characterHeight = 1.80 * SCALE * PLAYER_SIZE_SCALE;
              // Place ball slightly in front of the player (toward the net) so it
              // rises ahead of them rather than at/behind their root position.
              const receptionForwardOffset = 0.30 * SCALE;
              ball.mesh.position.x = playerPos.x;
              ball.mesh.position.z = playerPos.z + receptionForwardOffset * forwardSign;
              ball.mesh.position.y = playerPos.y + characterHeight + ballRadius;
              // Apex = 1.75× the player's height above the player's feet.
              const apexTarget = playerPos.y + 1.75 * characterHeight;
              const arcHeight = Math.max(0.1 * SCALE, apexTarget - ball.mesh.position.y);
              const recvVy = Math.sqrt(2.0 * gravityAbs * arcHeight);
              physicsBody.setLinearVelocity(new Vector3(0, recvVy, 0));
              physicsBody.setAngularVelocity(Vector3.Zero());
              assist.hitApplied = true;
              assist.active = false;
              assist.action = null;
              strikeState.action = null;
              strikeState.timer = 0;
              character.clearStrikeBoneContactSnapshot();
              registerPlayerTouch(playerSide);
              canKickAfterReceptionByPlayer[playerSide] = true;
              return true;
            }

            if (touchPhase === 'preparation') {
              const contactRatio = getContactFrameRatio(animConfig, 0.5);
              const fallbackControlHeight = touchPhase === 'preparation' ? 1.62 * SCALE : 1.18 * SCALE;
              const baseControlHeight = socketGroundDistanceAtContact ?? fallbackControlHeight;
              const loft = animConfig ? Math.max(0, Math.min(1, animConfig.ballLoft)) : 0.5;
              const controlHeight = Math.max(
                1.10 * SCALE,
                Math.min(
                  2.70 * SCALE,
                  baseControlHeight + (contactRatio - 0.5) * 0.50 * SCALE + (loft - 0.5) * 0.28 * SCALE,
                ),
              );

              const controlReachUnits = resolveAnimReachUnits(animConfig, 1.25);
              const controlForward = Math.max(0.52 * SCALE, Math.min(1.20 * SCALE, controlReachUnits * 0.62 * SCALE));
              const forwardSign = attackerSide === 0 ? 1 : -1;

              // If AI precomputed a desired prep control target, prefer that.
              const suggestedPrep = prepControlTargetByPlayer[attackerSide];
              let controlTarget: Vector3;
              if (suggestedPrep) {
                controlTarget = new Vector3(
                  clampi(suggestedPrep.x, -playerHalfCourtX * 0.95, playerHalfCourtX * 0.95),
                  controlHeight,
                  clampi(suggestedPrep.z, attackerSide === 0 ? -playerHalfCourtZ : minCourtSplitZ, attackerSide === 0 ? -minCourtSplitZ : playerHalfCourtZ),
                );
              } else {
                const controlXOffset = Math.max(-0.35 * SCALE, Math.min(0.35 * SCALE, (ball.mesh.position.x - playerPos.x) * 0.45));
                const controlX = Math.max(-playerHalfCourtX * 0.88, Math.min(playerHalfCourtX * 0.88, playerPos.x + controlXOffset));
                const controlZ = Math.max(
                  attackerSide === 0 ? -playerHalfCourtZ : minCourtSplitZ,
                  Math.min(
                    attackerSide === 0 ? -minCourtSplitZ : playerHalfCourtZ,
                    playerPos.z + forwardSign * controlForward,
                  ),
                );

                controlTarget = new Vector3(controlX, controlHeight, controlZ);
              }
              const plannedKickAction = chooseActionForPhase('kick', getHeightBand(controlHeight), playerPos, controlTarget);
              const kickRise = getKickRiseProfile(plannedKickAction, attackerSide);
              controlTarget = new Vector3(
                clampi(controlTarget.x + kickRise.vx * 0.25, -playerHalfCourtX * 0.95, playerHalfCourtX * 0.95),
                Math.min(2.85 * SCALE, controlTarget.y * kickRise.vyMult),
                clampi(
                  controlTarget.z + kickRise.vz * 0.25,
                  attackerSide === 0 ? -playerHalfCourtZ : minCourtSplitZ,
                  attackerSide === 0 ? -minCourtSplitZ : playerHalfCourtZ,
                ),
              );
              const settleTime = touchPhase === 'preparation' ? 0.26 : 0.22;
              const toControlFlat = new Vector3(
                controlTarget.x - ball.mesh.position.x,
                0,
                controlTarget.z - ball.mesh.position.z,
              );
              const controlDist = Math.max(0.04 * SCALE, toControlFlat.length());
              const controlDir = toControlFlat.lengthSquared() > 1e-5
                ? toControlFlat.normalize()
                : new Vector3(0, 0, attackerSide === 0 ? 1 : -1);
              const controlHorizontalSpeed = Math.min(3.0 * SCALE, controlDist / Math.max(0.12, settleTime));
              const controlDy = controlTarget.y - ball.mesh.position.y;
              const controlVyBallistic = (controlDy + 0.5 * gravityAbs * settleTime * settleTime) / settleTime;
              const controlVy = Math.max(0.6 * SCALE, Math.min(4.8 * SCALE, controlVyBallistic));

              physicsBody.setLinearVelocity(new Vector3(
                controlDir.x * controlHorizontalSpeed,
                controlVy,
                controlDir.z * controlHorizontalSpeed,
              ));
              addBallSpinTwist(controlDir.x * 1.2);

              postKickLockTimer = 0;
              postKickLockSpeed = 0;

              assist.hitApplied = true;
              assist.active = false;
              assist.action = null;
              strikeState.action = null;
              strikeState.timer = 0;
              character.clearStrikeBoneContactSnapshot();
              // Clear prepared control target after it was applied
              prepControlTargetByPlayer[attackerSide] = null;
              registerPlayerTouch(attackerSide);
              return true;
            }

            if (socketGroundDistanceAtContact !== null) {
              const targetImpactY = Math.max(0.35 * SCALE, Math.min(2.9 * SCALE, socketGroundDistanceAtContact));
              const maxAdjust = 0.42 * SCALE;
              const yDelta = targetImpactY - ball.mesh.position.y;
              if (Math.abs(yDelta) > 1e-4) {
                ball.mesh.position.y += Math.max(-maxAdjust, Math.min(maxAdjust, yDelta));
              }
            }

            // In collision drill, keep returns local to the active player side.
            const tableTarget = collisionDrill.enabled
              ? new Vector3(
                  Math.max(-playerHalfCourtX * 0.85, Math.min(playerHalfCourtX * 0.85, playerPos.x + (Math.random() - 0.5) * 0.35 * SCALE)),
                  1.18 * SCALE + Math.random() * 0.48 * SCALE,
                  Math.max(
                    attackerSide === 0 ? -playerHalfCourtZ : minCourtSplitZ,
                    Math.min(
                      attackerSide === 0 ? -minCourtSplitZ : playerHalfCourtZ,
                      playerPos.z + (attackerSide === 0 ? 1 : -1) * (0.55 + Math.random() * 0.38) * SCALE,
                    ),
                  ),
                )
              : touchPhase === 'kick'
                ? chooseDiagonalOpponentTableCell(
                    attackerSide,
                    playerPos,
                    attackerSide === 0 && !ENABLE_P1_AI ? p1KickAim.x : 0,
                  )
                : chooseBestTableCell(
                  attackerSide,
                  playerPos,
                  defenderPos,
                  touchPhase,
                  band,
                );

            // Mirror the serve flow: anchor the kick from the strike bone, then
            // solve a deterministic ballistic path to the chosen table cell.
            // Foot kicks need more lift to clear the net from a low strike point.
            const kickContactLift = strikeFamily === 'header'
              ? 0.05 * SCALE
              : strikeFamily === 'chest'
                ? 0.06 * SCALE
                : strikeFamily === 'knee'
                  ? 0.08 * SCALE
                  : strikeFamily === 'foot'
                    ? 0.22 * SCALE
                    : 0.11 * SCALE;
            const kickContactAnchor = strikePos.add(new Vector3(0, kickContactLift, 0));
            ball.mesh.position.copyFrom(kickContactAnchor);

            // Nudge the ball out of the rig before solving the launch so Havok
            // does not keep it pressed against the player mesh on contact.
            const kickReleaseVector = new Vector3(
              tableTarget.x - kickContactAnchor.x,
              0,
              tableTarget.z - kickContactAnchor.z,
            );
            const kickReleaseDir = kickReleaseVector.lengthSquared() > 1e-5
              ? kickReleaseVector.normalize()
              : new Vector3(0, 0, forwardSign);
            const kickReleaseDistance = Math.max(0.24 * SCALE, profile.contactDistance * 0.45);
            const kickReleaseLift = Math.max(0.05 * SCALE, ballRadius * 0.45 + kickContactLift * 0.35);
            ball.mesh.position.addInPlace(new Vector3(
              kickReleaseDir.x * kickReleaseDistance,
              kickReleaseLift,
              kickReleaseDir.z * kickReleaseDistance,
            ));

            const flatToTable = new Vector3(
              tableTarget.x - ball.mesh.position.x,
              0,
              tableTarget.z - ball.mesh.position.z,
            );
            const distToTable = Math.max(0.12 * SCALE, flatToTable.length());
            const flatDir = flatToTable.lengthSquared() > 1e-5
              ? flatToTable.normalize()
              : new Vector3(0, 0, forwardSign);

            const kickFamilyBaseTimeScale = strikeFamily === 'header'
              ? 0.92
              : strikeFamily === 'chest'
                ? 0.88
                : strikeFamily === 'knee'
                  ? 0.84
                  : strikeFamily === 'foot'
                    ? 1.05
                    : 0.80;
            const kickFlight = computeKickFlightShape(kickFamilyBaseTimeScale, distToTable);
            // Foot kicks arc higher to clear the net; solve trajectory to a higher effective target
            let effectiveTargetY = tableTarget.y;
            if (strikeFamily === 'scissor') {
              effectiveTargetY = tableTarget.y + 0.60 * SCALE;
            } else if (strikeFamily === 'foot') {
              // Lift the solver target so the ballistic apex sits well above the
              // net (~1.16m) when the foot strikes a ball that has fallen near
              // the player's feet. Without this the trajectory stays flat and
              // clips the net.
              effectiveTargetY = tableTarget.y + 0.70 * SCALE;
            }

            // A power kick (double-tap) compresses the flight time so the ball
            // arrives noticeably faster and harder for the AI to reach.  Lowering
            // timeToTable raises BOTH horizontal and vertical speed, so the arc
            // still clears the net.
            const kickBoostTimeFactor = kickBoostActive ? 0.74 : 1.0;
            const timeToTable = Math.max(
              kickBoostActive ? 0.19 : 0.26,
              Math.min(
                1.10,
                (distToTable / Math.max(0.01, strikeSpeed * 0.82)) * strikeProfile.flightTimeScale * kickFlight.timeScale * kickBoostTimeFactor,
              ),
            );
            const horizontalSpeedBase = distToTable / Math.max(0.12, timeToTable);
            const horizontalSpeed = collisionDrill.enabled
              ? Math.min(4.2 * SCALE, horizontalSpeedBase)
              : horizontalSpeedBase;
            const dy = effectiveTargetY - ball.mesh.position.y;
            const vyBallistic = (dy + 0.5 * gravityAbs * timeToTable * timeToTable) / timeToTable;
            let vy = vyBallistic;
            if (collisionDrill.enabled) {
              vy += 0.06 * SCALE;
            }
            vy = Math.max(0.85 * SCALE, Math.min((kickBoostActive ? 10.0 : 8.4) * SCALE, vy));

            const launchVelocity = new Vector3(
              flatDir.x * horizontalSpeed,
              vy,
              flatDir.z * horizontalSpeed,
            );
            physicsBody.setLinearVelocity(launchVelocity);

            // Kick sound — only on actual kicks (not receptions / preparation).
            if (touchPhase === 'kick') {
              playKickSfx();
            }

            // ── P1 superpower consumption (kick phase only) ────────────────────
            // Armed with F, one use per set.  Messi launches a supercharged fiery
            // bullet; Maradona keeps the normal launch but arms an erratic motion
            // window that opens once the ball bounces on the opponent's table.
            if (playerSide === 0 && p1SuperArmed && p1SuperAvailable) {
              p1SuperArmed = false;
              p1SuperAvailable = false;
              lastSetCountForSuper = matchManager.sets[0] + matchManager.sets[1];
              // Make the kick unstoppable: lock the opponent out of the ball for
              // the rest of this rally so it cannot be retrieved.
              superKickInFlight = true;

              if (p1SelectedId === 'messi') {
                // Re-solve a very fast, flat ballistic to the SAME table cell so
                // it still lands in-bounds (a valid return) but arrives far too
                // fast for the opponent to reach.
                const superTime = 0.30;
                const superHoriz = distToTable / superTime;
                const superDy = effectiveTargetY - ball.mesh.position.y;
                const superVy = (superDy + 0.5 * gravityAbs * superTime * superTime) / superTime;
                launchVelocity.set(flatDir.x * superHoriz, superVy, flatDir.z * superHoriz);
                physicsBody.setLinearVelocity(launchVelocity);
                enableBallFire('messi', 1.0);
                console.log('[Superpower] Messi SUPERCHARGE kick launched');
              } else {
                maradonaCurveArmedBall = true;
                enableBallFire('maradona', 1.35);
                console.log('[Superpower] Maradona CHAOS CURVE armed for this ball');
              }
            }

            if (DEBUG_POST_RECEPTION_KICK) {
              lastPostReceptionKickDebug = {
                playerSide: attackerSide,
                action: strikeState.action,
                strikeFamily,
                targetX: tableTarget.x,
                targetY: tableTarget.y,
                targetZ: tableTarget.z,
                strikeX: kickContactAnchor.x,
                strikeY: kickContactAnchor.y,
                strikeZ: kickContactAnchor.z,
                launchX: launchVelocity.x,
                launchY: launchVelocity.y,
                launchZ: launchVelocity.z,
                distToTable,
                timeToTable,
                horizontalSpeed,
                vyBallistic,
                kickFlightDistanceT: kickFlight.distanceT,
                kickFlightTimeScale: kickFlight.timeScale,
                requestPower: requestPowerByPlayer[playerSide],
                ballLoft: animConfig ? Math.max(0, Math.min(1, animConfig.ballLoft)) : 0.5,
              };
              postKickGuideTimer = Math.max(0.10, timeToTable + 0.08);
              console.log('[kick-debug] post-reception launch', lastPostReceptionKickDebug);
            }

            // Realistic topspin: angular velocity ≈ v/r around axes perpendicular
            // to the kick direction so the ball visually rolls through the air.
            // Scale by 0.70 so the spin decays pleasingly under angularDamping(0.2).
            {
              const spinScale = 0.70 / Math.max(0.001, ballRadius);
              // Flat kick direction drives topspin; side-spin from ballSpinTwist drives yaw.
              const physAngX =  launchVelocity.z * spinScale;
              const physAngZ = -launchVelocity.x * spinScale;
              // yaw: a fraction of the current visual twist (ballSpinTwist is set below)
              const preTwist = flatDir.x * 7.5 + (strikeFamily === 'scissor' ? 3.5 : 1.8);
              const physAngY = preTwist * 1.8; // amplify for visible side-spin
              physicsBody.setAngularVelocity(new Vector3(physAngX, physAngY, physAngZ));
            }

            if (!collisionDrill.enabled) {
              buildReceptionForecastFromLaunch(attackerSide, ball.mesh.position.clone(), launchVelocity, tableTarget.z);
            }
            addBallSpinTwist(flatDir.x * 7.5 + (strikeFamily === 'scissor' ? 3.5 : 1.8));

            if (ENABLE_POST_KICK_DIRECTION_LOCK) {
              postKickLockTimer = collisionDrill.enabled ? 0.18 : 0.45;
              postKickLockSpeed = horizontalSpeed;
              postKickLockDir = flatDir.clone();
            } else {
              postKickLockTimer = 0;
              postKickLockSpeed = 0;
            }

            assist.hitApplied = true;
            assist.active = false;
            assist.action = null;
            strikeState.action = null;
            strikeState.timer = 0;
            character.clearStrikeBoneContactSnapshot();
            registerPlayerTouch(playerSide);
            canKickAfterReceptionByPlayer[playerSide] = false;
            if (ENABLE_ARCADE_RALLY_SCRIPT && !collisionDrill.enabled) {
              startArcadeRallyFlight(
                attackerSide,
                band,
                strikeSpeed,
                tableTarget,
                playerPos,
                defenderPos,
              );
              postKickGuideTimer = 0;
            }
            return true;
          }
          return influenced;
        }

        if (ENABLE_DRIBBLE_PUSH && postKickLockTimer <= 0 && distance <= playerPushRange) {
          const moveSpeed = Math.sqrt(velocityX ** 2 + velocityZ ** 2);
          if (moveSpeed <= 0.1) {
            return false;
          }
          const moveDir = new Vector3(velocityX, 0, velocityZ).normalize();
          const groundedFactor = ball.mesh.position.y <= ballRadius + 0.2 ? 1 : 0.35;
          const target = moveDir.scale(playerDribbleSpeed * groundedFactor);
          const blend = 0.12;
          physicsBody.setLinearVelocity(
            new Vector3(
              vel.x + (target.x - vel.x) * blend,
              vel.y,
              vel.z + (target.z - vel.z) * blend,
            )
          );
          registerPlayerTouch(playerSide);
          return true;
        }

        return false;
      };

      let influenceApplied = false;
      for (const side of interactionOrder) {
        if (influenceApplied) break;
        // Unstoppable super kick: the opponent (side 1) cannot touch the ball at
        // all while it is live, guaranteeing it gets past him.
        if (side === 1 && superKickInFlight) continue;
        const state = getSideInteractionState(side);
        const influenced = applyPlayerBallInfluence(
          state.character,
          state.rootPos,
          state.velocityX,
          state.velocityZ,
          state.assist,
          state.strikeState,
          side,
        );
        if (influenced) {
          influenceApplied = true;
          ballInteractionLockSide = side;
          ballInteractionLockTimer = ballInteractionOwnerHoldSeconds;
        }
      }

      if (!PURE_BALL_PHYSICS) {
        // Cap horizontal velocity
        const maxHorizontalSpeed = 8 * SCALE;
        const cappedVelocity = physicsBody.getLinearVelocity();
        const horizontalSpeed = Math.sqrt(cappedVelocity.x ** 2 + cappedVelocity.z ** 2);
        if (horizontalSpeed > maxHorizontalSpeed) {
          const scale = maxHorizontalSpeed / horizontalSpeed;
          physicsBody.setLinearVelocity(
            new Vector3(cappedVelocity.x * scale, cappedVelocity.y, cappedVelocity.z * scale)
          );
        }
      }

      if (ENABLE_BALL_OSCILLATION_GUARD) {
        // Anti ping-pong guard: detect rapid horizontal direction flips with almost
        // no displacement and damp/pop the ball out of opposing-plane oscillation.
        const oscillationVelocity = physicsBody.getLinearVelocity();
        const stepDx = ball.mesh.position.x - oscillationPrevPosition.x;
        const stepDz = ball.mesh.position.z - oscillationPrevPosition.z;
        const stepTravel = Math.sqrt(stepDx * stepDx + stepDz * stepDz);
        const flipX =
          oscillationPrevVelocity.x * oscillationVelocity.x < -0.01 &&
          Math.abs(oscillationPrevVelocity.x) >= ballOscillationMinFlipSpeed &&
          Math.abs(oscillationVelocity.x) >= ballOscillationMinFlipSpeed &&
          stepTravel <= ballOscillationMaxTravelPerFrame;
        const flipZ =
          oscillationPrevVelocity.z * oscillationVelocity.z < -0.01 &&
          Math.abs(oscillationPrevVelocity.z) >= ballOscillationMinFlipSpeed &&
          Math.abs(oscillationVelocity.z) >= ballOscillationMinFlipSpeed &&
          stepTravel <= ballOscillationMaxTravelPerFrame;

        oscillationWindowTimer = Math.max(0, oscillationWindowTimer - deltaTime);
        if (flipX || flipZ) {
          if (oscillationWindowTimer <= 0) {
            oscillationFlipCountX = 0;
            oscillationFlipCountZ = 0;
          }
          oscillationWindowTimer = ballOscillationWindow;
          if (flipX) oscillationFlipCountX += 1;
          if (flipZ) oscillationFlipCountZ += 1;
        } else if (oscillationWindowTimer <= 0) {
          oscillationFlipCountX = 0;
          oscillationFlipCountZ = 0;
        }

        const oscillatingX = oscillationFlipCountX >= ballOscillationFlipThreshold;
        const oscillatingZ = oscillationFlipCountZ >= ballOscillationFlipThreshold;
        if (oscillatingX || oscillatingZ) {
          const dampedVelocity = new Vector3(
            oscillatingX ? oscillationVelocity.x * ballOscillationDampFactor : oscillationVelocity.x,
            Math.max(oscillationVelocity.y, ballOscillationPopY),
            oscillatingZ ? oscillationVelocity.z * ballOscillationDampFactor : oscillationVelocity.z,
          );
          physicsBody.setLinearVelocity(dampedVelocity);
          postKickLockTimer = 0;
          postKickLockSpeed = 0;

          const p1DistSq = Vector3.DistanceSquared(ball.mesh.position, charRoot1.position);
          const p2DistSq = Vector3.DistanceSquared(ball.mesh.position, charRoot2.position);
          const nearestPlayerPos = p1DistSq <= p2DistSq ? charRoot1.position : charRoot2.position;
          const awayFromPlayer = ball.mesh.position.subtract(nearestPlayerPos);
          awayFromPlayer.y = 0;
          let awayNormal = Vector3.Zero();
          const awayLenSq = awayFromPlayer.lengthSquared();
          if (awayLenSq > 1e-6) {
            awayNormal = awayFromPlayer.scale(1 / Math.sqrt(awayLenSq));
          } else if (oscillatingX) {
            awayNormal = new Vector3(Math.sign(dampedVelocity.x) || 1, 0, 0);
          } else {
            awayNormal = new Vector3(0, 0, Math.sign(dampedVelocity.z) || 1);
          }
          ball.mesh.position.addInPlace(new Vector3(
            awayNormal.x * ballOscillationNudge,
            0.06 * SCALE,
            awayNormal.z * ballOscillationNudge,
          ));

          oscillationWindowTimer = 0;
          oscillationFlipCountX = 0;
          oscillationFlipCountZ = 0;
        }
      }

      oscillationPrevVelocity.copyFrom(physicsBody.getLinearVelocity());
      oscillationPrevPosition.copyFrom(ball.mesh.position);

      // Drive both player animations from their own controls.
      // Convert world-space velocity to local-space relative to facing direction (toward ball)
      const getLocalMovement = (inputX: number, inputZ: number, facingAngle: number): { localX: number; localZ: number } => {
        const speed = Math.sqrt(inputX ** 2 + inputZ ** 2);
        if (speed < 0.05) return { localX: 0, localZ: 0 };

        const nx = inputX / speed;
        const nz = inputZ / speed;

        // facing = atan2(toBall.x, toBall.z), so direction vector is (sin(facing), cos(facing))
        // Local space: Z+ forward (toward ball), X+ right (perpendicular)
        const sin = Math.sin(facingAngle);
        const cos = Math.cos(facingAngle);
        
        // Project input direction onto local basis vectors.
        const localZ = nx * sin + nz * cos;       // toward ball
        const localX = nx * cos - nz * sin;       // right of ball

        // Preserve movement magnitude so tiny assist corrections do not become
        // full-direction animation flips.
        const moveScale = Math.min(1, speed);
        return {
          localX: localX * moveScale,
          localZ: localZ * moveScale,
        };
      };

      // Decrement per-player serve-anim timers (set when animation starts).
      p1ServeAnimLockTimer = Math.max(0, p1ServeAnimLockTimer - deltaTime);
      p2ServeAnimLockTimer = Math.max(0, p2ServeAnimLockTimer - deltaTime);

      // Lock setMovement for the full clip duration so the kick frame and
      // follow-through can play even after the physics state machine has
      // deactivated the serve (missed contact window expires before kick frame).
      const p1ServeAnimLocked = (serveState.active && serveState.server === 0) || p1ServeAnimLockTimer > 0;
      const p2ServeAnimLocked = (serveState.active && serveState.server === 1) || p2ServeAnimLockTimer > 0;

      // While the celebration window is open we must NOT call setMovement —
      // its fall-through plays the looping 'idle' clip every frame, which
      // would clobber the celebration / defeat one-shot we just queued.
      const celebrationActive = celebrationWindowTimer > 0;

      if (player1 && !p1ServeAnimLocked && !celebrationActive) {
        const local1 = getLocalMovement(p1MoveX, p1MoveZ, p1Motion.facing);
        const p1DistToBall = Math.sqrt((ball.mesh.position.x - charRoot1.position.x) ** 2 + (ball.mesh.position.z - charRoot1.position.z) ** 2);
        const p1QuickBoost = physicsBody.getLinearVelocity().y < -0.25 * SCALE
          ? Math.max(1.0, Math.min(1.35, 1.35 - p1DistToBall * 0.09))
          : 1.0;
        const p1SpeedRatio =
          (Math.sqrt(p1Motion.vx ** 2 + p1Motion.vz ** 2) / Math.max(0.001, playerMoveSpeed)) * p1QuickBoost * playerJogAnimSpeed;
        player1.setMovement(local1.localX, -local1.localZ, false, deltaTime, p1SpeedRatio);
      }
      if (player2 && !p2ServeAnimLocked && !celebrationActive) {
        const local2 = getLocalMovement(p2MoveX, p2MoveZ, p2Motion.facing);
        const p2DistToBall = Math.sqrt((ball.mesh.position.x - charRoot2.position.x) ** 2 + (ball.mesh.position.z - charRoot2.position.z) ** 2);
        const p2QuickBoost = physicsBody.getLinearVelocity().y < -0.25 * SCALE
          ? Math.max(1.0, Math.min(1.35, 1.35 - p2DistToBall * 0.09))
          : 1.0;
        const p2SpeedRatio =
          (Math.sqrt(p2Motion.vx ** 2 + p2Motion.vz ** 2) / Math.max(0.001, playerMoveSpeed)) * p2QuickBoost * playerJogAnimSpeed;
        player2.setMovement(local2.localX, -local2.localZ, false, deltaTime, p2SpeedRatio);
      }

      updateServeSequence(deltaTime);

      // Serve-type selector HUD — visible only while server is in the ready phase.
      updateServeSelectorUI(
        serveState.serveType,
        serveState.active && serveState.phase === 'ready',
      );

      pointVFXSystem?.update(deltaTime);

      // UI updates are driven by EventBus and BabylonJS animations via UIManager.

      // Opening cinematic establishing shot — runs once at the very start, then
      // the camera is fixed and only the subtle target-follow below stays active.
      if (!cameraIntroDone) {
        // Hide the "3" countdown numeral while the cinematic plays.
        if (!cameraIntroHudHidden) {
          EventBus.emit('serve:countdown', null);
          cameraIntroHudHidden = true;
        }
        cameraIntroElapsed += Math.min(deltaTime, 0.05); // clamp first-frame spikes
        const t = Math.min(1, cameraIntroElapsed / cameraIntroDuration);
        // easeInOutQuad so the sweep accelerates and decelerates smoothly.
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        camera.alpha = cameraIntroBaseAlpha - e * Math.PI * 2;
        camera.beta = cameraIntroStartBeta + (cameraIntroBaseBeta - cameraIntroStartBeta) * e;
        camera.radius = cameraIntroStartRadius + (cameraIntroBaseRadius - cameraIntroStartRadius) * e;
        if (t >= 1) {
          camera.alpha = cameraIntroBaseAlpha;
          camera.beta = cameraIntroBaseBeta;
          camera.radius = cameraIntroBaseRadius;
          cameraIntroDone = true;
          // Camera has settled — reveal the countdown so "3-2-1" starts now.
          EventBus.emit('serve:countdown', preServeCountdownTimer > 0 ? preServeCountdownTimer : null);
        }
      }

      // Subtle camera follow based on ball motion/position, independent of keys.
      const ballVel = physicsBody.getLinearVelocity();
      const desiredOffsetX = Math.max(
        -cameraFollowMaxOffsetX,
        Math.min(cameraFollowMaxOffsetX, ball.mesh.position.x * 0.15 + ballVel.x * 0.08)
      );
      const desiredOffsetZ = Math.max(
        -cameraFollowMaxOffsetZ,
        Math.min(cameraFollowMaxOffsetZ, ball.mesh.position.z * 0.18 + ballVel.z * 0.08)
      );
      const desiredTarget = new Vector3(
        cameraBaseTarget.x + desiredOffsetX,
        cameraBaseTarget.y,
        cameraBaseTarget.z + desiredOffsetZ,
      );
      camera.target = Vector3.Lerp(camera.target, desiredTarget, cameraFollowStrength);

      // Track previous-frame vertical velocity so bounce checks only trigger on real rebounds.
      previousBallPosition.copyFrom(ball.mesh.position);
      previousBallVelocityY = physicsBody.getLinearVelocity().y;
    });

    EventBus.on('match:restart', () => {
      clearPointResultAnimations();
      matchManager.restartMatch();
      resetBallForServe(0);
    });

    // Render loop is started by startGame() — deferred so landing.js
    // can preload the scene during intro and start rendering only on Play.
    if (!(window as Window & { __deferGameStart?: boolean }).__deferGameStart) {
      engine.render(gameScene);
      window.addEventListener('resize', () => engine.getNativeEngine().resize());
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.innerHTML = `<p style="color: #ff6b6b;">Error: ${errorMsg}</p>`;
    }
  }
}

/**
 * Preloads the entire game scene (Havok, GLBs, physics, game logic) in the
 * background while the landing intro plays.  The canvas must be in the DOM
 * with non-zero dimensions when this is called (landing.js adds the
 * `preloading` CSS class to #game-screen for this).
 */
export async function preloadGame(): Promise<void> {
  (window as Window & { __deferGameStart?: boolean }).__deferGameStart = true;
  await main();
}

/**
 * Starts the render loop after preloadGame() has completed.
 * Called by landing.js the instant the user clicks Play.
 */
// ── Compatibility exports for V1 landing.js ──────────────────────────────────
// These are called by landing.js (V1 shell) to control the game after the
// scene is loaded.  V2 does not have a global _gameFrozen toggle; we
// repurpose pointFreezeActive so input & physics are suppressed while the
// menu is shown (e.g. user pressed ← Menu).

let _menuFreezeActive = false;

export function freezeGame(): void {
  _menuFreezeActive = true;
  pointFreezeActive = true;
}

export function unfreezeGame(): void {
  _menuFreezeActive = false;
  pointFreezeActive = false;
}

export function restartMatch(): void {
  // clearPointResultAnimations is inner-scoped; emit the bus event instead
  // so the listener registered inside main() handles the full reset.
  EventBus.emit('match:restart', undefined);
  _menuFreezeActive = false;
  pointFreezeActive = false;
}

/** No-op shim: V2 has no background music manager. */
export function stopMusic(): void {
  // intentionally empty — V2 has no MusicManager
}

export function startGame(): void {
  if (!_babylonEngine || !gameScene) {
    throw new Error('startGame() called before preloadGame() completed');
  }
  _babylonEngine.render(gameScene);
  window.addEventListener('resize', () => _babylonEngine!.getNativeEngine().resize());
}


