import { IMatchManager } from '@core/interfaces';
import { EventBus } from '@core/EventBus';
import { POINTS_PER_SET, SETS_TO_WIN } from './constants';

const SERVICE_CHANGE_EVERY = 1; // server alternates every rally (every point)

/**
 * MatchManager - Handles scoring, sets, serve rotation
 */
export class MatchManager implements IMatchManager {
  private _score: [number, number] = [0, 0];
  private _sets: [number, number] = [0, 0];
  private _currentServer = 0;
  private _isMatchActive = true;
  private _winner: number | null = null;

  // Serve-rotation bookkeeping
  private _setStartServer = 0;
  private _totalSetPoints = 0;

  // Double-fault tracking — reset on any normal point
  private _consecutiveFailedServes = 0;

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
    this._totalSetPoints += 1;
    this._consecutiveFailedServes = 0;

    // Server alternates every SERVICE_CHANGE_EVERY points (currently 1 = every rally)
    this._currentServer = (this._setStartServer + Math.floor(this._totalSetPoints / SERVICE_CHANGE_EVERY)) % 2;

    const points0 = this._score[0];
    const points1 = this._score[1];

    // First to POINTS_PER_SET wins the set (no win-by-2 required)
    const team0WonSet = points0 >= POINTS_PER_SET;
    const team1WonSet = points1 >= POINTS_PER_SET;

    if (team0WonSet || team1WonSet) {
      const winningTeam = team0WonSet ? 0 : 1;
      this._sets[winningTeam] += 1;
      this._score = [0, 0];

      if (this._sets[winningTeam] >= SETS_TO_WIN) {
        this.endMatch(winningTeam);
      } else {
        // Loser serves first in the next set (official teqball rule)
        this._startNewSet(1 - winningTeam);
      }
    }
  }

  /**
   * Record a failed serve attempt.
   * Returns the opponent index if a double fault occurred and a point must be
   * awarded, or null if this is only the first fault (re-serve).
   */
  recordFailedServe(server: number): number | null {
    this._consecutiveFailedServes += 1;
    if (this._consecutiveFailedServes >= 2) {
      this._consecutiveFailedServes = 0;
      const opponent = server === 0 ? 1 : 0;
      this.recordPoint(opponent);
      return opponent;
    }
    return null;
  }

  recordSetWin(winningTeam: number): void {
    const team = winningTeam === 0 ? 0 : 1;
    this._sets[team] += 1;
    this._score = [0, 0];

    if (this._sets[team] >= SETS_TO_WIN) {
      this.endMatch(team);
    } else {
      this._startNewSet(1 - team);
    }
  }

  resetServe(server: number): void {
    this._currentServer = server === 0 ? 0 : 1;
    this._setStartServer = this._currentServer;
    this._isMatchActive = true;
  }

  endMatch(winningTeam: number): void {
    this._currentServer = winningTeam === 0 ? 0 : 1;
    this._isMatchActive = false;
    this._winner = winningTeam === 0 ? 0 : 1;
    EventBus.emit('match:end', this._winner);
  }

  restartMatch(): void {
    this._score = [0, 0];
    this._sets = [0, 0];
    this._winner = null;
    this._startNewSet(0);
  }

  private _startNewSet(server: number): void {
    this._totalSetPoints = 0;
    this._setStartServer = server === 0 ? 0 : 1;
    this._currentServer = this._setStartServer;
    this._consecutiveFailedServes = 0;
    this._isMatchActive = true;
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
