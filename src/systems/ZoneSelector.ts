import { Vector3 } from '@babylonjs/core/Maths/math.vector';

export type ZoneColumn = 'Left' | 'Center' | 'Right';
export type ZoneRow = 'NetRow' | 'EdgeRow';

export interface TableZone {
  id: string;         // e.g. 'NET_L', 'EDGE_R'
  column: ZoneColumn;
  row: ZoneRow;
  center: Vector3;    // world center of the zone
  halfWidth: number;  // half-extent in X
  halfLength: number; // half-extent in Z
}

export type SpeedTier = 'Normal' | 'Fast' | 'Maximum';

export interface ZoneWeights {
  [zoneId: string]: number;
}

// Short prefix for zone id based on row
const ROW_PREFIX: Record<ZoneRow, string> = {
  NetRow: 'NET',
  EdgeRow: 'EDGE',
};

// Short suffix for zone id based on column
const COL_SUFFIX: Record<ZoneColumn, string> = {
  Left: 'L',
  Center: 'C',
  Right: 'R',
};

export class ZoneSelector {
  /**
   * Build the 6 table zones for one player side.
   * @param tableCenterX - table center X
   * @param tableCenterZ - table center Z
   * @param tableHalfWidth - X half-extent of table
   * @param tableHalfLength - Z half-extent of table
   * @param playerSide - 0 = neg-Z side, 1 = pos-Z side
   *   For playerSide=0, zones are on the positive Z half of the table (opponent's side).
   *   For playerSide=1, zones are on the negative Z half.
   */
  static buildZones(
    tableCenterX: number,
    tableCenterZ: number,
    tableHalfWidth: number,
    tableHalfLength: number,
    playerSide: 0 | 1,
  ): TableZone[] {
    // Each half has 2 rows (NetRow = near net, EdgeRow = far edge) and 3 columns.
    // Column thirds: each third is tableHalfWidth * 2 / 3 wide.
    const thirdWidth = (tableHalfWidth * 2) / 3;
    const halfWidth  = thirdWidth / 2;

    // Row halves: half-length of table half = tableHalfLength / 2
    const rowHalfLength = tableHalfLength / 2;

    // For playerSide=0: target half is the positive-Z half (opponent's side)
    //   NetRow center Z = tableCenterZ + rowHalfLength * 0.5 (closer to net at tableCenterZ)
    //   EdgeRow center Z = tableCenterZ + rowHalfLength * 1.5 (far edge)
    // For playerSide=1: target half is the negative-Z half
    //   NetRow center Z = tableCenterZ - rowHalfLength * 0.5
    //   EdgeRow center Z = tableCenterZ - rowHalfLength * 1.5
    const sign = playerSide === 0 ? 1 : -1;

    const netRowCenterZ  = tableCenterZ + sign * rowHalfLength * 0.5;
    const edgeRowCenterZ = tableCenterZ + sign * rowHalfLength * 1.5;

    // Column centers: left third, center third, right third
    const leftColCenterX   = tableCenterX - tableHalfWidth + thirdWidth * 0.5;
    const centerColCenterX = tableCenterX;
    const rightColCenterX  = tableCenterX + tableHalfWidth - thirdWidth * 0.5;

    const columns: Array<{ column: ZoneColumn; centerX: number }> = [
      { column: 'Left',   centerX: leftColCenterX },
      { column: 'Center', centerX: centerColCenterX },
      { column: 'Right',  centerX: rightColCenterX },
    ];

    const rows: Array<{ row: ZoneRow; centerZ: number }> = [
      { row: 'NetRow',  centerZ: netRowCenterZ },
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

  /**
   * Compute zone weights for AI zone selection.
   * Spec section 11.1 / 8.2:
   *   base = 1.0 for all zones
   *   + distanceFromOpponent * 1.0 (grid distance, approximate)
   *   corner zones (Left/Right column): × 1.8 if attack intent
   *   center zone: × 2.0 if safe intent
   *   NetRow zones: × 1.3
   *   speedTier: Fast → distance weight ×1.2, Maximum → ×1.4
   */
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

      // Distance from opponent (§8.2/§11.1): prefer zones far from opponent
      const dx = zone.center.x - opponentPos.x;
      const dz = zone.center.z - opponentPos.z;
      const distFromOpponent = Math.sqrt(dx * dx + dz * dz);
      weight += distFromOpponent * speedMult;

      // Preferred zones for the active kick animation (§11.1): ×2.0
      if (preferredZoneIds && preferredZoneIds.includes(zone.id)) {
        weight *= 2.0;
      }

      // Intent multipliers (§11.1)
      const isCorner = zone.column === 'Left' || zone.column === 'Right';
      if ((intent === 'attack' || intent === 'corner') && isCorner) {
        weight *= 1.8;
      }
      if (intent === 'safe' && zone.column === 'Center') {
        weight *= 2.0;
      }

      // NetRow bonus (§11.1)
      if (zone.row === 'NetRow') {
        weight *= 1.3;
      }

      // Opponent coverage penalty (§8.2/§8.3): reduce weight for zones the opponent
      // can easily reach. Travel time = grid steps × 0.25s.
      const oppTravelTime = ZoneSelector.opponentTravelTime(zone, opponentPos);
      const opponentCoveragePenalty = Math.max(0, 2.0 - oppTravelTime * 0.5);
      weight -= opponentCoveragePenalty;

      weights[zone.id] = Math.max(0.01, weight);
    }
    return weights;
  }

  /**
   * Sample a zone from weighted distribution.
   * Uses Math.random() internally.
   * 15% chance of fully random selection (stochastic substitution for AI unpredictability).
   */
  static sampleZone(zones: TableZone[], weights: ZoneWeights): TableZone {
    if (zones.length === 0) {
      throw new Error('ZoneSelector.sampleZone: zones array is empty');
    }

    // 15% chance of fully random selection
    if (Math.random() < 0.15) {
      return zones[Math.floor(Math.random() * zones.length)];
    }

    // Weighted random selection
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

    // Fallback (floating point edge case)
    return zones[zones.length - 1];
  }

  /**
   * Compute opponent travel time to a zone. Spec §8.3:
   *   steps = grid distance from opponentPos to zone center
   *   time  = steps * 0.25 seconds per step
   * Uses the zone halfWidth as the grid step size for X and Z axes independently.
   */
  static opponentTravelTime(zone: TableZone, opponentPos: Vector3): number {
    const stepX = Math.max(0.01, zone.halfWidth * 2);
    const stepZ = Math.max(0.01, zone.halfLength * 2);
    const dx = Math.abs(zone.center.x - opponentPos.x);
    const dz = Math.abs(zone.center.z - opponentPos.z);
    const stepsX = Math.ceil(dx / stepX);
    const stepsZ = Math.ceil(dz / stepZ);
    const totalSteps = Math.max(stepsX, stepsZ); // use Chebyshev distance for grid movement
    return totalSteps * 0.25;
  }

  /**
   * Get the actual landing target within a zone (center + variance).
   * Same as BallGuide.addVariance but operating on a TableZone directly.
   * @param zone - target zone
   * @param accuracy - 0 (totally random) to 1 (zone center)
   */
  static getLandingTarget(zone: TableZone, accuracy: number): Vector3 {
    const clampedAccuracy = Math.max(0, Math.min(1, accuracy));
    // At accuracy=1 variance=0; at accuracy=0 variance=full zone extents
    const varianceScale = 1 - clampedAccuracy;

    const offsetX = (Math.random() * 2 - 1) * zone.halfWidth  * varianceScale;
    const offsetZ = (Math.random() * 2 - 1) * zone.halfLength * varianceScale;

    return new Vector3(
      zone.center.x + offsetX,
      zone.center.y,
      zone.center.z + offsetZ,
    );
  }
}
