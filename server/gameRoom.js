/* ============================================================
   TROSA PROPI - Salon (Room) côté serveur
   ============================================================
   Serveur autoritaire : il génère les cartes, valide les coups
   et distribue à chaque client une vue partielle (sa main + cartes
   visibles publiquement).
   ============================================================ */

const Rules = require("../public/js/rules.js");
const AI    = require("../public/js/ai.js");
const C     = require("../public/js/constants.js");

class GameRoom {
  /**
   * @param code         Code de salon (ex: "ABCD12")
   * @param hostSocketId ID de la socket de l'hôte
   * @param hostName     Pseudo de l'hôte
   * @param mode         "1v1" ou "2v2"
   * @param onBroadcast  fn(event, payload) -> diffuse à tous les sockets de la room
   */
  constructor(code, hostSocketId, hostName, mode, onBroadcast) {
    this.code = code;
    this.mode = mode;
    this.maxPlayers = mode === "1v1" ? 2 : 4;
    this.broadcast = onBroadcast;

    // players[] : { socketId|null, name, isBot, seat (assigné au start) }
    this.players = [{ socketId: hostSocketId, name: hostName, isBot: false }];
    this.hostSocketId = hostSocketId;

    // État de la partie
    this.started = false;
    this.state = null;
    this.botMemories = {}; // par seat -> mémoire IA persistée en mémoire serveur
  }

  // ====== Lobby ======

  addPlayer(socketId, name) {
    if (this.started) return { ok: false, error: "Partie déjà commencée." };
    if (this.players.length >= this.maxPlayers) {
      return { ok: false, error: "Salon plein." };
    }
    this.players.push({ socketId, name, isBot: false });
    return { ok: true };
  }

  addBot() {
    if (this.started) return { ok: false, error: "Partie déjà commencée." };
    if (this.players.length >= this.maxPlayers) {
      return { ok: false, error: "Salon plein." };
    }
    const botNum = this.players.filter(p => p.isBot).length + 1;
    this.players.push({ socketId: null, name: "Bot " + botNum, isBot: true });
    return { ok: true };
  }

  removePlayer(socketId) {
    const idx = this.players.findIndex(p => p.socketId === socketId);
    if (idx === -1) return { ok: false };
    this.players.splice(idx, 1);
    if (socketId === this.hostSocketId && this.players.length > 0) {
      // Promote next non-bot to host
      const newHost = this.players.find(p => !p.isBot);
      if (newHost) this.hostSocketId = newHost.socketId;
    }
    return { ok: true, empty: this.players.length === 0 };
  }

  lobbyView() {
    return {
      code: this.code,
      mode: this.mode,
      maxPlayers: this.maxPlayers,
      hostSocketId: this.hostSocketId,
      players: this.players.map(p => ({
        name: p.name,
        isBot: p.isBot,
        isHost: p.socketId === this.hostSocketId
      })),
      started: this.started
    };
  }

  // ====== Partie ======

  start() {
    if (this.started) return { ok: false, error: "Déjà démarré." };
    if (this.players.length !== this.maxPlayers) {
      return { ok: false, error: "Il manque des joueurs (ou des bots)." };
    }

    // Assigne les sièges :
    //   1v1 : seats [0, 2]
    //   2v2 : seats [0, 3, 2, 1]
    const seats = Rules.activePlayers(this.mode);
    this.players.forEach((p, i) => { p.seat = seats[i]; });

    // Mémoires IA par seat
    this.botMemories = {};
    for (const p of this.players) {
      if (p.isBot) this.botMemories[p.seat] = AI.defaultMemory();
    }

    // Génère le deck
    const deck = Rules.shuffle(Rules.buildDeck());
    const trumpCard = deck.pop();

    this.state = {
      mode: this.mode,
      drawPile: deck,
      hands: [[], [], [], []],
      trumpCard, trumpTaken: false,
      teamScores: [0, 0],
      tricksWon:  [0, 0],
      played: [null, null, null, null],
      gameOver: false,
      leader: 0, turn: 0,
      trickOrder: [],
      history: []
    };

    // Distribution
    for (let r = 0; r < 5; r++) {
      for (const seat of seats) {
        if (this.state.drawPile.length === 0) break;
        this.state.hands[seat].push(this.state.drawPile.shift());
      }
    }

    this.started = true;
    return { ok: true };
  }

  /**
   * Vue partielle pour un joueur (cache la main des autres).
   */
  publicViewFor(socketId) {
    const me = this.players.find(p => p.socketId === socketId);
    const mySeat = me ? me.seat : null;
    const seatNames = ["", "", "", ""];
    for (const p of this.players) seatNames[p.seat] = p.name;

    const hands = [[], [], [], []];
    for (let s = 0; s < 4; s++) {
      if (s === mySeat) {
        hands[s] = this.state.hands[s];
      } else {
        // On ne révèle que le NOMBRE de cartes, pas leur identité
        hands[s] = this.state.hands[s].map(() => ({ hidden: true }));
      }
    }

    return {
      mySeat,
      seatNames,
      mode: this.state.mode,
      drawPileCount: this.state.drawPile.length,
      drawPile: new Array(this.state.drawPile.length).fill({ hidden: true }),
      hands,
      trumpCard: this.state.trumpCard,
      trumpTaken: this.state.trumpTaken,
      teamScores: this.state.teamScores,
      tricksWon:  this.state.tricksWon,
      played: this.state.played,
      trickOrder: this.state.trickOrder,
      gameOver: this.state.gameOver,
      turn: this.state.turn,
      leader: this.state.leader,
      dealing: false,
      locked: false
    };
  }

  /**
   * Diffuse l'état à chaque joueur humain (chacun reçoit sa vue).
   */
  pushState(broadcastToSocket) {
    for (const p of this.players) {
      if (p.isBot) continue;
      const view = this.publicViewFor(p.socketId);
      broadcastToSocket(p.socketId, "state", view);
    }
  }

  // Utilitaire : seat -> player
  playerAtSeat(seat) {
    return this.players.find(p => p.seat === seat);
  }

  /**
   * Tente de jouer la carte d'index `idx` depuis la main du seat `seat`.
   * Vérifie que c'est bien le tour du joueur.
   */
  tryPlay(seat, idx) {
    if (!this.started || this.state.gameOver) {
      return { ok: false, error: "Partie pas en cours." };
    }
    if (this.state.turn !== seat) {
      return { ok: false, error: "Ce n'est pas ton tour." };
    }
    const hand = this.state.hands[seat];
    if (idx < 0 || idx >= hand.length) {
      return { ok: false, error: "Index invalide." };
    }
    const card = hand.splice(idx, 1)[0];
    this.state.played[seat] = card;
    this.state.trickOrder.push(seat);

    const need = Rules.activePlayers(this.state.mode).length;
    let trickResolved = null;

    if (this.state.trickOrder.length >= need) {
      const winner = Rules.winnerOfTrick(
        this.state.trickOrder, this.state.played, this.state.trumpCard.s
      );
      const total = Rules.activePlayers(this.state.mode).reduce(
        (s, p) => s + (this.state.played[p] ? this.state.played[p].p : 0), 0
      );
      const team = Rules.teamOf(winner, this.state.mode);
      this.state.teamScores[team] += total;
      this.state.tricksWon[team] += 1;

      this.state.history.push({
        winner,
        cards: Rules.activePlayers(this.state.mode).map(p => this.state.played[p])
      });

      trickResolved = { winner, total };
    } else {
      this.state.turn = Rules.nextPlayer(this.state.turn, this.state.mode);
    }

    return { ok: true, trickResolved, played: { seat, card } };
  }

  /**
   * Résout un pli déjà composé : les joueurs piochent et le tour reprend.
   * Doit être appelé APRÈS l'animation côté client.
   */
  resolveAfterTrick(winner) {
    // Vide les cartes posées
    this.state.played = [null, null, null, null];
    this.state.trickOrder = [];
    this.state.leader = winner;
    this.state.turn = winner;

    // Pioche : gagnant en premier
    let p = winner;
    for (let step = 0; step < Rules.activePlayers(this.state.mode).length; step++) {
      if (this.state.drawPile.length > 0) {
        this.state.hands[p].push(this.state.drawPile.shift());
      } else if (!this.state.trumpTaken) {
        this.state.hands[p].push(this.state.trumpCard);
        this.state.trumpTaken = true;
      }
      p = Rules.nextPlayer(p, this.state.mode);
    }

    // Fin de partie ?
    const active = Rules.activePlayers(this.state.mode);
    if (active.every(s => this.state.hands[s].length === 0)
        && this.state.drawPile.length === 0 && this.state.trumpTaken) {
      this.state.gameOver = true;
    }
  }

  /**
   * Si le tour est à un bot, calcule son coup et l'applique.
   * Retourne le coup joué (ou null).
   */
  botMove() {
    if (!this.started || this.state.gameOver) return null;
    const seat = this.state.turn;
    const player = this.playerAtSeat(seat);
    if (!player || !player.isBot) return null;
    const memory = this.botMemories[seat] || AI.defaultMemory();
    const idx = AI.chooseBotIndex(this.state, memory, seat);
    return this.tryPlay(seat, idx);
  }

  needsBotMove() {
    if (!this.started || this.state.gameOver) return false;
    const seat = this.state.turn;
    const player = this.playerAtSeat(seat);
    return !!(player && player.isBot);
  }
}

module.exports = { GameRoom };
