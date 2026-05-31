import { Vec3 as Vector3 } from '../math/Vec3';
import { ISceneMetrics } from '../core/SceneMetrics';

/**
 * EXTRACTION NOTE: copied verbatim from src/systems/GridSystem.ts. Pure spatial
 * partitioning — Vector3 → Vec3 import swap; `ISceneMetrics` now comes from the
 * rendering-free `../core/SceneMetrics`.
 */
export type XZone = 'SuperLeft' | 'MidLeft' | 'Center' | 'MidRight' | 'SuperRight';
export type YZone = 'Low' | 'Mid' | 'High' | 'VeryHigh';
export type ZZone = 'NearLine' | 'TableLevel' | 'FarLine';
export type GridCell = { x: XZone; y: YZone; z: ZZone };

const X_ZONES: XZone[] = ['SuperLeft', 'MidLeft', 'Center', 'MidRight', 'SuperRight'];
const Y_ZONES: YZone[] = ['Low', 'Mid', 'High', 'VeryHigh'];
const Z_ZONES: ZZone[] = ['NearLine', 'TableLevel', 'FarLine'];

export class GridSystem {
  private _metrics: ISceneMetrics;

  private _xEdges: number[];
  private _yBase: number;
  private _yBandSize: number;
  private _yCapTop: number;
  private _zEdges: number[];

  constructor(metrics: ISceneMetrics) {
    this._metrics = metrics;

    const xBand = (metrics.courtMaxX - metrics.courtMinX) / 5;
    this._xEdges = [
      metrics.courtMinX,
      metrics.courtMinX + xBand,
      metrics.courtMinX + xBand * 2,
      metrics.courtMinX + xBand * 3,
      metrics.courtMinX + xBand * 4,
      metrics.courtMaxX,
    ];

    this._yBase = metrics.tableTopY;
    this._yBandSize = 0.6;
    this._yCapTop = metrics.tableTopY + 4;

    const zBand = (metrics.courtMaxZ - metrics.courtMinZ) / 3;
    this._zEdges = [
      metrics.courtMinZ,
      metrics.courtMinZ + zBand,
      metrics.courtMinZ + zBand * 2,
      metrics.courtMaxZ,
    ];
  }

  cellFromWorld(pos: Vector3): GridCell {
    let xIdx = 0;
    for (let i = 0; i < 5; i++) {
      if (pos.x >= this._xEdges[i] && pos.x < this._xEdges[i + 1]) {
        xIdx = i;
        break;
      }
    }
    if (pos.x >= this._xEdges[5]) xIdx = 4;
    if (pos.x < this._xEdges[0]) xIdx = 0;

    const yRel = pos.y - this._yBase;
    let yIdx: number;
    if (yRel < this._yBandSize) yIdx = 0;
    else if (yRel < this._yBandSize * 2) yIdx = 1;
    else if (yRel < this._yBandSize * 3) yIdx = 2;
    else yIdx = 3;

    let zIdx = 0;
    for (let i = 0; i < 3; i++) {
      if (pos.z >= this._zEdges[i] && pos.z < this._zEdges[i + 1]) {
        zIdx = i;
        break;
      }
    }
    if (pos.z >= this._zEdges[3]) zIdx = 2;
    if (pos.z < this._zEdges[0]) zIdx = 0;

    return { x: X_ZONES[xIdx], y: Y_ZONES[yIdx], z: Z_ZONES[zIdx] };
  }

  cellCenter(cell: GridCell): Vector3 {
    const xIdx = X_ZONES.indexOf(cell.x);
    const yIdx = Y_ZONES.indexOf(cell.y);
    const zIdx = Z_ZONES.indexOf(cell.z);

    const cx = (this._xEdges[xIdx] + this._xEdges[xIdx + 1]) * 0.5;

    let cy: number;
    if (yIdx < 3) {
      cy = this._yBase + this._yBandSize * yIdx + this._yBandSize * 0.5;
    } else {
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
