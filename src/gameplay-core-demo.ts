import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';

// Import from our pure core!
import { 
  MatchManager, 
  RuleEngine, 
  Vec3, 
  POINTS_PER_SET,
  TABLE_WIDTH 
} from '../gameplay-core';

async function startDemo() {
    const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
    const engine = new Engine(canvas, true);
    const scene = new Scene(engine);
    
    const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3, 10, Vector3.Zero(), scene);
    camera.attachControl(canvas, true);
    new HemisphericLight("light", new Vector3(0, 1, 0), scene);

    // Create a simple table representation
    const table = MeshBuilder.CreateBox("table", { width: TABLE_WIDTH, height: 0.1, depth: 3 }, scene);
    table.position.y = 0.5;
    const tableMat = new StandardMaterial("tableMat", scene);
    tableMat.diffuseColor = new Color3(0.2, 0.5, 0.2);
    table.material = tableMat;

    // Create a ball
    const ball = MeshBuilder.CreateSphere("ball", { diameter: 0.2 }, scene);
    ball.position = new Vector3(0, 4, 0);
    const ballMat = new StandardMaterial("ballMat", scene);
    ballMat.diffuseColor = Color3.Yellow();
    ball.material = ballMat;

    // Game Core State
    const match = new MatchManager();
    let rallyState = RuleEngine.initializeRallyState();
    rallyState.lastTouchPlayerId = 0; // Simulate player 0 kicked it

    const scoreEl = document.getElementById('score');
    const setsEl = document.getElementById('sets');
    const msgEl = document.getElementById('msg');

    let velocityY = 0;
    const gravity = -9.81;

    engine.runRenderLoop(() => {
        const dt = engine.getDeltaTime() / 1000;
        
        // Simple manual physics for demo
        velocityY += gravity * dt;
        ball.position.y += velocityY * dt;

        // Check for "collision" with table height (0.5 + 0.1/2 = 0.55)
        if (ball.position.y <= 0.6) {
            ball.position.y = 0.6;
            
            // USE CORE LOGIC TO EVALUATE
            // We pass the current position to the core
            // Note: Babylon Vector3 is compatible with our core Vec3 interface {x,y,z}
            const corePos = new Vec3(ball.position.x, ball.position.y, ball.position.z);
            const event = {
                playerIdTouching: 0,
                ballPosition: corePos,
                timestamp: Date.now()
            };

            const result = RuleEngine.evaluateBoundary(rallyState, event);
            
            if (!result.isValid && result.point !== undefined) {
                match.recordPoint(result.point - 1); // recordPoint expects 0-indexed team
                if (scoreEl) scoreEl.textContent = `${match.score[0]} - ${match.score[1]}`;
                if (setsEl) setsEl.textContent = `${match.sets[0]} - ${match.sets[1]}`;
                if (msgEl) msgEl.textContent = `POINT FOR TEAM ${result.point}! (Detected by Core)`;
                
                // Reset ball
                ball.position.y = 4;
                velocityY = 0;
                // Randomize X to test out-of-bounds
                ball.position.x = (Math.random() - 0.5) * 4; 
            } else {
                // Bounce
                velocityY = -velocityY * 0.8;
                if (msgEl) msgEl.textContent = "Valid bounce on table! (Verified by Core)";
            }
        }

        scene.render();
    });

    window.addEventListener('resize', () => engine.resize());
}

startDemo();
