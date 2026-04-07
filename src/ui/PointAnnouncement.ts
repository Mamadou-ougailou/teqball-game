import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock';
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';
import { Control } from '@babylonjs/gui/2D/controls/control';
import { Animation } from '@babylonjs/core/Animations/animation';
import { Scene } from '@babylonjs/core/scene';
import { IEntity } from '@core/interfaces';
import type { PointScoredEvent } from './HUD';

/**
 * PointAnnouncement — full-screen overlay that fades in when a point is scored
 * then fades out after ~2 seconds using a BabylonJS Animation on the alpha property.
 *
 * Timeline (60 fps):
 *   frame   0 → alpha 0.0  (hidden)
 *   frame   6 → alpha 1.0  (fully visible, ~100 ms)
 *   frame 100 → alpha 1.0  (hold for ~1.6 s)
 *   frame 120 → alpha 0.0  (fade out over ~330 ms)
 */
export class PointAnnouncement implements IEntity {
  private readonly _scene: Scene;
  private _container!: Rectangle;
  private _titleText!: TextBlock;
  private _subtitleText!: TextBlock;

  // Returned by scene.beginDirectAnimation — kept so we can cancel on re-trigger.
  private _activeAnim: ReturnType<Scene['beginDirectAnimation']> | null = null;

  constructor(adt: AdvancedDynamicTexture, scene: Scene) {
    this._scene = scene;
    this._buildUI(adt);
  }

  private _buildUI(adt: AdvancedDynamicTexture): void {
    const bg = new Rectangle('announceBg');
    bg.width = '520px';
    bg.height = '130px';
    bg.cornerRadius = 14;
    bg.color = 'transparent';
    bg.background = 'rgba(0, 0, 0, 0.78)';
    bg.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    bg.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    bg.alpha = 0;
    bg.isVisible = false;
    adt.addControl(bg);
    this._container = bg;

    this._titleText = new TextBlock('announceTitle', '');
    this._titleText.color = 'white';
    this._titleText.fontSize = 36;
    this._titleText.fontWeight = 'bold';
    this._titleText.fontFamily = 'monospace';
    this._titleText.top = '-22px';
    this._titleText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this._titleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    bg.addControl(this._titleText);

    this._subtitleText = new TextBlock('announceSubtitle', '');
    this._subtitleText.color = '#cccccc';
    this._subtitleText.fontSize = 20;
    this._subtitleText.fontFamily = 'monospace';
    this._subtitleText.top = '28px';
    this._subtitleText.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this._subtitleText.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    bg.addControl(this._subtitleText);
  }

  /**
   * Display the announcement for the scoring team.
   * Safe to call while a previous announcement is still animating.
   */
  announce(event: PointScoredEvent): void {
    // Cancel any in-progress fade so we restart cleanly.
    if (this._activeAnim) {
      this._activeAnim.stop();
      this._activeAnim = null;
    }

    const teamColor = event.team === 1 ? '#88bbff' : '#ffaa66';
    this._titleText.text = `PLAYER ${event.team} SCORES!`;
    this._titleText.color = teamColor;
    this._subtitleText.text =
      `${event.score[0]}  —  ${event.score[1]}   (Sets ${event.sets[0]}–${event.sets[1]})`;

    this._container.alpha = 0;
    this._container.isVisible = true;

    const anim = new Animation(
      'pointAnnounceAlpha',
      'alpha',
      60,
      Animation.ANIMATIONTYPE_FLOAT,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
    );
    anim.setKeys([
      { frame: 0,   value: 0 },
      { frame: 6,   value: 1 },  // appear in ~100 ms
      { frame: 100, value: 1 },  // hold for ~1.6 s
      { frame: 120, value: 0 },  // fade out over ~330 ms
    ]);

    this._activeAnim = this._scene.beginDirectAnimation(
      this._container,
      [anim],
      0,
      120,
      false, // no loop
      1,     // normal speed
      () => {
        this._container.isVisible = false;
        this._activeAnim = null;
      },
    );
  }

  update(_deltaTime: number): void {
    // Animation is ticked by the scene — nothing to do here.
  }

  dispose(): void {
    if (this._activeAnim) {
      this._activeAnim.stop();
      this._activeAnim = null;
    }
    this._container.dispose();
  }
}
