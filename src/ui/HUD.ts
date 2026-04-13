import { IEntity } from '@core/interfaces';

/**
 * HUD - In-match overlay (score, serve indicator, superpower cooldown)
 */
export class HUD implements IEntity {
  private readonly root: HTMLDivElement | null;
  private readonly scoreLine: HTMLDivElement | null;
  private readonly setsLine: HTMLDivElement | null;
  private readonly serveLine: HTMLDivElement | null;
  private readonly cooldownLine: HTMLDivElement | null;
  private score: [number, number] = [0, 0];
  private sets: [number, number] = [0, 0];
  private server = 0;
  private matchActive = true;

  constructor() {
    if (typeof document === 'undefined') {
      this.root = null;
      this.scoreLine = null;
      this.setsLine = null;
      this.serveLine = null;
      this.cooldownLine = null;
      return;
    }

    const root = document.createElement('div');
    root.style.position = 'fixed';
    root.style.left = '16px';
    root.style.top = '16px';
    root.style.zIndex = '20';
    root.style.padding = '12px 14px';
    root.style.borderRadius = '14px';
    root.style.background = 'rgba(8, 12, 20, 0.68)';
    root.style.backdropFilter = 'blur(10px)';
    root.style.color = '#f7fbff';
    root.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    root.style.fontSize = '14px';
    root.style.lineHeight = '1.35';
    root.style.letterSpacing = '0.02em';
    root.style.boxShadow = '0 14px 30px rgba(0, 0, 0, 0.28)';
    root.style.pointerEvents = 'none';

    const scoreLine = document.createElement('div');
    scoreLine.style.fontSize = '22px';
    scoreLine.style.fontWeight = '700';
    scoreLine.style.marginBottom = '4px';

    const setsLine = document.createElement('div');
    setsLine.style.opacity = '0.9';

    const serveLine = document.createElement('div');
    serveLine.style.opacity = '0.9';

    const cooldownLine = document.createElement('div');
    cooldownLine.style.marginTop = '6px';
    cooldownLine.style.opacity = '0.78';
    cooldownLine.style.fontSize = '12px';

    root.append(scoreLine, setsLine, serveLine, cooldownLine);
    document.body.appendChild(root);

    this.root = root;
    this.scoreLine = scoreLine;
    this.setsLine = setsLine;
    this.serveLine = serveLine;
    this.cooldownLine = cooldownLine;
    this.render();
  }

  updateScore(_team: number, _points: number): void {
    const team = _team === 0 ? 0 : 1;
    this.score[team] = Math.max(0, Math.floor(_points));
    this.render();
  }

  updateCooldown(_ability: string, _percent: number): void {
    if (this.cooldownLine) {
      const percent = Math.max(0, Math.min(100, Math.round(_percent * 100)));
      this.cooldownLine.textContent = `${_ability}: ${percent}%`;
    }
  }

  renderMatchState(score: [number, number], sets: [number, number], server: number, matchActive: boolean): void {
    this.score = [score[0], score[1]];
    this.sets = [sets[0], sets[1]];
    this.server = server === 0 ? 0 : 1;
    this.matchActive = matchActive;
    this.render();
  }

  private render(): void {
    if (!this.scoreLine || !this.setsLine || !this.serveLine) {
      return;
    }

    this.scoreLine.textContent = `P1 ${this.score[0]}  -  ${this.score[1]} P2`;
    this.setsLine.textContent = `Sets ${this.sets[0]} - ${this.sets[1]}`;
    this.serveLine.textContent = this.matchActive ? `Serve: P${this.server + 1}` : 'Match complete';
  }

  update(_deltaTime: number): void {
  }

  dispose(): void {
    this.root?.remove();
  }
}
