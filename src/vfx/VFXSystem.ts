import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { IEntity, IVFXSystem } from '@core/interfaces';

/**
 * VFXSystem - Loads and manages particle effects
 * TODO Phase 4: Load particle JSONs, manage emitter lifecycle
 */
export class VFXSystem implements IEntity, IVFXSystem {
  playEffect(_effectId: string, _position: Vector3, _rotation?: Quaternion): void {
    // TODO Phase 4
  }

  stopEffect(_effectId: string): void {
    // TODO Phase 4
  }

  update(_deltaTime: number): void {
    // TODO Phase 4
  }

  dispose(): void {
    // TODO Phase 4
  }
}
