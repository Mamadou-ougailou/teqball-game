import { AssetManager, ModelData } from './core/AssetManager';

export type CharacterName = 'howard' | 'maradona';

export class CharacterRegistry {
  private _manager: AssetManager;
  private _loaded: Map<CharacterName, ModelData> = new Map();

  constructor(manager: AssetManager) {
    this._manager = manager;
  }

  /** Pre-load all three character GLBs. Call once at startup. */
  async loadAll(): Promise<void> {
    const names: CharacterName[] = ['howard', 'maradona'];
    await Promise.all(names.map(n => this._loadOne(n)));
  }

  /** Instantiate a fresh copy of a character model into the scene. */
  async instantiate(name: CharacterName): Promise<ModelData> {
    return await this._manager.loadModel(name);
  }

  private async _loadOne(name: CharacterName): Promise<void> {
    const data = await this._manager.loadModel(name);
    this._loaded.set(name, data);
  }
}
