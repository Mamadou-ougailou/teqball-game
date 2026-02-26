import { IEntity } from '@core/interfaces';

/**
 * PointAnnouncement - Full-screen overlay when point scored
 * TODO Phase 3: Show for 2 seconds then fade
 */
export class PointAnnouncement implements IEntity {
  announce(_team: number, _points: number): void {
    // TODO Phase 3
  }

  update(_deltaTime: number): void {
    // TODO Phase 3
  }

  dispose(): void {
    // TODO Phase 3
  }
}
