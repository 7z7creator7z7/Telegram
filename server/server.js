const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.use(express.json());

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(32) UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      chat_id VARCHAR(128) NOT NULL DEFAULT 'global',
      username VARCHAR(32) NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS messages_chat_id_idx ON messages(chat_id, id);
  `);
}

app.get("/api/health", async (_, res) => {
  let db = false;
  if (pool) { try { await pool.query("SELECT 1"); db = true; } catch {} }
  res.json({ ok: true, database: db });
});

app.post("/api/users", async (req, res) => {
  const username = String(req.body.username || "").trim().slice(0, 32);
  if (!username) return res.status(400).json({ error: "Username required" });
  if (!pool) return res.status(503).json({ error: "DATABASE_URL not configured" });
  const r = await pool.query(
    "INSERT INTO users(username) VALUES($1) ON CONFLICT(username) DO UPDATE SET username=EXCLUDED.username RETURNING id, username",
    [username]
  );
  res.json(r.rows[0]);
});

app.get("/api/messages", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "DATABASE_URL not configured" });
  const chatId = String(req.query.chat_id || "global").slice(0, 128);
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const r = await pool.query(
    "SELECT id, chat_id, username, text, created_at FROM messages WHERE chat_id=$1 ORDER BY id DESC LIMIT $2",
    [chatId, limit]
  );
  res.json(r.rows.reverse());
});

io.on("connection", socket => {
  socket.on("join_chat", chatId => socket.join(String(chatId || "global")));
  socket.on("send_message", async data => {
    const username = String(data?.username || "").trim().slice(0, 32);
    const text = String(data?.text || "").trim();
    const chatId = String(data?.chat_id || "global").slice(0, 128);
    if (!username || !text) return;

    let msg = { id: null, chat_id: chatId, username, text, created_at: new Date().toISOString() };
    if (pool) {
      const r = await pool.query(
        "INSERT INTO messages(chat_id, username, text) VALUES($1,$2,$3) RETURNING id, chat_id, username, text, created_at",
        [chatId, username, text]
      );
      msg = r.rows[0];
    }
    io.to(chatId).emit("new_message", msg);
  });
});

const root = path.resolve(__dirname, "..");
app.use(express.static(root));
app.get("*", (_, res) => res.sendFile(path.join(root, "index.html")));

const port = process.env.PORT || 10000;
initDb().then(() => server.listen(port, () => console.log(`Server running on ${port}`)));
