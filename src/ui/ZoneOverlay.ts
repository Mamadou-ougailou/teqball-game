import { Scene } from '@babylonjs/core/scene';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TableZone, ZoneWeights } from '../systems/ZoneSelector';
import { ISceneMetrics } from '../core/SceneMetrics';

export class ZoneOverlay {
  private _scene: Scene;
  private _meshes: Map<string, Mesh> = new Map();
  private _materials: Map<string, StandardMaterial> = new Map();
  private _visible = false;
  private _metrics: ISceneMetrics;

  constructor(scene: Scene, metrics: ISceneMetrics) {
    this._scene = scene;
    this._metrics = metrics;
  }

  /**
   * Build zone mesh planes for the given zones.
   * Each zone becomes a flat plane at tableTopY + 0.01m.
   * Call once per match side.
   */
  buildZones(zones: TableZone[]): void {
    // Clean up any previously built meshes
    this._meshes.forEach(m => m.dispose());
    this._materials.forEach(m => m.dispose());
    this._meshes.clear();
    this._materials.clear();

    const tableTopY = this._metrics.tableTopY;

    for (const zone of zones) {
      const planeWidth  = zone.halfWidth  * 2;
      const planeHeight = zone.halfLength * 2;

      const plane = MeshBuilder.CreatePlane(
        `zoneOverlay_${zone.id}`,
        { width: planeWidth, height: planeHeight },
        this._scene,
      );

      // Rotate 90° around X so the plane lies flat on the table surface
      plane.rotation.x = Math.PI / 2;
      plane.position.x = zone.center.x;
      plane.position.y = tableTopY + 0.01;
      plane.position.z = zone.center.z;
      plane.isPickable = false;

      const mat = new StandardMaterial(`zoneOverlayMat_${zone.id}`, this._scene);
      mat.diffuseColor = new Color3(0.2, 0.6, 1.0);
      mat.alpha = 0.5;
      mat.wireframe = false;
      mat.backFaceCulling = false;
      plane.material = mat;

      // Start hidden
      plane.isVisible = false;

      this._meshes.set(zone.id, plane);
      this._materials.set(zone.id, mat);
    }
  }

  /** Show zone overlay (set meshes visible) */
  show(): void {
    this._visible = true;
    this._meshes.forEach(m => {
      m.visibility = 0.5;
      m.isVisible = true;
    });
  }

  /** Hide zone overlay */
  hide(): void {
    this._visible = false;
    this._meshes.forEach(m => {
      m.isVisible = false;
    });
  }

  /** Clear all zone highlights back to no emissive (call before highlight()). */
  clearHighlights(): void {
    this._materials.forEach(mat => {
      mat.emissiveColor = Color3.Black();
    });
  }

  /** Highlight a specific zone by id (make it brighter / yellow emissive glow) */
  highlight(zoneId: string): void {
    const mat = this._materials.get(zoneId);
    if (!mat) return;
    mat.emissiveColor = new Color3(1, 1, 0);
  }

  /**
   * Update zone colors based on weights (probability heat map).
   * Higher weight = more intense red/orange color.
   * Normalizes weights to [0,1]:
   *   0   -> blue   (0.2, 0.4, 0.9)
   *   0.5 -> yellow (0.9, 0.9, 0.1)
   *   1.0 -> red    (0.9, 0.2, 0.1)
   */
  updateWeights(weights: ZoneWeights): void {
    // Find min/max to normalise
    const values = Object.values(weights);
    if (values.length === 0) return;

    const minW = Math.min(...values);
    const maxW = Math.max(...values);
    const range = maxW - minW;

    for (const [zoneId, weight] of Object.entries(weights)) {
      const mat = this._materials.get(zoneId);
      if (!mat) continue;

      const t = range > 0 ? (weight - minW) / range : 0.5;

      let r: number, g: number, b: number;
      if (t < 0.5) {
        // Lerp blue -> yellow
        const s = t * 2; // [0,1] in this half
        r = 0.2 + s * (0.9 - 0.2);
        g = 0.4 + s * (0.9 - 0.4);
        b = 0.9 + s * (0.1 - 0.9);
      } else {
        // Lerp yellow -> red
        const s = (t - 0.5) * 2; // [0,1] in this half
        r = 0.9;
        g = 0.9 + s * (0.2 - 0.9);
        b = 0.1;
      }

      mat.diffuseColor = new Color3(r, g, b);
    }
  }

  dispose(): void {
    this._meshes.forEach(m => m.dispose());
    this._materials.forEach(m => m.dispose());
    this._meshes.clear();
    this._materials.clear();
  }
}
