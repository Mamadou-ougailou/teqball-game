/**
 * gameplay-core — view-agnostic teqball mechanics extracted from Version 2.
 *
 * ZERO dependencies on BabylonJS, Havok, or the DOM. Everything here either was
 * already pure in the original project or has had its rendering/engine coupling
 * removed (see the EXTRACTION NOTE atop each file).
 *
 * Wiring a front-end:
 *   1. Subscribe to `EventBus` events to drive your UI / VFX / audio.
 *   2. Forward raw key state to `PlayerInputState.setKey`.
 *   3. Tick stateful systems (e.g. MatchManager/PhaseController) from your loop.
 *
 * See README.md for the full status map (what is extracted, what is still
 * coupled in the original, and what remains to be lifted).
 */

// --- math (self-contained, replaces @babylonjs Vector3) -------------------
export { Vec3, Vector3 } from './math/Vec3';

// --- core -----------------------------------------------------------------
export { EventBus } from './core/EventBus';
export * from './core/types';
export * from './core/constants';
export type { ISceneMetrics } from './core/SceneMetrics';

// --- rules / match (pure logic) -------------------------------------------
// Match-rule constants live in their own namespace to avoid name clashes with
// the duplicated POINTS_PER_SET / SETS_TO_WIN / TABLE_WIDTH in core/constants
// (the original project kept two copies; we preserve both, disambiguated here).
export * as MatchRules from './gameplay/constants';
export * from './gameplay/interfaces';
export * from './gameplay/RuleEngine';
export { PhaseController } from './gameplay/PhaseController';
export type { RallyPhase, PhaseState } from './gameplay/PhaseController';
export { MatchManager } from './gameplay/MatchManager';

// --- physics (pure ballistic maths) ---------------------------------------
export { BallGuide } from './physics/BallGuide';
export { BallPredictor } from './physics/BallPredictor';
export type { ArrivalPrediction } from './physics/BallPredictor';

// --- spatial (pure court partitioning + AI zone targeting) ----------------
export { GridSystem } from './spatial/GridSystem';
export type { GridCell, XZone, YZone, ZZone } from './spatial/GridSystem';
export { ZoneSelector } from './spatial/ZoneSelector';
export type { TableZone, ZoneColumn, ZoneRow, SpeedTier, ZoneWeights } from './spatial/ZoneSelector';
export { buildPlayerZones, buildAllZones } from './spatial/courtZones';

// --- input (de-coupled from the DOM) --------------------------------------
export { PlayerInputState } from './input/PlayerInputState';
export type { MovementInput } from './input/PlayerInputState';
