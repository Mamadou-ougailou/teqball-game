/**
 * Sfx — tiny sound-effect player for in-game one-shots (kick, crowd applause).
 *
 * Uses Howler (already a project dependency).  The audio files live under
 * `assets/audio/sfx/` (outside Vite's `public/` dir), so they are imported as
 * module assets — Vite then hashes/serves them and gives us the resolved URL.
 *
 * Browsers block audio until the first user gesture; the menu's "Commencer"
 * click satisfies that, so by the time a match is running playback is allowed.
 * Each call is wrapped defensively so a missing/blocked sound never throws into
 * the game loop.
 */
import { Howl } from 'howler';
import kickUrl from '../../assets/audio/sfx/kick.wav';
import applauseUrl from '../../assets/audio/sfx/crowd_applause.wav';

const kickSound = new Howl({ src: [kickUrl], volume: 0.6, preload: true });
const applauseSound = new Howl({ src: [applauseUrl], volume: 0.7, preload: true });

/** Short kick/strike one-shot.  Allows overlap so rapid rallies layer cleanly. */
export function playKickSfx(): void {
  try {
    kickSound.play();
  } catch {
    /* never let audio break gameplay */
  }
}

/** Crowd applause when a point is awarded. */
export function playApplauseSfx(): void {
  try {
    applauseSound.play();
  } catch {
    /* never let audio break gameplay */
  }
}
