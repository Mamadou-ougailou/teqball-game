import { IAbility, ICharacter } from '@core/interfaces';

/**
 * GravityFlip Ability - Reverses ball gravity for 3 seconds
 * TODO Phase 3: Implement physics modification and cleanup
 */
export class GravityFlip implements IAbility {
  readonly id = 'gravity-flip';
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
