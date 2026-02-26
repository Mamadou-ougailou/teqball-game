import { describe, it, expect } from 'vitest';
import {
  evaluatePlayerTouch,
  evaluateHandTouch,
  evaluateBoundary,
  evaluateNetTouch,
  recordPoint,
  initializeRallyState,
  resetRallyForServe,
} from '@gameplay/RuleEngine';
import { MAX_TOUCHES_PER_PLAYER, POINTS_PER_SET, SETS_TO_WIN } from '@core/constants';

/**
 * Unit tests for RuleEngine pure functions
 * No BabylonJS dependency - fully isolated and fast
 */

describe('RuleEngine', () => {
  describe('Player Touch Validation', () => {
    it('allows consecutive touches up to max', () => {
      const state = initializeRallyState();
      const event = { type: 'touch', playerIdTouching: 0, ballPosition: { x: 0, y: 1, z: 5 }, timestamp: 0 } as any;

      for (let i = 0; i < MAX_TOUCHES_PER_PLAYER; i++) {
        const result = evaluatePlayerTouch(state, event, 1);
        expect(result.isValid).toBe(true);
      }

      const resultOver = evaluatePlayerTouch(state, event, 1);
      expect(resultOver.isValid).toBe(false);
      expect(resultOver.reason).toContain('Max');
    });

    it('resets touch counter on different player', () => {
      const state = initializeRallyState();
      const event0 = { type: 'touch', playerIdTouching: 0, ballPosition: { x: 0, y: 1, z: 5 }, timestamp: 0 } as any;
      const event1 = { type: 'touch', playerIdTouching: 1, ballPosition: { x: 0, y: 1, z: 5 }, timestamp: 1 } as any;

      evaluatePlayerTouch(state, event0, 1);
      evaluatePlayerTouch(state, event0, 1);
      evaluatePlayerTouch(state, event1, 2); // Different player

      expect(state.touchCount).toBe(1);
    });
  });

  describe('Scoring', () => {
    it('records point and detects set win', () => {
      const state = initializeRallyState();
      state.pointsTeam1 = POINTS_PER_SET - 1;

      recordPoint(state, 1);
      expect(state.pointsTeam1).toBe(POINTS_PER_SET);
      expect(state.pointsTeam2).toBe(0);
    });

    it('requires 2-point lead for set win', () => {
      const state = initializeRallyState();
      state.pointsTeam1 = POINTS_PER_SET;
      state.pointsTeam2 = POINTS_PER_SET - 1;

      const result = recordPoint(state, 2);
      expect(result.setWon).toBe(false); // No lead yet
    });

    it('detects match win at 2 sets', () => {
      const state = initializeRallyState();
      state.setsTeam1 = SETS_TO_WIN - 1;
      state.pointsTeam1 = POINTS_PER_SET - 1;

      recordPoint(state, 1);
      const result2 = recordPoint(state, 1);

      expect(result2.matchWon).toBe(true);
    });
  });

  describe('Rally Reset', () => {
    it('clears state for new serve', () => {
      const state = initializeRallyState();
      state.touchCount = 3;
      state.lastTouchPlayerId = 1;

      resetRallyForServe(state);

      expect(state.touchCount).toBe(0);
      expect(state.lastTouchPlayerId).toBe(-1);
    });
  });
});
