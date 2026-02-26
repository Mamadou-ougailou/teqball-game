# Surrealistic Teqball - 3D Web Game

A collaborative, browser-based 3D teqball game built with **BabylonJS**, **TypeScript**, and **Vite**.

## Quick Start

```bash
# Install dependencies
npm install

# Start dev server (opens browser automatically)
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Lint code
npm run lint
npm run lint:fix

# Format code
npm run format

# Type check
npm run typecheck
```

## Project Structure

```
src/
  core/              → Engine, Scene, Assets, EventBus, Interfaces, Constants
  systems/           → Input, Physics, Camera, Rendering
  entities/          → Character, Ball, Arena, Table
  gameplay/          → Match logic, Rules, Superpowers
  animation/         → Animation system and IK
  vfx/               → Particles, Shaders, Trails
  ui/                → HUD, Menus, Screens
  audio/             → Sound, Music
  data/              → JSON configs (characters, arenas, rules, abilities)

tests/               → Unit and integration tests (Vitest)

assets/              → Binary files (Git LFS tracked)
  models/            → .glb character and arena models
  textures/          → Compressed .ktx2 textures
  audio/             → .ogg music and SFX
  shaders/           → NodeMaterial JSON files
  particles/         → Particle system JSON files
  env/               → HDR environment maps

docs/                → Architecture, guidelines, onboarding
```

## Git Workflow (Section 15)

### Branch Strategy

| Branch     | Purpose                    | Created From | Merged To |
|-----------|----------------------------|----------|-----------|
| `main`    | Production (auto-deploy)   | Never direct | N/A |
| `dev`     | Integration/staging        | Never direct | `main` |
| `feature/*` | Task-specific work       | `dev` | `dev` |
| `fix/*`   | Bug fixes                  | `dev` | `dev` |
| `assets/*` | Large binaries            | `dev` | `dev` |

### Git LFS Setup

```bash
# Run once after clone
git lfs install
git lfs track '*.glb' '*.png' '*.jpg' '*.ktx2' '*.ogg' '*.mp3' '*.hdr'
```

### Daily Workflow

```bash
# Start work on a feature
git checkout dev && git pull origin dev
git checkout -b feature/your-task-name

# Commit with conventional messages
git commit -m "feat: describe your change"
# Prefixes: feat:, fix:, chore:, assets:, test:, docs:

# Push when ready
git push -u origin feature/your-task-name

# Create PR on GitHub (requires 1 approval + CI green)
```

### Merge Rules

- **Pull Requests Required**: No direct pushes to `dev` or `main`
- **CI Must Pass**: All tests, linting, build checks
- **Dev Merges**: Require 1 approval
- **Main Merges**: Require 2 approvals
- **Asset PRs**: Require Dev B approval for file size

## Developer Roles

### Dev A - Core Architecture & Logic
**Responsibilities:**
- `src/core/` - Engine, interfaces, constants
- `src/systems/` - Input, physics, collision
- `src/gameplay/` - Scoring, rules
- Match/rally logic
- CI/CD setup

**Initial Setup:**
- Initialize repo structure
- Create all STUB files (day 1)
- Setup ESLint, Prettier, TypeScript
- Setup GitHub Actions

### Dev B - 3D Graphics & Animation
**Responsibilities:**
- `src/systems/Camera*` and `RenderPipeline`
- `src/animation/` - Animation system
- `src/vfx/` - Particles, shaders, trails
- Assets: Models, textures, shaders
- Visual polish and effects

**Phase 1 Priority:**
- Load teqball_table.glb with physics
- Load character models with skeletons
- Setup camera following

### Dev C - UI, Audio & Game Feel
**Responsibilities:**
- `src/ui/` - All menus, HUD, overlays
- `src/audio/` - Sounds, music
- `src/data/` - JSON configs
- Game feel, audio synchronization
- QA and polish

**Phase 1 Priority:**
- UI scaffolds
- Audio and music management

## Testing Strategy

All unit tests in `tests/` directory. Run with:

```bash
npm test           # Run once
npm run test:watch # Watch mode during development
```

**Test Categories:**
- `ruleEngine.test.ts` - Pure functions (no BabylonJS)
- `eventBus.test.ts` - Event system
- `characterState.test.ts` - State machine
- `superpower.test.ts` - Ability cooldowns
- `matchFlow.test.ts` - Integration (Phase 3+)
- `physicsSanity.test.ts` - Reproducibility (Phase 2+)

## Code Quality Standards

### TypeScript
- **Strict Mode**: Always enabled (`tsconfig.json`)
- **No `any`**: Explicit types required
- **Meaningful Variables**: Clear naming

### Linting (ESLint)
```bash
npm run lint       # Check
npm run lint:fix   # Auto-fix
```

**Rules:**
- Use `const` over `let`/`var`
- `===` always (no `==`)
- No console.logs in commits (use debug flag)

### Formatting (Prettier)
```bash
npm run format  # Auto-format all code
```

Applied automatically on commit (Husky pre-commit hook - Phase 1).

## Architecture Overview

```
User Input
    ↓
InputManager → EventBus ←→ All Systems
    ↓
PhysicsWorld (Havok)
    ↓
CollisionDetector → RuleEngine
    ↓
MatchManager → Scoring
    ↓
UI / Audio / VFX
```

**Key Principle:** All systems communicate via **EventBus**, never direct calls.

## Phase Timeline

| Phase | Duration | Focus |
|-------|----------|---------|
| 0 | Week 1 | Setup, learning, hello world |
| 1 | Weeks 2-3 | Core game loop, physics, table, ball |
| 2 | Weeks 4-5 | Character controller, animation |
| 3 | Weeks 6-7 | Match rules, scoring, local 2v2 |
| 4 | Weeks 8-9 | Visual polish, effects, surreal style |
| 5 | Week 10 | Optimization, deployment |

## Deployment

Currently scaffolded for deploy to **Vercel** or **Netlify**:
- Build: `npm run build` → outputs to `dist/`
- Auto-deploy on push to `main` branch

## Useful Resources

- [BabylonJS Docs](https://doc.babylonjs.com)
- [Havok Physics](https://www.havok.com/products/havok-physics-babylonjs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Vite Docs](https://vitejs.dev)

## Questions?

See `docs/` folder for:
- `architecture.md` - System design
- `asset-guidelines.md` - Asset optimization
- `onboarding.md` - New contributor guide
