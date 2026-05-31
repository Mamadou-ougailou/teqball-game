import { Vec3 as Vector3 } from '../math/Vec3';

/**
 * EXTRACTION NOTE: copied verbatim from src/systems/ZoneSelector.ts. Pure zone
 * maths + weighted AI target selection (Vector3 → Vec3 import swap only). Uses
 * `Math.random()` for AI variety — deterministic seeding can be layered on top
 * by the host if reproducibility is needed.
 */
export type ZoneColumn = 'Left' | 'Center' | 'Right';
export type ZoneRow = 'NetRow' | 'EdgeRow';

export interface TableZone {
  id: string;
  column: ZoneColumn;
  row: ZoneRow;
  center: Vector3;
  halfWidth: number;
  halfLength: number;
}

export type SpeedTier = 'Normal' | 'Fast' | 'Maximum';

export interface ZoneWeights {
  [zoneId: string]: number;
}

const ROW_PREFIX: Record<ZoneRow, string> = { NetRow: 'NET', EdgeRow: 'EDGE' };
const COL_SUFFIX: Record<ZoneColumn, string> = { Left: 'L', Center: 'C', Right: 'R' };

export class ZoneSelector {
  static buildZones(
    tableCenterX: number,
    tableCenterZ: number,
    tableHalfWidth: number,
    tableHalfLength: number,
    playerSide: 0 | 1,
  ): TableZone[] {
    const thirdWidth = (tableHalfWidth * 2) / 3;
    const halfWidth = thirdWidth / 2;
    const rowHalfLength = tableHalfLength / 2;
    const sign = playerSide === 0 ? 1 : -1;

    const netRowCenterZ = tableCenterZ + sign * rowHalfLength * 0.5;
    const edgeRowCenterZ = tableCenterZ + sign * rowHalfLength * 1.5;

    const leftColCenterX = tableCenterX - tableHalfWidth + thirdWidth * 0.5;
    const centerColCenterX = tableCenterX;
    const rightColCenterX = tableCenterX + tableHalfWidth - thirdWidth * 0.5;

    const columns: Array<{ column: ZoneColumn; centerX: number }> = [
      { column: 'Left', centerX: leftColCenterX },
      { column: 'Center', centerX: centerColCenterX },
      { column: 'Right', centerX: rightColCenterX },
    ];

    const rows: Array<{ row: ZoneRow; centerZ: number }> = [
      { row: 'NetRow', centerZ: netRowCenterZ },
      { row: 'EdgeRow', centerZ: edgeRowCenterZ },
    ];

    const zones: TableZone[] = [];
    for (const { row, centerZ } of rows) {
      for (const { column, centerX } of columns) {
        zones.push({
          id: `${ROW_PREFIX[row]}_${COL_SUFFIX[column]}`,
          column,
          row,
          center: new Vector3(centerX, 0, centerZ),
          halfWidth,
          halfLength: rowHalfLength,
        });
      }
    }
    return zones;
  }

  static computeWeights(
    zones: TableZone[],
    opponentPos: Vector3,
    speedTier: SpeedTier,
    intent: 'attack' | 'safe' | 'corner',
    preferredZoneIds?: string[],
  ): ZoneWeights {
    const speedMult = speedTier === 'Fast' ? 1.2 : speedTier === 'Maximum' ? 1.4 : 1.0;

    const weights: ZoneWeights = {};
    for (const zone of zones) {
      let weight = 1.0;

      const dx = zone.center.x - opponentPos.x;
      const dz = zone.center.z - opponentPos.z;
      const distFromOpponent = Math.sqrt(dx * dx + dz * dz);
      weight += distFromOpponent * speedMult;

      if (preferredZoneIds && preferredZoneIds.includes(zone.id)) {
        weight *= 2.0;
      }

      const isCorner = zone.column === 'Left' || zone.column === 'Right';
      if ((intent === 'attack' || intent === 'corner') && isCorner) {
        weight *= 1.8;
      }
      if (intent === 'safe' && zone.column === 'Center') {
        weight *= 2.0;
      }

      if (zone.row === 'NetRow') {
        weight *= 1.3;
      }

      const oppTravelTime = ZoneSelector.opponentTravelTime(zone, opponentPos);
      const opponentCoveragePenalty = Math.max(0, 2.0 - oppTravelTime * 0.5);
      weight -= opponentCoveragePenalty;

      weights[zone.id] = Math.max(0.01, weight);
    }
    return weights;
  }

  static sampleZone(zones: TableZone[], weights: ZoneWeights): TableZone {
    if (zones.length === 0) {
      throw new Error('ZoneSelector.sampleZone: zones array is empty');
    }

    if (Math.random() < 0.15) {
      return zones[Math.floor(Math.random() * zones.length)];
    }

    let totalWeight = 0;
    for (const zone of zones) {
      totalWeight += weights[zone.id] ?? 1.0;
    }

    let rng = Math.random() * totalWeight;
    for (const zone of zones) {
      rng -= weights[zone.id] ?? 1.0;
      if (rng <= 0) {
        return zone;
      }
    }

    return zones[zones.length - 1];
  }

  static opponentTravelTime(zone: TableZone, opponentPos: Vector3): number {
    const stepX = Math.max(0.01, zone.halfWidth * 2);
    const stepZ = Math.max(0.01, zone.halfLength * 2);
    const dx = Math.abs(zone.center.x - opponentPos.x);
    const dz = Math.abs(zone.center.z - opponentPos.z);
    const stepsX = Math.ceil(dx / stepX);
    const stepsZ = Math.ceil(dz / stepZ);
    const totalSteps = Math.max(stepsX, stepsZ);
    return totalSteps * 0.25;
  }

  static getLandingTarget(zone: TableZone, accuracy: number): Vector3 {
    const clampedAccuracy = Math.max(0, Math.min(1, accuracy));
    const varianceScale = 1 - clampedAccuracy;

    const offsetX = (Math.random() * 2 - 1) * zone.halfWidth * varianceScale;
    const offsetZ = (Math.random() * 2 - 1) * zone.halfLength * varianceScale;

    return new Vector3(
      zone.center.x + offsetX,
      zone.center.y,
      zone.center.z + offsetZ,
    );
  }
}
