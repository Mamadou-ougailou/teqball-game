import { IEntity } from '@core/interfaces';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';

/**
 * TeqballTable - wraps the loaded table mesh array.
 * Physics is applied externally in main.ts after loading.
 */
export class TeqballTable implements IEntity {
  private _meshes: AbstractMesh[];

  constructor(meshes: AbstractMesh[]) {
    this._meshes = meshes;
    this._meshes.forEach((mesh, index) => {
      if (!mesh.metadata) mesh.metadata = {};
      (mesh.metadata as Record<string, unknown>).meshType = 'table';
      (mesh.metadata as Record<string, unknown>).index = index;
    });
  }

  get meshes(): AbstractMesh[] {
    return this._meshes;
  }

  getMainMesh(): AbstractMesh | null {
    return this._meshes.length > 0 ? this._meshes[0] : null;
  }

  update(_deltaTime: number): void {}

  dispose(): void {
    this._meshes.forEach((m) => m.dispose());
    this._meshes = [];
  }
}
