# TROSA PROPI

Jeu de cartes mobile (FR) — solo contre des bots ou en ligne avec d'autres joueurs.

## Structure du projet

```
trosa-propi/
├── public/                # Client (servi en statique)
│   ├── index.html
│   ├── css/style.css
│   └── js/
│       ├── constants.js   # cartes, points, timing
│       ├── rules.js       # comparaisons, deck, vainqueur d'un pli
│       ├── ai.js          # IA des bots (utilisée client + serveur)
│       ├── ui.js          # rendu DOM + animations
│       ├── local.js       # mode solo vs bots
│       ├── online.js      # mode online (Socket.IO)
│       └── main.js        # menu, lobby, orchestration
└── server/                # Serveur Node.js
    ├── package.json
    ├── server.js          # Express + Socket.IO
    └── gameRoom.js        # logique d'un salon (autoritative)
```

## Installation et lancement

### 1. Solo seulement (pas de serveur)

Ouvre simplement `public/index.html` dans un navigateur.
Le mode "online" sera désactivé, mais le solo contre les bots fonctionne.

### 2. Avec serveur (solo + online)

```bash
cd server
npm install
npm start
```

Puis ouvre [http://localhost:3000](http://localhost:3000).

Tu peux maintenant :
- Jouer en solo contre les bots ;
- Créer un salon en ligne et partager le code à 4 caractères ;
- Rejoindre un salon avec ce code ;
- Ajouter des bots si tu n'as pas assez de joueurs humains.

## Modes de jeu

- **1 vs 1** — toi contre un adversaire (humain ou bot).
- **2 vs 2** — équipes (toi+partenaire) contre (adversaire 1+adversaire 2).
  En 2v2 le partenaire est toujours en face de toi.

## Règles rapides

- Jeu de 32 cartes (A, 7, K, Q, J, 6, 5, 4, 3, 2 dans 4 couleurs).
- Valeurs : A=11, 7=10, K=4, Q=3, J=2, le reste = 0 point.
- Force : A > 7 > K > Q > J > 6 > 5 > 4 > 3 > 2.
- L'atout est révélé au début. Quand la pioche est vide, le gagnant du pli courant prend l'atout.
- 91 points et plus = victoire double, 61 et plus = victoire simple.

## Déploiement

Le serveur est un simple Node.js / Express, déployable partout :

### Render.com (gratuit, le plus simple)

1. Pousse ce dossier sur GitHub.
2. Sur Render → New → Web Service.
3. Build command : `cd server && npm install`
4. Start command : `cd server && node server.js`
5. Render fournit automatiquement la variable `PORT`.

### Fly.io / Railway / VPS

Même principe : `npm install` puis `node server.js` dans `/server`.
Variables d'environnement supportées :
- `PORT` (défaut : 3000)

### Docker (optionnel)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY public ./public
COPY server ./server
WORKDIR /app/server
RUN npm install --omit=dev
EXPOSE 3000
CMD ["node", "server.js"]
```

## Améliorations apportées vs version précédente

- **Architecture** : séparation HTML / CSS / JS, modules logiques distincts.
- **Performance** : cache des éléments DOM (plus de `getElementById` à chaque frame).
- **Bugs** : `compareCards` et `winnerOfTrick` reçoivent l'atout en paramètre (plus de globale `trumpCard`), gestion plus sûre des changements de mode en plein milieu de partie.
- **IA des bots** : comptage des cartes vues, meilleure logique pour les fins de partie.
- **Multijoueur** : serveur autoritaire avec validation des coups, vues partielles par joueur (impossible de "voir" la main d'un adversaire en inspectant le DOM).
- **UX** : menu d'accueil, mise en évidence du joueur courant, raccourci des résolutions de pli.
