import { IEntity } from '@core/interfaces';

/**
 * HUD - In-match overlay (score, serve indicator, superpower cooldown)
 * TODO Phase 3: Update HUD elements from match events
 */
export class HUD implements IEntity {
  updateScore(_team: number, _points: number): void {
    // TODO Phase 3
  }

  updateCooldown(_ability: string, _percent: number): void {
    // TODO Phase 3
  }

  update(_deltaTime: number): void {
    // TODO Phase 3
  }

  dispose(): void {
    // TODO Phase 3
  }
}
