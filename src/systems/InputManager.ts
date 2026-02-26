import { IEntity, GameAction, IInputManager } from '@core/interfaces';

/**
 * InputManager - Keyboard + Gamepad input
 * Maps inputs to GameActions per player ID
 * TODO Phase 1: Implement DeviceSourceManager integration
 */
export class InputManager implements IEntity, IInputManager {
  getActionState(_playerId: number, _action: GameAction): boolean {
    // TODO Phase 1
    return false;
  }

  getAxisInput(_playerId: number, _axis: 'horizontal' | 'vertical'): number {
    // TODO Phase 1
    return 0;
  }

  isUsingGamepad(): boolean {
    // TODO Phase 1
    return false;
  }

  update(_deltaTime: number): void {
    // TODO Phase 1
  }

  dispose(): void {
    // TODO Phase 1
  }
}
