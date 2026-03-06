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

    // Initialize physics engine
    const havokInstance = await HavokPhysics({
      locateFile: () => '/HavokPhysics.wasm'
    });
    const havokPlugin = new HavokPlugin(true, havokInstance);
    gameScene.enablePhysics(new Vector3(0, -9.81, 0), havokPlugin);

    // Run physics at 120 Hz (half-step) — halves the tunnelling window
    // for fast-moving objects like the ball passing through thin surfaces.
    havokPlugin.setTimeStep(1 / 120);

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
      tableData.meshes.forEach((mesh) => {
        const totalVertices = mesh.getTotalVertices();
        if (totalVertices > 0) {
          try {
            new PhysicsAggregate(
              mesh,
              PhysicsShapeType.MESH,
              { mass: 0, restitution: 0.92, friction: 0.15 },
              gameScene
            );
          } catch (_err) {
            // Fallback — should never happen on a valid closed mesh
            new PhysicsAggregate(
              mesh,
              PhysicsShapeType.CONVEX_HULL,
              { mass: 0, restitution: 0.92, friction: 0.15 },
              gameScene
            );
          }
        }
      });
    }

    // Load ball from ball01.glb
    const ballData = await assetManager.loadModel('ball01');
    if (ballData.meshes.length === 0) {
      throw new Error('ball01 model loaded but has no meshes');
    }

    // The root mesh (index 0) is the parent that controls overall scale.
    const ballRootMesh = ballData.meshes[0];

    // Measure the unscaled size using the full hierarchy bounding vectors.
    // Reset scaling to 1 first so the measurement is in model-space units.
    ballRootMesh.scaling = new Vector3(1, 1, 1);
    ballRootMesh.computeWorldMatrix(true);
    const ballHierarchyBounds = ballRootMesh.getHierarchyBoundingVectors(true);
    const rawSize = ballHierarchyBounds.max.subtract(ballHierarchyBounds.min);
    const rawDiameter = Math.max(rawSize.x, rawSize.y, rawSize.z);

    // Scale uniformly so the ball is exactly 0.22 m in diameter
    const desiredDiameter = 0.22 * SCALE;
    const ballScale = rawDiameter > 0 ? desiredDiameter / rawDiameter : 1;
    ballRootMesh.scaling = new Vector3(ballScale, ballScale, ballScale);

    const ballRadius = desiredDiameter / 2;

    // Use the first child mesh with geometry as the physics anchor
    const ballVisualMesh = ballData.meshes.find(m => m.getTotalVertices() > 0) ?? ballRootMesh;
    ballVisualMesh.position = new Vector3(0, 1.8 * SCALE, 0);

    ball = new Ball(ballVisualMesh);

    // Add physics — SPHERE shape fitted to the desired radius
    new PhysicsAggregate(
      ballVisualMesh,
      PhysicsShapeType.SPHERE,
      { mass: 0.057, restitution: 0.85, friction: 0.3 },
      gameScene
    );

    // Add minimal damping to keep bounciness
    if (ballVisualMesh.physicsBody) {
      ballVisualMesh.physicsBody.setLinearDamping(0.05);
      ballVisualMesh.physicsBody.setAngularDamping(0.2);
    }

    // Create player 1 (table left side)
    const player1Data = await assetManager.loadModel('player01');
    if (player1Data.meshes.length > 0) {
      const stats: CharacterStats = {
        speed: 8,
        jump: 1.2,
        power: 100,
        spin: 80,
      };
      player1 = new Character(0, player1Data.meshes[0], player1Data.skeletons[0] || null, stats);
      player1.mesh.position = new Vector3(1 * SCALE, 0.76 * SCALE, -3.5 * SCALE);
      player1.mesh.rotation = new Vector3(0, Math.PI, 0);

      // Add physics to player1 (static obstacle, ball can collide)
      // Find the actual mesh with geometry (skip empty parent nodes)
      const player1PhysicsMesh = player1Data.meshes.find(m => m.getTotalVertices() > 0);
      if (player1PhysicsMesh) {
        new PhysicsAggregate(
          player1PhysicsMesh,
          PhysicsShapeType.BOX,
          { mass: 0, restitution: 0.3, friction: 0.8 },
          gameScene
        );
      }
    } else {
      throw new Error('Player 1 model loaded but has no meshes');
    }

    // Create player 2 (opposite side)
    const player2Data = await assetManager.loadModel('player02');
    if (player2Data.meshes.length > 0) {
      const stats: CharacterStats = {
        speed: 8,
        jump: 1.2,
        power: 100,
        spin: 80,
      };
      player2 = new Character(1, player2Data.meshes[0], player2Data.skeletons[0] || null, stats);
      player2.mesh.position = new Vector3(-0.5 * SCALE, 1 * SCALE, 3.5 * SCALE);
      player2.mesh.rotation = new Vector3(0, 0, 0);

      // Add physics to player2 (static obstacle, ball can collide)
      // Find the actual mesh with geometry (skip empty parent nodes)
      const player2PhysicsMesh = player2Data.meshes.find(m => m.getTotalVertices() > 0);
      if (player2PhysicsMesh) {
        new PhysicsAggregate(
          player2PhysicsMesh,
          PhysicsShapeType.BOX,
          { mass: 0, restitution: 0.3, friction: 0.8 },
          gameScene
        );
      }
    } else {
      throw new Error('Player 2 model loaded but has no meshes');
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
