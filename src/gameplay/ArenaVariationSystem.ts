import { IEntity, IArenaConfig } from '@core/interfaces';

/**
 * ArenaVariationSystem - Random arena modifiers
 * TODO Phase 4: Pick random config, apply gravity/lighting mods
 */
export class ArenaVariationSystem implements IEntity {
  getRandomArenaConfig(): IArenaConfig {
    // TODO Phase 4
    return {} as IArenaConfig;
  }

  update(_deltaTime: number): void {
    // TODO Phase 4
  }

  dispose(): void {
    // TODO Phase 4
  }
}
