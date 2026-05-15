/* ============================================================
   TROSA PROPI - Règles du jeu (deck, comparaisons, points)
   ============================================================ */

(function (root) {
  // Permet de fonctionner en navigateur ET en Node
  const C = (typeof require === "function")
    ? require("./constants.js")
    : { SUITS, RANKS, POINTS_MAP, POWER_MAP };

  function buildDeck() {
    const d = [];
    for (const s of C.SUITS) {
      for (const r of C.RANKS) {
        d.push({
          r, s: s.key,
          p: C.POINTS_MAP[r],
          pow: C.POWER_MAP[r],
          id: r + s.key
        });
      }
    }
    return d;
  }

  function shuffle(a, rng = Math.random) {
    a = [...a];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function getSym(k)      { return C.SUITS.find(s => s.key === k).sym; }
  function getSuitName(k) { return C.SUITS.find(s => s.key === k).name; }

  /**
   * Compare deux cartes pour savoir laquelle "tient" un pli.
   * @returns 1 si lead gagne, 2 si candidate gagne
   */
  function compareCards(lead, candidate, trumpSuit) {
    if (lead.s === trumpSuit && candidate.s !== trumpSuit) return 1;
    if (candidate.s === trumpSuit && lead.s !== trumpSuit) return 2;
    if (lead.s === candidate.s) return lead.pow >= candidate.pow ? 1 : 2;
    // Couleur différente, aucun atout : lead gagne (le candidat n'a pas suivi)
    return 1;
  }

  function winnerOfTrick(order, cards, trumpSuit) {
    let bestOwner = order[0];
    let bestCard  = cards[bestOwner];
    for (let i = 1; i < order.length; i++) {
      const p = order[i];
      const c = cards[p];
      if (compareCards(bestCard, c, trumpSuit) === 2) {
        bestOwner = p;
        bestCard  = c;
      }
    }
    return bestOwner;
  }

  function trumpHonorBonusForCard(card, trumpCard) {
    if (!card || !trumpCard || card.s !== trumpCard.s) return 0;
    if (card.r === "A" || card.r === "7") return 10;
    if (card.r === "K") return 4;
    if (card.r === "Q") return 3;
    if (card.r === "J") return 2;
    return 0;
  }

  function isBigTrump(card, trumpCard) {
    return !!card && !!trumpCard && card.s === trumpCard.s
        && (card.r === "A" || card.r === "7" || card.r === "K");
  }

  /**
   * Joueurs actifs selon le mode.
   * 1v1 : [0, 2]
   * 2v2 : [0, 3, 2, 1] (alternance d'équipes — toi, Bot3, Bot2, Bot1)
   */
  function activePlayers(mode) {
    return mode === "1v1" ? [0, 2] : [0, 3, 2, 1];
  }

  function nextPlayer(p, mode) {
    const arr = activePlayers(mode);
    const i = arr.indexOf(p);
    return arr[(i + 1) % arr.length];
  }

  function teamOf(player, mode) {
    if (mode === "1v1") return player === 0 ? 0 : 1;
    return (player === 0 || player === 2) ? 0 : 1;
  }

  // En TROSA PROPI, on n'est PAS obligé de fournir.
  // Cette fonction reste utilisable si on veut l'activer plus tard.
  function legalMoves(hand /*, lead, trumpSuit */) {
    return hand.map((_, i) => i);
  }

  const API = {
    buildDeck, shuffle,
    getSym, getSuitName,
    compareCards, winnerOfTrick,
    trumpHonorBonusForCard, isBigTrump,
    activePlayers, nextPlayer, teamOf,
    legalMoves
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = API;
  } else {
    root.Rules = API;
  }
})(typeof window !== "undefined" ? window : globalThis);
