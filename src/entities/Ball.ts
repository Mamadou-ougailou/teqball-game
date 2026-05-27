import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { IEntity } from '@core/interfaces';

export enum BallState {
  PARENTED   = 'PARENTED',
  TOSS       = 'TOSS',
  LIVE       = 'LIVE',
  BOUNCING   = 'BOUNCING',
  DEAD       = 'DEAD',
  IDLE_RESET = 'IDLE_RESET',
}

export class Ball implements IEntity {
  readonly mesh: AbstractMesh;
  private _state: BallState = BallState.IDLE_RESET;
  private _gravity: number;

  get state(): BallState { return this._state; }
  get position(): Vector3 { return this.mesh.position.clone(); }
  get velocity(): Vector3 {
    return this.mesh.physicsBody
      ? this.mesh.physicsBody.getLinearVelocity()
      : Vector3.Zero();
  }

  constructor(mesh: AbstractMesh, gravity = 9.81) {
    this._gravity = gravity;
    this.mesh = mesh;
  }

  setState(state: BallState): void {
    this._state = state;
    if (state === BallState.PARENTED || state === BallState.TOSS || state === BallState.IDLE_RESET || state === BallState.DEAD) {
      this._disablePhysics();
    } else {
      this._enablePhysics();
    }
  }

  setVelocity(velocity: Vector3): void {
    if (this.mesh.physicsBody) {
      this.mesh.physicsBody.setLinearVelocity(velocity);
    }
  }

  setPosition(pos: Vector3): void {
    this.mesh.position.copyFrom(pos);
  }

  resetToServe(position: Vector3): void {
    this.setPosition(position);
    this.setVelocity(Vector3.Zero());
    this.setState(BallState.IDLE_RESET);
  }

  update(_deltaTime: number): void {
    // State transitions are driven externally
  }

  dispose(): void {
    this.mesh.dispose();
  }

  private _enablePhysics(): void {
    if (this.mesh.physicsBody) {
      this.mesh.physicsBody.setLinearVelocity(Vector3.Zero());
      this.mesh.physicsBody.setAngularVelocity(Vector3.Zero());
    }
  }

  private _disablePhysics(): void {
    if (this.mesh.physicsBody) {
      this.mesh.physicsBody.setLinearVelocity(Vector3.Zero());
      this.mesh.physicsBody.setAngularVelocity(Vector3.Zero());
    }
  }
}
