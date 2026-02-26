# Manual QA Checklist

Use this checklist for manual testing at end of Phase 3 and Phase 6.

## Phase 3 - Core Gameplay Playable

### Before Starting
- [ ] All git branches merged to `dev`
- [ ] `npm run typecheck` passes (no TS errors)
- [ ] `npm run build` succeeds
- [ ] `npm test` passes all tests
- [ ] Latest `npm install` done

### Game Startup
- [ ] Game loads without console errors
- [ ] Loading screen displays and hides
- [ ] Main menu appears with Play button
- [ ] No missing textures (full pink = missing asset)

### Character Control
- [ ] Player 1 can move (WASD or arrow keys)
- [ ] Player 1 can jump (Space)
- [ ] Player 1 can kick (F or X gamepad)
- [ ] Player 2 can move (separate keybinds?)
- [ ] Player 2 can kick
- [ ] Animation transitions play smoothly

### Ball Physics
- [ ] Ball drops on scene start
- [ ] Ball bounces on table with realistic physics
- [ ] Kick applies force in correct direction
- [ ] Kick power varies with button hold time
- [ ] Ball stops (friction) after bouncing

### Match Logic
- [ ] Score displays on HUD
- [ ] Score increments when ball crosses net
- [ ] Serve resets after point
- [ ] Set win triggers (first to 25)
- [ ] Match end screen shows winner
- [ ] Play Again button resets match

### Rules Enforcement
- [ ] 3-touch rule prevents ball rollback (Point awarded to other team)
- [ ] Ball-out-of-bounds → other team scores
- [ ] Net touch resets touch counter
- [ ] Hand touch above net height → fault

### Audio
- [ ] Background music plays at start
- [ ] Kick SFX plays on ball contact
- [ ] Bounce SFX plays on table contact
- [ ] Score SFX plays on point
- [ ] No audio overlap glitches

### UI / HUD
- [ ] Score readable at all times
- [ ] Serve indicator shows current server
- [ ] Superpower cooldown bar displays
- [ ] Point announcement pops up briefly
- [ ] No text cutoff on screen edges

### Camera
- [ ] Camera follows both players (centered view)
- [ ] No clipping through arena
- [ ] Smooth lerp (not jittery)
- [ ] Works with keyboard and gamepad

### Input Devices
- [ ] Keyboard controls responsive
- [ ] Gamepad controls responsive (if plugged in)
- [ ] Input latency acceptable (< 50ms)
- [ ] No input spam/buffering issues

## Phase 6 - Visually Complete

### Visual Polish (extends Phase 3)

- [ ] Bloom effect on ball visible
- [ ] Ball trail particle effect plays
- [ ] Kick impact particles spawn
- [ ] Superpower activation particles match ability
- [ ] Post-processing doesn't cause performance drop

### Surreal Aesthetics
- [ ] Arena skybox is relevant to theme
- [ ] Fog creates depth perception
- [ ] Lighting mood matches arena (dark/bright)
- [ ] Character materials look intentional (not default)
- [ ] Overall color palette is cohesive

### UI Polish
- [ ] Menu buttons have hover states
- [ ] Menus animate in smoothly
- [ ] Character/Arena selectors show previews
- [ ] Score font is readable
- [ ] Cooldown rings have glow effect

### Audio Production
- [ ] Music matches arena vibe
- [ ] SFX volumes are balanced (not too loud/quiet)
- [ ] No audio latency (kick → kick sound simultaneous)
- [ ] Music crossfades smoothly between arenas

### Performance
- [ ] Steady 60 FPS on dev machine
- [ ] No hitches or stuttering during gameplay
- [ ] Load time < 10 seconds
- [ ] Memory usage stable (no creeping up)

### Accessibility
- [ ] Game works on 1920x1080 screens
- [ ] Game works on 2560x1440 screens (UHD)
- [ ] Text contrast passes minimum standards
- [ ] Colorblind mode testing (if implemented)

### Stability
- [ ] No crashes after 10 minutes of play
- [ ] No memory leaks over 1 hour session
- [ ] No console errors or warnings
- [ ] Glitches recoverable (no hard hang)

## Regression Testing

After each Phase, check that old features still work:

### Phase 3 Regression
- [ ] Ball physics still works
- [ ] Character control unchanged
- [ ] Rules still enforced
- [ ] Audio still plays

### Phase 6 Regression
- [ ] Everything from Phase 3 still works
- [ ] New VFX don't break gameplay
- [ ] UI doesn't overlap gameplay
- [ ] Performance not degraded

## Known Bugs / Limitations

Document any issues found and prioritize for next phase:

**Example:**
- Bug: Ball jitter at net (Havok time step tuning)
- Status: Logged for Phase 5 optimization
- Workaround: None

**Example:**
- Limitation: No mobile touch support
- Status: Planned for Phase 5
- Impact: Desktop only for now

## Reporting Issues

When you find a bug:

1. Describe steps to reproduce
2. Note expected vs actual behavior
3. Screenshot / video if helpful
4. Check browser console for errors
5. Create GitHub issue with `bug:` prefix

Example:
```
Bug: Ball falls through table at net edge

Steps:
1. Kick ball toward net
2. Observe ball trajectory
3. Expected: Ball bounces on net
4. Actual: Ball passes through mesh

Environment: Chrome 120, Windows 10
```

## Sign-Off

**Phase 3 QA Complete:** `Tester: _____ Date: _____`

**Phase 6 QA Complete:** `Tester: _____ Date: _____`

All critical bugs fixed before deployment.
