import { IEntity } from '@core/interfaces';

export class GameLoop implements IEntity {
  private _entities: IEntity[] = [];

  registerEntity(entity: IEntity): void {
    if (!this._entities.includes(entity)) {
      this._entities.push(entity);
    }
  }

  unregisterEntity(entity: IEntity): void {
    const idx = this._entities.indexOf(entity);
    if (idx !== -1) {
      this._entities.splice(idx, 1);
    }
  }

  update(deltaTime: number): void {
    for (const entity of this._entities) {
      entity.update(deltaTime);
    }
  }

  dispose(): void {
    for (let i = this._entities.length - 1; i >= 0; i--) {
      this._entities[i].dispose();
    }
    this._entities = [];
  }
}
