/* ============================================================
   TROSA PROPI - Mode SOLO (toi vs bots)
   ============================================================ */

const LocalGame = (function () {

  // État local
  const state = {
    mode: "1v1",
    drawPile: [],
    hands: [[], [], [], []],
    trumpCard: null,
    trumpTaken: false,
    teamScores: [0, 0],
    played: [null, null, null, null],
    gameOver: false,
    dealing: false,
    locked: false,
    leader: 0,
    turn: 0,
    trickOrder: [],
    history: []   // pour le comptage de cartes par l'IA
  };
  let botMemory = AI.loadBotMemory();
  let newGameRequested = false;
  let stopped = false;

  function names() {
    return state.mode === "1v1"
      ? ["Toi", "", "Bot", ""]
      : ["Toi", "Bot 1", "Bot 2", "Bot 3"];
  }

  function rerender(skipHands) {
    UI.render(state, {
      skipHands: !!skipHands,
      canPlay: !state.gameOver && !state.dealing && !state.locked && state.turn === 0,
      onCardClick: humanPlay,
      names: names(),
      botMemory
    });
  }

  // ========== Démarrage ==========

  async function start(mode) {
    stopped = false;
    state.mode = mode;
    const d = Rules.shuffle(Rules.buildDeck());
    state.trumpCard = d.pop();
    state.drawPile  = d;
    state.trumpTaken = false;
    state.hands = [[], [], [], []];
    state.played = [null, null, null, null];
    state.teamScores = [0, 0];
    state.leader = 0;
    state.turn = 0;
    state.trickOrder = [];
    state.gameOver = false;
    state.dealing = true;
    state.locked = true;
    state.history = [];
    newGameRequested = false;

    UI.showMessage("Distribution des cartes...");
    rerender();
    await dealHands();
    state.dealing = false;
    state.locked = false;
    UI.clearMessage();
    rerender();
    await maybeAutoplay();
  }

  async function dealHands() {
    for (let round = 0; round < 5; round++) {
      for (const p of Rules.activePlayers(state.mode)) {
        if (stopped) return;
        await dealOneCardTo(p);
        await UI.sleep(TIMING.dealStep);
      }
    }
  }

  async function dealOneCardTo(player) {
    if (state.drawPile.length === 0) return;
    const card = state.drawPile.shift();
    await UI.animateDealFromDeck(card, player, state.hands.map(h => h.length));
    state.hands[player].push(card);
    rerender();
  }

  // ========== Jouer une carte ==========

  async function humanPlay(i) {
    if (state.gameOver || state.dealing || state.locked || state.turn !== 0) return;
    state.locked = true;
    if (typeof Haptic !== "undefined") Haptic.light();
    await playCardFromHand(0, i);
    await afterAnyPlay();
  }

  async function botPlay(player) {
    const idx = AI.chooseBotIndex(state, botMemory, player);
    await playCardFromHand(player, idx);
    await afterAnyPlay();
  }

  async function playCardFromHand(player, idx) {
    const cards = document.querySelectorAll("#hand" + player + " .card");
    const source = cards[idx];
    const card = state.hands[player].splice(idx, 1)[0];
    await UI.animateToTable(source, card, UI.spotRect(player));
    state.played[player] = card;
    state.trickOrder.push(player);
    UI.showMessage(nameOf(player) + " joue " + card.r + Rules.getSym(card.s));
    rerender();
  }

  function nameOf(p) {
    return names()[p] || ("Joueur " + p);
  }

  async function afterAnyPlay() {
    const need = Rules.activePlayers(state.mode).length;
    if (state.trickOrder.length < need) {
      state.turn = Rules.nextPlayer(state.turn, state.mode);
      rerender();
      await maybeAutoplay();
      return;
    }
    await resolveTrick();
  }

  async function maybeAutoplay() {
    while (!stopped && !state.gameOver && !state.dealing && state.turn !== 0) {
      state.locked = true;
      await UI.sleep(TIMING.botThink);
      await botPlay(state.turn);
    }
    if (!stopped && !state.gameOver && state.turn === 0) {
      state.locked = false;
      rerender();
    }
  }

  // ========== Pli résolu ==========

  function trickPoints() {
    return Rules.activePlayers(state.mode).reduce(
      (s, p) => s + (state.played[p] ? state.played[p].p : 0), 0
    );
  }

  async function resolveTrick() {
    const winner = Rules.winnerOfTrick(state.trickOrder, state.played, state.trumpCard.s);
    const total = trickPoints();
    state.teamScores[Rules.teamOf(winner, state.mode)] += total;
    if (typeof Haptic !== "undefined") {
      if (winner === 0) Haptic.medium();
      else Haptic.light();
    }
    UI.showMessage(nameOf(winner) + " gagne le pli +" + total);
    rerender(true);

    // Mémorise pour le comptage de cartes
    state.history.push({
      winner,
      cards: Rules.activePlayers(state.mode).map(p => state.played[p])
    });

    await UI.sleep(TIMING.trickResolve);
    await UI.animateCollect(state, winner);

    for (const p of Rules.activePlayers(state.mode)) {
      const slot = document.getElementById("played" + p);
      if (slot) slot.innerHTML = "";
    }

    // Pioche dans l'ordre : gagnant en premier
    let p = winner;
    for (let step = 0; step < Rules.activePlayers(state.mode).length; step++) {
      await maybeDrawOne(p);
      await UI.sleep(70);
      p = Rules.nextPlayer(p, state.mode);
    }

    state.played = [null, null, null, null];
    state.trickOrder = [];
    state.leader = winner;
    state.turn = winner;

    if (endCheck()) {
      AI.updateMemoryAfterGame(botMemory, state.mode, state.teamScores);
      if (typeof Haptic !== "undefined" && state.teamScores[0] > state.teamScores[1]) {
        Haptic.win();
      }
      rerender();
      state.locked = false;
      return;
    }

    UI.clearMessage();
    rerender();
    await maybeAutoplay();
  }

  async function maybeDrawOne(player) {
    if (state.drawPile.length > 0) {
      const card = state.drawPile.shift();
      await UI.animateDealFromDeck(card, player, state.hands.map(h => h.length));
      state.hands[player].push(card);
      rerender();
    } else if (!state.trumpTaken) {
      const card = state.trumpCard;
      state.trumpTaken = true;
      await UI.animateTrumpToHand(card, player, state.hands.map(h => h.length));
      state.hands[player].push(card);
      rerender();
    }
  }

  function endCheck() {
    const active = Rules.activePlayers(state.mode);
    if (active.every(p => state.hands[p].length === 0)
        && state.drawPile.length === 0 && state.trumpTaken) {
      state.gameOver = true;
      return true;
    }
    return false;
  }

  // ========== API publique ==========

  async function requestNewGame() {
    if (state.dealing || state.locked) {
      UI.showMessage("Attends la fin de l'action en cours.");
      return;
    }
    if (!state.gameOver) {
      if (!newGameRequested) {
        newGameRequested = true;
        UI.showMessage("Confirme à nouveau pour relancer une nouvelle partie.");
        return;
      }
    }
    newGameRequested = false;
    UI.resetTransientUI();
    await start(state.mode);
  }

  function stop() {
    stopped = true;
    state.gameOver = true;
    state.locked = true;
    UI.resetTransientUI();
  }

  return { start, requestNewGame, stop };
})();
