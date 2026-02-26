import { IAbility, ICharacter } from '@core/interfaces';

/**
 * SpeedBurst Ability - Multiplies movement speed by 3 for 2 seconds
 * TODO Phase 3: Modify character speed stat temporarily
 */
export class SpeedBurst implements IAbility {
  readonly id = 'speed-burst';
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
