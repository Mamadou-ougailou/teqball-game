# Onboarding Guide

Welcome to the Surrealistic Teqball team! This guide will get you up and running in 15 minutes.

## Prerequisites

Install these first:

- **Node.js 18+** - https://nodejs.org
- **Git** - https://git-scm.com
- **Git LFS** - https://git-lfs.github.com
- **VS Code** - https://code.visualstudio.com
- **VS Code Extensions:**
  - ESLint
  - Prettier
  - TypeScript Vue Plugin (or similar)

## Step 1: Clone & Setup (5 min)

```bash
# Clone repo
git clone https://github.com/yourorg/teqball-game
cd teqball-game

# Setup Git LFS
git lfs install

# Install dependencies
npm install

# Verify setup
npm run typecheck
npm run lint

# Start dev server
npm run dev
```

If you see a localhost link with the 3D scene, ✅ you're ready!

## Step 2: Understand the Structure (5 min)

```
src/
  core/          ← Engine, interfaces, constants (Dev A)
  systems/       ← Input, physics, camera (All devs)
  entities/      ← Ball, character, arena (All devs)
  gameplay/      ← Match logic, rules (Dev A + C)
  animation/     ← Animation system (Dev B)
  vfx/          ← Particles, shaders, trails (Dev B)
  ui/           ← Menus, HUD (Dev C)
  audio/        ← Sounds, music (Dev C)
  data/         ← JSON configs (Dev C)
```

**Key Principle:** Everything communicates via **EventBus**. Never call another system directly.

Example:
```ts
// ❌ DON'T: Direct call
matchManager.recordPoint(1);

// ✅ DO: Via EventBus
EventBus.emit('match:point_scored', { team: 1 });
```

## Step 3: Your First Task (5 min)

Based on your role:

### Dev A - Game Logic
1. Read `docs/architecture.md` - understand the system design
2. Open `src/core/interfaces.ts` - these are your contracts
3. Open `src/gameplay/RuleEngine.ts` - pure function example
4. Task: Add a new test to `tests/ruleEngine.test.ts`
   ```bash
   npm run test:watch
   ```

### Dev B - Graphics & Animation
1. Read `docs/asset-guidelines.md` - asset workflow
2. Open `src/vfx/VFXSystem.ts` stub
3. Check out BabylonJS NME: https://www.babylonjs.com/nme
4. Task: Create a simple particle effect JSON file

### Dev C - UI & Audio
1. Read `README.md` - overview of game flow
2. Open `src/ui/HUD.ts` and `src/audio/AudioSystem.ts` stubs
3. Check `src/data/` - see how configs are structured
4. Task: Add a new UI screen (CharacterSelect.ts is a template)

## Common Commands

```bash
# Development
npm run dev           # Start dev server with hot-reload
npm run typecheck     # Find type errors
npm run lint          # Check code style
npm run lint:fix      # Auto-fix linting

# Testing
npm test              # Run all tests once
npm run test:watch    # Watch tests (re-run on file change)

# Building
npm run build         # Build for production
npm run preview       # Preview prod build locally

# Formatting
npm run format        # Auto-format code (run before commit!)
```

## Git Workflow

### Start a New Feature

```bash
# Get latest dev code
git checkout dev
git pull origin dev

# Create feature branch
git checkout -b feature/your-task-name

# Make changes, commit often
git add .
git commit -m "feat: implement ball physics"

# Push when ready
git push -u origin feature/your-task-name
```

### Commit Messages

Use these prefixes:

```
feat:   new feature
fix:    bug fix
chore:  tooling/config
assets: add/update .glb, textures, audio
test:   add/modify tests
docs:   README or documentation
```

Example:
```bash
git commit -m "feat: implement GravityFlip ability with cooldown"
git commit -m "assets: add cloud_arena.glb (Draco optimized)"
```

### Create a Pull Request

1. Push your branch
2. Go to GitHub repo
3. Click "New Pull Request"
4. Fill in:
   - What changed
   - Which system affected
   - Tested locally? Yes/no
5. Assign reviewer (another dev)
6. Wait for CI and approval
7. Merge!

**Merge Checklist:**
- [ ] CI: lint, typecheck, build all pass
- [ ] Tests added/updated
- [ ] Code reviewed by teammate
- [ ] Commit messages clear

## TypeScript Tips

### Type Everything

```ts
// ❌ Bad
function update(delta) {
  // ...
}

// ✅ Good
function update(delta: number): void {
  // ...
}
```

### Use Interfaces

```ts
// From src/core/interfaces.ts
class MySystem implements IEntity {
  update(delta: number): void { }
  dispose(): void { }
}
```

### Avoid `any`

```ts
// ❌ Bad
const data: any = EventBus.getData();

// ✅ Good
interface GameData {
  position: Vector3;
  playerIndex: number;
}
const data: GameData = EventBus.getData();
```

### Check for Errors

```bash
# Catch issues before commit
npm run typecheck   # Find type errors
npm run lint        # Style issues
npm test            # Logic issues
```

## EventBus Examples

### Listening to Events

```ts
// When character spawns
EventBus.on('character:spawned', (data: { id: number; position: Vector3 }) => {
  console.log(`Character ${data.id} spawned at`, data.position);
});
```

### Firing Events

```ts
// When kick happens
EventBus.emit('ball:kicked', {
  velocity: new Vector3(10, 0, 5),
  kickerIndex: 0,
  power: 100,
});
```

### One-Time Event

```ts
// Listen for first goal only
EventBus.once('match:goal_scored', (team) => {
  console.log(`Team ${team} scored first!`);
});
```

## Debugging

### Console Logs

```ts
// Use debug constants
import { DEBUG_MODE } from '@core/constants';

if (DEBUG_MODE) {
  console.log('Ball velocity:', physics.velocity);
}
```

### Enable Physics Debug

```ts
// In src/core/constants.ts
export const DEBUG_DRAW_COLLISION = true;  // Shows collision shapes
```

### Use VS Code Debugger

Add breakpoint (click line number), run `npm run dev`, debug panel opens.

## Resources

- **BabylonJS Docs**: https://doc.babylonjs.com
- **Havok Physics**: https://www.havok.com/products/havok-physics-babylonjs
- **TypeScript Handbook**: https://www.typescriptlang.org/docs
- **Vite Guide**: https://vitejs.dev/guide

## Questions?

Check the `docs/` folder:
- `architecture.md` - system design deep dive
- `asset-guidelines.md` - how to prepare art/audio
- `qa-checklist.md` - testing and manual QA

Or ask a teammate in Discord/Slack!
