# Rally & Animation Redesign — Master Task Plan

> **Status:** decisions locked — executing milestone by milestone on `dev`.

---

## Locked decisions (from §5 Q&A)

| # | Question | Decision |
|---|----------|----------|
| B1 | Moving during reception/prep | Automation stays active; D-pad fine-tunes target position |
| B2 | Ball height after touch 1 | Fixed preparation height (arcade) |
| B3 | Ball height after touch 2 | High enough to allow player to choose any kick type |
| C1 | D-pad during kick | L/R = horizontal aim; up/down = nothing (loft set by kick clip) |
| C2 | Kick button model | Hold-to-charge + release; power proportional to hold duration |
| C3 | Missed kick | Auto-kick with conservative shot after grace period (~2.5 s) |
| C4 | Early kick | Can kick at touch 2 or 3; touch 1 is intentionally unpredictable |
| D2 | Gamepad | Keyboard only for MVP |
| D3 | Player modes | Human vs AI default; 2×AI also supported (ENABLE_P1_AI flag) |
| F1 | Character model | Neymar GLB, no re-export — keep existing retarget/substring approach |
| F2 | Single armature | No — keep 18-armature retarget |
| F3 | Characters | One character (neymar) for now |
| F5 | Anim blending | Deferred to polish pass |
| G1 | Deadline | A few days |
| G3 | Superpowers/VFX | Later — not in this rewrite |
| H1 | Tests | Fix existing Vitest tests as the refactor touches them |

---

## Milestone status

| # | Milestone | Status |
|---|-----------|--------|
| 0 | Merge & baseline | ✅ done |
| 1 | Rules reconciliation (20 pts / every 4 pts / best of 3) | ✅ done |
| 2 | InputManager real (wraps pressedKeys, gameplay reads migrated) | ✅ done |
| 3 | RallyController extraction | ⬜ deferred (risky; defer until gameplay is stable) |
| 4 | BallDirector (hybrid arcs) | ⬜ deferred (same reason) |
| 5 | Player-controlled kick (hold-to-charge, aim, grace period) | 🔄 in progress |
| 6 | Animation map per character (neymar JSON) | ⬜ next |
| 7 | Missing teqball rules (service rotation, double fault) | ⬜ next |
| 8 | Polish (audio cues, power meter, fault overlays) | ⬜ later |

---

## 1. Current repo state

`src/main.ts` is a ~3 850-line monolith owning everything. Modules 3 and 4 (RallyController, BallDirector) would be extracted from it — deferred to keep the blast radius manageable with a few-day deadline.

---

## 2. Target gameplay model

Rally = at most 3 touches per side:

| Touch | Name | Control model |
|-------|------|---------------|
| 1 | Reception | **Auto** — always automated; ball lands unpredictably (hard to kick early) |
| 2 | Preparation | **Auto** (D-pad fine-tunes target); player may **hold Space early** to kick instead |
| 3 | Kick | **Hold Space to charge, release to fire**; L/R aims; auto-kick after 2.5 s grace |

Ball: hybrid physics. Reception + preparation use scripted arcs (`ENABLE_BALL_ASSIST`). Kick is assisted (target clamped to opponent side). Free physics between touches.

---

## 3. Kick system detail (C2 + C3 + C4)

### Hold-to-charge model
- **Press Space** → start charge timer, play anticipation anim if idle
- **Release Space** → commit kick; hold duration maps to power preset:
  - < 0.3 s → `CONTROL` (220)
  - < 0.7 s → `LOW` (420)
  - < 1.2 s → `MEDIUM` (620)
  - < 2.0 s → `HIGH` (840)
  - ≥ 2.0 s → `SUPER_HIGH` (980)
- Visual feedback: a CSS power meter bar shown while charging

### Grace-period auto-kick (C3)
- Kick phase entered → start 2.5 s grace timer
- If player has not released Space before timer fires → auto-kick at CONTROL power, center aim

### Early kick at touch 2 (C4)
- Space hold during `'preparation'` phase triggers an early kick
- Touch 1 (`'reception'`) is intentionally unpredictable (auto only, ball lands in a randomised position in the preparation zone)

---

## 4. Animation map (Milestone 6)

Keep the 18-armature retarget and `NEYMAR_EXACT_INDEX_MAP` (no re-export). Add a
`src/data/characters/neymar.json` that encodes the same data as JSON so
`AnimationSystem` can load it per-character rather than hard-coding it. `PLAYER_ANIM_NAMES`
and `NEYMAR_EXACT_INDEX_MAP` become the fallback defaults.

AnimationSystem constructor gains an optional `CharacterAnimData` param:
```ts
interface CharacterAnimData {
  keyMap?: Record<string, string>;   // logical key → clip name fragment
  indexMap?: Record<string, number>; // logical key → exact clip index (overrides keyMap)
}
```

---

## 5. Missing rules (Milestone 7)

- **Service rotation every 4 points** — `MatchManager.recordPoint` currently sets server = scorer; replace with modular 4-point rotation.
- **Double fault** — after 2 consecutive failed serves, opponent scores. Track `consecutiveFailedServes` in serve state.
- **Win-by-2** — already implemented in `RuleEngine.recordPoint`; verify `MatchManager` mirrors it.
