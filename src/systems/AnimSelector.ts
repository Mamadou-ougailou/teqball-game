import { Vector3 } from '@babylonjs/core/Maths/math.vector';

export type TouchPhase = 'reception' | 'preparation' | 'kick';

export interface AnimSelection {
  clipKey: string;   // key for ANIM_CONFIG / character keyMap
  mirrorX: boolean;  // whether to mirror the animation
}

/** Height thresholds (metres above tableTopY) */
const LOW_MID_THRESHOLD   = 0.6;
const MID_HIGH_THRESHOLD  = 1.2;
const HIGH_VERY_THRESHOLD = 1.8;

export class AnimSelector {
  /**
   * Select reception animation based on ball arrival Y height and X position.
   * Spec section 5.2 table:
   *   Low (< 0.6m above tableTopY): prefer foot matching ball X side
   *     - ball X < 0 (left): innerleftfootreception, else innerrightfootreception
   *   Mid (0.6–1.2m): rightkneereception or leftkneereception (prefer matching side)
   *   High (1.2–1.8m): chestreception
   *   VeryHigh (> 1.8m): rightkneereception or chestreception
   *
   * @param ballArrivalPos - predicted world position when ball arrives
   * @param tableTopY - table surface Y (from SceneMetrics)
   */
  static selectReception(ballArrivalPos: Vector3, tableTopY: number): AnimSelection {
    const heightAboveTable = ballArrivalPos.y - tableTopY;

    if (heightAboveTable < LOW_MID_THRESHOLD) {
      // Low: foot matching ball X side
      if (ballArrivalPos.x < 0) {
        return { clipKey: 'innerleftfootreception', mirrorX: false };
      }
      return { clipKey: 'innerrightfootreception', mirrorX: false };
    }

    if (heightAboveTable < MID_HIGH_THRESHOLD) {
      // Mid: knee matching side
      if (ballArrivalPos.x < 0) {
        return { clipKey: 'leftkneereception', mirrorX: false };
      }
      return { clipKey: 'rightkneereception', mirrorX: false };
    }

    if (heightAboveTable < HIGH_VERY_THRESHOLD) {
      // High: chest reception
      return { clipKey: 'chestreception', mirrorX: false };
    }

    // VeryHigh (> 1.8m): rightkneereception or chestreception — prefer chest at extreme height
    if (heightAboveTable > HIGH_VERY_THRESHOLD + 0.3) {
      return { clipKey: 'chestreception', mirrorX: false };
    }
    return { clipKey: 'rightkneereception', mirrorX: false };
  }

  /**
   * Select preparation animation based on intended kick side.
   * Spec section 5.3: chestprepleft or chestprepright
   *
   * @param ballPeakX - X of ball at its arc peak
   * @param kickSide - 'left' | 'right' — intended kick side
   */
  static selectPreparation(_ballPeakX: number, kickSide: 'left' | 'right'): AnimSelection {
    if (kickSide === 'left') {
      return { clipKey: 'chestprepleft', mirrorX: false };
    }
    return { clipKey: 'chestprepright', mirrorX: false };
  }

  /**
   * Select kick animation based on ball height and X zone at kick moment.
   * Spec section 5.5 table:
   *   Low (< 0.6m above tableTopY): rightfootkick (center/right) or leftfootkick (left)
   *   Mid (0.6–1.2m): rightfootkick (center/right) or leftfootkick (left)
   *   High (1.2–1.8m):
   *     - center: chestkick
   *     - left: leftheadkick
   *     - right: rightheadkick
   *   VeryHigh (> 1.8m):
   *     - center: centerheadkick
   *     - left: leftheadkick
   *     - right: rightheadkick
   *
   * @param ballPos - ball world position at kick moment
   * @param tableTopY - table surface Y
   * @param targetZoneX - X center of target table zone (negative = left side)
   */
  static selectKick(ballPos: Vector3, tableTopY: number, targetZoneX: number): AnimSelection {
    const heightAboveTable = ballPos.y - tableTopY;

    // Classify horizontal zone based on ball's X position
    const CENTER_THRESHOLD = 0.4;
    const isLeft   = ballPos.x < -CENTER_THRESHOLD;
    const isRight  = ballPos.x >  CENTER_THRESHOLD;
    // isCenter = neither left nor right

    if (heightAboveTable < LOW_MID_THRESHOLD) {
      // Low
      if (isLeft) {
        return { clipKey: 'leftfootkick', mirrorX: false };
      }
      return { clipKey: 'rightfootkick', mirrorX: false };
    }

    if (heightAboveTable < MID_HIGH_THRESHOLD) {
      // Mid — same foot rule as Low
      if (isLeft) {
        return { clipKey: 'leftfootkick', mirrorX: false };
      }
      return { clipKey: 'rightfootkick', mirrorX: false };
    }

    if (heightAboveTable < HIGH_VERY_THRESHOLD) {
      // High
      if (isLeft) {
        return { clipKey: 'leftheadkick', mirrorX: false };
      }
      if (isRight) {
        return { clipKey: 'rightheadkick', mirrorX: false };
      }
      // center
      return { clipKey: 'chestkick', mirrorX: false };
    }

    // VeryHigh
    if (isLeft) {
      return { clipKey: 'leftheadkick', mirrorX: false };
    }
    if (isRight) {
      return { clipKey: 'rightheadkick', mirrorX: false };
    }
    // center
    return { clipKey: 'centerheadkick', mirrorX: false };
  }

  /**
   * Select a random serve animation from the four available.
   * Returns one of: 'serveleftfoot', 'serverightfoot', 'headserveleft', 'headserveright'
   */
  static selectServe(): AnimSelection {
    const serves: string[] = [
      'serveleftfoot',
      'serverightfoot',
      'headserveleft',
      'headserveright',
    ];
    const idx = Math.floor(Math.random() * serves.length);
    return { clipKey: serves[idx], mirrorX: false };
  }

  /**
   * Return preferred opponent table-zone column IDs for a given clip key.
   * Used by ZoneSelector for the ×2.0 preferred-zone multiplier (§11.1).
   * Returns an array of zone IDs like ['NET_L','NET_C','EDGE_R',…].
   */
  static getPreferredZoneIds(clipKey: string): string[] {
    // Map clip keys to preferred table columns based on spec §5.5
    const PREFERRED: Record<string, string[]> = {
      // Foot kicks prefer the side matching the kicking foot
      leftfootkick:  ['EDGE_L', 'NET_L'],
      rightfootkick: ['EDGE_R', 'NET_R'],
      // Head kicks spread wider
      leftheadkick:  ['EDGE_C', 'NET_C', 'EDGE_L'],
      rightheadkick: ['EDGE_C', 'NET_C', 'EDGE_R'],
      centerheadkick: ['EDGE_C', 'NET_C'],
      // Chest kick prefers center
      chestkick:     ['EDGE_C', 'NET_C'],
      // Serves target farthest zone
      serveleftfoot:  ['EDGE_R', 'NET_R'],
      serverightfoot: ['EDGE_L', 'NET_L'],
      headserveleft:  ['EDGE_R', 'NET_R'],
      headserveright: ['EDGE_L', 'NET_L'],
    };
    return PREFERRED[clipKey] ?? [];
  }
}
