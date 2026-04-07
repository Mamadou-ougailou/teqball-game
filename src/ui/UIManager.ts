import { Scene } from '@babylonjs/core/scene';
import { AdvancedDynamicTexture } from '@babylonjs/gui/2D/advancedDynamicTexture';
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

  private readonly _onPointScored: (data: unknown) => void;

  constructor(scene: Scene) {
    // One fullscreen texture shared by every UI layer.
    this._adt = AdvancedDynamicTexture.CreateFullscreenUI('GameUI', true, scene);

    this._hud = new HUD(this._adt);
    this._announcement = new PointAnnouncement(this._adt, scene);

    // UIManager drives the PointAnnouncement; HUD drives itself via its own listener.
    this._onPointScored = (data: unknown) => {
      this._announcement.announce(data as PointScoredEvent);
    };
    EventBus.on('match:pointScored', this._onPointScored);
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
    this._hud.dispose();
    this._announcement.dispose();
    this._adt.dispose();
  }
}
