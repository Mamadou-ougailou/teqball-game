import { IEntity } from '@core/interfaces';

/**
 * PointAnnouncement - Full-screen overlay when point scored
 */
export class PointAnnouncement implements IEntity {
  private readonly root: HTMLDivElement | null;
  private readonly label: HTMLDivElement | null;
  private hideTimer = 0;

  constructor() {
    if (typeof document === 'undefined') {
      this.root = null;
      this.label = null;
      return;
    }

    const root = document.createElement('div');
    root.style.position = 'fixed';
    root.style.inset = '0';
    root.style.display = 'flex';
    root.style.alignItems = 'center';
    root.style.justifyContent = 'center';
    root.style.zIndex = '19';
    root.style.pointerEvents = 'none';
    root.style.opacity = '0';
    root.style.transition = 'opacity 180ms ease';

    const label = document.createElement('div');
    label.style.padding = '18px 26px';
    label.style.borderRadius = '999px';
    label.style.background = 'rgba(255, 255, 255, 0.9)';
    label.style.color = '#10141d';
    label.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    label.style.fontSize = '28px';
    label.style.fontWeight = '800';
    label.style.letterSpacing = '0.08em';
    label.style.textTransform = 'uppercase';
    label.style.boxShadow = '0 18px 36px rgba(0, 0, 0, 0.28)';

    root.appendChild(label);
    document.body.appendChild(root);

    this.root = root;
    this.label = label;
  }

  announce(team: number, points: number): void {
    if (!this.root || !this.label) {
      return;
    }

    this.label.textContent = `P${team + 1} scores ${points}`;
    this.root.style.opacity = '1';
    this.hideTimer = 1.2;
  }

  update(_deltaTime: number): void {
    if (!this.root) {
      return;
    }

    if (this.hideTimer > 0) {
      this.hideTimer = Math.max(0, this.hideTimer - _deltaTime);
      if (this.hideTimer <= 0) {
        this.root.style.opacity = '0';
      }
    }
  }

  dispose(): void {
    this.root?.remove();
  }
}
