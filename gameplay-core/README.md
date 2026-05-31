# gameplay-core — logique de jeu isolée de l'affichage

Extraction de la **logique pure** du Teqball (Version 2), séparée de tout ce qui
touche au rendu : BabylonJS, Havok, modèles 3D, animations, UI, VFX, audio, DOM.

Tout ce qui est ici **compile et s'exécute sans `@babylonjs/core`** ni navigateur.
Objectif : brancher ces modules sur n'importe quelle interface graphique sans
provoquer d'erreurs de dépendances.

## Vérifier l'indépendance

```bash
npx tsc -p gameplay-core/tsconfig.json
```

Le `tsconfig.json` utilise `"types": []` et `"lib": ["ES2020"]` (pas de `dom`,
pas de types Babylon). S'il compile, c'est qu'aucune dépendance de vue ne subsiste.
> Vérifié : `tsc` retourne **exit 0** (le seul global utilisé, `console` dans
> EventBus, est déclaré de façon minimale dans `env.d.ts`, sans dépendance runtime).

## Contenu (modules extraits, agnostiques de la vue)

| Module | Origine | Statut |
|---|---|---|
| `math/Vec3.ts` | remplace `@babylonjs/core` `Vector3` | **nouveau** — primitive maths sans dépendance |
| `core/EventBus.ts` | `src/core/EventBus.ts` | **verbatim** — pub/sub statique déjà pur |
| `core/types.ts` | extrait de `src/core/interfaces.ts` | contrats sans Babylon (`IEntity`, `IMatchManager`, enums) |
| `core/constants.ts` | `src/core/constants.ts` | **verbatim** — nombres purs |
| `core/SceneMetrics.ts` | `src/core/SceneMetrics.ts` | interface de données (dimensions du court) |
| `gameplay/constants.ts` | `src/gameplay/constants.ts` | **verbatim** |
| `gameplay/interfaces.ts` | `src/gameplay/interfaces.ts` | `Vector3` → `Vec3` |
| `gameplay/RuleEngine.ts` | `src/gameplay/RuleEngine.ts` | **verbatim** — fonctions pures (règles) |
| `gameplay/PhaseController.ts` | `src/gameplay/PhaseController.ts` | **verbatim** — machine à états du rallye |
| `gameplay/MatchManager.ts` | `src/gameplay/MatchManager.ts` | logique verbatim, imports redirigés |
| `physics/BallGuide.ts` | `src/systems/BallGuide.ts` | **verbatim** — arcs balistiques (`Vector3` → `Vec3`) |
| `physics/BallPredictor.ts` | `src/systems/BallPredictor.ts` | **verbatim** — prédiction de trajectoire |
| `spatial/GridSystem.ts` | `src/systems/GridSystem.ts` | **verbatim** — grille de zones du court |
| `spatial/ZoneSelector.ts` | `src/systems/ZoneSelector.ts` | **verbatim** — zones + ciblage IA pondéré |
| `spatial/courtZones.ts` | `src/data/courtZones.ts` | **verbatim** — construction des zones par côté |
| `input/PlayerInputState.ts` | `src/input/PlayerInput.ts` | logique conservée, **écouteurs DOM retirés** |

### Brancher une nouvelle vue

```ts
import {
  EventBus, MatchManager, PlayerInputState,
  BallPredictor, ZoneSelector, GridSystem, Vec3, type ISceneMetrics,
} from './gameplay-core';

// 1. Entrées : la vue transmet l'état clavier brut (plus de document.addEventListener)
const p1 = new PlayerInputState(0);
window.addEventListener('keydown', e => p1.setKey(e.key, true));
window.addEventListener('keyup',   e => p1.setKey(e.key, false));

// 2. Match (pur) — la vue réagit aux évènements
const match = new MatchManager();
EventBus.on('match:end', winner => myUI.showWinner(winner));

// 3. Physique / spatial purs : ta vue fournit position/vitesse de la balle,
//    la logique répond où elle va atterrir et quelle zone viser.
const metrics: ISceneMetrics = myView.measureCourt();
const grid = new GridSystem(metrics);
const landing = BallPredictor.ballAtArrival(ballPos, ballVel, metrics.tableTopY);
const cell = grid.cellFromWorld(landing.position);
```

## Ce qui N'A PAS été extrait, et pourquoi (transparence)

L'analyse du **code réel** de la Version 2 a révélé trois catégories non extraites :

**1. Modules « stubs » (corps vide — `// TODO Phase N`, rien à isoler)**
`gameplay/SuperpowerSystem`, `gameplay/ArenaVariationSystem`,
`gameplay/abilities/*` (GravityFlip, SpeedBurst, MegaBounce, BallFreeze),
`systems/PhysicsWorld`, `systems/CollisionDetector`. Ces classes n'ont pas encore
d'implémentation : il n'y a pas de mécanique à extraire (le `SuperpowerSystem`
de la doc d'architecture n'est pas encore écrit dans le code).

**2. Modules réellement couplés au rendu/moteur (non transposables tels quels)**
- `systems/KickSystem` — lit `ball.mesh.physicsBody`, `player.getStrikeBonePosition()`,
  appelle `player.playAnimation(...)`, dépend de `AnimSelector`/`AnimTimer`. Sa
  *partie maths* est déjà déléguée à `BallGuide`/`BallPredictor` (extraits ci-dessus) ;
  l'orchestration restante est intrinsèquement liée à l'animation/au corps physique.
- `ai/AIController` — `selectTargetZone()` est pur (il délègue à `ZoneSelector`,
  extrait), mais `moveToward()`/`rotateToward()` écrivent dans `character.mesh.position`
  et déclenchent des clips d'animation.
- `entities/Character`, `entities/Ball` — wrappers de mesh + agrégat Havok + skeleton.
- `gameplay/ServeSystem` — `mesh.position`, `physicsBody`, `playAnimation`, `SceneMetrics`.
- `systems/InputManager` — écouteurs `window` (la *logique* de mapping est extraite
  dans `input/PlayerInputState`).

> Pour rendre KickSystem/AIController/entités agnostiques, il faut les redécouper
> derrière des *ports* (interfaces de physique/animation que la vue implémente) —
> c'est une réécriture architecturale, pas une simple extraction, donc hors périmètre
> de « isoler la logique existante sans la réinventer ».

**3. `config/GameConfig.ts`** — surtout des constantes pures + 2 helpers purs
(`getCourtCenterFacing`, `getLateralReceptionFacing`), mais mélangés à un
`BALL_SPAWN_POSITION: Vector3` et des constantes de tuning de vue. Extractible
trivialement au besoin (même swap `Vector3` → `Vec3`) ; laissé de côté car
purement configuration.
