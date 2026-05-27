import { describe, it, expect } from 'vitest';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { BallGuide } from '@systems/BallGuide';

const GRAVITY = 9.8;
const TOLERANCE = 0.05; // metres

describe('BallGuide', () => {

  // ─── computeArcVelocity ───
  describe('computeArcVelocity', () => {
    it('lands at target position within 0.05 m tolerance (flat trajectory)', () => {
      const from = new Vector3(0, 0, 0);
      const to = new Vector3(5, 0, 5);
      const arcHeight = 2.0;

      const vel = BallGuide.computeArcVelocity(from, to, arcHeight, GRAVITY);

      // Use timeToReachY to find when the ball returns to to.y
      const t = BallGuide.timeToReachY(from, vel, to.y, GRAVITY);
      expect(t).not.toBeNull();

      const landed = BallGuide.simulatePosition(from, vel, t!, GRAVITY);
      expect(Math.abs(landed.x - to.x)).toBeLessThan(TOLERANCE);
      expect(Math.abs(landed.z - to.z)).toBeLessThan(TOLERANCE);
      expect(Math.abs(landed.y - to.y)).toBeLessThan(TOLERANCE);
    });

    it('lands at target position within 0.05 m tolerance (target above origin)', () => {
      const from = new Vector3(0, 0, 0);
      const to = new Vector3(3, 1, 4);
      const arcHeight = 3.0;

      const vel = BallGuide.computeArcVelocity(from, to, arcHeight, GRAVITY);
      const t = BallGuide.timeToReachY(from, vel, to.y, GRAVITY);
      expect(t).not.toBeNull();

      const landed = BallGuide.simulatePosition(from, vel, t!, GRAVITY);
      expect(Math.abs(landed.x - to.x)).toBeLessThan(TOLERANCE);
      expect(Math.abs(landed.z - to.z)).toBeLessThan(TOLERANCE);
    });

    it('produces vy > 0 for arcHeight=2.0, from=(0,0,0), to=(5,0,5)', () => {
      const from = new Vector3(0, 0, 0);
      const to = new Vector3(5, 0, 5);
      const vel = BallGuide.computeArcVelocity(from, to, 2.0, GRAVITY);
      expect(vel.y).toBeGreaterThan(0);
    });

    it('vy equals gravity * tUp (formula check)', () => {
      const arcHeight = 3.0;
      const tUp = Math.sqrt(2 * arcHeight / GRAVITY);
      const expectedVy = GRAVITY * tUp;

      const from = new Vector3(0, 0, 0);
      const to = new Vector3(4, 0, 4);
      const vel = BallGuide.computeArcVelocity(from, to, arcHeight, GRAVITY);

      expect(Math.abs(vel.y - expectedVy)).toBeLessThan(0.0001);
    });

    it('handles target below origin (negative delta-y)', () => {
      const from = new Vector3(0, 2, 0);
      const to = new Vector3(4, 0, 4);
      const arcHeight = 2.5;

      const vel = BallGuide.computeArcVelocity(from, to, arcHeight, GRAVITY);
      const t = BallGuide.timeToReachY(from, vel, to.y, GRAVITY);
      expect(t).not.toBeNull();

      const landed = BallGuide.simulatePosition(from, vel, t!, GRAVITY);
      expect(Math.abs(landed.x - to.x)).toBeLessThan(TOLERANCE);
      expect(Math.abs(landed.z - to.z)).toBeLessThan(TOLERANCE);
    });
  });

  // ─── simulatePosition ───
  describe('simulatePosition', () => {
    it('returns pos0 exactly at t=0', () => {
      const pos0 = new Vector3(1, 2, 3);
      const vel0 = new Vector3(4, 5, 6);
      const result = BallGuide.simulatePosition(pos0, vel0, 0, GRAVITY);
      expect(result.x).toBeCloseTo(pos0.x);
      expect(result.y).toBeCloseTo(pos0.y);
      expect(result.z).toBeCloseTo(pos0.z);
    });

    it('returns pos0 + vel0*t at small t (gravity contribution negligible)', () => {
      const pos0 = new Vector3(0, 0, 0);
      const vel0 = new Vector3(10, 0, 0);
      const t = 0.001;
      const result = BallGuide.simulatePosition(pos0, vel0, t, GRAVITY);
      // x must be very close to vel0.x * t
      expect(Math.abs(result.x - vel0.x * t)).toBeLessThan(0.0001);
    });

    it('y decreases over time due to gravity', () => {
      const pos0 = new Vector3(0, 10, 0);
      const vel0 = new Vector3(0, 0, 0);
      const pos1 = BallGuide.simulatePosition(pos0, vel0, 1, GRAVITY);
      const pos2 = BallGuide.simulatePosition(pos0, vel0, 2, GRAVITY);
      expect(pos1.y).toBeLessThan(pos0.y);
      expect(pos2.y).toBeLessThan(pos1.y);
    });

    it('matches kinematic formula: y = y0 + vy*t - 0.5*g*t^2', () => {
      const pos0 = new Vector3(0, 5, 0);
      const vel0 = new Vector3(2, 8, 3);
      const t = 0.5;
      const expected_y = pos0.y + vel0.y * t - 0.5 * GRAVITY * t * t;
      const result = BallGuide.simulatePosition(pos0, vel0, t, GRAVITY);
      expect(result.y).toBeCloseTo(expected_y, 5);
    });

    it('x and z are unaffected by gravity', () => {
      const pos0 = new Vector3(1, 5, 2);
      const vel0 = new Vector3(3, 0, 4);
      const t = 1.0;
      const result = BallGuide.simulatePosition(pos0, vel0, t, GRAVITY);
      expect(result.x).toBeCloseTo(pos0.x + vel0.x * t, 5);
      expect(result.z).toBeCloseTo(pos0.z + vel0.z * t, 5);
    });
  });

  // ─── timeToReachY ───
  describe('timeToReachY', () => {
    it('returns a positive time when ball is above target and descending', () => {
      const pos0 = new Vector3(0, 5, 0);
      const vel0 = new Vector3(0, -2, 0); // already moving down
      const targetY = 0;
      const t = BallGuide.timeToReachY(pos0, vel0, targetY, GRAVITY);
      expect(t).not.toBeNull();
      expect(t!).toBeGreaterThan(0);
    });

    it('ball position at returned time equals targetY within tolerance', () => {
      const pos0 = new Vector3(0, 3, 0);
      const vel0 = new Vector3(1, 5, 1); // initially going up
      const targetY = 0;
      const t = BallGuide.timeToReachY(pos0, vel0, targetY, GRAVITY);
      expect(t).not.toBeNull();
      const pos = BallGuide.simulatePosition(pos0, vel0, t!, GRAVITY);
      expect(Math.abs(pos.y - targetY)).toBeLessThan(0.001);
    });

    it('returns the larger root (descending pass, not ascending)', () => {
      const pos0 = new Vector3(0, 1, 0);
      const vel0 = new Vector3(0, 10, 0); // strong upward launch
      const targetY = 1; // same height as start
      const t = BallGuide.timeToReachY(pos0, vel0, targetY, GRAVITY);
      // Should return the time when ball comes back down (larger root)
      expect(t).not.toBeNull();
      const expectedT = (2 * vel0.y) / GRAVITY;
      expect(Math.abs(t! - expectedT)).toBeLessThan(0.001);
    });

    it('returns null when ball never reaches targetY below ground', () => {
      // Ball launched horizontally from y=1 with no vertical velocity,
      // asking for a targetY that would require going up
      const pos0 = new Vector3(0, 0, 0);
      const vel0 = new Vector3(1, 0, 0);
      const targetY = 10; // above pos0.y, impossible with downward gravity
      const t = BallGuide.timeToReachY(pos0, vel0, targetY, GRAVITY);
      expect(t).toBeNull();
    });
  });

  // ─── addVariance ───
  describe('addVariance', () => {
    it('returns exactly the target when accuracy=1.0 (no offset)', () => {
      const target = new Vector3(2, 0.76, 3);
      const result = BallGuide.addVariance(target, 1.0, 1.0);
      expect(result.x).toBeCloseTo(target.x);
      expect(result.y).toBeCloseTo(target.y);
      expect(result.z).toBeCloseTo(target.z);
    });

    it('y coordinate is unchanged regardless of accuracy', () => {
      const target = new Vector3(0, 1.5, 0);
      const r1 = BallGuide.addVariance(target, 2.0, 0.0);
      const r2 = BallGuide.addVariance(target, 2.0, 0.5);
      expect(r1.y).toBeCloseTo(target.y);
      expect(r2.y).toBeCloseTo(target.y);
    });

    it('returns a point within one zone radius of target when accuracy=0.0', () => {
      const target = new Vector3(0, 0, 0);
      const tableZoneHalfWidth = 3.0;
      const zoneRadius = tableZoneHalfWidth / 3; // max possible offset

      // Run multiple times because Math.random() is involved
      for (let i = 0; i < 20; i++) {
        const result = BallGuide.addVariance(target, tableZoneHalfWidth, 0.0);
        const dist = Math.sqrt(
          (result.x - target.x) ** 2 + (result.z - target.z) ** 2,
        );
        expect(dist).toBeLessThanOrEqual(zoneRadius + 1e-9);
      }
    });

    it('offset magnitude decreases as accuracy increases toward 1.0', () => {
      const target = new Vector3(0, 0, 0);
      const tableZoneHalfWidth = 6.0;

      // With accuracy=0.5, max offset = zoneRadius * 0.5
      const maxOffset05 = (tableZoneHalfWidth / 3) * 0.5;
      for (let i = 0; i < 20; i++) {
        const result = BallGuide.addVariance(target, tableZoneHalfWidth, 0.5);
        const dist = Math.sqrt(result.x ** 2 + result.z ** 2);
        expect(dist).toBeLessThanOrEqual(maxOffset05 + 1e-9);
      }
    });

    it('with accuracy=0.0 and small tableZoneHalfWidth, offset is small', () => {
      const target = new Vector3(5, 0, 5);
      const tableZoneHalfWidth = 0.3; // very narrow zone
      const zoneRadius = tableZoneHalfWidth / 3;

      const result = BallGuide.addVariance(target, tableZoneHalfWidth, 0.0);
      const dist = Math.sqrt(
        (result.x - target.x) ** 2 + (result.z - target.z) ** 2,
      );
      expect(dist).toBeLessThanOrEqual(zoneRadius + 1e-9);
    });
  });
});
