import { IEntity, IArenaConfig } from '@core/interfaces';

/**
 * Arena - Loads complete arena environment
 * TODO Phase 3: Load .glb, apply config (skybox, fog, gravity, particles)
 */
export class Arena implements IEntity {
  readonly config: IArenaConfig;

  constructor(config: IArenaConfig) {
    this.config = config;
  }

  loadEnvironment(): void {
    // TODO Phase 3
  }

  update(_deltaTime: number): void {
    // TODO Phase 3
  }

  dispose(): void {
    // TODO Phase 3
  }
}
