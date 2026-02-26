import { IMatchManager } from '@core/interfaces';

/**
 * MatchManager - Handles scoring, sets, serve rotation
 * TODO Phase 3: Score tracking, set logic, match completion
 */
export class MatchManager implements IMatchManager {
  readonly score: [number, number] = [0, 0];
  readonly sets: [number, number] = [0, 0];
  readonly currentServer: number = 0;
  readonly isMatchActive: boolean = false;

  recordPoint(_scoringTeam: number): void {
    // TODO Phase 3
  }

  recordSetWin(_winningTeam: number): void {
    // TODO Phase 3
  }

  resetServe(_server: number): void {
    // TODO Phase 3
  }

  endMatch(_winningTeam: number): void {
    // TODO Phase 3
  }

  update(_deltaTime: number): void {
    // TODO Phase 3
  }

  dispose(): void {
    // TODO Phase 3
  }
}
