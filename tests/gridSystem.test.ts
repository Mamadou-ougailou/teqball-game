import { describe, it, expect } from 'vitest';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { GridSystem, GridCell, XZone, YZone, ZZone } from '@systems/GridSystem';
import { ISceneMetrics } from '@core/SceneMetrics';

/**
 * Unit tests for GridSystem — spatial grid over the teqball court.
 *
 * Mock metrics used throughout (matching the spec):
 *   courtMinX=-6, courtMaxX=6   → xBand = 12/5 = 2.4
 *   X edges: -6, -3.6, -1.2, 1.2, 3.6, 6
 *   Zones: SuperLeft[-6,-3.6), MidLeft[-3.6,-1.2), Center[-1.2,1.2), MidRight[1.2,3.6), SuperRight[3.6,6)
 *
 *   tableTopY=0.76, bandSize=0.6
 *   Y zones (absolute): Low[0.76,1.36), Mid[1.36,1.96), High[1.96,2.56), VeryHigh[2.56,4.76]
 *
 *   courtMinZ=-8, courtMaxZ=8   → zBand = 16/3 ≈ 5.333
 *   Z edges: -8, -2.667, 2.667, 8
 *   Zones: NearLine[-8,-2.667), TableLevel[-2.667,2.667), FarLine[2.667,8)
 */

const mockMetrics: ISceneMetrics = {
  courtMinX: -6, courtMaxX: 6,
  courtMinZ: -8, courtMaxZ: 8,
  courtCenterX: 0, courtCenterZ: 0,
  courtHalfWidth: 6, courtHalfLength: 8,
  tableTopY: 0.76,
  tableCenterX: 0, tableCenterZ: 0,
  tableHalfWidth: 0.85, tableHalfLength: 1.5,
  serveLine1Z: -3, serveLine2Z: 3,
  netCenterZ: 0,
  lineY: 0.01,
};

describe('GridSystem', () => {

  // ─── cellFromWorld — X zones ───
  describe('cellFromWorld — X zones', () => {
    it('pos=(-5, 1.0, 0) → x=SuperLeft', () => {
      const gs = new GridSystem(mockMetrics);
      const cell = gs.cellFromWorld(new Vector3(-5, 1.0, 0));
      expect(cell.x).toBe('SuperLeft');
    });

    it('pos=(-2.0, 1.0, 0) → x=MidLeft', () => {
      const gs = new GridSystem(mockMetrics);
      const cell = gs.cellFromWorld(new Vector3(-2.0, 1.0, 0));
      expect(cell.x).toBe('MidLeft');
    });

    it('pos=(0, 1.0, 0) → x=Center', () => {
      const gs = new GridSystem(mockMetrics);
      const cell = gs.cellFromWorld(new Vector3(0, 1.0, 0));
      expect(cell.x).toBe('Center');
    });

    it('pos=(2.0, 1.0, 0) → x=MidRight', () => {
      const gs = new GridSystem(mockMetrics);
      const cell = gs.cellFromWorld(new Vector3(2.0, 1.0, 0));
      expect(cell.x).toBe('MidRight');
    });

    it('pos=(5, 1.0, 0) → x=SuperRight', () => {
      const gs = new GridSystem(mockMetrics);
      const cell = gs.cellFromWorld(new Vector3(5, 1.0, 0));
      expect(cell.x).toBe('SuperRight');
    });

    it('pos well outside courtMaxX clamps to SuperRight', () => {
      const gs = new GridSystem(mockMetrics);
      const cell = gs.cellFromWorld(new Vector3(100, 1.0, 0));
      expect(cell.x).toBe('SuperRight');
    });

    it('pos well outside courtMinX clamps to SuperLeft', () => {
      const gs = new GridSystem(mockMetrics);
      const cell = gs.cellFromWorld(new Vector3(-100, 1.0, 0));
      expect(cell.x).toBe('SuperLeft');
    });
  });

  // ─── cellFromWorld — Y zones ───
  describe('cellFromWorld — Y zones', () => {
    // tableTopY=0.76; Low=[0.76, 1.36), Mid=[1.36, 1.96), High=[1.96, 2.56), VeryHigh=[2.56,...)

    it('pos=(0, 0.76, 0) → y=Low (at tableTopY)', () => {
      const gs = new GridSystem(mockMetrics);
      const cell = gs.cellFromWorld(new Vector3(0, 0.76, 0));
      expect(cell.y).toBe('Low');
    });

    it('pos=(0, 1.0, 0) → y=Low (inside Low band)', () => {
      const gs = new GridSystem(mockMetrics);
      const cell = gs.cellFromWorld(new Vector3(0, 1.0, 0));
      expect(cell.y).toBe('Low');
    });

    it('pos=(0, 1.36, 0) → y=Mid (at Low/Mid boundary)', () => {
      const gs = new GridSystem(mockMetrics);
      // 0.76 + 0.6 = 1.36 → start of Mid band
      const cell = gs.cellFromWorld(new Vector3(0, 1.36, 0));
      expect(cell.y).toBe('Mid');
    });

    it('pos=(0, 1.7, 0) → y=Mid', () => {
      const gs = new GridSystem(mockMetrics);
      const cell = gs.cellFromWorld(new Vector3(0, 1.7, 0));
      expect(cell.y).toBe('Mid');
    });

    it('pos=(0, 1.96, 0) → y=High (at Mid/High boundary)', () => {
      const gs = new GridSystem(mockMetrics);
      // 0.76 + 1.2 = 1.96 → start of High band
      const cell = gs.cellFromWorld(new Vector3(0, 1.96, 0));
      expect(cell.y).toBe('High');
    });

    it('pos=(0, 3.5, 0) → y=VeryHigh', () => {
      const gs = new GridSystem(mockMetrics);
      const cell = gs.cellFromWorld(new Vector3(0, 3.5, 0));
      expect(cell.y).toBe('VeryHigh');
    });

    it('pos below tableTopY → y=Low (clamped)', () => {
      const gs = new GridSystem(mockMetrics);
      const cell = gs.cellFromWorld(new Vector3(0, 0, 0));
      expect(cell.y).toBe('Low');
    });
  });

  // ─── cellFromWorld — Z zones ───
  describe('cellFromWorld — Z zones', () => {
    // zBand = 16/3 ≈ 5.333; NearLine[-8,-2.667), TableLevel[-2.667,2.667), FarLine[2.667,8)

    it('pos=(0, 1.0, -5) → z=NearLine', () => {
      const gs = new GridSystem(mockMetrics);
      const cell = gs.cellFromWorld(new Vector3(0, 1.0, -5));
      expect(cell.z).toBe('NearLine');
    });

    it('pos=(0, 1.0, 0) → z=TableLevel', () => {
      const gs = new GridSystem(mockMetrics);
      const cell = gs.cellFromWorld(new Vector3(0, 1.0, 0));
      expect(cell.z).toBe('TableLevel');
    });

    it('pos=(0, 1.0, 5) → z=FarLine', () => {
      const gs = new GridSystem(mockMetrics);
      const cell = gs.cellFromWorld(new Vector3(0, 1.0, 5));
      expect(cell.z).toBe('FarLine');
    });
  });

  // ─── cellCenter / cellFromWorld inverse ───
  describe('cellCenter and cellFromWorld are inverses', () => {
    const testCells: GridCell[] = [
      { x: 'SuperLeft', y: 'Low', z: 'NearLine' },
      { x: 'Center', y: 'Mid', z: 'TableLevel' },
      { x: 'SuperRight', y: 'High', z: 'FarLine' },
      { x: 'MidLeft', y: 'VeryHigh', z: 'NearLine' },
      { x: 'MidRight', y: 'Low', z: 'FarLine' },
    ];

    for (const cell of testCells) {
      it(`cellFromWorld(cellCenter(${cell.x}/${cell.y}/${cell.z})) equals cell`, () => {
        const gs = new GridSystem(mockMetrics);
        const center = gs.cellCenter(cell);
        const recovered = gs.cellFromWorld(center);
        expect(recovered.x).toBe(cell.x);
        expect(recovered.y).toBe(cell.y);
        expect(recovered.z).toBe(cell.z);
      });
    }
  });

  // ─── cellBounds ───
  describe('cellBounds', () => {
    it('min.x < max.x, min.y < max.y, min.z < max.z for any cell', () => {
      const gs = new GridSystem(mockMetrics);
      const bounds = gs.cellBounds({ x: 'Center', y: 'Mid', z: 'TableLevel' });
      expect(bounds.min.x).toBeLessThan(bounds.max.x);
      expect(bounds.min.y).toBeLessThan(bounds.max.y);
      expect(bounds.min.z).toBeLessThan(bounds.max.z);
    });

    it('X span of each band equals 1/5 of court width', () => {
      const gs = new GridSystem(mockMetrics);
      const courtWidth = mockMetrics.courtMaxX - mockMetrics.courtMinX; // 12
      const expectedXSpan = courtWidth / 5; // 2.4

      const zones: XZone[] = ['SuperLeft', 'MidLeft', 'Center', 'MidRight', 'SuperRight'];
      for (const x of zones) {
        const bounds = gs.cellBounds({ x, y: 'Low', z: 'TableLevel' });
        const span = bounds.max.x - bounds.min.x;
        expect(Math.abs(span - expectedXSpan)).toBeLessThan(0.0001);
      }
    });

    it('Y span of Low, Mid, High bands equals 0.6 m', () => {
      const gs = new GridSystem(mockMetrics);
      const regularZones: YZone[] = ['Low', 'Mid', 'High'];
      for (const y of regularZones) {
        const bounds = gs.cellBounds({ x: 'Center', y, z: 'TableLevel' });
        const span = bounds.max.y - bounds.min.y;
        expect(Math.abs(span - 0.6)).toBeLessThan(0.0001);
      }
    });

    it('VeryHigh Y band is taller than 0.6 m (capped at tableTopY+4)', () => {
      const gs = new GridSystem(mockMetrics);
      const bounds = gs.cellBounds({ x: 'Center', y: 'VeryHigh', z: 'TableLevel' });
      const span = bounds.max.y - bounds.min.y;
      expect(span).toBeGreaterThan(0.6);
    });

    it('cellCenter lies within its own cellBounds', () => {
      const gs = new GridSystem(mockMetrics);
      const cell: GridCell = { x: 'MidRight', y: 'High', z: 'NearLine' };
      const center = gs.cellCenter(cell);
      const bounds = gs.cellBounds(cell);
      expect(center.x).toBeGreaterThanOrEqual(bounds.min.x - 1e-9);
      expect(center.x).toBeLessThanOrEqual(bounds.max.x + 1e-9);
      expect(center.y).toBeGreaterThanOrEqual(bounds.min.y - 1e-9);
      expect(center.y).toBeLessThanOrEqual(bounds.max.y + 1e-9);
      expect(center.z).toBeGreaterThanOrEqual(bounds.min.z - 1e-9);
      expect(center.z).toBeLessThanOrEqual(bounds.max.z + 1e-9);
    });
  });

  // ─── adjacentCells ───
  describe('adjacentCells', () => {
    it('center cell returns exactly 6 neighbours (2 per axis)', () => {
      const gs = new GridSystem(mockMetrics);
      // Center zone has neighbours in all 6 directions
      const cell: GridCell = { x: 'Center', y: 'Mid', z: 'TableLevel' };
      const adj = gs.adjacentCells(cell);
      expect(adj.length).toBe(6);
    });

    it('returns at most 6 cells for any cell', () => {
      const gs = new GridSystem(mockMetrics);
      const allCells = gs.allCells();
      for (const cell of allCells) {
        const adj = gs.adjacentCells(cell);
        expect(adj.length).toBeLessThanOrEqual(6);
      }
    });

    it('corner cell (SuperLeft/Low/NearLine) returns fewer neighbours due to edges', () => {
      const gs = new GridSystem(mockMetrics);
      const corner: GridCell = { x: 'SuperLeft', y: 'Low', z: 'NearLine' };
      const adj = gs.adjacentCells(corner);
      // At a corner: only 1 X neighbour, 1 Y neighbour, 1 Z neighbour → 3 total
      expect(adj.length).toBe(3);
    });

    it('edge cell (SuperLeft/Mid/TableLevel) returns fewer than 6 neighbours', () => {
      const gs = new GridSystem(mockMetrics);
      const edge: GridCell = { x: 'SuperLeft', y: 'Mid', z: 'TableLevel' };
      const adj = gs.adjacentCells(edge);
      // 1 X neighbour, 2 Y neighbours, 2 Z neighbours → 5 total
      expect(adj.length).toBe(5);
      expect(adj.length).toBeLessThan(6);
    });

    it('adjacent cells differ by exactly one zone step in one axis', () => {
      const gs = new GridSystem(mockMetrics);
      const cell: GridCell = { x: 'Center', y: 'Mid', z: 'TableLevel' };
      const adj = gs.adjacentCells(cell);
      for (const neighbour of adj) {
        const xDiff = neighbour.x !== cell.x ? 1 : 0;
        const yDiff = neighbour.y !== cell.y ? 1 : 0;
        const zDiff = neighbour.z !== cell.z ? 1 : 0;
        expect(xDiff + yDiff + zDiff).toBe(1);
      }
    });

    it('all adjacent cells are valid GridCells', () => {
      const validX: XZone[] = ['SuperLeft', 'MidLeft', 'Center', 'MidRight', 'SuperRight'];
      const validY: YZone[] = ['Low', 'Mid', 'High', 'VeryHigh'];
      const validZ: ZZone[] = ['NearLine', 'TableLevel', 'FarLine'];

      const gs = new GridSystem(mockMetrics);
      const cell: GridCell = { x: 'Center', y: 'Mid', z: 'TableLevel' };
      const adj = gs.adjacentCells(cell);

      for (const neighbour of adj) {
        expect(validX).toContain(neighbour.x);
        expect(validY).toContain(neighbour.y);
        expect(validZ).toContain(neighbour.z);
      }
    });
  });

  // ─── allCells ───
  describe('allCells', () => {
    it('returns 5 * 4 * 3 = 60 cells', () => {
      const gs = new GridSystem(mockMetrics);
      expect(gs.allCells().length).toBe(60);
    });

    it('contains no duplicates', () => {
      const gs = new GridSystem(mockMetrics);
      const cells = gs.allCells();
      const keys = cells.map(c => `${c.x}|${c.y}|${c.z}`);
      const unique = new Set(keys);
      expect(unique.size).toBe(60);
    });
  });
});
