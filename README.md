# ⚽ Teqball — Surrealistic Edition

> Un jeu de teqball en 3D dans le navigateur, où vous affrontez **Howard**, un adversaire
> entièrement piloté par une intelligence artificielle.
> Développé avec **BabylonJS**, **TypeScript** et **Vite** (physique **Havok**).

---

## 🎮 Jouer maintenant

- **🌐 Jeu en ligne (hébergé)** : <!-- TODO : coller ici l'URL GitHub Pages / itch.io --> _à compléter_
- **▶️ Vidéo de présentation YouTube** : <!-- TODO : coller ici le lien de la vidéo --> _à venir_

> 💡 **Le jeu se joue entièrement au clavier.** Pas besoin de souris, ni de manette, ni de
> matériel particulier — parfait pour le tester sur un ordinateur portable.

---

## 🧠 Pourquoi c'est dans le thème « IA Edition »

L'IA est au cœur du projet, et de **deux** manières concrètes :

### 1. Un adversaire piloté par une IA — Howard

Howard, votre adversaire, **ne reçoit aucune entrée humaine** : il est intégralement contrôlé
par une IA qui, à chaque image (frame) :

1. **Prédit la trajectoire de la balle** et son point de chute sur son côté de la table
   (prédiction physique / balistique de la balle).
2. **Se déplace vers le point d'interception**, case par case sur une grille qui découpe le
   terrain, en jouant l'animation de course correspondant à sa direction.
3. **Choisit où renvoyer la balle** : la zone cible sur la table adverse est tirée par
   **échantillonnage pondéré**. L'IA privilégie les coins et les diagonales pour varier ses
   angles et vous prendre à contre-pied, plutôt que de renvoyer bêtement au centre.
4. **Sélectionne l'animation de frappe ou de service** la mieux adaptée à la situation.

C'est une **IA comportementale déterministe** (heuristiques + prédiction physique), pas un
réseau de neurones : elle reste lisible, débogable et rejouable — un choix assumé pour garder
la maîtrise du gameplay.

### 2. Des animations générées par capture de mouvement assistée par IA

Toutes les animations des joueurs ont été produites grâce à une **plateforme de capture de
mouvement par IA** : nous avons **filmé nos propres vidéos** (gestes de teqball, services,
réceptions, frappes…) puis extrait les squelettes / mouvements qui nous intéressaient pour les
appliquer à nos modèles 3D. L'IA n'est donc pas seulement *dans* le jeu : elle a aussi servi à
*fabriquer* le jeu.

---

## 🕹️ Commandes

Le déplacement est volontairement placé sur les **flèches directionnelles** : elles sont
identiques sur **AZERTY et QWERTY**, donc aucun souci de disposition de clavier pour les
testeurs (coucou nos amis américains 👋).

| Action | Touche |
|---|---|
| Se déplacer | **↑ ↓ ← →** (flèches directionnelles) |
| Frapper / Servir | **Espace** |
| Tir puissant | **Espace × 2** (double appui) |
| Viser à gauche / droite | **← ou →** maintenue **+ Espace** |
| Changer de type de service | **Q** (avant de servir) |
| Revenir au service / relancer l'échange | **R** |
| Déclencher le superpouvoir | **F** (quand il est PRÊT) |

> 🖱️ **Pas de souris ni de manette nécessaires.**

---

## 🎯 But du jeu

Renvoyez la balle sur la table adverse sans la laisser rebondir deux fois de votre côté.
Variez vos angles et utilisez les **tirs puissants en diagonale** pour prendre l'IA à
contre-pied et marquer le point.

### Personnages & superpouvoirs

Vous choisissez votre joueur en début de partie. Chacun a ses stats (vitesse, saut, puissance,
effet) et un **superpouvoir** :

- **Messi** — *SUPERCHARGE*
- **Maradona** — *CHAOS CURVE*

Le superpouvoir se déclenche avec **F** lorsqu'il est chargé : gagnez **2 points d'affilée**
pour le recharger (une charge est aussi offerte au début de chaque set).

Face à vous : **Howard**, l'adversaire IA.

---

## 🧪 Tester facilement (note pour le jury)

- Au lancement, un écran **« Commencer l'expérience »** débloque l'audio, puis une courte
  narration pose le contexte avant le match.
- Le menu permet d'accéder directement à **Jouer**, **Personnages** et **Commandes**.
- Une partie démarre vite ; le premier set est accessible pour prendre le jeu en main.

---

## 🛠️ Galères & décisions de conception

La partie dont on est fiers… et celle qui nous a fait le plus suer. Quelques-uns de nos vrais
chantiers :

### 1. Trouver les bonnes animations
Les animations de teqball ne courent pas les rues. Nous avons fini par **tourner nous-mêmes des
vidéos** de gestes, puis par passer par une **plateforme de capture de mouvement par IA** pour
en extraire les mouvements et ne garder que ceux qui collaient au jeu (service, réception,
frappes, déplacements). Long, itératif, mais c'est ce qui donne sa personnalité au jeu.

### 2. Synchroniser la balle avec le squelette du modèle 3D
Le vrai casse-tête : faire en sorte que la balle soit touchée **au bon moment** par le bon os du
joueur. Une animation, c'est une suite de frames ; le contact réel avec la balle n'a lieu que
sur **quelques frames précises**. Nous avons donc dû, pour chaque animation, repérer le **nombre
de frames** et la **fenêtre de frames** pendant laquelle le joueur exécute son geste de contact,
afin de déclencher la collision et l'impulsion de la balle pile à cet instant. Sans ça, la balle
partait avant ou après le geste, et tout paraissait faux.

### 3. Gérer l'agent IA qui anime Howard
Faire jouer une IA au teqball de façon **crédible mais battable** a demandé beaucoup de réglages :
prédiction de la trajectoire, repositionnement défensif, choix des zones de renvoi, fenêtres de
réaction… Trouver l'équilibre entre une IA qui « triche » (toujours au bon endroit) et une IA
trop molle a été un travail d'ajustement permanent.

---

## ⚙️ Stack & défis techniques

- **Moteur 3D** : BabylonJS 6
- **Langage** : TypeScript (strict)
- **Bundler / dev server** : Vite
- **Physique** : Havok (WASM) — nécessite l'isolation cross-origin (en-têtes COOP/COEP côté serveur)
- **Audio** : Howler
- **Modèles & animations** : `.glb` (capture de mouvement assistée par IA)

Défis techniques notables : pipeline d'animation par capture de mouvement IA, synchronisation
fine balle ↔ squelette par fenêtres de frames, et conception d'une IA adversaire comportementale
(prédiction balistique + déplacement sur grille + placement de balle pondéré).

---

## 👥 L'équipe

- **Mammadou Diallo Ougailou**
- **Stevenson Jules**
- **Bierhoff Theolien**

<!-- TODO (optionnel mais apprécié du jury) : préciser qui a fait quoi
     (gameplay / IA / animation / 3D / UI / audio…) -->

---

## 💻 Lancer le projet en local

```bash
# Installer les dépendances
npm install

# Serveur de développement (ouvre le navigateur)
npm run dev

# Build de production → dossier dist/
npm run build

# Prévisualiser le build
npm run preview
```

### Avec Docker

```bash
docker compose up dev     # développement (hot reload, port 5173)
docker compose up prod    # production via nginx (port 8080)
```

### Scripts utiles

```bash
npm test          # tests unitaires (Vitest)
npm run lint      # ESLint
npm run typecheck # vérification des types
npm run format    # Prettier
```

> ⚠️ La physique Havok utilise `SharedArrayBuffer` : le serveur doit envoyer les en-têtes
> `Cross-Origin-Opener-Policy: same-origin` et `Cross-Origin-Embedder-Policy: require-corp`
> (déjà configurés dans `nginx.conf` et `vite.config.ts`).

---

## 🙏 Crédits

Projet réalisé dans le cadre du cours **3D Game Programming (M1 Informatique)** pour le concours
**IA Edition**. Modèles, animations et sons intégrés par l'équipe ; animations issues de captures
de mouvement que nous avons filmées et traitées par IA.
