import { ISceneMetrics } from '../core/SceneMetrics';
import { ZoneSelector, TableZone } from './ZoneSelector';

/**
 * EXTRACTION NOTE: copied verbatim from src/data/courtZones.ts. Pure helpers
 * that build the per-side target zones from court metrics; no engine deps.
 */

/** Build opponent table zones for a given player side using runtime SceneMetrics. */
export function buildPlayerZones(metrics: ISceneMetrics, playerSide: 0 | 1): TableZone[] {
  return ZoneSelector.buildZones(
    metrics.tableCenterX,
    metrics.tableCenterZ,
    metrics.tableHalfWidth,
    metrics.tableHalfLength,
    playerSide,
  );
}

/** Build zones for both players. Returns [player0Zones, player1Zones]. */
export function buildAllZones(metrics: ISceneMetrics): [TableZone[], TableZone[]] {
  return [
    buildPlayerZones(metrics, 0),
    buildPlayerZones(metrics, 1),
  ];
}
