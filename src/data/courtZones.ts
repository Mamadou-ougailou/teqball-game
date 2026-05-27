import { ISceneMetrics } from '../core/SceneMetrics';
import { ZoneSelector, TableZone } from '../systems/ZoneSelector';

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
