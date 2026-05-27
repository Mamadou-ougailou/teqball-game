/**
 * PointVFXSystem — Surreal celebration visual effects triggered on point scored.
 *
 * Effects:
 *  1. Screen flash — player-coloured burst that fades in ~400 ms
 *  2. Particle fountain — sparkle burst that rises from the winner's position
 *  3. Camera shake — brief angular shake for cinematic impact
 *  4. Character highlight — winner glows in their team colour for ~2.5 s
 *
 * Also provides:
 *  - triggerKickVFX  — power-scaled particles + shake on kick contact
 *  - triggerBigBounceVFX — shockwave ring + fountain + heavy shake on table power-bounce
 */

import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { ParticleSystem } from '@babylonjs/core/Particles/particleSystem';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';
import { Animation } from '@babylonjs/core/Animations/animation';
import { HighlightLayer } from '@babylonjs/core/Layers/highlightLayer';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { IEntity } from '../core/interfaces';

/** Per-player visual theme */
interface PlayerPalette {
  burst1:  Color4;   // dominant particle colour
  burst2:  Color4;   // secondary particle colour
  glow:    Color3;   // highlight layer colour
  flash:   string;   // CSS colour string for the flash rectangle
}

const PALETTES: [PlayerPalette, PlayerPalette] = [
  // Player 1 — electric blue / violet
  {
    burst1: new Color4(0.45, 0.65, 1.00, 1),
    burst2: new Color4(0.80, 0.35, 1.00, 1),
    glow:   new Color3(0.45, 0.65, 1.00),
    flash:  '#3355ff',
  },
  // Player 2 — fiery orange / gold
  {
    burst1: new Color4(1.00, 0.55, 0.10, 1),
    burst2: new Color4(1.00, 0.88, 0.10, 1),
    glow:   new Color3(1.00, 0.55, 0.10),
    flash:  '#ff7700',
  },
];

export class PointVFXSystem implements IEntity {
  private readonly _scene:  Scene;
  private readonly _camera: ArcRotateCamera;
  private readonly _adt:    AdvancedDynamicTexture;

  /** Soft-circle particle texture (created once, reused for all bursts) */
  private readonly _pTex: DynamicTexture;

  /** Full-screen flash overlay */
  private readonly _flashRect: Rectangle;
  private _flashAnim: ReturnType<Scene['beginDirectAnimation']> | null = null;

  /** Camera shake */
  private _shakeTimer     = 0;
  private _shakeDuration  = 0;
  private _shakeIntensity = 0;

  /** Character highlight */
  private readonly _hl: HighlightLayer;
  private _hlTimer = 0;
  private readonly _hlMeshes: Mesh[] = [];

  /** Active kick-trail particle systems (stopped + auto-disposed when new kick fires) */
  private readonly _kickTrails: ParticleSystem[] = [];

  constructor(scene: Scene, camera: ArcRotateCamera) {
    this._scene  = scene;
    this._camera = camera;

    // Dedicated fullscreen UI so we don't interfere with the main game UI layer.
    this._adt = AdvancedDynamicTexture.CreateFullscreenUI('pointVFX_UI', true, scene);

    // ── Particle texture ────────────────────────────────────────────────────
    const dt = new DynamicTexture('pointVFX_pTex', { width: 32, height: 32 }, scene, false);
    const ctx = dt.getContext() as CanvasRenderingContext2D;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 15);
    grad.addColorStop(0,    'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1,    'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    dt.update();
    this._pTex = dt;

    // ── Flash overlay ───────────────────────────────────────────────────────
    const rect = new Rectangle('pointVFX_flash');
    rect.width  = '100%';
    rect.height = '100%';
    rect.background  = '#ffffff';
    rect.alpha       = 0;
    rect.isVisible   = false;
    rect.isHitTestVisible = false;
    this._adt.addControl(rect);
    this._flashRect = rect;

    // ── Highlight layer ─────────────────────────────────────────────────────
    this._hl = new HighlightLayer('pointVFX_hl', scene);
    this._hl.blurHorizontalSize = 1.2;
    this._hl.blurVerticalSize   = 1.2;
    this._hl.innerGlow          = true;
    this._hl.outerGlow          = true;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Fire all celebration effects.
   * @param winnerRoot Root mesh of the scoring character
   * @param loserRoot  Root mesh of the character who conceded
   * @param teamIndex  0 = P1, 1 = P2
   */
  triggerPointReaction(
    winnerRoot: AbstractMesh,
    loserRoot:  AbstractMesh,
    teamIndex: 0 | 1,
  ): void {
    const pal = PALETTES[teamIndex];

    // 1. Full-screen flash
    this._flash(pal.flash);

    // 2. Sparkle fountain at winner's torso height
    const origin = winnerRoot.position.clone().addInPlace(new Vector3(0, 1.2, 0));
    this._burst(origin, pal.burst1, pal.burst2, 160);

    // 3. Brief shockwave at loser's feet (dark smoke-like downward drizzle)
    const loserOrigin = loserRoot.position.clone().addInPlace(new Vector3(0, 0.4, 0));
    this._bust_loser(loserOrigin);

    // 4. Camera impact shake
    this._shakeIntensity = 0.013;
    this._shakeDuration  = 0.55;
    this._shakeTimer     = 0;

    // 5. Winner glow
    this._highlight(winnerRoot, pal.glow, 2.4);
  }

  // ── IEntity ───────────────────────────────────────────────────────────────

  update(deltaTime: number): void {
    // Camera shake — amplitude decays linearly to zero over _shakeDuration
    if (this._shakeTimer < this._shakeDuration) {
      this._shakeTimer += deltaTime;
      const decay = 1 - this._shakeTimer / this._shakeDuration;
      const mag   = this._shakeIntensity * decay;
      this._camera.inertialAlphaOffset += (Math.random() - 0.5) * mag;
      this._camera.inertialBetaOffset  += (Math.random() - 0.5) * mag * 0.5;
    }

    // Highlight timeout
    if (this._hlTimer > 0) {
      this._hlTimer = Math.max(0, this._hlTimer - deltaTime);
      if (this._hlTimer === 0) {
        this._clearHighlight();
      }
    }
  }

  /**
   * Kick contact flash — power-scaled sparks + camera shake.
   * @param position  World position of ball at contact
   * @param power     requestPowerByPlayer value (0.8–1.75)
   * @param teamIndex 0 = P1, 1 = P2
   */
  triggerKickVFX(position: Vector3, power: number, teamIndex: 0 | 1): void {
    const pal = PALETTES[teamIndex];

    // Normalise power into 0–1 range across the charge table (0.8 → 0, 1.75 → 1)
    const t = Math.max(0, Math.min(1, (power - 0.80) / (1.75 - 0.80)));

    // Particle count scales 20 → 90 with power
    const count = Math.round(20 + t * 70);
    this._kickBurst(position.clone(), pal.burst1, pal.burst2, count, t);

    // Camera shake scales with power (none below ~normal, strong at max)
    if (t > 0.25) {
      const mag = (t - 0.25) / 0.75 * 0.009;  // up to 0.009 at full power
      this._shakeIntensity = Math.max(this._shakeIntensity, mag);
      this._shakeDuration  = Math.max(this._shakeDuration, 0.20 + t * 0.20);
      this._shakeTimer     = Math.min(this._shakeTimer, 0);
    }

    // Flash only on charged kicks (power > 1.20)
    if (power >= 1.20) {
      const alpha = 0.10 + t * 0.28;   // 0.10 → 0.38
      this._miniFlash(pal.flash, alpha);
    }
  }

  /**
   * Big Bounce shockwave — called when a power-kick ball hits the table.
   * Expands a torus ring outward, fires a huge particle fountain, heavy shake & white flash.
   * @param position  World position of ball at table contact
   */
  triggerBigBounceVFX(position: Vector3): void {
    // --- Shockwave ring (expanding torus that fades out) ----------------------
    const ring = MeshBuilder.CreateTorus(
      `bigBounce_ring_${Date.now()}`,
      { diameter: 0.3, thickness: 0.08, tessellation: 32 },
      this._scene,
    );
    ring.position = position.clone();
    ring.position.y += 0.05; // sit just above table surface

    const mat = new StandardMaterial(`bigBounce_ringMat_${Date.now()}`, this._scene);
    mat.emissiveColor  = new Color3(1, 0.85, 0.2);
    mat.disableLighting = true;
    ring.material = mat;

    // Expand and fade over ~0.55 s
    const startTime = performance.now();
    const duration  = 550; // ms
    const obs = this._scene.onBeforeRenderObservable.add(() => {
      const elapsed = performance.now() - startTime;
      const frac    = elapsed / duration;
      if (frac >= 1) {
        ring.dispose();
        this._scene.onBeforeRenderObservable.remove(obs);
        return;
      }
      const scale  = 0.4 + frac * 7.0;   // grows from 0.4 → 7.4×
      ring.scaling = new Vector3(scale, scale * 0.15, scale);
      mat.alpha    = 1 - frac;
    });

    // --- Giant particle fountain ----------------------------------------------
    this._burst(position.clone().addInPlace(new Vector3(0, 0.1, 0)),
      new Color4(1.0, 0.9, 0.2, 1),
      new Color4(1.0, 0.5, 0.0, 1),
      260,
    );

    // --- Heavy camera shake ---------------------------------------------------
    this._shakeIntensity = 0.028;
    this._shakeDuration  = 0.75;
    this._shakeTimer     = 0;

    // --- White screen flash ---------------------------------------------------
    this._flash('#ffffff');
  }

  /**
   * Attach a fire trail to the ball mesh for the duration of the kick flight.
   * Color and intensity scale with kick power.
   *
   *  t < 0.25  → cool blue-white sparks  (light tap)
   *  t < 0.55  → golden yellow flame     (normal / charged)
   *  t ≥ 0.55  → fiery orange-red blaze  (power / over-charge)
   *
   * @param ballMesh  The ball's root mesh — emitter follows it automatically
   * @param power     requestPowerByPlayer value (0.80–1.75)
   * @param teamIndex 0 = P1, 1 = P2
   */
  activateKickTrail(ballMesh: AbstractMesh, power: number, teamIndex: 0 | 1): void {
    // Stop any previous trail (new kick overrides old one)
    for (const old of this._kickTrails) {
      try { old.stop(); } catch (_) { /* already disposed */ }
    }
    this._kickTrails.length = 0;

    // Normalise power into 0–1 across the charge table (0.80 → 0, 1.75 → 1)
    const t = Math.max(0, Math.min(1, (power - 0.80) / (1.75 - 0.80)));

    // Duration: 0.45 s (light kick) → 1.05 s (over-charge)
    const duration = 0.45 + t * 0.60;

    const maxParticles = Math.round(50 + t * 150);
    const ps = new ParticleSystem(`kickTrail_${Date.now()}`, maxParticles, this._scene);
    ps.particleTexture = this._pTex;
    // Attach emitter to the mesh — BabylonJS updates the spawn point every frame
    ps.emitter = ballMesh;

    // --- Color profile based on power tier ---
    if (t < 0.25) {
      // Light tap: cool blue-white sparks
      ps.color1    = new Color4(0.85, 0.90, 1.00, 1.0);
      ps.color2    = new Color4(0.55, 0.65, 1.00, 1.0);
      ps.colorDead = new Color4(0.15, 0.20, 0.55, 0.0);
    } else if (t < 0.55) {
      // Charged: golden yellow flame
      ps.color1    = new Color4(1.00, 0.92, 0.25, 1.0);
      ps.color2    = new Color4(1.00, 0.60, 0.05, 1.0);
      ps.colorDead = new Color4(0.30, 0.05, 0.00, 0.0);
    } else {
      // Power / over-charge: blazing orange-red with bright core
      ps.color1    = new Color4(1.00, 0.88, 0.35, 1.0);
      ps.color2    = new Color4(1.00, 0.22, 0.00, 1.0);
      ps.colorDead = new Color4(0.05, 0.00, 0.00, 0.0);
    }

    // Particle size — small enough to look like sparks, larger at high power
    ps.minSize = 0.03 + t * 0.09;
    ps.maxSize = 0.09 + t * 0.26;

    // Short lifetime — trail stays tight behind the ball
    ps.minLifeTime = 0.06 + t * 0.10;
    ps.maxLifeTime = 0.14 + t * 0.32;

    // Very little velocity — particles linger near the ball then drift slightly
    ps.direction1 = new Vector3(-0.5, -0.3, -0.5);
    ps.direction2 = new Vector3( 0.5,  0.9,  0.5);

    // Slight upward float (fire rises)
    ps.gravity = new Vector3(0, -2.0, 0);

    ps.minEmitPower = 0.10 + t * 0.50;
    ps.maxEmitPower = 0.35 + t * 1.40;

    // Continuous emit for the flight duration then self-dispose
    ps.emitRate           = Math.round(80 + t * 220);
    ps.targetStopDuration = duration;
    ps.disposeOnStop      = true;

    ps.start();
    this._kickTrails.push(ps);
  }

  dispose(): void {
    if (this._flashAnim) {
      this._flashAnim.stop();
      this._flashAnim = null;
    }
    for (const trail of this._kickTrails) {
      try { trail.stop(); } catch (_) { /* ignore */ }
    }
    this._kickTrails.length = 0;
    this._clearHighlight();
    this._flashRect.dispose();
    this._pTex.dispose();
    this._hl.dispose();
    this._adt.dispose();
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _flash(colorHex: string): void {
    if (this._flashAnim) {
      this._flashAnim.stop();
      this._flashAnim = null;
    }
    this._flashRect.background = colorHex;
    this._flashRect.alpha      = 0;
    this._flashRect.isVisible  = true;

    const anim = new Animation(
      'pointVFX_flashAnim', 'alpha', 60,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    );
    anim.setKeys([
      { frame: 0,  value: 0    },
      { frame: 3,  value: 0.72 },  // blaze in ~50 ms
      { frame: 28, value: 0    },  // fade out ~420 ms
    ]);

    this._flashAnim = this._scene.beginDirectAnimation(
      this._flashRect, [anim], 0, 28, false, 1,
      () => {
        this._flashRect.isVisible = false;
        this._flashAnim = null;
      },
    );
  }

  /** Winner sparkle fountain — shoots upward and falls with gravity */
  private _burst(
    position: Vector3,
    color1: Color4,
    color2: Color4,
    count: number,
  ): void {
    const ps = new ParticleSystem(`pointVFX_burst_${Date.now()}`, count, this._scene);
    ps.particleTexture = this._pTex;
    ps.emitter         = position.clone();

    ps.color1    = color1;
    ps.color2    = color2;
    ps.colorDead = new Color4(color1.r * 0.3, color1.g * 0.3, color1.b * 0.3, 0);

    ps.minSize = 0.06;
    ps.maxSize = 0.30;

    ps.minLifeTime = 0.5;
    ps.maxLifeTime = 1.6;

    // Upward fountain spread sideways
    ps.direction1 = new Vector3(-4, 9,  -4);
    ps.direction2 = new Vector3( 4, 16,  4);

    ps.gravity = new Vector3(0, -8, 0);

    ps.minEmitPower = 2;
    ps.maxEmitPower = 7;

    // One-shot burst — high rate for a very short window, then stops
    ps.emitRate           = 1400;
    ps.targetStopDuration = 0.11;
    ps.disposeOnStop      = true;

    ps.start();
  }

  /** Loser droop — small dark particles drifting downward */
  private _bust_loser(position: Vector3): void {
    const ps = new ParticleSystem(`pointVFX_loser_${Date.now()}`, 60, this._scene);
    ps.particleTexture = this._pTex;
    ps.emitter         = position.clone();

    ps.color1    = new Color4(0.25, 0.0, 0.35, 0.9);   // dark purple
    ps.color2    = new Color4(0.10, 0.0, 0.15, 0.6);
    ps.colorDead = new Color4(0.05, 0.0, 0.08, 0);

    ps.minSize = 0.05;
    ps.maxSize = 0.18;

    ps.minLifeTime = 0.4;
    ps.maxLifeTime = 1.0;

    ps.direction1 = new Vector3(-1.5, 0.5, -1.5);
    ps.direction2 = new Vector3( 1.5, 2.0,  1.5);

    ps.gravity = new Vector3(0, -3.5, 0);

    ps.minEmitPower = 0.5;
    ps.maxEmitPower = 2.5;

    ps.emitRate           = 600;
    ps.targetStopDuration = 0.10;
    ps.disposeOnStop      = true;

    ps.start();
  }

  /** Small power-scaled burst at kick contact — radiates outward in all directions */
  private _kickBurst(
    position: Vector3,
    color1: Color4,
    color2: Color4,
    count: number,
    powerT: number, // 0–1
  ): void {
    const ps = new ParticleSystem(`pointVFX_kick_${Date.now()}`, count, this._scene);
    ps.particleTexture = this._pTex;
    ps.emitter         = position;

    ps.color1    = color1;
    ps.color2    = color2;
    ps.colorDead = new Color4(color1.r * 0.2, color1.g * 0.2, color1.b * 0.2, 0);

    const sizeMax = 0.08 + powerT * 0.28;
    ps.minSize = 0.04;
    ps.maxSize = sizeMax;

    ps.minLifeTime = 0.15 + powerT * 0.25;
    ps.maxLifeTime = 0.35 + powerT * 0.55;

    // Omnidirectional burst — ball fires off in all directions from contact point
    ps.direction1 = new Vector3(-5, 2, -5);
    ps.direction2 = new Vector3( 5, 9,  5);

    ps.gravity = new Vector3(0, -6, 0);

    ps.minEmitPower = 1.5 + powerT * 3.5;
    ps.maxEmitPower = 3.0 + powerT * 7.0;

    ps.emitRate           = 1800;
    ps.targetStopDuration = 0.04 + powerT * 0.04;
    ps.disposeOnStop      = true;

    ps.start();
  }

  /** Brief tinted flash that doesn't blaze as hard as the full point flash */
  private _miniFlash(colorHex: string, peakAlpha: number): void {
    if (this._flashAnim) return; // don't override ongoing flash
    this._flashRect.background = colorHex;
    this._flashRect.alpha      = 0;
    this._flashRect.isVisible  = true;

    const anim = new Animation(
      'pointVFX_miniFlashAnim', 'alpha', 60,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    );
    anim.setKeys([
      { frame: 0,  value: 0          },
      { frame: 2,  value: peakAlpha  },
      { frame: 18, value: 0          },
    ]);

    this._flashAnim = this._scene.beginDirectAnimation(
      this._flashRect, [anim], 0, 18, false, 1,
      () => {
        this._flashRect.isVisible = false;
        this._flashAnim = null;
      },
    );
  }

  private _highlight(rootMesh: AbstractMesh, color: Color3, durationSeconds: number): void {
    this._clearHighlight();

    const toAdd: Mesh[] = [];
    if (rootMesh instanceof Mesh && rootMesh.getTotalVertices() > 0) {
      toAdd.push(rootMesh);
    }
    rootMesh.getChildMeshes(false).forEach((m) => {
      if (m instanceof Mesh && m.getTotalVertices() > 0) {
        toAdd.push(m as Mesh);
      }
    });

    for (const m of toAdd) {
      try {
        this._hl.addMesh(m, color, true);
        this._hlMeshes.push(m);
      } catch (_) { /* ignore — some transparent meshes can't be highlighted */ }
    }

    this._hlTimer = durationSeconds;
  }

  private _clearHighlight(): void {
    for (const m of this._hlMeshes) {
      try { this._hl.removeMesh(m); } catch (_) { /* ignore */ }
    }
    this._hlMeshes.length = 0;
  }
}
