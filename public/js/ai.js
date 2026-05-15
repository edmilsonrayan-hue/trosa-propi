/* ============================================================
   TROSA PROPI - IA des bots
   ============================================================
   Améliorations vs version précédente :
   - Comptage des cartes vues (par couleur)
   - Estimation du nombre de cartes restantes par couleur
   - Évaluation plus fine de la position dans le pli
   - Gestion plus prudente des grosses cartes en fin de partie
   ============================================================ */

(function (root) {
  const R = (typeof require === "function") ? require("./rules.js") : root.Rules;
  const C = (typeof require === "function") ? require("./constants.js")
                                             : { BOT_MEMORY_KEY };

  // ----- Mémoire IA persistée (localStorage) -----
  function loadBotMemory() {
    if (typeof localStorage === "undefined") return defaultMemory();
    try {
      const raw = localStorage.getItem(C.BOT_MEMORY_KEY);
      if (raw) return Object.assign(defaultMemory(), JSON.parse(raw));
    } catch (_) {}
    return defaultMemory();
  }
  function defaultMemory() {
    return {
      gamesPlayed: 0,
      cautiousTrump: 1.0,
      protectPartnerPoints: 1.0,
      pressureWithSuit: 1.0,
      rescueBigTricks: 1.0
    };
  }
  function saveBotMemory(memory) {
    if (typeof localStorage === "undefined") return;
    try { localStorage.setItem(C.BOT_MEMORY_KEY, JSON.stringify(memory)); } catch (_) {}
  }

  // Évolution de la mémoire après une partie
  function updateMemoryAfterGame(memory, mode, teamScores) {
    memory.gamesPlayed += 1;
    if (mode === "1v1") {
      if (teamScores[1] > teamScores[0]) {
        memory.cautiousTrump   = Math.min(1.6, memory.cautiousTrump + 0.03);
        memory.rescueBigTricks = Math.min(1.8, memory.rescueBigTricks + 0.03);
      } else {
        memory.cautiousTrump   = Math.max(0.9, memory.cautiousTrump - 0.01);
      }
    } else {
      if (teamScores[1] > teamScores[0]) {
        memory.protectPartnerPoints = Math.min(1.9, memory.protectPartnerPoints + 0.04);
        memory.pressureWithSuit     = Math.min(1.8, memory.pressureWithSuit + 0.03);
        memory.rescueBigTricks      = Math.min(1.9, memory.rescueBigTricks + 0.03);
      } else {
        memory.protectPartnerPoints = Math.max(1.0, memory.protectPartnerPoints - 0.01);
      }
    }
    saveBotMemory(memory);
  }

  // ----- Helpers tactiques -----

  function trickPoints(state) {
    return R.activePlayers(state.mode).reduce(
      (s, p) => s + (state.played[p] ? state.played[p].p : 0), 0
    );
  }

  function apparentTrumpBonus(state) {
    let total = 0;
    for (const p of R.activePlayers(state.mode)) {
      total += R.trumpHonorBonusForCard(state.played[p], state.trumpCard);
    }
    const cap = state.mode === "1v1" ? 10 : 20;
    return Math.min(total, cap);
  }

  function strategicPointsOnTable(state) {
    return trickPoints(state) + apparentTrumpBonus(state);
  }

  function partnerPointsOnTable(state, player) {
    if (state.mode !== "2v2") return 0;
    const partner = (player + 2) % 4;
    if (!state.played[partner]) return 0;
    return state.played[partner].p
         + R.trumpHonorBonusForCard(state.played[partner], state.trumpCard);
  }

  function currentWinningPlayer(state) {
    if (!state.trickOrder.length) return null;
    let best = state.trickOrder[0], bestCard = state.played[best];
    for (let i = 1; i < state.trickOrder.length; i++) {
      const p = state.trickOrder[i];
      if (R.compareCards(bestCard, state.played[p], state.trumpCard.s) === 2) {
        best = p; bestCard = state.played[p];
      }
    }
    return best;
  }

  function lastTrumpStillVisible(state) {
    return state.drawPile.length === 0 && !state.trumpTaken && !!state.trumpCard;
  }
  function shouldBaitForLastTrump(state) {
    return lastTrumpStillVisible(state) && R.isBigTrump(state.trumpCard, state.trumpCard);
  }

  /**
   * Combien de cartes d'une couleur peuvent encore être en jeu (chez les autres + pioche).
   * Basé sur ce que le bot voit (sa main + cartes jouées + atout visible).
   */
  function unseenInSuit(state, player, suitKey) {
    let seen = 0;
    // Main du bot
    for (const c of state.hands[player]) if (c.s === suitKey) seen++;
    // Cartes jouées dans le pli courant
    for (const c of state.played) if (c && c.s === suitKey) seen++;
    // Cartes déjà ramassées (history)
    if (state.history) {
      for (const trick of state.history) {
        for (const c of trick.cards) if (c && c.s === suitKey) seen++;
      }
    }
    // Atout visible (pas encore pris)
    if (!state.trumpTaken && state.trumpCard && state.trumpCard.s === suitKey) seen++;
    return Math.max(0, 8 - seen); // 8 cartes par couleur (32 cartes)
  }

  // ----- Évaluation et choix -----

  function evaluateCardForBot(state, memory, player, card) {
    const trump = state.trumpCard.s;
    const strategicPts = strategicPointsOnTable(state);
    const leadPlayer = state.trickOrder[0];
    const leadCard = (leadPlayer === undefined) ? null : state.played[leadPlayer];
    const curWinner = currentWinningPlayer(state);
    const partner = state.mode === "2v2" ? ((player + 2) % 4) : null;
    const partnerWinning = state.mode === "2v2" && curWinner === partner;
    const pos = state.trickOrder.length + 1;
    const activeCount = R.activePlayers(state.mode).length;
    const lastToPlay = pos === activeCount;
    const trumpHonorValue = R.trumpHonorBonusForCard(card, state.trumpCard);
    const partnerPts = partnerPointsOnTable(state, player);
    const baitLastTrump = shouldBaitForLastTrump(state);
    const cardsLeft = state.hands[player].length;
    const endgame = state.drawPile.length === 0;

    // "Coût" de jouer cette carte (plus c'est haut, moins on veut la jouer)
    let cheap = card.p * 6 + card.pow + (card.s === trump ? 12 * memory.cautiousTrump : 0);

    if (card.s === trump && (card.r === "A" || card.r === "7")) cheap += 22 * memory.cautiousTrump;
    if (card.s === trump && card.r === "K") cheap += 10 * memory.cautiousTrump;

    // ===== Cas 1 : on entame =====
    if (!leadCard) {
      let score = cheap;

      if (card.p === 0) score -= 18;
      if (card.s === trump) score += 16 * memory.cautiousTrump;
      if (card.pow >= 9) score += 12;

      if (card.s === trump && (card.r === "A" || card.r === "7")) score += 10;
      if (card.s === trump && trumpHonorValue >= 10) score += 14 * memory.cautiousTrump;

      // En endgame, attaquer avec les couleurs où on a la maîtrise
      if (endgame && card.s !== trump) {
        const remaining = unseenInSuit(state, player, card.s);
        if (remaining <= 1 && card.pow >= 8) score -= 14; // probable maître
      }

      // Logique de "bait" pour le dernier atout visible
      if (baitLastTrump) {
        if (card.s !== trump) {
          if (card.pow >= 7) score -= 16;
          if (card.p > 0) score -= 8;
        } else {
          score += 24;
        }
      }

      return score;
    }

    // ===== Cas 2 : on suit =====
    const curBest = state.played[curWinner];
    const wouldWin = R.compareCards(curBest, card, trump) === 2;
    const importantPoints = strategicPts >= 10 || partnerPts >= 10;

    // 2v2, dernier à jouer, partenaire a entamé et tient le pli :
    // ne pas surcoupervinaigrer sans raison
    if (state.mode === "2v2" && pos === 3 && partner === leadPlayer && partnerWinning && leadCard) {
      if (card.s === leadCard.s && card.pow > state.played[partner].pow) {
        let score = cheap - (20 * memory.pressureWithSuit);
        if (importantPoints) score -= (20 * memory.protectPartnerPoints);
        if (card.p > 0) score += 10;
        return score;
      }
    }

    if (wouldWin) {
      let score = cheap;
      if (importantPoints) score -= (40 * memory.rescueBigTricks);
      if (lastToPlay) score -= 18;

      if (state.mode === "2v2" && !partnerWinning && partnerPts >= 10) {
        score -= (30 * memory.protectPartnerPoints);
      }

      if (strategicPts >= (state.mode === "1v1" ? 10 : 20) && trumpHonorValue >= 10) {
        score += 8;
      }

      if (partnerWinning) {
        score += 26;
        if (importantPoints) score -= (18 * memory.protectPartnerPoints);
        if (pos === 3 && leadCard && card.s === leadCard.s
            && card.pow > state.played[partner].pow) {
          score -= (20 * memory.pressureWithSuit);
        }
      }

      if (card.s === trump && curBest.s !== trump) score += 8;

      // Conserver le gros atout si encore visible
      if (baitLastTrump && card.s === trump
          && strategicPts < (state.mode === "1v1" ? 10 : 20)) {
        score += 18;
      }

      return score;
    }

    // ===== Cas 3 : on perd =====
    let score = cheap;
    if (card.p > 0) score += 18;
    if (card.s === trump) score += 16;

    if (card.s === trump && trumpHonorValue >= 10
        && strategicPts < (state.mode === "1v1" ? 10 : 20)) {
      score += 16 * memory.cautiousTrump;
    }

    if (partnerWinning) {
      score -= 12;
      if (card.p === 0 && card.s !== trump) score -= 10;
    }

    if (baitLastTrump && card.s !== trump && card.pow >= 6 && card.p === 0) {
      score -= 10;
    }

    return score;
  }

  function chooseBotIndex(state, memory, player) {
    const curWinner = currentWinningPlayer(state);
    const partnerPts = partnerPointsOnTable(state, player);
    const ptsOnTable = strategicPointsOnTable(state);

    // Sauvetage : si l'adversaire tient un pli important, essayer de le couper
    if (curWinner !== null && R.teamOf(curWinner, state.mode) !== R.teamOf(player, state.mode)) {
      const rescue = strongestWinningCardInfo(state, player);
      if (rescue && (ptsOnTable >= (state.mode === "1v1" ? 10 : 20) || partnerPts >= 10)) {
        return rescue.i;
      }
    }

    let best = 0, bestScore = Infinity;
    state.hands[player].forEach((c, i) => {
      const s = evaluateCardForBot(state, memory, player, c);
      if (s < bestScore) { bestScore = s; best = i; }
    });
    return best;
  }

  function strongestWinningCardInfo(state, player) {
    const curWinner = currentWinningPlayer(state);
    if (curWinner === null) return null;
    const curBest = state.played[curWinner];
    const winning = [];
    state.hands[player].forEach((c, i) => {
      if (R.compareCards(curBest, c, state.trumpCard.s) === 2) {
        winning.push({ i, card: c });
      }
    });
    if (!winning.length) return null;
    // On prend la moins chère parmi les cartes gagnantes
    winning.sort((a, b) => {
      const trump = state.trumpCard.s;
      const av = a.card.p * 6 + a.card.pow + (a.card.s === trump ? 10 : 0);
      const bv = b.card.p * 6 + b.card.pow + (b.card.s === trump ? 10 : 0);
      return av - bv;
    });
    return winning[0];
  }

  const API = {
    loadBotMemory, saveBotMemory, defaultMemory, updateMemoryAfterGame,
    chooseBotIndex, evaluateCardForBot,
    shouldBaitForLastTrump, lastTrumpStillVisible
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = API;
  } else {
    root.AI = API;
  }
})(typeof window !== "undefined" ? window : globalThis);
