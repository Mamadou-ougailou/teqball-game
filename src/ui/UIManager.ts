import { Scene } from '@babylonjs/core/scene';
import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
import { Rectangle } from '@babylonjs/gui/2D/controls/rectangle';
import { TextBlock } from '@babylonjs/gui/2D/controls/textBlock';
import { Button } from '@babylonjs/gui/2D/controls/button';
import { StackPanel } from '@babylonjs/gui/2D/controls/stackPanel';
import { Control } from '@babylonjs/gui/2D/controls/control';
import { IEntity } from '@core/interfaces';
import { EventBus } from '@core/EventBus';
import { HUD } from './HUD';
import { PointAnnouncement } from './PointAnnouncement';
import type { PointScoredEvent } from './HUD';

/**
 * UIManager — owns the single AdvancedDynamicTexture for the in-match UI
 * and coordinates all UI layers (HUD, PointAnnouncement, etc.).
 *
 * Instantiate once after the scene is ready:
 *   const ui = new UIManager(scene);
 *
 * All score updates arrive automatically via EventBus 'match:pointScored'.
 */
export class UIManager implements IEntity {
  private readonly _adt: AdvancedDynamicTexture;
  private readonly _hud: HUD;
  private readonly _announcement: PointAnnouncement;

  private _gameOverContainer!: Rectangle;
  private _gameOverTitle!: TextBlock;

  private readonly _onPointScored: (data: unknown) => void;
  private readonly _onMatchEnd: (winningTeam: unknown) => void;

  constructor(scene: Scene) {
    // One fullscreen texture shared by every UI layer.
    this._adt = AdvancedDynamicTexture.CreateFullscreenUI('GameUI', true, scene);
    // Keep the scoreboard/HUD crisp: don't let any camera post-process (bloom)
    // bleed a glow onto the UI layer.
    if (this._adt.layer) this._adt.layer.applyPostProcess = false;

    this._hud = new HUD(this._adt);
    this._announcement = new PointAnnouncement(this._adt, scene);

    // UIManager drives the PointAnnouncement; HUD drives itself via its own listener.
    this._onPointScored = (data: unknown) => {
      this._announcement.announce(data as PointScoredEvent);
    };
    EventBus.on('match:pointScored', this._onPointScored);

    this._createGameOverUI();

    this._onMatchEnd = (winningTeam: unknown) => {
      const team = winningTeam as number;
      this._gameOverTitle.text = team === 0 ? "VICTOIRE !" : "DÉFAITE";
      this._gameOverTitle.color = team === 0 ? "#00ffff" : "#ff00ff";
      this._gameOverContainer.isVisible = true;
    };
    EventBus.on('match:end', this._onMatchEnd);
  }

  private _createGameOverUI(): void {
    this._gameOverContainer = new Rectangle('gameOverContainer');
    this._gameOverContainer.width = "400px";
    this._gameOverContainer.height = "300px";
    this._gameOverContainer.thickness = 0;
    this._gameOverContainer.background = "rgba(10, 10, 20, 0.85)";
    this._gameOverContainer.cornerRadius = 10;
    this._gameOverContainer.isVisible = false;
    this._gameOverContainer.verticalAlignment = Control.VERTICAL_ALIGNMENT_CENTER;
    this._gameOverContainer.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this._adt.addControl(this._gameOverContainer);

    const panel = new StackPanel('gameOverPanel');
    panel.isVertical = true;
    this._gameOverContainer.addControl(panel);

    this._gameOverTitle = new TextBlock('gameOverTitle', "GAME OVER");
    this._gameOverTitle.height = "80px";
    this._gameOverTitle.fontSize = 42;
    this._gameOverTitle.fontFamily = "Barlow Condensed, sans-serif";
    this._gameOverTitle.fontWeight = "bold";
    this._gameOverTitle.color = "white";
    panel.addControl(this._gameOverTitle);

    const restartBtn = Button.CreateSimpleButton("restartBtn", "REJOUER");
    restartBtn.width = "200px";
    restartBtn.height = "50px";
    restartBtn.color = "white";
    restartBtn.background = "#e05c2a";
    restartBtn.thickness = 0;
    restartBtn.cornerRadius = 5;
    restartBtn.fontFamily = "Barlow Condensed, sans-serif";
    restartBtn.fontWeight = "bold";
    restartBtn.paddingBottom = "10px";
    restartBtn.onPointerUpObservable.add(() => {
      this._gameOverContainer.isVisible = false;
      EventBus.emit('match:restart');
    });
    panel.addControl(restartBtn);

    const menuBtn = Button.CreateSimpleButton("menuBtn", "MENU PRINCIPAL");
    menuBtn.width = "200px";
    menuBtn.height = "40px";
    menuBtn.color = "white";
    menuBtn.background = "transparent";
    menuBtn.thickness = 1;
    menuBtn.cornerRadius = 5;
    menuBtn.fontFamily = "Barlow Condensed, sans-serif";
    menuBtn.onPointerUpObservable.add(() => {
      window.location.reload(); // Quick way to return to the landing page
    });
    panel.addControl(menuBtn);
  }

  show(_uiPage: string): void {
    // TODO Phase 3: switch between UI pages (menu, game, post-match)
  }

  hide(_uiPage: string): void {
    // TODO Phase 3
  }

  update(_deltaTime: number): void {
    // All updates are event-driven or scene-driven at this stage.
  }

  dispose(): void {
    EventBus.off('match:pointScored', this._onPointScored);
    EventBus.off('match:end', this._onMatchEnd);
    this._hud.dispose();
    this._announcement.dispose();
    this._adt.dispose();
  }
}
