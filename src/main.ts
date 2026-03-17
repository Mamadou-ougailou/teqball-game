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
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Ball } from './entities/Ball';
import { Character } from './entities/Character';
import { TeqballTable } from './entities/TeqballTable';
import { CharacterStats } from './core/interfaces';
import HavokPhysics from '@babylonjs/havok';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import { PhysicsAggregate } from '@babylonjs/core/Physics/v2/physicsAggregate';
import { PhysicsShapeType } from '@babylonjs/core/Physics/v2/IPhysicsEnginePlugin';
import '@babylonjs/core/Physics/physicsEngineComponent';

const SCALE = 1.0; // Global scale factor

let gameScene: Scene;
let assetManager: AssetManager;
let ball: Ball;
let player1: Character;
let player2: Character;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let table: TeqballTable;
const pressedKeys = new Set<string>();
const controlKeys = new Set(['arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's', 'space']);
let lastSpacePress = 0;
// Spawn ball well above the table surface (table top is ~0.76 m; ball radius 0.11 m)
const BALL_SPAWN_POSITION = new Vector3(0, 1.5 * SCALE, 0);
const BALL_MAX_UPWARD_SPEED = 8 * SCALE;
const BALL_RESET_HEIGHT = 8 * SCALE;
const BALL_RESET_X_LIMIT = 10 * SCALE;
const BALL_RESET_Z_LIMIT = 14 * SCALE;

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

    const resetBall = (): void => {
      if (!ball?.mesh || !ball.mesh.physicsBody) {
        return;
      }

      ball.mesh.position.copyFrom(BALL_SPAWN_POSITION);
      ball.mesh.rotation.set(0, 0, 0);
      ball.mesh.physicsBody.setLinearVelocity(Vector3.Zero());
      ball.mesh.physicsBody.setAngularVelocity(Vector3.Zero());
    };

    // Create player 1  — animated character, neg-Z side of the table
    const p1Stats: CharacterStats = { speed: 8, jump: 1.2, power: 100, spin: 80 };
    const charData1 = await assetManager.loadModel('character');
    if (charData1.meshes.length === 0) throw new Error('character model has no meshes');

    // Scale to ~1.8 m tall using the root node only (applying to every child
    // would double-scale the geometry inside the hierarchy).
    const charRoot1 = charData1.meshes[0];
    charRoot1.scaling = new Vector3(1, 1, 1);
    charRoot1.computeWorldMatrix(true);
    const charBounds1 = charRoot1.getHierarchyBoundingVectors(true);
    const charHeight1 = charBounds1.max.y - charBounds1.min.y;
    const charScale1  = charHeight1 > 0 ? 1.8 / charHeight1 : 1;
    charRoot1.scaling = new Vector3(charScale1, charScale1, charScale1);

    player1 = new Character(0, charRoot1, charData1.skeletons[0] ?? null, p1Stats, charData1.animationGroups);
    charRoot1.position = new Vector3(0, 0, -3.0 * SCALE);
    charRoot1.rotation = new Vector3(0, 0, 0);  // faces +Z (toward table)

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
    const charData2 = await assetManager.loadModel('character');
    if (charData2.meshes.length === 0) throw new Error('character model (p2) has no meshes');

    const charRoot2 = charData2.meshes[0];
    charRoot2.scaling = new Vector3(charScale1, charScale1, charScale1);

    player2 = new Character(1, charRoot2, charData2.skeletons[0] ?? null, p2Stats, charData2.animationGroups);
    charRoot2.position = new Vector3(0, 0, 3.0 * SCALE);
    charRoot2.rotation = new Vector3(0, Math.PI, 0); // faces -Z (toward table)

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



    // Hide loading screen
    if (loadingScreen) {
      loadingScreen.style.display = 'none';
    }

    // Keyboard controls for ball
    window.addEventListener('keydown', (event) => {
      const key = event.key === ' ' ? 'space' : event.key.toLowerCase();
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

    // Ball movement update (physics-based with keyboard control)
    const ballMoveSpeed = 6 * SCALE;
    const ballAirSpeed = 4 * SCALE;
    const bounceVelocity = 5.5 * SCALE; // Direct velocity, not impulse
    const spacePressCooldown = 200; // ms between bounces (reduced for table bouncing)

    gameScene.registerBeforeRender(() => {
      if (!ball || !ball.mesh.physicsBody) {
        return;
      }

      const physicsBody = ball.mesh.physicsBody;
      const deltaTime = engine.getNativeEngine().getDeltaTime() / 1000;
      let currentVelocity = physicsBody.getLinearVelocity();

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
      
      let moveX = 0;
      let moveZ = 0;

      if (pressedKeys.has('arrowleft') || pressedKeys.has('a')) {
        moveX -= 1;
      }
      if (pressedKeys.has('arrowright') || pressedKeys.has('d')) {
        moveX += 1;
      }
      if (pressedKeys.has('arrowup') || pressedKeys.has('w')) {
        moveZ -= 1;
      }
      if (pressedKeys.has('arrowdown') || pressedKeys.has('s')) {
        moveZ += 1;
      }

      // Bounce when space pressed - works on any surface (ground, table, etc.)
      const now = Date.now();
      let kickTriggered = false;
      if (pressedKeys.has('space') && now - lastSpacePress > spacePressCooldown) {
        // Check if ball is resting/landed on any surface (not in mid-air)
        // This works for ground, table, or any other surface
        const isResting = Math.abs(currentVelocity.y) < 0.5;
        const notMovingUpFast = currentVelocity.y < 2;
        
        if (isResting && notMovingUpFast) {
          // Set upward velocity
          physicsBody.setLinearVelocity(
            new Vector3(currentVelocity.x, bounceVelocity, currentVelocity.z)
          );
          
          // CRITICAL: Re-read velocity after bounce so movement code doesn't override it
          currentVelocity = physicsBody.getLinearVelocity();
          
          lastSpacePress = now;
          kickTriggered = true;
        }
      }

      // Apply velocity-based movement for better control
      if (moveX !== 0 || moveZ !== 0) {
        const isAirborne = ball.mesh.position.y > ballRadius + 0.15;
        const targetSpeed = isAirborne ? ballAirSpeed : ballMoveSpeed;
        const moveDirection = new Vector3(moveX, 0, moveZ).normalize();
        
        // Set target horizontal velocity directly for responsive control
        const targetVelocity = moveDirection.scale(targetSpeed);
        const blendFactor = isAirborne ? 0.08 : 0.25; // Slower blend in air
        
        const newVelocityX = currentVelocity.x + (targetVelocity.x - currentVelocity.x) * blendFactor;
        const newVelocityZ = currentVelocity.z + (targetVelocity.z - currentVelocity.z) * blendFactor;
        
        physicsBody.setLinearVelocity(
          new Vector3(newVelocityX, currentVelocity.y, newVelocityZ)
        );
      } else {
        // Apply friction when not moving
        const frictionFactor = ball.mesh.position.y <= ballRadius + 0.05 ? 0.85 : 0.98;
        physicsBody.setLinearVelocity(
          new Vector3(
            currentVelocity.x * frictionFactor,
            currentVelocity.y,
            currentVelocity.z * frictionFactor
          )
        );
      }

      // Cap horizontal velocity
      const maxHorizontalSpeed = 8 * SCALE;
      const horizontalSpeed = Math.sqrt(currentVelocity.x ** 2 + currentVelocity.z ** 2);
      if (horizontalSpeed > maxHorizontalSpeed) {
        const scale = maxHorizontalSpeed / horizontalSpeed;
        const newVel = physicsBody.getLinearVelocity();
        physicsBody.setLinearVelocity(
          new Vector3(newVel.x * scale, newVel.y, newVel.z * scale)
        );
      }

      // Drive player 1 animation from the same input that moves the ball.
      // This mirrors the "player controls the ball" mechanic — when the ball
      // goes forward, player1 jogs forward; space = kick.
      if (player1) {
        player1.setMovement(moveX, moveZ, kickTriggered, deltaTime);
      }
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
