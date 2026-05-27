import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Character } from '../entities/Character';
import { GridSystem, GridCell } from '../systems/GridSystem';
import { BallPredictor } from '../systems/BallPredictor';
import { ZoneSelector, TableZone, SpeedTier } from '../systems/ZoneSelector';
import { AnimSelector, AnimSelection } from '../systems/AnimSelector';
import { ISceneMetrics } from '../core/SceneMetrics';

export class AIController {
  private _character: Character;
  private _gridSystem: GridSystem;
  private _metrics: ISceneMetrics;
  private _targetCell: GridCell | null = null;
  private _moveTimer = 0;
  private readonly STEP_TIME = 0.25;

  constructor(character: Character, gridSystem: GridSystem, metrics: ISceneMetrics) {
    this._character = character;
    this._gridSystem = gridSystem;
    this._metrics = metrics;
  }

  selectTargetZone(
    opponentZones: TableZone[],
    opponentPos: Vector3,
    intent: 'attack' | 'safe' | 'corner' = 'attack',
    preferredZoneIds?: string[],
  ): TableZone {
    const tier = this.selectSpeedTier();
    const weights = ZoneSelector.computeWeights(opponentZones, opponentPos, tier, intent, preferredZoneIds);
    return ZoneSelector.sampleZone(opponentZones, weights);
  }

  selectSpeedTier(): SpeedTier { return 'Fast'; }

  selectServeAnimation(): AnimSelection { return AnimSelector.selectServe(); }

  decideMovementTarget(ballPos: Vector3, ballVel: Vector3): Vector3 {
    const contactY = this._character.mesh.position.y + 1.0;
    const prediction = BallPredictor.ballAtArrival(ballPos, ballVel, contactY);
    const targetCell = this._gridSystem.cellFromWorld(prediction.position);

    const playerId = this._character.id;
    const clampedCell: GridCell = {
      x: targetCell.x,
      y: targetCell.y,
      z: playerId === 0
        ? (targetCell.z === 'FarLine' ? 'TableLevel' : targetCell.z)
        : (targetCell.z === 'NearLine' ? 'TableLevel' : targetCell.z),
    };

    this._targetCell = clampedCell;
    return this._gridSystem.cellCenter(clampedCell);
  }

  moveToward(targetWorldPos: Vector3, deltaTime: number): void {
    const currentPos = this._character.mesh.position;
    const dx = targetWorldPos.x - currentPos.x;
    const dz = targetWorldPos.z - currentPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.1) {
      this._character.playAnimation('idle', true);
      this._moveTimer = 0;
      return;
    }

    this._moveTimer += deltaTime;

    if (this._moveTimer >= this.STEP_TIME) {
      this._moveTimer = 0;

      const currentCell = this._gridSystem.cellFromWorld(currentPos);
      const adjacents = this._gridSystem.adjacentCells(currentCell);

      let bestCell = currentCell;
      let bestDist = dist;
      for (const adj of adjacents) {
        const adjCenter = this._gridSystem.cellCenter(adj);
        const d = Vector3.Distance(adjCenter, targetWorldPos);
        if (d < bestDist) {
          bestDist = d;
          bestCell = adj;
        }
      }

      if (bestCell !== currentCell) {
        const newPos = this._gridSystem.cellCenter(bestCell);
        this._character.mesh.position.x = newPos.x;
        this._character.mesh.position.z = newPos.z;
      }
    }

    const facingY = this._character.mesh.rotation.y;
    const moveAngle = Math.atan2(dx, dz);
    let relAngle = moveAngle - facingY;
    relAngle = ((relAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

    if (relAngle < Math.PI * 0.25 || relAngle > Math.PI * 1.75) {
      this._character.playAnimation('jogForward', true);
    } else if (relAngle > Math.PI * 0.75 && relAngle < Math.PI * 1.25) {
      this._character.playAnimation('jogBack', true);
    } else if (relAngle >= Math.PI * 0.25 && relAngle <= Math.PI * 0.75) {
      this._character.playAnimation('strafeRight', true);
    } else {
      this._character.playAnimation('strafeLeft', true);
    }
  }

  rotateToward(targetPos: Vector3, deltaTime: number): void {
    const myPos = this._character.mesh.position;
    const dx = targetPos.x - myPos.x;
    const dz = targetPos.z - myPos.z;
    if (Math.abs(dx) < 0.001 && Math.abs(dz) < 0.001) return;

    const targetY = Math.atan2(dx, dz);
    const currentY = this._character.mesh.rotation.y;
    let diff = targetY - currentY;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;

    this._character.mesh.rotation.y += diff * Math.min(1, 8.0 * deltaTime);
  }

  get targetCell(): GridCell | null { return this._targetCell; }
}
