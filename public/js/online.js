/* ============================================================
   TROSA PROPI - Mode ONLINE (client)
   ============================================================
   Communique avec server.js via Socket.IO.
   Le serveur est autoritaire : on ne fait que rendre l'état reçu.
   ============================================================ */

const OnlineGame = (function () {

  let socket = null;
  let myCode = null;
  let isHost = false;
  let mySeat = null;
  let lastState = null;
  let pendingPlay = false;

  function ensureSocket() {
    if (socket) return socket;
    if (typeof io === "undefined") {
      throw new Error("Socket.IO non disponible — sers le jeu via le serveur Node.");
    }
    socket = io();
    bindSocketEvents();
    return socket;
  }

  function bindSocketEvents() {
    socket.on("lobby", (lobby) => {
      myCode = lobby.code;
      isHost = (socket.id === lobby.hostSocketId);
      Main.showLobby(lobby, isHost);
    });

    socket.on("gameStarted", () => {
      Main.showGame();
    });

    socket.on("state", (state) => {
      lastState = state;
      mySeat = state.mySeat;
      pendingPlay = false;
      renderOnlineState(state);
    });

    socket.on("played", ({ seat, card }) => {
      // L'état "state" suivra avec la nouvelle vérité
      const names = lastState ? lastState.seatNames : ["", "", "", ""];
      UI.showMessage((names[seat] || ("Joueur " + seat)) +
                     " joue " + card.r + Rules.getSym(card.s));
    });

    socket.on("trickResolved", ({ winner, total }) => {
      const names = lastState ? lastState.seatNames : ["", "", "", ""];
      UI.showMessage((names[winner] || ("Joueur " + winner))
                     + " gagne le pli +" + total);
      if (typeof Haptic !== "undefined") {
        if (winner === mySeat) Haptic.medium();
        else Haptic.light();
      }
      // Petite animation de collecte locale (state local courant)
      if (lastState) {
        // On adapte l'état local pour l'animation
        const adaptedState = adaptStateForUI(lastState);
        UI.animateCollect(adaptedState, winner).catch(() => {});
      }
    });

    socket.on("nextTurn", () => {
      UI.clearMessage();
    });

    socket.on("playerLeft", () => {
      Main.showStatus("Un joueur a quitté la partie.");
    });

    socket.on("disconnect", () => {
      Main.showStatus("Déconnecté du serveur.");
    });

    socket.on("connect_error", () => {
      Main.showStatus("Impossible de se connecter au serveur.", true);
    });
  }

  function adaptStateForUI(s) {
    // Convertit la vue serveur en état attendu par UI.render
    return {
      mode: s.mode,
      drawPile: s.drawPile || new Array(s.drawPileCount || 0).fill({ hidden: true }),
      hands: s.hands.map(h => h.map(c => c.hidden ? { r: "?", s: "S", p: 0, pow: 0, id: "?" } : c)),
      trumpCard: s.trumpCard,
      trumpTaken: s.trumpTaken,
      teamScores: s.teamScores,
      played: s.played,
      gameOver: s.gameOver,
      dealing: false,
      locked: false,
      turn: s.turn,
      leader: s.leader,
      trickOrder: s.trickOrder
    };
  }

  function renderOnlineState(serverState) {
    const adapted = adaptStateForUI(serverState);
    // Réorganise l'affichage : on veut que le joueur courant ("moi") soit en bas
    const view = rotateForViewer(adapted, serverState.mySeat, serverState.seatNames);
    UI.render(view.state, {
      canPlay: !view.state.gameOver && view.state.turn === 0 && !pendingPlay,
      onCardClick: (i) => {
        if (pendingPlay) return;
        pendingPlay = true;
        if (typeof Haptic !== "undefined") Haptic.light();
        // Index dans la vue rotée = même index dans la main réelle, car
        // on n'a permuté que les SIÈGES, pas l'ordre des cartes
        const realIdx = i;
        socket.emit("playCard", { idx: realIdx }, (res) => {
          if (!res || !res.ok) {
            pendingPlay = false;
            UI.showMessage("⛔ " + (res && res.error || "Coup refusé"));
          }
        });
      },
      names: view.names
    });
  }

  /**
   * Permute les sièges pour que `mySeat` apparaisse en seat 0 (en bas).
   * On garde la même structure (mode, hands[4], played[4], etc.) mais on
   * remappe les indices selon la rotation.
   */
  function rotateForViewer(state, mySeat, seatNames) {
    const map = {}; // realSeat -> displaySeat
    if (state.mode === "1v1") {
      // Sièges actifs : 0 et 2
      if (mySeat === 0) { map[0] = 0; map[2] = 2; }
      else              { map[2] = 0; map[0] = 2; }
      // Sièges inactifs : on les laisse identiques
      map[1] = 1; map[3] = 3;
    } else {
      // Sièges actifs : 0, 3, 2, 1 (sens de jeu)
      // On veut mySeat -> 0, suivant -> 3, partenaire -> 2, autre -> 1
      const order = [0, 3, 2, 1]; // ordre de jeu
      const startIdx = order.indexOf(mySeat);
      for (let i = 0; i < 4; i++) {
        const realSeat = order[(startIdx + i) % 4];
        const displaySeat = order[i];
        map[realSeat] = displaySeat;
      }
    }

    const newHands = [[], [], [], []];
    const newPlayed = [null, null, null, null];
    const newNames = ["", "", "", ""];
    for (let s = 0; s < 4; s++) {
      const d = map[s];
      newHands[d]  = state.hands[s];
      newPlayed[d] = state.played[s];
      newNames[d]  = seatNames[s] || "";
    }
    const newTurn   = map[state.turn] !== undefined ? map[state.turn] : state.turn;
    const newLeader = map[state.leader] !== undefined ? map[state.leader] : state.leader;
    const newTrickOrder = (state.trickOrder || []).map(s => map[s]);

    return {
      state: {
        ...state,
        hands: newHands,
        played: newPlayed,
        turn: newTurn,
        leader: newLeader,
        trickOrder: newTrickOrder
      },
      names: newNames
    };
  }

  // ====== API publique ======

  async function createRoom(name, mode) {
    ensureSocket();
    return new Promise((resolve) => {
      socket.emit("createRoom", { name, mode }, (res) => resolve(res));
    });
  }
  async function joinRoom(code, name) {
    ensureSocket();
    return new Promise((resolve) => {
      socket.emit("joinRoom", { code, name }, (res) => resolve(res));
    });
  }
  async function addBot() {
    return new Promise((resolve) => {
      socket.emit("addBot", null, (res) => resolve(res));
    });
  }
  async function startGame() {
    return new Promise((resolve) => {
      socket.emit("startGame", null, (res) => resolve(res));
    });
  }
  function leave() {
    if (socket) {
      socket.emit("leaveRoom");
    }
    myCode = null; isHost = false; mySeat = null;
    lastState = null;
  }
  function isAvailable() {
    return typeof io !== "undefined" && !window.__noServer;
  }

  return { createRoom, joinRoom, addBot, startGame, leave, isAvailable };
})();
