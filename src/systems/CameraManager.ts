import { Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { IEntity, ICameraManager } from '@core/interfaces';

/**
 * CameraManager - Creates and manages ArcRotateCamera (Dev B owned)
 * TODO Phase 2: Implement follow camera + fixed camera modes
 */
export class CameraManager implements IEntity, ICameraManager {
  setTarget(_position: Vector3): void {
    // TODO Phase 2
  }

  zoomOut(_distance: number): void {
    // TODO Phase 2
  }

  getActiveCameraRotation(): Quaternion {
    // TODO Phase 2
    return Quaternion.Identity();
  }

  update(_deltaTime: number): void {
    // TODO Phase 2
  }

  dispose(): void {
    // TODO Phase 2
  }
}
