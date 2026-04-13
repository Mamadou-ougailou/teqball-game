import { IMatchManager } from '@core/interfaces';
import { POINTS_PER_SET, SETS_TO_WIN } from './constants';

/**
 * MatchManager - Handles scoring, sets, serve rotation
 */
export class MatchManager implements IMatchManager {
  private _score: [number, number] = [0, 0];
  private _sets: [number, number] = [0, 0];
  private _currentServer = 0;
  private _isMatchActive = true;
  private _winner: number | null = null;

  get score(): [number, number] {
    return this._score;
  }

  get sets(): [number, number] {
    return this._sets;
  }

  get currentServer(): number {
    return this._currentServer;
  }

  get isMatchActive(): boolean {
    return this._isMatchActive;
  }

  get winner(): number | null {
    return this._winner;
  }

  recordPoint(scoringTeam: number): void {
    if (!this._isMatchActive) {
      return;
    }

    const team = scoringTeam === 0 ? 0 : 1;
    this._score[team] += 1;
    this._currentServer = team;

    const points0 = this._score[0];
    const points1 = this._score[1];

    const team0WonSet = points0 >= POINTS_PER_SET;
    const team1WonSet = points1 >= POINTS_PER_SET;

    if (team0WonSet || team1WonSet) {
      const winningTeam = team0WonSet ? 0 : 1;
      this._sets[winningTeam] += 1;
      this._score = [0, 0];

      if (this._sets[winningTeam] >= SETS_TO_WIN) {
        this.endMatch(winningTeam);
      } else {
        this.resetServe(winningTeam);
      }
    }
  }

  recordSetWin(winningTeam: number): void {
    const team = winningTeam === 0 ? 0 : 1;
    this._sets[team] += 1;
    this._score = [0, 0];

    if (this._sets[team] >= SETS_TO_WIN) {
      this.endMatch(team);
    } else {
      this.resetServe(team);
    }
  }

  resetServe(server: number): void {
    this._currentServer = server === 0 ? 0 : 1;
    this._isMatchActive = true;
  }

  endMatch(winningTeam: number): void {
    this._currentServer = winningTeam === 0 ? 0 : 1;
    this._isMatchActive = false;
    this._winner = winningTeam === 0 ? 0 : 1;
  }

  update(_deltaTime: number): void {
  }

  dispose(): void {
    this._score = [0, 0];
    this._sets = [0, 0];
    this._currentServer = 0;
    this._isMatchActive = false;
    this._winner = null;
  }
}
