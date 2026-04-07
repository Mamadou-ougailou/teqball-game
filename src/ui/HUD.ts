import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock';
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';
import { StackPanel } from '@babylonjs/gui/2D/controls/stackPanel';
import { Control } from '@babylonjs/gui/2D/controls/control';
import { IEntity } from '@core/interfaces';
import { EventBus } from '@core/EventBus';

/**
 * Payload emitted on 'match:pointScored'.
 * team: 1-based (1 = left player, 2 = right player).
 */
export interface PointScoredEvent {
  team: 1 | 2;
  score: [number, number]; // [p1Points, p2Points] in current set
  sets: [number, number];  // [p1Sets, p2Sets]
}

/**
 * HUD — top-center score bar showing per-set points and set count.
 * Subscribes to 'match:pointScored' on the EventBus and refreshes automatically.
 */
export class HUD implements IEntity {
  private _container!: Rectangle;
  private _p1ScoreText!: TextBlock;
  private _p2ScoreText!: TextBlock;
  private _setCounterText!: TextBlock;

  private readonly _onPointScored: (data: unknown) => void;

  constructor(adt: AdvancedDynamicTexture) {
    this._buildUI(adt);

    this._onPointScored = (data: unknown) => {
      const e = data as PointScoredEvent;
      this._p1ScoreText.text = String(e.score[0]);
      this._p2ScoreText.text = String(e.score[1]);
      this._setCounterText.text = `${e.sets[0]}  —  ${e.sets[1]}`;
    };

    EventBus.on('match:pointScored', this._onPointScored);
  }

  private _buildUI(adt: AdvancedDynamicTexture): void {
    // ── Outer background bar ───────────────────────────────────────────────
    const bg = new Rectangle('hudBg');
    bg.width = '380px';
    bg.height = '72px';
    bg.cornerRadius = 8;
    bg.color = 'transparent';
    bg.background = 'rgba(0, 0, 0, 0.58)';
    bg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    bg.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    bg.top = '10px';
    adt.addControl(bg);
    this._container = bg;

    // ── Horizontal row inside the bar ─────────────────────────────────────
    const row = new StackPanel('hudRow');
    row.isVertical = false;
    row.width = '360px';
    row.height = '72px';
    row.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    row.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    bg.addControl(row);

    // ── Player 1 column ───────────────────────────────────────────────────
    const p1Col = new StackPanel('p1Col');
    p1Col.isVertical = true;
    p1Col.width = '120px';
    p1Col.height = '72px';
    row.addControl(p1Col);

    const p1Label = new TextBlock('p1Label', 'PLAYER 1');
    p1Label.color = '#88bbff';
    p1Label.fontSize = 11;
    p1Label.fontFamily = 'monospace';
    p1Label.height = '22px';
    p1Label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    p1Col.addControl(p1Label);

    this._p1ScoreText = new TextBlock('p1Score', '0');
    this._p1ScoreText.color = 'white';
    this._p1ScoreText.fontSize = 32;
    this._p1ScoreText.fontWeight = 'bold';
    this._p1ScoreText.fontFamily = 'monospace';
    this._p1ScoreText.height = '46px';
    this._p1ScoreText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    p1Col.addControl(this._p1ScoreText);

    // ── Set counter column ────────────────────────────────────────────────
    const setCol = new StackPanel('setCol');
    setCol.isVertical = true;
    setCol.width = '120px';
    setCol.height = '72px';
    row.addControl(setCol);

    const setLabel = new TextBlock('setLabel', 'SET');
    setLabel.color = '#aaaaaa';
    setLabel.fontSize = 11;
    setLabel.fontFamily = 'monospace';
    setLabel.height = '22px';
    setLabel.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    setCol.addControl(setLabel);

    this._setCounterText = new TextBlock('setCounter', '0  —  0');
    this._setCounterText.color = '#ffdd88';
    this._setCounterText.fontSize = 20;
    this._setCounterText.fontWeight = 'bold';
    this._setCounterText.fontFamily = 'monospace';
    this._setCounterText.height = '46px';
    this._setCounterText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    setCol.addControl(this._setCounterText);

    // ── Player 2 column ───────────────────────────────────────────────────
    const p2Col = new StackPanel('p2Col');
    p2Col.isVertical = true;
    p2Col.width = '120px';
    p2Col.height = '72px';
    row.addControl(p2Col);

    const p2Label = new TextBlock('p2Label', 'PLAYER 2');
    p2Label.color = '#ffaa66';
    p2Label.fontSize = 11;
    p2Label.fontFamily = 'monospace';
    p2Label.height = '22px';
    p2Label.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    p2Col.addControl(p2Label);

    this._p2ScoreText = new TextBlock('p2Score', '0');
    this._p2ScoreText.color = 'white';
    this._p2ScoreText.fontSize = 32;
    this._p2ScoreText.fontWeight = 'bold';
    this._p2ScoreText.fontFamily = 'monospace';
    this._p2ScoreText.height = '46px';
    this._p2ScoreText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    p2Col.addControl(this._p2ScoreText);
  }

  /** Imperatively update one team's point score (0-based team index). */
  updateScore(team: number, points: number): void {
    if (team === 0) {
      this._p1ScoreText.text = String(points);
    } else {
      this._p2ScoreText.text = String(points);
    }
  }

  /** Imperatively update the set counter display. */
  updateSets(sets: [number, number]): void {
    this._setCounterText.text = `${sets[0]}  —  ${sets[1]}`;
  }

  updateCooldown(_ability: string, _percent: number): void {
    // TODO Phase 4: CooldownRing
  }

  update(_deltaTime: number): void {
    // Driven by EventBus — no per-frame work required.
  }

  dispose(): void {
    EventBus.off('match:pointScored', this._onPointScored);
    this._container.dispose();
  }
}
