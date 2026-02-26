import { IEntity } from '@core/interfaces';

/**
 * GameLoop - Registers all IEntity instances
 * Calls update(delta) on each in correct order each frame
 * TODO Phase 1: Orchestrate update order for all game systems
 */
export class GameLoop implements IEntity {
  private entities: IEntity[] = [];

  registerEntity(_entity: IEntity): void {
    // TODO Phase 1
  }

  update(_deltaTime: number): void {
    // TODO Phase 1: Call update on all registered entities
  }

  dispose(): void {
    // TODO Phase 1: Dispose all entities in reverse order
  }
}
