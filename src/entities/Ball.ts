import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { IBallSystem } from '@core/interfaces';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';

/**
 * Ball entity - Physics-driven ball with kick impulse
 * TODO Phase 1: Setup sphere physics, velocity tracking, effects
 */
export class Ball implements IBallSystem {
  readonly velocity: Vector3 = Vector3.Zero();
  readonly position: Vector3 = Vector3.Zero();
  readonly mesh: AbstractMesh = new AbstractMesh('ball-placeholder');

  applyKickImpulse(_direction: Vector3, _power: number): void {
    // TODO Phase 1
  }

  applyEffect(_effectId: string): void {
    // TODO Phase 4
  }

  resetPosition(_position: Vector3): void {
    // TODO Phase 1
  }

  update(_deltaTime: number): void {
    // TODO Phase 1
  }

  dispose(): void {
    // TODO Phase 1
  }
}
