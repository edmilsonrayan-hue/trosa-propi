/* ============================================================
   TROSA PROPI - Serveur multijoueur (Express + Socket.IO)
   ============================================================
   Lancer avec :
     npm install
     npm start
   Le serveur écoute sur PORT (env) ou 3000.
   ============================================================ */

const path    = require("path");
const express = require("express");
const http    = require("http");
const { Server } = require("socket.io");

const { GameRoom } = require("./gameRoom.js");

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

// Sert le client statique
app.use(express.static(path.join(__dirname, "..", "public")));

// Healthcheck
app.get("/health", (_req, res) => res.json({ ok: true, rooms: rooms.size }));

// ====== Gestion des salons ======

const rooms = new Map();   // code -> GameRoom
const userToRoom = new Map(); // socketId -> code

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code;
  do {
    code = "";
    for (let i = 0; i < 4; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

function broadcastLobby(room) {
  io.to("room:" + room.code).emit("lobby", room.lobbyView());
}

function pushState(room) {
  room.pushState((socketId, ev, payload) => {
    io.to(socketId).emit(ev, payload);
  });
}

/**
 * Boucle de bots : tant que c'est au tour d'un bot, joue.
 * Délais simulés pour rendre le jeu agréable.
 */
async function runBotsUntilHuman(room) {
  while (room.needsBotMove() && !room.state.gameOver) {
    await new Promise(r => setTimeout(r, 2000));
    const result = room.botMove();
    if (!result || !result.ok) break;
    io.to("room:" + room.code).emit("played", {
      seat: result.played.seat,
      card: result.played.card
    });
    pushState(room);

    if (result.trickResolved) {
            await new Promise(r => setTimeout(r, 2500));
       io.to("room:" + room.code).emit("trickResolved", result.trickResolved);
      // Pause pour voir toutes les cartes avant le ramassage
      await new Promise(r => setTimeout(r, 1200));
      room.resolveAfterTrick(result.trickResolved.winner);
      pushState(room);
      io.to("room:" + room.code).emit("nextTurn", { turn: room.state.turn });
    }
  }
}

// ====== Sockets ======

io.on("connection", (socket) => {

  socket.on("createRoom", ({ name, mode }, cb) => {
    const code = generateCode();
    const room = new GameRoom(code, socket.id, name || "Joueur", mode || "1v1",
      (ev, payload) => io.to("room:" + code).emit(ev, payload));
    rooms.set(code, room);
    userToRoom.set(socket.id, code);
    socket.join("room:" + code);
    cb && cb({ ok: true, code });
    broadcastLobby(room);
  });

  socket.on("joinRoom", ({ code, name }, cb) => {
    code = (code || "").toUpperCase().trim();
    const room = rooms.get(code);
    if (!room) return cb && cb({ ok: false, error: "Salon introuvable." });
    if (room.started) return cb && cb({ ok: false, error: "Partie déjà commencée." });
    const r = room.addPlayer(socket.id, name || "Joueur");
    if (!r.ok) return cb && cb(r);
    userToRoom.set(socket.id, code);
    socket.join("room:" + code);
    cb && cb({ ok: true, code });
    broadcastLobby(room);
  });

  socket.on("addBot", (_, cb) => {
    const code = userToRoom.get(socket.id);
    const room = code && rooms.get(code);
    if (!room) return cb && cb({ ok: false, error: "Pas dans un salon." });
    if (socket.id !== room.hostSocketId) return cb && cb({ ok: false, error: "Hôte uniquement." });
    const r = room.addBot();
    cb && cb(r);
    broadcastLobby(room);
  });

  socket.on("startGame", async (_, cb) => {
    const code = userToRoom.get(socket.id);
    const room = code && rooms.get(code);
    if (!room) return cb && cb({ ok: false, error: "Pas dans un salon." });
    if (socket.id !== room.hostSocketId) return cb && cb({ ok: false, error: "Hôte uniquement." });
    const r = room.start();
    if (!r.ok) return cb && cb(r);
    cb && cb({ ok: true });
    io.to("room:" + code).emit("gameStarted", { mode: room.mode });
    pushState(room);
    // Si c'est à un bot, joue tout de suite
    runBotsUntilHuman(room).catch(e => console.error(e));
  });

  socket.on("playCard", async ({ idx }, cb) => {
    const code = userToRoom.get(socket.id);
    const room = code && rooms.get(code);
    if (!room || !room.started) return cb && cb({ ok: false, error: "Pas en partie." });
    const me = room.players.find(p => p.socketId === socket.id);
    if (!me) return cb && cb({ ok: false, error: "Pas un joueur du salon." });

    const result = room.tryPlay(me.seat, idx);
    if (!result.ok) return cb && cb(result);
    cb && cb({ ok: true });

    io.to("room:" + code).emit("played", {
      seat: result.played.seat,
      card: result.played.card
    });
    pushState(room);

    if (result.trickResolved) {
            await new Promise(r => setTimeout(r, 2500));
       io.to("room:" + code).emit("trickResolved", result.trickResolved);
      await new Promise(r => setTimeout(r, 1200));
      room.resolveAfterTrick(result.trickResolved.winner);
      pushState(room);
      io.to("room:" + code).emit("nextTurn", { turn: room.state.turn });
    }

    // Enchaîne les bots
    runBotsUntilHuman(room).catch(e => console.error(e));
  });

  socket.on("reaction", ({ emoji }) => {
    const code = userToRoom.get(socket.id);
    const room = code && rooms.get(code);
    if (!room) return;
    const me = room.players.find(p => p.socketId === socket.id);
    if (!me || me.seat === undefined) return;
    // Limite simple : 1 char emoji (en pratique : on accepte n'importe quelle chaîne courte)
    const safe = String(emoji || "").slice(0, 6);
    if (!safe) return;
    io.to("room:" + code).emit("reaction", { seat: me.seat, emoji: safe });
  });

    socket.on("chat", ({ name, text }) => { const code = userToRoom.get(socket.id); if (!code) return; const safeText = String(text || "").slice(0, 80).trim(); const safeName = String(name || "Joueur").slice(0, 14); if (!safeText) return; socket.to("room:" + code).emit("chat", { name: safeName, text: safeText }); });
   socket.on("leaveRoom", (_, cb) => {
    leaveRoom(socket);
    cb && cb({ ok: true });
  });

  socket.on("disconnect", () => {
    leaveRoom(socket);
  });

  function leaveRoom(socket) {
    const code = userToRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    userToRoom.delete(socket.id);
    if (!room) return;
    socket.leave("room:" + code);
    const r = room.removePlayer(socket.id);
    if (r.empty || (room.started && room.players.filter(p => !p.isBot).length === 0)) {
      rooms.delete(code);
    } else {
      broadcastLobby(room);
      io.to("room:" + code).emit("playerLeft", { socketId: socket.id });
    }
  }
});

server.listen(PORT, () => {
  console.log(`TROSA PROPI server écoute sur :${PORT}`);
});
