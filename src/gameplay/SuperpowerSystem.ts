import { IEntity, IAbility } from '@core/interfaces';

/**
 * SuperpowerSystem - Manages active ability instances
 * Tracks cooldown timers, activation/deactivation
 * TODO Phase 3: Integrate all ability types
 */
export class SuperpowerSystem implements IEntity {
  private activeAbilities: IAbility[] = [];

  activateAbility(_abilityId: string): void {
    // TODO Phase 3
  }

  getAbilityCooldown(_abilityId: string): number {
    // TODO Phase 3
    return 0;
  }

  update(_deltaTime: number): void {
    // TODO Phase 3
  }

  dispose(): void {
    // TODO Phase 3
  }
}
