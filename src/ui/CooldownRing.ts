import { IEntity } from '@core/interfaces';

/**
 * CooldownRing - Disc mesh below each player showing ability cooldown
 * Arc fills as cooldown recharges, glows when ready
 * TODO Phase 4: Render 3D cooldown indicator
 */
export class CooldownRing implements IEntity {
  setCooldown(_percent: number): void {
    // TODO Phase 4
  }

  setReady(_isReady: boolean): void {
    // TODO Phase 4
  }

  update(_deltaTime: number): void {
    // TODO Phase 4
  }

  dispose(): void {
    // TODO Phase 4
  }
}
