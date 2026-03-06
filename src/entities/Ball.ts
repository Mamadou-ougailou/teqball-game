import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { IBallSystem } from '@core/interfaces';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';

/**
 * Ball entity - thin wrapper around the procedural sphere mesh.
 * Physics is applied externally via PhysicsAggregate in main.ts.
 */
export class Ball implements IBallSystem {
  private _mesh: AbstractMesh;

  constructor(mesh: AbstractMesh) {
    this._mesh = mesh;
  }

  get mesh(): AbstractMesh { return this._mesh; }
  get position(): Vector3 { return this._mesh.position.clone(); }
  get velocity(): Vector3 {
    return this._mesh.physicsBody
      ? this._mesh.physicsBody.getLinearVelocity()
      : Vector3.Zero();
  }

  applyKickImpulse(direction: Vector3, power: number): void {
    if (this._mesh.physicsBody) {
      this._mesh.physicsBody.applyImpulse(
        direction.scale(power),
        this._mesh.getAbsolutePosition()
      );
    }
  }

  applyEffect(_effectId: string): void {}

  resetPosition(position: Vector3): void {
    this._mesh.position = position.clone();
    if (this._mesh.physicsBody) {
      this._mesh.physicsBody.setLinearVelocity(Vector3.Zero());
      this._mesh.physicsBody.setAngularVelocity(Vector3.Zero());
    }
  }

  update(_deltaTime: number): void {}

  dispose(): void {
    this._mesh.dispose();
  }
}
