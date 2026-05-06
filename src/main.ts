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

import { BabylonEngine } from './core/Engine';
import { AssetManager } from './core/AssetManager';
import { EventBus } from './core/EventBus';
import { UIManager } from './ui/UIManager';
import type { PointScoredEvent } from './ui/HUD';
import { Scene } from '@babylonjs/core/scene';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Ball } from './entities/Ball';
import { Character } from './entities/Character';
import { CharacterStats } from './core/interfaces';
import { MatchManager } from './gameplay/MatchManager';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import HavokPhysics from '@babylonjs/havok';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
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
import neymarAnimData from './data/characters/neymar.json';

const SCALE = 1.5; // Global scale factor

let gameScene: Scene;
let assetManager: AssetManager;
let ball: Ball;
let player1: Character;
let player2: Character;
let matchManager: MatchManager;
let inputManager: InputManager;
let uiManager: UIManager | undefined;
const pressedKeys = new Set<string>();
const controlKeys = new Set(['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's', 'space']);
controlKeys.add('enter');
controlKeys.add('q');
controlKeys.add('e');
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
const DOUBLE_TAP_WINDOW_MS = 260;
const pendingPrepSuperHigh: [boolean, boolean] = [false, false];
const pendingKickPowerBoost: [boolean, boolean] = [false, false];
// D-pad aim snapshot captured at the moment the human player presses the kick button.
// x: -1 (left) / 0 (center) / +1 (right), z: -1 (near/net) / 0 / +1 (far/deep)
const p1KickAim = { x: 0, z: 0 };
// Hold-to-charge: timestamp (ms) when Space was pressed, -1 = not charging.
let p1KickChargeStart = -1;
// Grace-period auto-kick: timestamp (ms) when the kick phase started for P1, -1 = not counting.
let p1KickGraceStart = -1;
const P1_KICK_GRACE_MS = 2500;
// Power multiplier consumed at kick-hit time (set on Space release).
const p1KickPowerMult = { value: 1.0 };
// Maps hold duration (ms) to a speed multiplier relative to the clip's default speed.
const KICK_CHARGE_TABLE: Array<[number, number]> = [
  [300,      0.80],
  [700,      1.00],
  [1200,     1.20],
  [2000,     1.45],
  [Infinity, 1.75],
];
let animationPreviewMode = false;
let animationPreviewPlayer = 1;
let animationPreviewClipIndex = 0;
let animationPreviewMirror = false;
let animationPreviewSpeed = 1.0;
let animationPreviewFacingFlip = false;
let animationPreviewLockedYaw: number | null = null;
// Spawn ball well above the table surface (table top is ~0.76 m; ball radius 0.11 m)
const BALL_SPAWN_POSITION = new Vector3(0, 1.5 * SCALE, 0);
const BALL_MAX_UPWARD_SPEED = 8 * SCALE;
const BALL_MAX_DOWNWARD_SPEED = 18 * SCALE;
const BALL_RESET_HEIGHT = 8 * SCALE;
const BALL_RESET_MIN_Y = -4 * SCALE;
const BALL_RESET_X_LIMIT = 10 * SCALE;
const BALL_RESET_Z_LIMIT = 14 * SCALE;
const PLAYER_MODEL_YAW_OFFSET = -Math.PI / 2;
const ENABLE_P1_AI = true; // AI vs AI preview mode
const ENABLE_P2_AI = true;
const SERVE_LINE_Z = 3.5 * SCALE;
const PLAYER_SPAWN_Z = 4.2 * SCALE;
const PLAYER_TABLE_CLEARANCE_Z = 2.3 * SCALE;
const PURE_BALL_PHYSICS = true;
const ENABLE_BALL_ASSIST = !PURE_BALL_PHYSICS; // scripted ball arcs for auto-touches + aim kick
const TABLE_SCALE = 1.0;
const WORLD_BOUNCE_RESTITUTION = 0.82;
const TABLE_BOUNCE_RESTITUTION = 0.84;
const BALL_BOUNCE_RESTITUTION = 0.84;
const GLOBAL_KICK_VELOCITY_MULTIPLIER = 1.20;
const ENABLE_NO_GROUND_FALL_GUARD = true;
const NO_GROUND_FALL_TRIGGER_HEIGHT = 0.07 * SCALE;
const NO_GROUND_FALL_REBOUND_MIN_SPEED = 2.2 * SCALE;
const NO_GROUND_FALL_RESTITUTION = 0.82;
const NO_GROUND_FALL_LATERAL_DAMPING = 0.97;
const getCourtCenterFacing = (position: Vector3): number => Math.atan2(-position.x, -position.z);
const getLateralReceptionFacing = (position: Vector3, ballPosition: Vector3): number => {
  const centerFacing = getCourtCenterFacing(position);
  const towardBallSide = ballPosition.x >= position.x ? -1 : 1;
  return centerFacing + towardBallSide * (Math.PI / 2);
};
// Bleachers scene meshes provide all world collisions (floor, stands, table).
const AI_BEHIND_SERVE_TARGET_Z = SERVE_LINE_Z + 0.55 * SCALE;
const AI_PREP_STEP_IN_TARGET_Z = SERVE_LINE_Z - 0.65 * SCALE;
const AI_FINAL_KICK_TARGET_Z = SERVE_LINE_Z - 1.00 * SCALE;
const AI_SHORT_RETURN_STEP_IN_Z = SERVE_LINE_Z - 0.35 * SCALE;
const AI_LOW_SPEED_RETURN_THRESHOLD = 2.8 * SCALE;
const SERVE_READY_PAUSE_SECONDS = 0.35;
const SERVE_FLIGHT_LOCK_MAX_SECONDS = PURE_BALL_PHYSICS ? 4.0 : 1.6;
const SERVE_TOSS_RIGHT_ANGLE_DEG = -45;
const SERVE_TOSS_FORWARD_ANGLE_DEG = -30;
const SERVE_TOSS_HEIGHT_MULT = 3.15;
const SERVE_TOSS_CONTACT_RIGHT_MAX = 0.16;
const SERVE_TOSS_CONTACT_FORWARD_MAX = 0.12;

type CourtSide = 0 | 1; // 0 = P1/negative Z side, 1 = P2/positive Z side
type OffensiveAction =
  | 'header' | 'chest' | 'knee' | 'scissor' // legacy aliases
  | 'receptionChest' | 'receptionToe' | 'receptionInnerRight'
  | 'prepChest' | 'prepInnerRight'
  | 'kickCloseHead' | 'kickCloseRightFoot' | 'kickHead'
  | 'kickHighLeft' | 'kickJumpHead' | 'kickSoleRight' | 'kickBicycleLeft' | 'kickChest';
const SOCKET_HEIGHT_CALIBRATION_ACTIONS: OffensiveAction[] = [
  'receptionChest',
  'receptionToe',
  'receptionInnerRight',
  'prepChest',
  'prepInnerRight',
  'kickCloseHead',
  'kickCloseRightFoot',
  'kickHead',
  'kickHighLeft',
  'kickJumpHead',
  'kickSoleRight',
  'kickBicycleLeft',
  'kickChest',
];
type ServePhase = 'ready' | 'toss' | 'strike' | 'flight';
type ServeState = {
  active: boolean;
  server: CourtSide;
  phase: ServePhase;
  timer: number;
  tossReleased: boolean;
  strikeApplied: boolean;
  animationStarted: boolean;
  foot: 'left' | 'right';
  hand: 'left' | 'right';
};

const serveState: ServeState = {
  active: false,
  server: 0,
  phase: 'ready',
  timer: 0,
  tossReleased: false,
  strikeApplied: false,
  animationStarted: false,
  foot: 'right',
  hand: 'left',
};

export async function main(): Promise<void> {
  try {
    // Get canvas
    const canvasElement = document.getElementById('renderCanvas');
    if (!canvasElement || !(canvasElement instanceof HTMLCanvasElement)) {
      throw new Error('Canvas element not found or invalid');
    }
    const canvas = canvasElement;

    // Initialize BabylonJS Engine
    const engine = BabylonEngine.init(canvas);

    // Create game scene
    gameScene = new Scene(engine.getNativeEngine());
    gameScene.collisionsEnabled = true;

    // Setup camera
    const camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2,
      Math.PI / 3,
      20 * SCALE,
      new Vector3(0, 0, 0),
      gameScene
    );
    camera.attachControl(canvas, true);
    camera.wheelPrecision = 50;
    // Arrow keys are reserved for player controls; keep mouse/touch camera input.
    camera.keysUp = [];
    camera.keysDown = [];
    camera.keysLeft = [];
    camera.keysRight = [];

    // Camera follows the ball target subtly (not a hard chase cam).
    const cameraBaseTarget = new Vector3(0, 0, 0);
    const cameraFollowStrength = 0.18;
    const cameraFollowMaxOffsetX = 1.8 * SCALE;
    const cameraFollowMaxOffsetZ = 2.2 * SCALE;

    // Setup lighting - increase intensity for better visibility
    const light = new HemisphericLight('light', new Vector3(0, 1, 0), gameScene);
    light.intensity = 1.2;

    // ------------------------------------------------------------------
    // Collision layers (bit masks)
    //   COL_BALL   = 1  — ball; listens for and triggers everything
    //   COL_WORLD  = 2  — static geometry (floor, walls, table)
    //   COL_PLAYER = 4  — player bodies (no player-player collisions)
    // ------------------------------------------------------------------
    const COL_BALL   = 1;
    const COL_WORLD  = 2;
    const COL_PLAYER = 4;

    // Initialize physics engine
    const havokInstance = await HavokPhysics({
      locateFile: () => '/HavokPhysics.wasm'
    });
    const havokPlugin = new HavokPlugin(true, havokInstance);
    gameScene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin);

    // Run physics at 120 Hz (half-step) — halves the tunnelling window
    // for fast-moving objects like the ball passing through thin surfaces.
    havokPlugin.setTimeStep(1 / 120);

    // Bump solver iterations from the Havok default (4) to 10 velocity + 4 position.
    // The extra passes significantly improve ball-to-curved-surface contact accuracy
    // for a sports simulation at the cost of a small (~15 %) CPU overhead.
    const hk = (havokPlugin as any)._hknp as Record<string, (...a: unknown[]) => unknown> | undefined;
    const havokWorld = (havokPlugin as any).world as unknown;
    if (hk && havokWorld !== undefined) {
      (hk['HP_World_SetNumConstraintSolverVelocityIterations'] as Function)?.(havokWorld, 10);
      (hk['HP_World_SetNumConstraintSolverPositionIterations'] as Function)?.(havokWorld, 4);
    }

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

    // ── Load bleachers.glb (stands + playing surface + Teqboard visual) ──────
    const bleachersData = await assetManager.loadModel('bleachers');
    if (bleachersData.meshes.length > 0) {
      bleachersData.meshes[0].position = Vector3.Zero();
    }

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

    // All world collisions now come from bleachers.glb geometry.
    // This includes the court floor, table, and surrounding structures.
    const bleacherCollisionMeshes = bleachersData.meshes.filter((mesh) => mesh.getTotalVertices() > 0);
    const tableNameHints = ['table', 'teq', 'board'];
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
          const hpShape = (mesh.physicsBody.shape as any)._pluginData?.hpShape as unknown;
          if (hk && hpShape !== undefined) {
            (hk['HP_Shape_SetWeldingType'] as Function)?.(hpShape, 3);
          }
        }
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
      const courtBounds = courtFloorMesh.getHierarchyBoundingVectors(true);
      courtCenterX = (courtBounds.min.x + courtBounds.max.x) * 0.5;
      courtCenterZ = (courtBounds.min.z + courtBounds.max.z) * 0.5;
      courtHalfWidth = Math.max(0.001, (courtBounds.max.x - courtBounds.min.x) * 0.5);
      courtHalfLength = Math.max(0.001, (courtBounds.max.z - courtBounds.min.z) * 0.5);
      lineY = courtBounds.max.y + 0.004 * SCALE;
    }

    const whiteColor = Color3.White();
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
    halfwayLine.color = whiteColor;

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
    serviceLineTop.color = whiteColor;

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
    serviceLineBottom.color = whiteColor;

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
    boundary.color = whiteColor;

    // Fully procedural ball (visual + physics) to avoid GLB hierarchy issues
    // during serve toss and strike contact windows.

    const desiredDiameter = 0.22 * SCALE;
    const ballRadius = desiredDiameter / 2;
    const getTableBallContactY = (): number => tableProfile.surfaceY + ballRadius;
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

    const ballPhysicsMesh = MeshBuilder.CreateSphere(
      'ballPhysics',
      { diameter: desiredDiameter, segments: 24 },
      gameScene,
    );
    ballPhysicsMesh.position = BALL_SPAWN_POSITION.clone();
    ballPhysicsMesh.visibility = 0;
    ballPhysicsMesh.isPickable = false;

    const ballRootMesh = MeshBuilder.CreateSphere(
      'ballVisual',
      { diameter: desiredDiameter * 0.985, segments: 24 },
      gameScene,
    );
    ballRootMesh.setParent(ballPhysicsMesh);
    ballRootMesh.position = Vector3.Zero();
    ballRootMesh.rotation = Vector3.Zero();
    ballRootMesh.isPickable = false;

    const ballMaterial = new StandardMaterial('ballMaterial', gameScene);
    ballMaterial.diffuseColor = new Color3(0.97, 0.97, 0.97);
    ballMaterial.specularColor = new Color3(0.28, 0.28, 0.28);
    ballMaterial.emissiveColor = new Color3(0.04, 0.04, 0.04);
    ballRootMesh.material = ballMaterial;

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

      const hpBallBody = (ballPhysicsMesh.physicsBody as any)._pluginData?.hpBody as unknown;
      if (hk && hpBallBody !== undefined) {
        (hk['HP_Body_SetDeactivationEnabled'] as Function)?.(hpBallBody, false);
        (hk['HP_Body_SetQualityType'] as Function)?.(hpBallBody, 5);
      }
    }

    const addBallSpinTwist = (amount: number): void => {
      ballSpinTwist = Math.max(-18, Math.min(18, ballSpinTwist + amount));
    };

    const updateBallVisualSpin = (deltaTime: number): void => {
      if (!ball?.mesh?.physicsBody) return;

      const v = ball.mesh.physicsBody.getLinearVelocity();
      const wx = v.z / Math.max(0.001, ballRadius);
      const wz = -v.x / Math.max(0.001, ballRadius);

      // Arcade-readability spin: roll follows velocity + controllable side-spin.
      ballRootMesh.rotation.x += wx * deltaTime * 0.85;
      ballRootMesh.rotation.z += wz * deltaTime * 0.85;
      ballRootMesh.rotation.y += ballSpinTwist * deltaTime * 0.25;

      if (!PURE_BALL_PHYSICS) {
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
      const tableContactCenterY = getTableBallContactY();
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

      if (!((crossedPlaneFromAbove && sweptOverTable) || deepInsideFallback)) {
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

    const resetBallForServe = (server: number): void => {
      if (!ball?.mesh || !ball.mesh.physicsBody) {
        return;
      }

      const serverSide: CourtSide = server === 0 ? 0 : 1;
      const serveConfig = getAnimConfigForClip('serve');
      const foot: 'left' | 'right' = serverSide === 0 ? 'right' : 'left';
      const hand: 'left' | 'right' = serveConfig?.serveHand ?? 'left';
      serveState.active = true;
      serveState.server = serverSide;
      serveState.phase = 'ready';
      serveState.timer = 0;
      serveState.tossReleased = false;
      serveState.strikeApplied = false;
      serveState.animationStarted = false;
      serveState.foot = foot;
      serveState.hand = hand;

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

      const serveLoft = serveConfig ? Math.max(0, Math.min(1, serveConfig.ballLoft)) : 0.4;
      const handHeight = (0.94 + serveLoft * 0.07) * SCALE;
      const facing = servingPlayer.rotation.y;
      const forward = new Vector3(Math.sin(facing), 0, Math.cos(facing));
      const servingCharacter = serverSide === 0 ? player1 : player2;
      const handBase = servingCharacter?.getHandControlPosition(hand)
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

      const servePosition = new Vector3(
        tossAnchor.x,
        tossAnchor.y,
        tossAnchor.z,
      );

      ball.mesh.position.copyFrom(servePosition);
      ball.mesh.rotation.set(0, 0, 0);
      ball.mesh.physicsBody.setLinearVelocity(Vector3.Zero());
      ball.mesh.physicsBody.setAngularVelocity(Vector3.Zero());
      resetBallOscillationGuard();
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
      rallyPhaseByPlayer[0] = 'defense';
      rallyPhaseByPlayer[1] = 'defense';
      bouncesOnSideSinceLastTouch[0] = 0;
      bouncesOnSideSinceLastTouch[1] = 0;
      tableBouncesOnSideSinceLastTouch[0] = 0;
      tableBouncesOnSideSinceLastTouch[1] = 0;
      bounceEventCooldown = 0;
      serveBounceGrace = 0;
      pendingPrepSuperHigh[0] = false;
      pendingPrepSuperHigh[1] = false;
      pendingKickPowerBoost[0] = false;
      pendingKickPowerBoost[1] = false;
    };

    const emitPointScored = (team: 1 | 2): void => {
      EventBus.emit<PointScoredEvent>('match:pointScored', {
        team,
        score: [matchManager.score[0], matchManager.score[1]],
        sets:  [matchManager.sets[0],  matchManager.sets[1]],
      });
    };

    const awardPoint = (scoringTeam: number): void => {
      matchManager.recordPoint(scoringTeam);
      emitPointScored((scoringTeam + 1) as 1 | 2);
      clearRallyState();

      if (matchManager.isMatchActive) {
        resetBallForServe(matchManager.currentServer);
      }
    };

    const restartServeNoPoint = (): void => {
      if (serveState.active) {
        const doubleFaultOpponent = matchManager.recordFailedServe(serveState.server);
        if (doubleFaultOpponent !== null) {
          // Double fault: point already recorded inside recordFailedServe; just
          // run the post-point side effects (announcement, reset).
          emitPointScored((doubleFaultOpponent + 1) as 1 | 2);
          clearRallyState();
          if (matchManager.isMatchActive) {
            resetBallForServe(matchManager.currentServer);
          }
          return;
        }
      }
      clearRallyState();
      resetBallForServe(matchManager.currentServer);
    };

    const quickRestartRally = (server: CourtSide = 0): void => {
      // Preserve score/sets but restart a clean serve instantly for fast visual iteration.
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
      closetablelowheadkick: { startYawDeg: 180, mirrorStartYawDeg: 180, endYawDeg: 5, mirrorEndYawDeg: 5 },
      closetablelowheadkick001: { startYawDeg: 180, mirrorStartYawDeg: 180, endYawDeg: 5, mirrorEndYawDeg: 5 },
      closetablerightfootkick: { startYawDeg: 0, mirrorStartYawDeg: 0, endYawDeg: 5, mirrorEndYawDeg: 5 },
      headkick: { startYawDeg: 0, mirrorStartYawDeg: 0, endYawDeg: 5, mirrorEndYawDeg: 5 },
      hearserve: { startYawDeg: 0, mirrorStartYawDeg: 0, endYawDeg: 5, mirrorEndYawDeg: 5 },
      highkickleftfoot: { startYawDeg: 180, mirrorStartYawDeg: 180, endYawDeg: 5, mirrorEndYawDeg: 5 },
      jogbackward: { startYawDeg: 180, mirrorStartYawDeg: 180, endYawDeg: 5, mirrorEndYawDeg: 5 },
      jogforward: { startYawDeg: 180, mirrorStartYawDeg: 180, endYawDeg: 5, mirrorEndYawDeg: 5 },
      jogforward001: { startYawDeg: 0, mirrorStartYawDeg: 0, endYawDeg: 5, mirrorEndYawDeg: 5 },
      jogstrafeleft: { startYawDeg: 90, mirrorStartYawDeg: 90, endYawDeg: 5, mirrorEndYawDeg: 5 },
      jogstraferight: { startYawDeg: 0, mirrorStartYawDeg: 0, endYawDeg: 5, mirrorEndYawDeg: 5 },
      jumpheadkick: { startYawDeg: 180, mirrorStartYawDeg: 180, endYawDeg: 5, mirrorEndYawDeg: 5 },
      quickjogforward: { startYawDeg: 180, mirrorStartYawDeg: 180, endYawDeg: 5, mirrorEndYawDeg: 5 },
      rightkneereception: { startYawDeg: 90, mirrorStartYawDeg: 90, endYawDeg: 5, mirrorEndYawDeg: 5 },
      righttoefootreception: { startYawDeg: 5, mirrorStartYawDeg: 5, endYawDeg: 5, mirrorEndYawDeg: 5 },
      serveleftfoot: { startYawDeg: 60, mirrorStartYawDeg: 60, endYawDeg: 5, mirrorEndYawDeg: 5 },
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

      const servingPlayer = serveState.server === 0 ? charRoot1 : charRoot2;
      const servingCharacter = serveState.server === 0 ? player1 : player2;
      const strikeDirection = serveState.server === 0 ? 1 : -1;
      const facing = servingPlayer.rotation.y;
      const forward = new Vector3(Math.sin(facing), 0, Math.cos(facing));
      const right = new Vector3(forward.z, 0, -forward.x);
      const serveConfig = getAnimConfigForClip('serve');
      const serveLoft = serveConfig ? Math.max(0, Math.min(1, serveConfig.ballLoft)) : 0.4;
      const serveReachUnits = resolveAnimReachUnits(serveConfig, 1.2);
      const serveReach = Math.max(0.60 * SCALE, Math.min(2.0 * SCALE, serveReachUnits * SCALE));
      const clipLengthFrames = Math.max(1, Math.round(serveConfig?.clipLengthFrames ?? 146));
      const tossFrame = Math.max(1, Math.min(clipLengthFrames, Math.round(serveConfig?.tossFrame ?? 1)));
      const contactFrame = Math.max(tossFrame + 1, Math.min(clipLengthFrames, Math.round(serveConfig?.contactFrame ?? 55)));
      const rawWindowStart = serveConfig?.contactWindow?.[0] ?? contactFrame;
      const rawWindowEnd = serveConfig?.contactWindow?.[1] ?? Math.min(clipLengthFrames, contactFrame + 11);
      const strikeWindowStartFrame = Math.max(0, Math.min(contactFrame, Math.min(rawWindowStart, rawWindowEnd)));
      const strikeWindowEndFrame = Math.max(strikeWindowStartFrame, Math.min(clipLengthFrames, Math.max(rawWindowStart, rawWindowEnd)));

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
      const headControlPos = servingCharacter?.getHeadControlPosition() ?? servingPlayer.position.add(new Vector3(0, 1.72 * SCALE, 0));
      const headHeightFromGround = Math.max(1.40 * SCALE, headControlPos.y - servingPlayer.position.y);
      const headContactBase = new Vector3(
        headControlPos.x,
        servingPlayer.position.y + headHeightFromGround,
        headControlPos.z,
      );
      const targetApexY = headContactBase.y + ((0.17 + serveLoft * 0.04) * SERVE_TOSS_HEIGHT_MULT) * SCALE;

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
        headContactBase.x + right.x * clampedRightOffset + forward.x * clampedForwardOffset,
        headContactBase.y,
        headContactBase.z + right.z * clampedRightOffset + forward.z * clampedForwardOffset,
      );

      const serveBounceHalfWidth = Math.max(0.35 * SCALE, Math.min(0.65 * TABLE_SCALE, tableProfile.halfWidth * 0.78));
      const serveBounceDepth = Math.max(0.28 * SCALE, Math.min(0.58 * TABLE_SCALE, tableProfile.halfLength * 0.35));
      const serveBounceTarget = new Vector3(
        Math.max(
          tableProfile.centerX - serveBounceHalfWidth,
          Math.min(tableProfile.centerX + serveBounceHalfWidth, tableProfile.centerX + servingPlayer.position.x * 0.22),
        ),
        getTableBallContactY() + ballRadius * 0.96,
        tableProfile.centerZ + strikeDirection * serveBounceDepth,
      );
      const tossDelta = contactAnchor.subtract(tossAnchor);
      const tossVelocity = new Vector3(
        tossDelta.x / timeFromTossToContact,
        gravityAbs * timeToApex,
        tossDelta.z / timeFromTossToContact,
      );
      tossVelocity.y = Math.max(2.2 * SCALE, Math.min(6.8 * SCALE, tossVelocity.y));

      if (serveState.phase === 'ready') {
        // Keep server in neutral pose during ready so R-interrupted serves
        // cannot carry over stale head/hand transforms into a new toss.
        servingCharacter?.playAnimation('idle', true);
        serveState.timer += deltaTime;
        ball.mesh.position.copyFrom(tossAnchor);
        ball.mesh.physicsBody.setLinearVelocity(Vector3.Zero());
        ball.mesh.physicsBody.setAngularVelocity(Vector3.Zero());
        return;
      }

      if (serveState.phase === 'toss') {
        if (serveState.timer <= 0) {
          ball.mesh.position.copyFrom(tossAnchor);
          ball.mesh.physicsBody.setAngularVelocity(Vector3.Zero());
          ball.mesh.physicsBody.setLinearVelocity(Vector3.Zero());
          serveState.tossReleased = false;

          if (!serveState.animationStarted) {
            serveState.animationStarted = true;
            servingCharacter?.playAnimation('serve', false);
          }
        }

        // Keep ball in hand until the configured toss frame; frame 1 releases immediately.
        if (!serveState.tossReleased) {
          ball.mesh.position.copyFrom(tossAnchor);
          ball.mesh.physicsBody.setAngularVelocity(Vector3.Zero());
          ball.mesh.physicsBody.setLinearVelocity(Vector3.Zero());

          if (serveState.timer >= tossReleaseTime) {
            ball.mesh.physicsBody.setLinearVelocity(tossVelocity);
            serveState.tossReleased = true;
          }
        }

        serveState.timer += deltaTime;

        if (serveState.tossReleased && serveState.timer >= contactTime) {
          serveState.phase = 'strike';
          serveState.timer = 0;
          serveState.strikeApplied = false;
        } else if (serveState.timer >= strikeWindowEndTime + 0.35) {
          if (PURE_BALL_PHYSICS) {
            serveState.active = false;
            serveState.phase = 'ready';
            serveState.timer = 0;
          } else {
            restartServeNoPoint();
          }
        }
        return;
      }

      if (serveState.phase === 'flight') {
        serveState.timer += deltaTime;
        if (serveState.timer >= SERVE_FLIGHT_LOCK_MAX_SECONDS) {
          if (PURE_BALL_PHYSICS) {
            serveState.active = false;
            serveState.phase = 'ready';
            serveState.timer = 0;
          } else {
            restartServeNoPoint();
          }
        }
        return;
      }

      // Strike phase
      serveState.timer += deltaTime;
      const strikeHeadControl = servingCharacter?.getHeadControlPosition() ?? contactAnchor;
      const strikeHeadAnchor = new Vector3(
        strikeHeadControl.x + forward.x * (0.04 * SCALE * strikeDirection),
        strikeHeadControl.y + 0.02 * SCALE,
        strikeHeadControl.z + forward.z * (0.04 * SCALE * strikeDirection),
      );
      const toHead = ball.mesh.position.subtract(strikeHeadAnchor);
      const headDist = Math.sqrt(toHead.x * toHead.x + toHead.y * toHead.y + toHead.z * toHead.z);
      const headStrikeRadius = Math.max(0.40 * SCALE, Math.min(0.86 * SCALE, serveReach * 0.56));
      const inHeadStrikeZone = headDist <= headStrikeRadius && ball.mesh.position.y >= strikeHeadAnchor.y - 0.40 * SCALE;
      const strikeVelocity = ball.mesh.physicsBody.getLinearVelocity();
      const fallingToHead = strikeVelocity.y <= -0.03 * SCALE;
      const strikeWindowDuration = Math.max(0.06, strikeWindowEndTime - strikeWindowStartTime);

      if (!serveState.strikeApplied && inHeadStrikeZone && fallingToHead) {
        const contactLift = new Vector3(0, 0.03 * SCALE, 0);
        ball.mesh.position.copyFrom(strikeHeadAnchor.add(contactLift));

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
        buildReceptionForecastFromLaunch(serveState.server, ball.mesh.position.clone(), serveLaunchVelocity);
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

      // Advance current player's rally phase based on their touch count
      const touchCount = touchesByPlayer[playerIndex];
      if (touchCount <= 1) rallyPhaseByPlayer[playerIndex] = 'preparation';
      else if (touchCount === 2) rallyPhaseByPlayer[playerIndex] = 'kick';
      else rallyPhaseByPlayer[playerIndex] = 'kick';

      lastTouchPlayer = playerIndex;
      clearReceptionForecasts();
      bouncesOnSideSinceLastTouch[0] = 0;
      bouncesOnSideSinceLastTouch[1] = 0;
      tableBouncesOnSideSinceLastTouch[0] = 0;
      tableBouncesOnSideSinceLastTouch[1] = 0;

      // Singles teqball: max 3 touches by the same player.
      if (touchesByPlayer[playerIndex] > 3) {
        awardPoint(other);
      }
    };

    const isOpponentEdgeLet = (touchingPlayer: CourtSide, ballPos: Vector3): boolean => {
      const ballSide = sideFromZ(ballPos.z);
      if (ballSide === touchingPlayer) return false;

      // Table edge on opponent side -> no point, restart serve.
      const tableHalfWidth = tableProfile.halfWidth;
      const edgeBand = 0.11 * TABLE_SCALE;
      const tableHalfLength = tableProfile.halfLength;
      const nearTop = ballPos.y <= 1.18 * TABLE_SCALE;
      const withinTableLength = Math.abs(ballPos.z - tableProfile.centerZ) <= tableHalfLength + 0.18 * TABLE_SCALE;
      const onEdgeBand = Math.abs(Math.abs(ballPos.x - tableProfile.centerX) - tableHalfWidth) <= edgeBand;
      return nearTop && withinTableLength && onEdgeBand;
    };

    const isTableSurfaceBounce = (ballPos: Vector3): boolean => {
      const tableHalfWidth = tableProfile.halfWidth;
      const tableHalfLength = tableProfile.halfLength;
      const tableTopY = getTableBallContactY();
      const tableTopBand = 0.34 * TABLE_SCALE;
      const withinTableX = Math.abs(ballPos.x - tableProfile.centerX) <= tableHalfWidth + 0.10 * TABLE_SCALE;
      const withinTableZ = Math.abs(ballPos.z - tableProfile.centerZ) <= tableHalfLength + 0.14 * TABLE_SCALE;
      const nearTop = Math.abs(ballPos.y - tableTopY) <= tableTopBand;
      return withinTableX && withinTableZ && nearTop;
    };

    const handleBounceRules = (): void => {
      if (!matchManager.isMatchActive) {
        return;
      }

      if (serveBounceGrace > 0) {
        serveBounceGrace -= 1;
        return;
      }

      const bouncedOnTable = isTableSurfaceBounce(ball.mesh.position);

      if (lastTouchPlayer === null) {
        if (!bouncedOnTable && serveState.active) {
          const serverOpponent: CourtSide = serveState.server === 0 ? 1 : 0;
          awardPoint(serverOpponent);
        }
        return;
      }

      const touchingPlayer = lastTouchPlayer;
      const opponent: CourtSide = touchingPlayer === 0 ? 1 : 0;
      const bounceSide = sideFromZ(ball.mesh.position.z);

      if (bouncedOnTable) {
        tableBouncesOnSideSinceLastTouch[bounceSide] += 1;
      }

      // Any ground bounce immediately gives the point to the opponent.
      if (!bouncedOnTable) {
        awardPoint(opponent);
        return;
      }

      if (isOpponentEdgeLet(touchingPlayer, ball.mesh.position)) {
        restartServeNoPoint();
        return;
      }

      // Ball landing on your own side is a fault.
      if (bounceSide === touchingPlayer) {
        awardPoint(opponent);
        return;
      }

      // Serve stays locked through flight; the first legal opponent-side table
      // bounce transitions into normal rally interaction.
      if (serveState.active && serveState.phase === 'flight') {
        serveState.active = false;
        serveState.phase = 'ready';
        serveState.timer = 0;
      }

      // More than one bounce on the same table side: opponent of that side gets the point.
      if (tableBouncesOnSideSinceLastTouch[bounceSide] > 1) {
        const sideOpponent: CourtSide = bounceSide === 0 ? 1 : 0;
        awardPoint(sideOpponent);
      }
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
      const scale = (1.95 * SCALE) / measuredHeight;

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

    const applyPlayerDebugMaterial = (root: AbstractMesh, materialName: string, color: Color3): void => {
      const mat = new StandardMaterial(materialName, gameScene);
      mat.diffuseColor = color;
      mat.specularColor = new Color3(0, 0, 0);
      mat.emissiveColor = color.scale(0.06);
      mat.ambientColor = color.scale(0.1);

      const targets: AbstractMesh[] = [root, ...root.getChildMeshes(false)];
      for (const mesh of targets) {
        // Keep this purely visual and reflection-free for animation orientation checks.
        mesh.material = mat;
      }
    };

    // Create player 1  — animated alien character, neg-Z side of the table
    const p1Stats: CharacterStats = { speed: 8, jump: 1.2, power: 100, spin: 80 };
    const charData1 = await assetManager.loadModel('neymar');
    if (charData1.meshes.length === 0) throw new Error('neymar model has no meshes');

    // Normalize orientation and scale to ~1.8 m tall.
    const charRoot1 = charData1.meshes[0];
    const charNorm = normalizeCharacterRoot(charRoot1, charData1.skeletons[0] ?? null);
    const charScale1 = charNorm.scale;

    player1 = new Character(0, charRoot1, charData1.skeletons[0] ?? null, p1Stats, charData1.animationGroups, PLAYER_MODEL_YAW_OFFSET, neymarAnimData);
    charRoot1.position = new Vector3(0, charNorm.yOffset, -PLAYER_SPAWN_Z);
    charRoot1.rotation = new Vector3(charNorm.tiltX, PLAYER_MODEL_YAW_OFFSET, charNorm.tiltZ);  // faces +Z (toward table)
    placeCharacterSafely(charRoot1, charData1.skeletons[0] ?? null, 0, charNorm.yOffset);
    applyPlayerDebugMaterial(charRoot1, 'p1DebugMat', new Color3(0.72, 0.74, 0.78));

    // Capsule collider on a SEPARATE invisible mesh — never attached to the
    // animated hierarchy so that animation root-motion cannot teleport the body
    // and create phantom impulses on the ball.
    const p1Capsule = MeshBuilder.CreateCapsule('p1Capsule',
      { height: 1.8 * SCALE, radius: 0.3 * SCALE }, gameScene);
    p1Capsule.isVisible = false;
    p1Capsule.isPickable = false;
    p1Capsule.position = new Vector3(
      charRoot1.position.x,
      0.9 * SCALE,            // half of 1.8 m height
      charRoot1.position.z
    );
    new PhysicsAggregate(p1Capsule, PhysicsShapeType.CAPSULE,
      { mass: 0, restitution: 0.3, friction: 0.8 }, gameScene);
    if (p1Capsule.physicsBody?.shape) {
      p1Capsule.physicsBody.shape.filterMembershipMask = COL_PLAYER;
      p1Capsule.physicsBody.shape.filterCollideMask    = COL_WORLD;
    }

    // Create player 2  — second independent instantiation of the same container
    const p2Stats: CharacterStats = { speed: 8, jump: 1.2, power: 100, spin: 80 };
    const charData2 = await assetManager.loadModel('neymar');
    if (charData2.meshes.length === 0) throw new Error('neymar model (p2) has no meshes');

    const charRoot2 = charData2.meshes[0];
    charRoot2.scaling = new Vector3(charScale1, charScale1, charScale1);

    player2 = new Character(1, charRoot2, charData2.skeletons[0] ?? null, p2Stats, charData2.animationGroups, PLAYER_MODEL_YAW_OFFSET, neymarAnimData);
    charRoot2.position = new Vector3(0, charNorm.yOffset, PLAYER_SPAWN_Z);
    charRoot2.rotation = new Vector3(charNorm.tiltX, Math.PI + PLAYER_MODEL_YAW_OFFSET, charNorm.tiltZ); // faces -Z (toward table)
    placeCharacterSafely(charRoot2, charData2.skeletons[0] ?? null, 1, charNorm.yOffset);
    applyPlayerDebugMaterial(charRoot2, 'p2DebugMat', new Color3(0.72, 0.74, 0.78));

    // Sample socket-to-ground distances at contact frames for all gameplay
    // touches so ball placement can use animation-accurate heights.
    player1.precomputeActionSocketGroundDistances(SOCKET_HEIGHT_CALIBRATION_ACTIONS);
    player2.precomputeActionSocketGroundDistances(SOCKET_HEIGHT_CALIBRATION_ACTIONS);

    // Capsule collider for player 2 — same approach: separate mesh, not animated
    const p2Capsule = MeshBuilder.CreateCapsule('p2Capsule',
      { height: 1.8 * SCALE, radius: 0.3 * SCALE }, gameScene);
    p2Capsule.isVisible = false;
    p2Capsule.isPickable = false;
    p2Capsule.position = new Vector3(
      charRoot2.position.x,
      0.9 * SCALE,
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

      if (!animationPreviewMode && !collisionDrill.enabled && code === 'keyr' && !event.repeat) {
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
        if (code === 'keyb') {
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
        if (code === 'keym' || code === 'comma' || code === 'slash' || code === 'f6') {
          event.preventDefault();
          if (event.repeat) {
            return;
          }
          animationPreviewMirror = !animationPreviewMirror;
          console.log(`[Debug] preview mirror=${animationPreviewMirror}`);
          playPreviewClip(false);
          return;
        }
        if (code === 'keyo') {
          event.preventDefault();
          animationPreviewFacingFlip = !animationPreviewFacingFlip;
          console.log(`[Debug] preview facingFlip=${animationPreviewFacingFlip}`);
          playPreviewClip(false);
          return;
        }
        if (code === 'minus' || code === 'numpadsubtract' || code === 'keyk') {
          event.preventDefault();
          animationPreviewSpeed = Math.max(0.1, animationPreviewSpeed - 0.1);
          console.log(`[Debug] preview speed=${animationPreviewSpeed.toFixed(2)}`);
          playPreviewClip(false);
          return;
        }
        if (code === 'equal' || code === 'numpadadd' || code === 'keyi') {
          event.preventDefault();
          animationPreviewSpeed = Math.min(3.0, animationPreviewSpeed + 0.1);
          console.log(`[Debug] preview speed=${animationPreviewSpeed.toFixed(2)}`);
          playPreviewClip(false);
          return;
        }
        if (code === 'keyp') {
          event.preventDefault();
          if (target && clips.length > 0) {
            const idx = Math.max(0, Math.min(animationPreviewClipIndex, clips.length - 1));
            animationPreviewClipIndex = idx;
            playPreviewClip(false);
          }
          return;
        }
        if (code === 'keyl') {
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
    const playerMoveSpeed = 3.4 * SCALE;
    const playerAccel = 14;
    const playerDecel = 18;
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
    const actionExtraLift = 1.4 * SCALE;
    const actionStrikeWindow = 0.28; // seconds
    const actionBallMinY = 1.25 * SCALE;
    const actionAssistStartRange = 2.55 * SCALE;
    const actionAssistDuration = 0.34; // seconds
    const actionAssistImpactTime = 0.20; // remaining-time threshold for impact frame
    const actionAssistRepositionSpeed = 10.2 * SCALE;
    const actionAssistContactDistance = 0.92 * SCALE;
    const actionAssistMagnetRange = 1.55 * SCALE;
    const actionAssistMagnetStrength = 20.0 * SCALE;
    const actionRequestTtl = 1.60; // seconds
    const actionFallingMinYSpeed = -0.2 * SCALE;
    const actionHeaderStartRange = 1.7 * SCALE;
    const actionKickStartRange = 2.2 * SCALE;
    const actionHeaderHeightMin = 1.35 * SCALE;
    const actionKickHeightMin = 0.75 * SCALE;
    const actionKickHeightMax = 2.6 * SCALE;
    const actionKneeStartRange = 2.05 * SCALE;
    const actionScissorStartRange = 2.35 * SCALE;
    const actionKneeHeightMin = 0.95 * SCALE;
    const actionKneeHeightMax = 2.20 * SCALE;
    const actionScissorHeightMin = 0.80 * SCALE;
    const actionScissorHeightMax = 2.85 * SCALE;
    const actionKneeDuration = 0.40;
    const actionScissorDuration = 0.48;
    const actionKneeImpactTime = 0.20;
    const actionScissorImpactTime = 0.18;
    const actionKneeContactDistance = 0.82 * SCALE;
    const actionScissorContactDistance = 0.94 * SCALE;
    const actionKneeMagnetRange = 1.20 * SCALE;
    const actionScissorMagnetRange = 1.35 * SCALE;
    const actionKneeDepth = 0.66 * SCALE;
    const actionScissorDepth = 0.86 * SCALE;
    const actionKneeLateral = 0.20 * SCALE;
    const actionScissorLateral = 0.34 * SCALE;
    const actionKneeFallbackY = 0.92 * SCALE;
    const actionScissorFallbackY = 0.62 * SCALE;
    const actionKneeFallbackForward = 0.50 * SCALE;
    const actionScissorFallbackForward = 0.72 * SCALE;
    const actionAnimationSpeedRatio = 1.35;
    const actionTimingContactTailSeconds = 0.10;
    const actionTimingMaxDuration = 1.45;
    const actionMirrorLeadTime = 0.12;
    const actionEarlyContactCaptureExtra = 0.82 * SCALE;
    const actionEarlyContactRootRadius = 2.10 * SCALE;
    const actionPrecontactHeightTolerance = 0.18 * SCALE;
    const actionPrecontactRangePaddingFactor = 0.78;
    const vicinityInterceptionRange = 2.45 * SCALE;
    const vicinityInterceptionAirMinY = 0.06 * SCALE;
    const vicinityInterceptionHeightMax = 2.90 * SCALE;
    const tableTargetY = getTableBallContactY(); // ball-center height for first contact on table top
    const tableTargetXScale = 0.24; // tighter lateral targeting to keep shots on table
    const tableTargetHalfWidth = 0.72 * TABLE_SCALE;
    const gravityAbs = 9.81;
    const impactWindowGrace = 0.08;
    const antiTunnelBodyRadius = 0.42 * SCALE;
    const antiTunnelBodyBottom = 0.20 * SCALE;
    const antiTunnelBodyTop = 1.95 * SCALE;
    const antiTunnelPushOut = 0.05 * SCALE;
    const antiTunnelMinReboundY = 2.2 * SCALE;
    const ENABLE_PLAYER_ANTI_TUNNEL_GUARD = true;
    const ENABLE_PLAYER_FALLBACK_BODY_VOLUME = true;
    const ballInteractionOwnerHoldSeconds = 0.12;
    const playerBodyRadius = 0.42 * SCALE;
    const playerBodyBottom = 0.22 * SCALE;
    const playerBodyTop = 1.95 * SCALE;
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
    const ENABLE_ARCADE_RALLY_SCRIPT = true;

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
      action: OffensiveAction | null;
      timer: number;
      impactTime: number;
      hitApplied: boolean;
      targetX: number;
      targetZ: number;
    };
    const p1Assist: AssistState = {
      active: false,
      action: null,
      timer: 0,
      impactTime: actionAssistImpactTime,
      hitApplied: false,
      targetX: charRoot1.position.x,
      targetZ: charRoot1.position.z,
    };
    const p2Assist: AssistState = {
      active: false,
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
    let lastTouchPlayer: CourtSide | null = null;
    const touchesByPlayer: [number, number] = [0, 0];
    const rallyPhaseByPlayer: [TouchPhase, TouchPhase] = ['defense', 'defense'];
    const bouncesOnSideSinceLastTouch: [number, number] = [0, 0];
    const tableBouncesOnSideSinceLastTouch: [number, number] = [0, 0];
    let bounceEventCooldown = 0;
    let serveBounceGrace = 0;

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
    ): void => {
      if (collisionDrill.enabled || !matchManager.isMatchActive) return;

      const receiver: CourtSide = attackerSide === 0 ? 1 : 0;

      // Solve launchPos.y + vy*t - 0.5*g*t^2 = tableTargetY (first downward table crossing).
      const a = -0.5 * gravityAbs;
      const b = launchVelocity.y;
      const c = launchPos.y - tableTargetY;
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
        tableTargetY,
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
        tableTargetY + (postBounceVelocity.y * postBounceVelocity.y) / (2 * gravityAbs),
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
      const tableHit = new Vector3(tableTarget.x, tableTargetY, tableTarget.z);

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
          bouncesOnSideSinceLastTouch[bounceSide] += 1;
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

      if (phase === 'preparation') {
        if (ballBand === 'high' || ballBand === 'veryHigh') return 'prepChest';
        return 'prepInnerRight';
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

    const getActionFamily = (action: OffensiveAction): 'header' | 'chest' | 'knee' | 'scissor' => {
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
        action === 'knee' ||
        action === 'receptionToe' ||
        action === 'receptionInnerRight' ||
        action === 'prepInnerRight' ||
        action === 'kickCloseRightFoot' ||
        action === 'kickSoleRight'
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
        const startRange = getEstimatedActionStartRange(forecast.action) + 0.70 * SCALE;
        const timeToReach = horizontalDist / Math.max(0.001, playerMoveSpeed * 1.02);
        const reachable = horizontalDist <= startRange && timeToReach <= (forecast.timeToFallStart + 0.90);

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
      const startRange = getEstimatedActionStartRange(action) + 0.55 * SCALE;
      const timeToReach = horizontalDist / Math.max(0.001, playerMoveSpeed * 0.98);
      const reachable = horizontalDist <= startRange && timeToReach <= (tToFallStart + 0.95);

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
      let ballBand = receptionSnapshot?.ballBand ?? getHeightBand(ball.mesh.position.y);
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
      // If we're planning a preparation and it looks reachable, choose a
      // desirable placement to prepare the following kick.
      if (effectivePhase === 'preparation') {
        // compute a suggested control target that helps set up a kick
        try {
          const forwardSign = player === 0 ? 1 : -1;
          const tableTarget = chooseBestTableCell(player, playerPos, opponentPos, 'preparation', ballBand);
          const controlX = clampi(tableTarget.x * 0.65 + playerPos.x * 0.35, -playerHalfCourtX * 0.95, playerHalfCourtX * 0.95);
          const controlZ = Math.max(player === 0 ? -playerHalfCourtZ : minCourtSplitZ, Math.min(player === 0 ? -minCourtSplitZ : playerHalfCourtZ, playerPos.z + forwardSign * 0.58 * SCALE));
          const controlY = 1.35 * SCALE;
          prepControlTargetByPlayer[player] = new Vector3(controlX, controlY, controlZ);
        } catch (e) {
          // defensive: clear target if anything goes wrong
          prepControlTargetByPlayer[player] = null;
        }
      }
      if (phase === 'preparation') {
        const laneGood = Math.abs(opponentPos.x - ball.mesh.position.x) > 1.8 * SCALE;
        const highControl = ballBand === 'high' || ballBand === 'veryHigh';
        const closeEnough = horizontalDist < 1.95 * SCALE;
        const shouldPromoteToKick =
          touchesByPlayer[player] >= 3 ||
          (touchesByPlayer[player] >= 2 && ballBand === 'veryHigh' && horizontalDist < 1.55 * SCALE);

        if (shouldPromoteToKick && laneGood && highControl && closeEnough) {
          effectivePhase = 'kick';
        }
      }

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
              clampi(cols[c], -colHalfWidth, colHalfWidth),
              tableTargetY,
              clampi(rows[r], -rowHalfDepth, rowHalfDepth),
            ),
            score: 0,
          });
        }
      }
      return cells;
    };

    const chooseAimCell = (attackerSide: CourtSide, aimX: number, aimZ: number): Vector3 => {
      const cells = buildTableCells(attackerSide);
      const colIdx = aimX < -0.3 ? 0 : aimX > 0.3 ? 2 : 1;
      const rowIdx = aimZ < -0.3 ? 0 : 1;
      const match = cells.find(c => c.col === colIdx && c.row === rowIdx);
      return match ? match.center : cells[cells.length - 1].center;
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
        if (phase === 'kick') score += 0.9;
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
        if (nextTouch === 2) return 'preparation';
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
      if (plan.effectivePhase === 'kick' && touchesByPlayer[player] < 2) return;

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

      if (
        ball.mesh.position.y > BALL_RESET_HEIGHT ||
        ball.mesh.position.y < BALL_RESET_MIN_Y ||
        Math.abs(ball.mesh.position.x) > BALL_RESET_X_LIMIT ||
        Math.abs(ball.mesh.position.z) > BALL_RESET_Z_LIMIT
      ) {
        clearArcadeRallyFlight();
        if (ball.mesh.position.y < BALL_RESET_MIN_Y && matchManager.isMatchActive) {
          if (PURE_BALL_PHYSICS) {
            clearRallyState();
            serveState.active = false;
            resetBall();
          } else {
            if (lastTouchPlayer !== null) {
              const opponent: CourtSide = lastTouchPlayer === 0 ? 1 : 0;
              awardPoint(opponent);
            } else if (serveState.active) {
              const serverOpponent: CourtSide = serveState.server === 0 ? 1 : 0;
              awardPoint(serverOpponent);
            } else {
              restartServeNoPoint();
            }
          }
        } else {
          resetBall();
        }
        currentVelocity = physicsBody.getLinearVelocity();
      }

      if (ENABLE_ARCADE_RALLY_SCRIPT) {
        updateArcadeRallyFlight(deltaTime);
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
      const ballGrounded = ball.mesh.position.y <= ballRadius + 0.28 * SCALE;
      if (
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
          Math.max(v.y, 0.35 * SCALE),
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
      const tableTopYForBounce = getTableBallContactY();
      const nearTableImpactZone =
        Math.abs(ball.mesh.position.x - tableProfile.centerX) <= tableHalfWidthForBounce + 0.18 * TABLE_SCALE &&
        Math.abs(ball.mesh.position.z - tableProfile.centerZ) <= tableHalfLengthForBounce + 0.22 * TABLE_SCALE &&
        ball.mesh.position.y <= tableTopYForBounce + ballRadius + 0.12 * TABLE_SCALE;
      const nearGroundImpactZone = ball.mesh.position.y <= ballRadius + 0.08 * TABLE_SCALE;
      const bounceCandidate =
        bounceEventCooldown <= 0 &&
        previousBallVelocityY < -0.45 * SCALE &&
        bounceVelocityY >= 0.08 * SCALE &&
        (nearTableImpactZone || nearGroundImpactZone);
      if (bounceCandidate) {
        bounceEventCooldown = 0.22;

        // In pure mode, unlock serve as soon as the serve lands legally on the
        // receiver's table side so airborne reception can start immediately.
        const bouncedOnTableNow = isTableSurfaceBounce(ball.mesh.position);
        const bounceSide = sideFromZ(ball.mesh.position.z);
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

        if (!collisionDrill.enabled && !PURE_BALL_PHYSICS) {
          handleBounceRules();
        }
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
        if (myPhase === 'preparation') {
          return { targetAbsZ: AI_PREP_STEP_IN_TARGET_Z, followWeight: 0.62 };
        }

        const horizontalSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);
        const movingTowardMe = side === 0 ? vel.z < -0.04 * SCALE : vel.z > 0.04 * SCALE;
        const likelyShortIncoming =
          movingTowardMe &&
          horizontalSpeed < AI_LOW_SPEED_RETURN_THRESHOLD &&
          ball.mesh.position.y < 2.2 * SCALE;
        const opponentLikelySoftKick =
          ballSide === opponent &&
          (opponentPhase === 'reception' || opponentPhase === 'preparation') &&
          horizontalSpeed < AI_LOW_SPEED_RETURN_THRESHOLD * 1.15;

        if (likelyShortIncoming || opponentLikelySoftKick) {
          return { targetAbsZ: AI_SHORT_RETURN_STEP_IN_Z, followWeight: 0.50 };
        }

        return { targetAbsZ: AI_BEHIND_SERVE_TARGET_Z, followWeight: 0.18 };
      };

      if (ENABLE_P1_AI && !collisionDrill.enabled) {
        const ballInCourt = isBallInsidePlayableCourtXZ(0.20 * SCALE);
        const receptionPlan = ballInCourt ? predictReceptionFallSnapshot(0, charRoot1.position) : null;
        const targetX = receptionPlan
          ? receptionPlan.target.x
          : (ballInCourt
            ? Math.max(-playerHalfCourtX, Math.min(playerHalfCourtX, ball.mesh.position.x))
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

      const getDefenseAdjustment = (
        player: CourtSide,
        playerPos: Vector3,
        minZ: number,
        maxZ: number,
      ): { x: number; z: number } => {
        if (
          ENABLE_ARCADE_RALLY_SCRIPT &&
          arcadeRallyFlight.active &&
          arcadeRallyFlight.stage === 'toReceive' &&
          arcadeRallyFlight.receiverSide === player
        ) {
          const span = Math.max(0.001, maxZ - minZ);
          const targetX = clampi(arcadeRallyFlight.receiveTarget.x, -playerHalfCourtX, playerHalfCourtX);
          const targetZ = clampi(arcadeRallyFlight.receiveTarget.z, minZ, maxZ);
          const dx = targetX - playerPos.x;
          const dz = targetZ - playerPos.z;
          const dead = 0.12 * SCALE;
          const norm = (v: number, range: number): number => {
            if (Math.abs(v) <= dead) return 0;
            return Math.max(-1, Math.min(1, v / Math.max(0.001, range)));
          };
          return {
            x: norm(dx, playerHalfCourtX * 0.88),
            z: norm(dz, span * 0.44),
          };
        }

        const ballSide = sideFromZ(ball.mesh.position.z);
        if (getPlannedPhase(player, ballSide) !== 'defense') {
          return { x: 0, z: 0 };
        }

        const span = Math.max(0.001, maxZ - minZ);
        const vel = physicsBody.getLinearVelocity();
        const incoming = player === 0 ? vel.z < -0.08 * SCALE : vel.z > 0.08 * SCALE;
        const depthRatio = incoming ? 0.33 : 0.18;
        const targetZ = minZ + span * depthRatio;
        const targetX = Math.max(-playerHalfCourtX * 0.72, Math.min(playerHalfCourtX * 0.72, ball.mesh.position.x * 0.62));

        const dx = targetX - playerPos.x;
        const dz = targetZ - playerPos.z;
        const dead = 0.12 * SCALE;
        const norm = (v: number, range: number): number => {
          if (Math.abs(v) <= dead) return 0;
          return Math.max(-1, Math.min(1, v / Math.max(0.001, range)));
        };

        return {
          x: norm(dx, playerHalfCourtX * 0.9),
          z: norm(dz, span * 0.45),
        };
      };

      if (!collisionDrill.enabled) {
        if (!ENABLE_P1_AI) {
          const p1DefenseAdjust = getDefenseAdjustment(0, charRoot1.position, -playerHalfCourtZ, -minCourtSplitZ);
          if (Math.abs(p1MoveX) < 0.01) {
            p1MoveX = p1DefenseAdjust.x;
          }
          if (Math.abs(p1MoveZ) < 0.01) {
            p1MoveZ = p1DefenseAdjust.z;
          } else {
            p1MoveZ += p1DefenseAdjust.z * 0.25;
          }
        }

        if (!ENABLE_P2_AI) {
          const p2DefenseAdjust = getDefenseAdjustment(1, charRoot2.position, minCourtSplitZ, playerHalfCourtZ);
          if (Math.abs(p2MoveX) < 0.01) {
            p2MoveX = p2DefenseAdjust.x;
          }
          if (Math.abs(p2MoveZ) < 0.01) {
            p2MoveZ = p2DefenseAdjust.z;
          } else {
            p2MoveZ += p2DefenseAdjust.z * 0.25;
          }
        }
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

      const now = Date.now();
      let serveSetupActive = serveState.active;

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
          const assistBlend = manualInput > 0.05 ? 0.14 : 0.22;
          collisionDrillAssistMoveX += (targetAssistX - collisionDrillAssistMoveX) * assistBlend;
          collisionDrillAssistMoveZ += (targetAssistZ - collisionDrillAssistMoveZ) * assistBlend;
          if (Math.abs(collisionDrillAssistMoveX) < 0.035) collisionDrillAssistMoveX = 0;
          if (Math.abs(collisionDrillAssistMoveZ) < 0.035) collisionDrillAssistMoveZ = 0;

          const manualWeight = manualInput > 0.05 ? 0.78 : 0;
          const assistWeight = manualInput > 0.05 ? 0.36 : 1.0;
          const mergedMoveX = Math.max(-1, Math.min(1, manualMoveX * manualWeight + collisionDrillAssistMoveX * assistWeight));
          const mergedMoveZ = Math.max(-1, Math.min(1, manualMoveZ * manualWeight + collisionDrillAssistMoveZ * assistWeight));

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

      if (serveState.active && serveState.phase === 'ready') {
        const serveCanStart = serveState.timer >= SERVE_READY_PAUSE_SECONDS;
        const p1ServeTrigger = serveCanStart && serveState.server === 0 && (ENABLE_P1_AI || inputManager.isServeDown(0));
        const p2ServeTrigger = serveCanStart && serveState.server === 1 && (ENABLE_P2_AI || inputManager.isServeDown(1));
        if (p1ServeTrigger || p2ServeTrigger) {
          serveState.phase = 'toss';
          serveState.timer = 0;
          serveState.tossReleased = false;
          serveState.strikeApplied = false;
          serveState.animationStarted = true;
          const servingCharacter = serveState.server === 0 ? player1 : player2;
          servingCharacter?.playAnimation('serve', false);
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
        if (plan.effectivePhase === 'kick' && touchesByPlayer[player] < 2) {
          return;
        }

        if (pendingPrepSuperHigh[player] && plan.effectivePhase === 'preparation') {
          request.action = 'prepChest';
          request.ttl = Math.max(request.ttl, actionRequestTtl * 0.9);
          pendingPrepSuperHigh[player] = false;
          requestPowerByPlayer[player] = 0.88;
          return;
        }

        const aiControlled = player === 0 ? ENABLE_P1_AI : ENABLE_P2_AI;
        const aiDecision = chooseAiActionDecision(plan.effectivePhase, plan.ballBand, plan.action, playerPos, opponentPos);

        request.action = plan.action;
        request.ttl = aiControlled ? aiDecision.ttl : actionRequestTtl;
        requestPowerByPlayer[player] = aiControlled
          ? aiDecision.powerMult
          : (player === 0 ? p1KickPowerMult.value : 1);
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
        const actingSide: CourtSide = maxZ < 0 ? 0 : 1;
        const receptionForecast = receptionForecastByPlayer[actingSide];
        const mirrorHint = isLimbReceptionAction(action)
          ? predictedBallForMirror
          : predictedContactBall;

        if (!character.performAirAction(action, mirrorHint)) return;

        assist.active = true;
        assist.action = action;
        assist.timer = strikeTiming.strikeDuration;
        assist.impactTime = strikeTiming.impactTime;
        assist.hitApplied = false;
        assist.targetX = Math.max(-playerHalfCourtX, Math.min(playerHalfCourtX, target.x));
        assist.targetZ = Math.max(minZ, Math.min(maxZ, target.z));

        motion.vx = 0;
        motion.vz = 0;

        const targetFacing = isLimbReceptionAction(action)
          ? getLateralReceptionFacing(root.position, predictedContactBall)
          : getCourtCenterFacing(root.position);

        // Keep the player oriented for the action: center-facing for strikes,
        // lateral-facing for inner-foot reception/prep.
        motion.facing = targetFacing;
        root.rotation.y = motion.facing + PLAYER_MODEL_YAW_OFFSET + (character?.getMirrorFacingCompensationYaw() ?? 0) + (character?.getAnimationFacingCompensationYaw() ?? 0);
        strikeState.action = action;
        strikeState.timer = strikeTiming.strikeDuration;
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
            ball.mesh.position.y < profile.minHeight - 0.22 * SCALE ||
            ball.mesh.position.y > profile.maxHeight + 0.22 * SCALE
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
        // Human P1 — hold-to-charge model (release fires the kick)
        const p1Phase = getPlannedPhase(0, sideFromZ(ball.mesh.position.z));

        // Track grace period: reset when entering kick phase
        if (p1Phase === 'kick' && p1KickGraceStart < 0) {
          p1KickGraceStart = now;
        } else if (p1Phase !== 'kick') {
          p1KickGraceStart = -1;
        }

        if (!collisionDrill.enabled && !serveSetupActive) {
          // Rising edge: start charge (valid in preparation + kick phase only)
          if (p1KickPressed && !p1KickButtonHeld && (p1Phase === 'kick' || p1Phase === 'preparation')) {
            p1KickChargeStart = now;
            p1KickAim.x = inputManager.getMoveX(0);  // aim snapshot on press
          }

          // Falling edge: commit kick with accumulated charge
          if (!p1KickPressed && p1KickButtonHeld && p1KickChargeStart >= 0) {
            const holdMs = now - p1KickChargeStart;
            p1KickPowerMult.value = KICK_CHARGE_TABLE.find(([thresh]) => holdMs < thresh)?.[1] ?? 1.75;
            p1KickAim.x = inputManager.getMoveX(0);  // re-snap aim on release for precision
            p1KickAim.z = 1;  // always aim deep (up/down does nothing per C1)
            p1KickChargeStart = -1;
            if (now - lastP1ActionPress > actionPressCooldown) {
              requestPowerByPlayer[0] = p1KickPowerMult.value;
              queueInferredKickRequest(0, p1Request);
              lastP1ActionPress = now;
              p1KickGraceStart = -1;  // player acted — cancel grace auto-kick
            }
          }

          // Grace-period auto-kick (C3): fire if player hasn't kicked in time
          if (p1Phase === 'kick' && p1KickGraceStart >= 0 && now - p1KickGraceStart > P1_KICK_GRACE_MS) {
            if (now - lastP1ActionPress > actionPressCooldown) {
              p1KickPowerMult.value = 0.80;  // conservative control-level power
              p1KickAim.x = 0;
              p1KickAim.z = 1;
              p1KickChargeStart = -1;
              requestPowerByPlayer[0] = p1KickPowerMult.value;
              queueInferredKickRequest(0, p1Request);
              lastP1ActionPress = now;
            }
            p1KickGraceStart = -1;
          }
        }
      }
      p1KickButtonHeld = p1KickPressed;

      // Power meter charge indicator removed (HUD is now EventBus-driven via UIManager)

      if (!collisionDrill.enabled && !serveSetupActive && now - lastP2ActionPress > actionPressCooldown) {
        if (ENABLE_P2_AI) {
          const toBall2 = ball.mesh.position.subtract(charRoot2.position);
          const dist2 = Math.sqrt(toBall2.x * toBall2.x + toBall2.z * toBall2.z);
          const vy2 = physicsBody.getLinearVelocity().y;
          if (dist2 <= 2.15 * SCALE && vy2 < -0.15 * SCALE && ball.mesh.position.y >= 0.85 * SCALE) {
            queueInferredKickRequest(1, p2Request);
            lastP2ActionPress = now;
          }
        }
      }

      const p2KickPressed = inputManager.isKickDown(1);
      if (!collisionDrill.enabled && !ENABLE_P2_AI && !serveSetupActive && p2KickPressed && !p2KickButtonHeld && now - lastP2ActionPress > actionPressCooldown) {
        const phase = getPlannedPhase(1, sideFromZ(ball.mesh.position.z));
        const isDoubleTap = now - lastP2KickButtonPress <= DOUBLE_TAP_WINDOW_MS;
        if (isDoubleTap) {
          if (phase === 'preparation') pendingPrepSuperHigh[1] = true;
          if (phase === 'kick') pendingKickPowerBoost[1] = true;
        }
        lastP2KickButtonPress = now;
        queueInferredKickRequest(1, p2Request);
        lastP2ActionPress = now;
      }
      p2KickButtonHeld = p2KickPressed;

      // Arcade autopilot: if player didn't provide an action input, pick one from
      // touch phase + box classification to keep rallies flowing predictably.
      // For P1 human, block auto-queue during kick phase — player must press Space.
      if (!collisionDrill.enabled) {
        const p1BallSide = sideFromZ(ball.mesh.position.z);
        const p1AutoPhase = getPlannedPhase(0, p1BallSide);
        if (ENABLE_P1_AI || p1AutoPhase !== 'kick') {
          queueAutoAction(0, p1Request, p1Assist, player1, p1StrikeState, charRoot1.position, charRoot2.position, serveSetupActive);
        }
        queueAutoAction(1, p2Request, p2Assist, player2, p2StrikeState, charRoot2.position, charRoot1.position, serveSetupActive);
      }

      if (!collisionDrill.enabled && !serveSetupActive) {
        tryVicinityInterception(
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
        tryVicinityInterception(
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
      ): void => {
        if (assist.active) {
          const prevX = root.position.x;
          const prevZ = root.position.z;
          assist.timer = Math.max(0, assist.timer - deltaTime);
          const activeAssistAction = assist.action;

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

          const targetFacing = activeAssistAction === 'receptionInnerRight' || activeAssistAction === 'prepInnerRight'
            ? getLateralReceptionFacing(root.position, ball.mesh.position)
            : getCourtCenterFacing(root.position);
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

          if (assist.timer <= 0) {
            assist.active = false;
            assist.action = null;
          }
          return;
        }

        const hasInput = moveX !== 0 || moveZ !== 0;
        let targetVx = 0;
        let targetVz = 0;

        if (hasInput) {
          const dir = new Vector3(moveX, 0, moveZ).normalize();
          targetVx = dir.x * playerMoveSpeed;
          targetVz = dir.z * playerMoveSpeed;
        }

        const blend = Math.min(1, (hasInput ? playerAccel : playerDecel) * deltaTime);
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
          capsule.position.y = root.position.y + 0.98 * SCALE;
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
        // In pure mode keep anti-tunnel active even during assisted actions so
        // fast balls cannot phase through the player body.
        if (assist.active && ENABLE_BALL_MOTION_ASSIST) return false;
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
          
          const inImpactWindow = strikeState.timer <= (assist.impactTime + impactWindowGrace);

          const effectiveContactDistance = contactDistance;
          const maxSnapDistance = Math.max(profile.contactDistance * 1.9, profile.magnetRange * 1.2);
          const rootDistance = Vector3.Distance(ball.mesh.position, playerPos);
          const earlyCaptureDistance = profile.contactDistance + actionEarlyContactCaptureExtra;
          const canEarlyCapture =
            inHeightWindow &&
            rootDistance <= actionEarlyContactRootRadius &&
            effectiveContactDistance <= earlyCaptureDistance;
          const canCaptureNow = inImpactWindow || canEarlyCapture;

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
              if (!inHeightWindow) {
                return influenced;
              }

              if (effectiveContactDistance > profile.contactDistance && !canEarlyCapture) {
                return influenced;
              }
            }

            if (!ENABLE_BALL_MOTION_ASSIST && effectiveContactDistance > profile.contactDistance && canEarlyCapture) {
              const toBallFlat = new Vector3(toBall.x, 0, toBall.z);
              const toBallDir = toBallFlat.lengthSquared() > 1e-5
                ? toBallFlat.normalize()
                : new Vector3(0, 0, forwardSign);
              const snapN = strikeToBall.lengthSquared() > 1e-5 ? strikeToBall.normalize() : toBallDir;
              const snapDist = profile.contactDistance * 0.62;
              ball.mesh.position.copyFrom(strikePos.add(snapN.scale(snapDist)));
            }

            // Hard guarantee: at impact frame, force contact if needed.
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
            if (strikeFamily === 'scissor') strikeSpeed = scissorKickSpeed;
            const defaultSpeedRaw = strikeSpeed / Math.max(1e-4, animConfigBallSpeedScale);
            const resolvedSpeedRaw = resolveAnimBallSpeedValue(animConfig, defaultSpeedRaw);
            const configSpeed = resolvedSpeedRaw * animConfigBallSpeedScale;
            strikeSpeed = Math.max(
              2.8 * SCALE,
              Math.min(12.5 * SCALE, configSpeed * GLOBAL_KICK_VELOCITY_MULTIPLIER * Math.max(0.55, Math.min(1.35, requestPowerByPlayer[playerSide]))),
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

            if (touchPhase === 'reception') {
              const incomingVel = physicsBody.getLinearVelocity();
              const incomingSpeed = incomingVel.length();
              const incomingDrop = Math.max(0, -incomingVel.y);
              const verticalPop = Math.max(
                2.20 * SCALE,
                Math.min(7.6 * SCALE, 1.72 * SCALE + incomingSpeed * 0.42 + incomingDrop * 0.30),
              );
              const plannedKickAction = chooseActionForPhase('kick', getHeightBand(verticalPop), playerPos, ball.mesh.position);
              const kickRise = getKickRiseProfile(plannedKickAction, attackerSide);

              physicsBody.setLinearVelocity(new Vector3(
                kickRise.vx,
                verticalPop * kickRise.vyMult,
                kickRise.vz,
              ));
              physicsBody.setAngularVelocity(Vector3.Zero());
              addBallSpinTwist(0);

              postKickLockTimer = 0;
              postKickLockSpeed = 0;

              assist.hitApplied = true;
              assist.active = false;
              assist.action = null;
              strikeState.action = null;
              strikeState.timer = 0;
              registerPlayerTouch(attackerSide);
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
              : (attackerSide === 0 && !ENABLE_P1_AI && touchPhase === 'kick')
                ? chooseAimCell(attackerSide, p1KickAim.x, p1KickAim.z)
                : chooseBestTableCell(
                  attackerSide,
                  playerPos,
                  defenderPos,
                  touchPhase,
                  band,
                );

            const flatToTable = new Vector3(
              tableTarget.x - ball.mesh.position.x,
              0,
              tableTarget.z - ball.mesh.position.z,
            );
            const distToTable = Math.max(0.12 * SCALE, flatToTable.length());
            const flatDir = flatToTable.lengthSquared() > 1e-5
              ? flatToTable.normalize()
              : new Vector3(0, 0, forwardSign);

            const timeToTable = Math.max(0.30, Math.min(0.70, (distToTable / Math.max(0.01, strikeSpeed * 0.82)) * strikeProfile.flightTimeScale));
            const horizontalSpeedBase = distToTable / Math.max(0.12, timeToTable);
            const horizontalSpeed = collisionDrill.enabled
              ? Math.min(4.2 * SCALE, horizontalSpeedBase)
              : horizontalSpeedBase;
            const dy = tableTarget.y - ball.mesh.position.y;
            const vyBallistic = (dy + 0.5 * gravityAbs * timeToTable * timeToTable) / timeToTable;
            let vy = vyBallistic + actionExtraLift * 0.18 + strikeProfile.verticalVelocityBias;
            if (animConfig) {
              const loft = Math.max(0, Math.min(1, animConfig.ballLoft));
              vy += (loft - 0.25) * 1.8 * SCALE;
            }
            if (prepSuperHighActive) {
              vy += 1.15 * SCALE;
            }
            if (kickBoostActive) {
              vy += 0.34 * SCALE;
            }
            if (collisionDrill.enabled) {
              vy += 0.72 * SCALE;
            }
            vy = Math.max(0.85 * SCALE, Math.min(8.4 * SCALE, vy));

            const launchVelocity = new Vector3(
              flatDir.x * horizontalSpeed,
              vy,
              flatDir.z * horizontalSpeed,
            );
            physicsBody.setLinearVelocity(launchVelocity);
            if (!collisionDrill.enabled) {
              buildReceptionForecastFromLaunch(attackerSide, ball.mesh.position.clone(), launchVelocity);
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
            registerPlayerTouch(playerSide);
            if (ENABLE_ARCADE_RALLY_SCRIPT && !collisionDrill.enabled) {
              startArcadeRallyFlight(
                attackerSide,
                band,
                strikeSpeed,
                tableTarget,
                playerPos,
                defenderPos,
              );
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

      const p1ServeAnimLocked =
        serveState.active &&
        serveState.server === 0 &&
        (serveState.phase === 'toss' || (serveState.phase === 'strike' && !serveState.strikeApplied));
      const p2ServeAnimLocked =
        serveState.active &&
        serveState.server === 1 &&
        (serveState.phase === 'toss' || (serveState.phase === 'strike' && !serveState.strikeApplied));

      if (player1 && !p1ServeAnimLocked) {
        const local1 = getLocalMovement(p1MoveX, p1MoveZ, p1Motion.facing);
        const p1DistToBall = Math.sqrt((ball.mesh.position.x - charRoot1.position.x) ** 2 + (ball.mesh.position.z - charRoot1.position.z) ** 2);
        const p1QuickBoost = physicsBody.getLinearVelocity().y < -0.25 * SCALE
          ? Math.max(1.0, Math.min(1.35, 1.35 - p1DistToBall * 0.09))
          : 1.0;
        const p1SpeedRatio =
          (Math.sqrt(p1Motion.vx ** 2 + p1Motion.vz ** 2) / Math.max(0.001, playerMoveSpeed)) * p1QuickBoost;
        player1.setMovement(local1.localX, -local1.localZ, false, deltaTime, p1SpeedRatio);
      }
      if (player2 && !p2ServeAnimLocked) {
        const local2 = getLocalMovement(p2MoveX, p2MoveZ, p2Motion.facing);
        const p2DistToBall = Math.sqrt((ball.mesh.position.x - charRoot2.position.x) ** 2 + (ball.mesh.position.z - charRoot2.position.z) ** 2);
        const p2QuickBoost = physicsBody.getLinearVelocity().y < -0.25 * SCALE
          ? Math.max(1.0, Math.min(1.35, 1.35 - p2DistToBall * 0.09))
          : 1.0;
        const p2SpeedRatio =
          (Math.sqrt(p2Motion.vx ** 2 + p2Motion.vz ** 2) / Math.max(0.001, playerMoveSpeed)) * p2QuickBoost;
        player2.setMovement(local2.localX, -local2.localZ, false, deltaTime, p2SpeedRatio);
      }

      updateServeSequence(deltaTime);

      // UI updates are driven by EventBus and BabylonJS animations via UIManager.

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

    // Start render loop
    engine.render(gameScene);

    // Handle window resize
    window.addEventListener('resize', () => {
      engine.getNativeEngine().resize();
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.innerHTML = `<p style="color: #ff6b6b;">Error: ${errorMsg}</p>`;
    }
  }
}


