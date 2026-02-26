import { IAbility, ICharacter } from '@core/interfaces';

/**
 * BallFreeze Ability - Locks ball in place for 1 second
 * TODO Phase 3: Freeze ball physics momentarily
 */
export class BallFreeze implements IAbility {
  readonly id = 'ball-freeze';
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
