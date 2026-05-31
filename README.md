# TEQBALL (AI Edition)

> Jeu de teqball 3D jouable dans le navigateur, développé avec **BabylonJS 6**, **Havok Physics v2** et **TypeScript**.
> Un humain contre une IA à prédiction balistique. Physique réelle, aucun plugin, aucune installation.

**Jouer en ligne** : https://mamadou-ougailou.github.io/teqball-game/

**Vidéo de présentation** : https://youtu.be/50rCVxkkT00

---

## Présentation rapide

Le jeu se teste **sur un simple ordinateur portable**, sans matériel particulier.

1. Ouvrez le lien ci-dessus dans **Chrome, Edge ou Brave** (navigateur Chrome requis pour Havok / `SharedArrayBuffer`).
2. Cliquez sur **« Commencer l'expérience »** → une courte narration se joue (vous pouvez la regarder, elle pose le thème).
3. Dans le menu, **Jouer** lance directement un match contre l'IA. Pas de niveau à débloquer : vous êtes dans le jeu immédiatement.
4. Optionnel : **Personnages** pour choisir votre joueur (3 disponibles, stats et superpouvoir différents), **Comment jouer** pour le rappel des touches.

> Le match démarre seul, l'IA sert et joue toute seule. Vous n'avez qu'à vous déplacer et frapper.

---

## Matériel & contrôles à lire avant de jouer

| Élément | Détail |
| --- | --- |
| **Souris / trackpad** | Recommandée **pour le menu uniquement** (curseur personnalisé). Le match en lui-même se joue **100 % au clavier**. |
| **Clavier** | **AZERTY et QWERTY supportés automatiquement**  aucune config. Le code accepte simultanément `Z/Q` (AZERTY) et `W/A` (QWERTY). |
| **Manette** | Non nécessaire (et non supportée pour l'instant). |
| **Navigateur** | Chromium (Chrome / Edge / Brave). Firefox/Safari peuvent bloquer `SharedArrayBuffer`. |

### Commandes en match (Joueur 1)

| Action | Touches |
| --- | --- |
| Se déplacer | `Z Q S D` (AZERTY) · `W A S D` (QWERTY) · **Flèches** |
| Servir / Frapper | `Espace` |
| Superpouvoir | `Q` (AZERTY) / `A` (QWERTY) |
| Pause | `Échap` |
| Retour menu | bouton **Retour** en haut |

Le **Joueur 2 est entièrement géré par l'IA** : il sert et joue automatiquement.

---

## Le jeu & ses règles

Le teqball est un **vrai sport de compétition** : deux joueurs face à face autour d'une table incurvée, comme un croisement entre le foot et le tennis de table. Cette version applique le **règlement officiel en simple** :

- **3 touches maximum** par joueur avant de renvoyer la balle dans le camp adverse.
- La balle doit **rebondir côté adverse** ; un rebond de votre côté est une faute.
- **Double rebond** du même côté → point pour le dernier joueur à avoir touché.
- Balle au **sol sans toucher la table** → point pour l'adversaire.
- **Sets en 12 points**, victoire à **2 points d'écart**, match au **meilleur des 3 sets**.

Toute la logique des règles vit dans `src/gameplay/RuleEngine.ts`, écrit en **fonctions pures sans dépendance BabylonJS** donc testable unitairement (voir `tests/`).

---

## Pourquoi ce jeu respecte le thème « IA Edition »

Le thème de l'édition est l'**IA face à l'humain**. Nous l'avons pris au pied de la lettre **et** au sens figuré :

1. **Un adversaire IA, pas un script.** L'IA ne suit aucune trajectoire pré-enregistrée. Elle calcule en direct, à chaque frame, une **prédiction balistique** de la balle et décide où se placer et comment frapper. Sa difficulté est *émergente* : elle réagit à la physique réelle, exactement comme un humain.

2. **Une narration assumée.** Avant chaque partie, une intro typée pose le décor : *« Dans un monde où l'IA a tout conquis… il reste un terrain où la machine n'a pas gagné. »* Le teqball y devient le dernier sport où **le corps parle avant l'algorithme** un geste, un timing, un réflexe que le code ne peut pas vraiment imiter.

3. **L'IA ne triche pas.** Elle n'a pas accès à vos intentions : elle ne voit que la physique de la balle, comme vous. C'est ce qui rend une victoire humaine satisfaisante.

---

## Le système d'IA en détail

`src/ai/AIController.ts` fonctionne en trois couches :

1. **Prédiction balistique** à chaque frappe, l'IA simule la parabole complète de la balle (gravité, vitesse initiale, hauteur de table) pour estimer **où** et **quand** elle retombera dans son camp. Le résultat est stocké dans une `ReceptionForecast`.
2. **Planification du déplacement** `computeAIMovement()` dirige l'IA vers le point d'interception, avec un *clamp* qui l'empêche de franchir le filet (même contrainte que le joueur humain).
3. **Choix de l'action** selon la hauteur de balle, la distance et la phase de l'échange, l'IA choisit tête / genou / ciseau et met l'action en file, exécutée par `ActionSystem` quand les conditions spatiales sont réunies.

---

## Architecture

Découpage en modules à responsabilité unique :

```
src/
├── config/      GameConfig.ts toutes les constantes en un seul endroit
├── core/        Engine, SceneBuilder, AssetManager, EventBus, GameLoop
├── entities/    Ball, Character, Arena, CurvedTable, PlayerSetup
├── gameplay/    MatchManager, RallyManager, ServeManager, RuleEngine,
│                ActionSystem, PlayerLocomotion, SuperpowerSystem, abilities/
├── ai/          AIController prédiction balistique + planification
├── animation/   AnimationSystem, IKController retargeting squelette
├── systems/     InputManager (AZERTY/QWERTY), CameraManager, PhysicsWorld, BallPhysics
├── ui/          HUD, PointAnnouncement, UIManager overlays DOM
├── audio/       AudioSystem, MusicManager
├── vfx/         ParticleLibrary, ShaderLibrary, TrailManager
├── landing.js   Menu, narration d'intro, sélection perso, transitions
└── main.ts      Orchestrateur boucle de rendu, câblage des systèmes
```

**Deux décisions dont nous sommes contents :**

- **EventBus pour découpler l'UI.** Le gameplay émet des événements typés (`match:pointScored`, `match:setEnd`, `match:end`). Le HUD et les overlays s'y abonnent sans aucune importation circulaire entre gameplay et présentation.
- **Règles en fonctions pures.** `RuleEngine` ne connaît pas BabylonJS : il reçoit un état, renvoie une décision. Résultat : on a pu écrire de vrais tests unitaires et corriger les bugs de score sans lancer le jeu.

---

## Journal de bord, galères & défis techniques

> Cette section raconte les vrais problèmes rencontrés. Les points ci-dessous sont **traçables dans l'historique git** du projet.

### 1. Havok refusait de se charger en production (le pire bug)
Le moteur physique Havok est livré en **WebAssembly** et exige `SharedArrayBuffer`. En local tout marchait ; une fois déployé sur **GitHub Pages**, écran blanc. Le coupable : le binaire `HavokPhysics.wasm` était suivi par **Git LFS**, et GitHub Pages servait le **pointeur texte LFS** au lieu du vrai binaire. Deux corrections successives ont été nécessaires :
- activer `lfs: true` dans le checkout GitHub Actions,
- puis **sortir carrément le `.wasm` du LFS** pour qu'il soit servi tel quel.

*(Commits `90ebe66` et `e800e56`.)*

### 2. L'autoplay audio coupé par le navigateur
Les navigateurs bloquent le son tant qu'il n'y a pas de geste utilisateur. Notre drone d'ambiance d'intro se faisait couper parce qu'un `import()` dynamique se déclenchait **entre** le clic et le `play()`, faisant expirer le « user gesture token ». Solution : **démarrer l'audio en tout premier**, de façon synchrone dans le handler de clic, avant tout préchargement. *(Commit `12ac2c0`.)*

### 3. La balle qui traverse / oscille
La physique fine d'une petite balle rapide a généré des bugs typiques : tunneling à travers la table, oscillations parasites au repos. D'où une batterie de garde-fous configurables dans `GameConfig.ts` (`antiTunnel*`, `ballOscillation*`, `NO_GROUND_FALL_*`).

## L'équipe

| Nom | Rôle principal |
| --- | --- |
| **Bierhoff Theolien** | Moteur physique, IA, architecture |
| **Mamadou Ougailou Diallo** | Gameplay, UI/HUD, système de scoring |
| **Jules Stevenson**         | Développeur contributions gameplay & intégration         |

---

## Lancer le projet en local

```bash
git clone https://github.com/Mamadou-ougailou/teqball-game
cd teqball-game
npm install
npm run dev      # http://localhost:5173
```

> Havok exige `SharedArrayBuffer` (contexte sécurisé). Le serveur Vite et `localhost` remplissent la condition automatiquement.

```bash
npm run build      # build de production → dist/
npm run typecheck  # vérification TypeScript
npm test           # tests unitaires (Vitest)
```

---

## Limitations 

Nous préférons être transparents plutôt que survendre :

- **Une seule arène jouable.** Les arènes « Cloud / Rave / Space » visibles au menu sont des aperçus ; le système de variation (`ArenaVariationSystem`) n'est pas encore branché.
- **Pas de musique pendant le match** (uniquement les effets de balle) désactivée à dessein, à réactiver.
- **Superpouvoir mappé sur la touche de déplacement gauche** (`Q`/`A`) : à surveiller selon votre clavier.
- **Pas de support manette** pour l'instant.

## Crédits

Projet réalisé dans le cadre du cours **3D Game Programming (M1 Informatique)** pour le concours
**IA Edition**. Modèles, animations et sons intégrés par l'équipe ; animations issues de captures
de mouvement que nous avons filmées et traitées par IA.
