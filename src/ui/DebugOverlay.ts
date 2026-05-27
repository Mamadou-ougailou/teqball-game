import { Scene } from '@babylonjs/core/scene';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { GridSystem, GridCell } from '../systems/GridSystem';
import { ISceneMetrics } from '../core/SceneMetrics';

export interface DebugData {
  animName: string;
  rallyPhase: string;
  ballPos: Vector3;
  ballVel: Vector3;
  p1Cell: GridCell | null;
  p2Cell: GridCell | null;
  activeBonePos: Vector3 | null;
  contactReach: number;
  targetZoneId: string | null;
}

export class DebugOverlay {
  private _scene: Scene;
  private _gridSystem: GridSystem;
  private _metrics: ISceneMetrics;
  private _boneMarker: Mesh | null = null;
  private _reachSphere: Mesh | null = null;
  private _gridWireframes: Mesh[] = [];
  private _textMesh: Mesh | null = null;
  private _visible = false;
  private _dynamicTexture: DynamicTexture | null = null;

  constructor(scene: Scene, gridSystem: GridSystem, metrics: ISceneMetrics) {
    this._scene = scene;
    this._gridSystem = gridSystem;
    this._metrics = metrics;
  }

  /** Initialize all debug visual objects. Call once after scene is ready. */
  init(): void {
    this._createBoneMarker();
    this._createReachSphere();
    this._createGridWireframes();
    this._createTextDisplay();
  }

  /** Update every frame with current game state. */
  update(data: DebugData): void {
    if (!this._visible) return;

    // Update bone marker position
    if (this._boneMarker && data.activeBonePos) {
      this._boneMarker.position.copyFrom(data.activeBonePos);
      this._boneMarker.isVisible = true;
    } else if (this._boneMarker) {
      this._boneMarker.isVisible = false;
    }

    // Update reach sphere
    if (this._reachSphere && data.activeBonePos && data.contactReach > 0) {
      this._reachSphere.position.copyFrom(data.activeBonePos);
      this._reachSphere.scaling.setAll(data.contactReach * 2);
      this._reachSphere.isVisible = true;
    }

    // Update text overlay
    this._updateText(data);
  }

  show(): void {
    this._visible = true;
    this._gridWireframes.forEach(m => { m.isVisible = true; });
    if (this._boneMarker) this._boneMarker.isVisible = true;
    if (this._reachSphere) this._reachSphere.isVisible = true;
    if (this._textMesh) this._textMesh.isVisible = true;
  }

  hide(): void {
    this._visible = false;
    this._gridWireframes.forEach(m => { m.isVisible = false; });
    if (this._boneMarker) this._boneMarker.isVisible = false;
    if (this._reachSphere) this._reachSphere.isVisible = false;
    if (this._textMesh) this._textMesh.isVisible = false;
  }

  /** Expose gridSystem cell lookup so callers can pass real positions into update(). */
  cellFromWorld(pos: Vector3): GridCell | null {
    try {
      return this._gridSystem.cellFromWorld(pos);
    } catch {
      return null;
    }
  }

  dispose(): void {
    this._boneMarker?.dispose();
    this._reachSphere?.dispose();
    this._gridWireframes.forEach(m => m.dispose());
    this._textMesh?.dispose();
    this._dynamicTexture?.dispose();
    this._gridWireframes = [];
  }

  private _createBoneMarker(): void {
    this._boneMarker = MeshBuilder.CreateSphere('debugBoneMarker', { diameter: 0.16 }, this._scene);
    const mat = new StandardMaterial('debugBoneMat', this._scene);
    mat.diffuseColor = Color3.Red();
    mat.wireframe = true;
    mat.emissiveColor = Color3.Red();
    this._boneMarker.material = mat;
    this._boneMarker.isPickable = false;
    this._boneMarker.isVisible = false;
  }

  private _createReachSphere(): void {
    this._reachSphere = MeshBuilder.CreateSphere('debugReachSphere', { diameter: 1.0 }, this._scene);
    const mat = new StandardMaterial('debugReachMat', this._scene);
    mat.diffuseColor = Color3.Yellow();
    mat.wireframe = true;
    mat.alpha = 0.4;
    this._reachSphere.material = mat;
    this._reachSphere.isPickable = false;
    this._reachSphere.isVisible = false;
  }

  private _createGridWireframes(): void {
    const cells = this._gridSystem.allCells();
    for (const cell of cells) {
      const bounds = this._gridSystem.cellBounds(cell);
      const size = bounds.max.subtract(bounds.min);
      const center = bounds.min.add(bounds.max).scale(0.5);

      const box = MeshBuilder.CreateBox(`debugGrid_${cell.x}_${cell.y}_${cell.z}`, {
        width:  Math.max(0.01, size.x),
        height: Math.max(0.01, size.y),
        depth:  Math.max(0.01, size.z),
      }, this._scene);
      box.position.copyFrom(center);
      box.isPickable = false;

      const mat = new StandardMaterial(`debugGridMat_${cell.x}_${cell.y}_${cell.z}`, this._scene);
      mat.wireframe = true;
      mat.diffuseColor = Color3.Green();
      mat.alpha = 0.2;
      box.material = mat;
      box.isVisible = false;
      this._gridWireframes.push(box);
    }
  }

  private _createTextDisplay(): void {
    const dt = new DynamicTexture('debugText', { width: 512, height: 256 }, this._scene, false);
    this._dynamicTexture = dt;

    const plane = MeshBuilder.CreatePlane('debugTextPlane', { width: 4, height: 2 }, this._scene);
    plane.position = new Vector3(-6, 3, 0);
    plane.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
    plane.isPickable = false;

    const planeMat = new StandardMaterial('debugTextMat', this._scene);
    planeMat.diffuseTexture = dt;
    planeMat.emissiveTexture = dt;
    planeMat.disableLighting = true;
    planeMat.backFaceCulling = false;
    plane.material = planeMat;
    plane.isVisible = false;

    this._textMesh = plane;
  }

  private _updateText(data: DebugData): void {
    if (!this._dynamicTexture) return;
    const dt = this._dynamicTexture;
    const ctx = dt.getContext() as CanvasRenderingContext2D;
    if (!ctx) return;

    ctx.clearRect(0, 0, 512, 256);
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#00ff88';
    ctx.font = '18px monospace';
    ctx.fillText(`Anim: ${data.animName}`, 10, 30);
    ctx.fillText(`Phase: ${data.rallyPhase}`, 10, 55);
    ctx.fillText(
      `Ball: ${data.ballPos.x.toFixed(1)},${data.ballPos.y.toFixed(1)},${data.ballPos.z.toFixed(1)}`,
      10, 80,
    );
    ctx.fillText(
      `BallV: ${data.ballVel.x.toFixed(1)},${data.ballVel.y.toFixed(1)},${data.ballVel.z.toFixed(1)}`,
      10, 105,
    );
    ctx.fillText(
      `P1Cell: ${data.p1Cell ? `${data.p1Cell.x}/${data.p1Cell.y}/${data.p1Cell.z}` : 'n/a'}`,
      10, 130,
    );
    ctx.fillText(
      `P2Cell: ${data.p2Cell ? `${data.p2Cell.x}/${data.p2Cell.y}/${data.p2Cell.z}` : 'n/a'}`,
      10, 155,
    );
    if (data.targetZoneId) ctx.fillText(`Target: ${data.targetZoneId}`, 10, 180);
    dt.update();
  }
}
