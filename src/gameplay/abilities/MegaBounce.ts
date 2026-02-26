import { IAbility, ICharacter } from '@core/interfaces';

/**
 * MegaBounce Ability - Multiplies next kick impulse by 2.5
 * TODO Phase 3: Apply kick multiplier on next kick event
 */
export class MegaBounce implements IAbility {
  readonly id = 'mega-bounce';
  readonly isActive = false;
  readonly cooldownPercent = 0;

  activate(_activator: ICharacter): void {
    // TODO Phase 3
  }

  deactivate(): void {
    // TODO Phase 3
  }

  tick(_deltaTime: number): void {
    // TODO Phase 3
  }

  update(_deltaTime: number): void {
    // TODO Phase 3
  }

  dispose(): void {
    // TODO Phase 3
  }
}
