/**
 * Plain court-geometry data contract.
 *
 * EXTRACTION NOTE: the original `src/core/SceneMetrics.ts` `ISceneMetrics` was a
 * pure data interface (no Babylon imports) describing the measured dimensions of
 * the table/court. The spatial systems (GridSystem, ZoneSelector helpers) read
 * these numbers. Reproduced here so the spatial modules stay self-contained.
 *
 * The host computes these once from its loaded table model and passes them in.
 */
export interface ISceneMetrics {
  // Court play-area bounds (world metres)
  courtMinX: number;
  courtMaxX: number;
  courtMinZ: number;
  courtMaxZ: number;

  // Table geometry
  tableTopY: number;
  tableCenterX: number;
  tableCenterZ: number;
  tableHalfWidth: number;
  tableHalfLength: number;
}
