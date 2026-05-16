/* ============================================================
   TROSA PROPI - Rendu DOM et animations
   ============================================================ */

const UI = (function () {

  // Cache des éléments DOM (perf)
  const $ = (id) => document.getElementById(id);
  const els = {};
  function cache() {
    [
      "trump", "deckTop", "msg", "score", "atout", "deckInfo",
      "turnInfo", "winnerInfo", "remainingInfo", "finalPointsInfo",
      "name1", "name2", "name3", "name0",
      "label1", "label2", "label3", "label0",
      "hand0", "hand1", "hand2", "hand3",
      "spot0", "spot1", "spot2", "spot3",
      "played0", "played1", "played2", "played3"
    ].forEach(id => { els[id] = $(id); });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  function makeCardEl(c, back = false, miniV = false) {
    const div = document.createElement("div");
    if (back) {
      div.className = "card back " + (miniV ? "miniV" : "");
      div.innerHTML = "TROSA<br>PROPI";
    } else {
      const colorClass = (c.s === "H" || c.s === "D") ? "red" : "black";
      div.className = "card " + colorClass + (miniV ? " miniV" : "");
      const sym = Rules.getSym(c.s);
      div.innerHTML =
        '<div class="corner tl"><div class="rank">' + c.r + '</div>' +
          '<div class="suit">' + sym + '</div></div>' +
        '<div class="center-rank">' + c.r + '</div>' +
        '<div class="center-suit">' + sym + '</div>' +
        '<div class="corner br"><div class="rank">' + c.r + '</div>' +
          '<div class="suit">' + sym + '</div></div>';
    }
    return div;
  }

  function getDeckRect() {
    const el = document.querySelector("#deckTop .card") ||
               document.querySelector("#trump .card");
    return el ? el.getBoundingClientRect()
              : { left: window.innerWidth/2 - 40, top: window.innerHeight/2 - 60,
                  width: 68, height: 98 };
  }

  function getHandTargetRect(player, handsLengths) {
    const hand = $("hand" + player);
    const rect = hand.getBoundingClientRect();
    const count = handsLengths[player];
    const vertical = player === 1 || player === 3;
    const cardW = vertical ? 54 : 68;
    const cardH = vertical ? 78 : 98;
    if (vertical) {
      return {
        left: rect.left + rect.width/2 - cardW/2,
        top: rect.top + Math.max(0, count - 1) * 8,
        width: cardW, height: cardH
      };
    }
    return {
      left: rect.left + rect.width/2 - cardW/2 + Math.max(0, count - 1) * 8,
      top: rect.top + 8,
      width: cardW, height: cardH
    };
  }

  function spotRect(player) {
    return $("spot" + player).getBoundingClientRect();
  }

  function updateLayoutForMode(mode, names) {
    const show = mode === "2v2";
    ["name1", "name3", "hand1", "hand3", "spot1", "spot3"].forEach(id => {
      els[id].style.visibility = show ? "visible" : "hidden";
    });
    els.name2.textContent = mode === "1v1" ? (names[2] || "Bot") : (names[2] || "Bot 2");
    els.label2.textContent = els.name2.textContent;
    if (show) {
      els.name1.textContent = names[1] || "Bot 1";
      els.name3.textContent = names[3] || "Bot 3";
      els.label1.textContent = els.name1.textContent;
      els.label3.textContent = els.name3.textContent;
    }
    els.name0.textContent = names[0] || "Toi";
    els.label0.textContent = els.name0.textContent;
  }

  /**
   * Rendu complet.
   * @param state état du jeu (mode, hands, played, trumpCard, drawPile, ...)
   * @param opts.skipHands ne pas redessiner les mains
   * @param opts.canPlay   joueur 0 peut-il jouer maintenant ?
   * @param opts.onCardClick(i) callback quand le joueur clique une carte
   * @param opts.names noms à afficher (mode online)
   * @param opts.botMemory pour afficher le compteur "IA n parties"
   */
  function render(state, opts = {}) {
    const names = opts.names || ["Toi", "Bot 1", "Bot 2", "Bot 3"];
    updateLayoutForMode(state.mode, names);

    // Atout visible
    els.trump.innerHTML = "";
    if (state.trumpCard && !state.trumpTaken) {
      els.trump.appendChild(makeCardEl(state.trumpCard));
    }

    // Dos de la pioche
    els.deckTop.innerHTML = "";
    if (state.drawPile.length > 0) {
      els.deckTop.appendChild(makeCardEl(null, true));
    }

    // Mains
    if (!opts.skipHands) {
      for (const p of [0, 1, 2, 3]) {
        const box = els["hand" + p];
        box.innerHTML = "";
        if (!Rules.activePlayers(state.mode).includes(p)) continue;
        state.hands[p].forEach((c, i) => {
          if (p === 0 && opts.viewerSeesOwnHand !== false) {
            const el = makeCardEl(c, false, false);
            if (opts.canPlay) {
              el.classList.add("playable");
              el.onclick = () => opts.onCardClick && opts.onCardClick(i);
            }
            box.appendChild(el);
          } else {
            box.appendChild(makeCardEl(null, true, p === 1 || p === 3));
          }
        });
      }
    }

    // Cartes posées
    for (const p of [0, 1, 2, 3]) {
      const slot = els["played" + p];
      slot.innerHTML = "";
      if (state.played[p]) slot.appendChild(makeCardEl(state.played[p]));
    }

    // Score
    if (state.mode === "1v1") {
      els.score.innerHTML =
        names[0] + ' : ' + state.teamScores[0] + '<br>' +
        names[2] + ' : ' + state.teamScores[1];
    } else {
      els.score.innerHTML =
        'Équipe ' + names[0] + '+' + names[2] + ' : ' + state.teamScores[0] + '<br>' +
        'Équipe ' + names[1] + '+' + names[3] + ' : ' + state.teamScores[1];
    }

    if (state.trumpCard) {
      els.atout.innerHTML =
        'Atout ' + Rules.getSuitName(state.trumpCard.s) + ' ' +
        Rules.getSym(state.trumpCard.s);
    }

    els.deckInfo.innerHTML =
      'Pioche ' + state.drawPile.length +
      (state.trumpTaken ? '' : ' + atout');

    els.turnInfo.innerHTML = state.gameOver
      ? 'Partie finie'
      : state.dealing
        ? 'Distribution...'
        : 'Tour : ' + (names[state.turn] || ('Joueur ' + state.turn));

    const remainingTxt = state.trumpTaken
      ? 'Atout déjà pris.'
      : 'Cartes avant l’atout : ' + state.drawPile.length;
    const memInfo = opts.botMemory
      ? ' • IA ' + opts.botMemory.gamesPlayed + ' partie(s)'
      : '';
    els.remainingInfo.innerHTML = remainingTxt + memInfo;

    if (state.gameOver) {
      els.winnerInfo.innerHTML = formatWinner(state, names);
      els.finalPointsInfo.innerHTML =
        'Points finaux : ' + state.teamScores[0] + ' / ' + state.teamScores[1];
    } else {
      els.finalPointsInfo.innerHTML =
        'Points actuels : ' + state.teamScores[0] + ' / ' + state.teamScores[1];
      let info = '';
      if (state.teamScores[0] >= 61 || state.teamScores[1] >= 61) {
        info = 'Seuil 61 atteint, mais la partie continue.';
      }
      els.winnerInfo.innerHTML = info;
    }

    // Mise en évidence du joueur courant
    document.querySelectorAll(".seat").forEach(s => s.classList.remove("current"));
    if (!state.gameOver && !state.dealing) {
      const seatMap = { 0: ".bottom", 1: ".leftSeat", 2: ".top", 3: ".rightSeat" };
      const sel = seatMap[state.turn];
      if (sel) {
        const seat = document.querySelector(sel);
        if (seat) seat.classList.add("current");
      }
    }
  }

  function formatWinner(state, names) {
    const a = state.teamScores[0], b = state.teamScores[1];
    if (a === b) return 'Égalité (' + a + ' à ' + b + ')';
    if (state.mode === "1v1") {
      if (a > b) return (a >= 91 ? '🏆 ' + names[0] + ' gagne double ' : '🏆 ' + names[0] + ' gagne ')
                       + '(' + a + ' à ' + b + ')';
      return (b >= 91 ? '🏆 ' + names[2] + ' gagne double ' : '🏆 ' + names[2] + ' gagne ')
           + '(' + b + ' à ' + a + ')';
    }
    if (a > b) return (a >= 91 ? '🏆 Ton équipe gagne double ' : '🏆 Ton équipe gagne ')
                     + '(' + a + ' à ' + b + ')';
    return (b >= 91 ? '🏆 L’autre équipe gagne double ' : '🏆 L’autre équipe gagne ')
         + '(' + b + ' à ' + a + ')';
  }

  // ===== Animations =====

  async function animateDealFromDeck(card, player, handsLengths) {
    const startRect = getDeckRect();
    const targetRect = getHandTargetRect(player, handsLengths);
    const fly = makeCardEl(card, player !== 0, player === 1 || player === 3);
    fly.classList.add("flying");
    fly.style.left = startRect.left + "px";
    fly.style.top  = startRect.top  + "px";
    document.body.appendChild(fly);
    requestAnimationFrame(() => {
      fly.style.left = targetRect.left + "px";
      fly.style.top  = targetRect.top  + "px";
    });
    await sleep(TIMING.flyCard);
    fly.remove();
  }

  async function animateTrumpToHand(card, player, handsLengths) {
    const el = document.querySelector("#trump .card");
    const startRect = el ? el.getBoundingClientRect() : getDeckRect();
    const targetRect = getHandTargetRect(player, handsLengths);
    const fly = makeCardEl(card, player !== 0, player === 1 || player === 3);
    fly.classList.add("flying");
    fly.style.left = startRect.left + "px";
    fly.style.top  = startRect.top  + "px";
    document.body.appendChild(fly);
    requestAnimationFrame(() => {
      fly.style.left = targetRect.left + "px";
      fly.style.top  = targetRect.top  + "px";
    });
    await sleep(TIMING.flyCard);
    fly.remove();
  }

  async function animateToTable(sourceEl, cardData, targetRect) {
    const fly = makeCardEl(cardData, false);
    fly.classList.add("flying");
    if (sourceEl) {
      const start = sourceEl.getBoundingClientRect();
      fly.style.left = start.left + "px";
      fly.style.top  = start.top  + "px";
    } else {
      fly.style.left = (window.innerWidth / 2 - 34) + "px";
      fly.style.top  = (window.innerHeight / 2 - 49) + "px";
    }
    document.body.appendChild(fly);
    requestAnimationFrame(() => {
      const w = fly.offsetWidth || 68, h = fly.offsetHeight || 98;
      fly.style.left = (targetRect.left + targetRect.width / 2 - w / 2) + "px";
      fly.style.top  = (targetRect.top + targetRect.height / 2 - h / 2) + "px";
    });
    await sleep(TIMING.playCard);
    fly.remove();
  }

  async function animateCollect(state, winner) {
    const target = getHandTargetRect(winner, state.hands.map(h => h.length));
    const flies = [];
    for (const p of Rules.activePlayers(state.mode)) {
      const el = document.querySelector("#played" + p + " .card");
      if (!el || !state.played[p]) continue;
      const f = makeCardEl(state.played[p], false);
      f.classList.add("flying");
      const r = el.getBoundingClientRect();
      f.style.left = r.left + "px";
      f.style.top  = r.top  + "px";
      document.body.appendChild(f);
      flies.push([f, p]);
    }
    for (const p of Rules.activePlayers(state.mode)) {
      $("played" + p).innerHTML = "";
    }
    requestAnimationFrame(() => {
      flies.forEach(([f], n) => {
        f.style.left = (target.left + 10 + n * 8) + "px";
        f.style.top  = (target.top  + 6  + n * 5) + "px";
        f.style.transform = "scale(.25)";
        f.style.opacity   = ".25";
      });
    });
    await sleep(TIMING.collect);
    flies.forEach(([f]) => f.remove());
  }

  function showMessage(txt) { els.msg.innerHTML = txt; }
  function clearMessage()   { els.msg.innerHTML = ""; }

  function resetTransientUI() {
    ["msg", "winnerInfo", "remainingInfo", "finalPointsInfo"].forEach(id => {
      if (els[id]) els[id].innerHTML = "";
    });
    for (const p of [0, 1, 2, 3]) {
      if (els["played" + p]) els["played" + p].innerHTML = "";
      if (els["hand" + p])   els["hand" + p].innerHTML = "";
    }
    if (els.deckTop) els.deckTop.innerHTML = "";
    if (els.trump)   els.trump.innerHTML = "";
  }

  // Init unique
  cache();

  return {
    render, makeCardEl, sleep,
    animateDealFromDeck, animateTrumpToHand, animateToTable, animateCollect,
    showMessage, clearMessage, resetTransientUI,
    spotRect, getHandTargetRect
  };
})();
