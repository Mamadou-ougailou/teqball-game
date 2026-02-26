import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ICharacter, CharacterState, GameAction, CharacterStats } from '@core/interfaces';
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';

/**
 * Character/Player entity - Implements full player controller
 * TODO Phase 2: Movement, jumping, kicking, animation switching
 */
export class Character implements ICharacter {
  readonly id: number;
  readonly stats: CharacterStats;
  readonly currentState: CharacterState = CharacterState.IDLE;
  readonly position: Vector3 = Vector3.Zero();
  readonly mesh: AbstractMesh = new AbstractMesh('character-placeholder');
  readonly skeleton: Skeleton | null = null;

  constructor(id: number, stats: CharacterStats) {
    this.id = id;
    this.stats = stats;
  }

  setInputAction(_action: GameAction, _isPressed: boolean): void {
    // TODO Phase 2
  }

  getCurrentAnimation(): string {
    // TODO Phase 2
    return '';
  }

  playAnimation(_animName: string, _loop?: boolean): void {
    // TODO Phase 2
  }

  setRotation(): void {
    // TODO Phase 2
  }

  getKickDirection(): Vector3 {
    // TODO Phase 2
    return Vector3.Forward();
  }

  canKick(): boolean {
    // TODO Phase 2
    return false;
  }

  update(_deltaTime: number): void {
    // TODO Phase 2
  }

  dispose(): void {
    // TODO Phase 2
  }
}
