import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ISceneMetrics } from '../core/SceneMetrics';

export type XZone = 'SuperLeft' | 'MidLeft' | 'Center' | 'MidRight' | 'SuperRight';
export type YZone = 'Low' | 'Mid' | 'High' | 'VeryHigh';
export type ZZone = 'NearLine' | 'TableLevel' | 'FarLine';
export type GridCell = { x: XZone; y: YZone; z: ZZone };

const X_ZONES: XZone[] = ['SuperLeft', 'MidLeft', 'Center', 'MidRight', 'SuperRight'];
const Y_ZONES: YZone[] = ['Low', 'Mid', 'High', 'VeryHigh'];
const Z_ZONES: ZZone[] = ['NearLine', 'TableLevel', 'FarLine'];

export class GridSystem {
  private _metrics: ISceneMetrics;

  // X band edges (6 values for 5 bands)
  private _xEdges: number[];

  // Y band edges relative to tableTopY: [tableTopY, +0.6, +1.2, +1.8, tableTopY+4]
  private _yBase: number;
  private _yBandSize: number;
  private _yCapTop: number;

  // Z band edges (4 values for 3 bands)
  private _zEdges: number[];

  constructor(metrics: ISceneMetrics) {
    this._metrics = metrics;

    // X: 5 equal bands from courtMinX to courtMaxX
    const xBand = (metrics.courtMaxX - metrics.courtMinX) / 5;
    this._xEdges = [
      metrics.courtMinX,
      metrics.courtMinX + xBand,
      metrics.courtMinX + xBand * 2,
      metrics.courtMinX + xBand * 3,
      metrics.courtMinX + xBand * 4,
      metrics.courtMaxX,
    ];

    // Y: bands of 0.6m starting at tableTopY
    this._yBase = metrics.tableTopY;
    this._yBandSize = 0.6;
    this._yCapTop = metrics.tableTopY + 4;

    // Z: 3 equal bands from courtMinZ to courtMaxZ
    const zBand = (metrics.courtMaxZ - metrics.courtMinZ) / 3;
    this._zEdges = [
      metrics.courtMinZ,
      metrics.courtMinZ + zBand,
      metrics.courtMinZ + zBand * 2,
      metrics.courtMaxZ,
    ];
  }

  cellFromWorld(pos: Vector3): GridCell {
    // X zone
    let xIdx = 0;
    for (let i = 0; i < 5; i++) {
      if (pos.x >= this._xEdges[i] && pos.x < this._xEdges[i + 1]) {
        xIdx = i;
        break;
      }
    }
    // Clamp to last band if at or beyond max
    if (pos.x >= this._xEdges[5]) xIdx = 4;
    if (pos.x < this._xEdges[0]) xIdx = 0;

    // Y zone
    const yRel = pos.y - this._yBase;
    let yIdx: number;
    if (yRel < this._yBandSize) yIdx = 0;       // Low
    else if (yRel < this._yBandSize * 2) yIdx = 1; // Mid
    else if (yRel < this._yBandSize * 3) yIdx = 2; // High
    else yIdx = 3;                                   // VeryHigh

    // Z zone
    let zIdx = 0;
    for (let i = 0; i < 3; i++) {
      if (pos.z >= this._zEdges[i] && pos.z < this._zEdges[i + 1]) {
        zIdx = i;
        break;
      }
    }
    if (pos.z >= this._zEdges[3]) zIdx = 2;
    if (pos.z < this._zEdges[0]) zIdx = 0;

    return {
      x: X_ZONES[xIdx],
      y: Y_ZONES[yIdx],
      z: Z_ZONES[zIdx],
    };
  }

  cellCenter(cell: GridCell): Vector3 {
    const xIdx = X_ZONES.indexOf(cell.x);
    const yIdx = Y_ZONES.indexOf(cell.y);
    const zIdx = Z_ZONES.indexOf(cell.z);

    const cx = (this._xEdges[xIdx] + this._xEdges[xIdx + 1]) * 0.5;

    // Y center — VeryHigh band is capped
    let cy: number;
    if (yIdx < 3) {
      cy = this._yBase + this._yBandSize * yIdx + this._yBandSize * 0.5;
    } else {
      // VeryHigh: from tableTopY+1.8 up to cap
      cy = (this._yBase + this._yBandSize * 3 + this._yCapTop) * 0.5;
    }

    const cz = (this._zEdges[zIdx] + this._zEdges[zIdx + 1]) * 0.5;

    return new Vector3(cx, cy, cz);
  }

  cellBounds(cell: GridCell): { min: Vector3; max: Vector3 } {
    const xIdx = X_ZONES.indexOf(cell.x);
    const yIdx = Y_ZONES.indexOf(cell.y);
    const zIdx = Z_ZONES.indexOf(cell.z);

    const minX = this._xEdges[xIdx];
    const maxX = this._xEdges[xIdx + 1];

    const minY = this._yBase + this._yBandSize * yIdx;
    const maxY = yIdx < 3
      ? this._yBase + this._yBandSize * (yIdx + 1)
      : this._yCapTop;

    const minZ = this._zEdges[zIdx];
    const maxZ = this._zEdges[zIdx + 1];

    return {
      min: new Vector3(minX, minY, minZ),
      max: new Vector3(maxX, maxY, maxZ),
    };
  }

  adjacentCells(cell: GridCell): GridCell[] {
    const xIdx = X_ZONES.indexOf(cell.x);
    const yIdx = Y_ZONES.indexOf(cell.y);
    const zIdx = Z_ZONES.indexOf(cell.z);

    const result: GridCell[] = [];

    // Neighbours differing by exactly 1 step in one axis
    const xNeighbours = [-1, 0, 1].filter(d => d !== 0 && xIdx + d >= 0 && xIdx + d < X_ZONES.length);
    const yNeighbours = [-1, 0, 1].filter(d => d !== 0 && yIdx + d >= 0 && yIdx + d < Y_ZONES.length);
    const zNeighbours = [-1, 0, 1].filter(d => d !== 0 && zIdx + d >= 0 && zIdx + d < Z_ZONES.length);

    for (const dx of xNeighbours) {
      result.push({ x: X_ZONES[xIdx + dx], y: cell.y, z: cell.z });
    }
    for (const dy of yNeighbours) {
      result.push({ x: cell.x, y: Y_ZONES[yIdx + dy], z: cell.z });
    }
    for (const dz of zNeighbours) {
      result.push({ x: cell.x, y: cell.y, z: Z_ZONES[zIdx + dz] });
    }

    return result;
  }

  allCells(): GridCell[] {
    const cells: GridCell[] = [];
    for (const x of X_ZONES) {
      for (const y of Y_ZONES) {
        for (const z of Z_ZONES) {
          cells.push({ x, y, z });
        }
      }
    }
    return cells;
  }
}
