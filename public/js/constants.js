/* ============================================================
   TROSA PROPI - Constantes (cartes, points, vitesses)
   ============================================================ */

const SUITS = [
  { key: "S", sym: "♠", name: "Pique" },
  { key: "H", sym: "♥", name: "Cœur" },
  { key: "D", sym: "♦", name: "Carreau" },
  { key: "C", sym: "♣", name: "Trèfle" }
];

const RANKS = ["A", "7", "K", "Q", "J", "6", "5", "4", "3", "2"];
const POINTS_MAP = { A: 11, 7: 10, K: 4, Q: 2, J: 3, 6: 0, 5: 0, 4: 0, 3: 0, 2: 0 };
const POWER_MAP  = { A: 10, 7: 9,  K: 8, Q: 6, J: 7, 6: 5, 5: 4, 4: 3, 3: 2, 2: 1 };
// Vitesses (centralisées pour faciliter les ajustements)
const TIMING = {
  dealStep: 100,
  flyCard:  410,
  playCard: 470,
  trickResolve: 1500,   // raccourci de 2000ms à 1500ms : meilleur ressenti
  collect:  520,
  botThink: 240
};

// Seuils
const WIN_THRESHOLD = 61;     // points pour gagner
const DOUBLE_WIN    = 91;     // points pour gagner double

// Mémoire locale de l'IA
const BOT_MEMORY_KEY = "trosa_propi_bot_memory_v2";

// Export pour Node (serveur)
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SUITS, RANKS, POINTS_MAP, POWER_MAP,
    TIMING, WIN_THRESHOLD, DOUBLE_WIN, BOT_MEMORY_KEY
  };
}
