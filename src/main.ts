/**
 * MAIN ENTRY POINT
 * Phase 0: Load assets and display scene with proper positioning
 * 
 * SCALING GUIDE:
 * - All measurements use SCALE as a multiplier (currently 1.0)
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
import { TeqballTable } from './entities/TeqballTable';
import { CharacterStats } from './core/interfaces';
import { MatchManager } from './gameplay/MatchManager';
import { HUD } from './ui/HUD';
import { PointAnnouncement } from './ui/PointAnnouncement';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import HavokPhysics from '@babylonjs/havok';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import '@babylonjs/core/Physics/physicsEngineComponent';
import {
  getAnimConfigForAction,
  getAnimConfigForClip,
  getContactFrameRatio,
  resolveAnimBallSpeedValue,
  resolveAnimReachUnits,
} from './data/animationConfig';

const SCALE = 1.0; // Global scale factor

let gameScene: Scene;
let assetManager: AssetManager;
let ball: Ball;
let player1: Character;
let player2: Character;
let matchManager: MatchManager;
let hud: HUD;
let pointAnnouncement: PointAnnouncement;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let table: TeqballTable;
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
const BALL_RESET_HEIGHT = 8 * SCALE;
const BALL_RESET_X_LIMIT = 10 * SCALE;
const BALL_RESET_Z_LIMIT = 14 * SCALE;
const PLAYER_MODEL_YAW_OFFSET = -Math.PI / 2;
const ENABLE_P1_AI = true;
const ENABLE_P2_AI = true;
const PLAYER_SPAWN_Z = 3.8 * SCALE;
const PLAYER_TABLE_CLEARANCE_Z = 2.3 * SCALE;

type CourtSide = 0 | 1; // 0 = P1/negative Z side, 1 = P2/positive Z side
type OffensiveAction =
  | 'header' | 'chest' | 'knee' | 'scissor' // legacy aliases
  | 'receptionChest' | 'receptionToe' | 'receptionInnerRight'
  | 'prepChest' | 'prepInnerRight'
  | 'kickCloseHead' | 'kickCloseRightFoot' | 'kickHead'
  | 'kickHighLeft' | 'kickJumpHead' | 'kickSoleRight' | 'kickBicycleLeft' | 'kickChest';
type ServePhase = 'ready' | 'toss' | 'strike';
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

async function main(): Promise<void> {
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

    // Create court floor (16m x 12m)
    const courtFloor = MeshBuilder.CreateGround(
      'courtFloor',
      { width: 12 * SCALE, height: 16 * SCALE },
      gameScene
    );
    const floorMat = new StandardMaterial('floorMat', gameScene);
    floorMat.diffuseColor = new Color3(0.2, 0.2, 0.2);
    courtFloor.material = floorMat;

    // Add physics to floor (static, bouncy for gameplay)
    new PhysicsAggregate(
      courtFloor,
      PhysicsShapeType.BOX,
      { mass: 0, restitution: 0.7, friction: 0.4 },
      gameScene
    );
    if (courtFloor.physicsBody?.shape) {
      courtFloor.physicsBody.shape.filterMembershipMask = COL_WORLD;
      courtFloor.physicsBody.shape.filterCollideMask    = COL_BALL | COL_PLAYER;
    }

    // Create invisible walls around court for natural bouncing
    const wallHeight = 3 * SCALE;
    const wallThickness = 0.2 * SCALE;
    
    // Left wall
    const leftWall = MeshBuilder.CreateBox('leftWall', {
      width: wallThickness,
      height: wallHeight,
      depth: 16 * SCALE
    }, gameScene);
    leftWall.position = new Vector3(-6 * SCALE - wallThickness / 2, wallHeight / 2, 0);
    leftWall.isVisible = false;
    new PhysicsAggregate(leftWall, PhysicsShapeType.BOX, { mass: 0, restitution: 0.7, friction: 0.3 }, gameScene);
    
    // Right wall
    const rightWall = MeshBuilder.CreateBox('rightWall', {
      width: wallThickness,
      height: wallHeight,
      depth: 16 * SCALE
    }, gameScene);
    rightWall.position = new Vector3(6 * SCALE + wallThickness / 2, wallHeight / 2, 0);
    rightWall.isVisible = false;
    new PhysicsAggregate(rightWall, PhysicsShapeType.BOX, { mass: 0, restitution: 0.7, friction: 0.3 }, gameScene);
    
    // Front wall
    const frontWall = MeshBuilder.CreateBox('frontWall', {
      width: 12 * SCALE,
      height: wallHeight,
      depth: wallThickness
    }, gameScene);
    frontWall.position = new Vector3(0, wallHeight / 2, -8 * SCALE - wallThickness / 2);
    frontWall.isVisible = false;
    new PhysicsAggregate(frontWall, PhysicsShapeType.BOX, { mass: 0, restitution: 0.7, friction: 0.3 }, gameScene);
    
    // Back wall
    const backWall = MeshBuilder.CreateBox('backWall', {
      width: 12 * SCALE,
      height: wallHeight,
      depth: wallThickness
    }, gameScene);
    backWall.position = new Vector3(0, wallHeight / 2, 8 * SCALE + wallThickness / 2);
    backWall.isVisible = false;
    new PhysicsAggregate(backWall, PhysicsShapeType.BOX, { mass: 0, restitution: 0.7, friction: 0.3 }, gameScene);

    // Assign COL_WORLD to all four invisible walls
    for (const wall of [leftWall, rightWall, frontWall, backWall]) {
      if (wall.physicsBody?.shape) {
        wall.physicsBody.shape.filterMembershipMask = COL_WORLD;
        wall.physicsBody.shape.filterCollideMask    = COL_BALL | COL_PLAYER;
      }
    }

    // Add court markings (lines)
    const lineY = 0.01 * SCALE;
    const whiteColor = Color3.White();

    // Halfway line (across center)
    const halfwayLine = MeshBuilder.CreateLines(
      'halfwayLine',
      {
        points: [
          new Vector3(-2 * SCALE, lineY, 0),
          new Vector3(2 * SCALE, lineY, 0),
        ],
      },
      gameScene
    );
    halfwayLine.color = whiteColor;

    // Service lines (1.5m wide, 3.5m from center)
    const serviceLinesDist = 3.5 * SCALE;
    const serviceLineWidth = 1.5 * SCALE;

    const serviceLineTop = MeshBuilder.CreateLines(
      'serviceLineTop',
      {
        points: [
          new Vector3(-serviceLineWidth / 2, lineY, serviceLinesDist),
          new Vector3(serviceLineWidth / 2, lineY, serviceLinesDist),
        ],
      },
      gameScene
    );
    serviceLineTop.color = whiteColor;

    const serviceLineBottom = MeshBuilder.CreateLines(
      'serviceLineBottom',
      {
        points: [
          new Vector3(-serviceLineWidth / 2, lineY, -serviceLinesDist),
          new Vector3(serviceLineWidth / 2, lineY, -serviceLinesDist),
        ],
      },
      gameScene
    );
    serviceLineBottom.color = whiteColor;

    // Perimeter boundary (16m x 12m)
    const boundary = MeshBuilder.CreateLines(
      'boundary',
      {
        points: [
          new Vector3(-6 * SCALE, lineY, 8 * SCALE),
          new Vector3(6 * SCALE, lineY, 8 * SCALE),
          new Vector3(6 * SCALE, lineY, -8 * SCALE),
          new Vector3(-6 * SCALE, lineY, -8 * SCALE),
          new Vector3(-6 * SCALE, lineY, 8 * SCALE),
        ],
      },
      gameScene
    );
    boundary.color = whiteColor;

    // Initialize asset manager
    assetManager = new AssetManager(gameScene);
    matchManager = new MatchManager();
    hud = new HUD();
    pointAnnouncement = new PointAnnouncement();

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


    // Create table from loaded meshes
    const tableData = await assetManager.loadModel('table');
    if (tableData.meshes.length > 0) {
      // Scale table based on bounding box
      const boundingInfo = tableData.meshes[0].getHierarchyBoundingVectors();
      const size = boundingInfo.max.subtract(boundingInfo.min);
      const currentLength = Math.max(size.x, size.z);
      const desiredTableLength = 3 * SCALE;
      const scaleFactor = desiredTableLength / currentLength;

      tableData.meshes.forEach((mesh) => {
        mesh.scaling = new Vector3(scaleFactor, scaleFactor, scaleFactor);
      });

      // Position table at center
      table = new TeqballTable(tableData.meshes);
      table.meshes[0].position = new Vector3(0, 0 * SCALE, 0);
      table.meshes[0].rotation = new Vector3(0, Math.PI / 2, 0); // No rotation - align with court axes

      // Apply position/rotation to all table meshes
      for (let i = 1; i < tableData.meshes.length; i++) {
        tableData.meshes[i].position = new Vector3(0, 0.5 * SCALE, 0);
        tableData.meshes[i].rotation = new Vector3(0, 0, 0);
        tableData.meshes[i].isVisible = true;
      }
      


      // Add physics to table using the exact mesh geometry.
      // The table is one solid closed mesh — MESH shape traces every triangle,
      // preserving the curved surface and the net ridge precisely.
      //
      // Restitution 0.72: realistic teqball table coefficient (~0.70–0.76).
      // Havok uses max(r_ball, r_table) as the combined restitution so
      // keeping both values at 0.72 gives a predictable 0.72 combined bounce.
      tableData.meshes.forEach((mesh) => {
        const totalVertices = mesh.getTotalVertices();
        if (totalVertices > 0) {
          try {
            new PhysicsAggregate(
              mesh,
              PhysicsShapeType.MESH,
              { mass: 0, restitution: 0.72, friction: 0.20 },
              gameScene
            );
          } catch (_err) {
            // Fallback — should never happen on a valid closed mesh
            new PhysicsAggregate(
              mesh,
              PhysicsShapeType.CONVEX_HULL,
              { mass: 0, restitution: 0.72, friction: 0.20 },
              gameScene
            );
          }

          if (mesh.physicsBody?.shape) {
            // Table is static world geometry — only the ball needs to interact
            mesh.physicsBody.shape.filterMembershipMask = COL_WORLD;
            mesh.physicsBody.shape.filterCollideMask    = COL_BALL;

            // Mesh welding: when a sphere rolls over a MESH shape, every internal
            // triangle edge produces an abrupt normal flip that sends the ball
            // sideways.  HP_Shape_SetWeldingType(shape, 3) merges adjacent triangle
            // normals (TWO_SIDED mode) so the contact normal transitions smoothly.
            const hpShape = (mesh.physicsBody.shape as any)._pluginData?.hpShape as unknown;
            if (hk && hpShape !== undefined) {
              (hk['HP_Shape_SetWeldingType'] as Function)?.(hpShape, 3);
            }
          }
        }
      });
    }

    // Load ball visual from ball01.glb, but simulate physics on a clean
    // procedural sphere. This avoids GLB hierarchy / transform issues that can
    // make Havok compute a bad sphere radius and launch the ball upward.
    const ballData = await assetManager.loadModel('ball01');
    if (ballData.meshes.length === 0) {
      throw new Error('ball01 model loaded but has no meshes');
    }

    const ballRootMesh = ballData.meshes[0];

    // Measure raw hierarchy size at scale (1,1,1).
    ballRootMesh.scaling = new Vector3(1, 1, 1);
    ballRootMesh.computeWorldMatrix(true);
    const ballHierarchyBounds = ballRootMesh.getHierarchyBoundingVectors(true);
    const rawSize = ballHierarchyBounds.max.subtract(ballHierarchyBounds.min);
    const rawDiameter = Math.max(rawSize.x, rawSize.y, rawSize.z);

    const desiredDiameter = 0.22 * SCALE;
    const ballScale = rawDiameter > 0 ? desiredDiameter / rawDiameter : 1;
    const ballRadius = desiredDiameter / 2;
    const BALL_VISUAL_SPIN_MAX = 26.0;
    let ballSpinTwist = 0;

    const ballPhysicsMesh = MeshBuilder.CreateSphere(
      'ballPhysics',
      { diameter: desiredDiameter, segments: 24 },
      gameScene,
    );
    ballPhysicsMesh.position = BALL_SPAWN_POSITION.clone();
    ballPhysicsMesh.visibility = 0;
    ballPhysicsMesh.isPickable = false;

    // Parent the visible GLB ball to the procedural physics sphere so the
    // visual follows the simulated root exactly.
    ballRootMesh.setParent(ballPhysicsMesh);
    ballRootMesh.position = Vector3.Zero();
    ballRootMesh.rotation = Vector3.Zero();
    ballRootMesh.scaling = new Vector3(ballScale, ballScale, ballScale);

    ball = new Ball(ballPhysicsMesh);

    new PhysicsAggregate(
      ballPhysicsMesh,
      PhysicsShapeType.SPHERE,
      { mass: 0.057, restitution: 0.72, friction: 0.3 },
      gameScene
    );

    if (ballPhysicsMesh.physicsBody) {
      ballPhysicsMesh.physicsBody.setLinearDamping(0.05);
      ballPhysicsMesh.physicsBody.setAngularDamping(0.2);

      if (ballPhysicsMesh.physicsBody.shape) {
        ballPhysicsMesh.physicsBody.shape.filterMembershipMask = COL_BALL;
        ballPhysicsMesh.physicsBody.shape.filterCollideMask    = COL_WORLD | COL_PLAYER;
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

      ballSpinTwist *= Math.max(0, 1 - deltaTime * 1.6);
      if (Math.abs(ballSpinTwist) < 0.05) ballSpinTwist = 0;
    };

    const resetBall = (): void => {
      if (!ball?.mesh || !ball.mesh.physicsBody) {
        return;
      }

      ball.mesh.position.copyFrom(BALL_SPAWN_POSITION);
      ball.mesh.rotation.set(0, 0, 0);
      ball.mesh.physicsBody.setLinearVelocity(Vector3.Zero());
      ball.mesh.physicsBody.setAngularVelocity(Vector3.Zero());
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
      const serveDirection = server === 0 ? 1 : -1;
      const serveLineZ = 2.65 * SCALE;
      const serveBallBuffer = 0.10 * SCALE;
      const maxServeX = 2.6 * SCALE;
      const receiveAnticipationDepth = 0.92 * SCALE;
      const receiveAnticipationX = 0.45;

      // Rebuild rally positions for a serve start: server behind line, receiver anticipates bounce lane.
      const serverX = Math.max(-maxServeX, Math.min(maxServeX, servingPlayer.position.x));
      const anticipatedReceiverX = Math.max(-maxServeX, Math.min(maxServeX, serverX * receiveAnticipationX));
      const serverZ = serverSide === 0 ? -(serveLineZ + 0.12 * SCALE) : (serveLineZ + 0.12 * SCALE);
      const receiverZ = serverSide === 0
        ? serveLineZ + receiveAnticipationDepth
        : -(serveLineZ + receiveAnticipationDepth);

      servingPlayer.position.x = serverX;
      servingPlayer.position.z = serverZ;
      receivingPlayer.position.x = anticipatedReceiverX;
      receivingPlayer.position.z = receiverZ;

      if (p1Capsule) {
        p1Capsule.position.x = charRoot1.position.x;
        p1Capsule.position.z = charRoot1.position.z;
      }
      if (p2Capsule) {
        p2Capsule.position.x = charRoot2.position.x;
        p2Capsule.position.z = charRoot2.position.z;
      }

      const desiredServeBallZ = servingPlayer.position.z + serveDirection * 0.85 * SCALE;
      const serveBallZ = serverSide === 0
        ? Math.min(desiredServeBallZ, -serveLineZ - serveBallBuffer)
        : Math.max(desiredServeBallZ, serveLineZ + serveBallBuffer);

      const servePosition = new Vector3(
        servingPlayer.position.x,
        1.55 * SCALE,
        serveBallZ,
      );

      ball.mesh.position.copyFrom(servePosition);
      ball.mesh.rotation.set(0, 0, 0);
      ball.mesh.physicsBody.setLinearVelocity(Vector3.Zero());
      ball.mesh.physicsBody.setAngularVelocity(Vector3.Zero());
    };

    const clearRallyState = (): void => {
      p1Request.action = null;
      p1Request.ttl = 0;
      p2Request.action = null;
      p2Request.ttl = 0;
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

    const syncHud = (): void => {
      hud.renderMatchState(matchManager.score, matchManager.sets, matchManager.currentServer, matchManager.isMatchActive);
    };

    const awardPoint = (scoringTeam: number): void => {
      matchManager.recordPoint(scoringTeam);
      pointAnnouncement.announce(scoringTeam, matchManager.score[scoringTeam]);
      syncHud();
      clearRallyState();

      if (matchManager.isMatchActive) {
        resetBallForServe(matchManager.currentServer);
      }
    };

    const restartServeNoPoint = (): void => {
      clearRallyState();
      resetBallForServe(matchManager.currentServer);
      syncHud();
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
      const right = new Vector3(Math.cos(facing), 0, -Math.sin(facing));
      const forward = new Vector3(Math.sin(facing), 0, Math.cos(facing));
      const handSign = serveState.hand === 'right' ? 1 : -1;
      const serveConfig = getAnimConfigForClip('serve');
      const serveLoft = serveConfig ? Math.max(0, Math.min(1, serveConfig.ballLoft)) : 0.4;
      const serveReachUnits = resolveAnimReachUnits(serveConfig, 1.2);
      const serveReach = Math.max(0.60 * SCALE, Math.min(2.0 * SCALE, serveReachUnits * SCALE));
      const clipLengthFrames = Math.max(1, Math.round(serveConfig?.clipLengthFrames ?? 146));
      const holdStartFrame = Math.max(0, Math.min(clipLengthFrames, Math.round(serveConfig?.holdWindow?.[0] ?? 4)));
      const holdEndFrame = Math.max(holdStartFrame, Math.min(clipLengthFrames, Math.round(serveConfig?.holdWindow?.[1] ?? 31)));
      const contactFrame = Math.max(1, Math.min(clipLengthFrames, Math.round(serveConfig?.contactFrame ?? 62)));
      const tossFrame = Math.max(holdEndFrame + 1, Math.min(contactFrame, Math.round(serveConfig?.tossFrame ?? 32)));
      const rawWindowStart = serveConfig?.contactWindow?.[0] ?? Math.max(1, contactFrame - 4);
      const rawWindowEnd = serveConfig?.contactWindow?.[1] ?? Math.min(clipLengthFrames, contactFrame + 5);
      const strikeWindowStartFrame = Math.max(0, Math.min(contactFrame, Math.min(rawWindowStart, rawWindowEnd)));
      const strikeWindowEndFrame = Math.max(strikeWindowStartFrame, Math.min(clipLengthFrames, Math.max(rawWindowStart, rawWindowEnd)));

      const handOffset = right.scale(0.22 * handSign).add(forward.scale(0.22 * strikeDirection));
      const holdHeight = (1.03 + serveLoft * 0.18) * SCALE;
      const tossStartHeight = holdHeight;
      const serveHeadContactY = Math.max(1.6 * SCALE, Math.min(2.08 * SCALE, (1.50 + serveReachUnits * 0.24) * SCALE));
      // Serve timing follows authored keyframes: hold(4-31), toss(32), strike(58-67), contact(62).
      const frameTimeScale = 0.01;
      const holdStartTime = holdStartFrame * frameTimeScale;
      const holdEndTime = holdEndFrame * frameTimeScale;
      const tossReleaseTime = tossFrame * frameTimeScale;
      const strikeWindowStartTime = strikeWindowStartFrame * frameTimeScale;
      const strikeWindowEndTime = strikeWindowEndFrame * frameTimeScale;
      const contactTime = contactFrame * frameTimeScale;
      const serveImpactFallback = Math.max(0.03, contactTime - strikeWindowStartTime);
      const serveStrikeMaxWait = Math.max(strikeWindowEndTime + 0.48, 1.25);

      const headPos = servingCharacter?.getHeadControlPosition()
        ?? servingPlayer.position.add(new Vector3(0, serveHeadContactY, 0));
      const contactAnchor = headPos.add(forward.scale(0.12 * strikeDirection));
      const timeFromTossToContact = Math.max(0.14, contactTime - tossReleaseTime);
      const tossOriginY = servingPlayer.position.y + tossStartHeight;
      const targetContactY = contactAnchor.y + 0.06 * SCALE;
      const highTossSpeedY = Math.max(
        3.2 * SCALE,
        Math.min(
          8.4 * SCALE,
          (targetContactY - tossOriginY + 0.5 * gravityAbs * timeFromTossToContact * timeFromTossToContact) / timeFromTossToContact,
        ),
      );

      if (serveState.phase === 'ready') {
        const holdPos = servingPlayer.position.add(handOffset).add(new Vector3(0, holdHeight, 0));
        ball.mesh.position.copyFrom(holdPos);
        ball.mesh.physicsBody.setLinearVelocity(Vector3.Zero());
        ball.mesh.physicsBody.setAngularVelocity(Vector3.Zero());
        return;
      }

      if (serveState.phase === 'toss') {
        if (serveState.timer <= 0) {
          const tossStart = servingPlayer.position.add(handOffset).add(new Vector3(0, tossStartHeight, 0));
          ball.mesh.position.copyFrom(tossStart);
          ball.mesh.physicsBody.setAngularVelocity(Vector3.Zero());
          ball.mesh.physicsBody.setLinearVelocity(Vector3.Zero());
          serveState.tossReleased = false;

          if (!serveState.animationStarted) {
            serveState.animationStarted = true;
            servingCharacter?.playAnimation('serve', false);
          }
        }

        serveState.timer += deltaTime;

        // Keep ball in hand until the configured toss frame is reached.
        if (!serveState.tossReleased) {
          const holdY = serveState.timer >= holdStartTime && serveState.timer <= holdEndTime
            ? holdHeight
            : tossStartHeight;
          const tossHold = servingPlayer.position.add(handOffset).add(new Vector3(0, holdY, 0));
          ball.mesh.position.copyFrom(tossHold);
          ball.mesh.physicsBody.setAngularVelocity(Vector3.Zero());
          ball.mesh.physicsBody.setLinearVelocity(Vector3.Zero());

          if (serveState.timer >= tossReleaseTime) {
            ball.mesh.physicsBody.setLinearVelocity(new Vector3(0, highTossSpeedY, 0));
            serveState.tossReleased = true;
          }
        }

        const tossVelocity = ball.mesh.physicsBody.getLinearVelocity();
        const descending = tossVelocity.y < -0.05 * SCALE;

        // Keep the toss near the server laterally so the head strike remains reachable.
        if (serveState.tossReleased) {
          const tetherAnchor = contactAnchor.add(new Vector3(0, 0.2 * SCALE, 0));
          const tetherBlend = Math.max(0, Math.min(1, deltaTime * 8.5));
          ball.mesh.position.x += (tetherAnchor.x - ball.mesh.position.x) * tetherBlend;
          ball.mesh.position.z += (tetherAnchor.z - ball.mesh.position.z) * tetherBlend;
          ball.mesh.physicsBody.setLinearVelocity(new Vector3(
            tossVelocity.x * 0.35,
            tossVelocity.y,
            tossVelocity.z * 0.35,
          ));
        }

        const contactWindowY = contactAnchor.y + 0.20 * SCALE;
        const anchorDx = ball.mesh.position.x - contactAnchor.x;
        const anchorDz = ball.mesh.position.z - contactAnchor.z;
        const anchorDist = Math.sqrt(anchorDx * anchorDx + anchorDz * anchorDz);

        const strikeWindowReady =
          serveState.tossReleased &&
          serveState.timer >= strikeWindowStartTime &&
          (anchorDist <= Math.max(0.30 * SCALE, serveReach * 0.55) || ball.mesh.position.y <= contactWindowY + 0.12 * SCALE);

        if (strikeWindowReady || serveState.timer >= serveStrikeMaxWait) {
          serveState.phase = 'strike';
          serveState.timer = 0;
          serveState.strikeApplied = false;
        }
        return;
      }

      // Strike phase
      serveState.timer += deltaTime;
      const toHead = ball.mesh.position.subtract(contactAnchor);
      const headDist = Math.sqrt(toHead.x * toHead.x + toHead.y * toHead.y + toHead.z * toHead.z);
      const headStrikeRadius = Math.max(0.44 * SCALE, Math.min(0.86 * SCALE, serveReach * 0.56));
      const inHeadStrikeZone = headDist <= headStrikeRadius && ball.mesh.position.y >= contactAnchor.y - 0.32 * SCALE;

      if (!serveState.strikeApplied && !inHeadStrikeZone && serveState.timer <= serveImpactFallback) {
        const settleBlend = Math.max(0, Math.min(1, deltaTime * 9.5));
        ball.mesh.position.x += (contactAnchor.x - ball.mesh.position.x) * settleBlend;
        ball.mesh.position.z += (contactAnchor.z - ball.mesh.position.z) * settleBlend;
      }

      if (!serveState.strikeApplied && (inHeadStrikeZone || serveState.timer >= serveImpactFallback)) {
        if (!inHeadStrikeZone) {
          const snap = contactAnchor.add(new Vector3(0, 0.08 * SCALE, 0));
          ball.mesh.position.copyFrom(snap);
        }

        const tableTarget = new Vector3(
          Math.max(-0.65 * SCALE, Math.min(0.65 * SCALE, servingPlayer.position.x * 0.22)),
          0.92 * SCALE,
          0,
        );
        const from = ball.mesh.position.clone();
        const to = tableTarget.subtract(from);
        const flat = new Vector3(to.x, 0, to.z);
        const dist = Math.max(0.15 * SCALE, flat.length());
        const defaultServeSpeedRaw = (headerKickSpeed * 0.95) / Math.max(1e-4, animConfigBallSpeedScale);
        const resolvedServeSpeedRaw = resolveAnimBallSpeedValue(serveConfig, defaultServeSpeedRaw);
        const serveSpeed = Math.max(3.2 * SCALE, Math.min(10.8 * SCALE, resolvedServeSpeedRaw * animConfigBallSpeedScale));
        const time = Math.max(0.34, Math.min(0.72, dist / Math.max(0.001, serveSpeed * 0.82)));
        const vxz = dist / time;
        const dir = flat.lengthSquared() > 1e-5 ? flat.normalize() : new Vector3(0, 0, strikeDirection);
        let vy = (to.y + 0.5 * gravityAbs * time * time) / time;
        vy += (serveLoft - 0.25) * 1.6 * SCALE;
        vy = Math.max(0.95 * SCALE, Math.min(7.8 * SCALE, vy));

        ball.mesh.physicsBody.setLinearVelocity(new Vector3(dir.x * vxz, vy, dir.z * vxz));
        addBallSpinTwist(dir.x * 6.0 + strikeDirection * 2.0);
        registerPlayerTouch(serveState.server);
        serveBounceGrace = 1;
        serveState.strikeApplied = true;
      }

      const serveStrikeTail = Math.max(0.32, (strikeWindowEndTime - strikeWindowStartTime) + 0.26);
      if (serveState.timer >= serveStrikeTail) {
        serveState.active = false;
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
      }

      lastTouchPlayer = playerIndex;
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
      const tableHalfWidth = 0.85 * SCALE;
      const edgeBand = 0.11 * SCALE;
      const tableHalfLength = 1.5 * SCALE;
      const nearTop = ballPos.y <= 1.18 * SCALE;
      const withinTableLength = Math.abs(ballPos.z) <= tableHalfLength + 0.18 * SCALE;
      const onEdgeBand = Math.abs(Math.abs(ballPos.x) - tableHalfWidth) <= edgeBand;
      return nearTop && withinTableLength && onEdgeBand;
    };

    const isTableSurfaceBounce = (ballPos: Vector3): boolean => {
      const tableHalfWidth = 0.85 * SCALE;
      const tableHalfLength = 1.5 * SCALE;
      const tableTopY = 0.87 * SCALE;
      const tableTopBand = 0.34 * SCALE;
      const withinTableX = Math.abs(ballPos.x) <= tableHalfWidth + 0.10 * SCALE;
      const withinTableZ = Math.abs(ballPos.z) <= tableHalfLength + 0.14 * SCALE;
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
      const scale = 1.95 / measuredHeight;

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

    player1 = new Character(0, charRoot1, charData1.skeletons[0] ?? null, p1Stats, charData1.animationGroups, PLAYER_MODEL_YAW_OFFSET);
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
      p1Capsule.physicsBody.shape.filterCollideMask    = COL_BALL | COL_WORLD;
    }

    // Create player 2  — second independent instantiation of the same container
    const p2Stats: CharacterStats = { speed: 8, jump: 1.2, power: 100, spin: 80 };
    const charData2 = await assetManager.loadModel('neymar');
    if (charData2.meshes.length === 0) throw new Error('neymar model (p2) has no meshes');

    const charRoot2 = charData2.meshes[0];
    charRoot2.scaling = new Vector3(charScale1, charScale1, charScale1);

    player2 = new Character(1, charRoot2, charData2.skeletons[0] ?? null, p2Stats, charData2.animationGroups, PLAYER_MODEL_YAW_OFFSET);
    charRoot2.position = new Vector3(0, charNorm.yOffset, PLAYER_SPAWN_Z);
    charRoot2.rotation = new Vector3(charNorm.tiltX, Math.PI + PLAYER_MODEL_YAW_OFFSET, charNorm.tiltZ); // faces -Z (toward table)
    placeCharacterSafely(charRoot2, charData2.skeletons[0] ?? null, 1, charNorm.yOffset);
    applyPlayerDebugMaterial(charRoot2, 'p2DebugMat', new Color3(0.72, 0.74, 0.78));

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
      p2Capsule.physicsBody.shape.filterCollideMask    = COL_BALL | COL_WORLD;
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
    syncHud();
    resetBallForServe(0);



    // Hide loading screen
    if (loadingScreen) {
      loadingScreen.style.display = 'none';
    }

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
    const tableTargetY = 0.88 * SCALE; // ball-center height for first contact on table top
    const tableTargetXScale = 0.24; // tighter lateral targeting to keep shots on table
    const tableTargetHalfWidth = 0.72 * SCALE;
    const gravityAbs = 9.81;
    const impactWindowGrace = 0.08;
    const antiTunnelBodyRadius = 0.42 * SCALE;
    const antiTunnelBodyBottom = 0.20 * SCALE;
    const antiTunnelBodyTop = 1.95 * SCALE;
    const antiTunnelPushOut = 0.05 * SCALE;
    const antiTunnelMinReboundY = 2.2 * SCALE;
    const playerBodyRadius = 0.42 * SCALE;
    const playerBodyBottom = 0.22 * SCALE;
    const playerBodyTop = 1.95 * SCALE;
    const playerBodyRestitution = 0.58;
    const playerBodyPush = 0.35 * SCALE;
    const playerDribbleSpeed = 3.8 * SCALE;
    const playerHalfCourtX = 5.4 * SCALE;
    const playerHalfCourtZ = 7.2 * SCALE;
    // Keep player capsules out of the table volume around the center line.
    // 0.85m table half-width + ~0.35m player body radius ~= 1.2m safety split.
    const minCourtSplitZ = 2.35 * SCALE;

    const p1Motion = { vx: 0, vz: 0, facing: 0 };
    const p2Motion = { vx: 0, vz: 0, facing: Math.PI };
    type HeightBand = 'low' | 'mid' | 'high' | 'veryHigh';
    type TouchPhase = 'defense' | 'reception' | 'preparation' | 'kick';
    type BoxIndex = { x: number; y: number; z: number; key: string };
    type TableCell = { row: number; col: number; center: Vector3; score: number };
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
    let postKickLockTimer = 0;
    let postKickLockSpeed = 0;
    let postKickLockDir = new Vector3(0, 0, 1);
    let lastTouchPlayer: CourtSide | null = null;
    const touchesByPlayer: [number, number] = [0, 0];
    const bouncesOnSideSinceLastTouch: [number, number] = [0, 0];
    const tableBouncesOnSideSinceLastTouch: [number, number] = [0, 0];
    let bounceEventCooldown = 0;
    let serveBounceGrace = 0;

    const GRID_X_BANDS = 5;
    const GRID_Z_BANDS = 3;
    const TABLE_ROWS = 2;
    const TABLE_COLS = 3;

    const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
    const clampi = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));

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

      const localZ = side === 0 ? (pos.z + minCourtSplitZ) : (playerHalfCourtZ - pos.z);
      const zNorm = clamp01(localZ / Math.max(0.001, playerHalfCourtZ - minCourtSplitZ));
      const z = clampi(Math.floor(zNorm * GRID_Z_BANDS), 0, GRID_Z_BANDS - 1);
      return { x, y, z, key: `${x}-${y}-${z}` };
    };

    const getTouchPhaseForPlayer = (player: CourtSide): TouchPhase => {
      if (lastTouchPlayer !== player) return 'defense';
      const nextTouch = touchesByPlayer[player] + 1;
      if (nextTouch <= 1) return 'reception';
      if (nextTouch === 2) return 'preparation';
      return 'kick';
    };

    const chooseActionForPhase = (phase: TouchPhase, ballBand: HeightBand, playerPos: Vector3): OffensiveAction => {
      const lateralOffset = Math.abs(ball.mesh.position.x - playerPos.x);
      const centerLane = lateralOffset <= 0.42 * SCALE;
      const superWideLane = lateralOffset >= 1.12 * SCALE;

      if (phase === 'reception') {
        if (ballBand === 'low') return 'receptionToe';
        if (ballBand === 'mid') return 'receptionInnerRight';
        return 'receptionChest';
      }

      if (phase === 'preparation') {
        if (ballBand === 'high' || ballBand === 'veryHigh') return 'prepChest';
        return 'prepInnerRight';
      }

      // Kick phase subdivision from the provided clip grouping.
      if (ballBand === 'low') {
        return 'kickChest';
      }
      if (ballBand === 'mid') {
        return centerLane ? 'kickCloseRightFoot' : 'kickCloseHead';
      }
      if (ballBand === 'high') {
        return superWideLane ? 'kickSoleRight' : 'kickHead';
      }
      if (centerLane) {
        return 'kickJumpHead';
      }
      if (superWideLane) {
        return 'kickBicycleLeft';
      }
      return 'kickHighLeft';
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

    const planInferredAction = (
      player: CourtSide,
      playerPos: Vector3,
      opponentPos: Vector3,
    ): { phase: TouchPhase; effectivePhase: TouchPhase; action: OffensiveAction; ballBand: HeightBand; reachable: boolean } => {
      const ballSide = sideFromZ(ball.mesh.position.z);
      const phase = getPlannedPhase(player, ballSide);
      const ballBand = getHeightBand(ball.mesh.position.y);
      const horizontalDist = Vector3.Distance(
        new Vector3(playerPos.x, 0, playerPos.z),
        new Vector3(ball.mesh.position.x, 0, ball.mesh.position.z),
      );

      let effectivePhase = phase;
      if (phase === 'preparation' && touchesByPlayer[player] >= 2) {
        const laneGood = Math.abs(opponentPos.x - ball.mesh.position.x) > 1.8 * SCALE;
        const highControl = ballBand === 'high' || ballBand === 'veryHigh';
        const closeEnough = horizontalDist < 1.95 * SCALE;
        if (laneGood && highControl && closeEnough) {
          effectivePhase = 'kick';
        }
      }

      const action = chooseActionForPhase(effectivePhase, ballBand, playerPos);
      const reachable = horizontalDist <= getActionAssistProfile(action).startRange + 0.35 * SCALE;
      return { phase, effectivePhase, action, ballBand, reachable };
    };

    const buildTableCells = (attackerSide: CourtSide): TableCell[] => {
      const cells: TableCell[] = [];
      const rowHalfDepth = 1.5 * SCALE;
      const colHalfWidth = 0.85 * SCALE;
      const zNear = attackerSide === 0 ? 0.55 * SCALE : -0.55 * SCALE;
      const zFar = attackerSide === 0 ? 1.25 * SCALE : -1.25 * SCALE;
      const rows = [zNear, zFar];
      const cols = [-0.57 * SCALE, 0, 0.57 * SCALE];
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

    const getPlannedPhase = (player: CourtSide, ballSide: CourtSide): TouchPhase => {
      if (lastTouchPlayer === player) {
        const nextTouch = touchesByPlayer[player] + 1;
        if (nextTouch <= 1) return 'reception';
        if (nextTouch === 2) return 'preparation';
        return 'kick';
      }
      if (ballSide === player) {
        const bouncedOnMyTableSide = tableBouncesOnSideSinceLastTouch[player] >= 1;
        return bouncedOnMyTableSide ? 'reception' : 'defense';
      }
      return 'defense';
    };

    const queueAutoAction = (
      player: CourtSide,
      request: ActionRequestState,
      assist: AssistState,
      playerPos: Vector3,
      opponentPos: Vector3,
      serveSetupActive: boolean,
    ): void => {
      if (request.action || assist.active || serveSetupActive) return;

      const plan = planInferredAction(player, playerPos, opponentPos);
      if (plan.phase === 'defense' || !plan.reachable) return;

      const playerBox = classifyBox(playerPos, player);
      const ballBox = classifyBox(ball.mesh.position, player);

      // Keep request short; it will be re-evaluated every frame.
      request.action = plan.action;
      request.ttl = Math.max(0.18, Math.min(0.55, 0.28 + (ballBox.y - playerBox.y) * 0.06));
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

      updateBallVisualSpin(deltaTime);

      if (
        ball.mesh.position.y > BALL_RESET_HEIGHT ||
        Math.abs(ball.mesh.position.x) > BALL_RESET_X_LIMIT ||
        Math.abs(ball.mesh.position.z) > BALL_RESET_Z_LIMIT
      ) {
        resetBall();
        currentVelocity = physicsBody.getLinearVelocity();
      }

      if (currentVelocity.y > BALL_MAX_UPWARD_SPEED) {
        physicsBody.setLinearVelocity(
          new Vector3(currentVelocity.x, BALL_MAX_UPWARD_SPEED, currentVelocity.z)
        );
        currentVelocity = physicsBody.getLinearVelocity();
      }

      if (animationPreviewMode) {
        const previewCharacter = animationPreviewPlayer === 1 ? player1 : player2;
        if (previewCharacter && animationPreviewLockedYaw !== null) {
          previewCharacter.mesh.rotation.y = animationPreviewLockedYaw;
          previewCharacter.mesh.computeWorldMatrix(true);
        }
        return;
      }

      if (postKickLockTimer > 0) {
        postKickLockTimer = Math.max(0, postKickLockTimer - deltaTime);
        const v = physicsBody.getLinearVelocity();
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

      bounceEventCooldown = Math.max(0, bounceEventCooldown - deltaTime);
      const bounceCandidate =
        bounceEventCooldown <= 0 &&
        ball.mesh.position.y <= 1.16 * SCALE &&
        physicsBody.getLinearVelocity().y < -0.55 * SCALE;
      if (bounceCandidate) {
        bounceEventCooldown = 0.22;
        if (!collisionDrill.enabled) {
          handleBounceRules();
        }
      }

      // Player 1 controls (WASD + Space)
      let p1MoveX = 0;
      let p1MoveZ = 0;
      if (pressedKeys.has('a')) p1MoveX -= 1;
      if (pressedKeys.has('d')) p1MoveX += 1;
      if (pressedKeys.has('w')) p1MoveZ -= 1;
      if (pressedKeys.has('s')) p1MoveZ += 1;

      // Player 2 controls (Arrow Keys + Enter)
      let p2MoveX = 0;
      let p2MoveZ = 0;
      if (pressedKeys.has('arrowleft')) p2MoveX -= 1;
      if (pressedKeys.has('arrowright')) p2MoveX += 1;
      if (pressedKeys.has('arrowup')) p2MoveZ -= 1;
      if (pressedKeys.has('arrowdown')) p2MoveZ += 1;

      if (ENABLE_P1_AI && !collisionDrill.enabled) {
        const targetX = Math.max(-playerHalfCourtX, Math.min(playerHalfCourtX, ball.mesh.position.x));
        const targetZ = Math.max(-playerHalfCourtZ, Math.min(-minCourtSplitZ, ball.mesh.position.z));
        const dx = targetX - charRoot1.position.x;
        const dz = targetZ - charRoot1.position.z;
        const dead = 0.24 * SCALE;
        p1MoveX = Math.abs(dx) > dead ? Math.sign(dx) : 0;
        p1MoveZ = Math.abs(dz) > dead ? Math.sign(dz) : 0;
      }

      if (ENABLE_P2_AI && !collisionDrill.enabled) {
        const targetX = Math.max(-playerHalfCourtX, Math.min(playerHalfCourtX, ball.mesh.position.x));
        const targetZ = Math.max(minCourtSplitZ, Math.min(playerHalfCourtZ, ball.mesh.position.z));
        const dx = targetX - charRoot2.position.x;
        const dz = targetZ - charRoot2.position.z;
        const dead = 0.24 * SCALE;
        p2MoveX = Math.abs(dx) > dead ? Math.sign(dx) : 0;
        p2MoveZ = Math.abs(dz) > dead ? Math.sign(dz) : 0;
      }

      const getDefenseAdjustment = (
        player: CourtSide,
        playerPos: Vector3,
        minZ: number,
        maxZ: number,
      ): { x: number; z: number } => {
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
        const p1DefenseAdjust = getDefenseAdjustment(0, charRoot1.position, -playerHalfCourtZ, -minCourtSplitZ);
        if (Math.abs(p1MoveX) < 0.01) {
          p1MoveX = p1DefenseAdjust.x;
        }
        if (Math.abs(p1MoveZ) < 0.01) {
          p1MoveZ = p1DefenseAdjust.z;
        } else {
          p1MoveZ += p1DefenseAdjust.z * 0.25;
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

      const now = Date.now();
      let serveSetupActive = serveState.active && serveState.phase !== 'strike';

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
        const p1ServeTrigger = serveState.server === 0 && (ENABLE_P1_AI || pressedKeys.has('space'));
        const p2ServeTrigger = serveState.server === 1 && (ENABLE_P2_AI || pressedKeys.has('enter'));
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

      if (!collisionDrill.enabled && !serveSetupActive && pressedKeys.has('space') && now - lastP1LiftPress > setupLiftCooldown) {
        tryLiftBall(charRoot1.position);
        lastP1LiftPress = now;
      }
      if (!collisionDrill.enabled && !serveSetupActive && pressedKeys.has('enter') && now - lastP2LiftPress > setupLiftCooldown) {
        tryLiftBall(charRoot2.position);
        lastP2LiftPress = now;
      }

      const queueInferredKickRequest = (player: CourtSide, request: ActionRequestState): void => {
        const playerPos = player === 0 ? charRoot1.position : charRoot2.position;
        const opponentPos = player === 0 ? charRoot2.position : charRoot1.position;
        const plan = planInferredAction(player, playerPos, opponentPos);
        if (plan.phase === 'defense' || !plan.reachable) {
          return;
        }

        if (pendingPrepSuperHigh[player] && plan.effectivePhase === 'preparation') {
          request.action = 'prepChest';
          request.ttl = Math.max(request.ttl, actionRequestTtl * 0.9);
          pendingPrepSuperHigh[player] = false;
          return;
        }

        request.action = plan.action;
        request.ttl = actionRequestTtl;
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
        const configuredReach = resolveAnimReachUnits(animConfig, profile.startRange / SCALE) * SCALE;
        const maxReach = Math.max(
          profile.startRange * 0.72,
          Math.min(profile.startRange * 1.28, configuredReach),
        );

        const toBall = ball.mesh.position.subtract(root.position);
        const flatToBall = new Vector3(toBall.x, 0, toBall.z);
        const distance = flatToBall.length();
        if (distance > maxReach || distance < 0.05) return;

        const towardBall = flatToBall.normalize();
        const right = new Vector3(towardBall.z, 0, -towardBall.x);
        const playerRight = new Vector3(Math.cos(motion.facing), 0, -Math.sin(motion.facing));
        const sideDot = Vector3.Dot(towardBall, playerRight);
        const sideSign = sideDot >= 0 ? 1 : -1;

        const depth = profile.depth;
        const lateral = sideSign * profile.lateral;
        const target = ball.mesh.position
          .subtract(towardBall.scale(depth))
          .add(right.scale(lateral));

        if (!character.performAirAction(action, ball.mesh.position)) return;

        const strikeDuration = profile.duration;
        let impactTime = profile.impactTime;
        if (animConfig) {
          const contactRatio = getContactFrameRatio(animConfig, 0.5);
          const contactFromStartSec = strikeDuration * contactRatio;
          impactTime = Math.max(0.02, Math.min(strikeDuration, strikeDuration - contactFromStartSec));
        }

        assist.active = true;
        assist.action = action;
        assist.timer = strikeDuration;
        assist.impactTime = impactTime;
        assist.hitApplied = false;
        assist.targetX = Math.max(-playerHalfCourtX, Math.min(playerHalfCourtX, target.x));
        assist.targetZ = Math.max(minZ, Math.min(maxZ, target.z));

        motion.vx = 0;
        motion.vz = 0;

        // Keep player facing the table during strikes for symmetric mirrored playback.
        motion.facing = maxZ < 0 ? 0 : Math.PI;
        root.rotation.y = motion.facing + PLAYER_MODEL_YAW_OFFSET + (character?.getMirrorFacingCompensationYaw() ?? 0) + (character?.getAnimationFacingCompensationYaw() ?? 0);
        strikeState.action = action;
        strikeState.timer = strikeDuration;
      };

      const p1KickPressed = pressedKeys.has('q');
      if (!collisionDrill.enabled && !serveSetupActive && now - lastP1ActionPress > actionPressCooldown) {
        if (ENABLE_P1_AI) {
          const toBall1 = ball.mesh.position.subtract(charRoot1.position);
          const dist1 = Math.sqrt(toBall1.x * toBall1.x + toBall1.z * toBall1.z);
          const vy1 = physicsBody.getLinearVelocity().y;
          if (dist1 <= 2.15 * SCALE && vy1 < -0.15 * SCALE && ball.mesh.position.y >= 0.85 * SCALE) {
            queueInferredKickRequest(0, p1Request);
            lastP1ActionPress = now;
          }
        }
      }

      if (!collisionDrill.enabled && !ENABLE_P1_AI && !serveSetupActive && p1KickPressed && !p1KickButtonHeld && now - lastP1ActionPress > actionPressCooldown) {
        const phase = getPlannedPhase(0, sideFromZ(ball.mesh.position.z));
        const isDoubleTap = now - lastP1KickButtonPress <= DOUBLE_TAP_WINDOW_MS;
        if (isDoubleTap) {
          if (phase === 'preparation') pendingPrepSuperHigh[0] = true;
          if (phase === 'kick') pendingKickPowerBoost[0] = true;
        }
        lastP1KickButtonPress = now;
        queueInferredKickRequest(0, p1Request);
        lastP1ActionPress = now;
      }
      p1KickButtonHeld = p1KickPressed;

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

      const p2KickPressed = pressedKeys.has('u');
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
      if (!collisionDrill.enabled) {
        queueAutoAction(0, p1Request, p1Assist, charRoot1.position, charRoot2.position, serveSetupActive);
        queueAutoAction(1, p2Request, p2Assist, charRoot2.position, charRoot1.position, serveSetupActive);
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

          // Recompute assisted strike target every frame so player follows the
          // falling ball trajectory instead of aiming at a stale position.
          if (assist.action) {
            const profile = getActionAssistProfile(assist.action);
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

          const targetFacing = maxZ < 0 ? 0 : Math.PI;
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
        const targetFacing = maxZ < 0 ? 0 : Math.PI;
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

      if (collisionDrill.enabled && collisionDrill.activeFlight) {
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

        request.ttl = Math.max(0, request.ttl - deltaTime);
        if (request.ttl <= 0) {
          request.action = null;
          return;
        }
        if (assist.active) return;

        const vel = physicsBody.getLinearVelocity();
        if (vel.y > actionFallingMinYSpeed) return; // kicks only when ball is falling

        const toBall = ball.mesh.position.subtract(root.position);
        const horizontal = Math.sqrt(toBall.x ** 2 + toBall.z ** 2);
        const height = ball.mesh.position.y;

        const profile = getActionAssistProfile(request.action);
        const animConfig = getAnimConfigForAction(request.action);
        const configuredReach = resolveAnimReachUnits(animConfig, profile.startRange / SCALE) * SCALE;
        const maxReach = Math.max(
          profile.startRange * 0.72,
          Math.min(profile.startRange * 1.28, configuredReach),
        );
        const rangeOk = horizontal <= maxReach;
        const heightOk = height >= profile.minHeight && height <= profile.maxHeight;

        if (!rangeOk || !heightOk) return;

        triggerAction(character, root, motion, minZ, maxZ, assist, strikeState, request.action);
        if (assist.active) {
          request.action = null;
          request.ttl = 0;
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

      const preventBallTunnelingThroughPlayer = (playerPos: Vector3, assist: AssistState): void => {
        if (assist.active) return;
        const vel = physicsBody.getLinearVelocity();
        if (vel.y >= -0.05) return;

        const toBall = ball.mesh.position.subtract(playerPos);
        const flat = new Vector3(toBall.x, 0, toBall.z);
        const horizontal = flat.length();
        const y = ball.mesh.position.y;

        if (horizontal > antiTunnelBodyRadius + ballRadius) return;
        if (y < antiTunnelBodyBottom || y > antiTunnelBodyTop) return;

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
      };

      const enforcePlayerBodyCollision = (rig: PlayerHitboxRig, assist: AssistState): void => {
        if (assist.active) return;

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
          const outNormal = vn < 0 ? -vn * bestContact.restitution : vn + 0.10 * SCALE;
          let nextVel = tangential.scale(0.985).add(bestContact.normal.scale(outNormal));

          if (bestContact.part.includes('foot') || bestContact.part.includes('knee')) {
            nextVel = new Vector3(nextVel.x, Math.max(nextVel.y, 0.2 * SCALE), nextVel.z);
          }

          physicsBody.setLinearVelocity(nextVel);
          return;
        }

        // Fallback body volume for areas not covered by current bone matches.
        const toBall = ball.mesh.position.subtract(rig.root.position);
        const flat = new Vector3(toBall.x, 0, toBall.z);
        const horizontal = flat.length();
        const y = ball.mesh.position.y;
        const combinedRadius = playerBodyRadius + ballRadius;

        if (horizontal >= combinedRadius) return;
        if (y < playerBodyBottom || y > playerBodyTop) return;

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
      };

      const p1CollisionActive = !collisionDrill.enabled || collisionDrill.side === 0;
      const p2CollisionActive = !collisionDrill.enabled || collisionDrill.side === 1;

      if (p1CollisionActive) {
        preventBallTunnelingThroughPlayer(charRoot1.position, p1Assist);
        enforcePlayerBodyCollision(p1HitboxRig, p1Assist);
      }
      if (p2CollisionActive) {
        preventBallTunnelingThroughPlayer(charRoot2.position, p2Assist);
        enforcePlayerBodyCollision(p2HitboxRig, p2Assist);
      }

      const applyPlayerBallInfluence = (
        character: Character | undefined,
        playerPos: Vector3,
        velocityX: number,
        velocityZ: number,
        assist: AssistState,
        strikeState: { action: OffensiveAction | null; timer: number },
      ): void => {
        if (serveState.active && serveState.phase !== 'strike') {
          return;
        }
        if (!character) return;

        const toBall = ball.mesh.position.subtract(playerPos);
        const flatToBall = new Vector3(toBall.x, 0, toBall.z);
        const distance = flatToBall.length();
        if (!assist.active && distance > playerKickRange) return;

        const vel = physicsBody.getLinearVelocity();

        if (assist.active && strikeState.action && strikeState.timer > 0) {
          const profile = getActionAssistProfile(strikeState.action);
          const inHeightWindow = ball.mesh.position.y >= profile.minHeight && ball.mesh.position.y <= profile.maxHeight;

          // Use strike bone position instead of player root
          const strikePos = character.getStrikeBonePosition();
          const strikeToBall = ball.mesh.position.subtract(strikePos);
          const contactDistance = strikeToBall.length();

          // Assisted pull keeps timing smooth before impact; avoid hard height rejection.
          if (!assist.hitApplied && inHeightWindow && contactDistance <= profile.magnetRange && contactDistance > 1e-4) {
            applyRealisticBallConvergence(
              strikePos,
              profile.magnetRange,
              actionAssistMagnetStrength,
              19.0 * SCALE,
              0.34,
              deltaTime,
            );
          }
          
          const inImpactWindow = strikeState.timer <= (assist.impactTime + impactWindowGrace);

          // Fallback strike point estimate keeps kicks reliable when skeleton
          // bone lookup is imperfect for a specific GLB rig.
          const toBallFlat = new Vector3(toBall.x, 0, toBall.z);
          const toBallDir = toBallFlat.lengthSquared() > 1e-5
            ? toBallFlat.normalize()
            : new Vector3(0, 0, 1);
          const fallbackStrikePos = playerPos
            .add(new Vector3(0, profile.fallbackY, 0))
            .add(toBallDir.scale(profile.fallbackForward));
          const fallbackDistance = Vector3.Distance(fallbackStrikePos, ball.mesh.position);
          const effectiveContactDistance = Math.min(contactDistance, fallbackDistance);

          if (!assist.hitApplied && inImpactWindow && effectiveContactDistance > profile.contactDistance) {
            // Deterministic contact assist: snap ball near strike point right at impact frame.
            const toBallN = strikeToBall.lengthSquared() > 1e-5
              ? strikeToBall.normalize()
              : toBallDir;
            const snapDist = profile.contactDistance * 0.62;
            ball.mesh.position.copyFrom(strikePos.add(toBallN.scale(snapDist)));
          }

          if (!assist.hitApplied && inImpactWindow) {
            // Hard guarantee: at impact frame, force contact if needed.
            if (effectiveContactDistance > profile.contactDistance) {
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
            strikeSpeed = Math.max(2.8 * SCALE, Math.min(12.5 * SCALE, configSpeed));

            const attackerSide: CourtSide = playerPos.z < 0 ? 0 : 1;
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

            const isControlTouch = touchPhase === 'reception' || touchPhase === 'preparation';
            if (isControlTouch) {
              const contactRatio = getContactFrameRatio(animConfig, 0.5);
              const baseControlHeight = touchPhase === 'preparation' ? 1.45 * SCALE : 1.18 * SCALE;
              const loft = animConfig ? Math.max(0, Math.min(1, animConfig.ballLoft)) : 0.5;
              const controlHeight = Math.max(
                0.9 * SCALE,
                Math.min(
                  2.25 * SCALE,
                  baseControlHeight + (contactRatio - 0.5) * 0.42 * SCALE + (loft - 0.5) * 0.22 * SCALE,
                ),
              );

              const controlReachUnits = resolveAnimReachUnits(animConfig, 1.25);
              const controlForward = Math.max(0.45 * SCALE, Math.min(1.05 * SCALE, controlReachUnits * 0.55 * SCALE));
              const forwardSign = attackerSide === 0 ? 1 : -1;
              const controlXOffset = Math.max(-0.35 * SCALE, Math.min(0.35 * SCALE, (ball.mesh.position.x - playerPos.x) * 0.45));
              const controlX = Math.max(-playerHalfCourtX * 0.88, Math.min(playerHalfCourtX * 0.88, playerPos.x + controlXOffset));
              const controlZ = Math.max(
                attackerSide === 0 ? -playerHalfCourtZ : minCourtSplitZ,
                Math.min(
                  attackerSide === 0 ? -minCourtSplitZ : playerHalfCourtZ,
                  playerPos.z + forwardSign * controlForward,
                ),
              );

              const controlTarget = new Vector3(controlX, controlHeight, controlZ);
              const settleTime = touchPhase === 'preparation' ? 0.22 : 0.20;
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
              registerPlayerTouch(attackerSide);
              return;
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
              : new Vector3(0, 0, playerPos.z < 0 ? 1 : -1);

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

            physicsBody.setLinearVelocity(
              new Vector3(
                flatDir.x * horizontalSpeed,
                vy,
                flatDir.z * horizontalSpeed,
              )
            );
            addBallSpinTwist(flatDir.x * 7.5 + (strikeFamily === 'scissor' ? 3.5 : 1.8));

            postKickLockTimer = collisionDrill.enabled ? 0.18 : 0.45;
            postKickLockSpeed = horizontalSpeed;
            postKickLockDir = flatDir.clone();

            assist.hitApplied = true;
            assist.active = false;
            assist.action = null;
            strikeState.action = null;
            strikeState.timer = 0;
            registerPlayerTouch(playerPos.z < 0 ? 0 : 1);
          }
          return;
        }

        if (postKickLockTimer <= 0 && distance <= playerPushRange) {
          const moveSpeed = Math.sqrt(velocityX ** 2 + velocityZ ** 2);
          if (moveSpeed <= 0.1) {
            return;
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
          registerPlayerTouch(playerPos.z < 0 ? 0 : 1);
        }
      };

      applyPlayerBallInfluence(player1, charRoot1.position, p1Motion.vx, p1Motion.vz, p1Assist, p1StrikeState);
      applyPlayerBallInfluence(player2, charRoot2.position, p2Motion.vx, p2Motion.vz, p2Assist, p2StrikeState);

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

      if (player1) {
        const local1 = getLocalMovement(p1MoveX, p1MoveZ, p1Motion.facing);
        const p1DistToBall = Math.sqrt((ball.mesh.position.x - charRoot1.position.x) ** 2 + (ball.mesh.position.z - charRoot1.position.z) ** 2);
        const p1QuickBoost = physicsBody.getLinearVelocity().y < -0.25 * SCALE
          ? Math.max(1.0, Math.min(1.35, 1.35 - p1DistToBall * 0.09))
          : 1.0;
        const p1SpeedRatio =
          (Math.sqrt(p1Motion.vx ** 2 + p1Motion.vz ** 2) / Math.max(0.001, playerMoveSpeed)) * p1QuickBoost;
        player1.setMovement(local1.localX, -local1.localZ, false, deltaTime, p1SpeedRatio);
      }
      if (player2) {
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

      pointAnnouncement.update(deltaTime);
      hud.update(deltaTime);

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

main().catch(console.error);
