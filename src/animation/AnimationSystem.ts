import { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { Skeleton } from '@babylonjs/core/Bones/skeleton';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';

// ---------------------------------------------------------------------------
// Animation clip name map
//
// Keys are logical action names used by Character.ts.
// Values are substrings of the AnimationGroup names that BabylonJS logs on
// load (check browser console for "[AnimationSystem] clip[N]: …" lines).
//
// These strings are matched case-insensitively against group.name so you
// don't need to type the exact Blender export name — a unique fragment works.
//
// Why not use indices?  The GLB was exported with 18 separate Mixamo armatures
// so the names are the only stable identifier.  retargetToSkeleton() below
// re-points every group's targets to skeleton 0 so all clips visually animate.
// ---------------------------------------------------------------------------
export const PLAYER_ANIM_NAMES: Record<string, string> = {
  idle:         'idle',
  jogForward:   'jogforward',
  jogBack:      'jogbackward',
  strafeLeft:   'jogstraferight',
  strafeRight:  'jogstraferight',
  reception:    'reception',
  serve:        'hearserve',
  kick2:        'kick',
  scissorKick:  'scissor',
  scissorKickLeft: 'scissor',
  header:       'headkick',
  headerBall1:  'hearserve',
  headerBall2:  'hearserve',
  jogBackDiag1: 'jogbackward',
  jogBackDiag2: 'jogbackward',
  jogFwdDiag1:  'jogforward',
  jogFwdDiag2:  'jogforward',
  kick1:        'kick',
  knee1:        'righttoefootreception',
  knee1Left:    'righttoefootreception',
  knee2:        'righttoefootreception',
  serveLeft:    'hearserve',
  serveRight:   'hearserve',
  chestKick:    'chest_kick',
  chestReception: 'chestreception',
  closeTableLowHeader: 'closetablelowheadkick',
  closeTableKickRight: 'closetablerightfootkick',
  highKickLeft: 'highkickleftfoot',
  runningForward: 'jogforward',
  joggingQuickForward: 'quickjogforward',
  joggingStrafeQuick: 'jogstraferight',
  kneeReceptionRight: 'righttoefootreception',
  soleKickRight: 'solerightfootkick',
  toeReceptionRight: 'righttoefootreception',
  bridgeReception1Left: 'jogforward.001',
  bridgeReception2Left: 'jogforward.001',
  bicycleKickLeft: 'bicycle',
  jumpingHeaderKick: 'jumpheadkick',
  extra:        'extra',
};

const PLAYER_ANIM_ALIASES: Record<string, string[]> = {
  idle: ['idle'],
  jogForward: ['jogforward', 'jog forward', 'running forward'],
  jogBack: ['jogbackward', 'jog backward', 'backward'],
  strafeLeft: ['jogstraferight', 'jog strafe right', 'strafe right'],
  strafeRight: ['jogstraferight', 'jog strafe right', 'strafe right'],
  reception: ['reception'],
  serve: ['hearserve', 'hear serve', 'serve'],
  kick2: ['kick'],
  scissorKick: ['scissor'],
  scissorKickLeft: ['scissor'],
  header: ['headkick'],
  headerBall1: ['hearserve'],
  headerBall2: ['hearserve'],
  jogBackDiag1: ['jogbackward'],
  jogBackDiag2: ['jogbackward'],
  jogFwdDiag1: ['jogforward'],
  jogFwdDiag2: ['jogforward'],
  kick1: ['kick'],
  knee1: ['righttoefootreception'],
  knee1Left: ['righttoefootreception'],
  knee2: ['righttoefootreception'],
  serveLeft: ['hearserve'],
  serveRight: ['hearserve'],
  chestKick: ['chest_kick'],
  chestReception: ['chestreception'],
  closeTableLowHeader: ['closetablelowheadkick'],
  closeTableKickRight: ['closetablerightfootkick'],
  highKickLeft: ['highkickleftfoot'],
  runningForward: ['jogforward'],
  joggingQuickForward: ['quickjogforward'],
  joggingStrafeQuick: ['jogstraferight'],
  kneeReceptionRight: ['righttoefootreception'],
  soleKickRight: ['solerightfootkick'],
  toeReceptionRight: ['righttoefootreception'],
  bridgeReception1Left: ['jogforward.001', 'innerrightfootreception'],
  bridgeReception2Left: ['jogforward.001', 'innerrightfootreception'],
  bicycleKickLeft: ['bicycle'],
  jumpingHeaderKick: ['jumpheadkick'],
  extra: ['extra'],
};

// Kept for backwards compatibility — all resolve to -1 (name lookup) now.
export const PLAYER_ANIM = Object.fromEntries(
  Object.keys(PLAYER_ANIM_NAMES).map(k => [k, -1])
) as Record<string, number>;

export type PlayerAnimKey = keyof typeof PLAYER_ANIM_NAMES;

const PLAYER_ANIM_ORDER: PlayerAnimKey[] = [
  'idle',
  'jogForward',
  'jogBack',
  'strafeLeft',
  'strafeRight',
  'header',
  'knee1',
  'knee1Left',
  'scissorKick',
  'scissorKickLeft',
  'kick2',
  'headerBall1',
  'headerBall2',
  'jogBackDiag1',
  'jogBackDiag2',
  'jogFwdDiag1',
  'jogFwdDiag2',
  'kick1',
  'knee2',
  'serveLeft',
  'serveRight',
  'chestKick',
  'chestReception',
  'closeTableLowHeader',
  'closeTableKickRight',
  'highKickLeft',
  'runningForward',
  'joggingQuickForward',
  'joggingStrafeQuick',
  'kneeReceptionRight',
  'soleKickRight',
  'toeReceptionRight',
  'bridgeReception1Left',
  'bridgeReception2Left',
  'bicycleKickLeft',
  'jumpingHeaderKick',
  'extra',
];

const NEYMAR_EXACT_INDEX_MAP: Partial<Record<PlayerAnimKey, number>> = {
  jogBack: 40,
  bicycleKickLeft: 2,
  bridgeReception1Left: 42,
  bridgeReception2Left: 42,
  chestKick: 31,
  chestReception: 32,
  closeTableLowHeader: 33,
  closeTableKickRight: 35,
  header: 36,
  headerBall1: 37,
  highKickLeft: 38,
  idle: 39,
  jogForward: 41,
  strafeLeft: 44,
  strafeRight: 44,
  jumpingHeaderKick: 45,
  joggingQuickForward: 46,
  knee1: 48,
  kneeReceptionRight: 48,
  runningForward: 41,
  serveLeft: 37,
  serveRight: 37,
  soleKickRight: 50,
  toeReceptionRight: 48,
};

const MOVEMENT_KEYS = new Set<PlayerAnimKey>([
  'idle',
  'jogForward',
  'jogBack',
  'strafeLeft',
  'strafeRight',
  'jogBackDiag1',
  'jogBackDiag2',
  'jogFwdDiag1',
  'jogFwdDiag2',
]);

const MOVEMENT_EXCLUDES = ['reception', 'receive', 'control', 'serve', 'kick', 'header', 'knee', 'scissor'];
const ACTION_EXCLUDES = ['jog', 'run', 'walk', 'strafe', 'move'];

/**
 * AnimationSystem — wraps a flat list of AnimationGroups loaded from a GLB
 * and provides a simple play-by-key API with instant-stop crossfade.
 *
 * Call AnimationSystem.retargetToSkeleton(groups, skeleton) BEFORE constructing
 * this class when the GLB contains multiple armatures (Blender Mixamo export).
 * This rewires every group's targets so they all drive the visible skeleton.
 */
export class AnimationSystem {
  private readonly _clips: AnimationGroup[];
  private _active: AnimationGroup | null = null;
  private _activeIndex = -1;
  private readonly _indexByKey = new Map<string, number>();

  // ---------------------------------------------------------------------------
  // Static helper — retarget shadow-armature animation groups to skeleton 0.
  //
  // Blender exports 18 Mixamo armatures → 18 GLB skeletons.  The visible mesh
  // is only skinned to skeleton 0.  Skeletons 1-17 have the same bone names but
  // with Blender's ".001", ".002" … suffixes on their TransformNodes.
  //
  // We strip that suffix and look up the matching TransformNode in skeleton 0,
  // then replace the target on each TargetedAnimation.  After this call every
  // group in the array will animate skeleton 0, making all clips visible.
  // ---------------------------------------------------------------------------
  static retargetToSkeleton(groups: AnimationGroup[], skeleton: Skeleton): void {
    // Build name → TransformNode from the primary skeleton
    const nodeByName = new Map<string, TransformNode>();
    for (const bone of skeleton.bones) {
      const node: TransformNode | null = bone.getTransformNode?.() ??
        (bone as any)._linkedTransformNode ?? null;
      if (node) {
        nodeByName.set(node.name, node);
        // Also index without the Blender uniqueness suffix (.001, .002 …)
        const base = node.name.replace(/\.\d+$/, '');
        if (!nodeByName.has(base)) nodeByName.set(base, node);
      }
    }

    // Group 0 already targets skeleton 0 — skip it.
    for (let i = 1; i < groups.length; i++) {
      let remapped = 0;
      for (const ta of groups[i].targetedAnimations) {
        const rawName: string = (ta.target as any).name ?? '';
        const base = rawName.replace(/\.\d+$/, '');
        const mapped = nodeByName.get(rawName) ?? nodeByName.get(base);
        if (mapped) {
          ta.target = mapped;
          remapped++;
        }
      }
      console.log(`[AnimationSystem] retarget group[${i}] "${groups[i].name}": ${remapped} targets remapped`);
    }
  }

  constructor(groups: AnimationGroup[]) {
    this._clips = groups;
    // Stop every group (Babylon auto-starts the first one on load)
    groups.forEach((g, i) => {
      g.stop();
      console.log(`[AnimationSystem] clip[${i}]: "${g.name}"`);
    });

    // Build a robust logical-key -> clip index mapping from GLB clip names.
    let mappedCount = 0;
    for (const key of Object.keys(PLAYER_ANIM_NAMES)) {
      const preferred = PLAYER_ANIM_NAMES[key]?.toLowerCase();
      const aliases = PLAYER_ANIM_ALIASES[key] ?? [];
      const candidates = preferred ? [preferred, ...aliases] : aliases;
      const idx = this._findBestClipIndex(
        candidates,
        MOVEMENT_KEYS.has(key as PlayerAnimKey) ? MOVEMENT_EXCLUDES : ACTION_EXCLUDES,
      );
      if (idx !== -1) {
        this._indexByKey.set(key, idx);
        mappedCount++;
        console.log(`[AnimationSystem] map "${key}" -> clip[${idx}] "${this._clips[idx].name}"`);
      } else {
        console.warn(`[AnimationSystem] no clip resolved for key "${key}"`);
      }
    }

    // Fallback for generic GLB names like "Armature.001|mixamo.com|Layer0":
    // bind unresolved logical actions to clip indices by export order.
    const max = Math.min(this._clips.length, PLAYER_ANIM_ORDER.length);
    if (mappedCount === 0) {
      console.warn('[AnimationSystem] no semantic clip names found; using full index-order fallback mapping');
    }
    for (let i = 0; i < max; i++) {
      const key = PLAYER_ANIM_ORDER[i];
      if (!this._indexByKey.has(key)) {
        this._indexByKey.set(key, i);
        console.log(`[AnimationSystem] fallback map "${key}" -> clip[${i}] "${this._clips[i].name}"`);
      }
    }

    if (this._looksLikeNeymarTrackSet()) {
      for (const [key, idx] of Object.entries(NEYMAR_EXACT_INDEX_MAP) as Array<[PlayerAnimKey, number]>) {
        if (idx >= 0 && idx < this._clips.length) {
          this._indexByKey.set(key, idx);
          console.log(`[AnimationSystem] neymar map "${key}" -> clip[${idx}] "${this._clips[idx].name}"`);
        }
      }
    }
  }

  private _looksLikeNeymarTrackSet(): boolean {
    if (this._clips.length < 30) return false;
    const names = this._clips.map(c => c.name);
    const hasBridge = names.some(n => n.toLowerCase().includes('bridgereceptionleftfoot'));
    const hasChest = names.some(n => n.toLowerCase().includes('chestreception'));
    const hasServe = names.some(n => n.toLowerCase().includes('serveleftfoot'));
    const hasIdle = names.some(n => n.toLowerCase().includes('idle'));
    return hasBridge && hasChest && hasServe && hasIdle;
  }

  private _findBestClipIndex(fragments: string[], excludedFragments: string[] = []): number {
    if (fragments.length === 0) return -1;

    let bestIndex = -1;
    let bestScore = -1;
    for (let i = 0; i < this._clips.length; i++) {
      const name = this._clips[i].name.toLowerCase();
      if (excludedFragments.some(fragment => fragment && name.includes(fragment))) {
        continue;
      }
      for (const fragment of fragments) {
        const f = fragment.trim().toLowerCase();
        if (!f) continue;
        if (name.includes(f)) {
          // Longer/more specific fragment gets higher score.
          const score = f.length;
          if (score > bestScore) {
            bestScore = score;
            bestIndex = i;
          }
        }
      }
    }
    return bestIndex;
  }

  /** Resolve logical key, raw name fragment, or index to a clip index. */
  private _resolve(keyOrIndex: PlayerAnimKey | string | number): number {
    if (typeof keyOrIndex === 'number') return keyOrIndex;

    const direct = this._indexByKey.get(String(keyOrIndex));
    if (direct !== undefined) return direct;

    const fragment = String(keyOrIndex).toLowerCase();
    const idx = this._findBestClipIndex([fragment]);
    if (idx === -1) {
      console.warn(`[AnimationSystem] no clip matching "${fragment}" for key "${keyOrIndex}"`);
    }
    return idx;
  }

  get activeIndex(): number { return this._activeIndex; }

  hasClip(keyOrIndex: PlayerAnimKey | string | number): boolean {
    const index = this._resolve(keyOrIndex);
    return index >= 0 && index < this._clips.length;
  }

  getClipNames(): string[] {
    return this._clips.map(c => c.name);
  }

  /**
   * Play animation by logical key, exact group name fragment, or raw index.
   * If the same clip is already playing, does nothing.
   */
  play(keyOrIndex: PlayerAnimKey | string | number, loop = true, speedRatio = 1.0, startFrameOffset = 0): void {
    const index = this._resolve(keyOrIndex);
    if (index < 0 || index >= this._clips.length) return;
    if (this._activeIndex === index) {
      if (this._active) this._active.speedRatio = speedRatio;
      return;  // already running; keep phase and only update rate
    }

    this._active?.stop();
    this._active      = this._clips[index];
    this._activeIndex = index;
    const safeOffset = Number.isFinite(startFrameOffset) ? Math.max(0, startFrameOffset) : 0;
    const safeStart = Math.min(this._active.to, this._active.from + safeOffset);
    this._active.start(loop, speedRatio, safeStart, this._active.to, false);
  }

  /** Play a one-shot animation, then automatically revert to a loop clip. */
  playOnce(
    keyOrIndex: PlayerAnimKey | string | number,
    thenPlay: PlayerAnimKey | string | number = 'idle',
    speedRatio = 1.0,
    onEnd?: () => void,
    startFrameOffset = 0,
  ): void {
    const index = this._resolve(keyOrIndex);
    if (index < 0 || index >= this._clips.length) return;

    this._active?.stop();
    const clip = this._clips[index];
    this._active      = clip;
    this._activeIndex = index;

    clip.onAnimationGroupEndObservable.addOnce(() => {
      onEnd?.();
      this.play(thenPlay);
    });

    const safeOffset = Number.isFinite(startFrameOffset) ? Math.max(0, startFrameOffset) : 0;
    const safeStart = Math.min(clip.to, clip.from + safeOffset);
    clip.start(false, speedRatio, safeStart, clip.to, false);
  }

  playByIndex(index: number, loop = true, speedRatio = 1.0, startFrameOffset = 0): void {
    this.play(index, loop, speedRatio, startFrameOffset);
  }

  playByIndexOnce(
    index: number,
    thenPlay: PlayerAnimKey | string | number = 'idle',
    speedRatio = 1.0,
    onEnd?: () => void,
    startFrameOffset = 0,
  ): void {
    this.playOnce(index, thenPlay, speedRatio, onEnd, startFrameOffset);
  }

  stop(): void {
    this._active?.stop();
    this._active      = null;
    this._activeIndex = -1;
  }

  update(_deltaTime: number): void {}

  dispose(): void {
    this.stop();
  }
}
