/* ============================================================
   TROSA PROPI - Point d'entrée et menu
   ============================================================ */

const Main = (function () {

  const $ = (id) => document.getElementById(id);

  const screens = {
    menu:  $("menu"),
    lobby: $("lobby"),
    game:  $("game")
  };

  function show(name) {
    Object.entries(screens).forEach(([k, el]) => {
      el.classList.toggle("hidden", k !== name);
    });
  }
  function showMenu()  { show("menu"); }
  function showLobby(lobby, isHost) {
    show("lobby");
    $("lobbyCode").textContent = lobby.code;
    const ul = $("lobbyPlayers");
    ul.innerHTML = "";
    lobby.players.forEach(p => {
      const li = document.createElement("li");
      li.innerHTML = '<span>' + escapeHtml(p.name) + '</span>';
      const badges = document.createElement("span");
      if (p.isHost) badges.innerHTML += '<span class="badge host">Hôte</span> ';
      if (p.isBot)  badges.innerHTML += '<span class="badge bot">Bot</span>';
      li.appendChild(badges);
      ul.appendChild(li);
    });
    $("lobbyHostControls").classList.toggle("hidden", !isHost);
    const need = lobby.maxPlayers - lobby.players.length;
    $("lobbyWait").textContent = need > 0
      ? "En attente : " + need + " joueur(s) ou bot(s)"
      : "Tout le monde est là !";
    $("btnStartGame").disabled = need > 0;
  }
  function showGame()  { show("game"); }
  function showStatus(msg, isError) {
    const el = $("menuStatus");
    el.textContent = msg;
    el.classList.toggle("error", !!isError);
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
    }[c]));
  }

  // ====== Boutons menu ======

  function getName() {
    const v = ($("menuPseudo").value || "").trim();
    return v || "Joueur";
  }
  function getMode() { return $("menuModeSelect").value; }

  let currentMode = null; // "solo" | "online"

  $("btnSolo").addEventListener("click", async () => {
    showGame();
    UI.resetTransientUI();
    currentMode = "solo";
    await LocalGame.start(getMode());
  });

  $("btnCreate").addEventListener("click", async () => {
    if (!OnlineGame.isAvailable()) {
      showStatus("Mode online indisponible (lance le serveur Node).", true);
      return;
    }
    showStatus("Création du salon...");
    const res = await OnlineGame.createRoom(getName(), getMode());
    if (!res || !res.ok) showStatus(res?.error || "Erreur", true);
    currentMode = "online";
  });

  $("btnJoin").addEventListener("click", async () => {
    if (!OnlineGame.isAvailable()) {
      showStatus("Mode online indisponible (lance le serveur Node).", true);
      return;
    }
    const code = ($("joinCode").value || "").toUpperCase().trim();
    if (!code) { showStatus("Code requis.", true); return; }
    showStatus("Connexion au salon...");
    const res = await OnlineGame.joinRoom(code, getName());
    if (!res || !res.ok) showStatus(res?.error || "Erreur", true);
    currentMode = "online";
  });

  // ====== Lobby ======

  $("btnAddBot").addEventListener("click", async () => {
    const res = await OnlineGame.addBot();
    if (!res || !res.ok) showStatus(res?.error || "Erreur", true);
  });
  $("btnStartGame").addEventListener("click", async () => {
    const res = await OnlineGame.startGame();
    if (!res || !res.ok) showStatus(res?.error || "Erreur", true);
  });
  $("btnLeaveLobby").addEventListener("click", () => {
    OnlineGame.leave();
    showMenu();
  });
  $("btnCopyCode").addEventListener("click", () => {
    const code = $("lobbyCode").textContent;
    if (navigator.clipboard) navigator.clipboard.writeText(code);
    $("btnCopyCode").textContent = "Copié ✓";
    setTimeout(() => { $("btnCopyCode").textContent = "Copier"; }, 1500);
  });

  // ====== Boutons en jeu ======

  $("backToMenuBtn").addEventListener("click", () => {
    if (currentMode === "solo") LocalGame.stop();
    if (currentMode === "online") OnlineGame.leave();
    UI.resetTransientUI();
    showMenu();
    currentMode = null;
  });
  $("newGameBtn").addEventListener("click", () => {
    if (currentMode === "solo") LocalGame.requestNewGame();
    if (currentMode === "online") {
      showStatus("Pour relancer une partie online, retourne au lobby.");
    }
  });

  // Init : démarre sur le menu
  if (window.__noServer) {
    showStatus("Mode online indisponible (lance le serveur Node).");
  }
  showMenu();

  // ===== Service Worker (PWA) =====
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(err => {
        console.warn("Service Worker non enregistré :", err.message);
      });
    });
  }

  // ===== Empêcher le scroll vertical pendant le jeu =====
  document.addEventListener("touchmove", (e) => {
    if (e.target.closest(".players-list, input, textarea, select")) return;
    if (!screens.menu.classList.contains("hidden")) return; // menu peut scroller
    e.preventDefault();
  }, { passive: false });

  return {
    showMenu, showLobby, showGame, showStatus
  };
})();

/* ============================================================
   Helper Vibration (haptic feedback) - exposé globalement
   ============================================================ */
const Haptic = {
  light:  () => navigator.vibrate && navigator.vibrate(15),
  medium: () => navigator.vibrate && navigator.vibrate(35),
  win:    () => navigator.vibrate && navigator.vibrate([40, 60, 40]),
};
