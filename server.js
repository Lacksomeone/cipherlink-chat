/**
 * CipherLink E2EE Chat — Production Server
 * ──────────────────────────────────────────
 * • REST API for auth, user lookup, conversations, messages
 * • Socket.io for real-time messaging, typing indicators, seen status
 * • WebRTC signaling for P2P audio/video calls
 * • Stores only encrypted blobs — server NEVER sees plaintext
 */

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, ".env") });
const fs = require("fs");
const http = require("http");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Server } = require("socket.io");
const { DatabaseSync } = require("node:sqlite");
const { getOrCreateConversation } = require("./lib/getOrCreateConversation");

/* ─── Config ─── */
const PORT = Number(process.env.PORT) || 3001;
const CLIENT_DIST = path.join(__dirname, "client", "dist");
const isProduction = process.env.NODE_ENV === "production";

const jwtSecretFromEnv = process.env.JWT_SECRET;
if (!jwtSecretFromEnv && isProduction) {
  console.error("FATAL: JWT_SECRET must be set in .env for production.");
  process.exit(1);
}
const JWT_SECRET =
  jwtSecretFromEnv || "dev-only-change-in-production-non-prod-only";

/* ─── Database ─── */
const dbPath =
  process.env.SQLITE_PATH || path.join(__dirname, "data.sqlite");
const db = new DatabaseSync(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    public_key_json TEXT NOT NULL,
    avatar_color TEXT DEFAULT '#6366f1',
    status_text TEXT DEFAULT 'Available',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_low_id INTEGER NOT NULL,
    user_high_id INTEGER NOT NULL,
    UNIQUE(user_low_id, user_high_id),
    FOREIGN KEY (user_low_id) REFERENCES users(id),
    FOREIGN KEY (user_high_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    envelope_json TEXT NOT NULL,
    status TEXT DEFAULT 'sent',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (sender_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, id);
`);

/* ─── Express ─── */
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || true,
    credentials: true,
  })
);

/* ─── Health ─── */
app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

/* ─── JWT helpers ─── */
function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: "7d",
  });
}

function sessionUserFromPayload(payload) {
  const id = Number(payload.sub);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error("Invalid token");
  return { id, username: payload.username };
}

function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  const token = h && h.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = sessionUserFromPayload(payload);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

/* ─── Auth Routes ─── */
const AVATAR_COLORS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef", "#ec4899",
  "#f43f5e", "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#14b8a6", "#06b6d4", "#3b82f6", "#2563eb",
];

app.post("/api/register", (req, res) => {
  const { username, password, publicKey } = req.body || {};
  if (!username || !password || !publicKey) {
    return res.status(400).json({ error: "username, password, and publicKey are required" });
  }
  const u = String(username).trim();
  if (u.length < 2 || u.length > 64) {
    return res.status(400).json({ error: "username length 2–64" });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: "password must be at least 6 characters" });
  }
  let publicKeyJson;
  try {
    publicKeyJson = JSON.stringify(publicKey);
  } catch {
    return res.status(400).json({ error: "publicKey must be JSON-serializable" });
  }
  const hash = bcrypt.hashSync(String(password), 10);
  const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  try {
    const info = db
      .prepare(
        `INSERT INTO users (username, password_hash, public_key_json, avatar_color) VALUES (?, ?, ?, ?)`
      )
      .run(u, hash, publicKeyJson, color);
    const user = { id: Number(info.lastInsertRowid), username: u, avatarColor: color };
    return res.json({ token: signToken(user), user });
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "Username already taken" });
    }
    throw e;
  }
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: "username and password required" });
  }
  const row = db
    .prepare(
      `SELECT id, username, password_hash, avatar_color, status_text FROM users WHERE username = ? COLLATE NOCASE`
    )
    .get(String(username).trim());
  if (!row || !bcrypt.compareSync(String(password), row.password_hash)) {
    return res.status(401).json({ error: "Invalid credentials" });
  }
  const user = {
    id: Number(row.id),
    username: row.username,
    avatarColor: row.avatar_color,
    statusText: row.status_text,
  };
  res.json({ token: signToken(user), user });
});

app.get("/api/me", authMiddleware, (req, res) => {
  const row = db
    .prepare(
      `SELECT id, username, public_key_json, avatar_color, status_text FROM users WHERE id = ?`
    )
    .get(req.user.id);
  if (!row) return res.status(404).json({ error: "User not found" });
  res.json({
    id: row.id,
    username: row.username,
    publicKey: JSON.parse(row.public_key_json),
    avatarColor: row.avatar_color,
    statusText: row.status_text,
  });
});

/* ─── User Lookup ─── */
app.get("/api/users/lookup", authMiddleware, (req, res) => {
  const q = String(req.query.username || "").trim();
  if (!q) return res.status(400).json({ error: "username query required" });
  const row = db
    .prepare(
      `SELECT id, username, public_key_json, avatar_color FROM users WHERE username = ? COLLATE NOCASE`
    )
    .get(q);
  if (!row) return res.status(404).json({ error: "User not found" });
  if (row.id === req.user.id) {
    return res.status(400).json({ error: "Cannot chat with yourself" });
  }
  res.json({
    id: row.id,
    username: row.username,
    publicKey: JSON.parse(row.public_key_json),
    avatarColor: row.avatar_color,
  });
});

/* ─── Conversations ─── */
app.get("/api/conversations", authMiddleware, (req, res) => {
  const uid = req.user.id;
  const rows = db
    .prepare(
      `
    SELECT c.id AS conversation_id,
           CASE WHEN c.user_low_id = ? THEN c.user_high_id ELSE c.user_low_id END AS peer_id,
           u.username AS peer_username,
           u.avatar_color AS peer_avatar_color,
           m.envelope_json AS last_envelope_json,
           m.created_at AS last_at,
           m.sender_id AS last_sender_id,
           m.status AS last_status
    FROM conversations c
    JOIN users u ON u.id = CASE WHEN c.user_low_id = ? THEN c.user_high_id ELSE c.user_low_id END
    LEFT JOIN messages m ON m.id = (
      SELECT id FROM messages WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1
    )
    WHERE c.user_low_id = ? OR c.user_high_id = ?
    ORDER BY COALESCE(m.id, 0) DESC
  `
    )
    .all(uid, uid, uid, uid);

  res.json(
    rows.map((r) => ({
      id: r.conversation_id,
      peer: {
        id: r.peer_id,
        username: r.peer_username,
        avatarColor: r.peer_avatar_color,
      },
      lastMessagePreview: "[Encrypted]",
      lastAt: r.last_at || null,
      lastSenderId: r.last_sender_id,
      lastStatus: r.last_status || "sent",
    }))
  );
});

app.get("/api/conversations/:id/messages", authMiddleware, (req, res) => {
  const convId = Number(req.params.id);
  const uid = req.user.id;
  const conv = db
    .prepare(
      `SELECT id FROM conversations WHERE id = ? AND (user_low_id = ? OR user_high_id = ?)`
    )
    .get(convId, uid, uid);
  if (!conv) return res.status(404).json({ error: "Conversation not found" });

  const msgs = db
    .prepare(
      `SELECT id, sender_id, envelope_json, status, created_at
       FROM messages WHERE conversation_id = ? ORDER BY id ASC`
    )
    .all(convId);

  res.json(
    msgs.map((m) => ({
      id: m.id,
      senderId: m.sender_id,
      envelope: JSON.parse(m.envelope_json),
      status: m.status,
      createdAt: m.created_at,
    }))
  );
});

/* ─── HTTP Server + Socket.io ─── */
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || true,
    methods: ["GET", "POST"],
  },
});

/* Track online users */
const onlineUsers = new Map(); // userId -> Set<socketId>

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Unauthorized"));
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const u = sessionUserFromPayload(payload);
    socket.userId = u.id;
    socket.username = u.username;
    next();
  } catch {
    next(new Error("Unauthorized"));
  }
});

io.on("connection", (socket) => {
  const userId = socket.userId;
  const room = `user:${userId}`;
  socket.join(room);

  // Track online status
  if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
  onlineUsers.get(userId).add(socket.id);

  // Broadcast online status
  io.emit("user_online", { userId, online: true });

  /* ─── Send Message ─── */
  socket.on("send_message", (payload, ack) => {
    const { toUserId, envelope } = payload || {};
    if (!toUserId || !envelope || typeof envelope !== "object") {
      if (typeof ack === "function") ack({ ok: false, error: "Invalid payload" });
      return;
    }
    const recipient = db
      .prepare(`SELECT id FROM users WHERE id = ?`)
      .get(Number(toUserId));
    if (!recipient) {
      if (typeof ack === "function") ack({ ok: false, error: "Recipient not found" });
      return;
    }

    const convId = getOrCreateConversation(db, userId, Number(toUserId));
    let envelopeJson;
    try {
      envelopeJson = JSON.stringify(envelope);
    } catch {
      if (typeof ack === "function") ack({ ok: false, error: "Invalid envelope" });
      return;
    }

    const info = db
      .prepare(
        `INSERT INTO messages (conversation_id, sender_id, envelope_json, status) VALUES (?, ?, ?, 'sent')`
      )
      .run(convId, userId, envelopeJson);
    const messageId = Number(info.lastInsertRowid);

    const createdRow = db
      .prepare(`SELECT created_at FROM messages WHERE id = ?`)
      .get(messageId);
    const createdAt = createdRow?.created_at || new Date().toISOString();

    const recipientRow = db
      .prepare(`SELECT username FROM users WHERE id = ?`)
      .get(Number(toUserId));

    // Check if recipient is online — mark as 'delivered'
    const recipientOnline = onlineUsers.has(Number(toUserId));
    let status = "sent";
    if (recipientOnline) {
      status = "delivered";
      db.prepare(`UPDATE messages SET status = 'delivered' WHERE id = ?`).run(messageId);
    }

    const base = {
      id: messageId,
      conversationId: convId,
      senderId: userId,
      senderUsername: socket.username,
      envelope,
      status,
      createdAt,
    };

    io.to(`user:${toUserId}`).emit("message", {
      ...base,
      peerId: userId,
      peerUsername: socket.username,
    });
    io.to(`user:${userId}`).emit("message", {
      ...base,
      peerId: Number(toUserId),
      peerUsername: recipientRow?.username || "",
    });
    if (typeof ack === "function") ack({ ok: true, ...base });
  });

  /* ─── Typing Indicator ─── */
  socket.on("typing", ({ toUserId, isTyping }) => {
    io.to(`user:${toUserId}`).emit("typing", {
      fromUserId: userId,
      fromUsername: socket.username,
      isTyping: !!isTyping,
    });
  });

  /* ─── Seen / Read Receipt ─── */
  socket.on("mark_seen", ({ conversationId, messageIds }) => {
    if (!Array.isArray(messageIds) || messageIds.length === 0) return;
    const placeholders = messageIds.map(() => "?").join(",");
    db.prepare(
      `UPDATE messages SET status = 'seen' WHERE id IN (${placeholders}) AND sender_id != ?`
    ).run(...messageIds, userId);

    // Get conversation to find the sender
    const conv = db
      .prepare(`SELECT user_low_id, user_high_id FROM conversations WHERE id = ?`)
      .get(conversationId);
    if (!conv) return;
    const peerId =
      conv.user_low_id === userId ? conv.user_high_id : conv.user_low_id;

    io.to(`user:${peerId}`).emit("messages_seen", {
      conversationId,
      messageIds,
      seenBy: userId,
    });
  });

  /* ─── Online Status Check ─── */
  socket.on("check_online", ({ userIds }, ack) => {
    if (!Array.isArray(userIds)) return;
    const result = {};
    for (const id of userIds) {
      result[id] = onlineUsers.has(Number(id));
    }
    if (typeof ack === "function") ack(result);
  });

  /* ─── WebRTC Signaling ─── */
  socket.on("call:initiate", ({ toUserId, callType, offer }) => {
    io.to(`user:${toUserId}`).emit("call:incoming", {
      fromUserId: userId,
      fromUsername: socket.username,
      callType,
      offer,
    });
  });

  socket.on("call:answer", ({ toUserId, answer }) => {
    io.to(`user:${toUserId}`).emit("call:answered", {
      fromUserId: userId,
      answer,
    });
  });

  socket.on("call:ice-candidate", ({ toUserId, candidate }) => {
    io.to(`user:${toUserId}`).emit("call:ice-candidate", {
      fromUserId: userId,
      candidate,
    });
  });

  socket.on("call:reject", ({ toUserId }) => {
    io.to(`user:${toUserId}`).emit("call:rejected", {
      fromUserId: userId,
    });
  });

  socket.on("call:end", ({ toUserId }) => {
    io.to(`user:${toUserId}`).emit("call:ended", {
      fromUserId: userId,
    });
  });

  /* ─── Disconnect ─── */
  socket.on("disconnect", () => {
    const set = onlineUsers.get(userId);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {
        onlineUsers.delete(userId);
        io.emit("user_online", { userId, online: false });
      }
    }
  });
});

/* ─── Static Files (production) ─── */
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) {
      return next();
    }
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

server.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║     🔐 CipherLink E2EE Chat Server      ║
  ║──────────────────────────────────────────║
  ║  HTTP:   http://localhost:${PORT}           ║
  ║  SQLite: ${dbPath.length > 30 ? "..." + dbPath.slice(-27) : dbPath.padEnd(30)}║
  ║  Mode:   ${(isProduction ? "PRODUCTION" : "development").padEnd(30)}║
  ╚══════════════════════════════════════════╝
  `);
});
