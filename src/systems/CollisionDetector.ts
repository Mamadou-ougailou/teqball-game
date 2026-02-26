import { IEntity } from '@core/interfaces';

/**
 * CollisionDetector - Monitors Havok collision events
 * Identifies mesh pairs via metadata and emits EventBus events
 * TODO Phase 1: Wire up collision observables
 */
export class CollisionDetector implements IEntity {
  update(_deltaTime: number): void {
    // TODO Phase 1
  }

  dispose(): void {
    // TODO Phase 1
  }
}
