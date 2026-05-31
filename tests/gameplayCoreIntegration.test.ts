import { describe, it, expect } from 'vitest';
import * as RuleEngine from '../gameplay-core';
import { 
  MatchManager, 
  BallPredictor, 
  Vec3,
  type ISceneMetrics 
} from '../gameplay-core';

/**
 * Integration test for gameplay-core.
 * This proves that the extracted logic functions correctly as a "pure" library.
 */
describe('gameplay-core Integration', () => {

  const metrics: ISceneMetrics = {
    tableWidth: 1.7,
    tableLength: 3.0,
    tableTopY: 0.76,
    netHeight: 0.14,
    courtWidth: 12,
    courtLength: 16
  };

  it('MatchManager correctly handles a full set using pure logic', () => {
    const match = new MatchManager();
    expect(match.score[0]).toBe(0);
    expect(match.score[1]).toBe(0);

    // Score points up to 11 (POINTS_PER_SET - 1)
    for (let i = 0; i < 11; i++) {
        match.recordPoint(0);
    }
    expect(match.score[0]).toBe(11);

    // One more to win the set (12)
    match.recordPoint(0);

    expect(match.sets[0]).toBe(1);
    expect(match.score[0]).toBe(0); // Score should reset for next set
  });

  it('BallPredictor accurately predicts landing from core Vec3 maths', () => {
    const startPos = new Vec3(0, 5, 0);
    const velocity = new Vec3(0, 0, 0); // Dropping straight down
    
    // We expect it to hit at (0, 0.76, 0) since that's the table height
    const prediction = BallPredictor.ballAtArrival(startPos, velocity, metrics.tableTopY);
    
    expect(prediction).toBeDefined();
    expect(prediction!.position.y).toBeCloseTo(metrics.tableTopY);
    expect(prediction!.position.x).toBe(0);
    expect(prediction!.position.z).toBe(0);
  });

  it('RuleEngine detects a point using core types', () => {
    const state = RuleEngine.initializeRallyState();
    state.lastTouchPlayerId = 0; // Player on team 1 touched last
    
    // Ball hits ground at Z=5 (team 2 side), but far outside table (X=10)
    const event = {
        playerIdTouching: 0,
        ballPosition: new Vec3(10, 0, 5),
        timestamp: Date.now()
    };
    
    const result = RuleEngine.evaluateBoundary(state, event);
    expect(result.isValid).toBe(false);
    expect(result.point).toBe(2); // Point for opponent (Team 2)
  });
});
