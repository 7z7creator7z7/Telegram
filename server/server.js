const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });
const PORT = process.env.PORT || 10000;

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
  : null;

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

async function initDb() {
  if (!pool) return console.log('DATABASE_URL is not configured');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      name VARCHAR(150),
      avatar TEXT,
      telegram_id VARCHAR(100),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS chats (
      id VARCHAR(150) PRIMARY KEY,
      name VARCHAR(150) NOT NULL,
      username VARCHAR(150),
      type VARCHAR(30) NOT NULL DEFAULT 'private',
      owner_username VARCHAR(100),
      joined BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS messages (
      id BIGSERIAL PRIMARY KEY,
      chat_id VARCHAR(150) NOT NULL,
      username VARCHAR(100) NOT NULL,
      text TEXT NOT NULL,
      sender VARCHAR(20) DEFAULT 'me',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS messages_chat_id_idx ON messages(chat_id, id);
  `);
  console.log('PostgreSQL initialized');
}

app.get('/api/health', async (req, res) => {
  let database = false;
  try { if (pool) { await pool.query('SELECT 1'); database = true; } } catch {}
  res.json({ ok: true, server: 'online', database });
});

app.post('/api/users', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database unavailable' });
    const username = String(req.body.username || '').trim().slice(0, 100);
    if (!username) return res.status(400).json({ error: 'username required' });
    const name = req.body.name ? String(req.body.name).slice(0, 150) : username.replace(/^@/, '');
    const result = await pool.query(`
      INSERT INTO users(username,name,avatar,telegram_id) VALUES($1,$2,$3,$4)
      ON CONFLICT(username) DO UPDATE SET name=EXCLUDED.name, avatar=EXCLUDED.avatar, telegram_id=EXCLUDED.telegram_id
      RETURNING *`, [username, name, req.body.avatar || null, req.body.telegram_id || null]);
    res.json({ ok: true, user: result.rows[0] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'user save failed' }); }
});

app.get('/api/users', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });
  const r = await pool.query('SELECT * FROM users ORDER BY id DESC LIMIT 500');
  res.json({ ok: true, users: r.rows });
});

app.get('/api/messages', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database unavailable' });
    const chatId = String(req.query.chat_id || 'chat-global');
    const limit = Math.max(1, Math.min(Number(req.query.limit) || 100, 500));
    const r = await pool.query(
      'SELECT id,chat_id,username,text,sender,created_at FROM messages WHERE chat_id=$1 ORDER BY id DESC LIMIT $2',
      [chatId, limit]
    );
    res.json({ ok: true, messages: r.rows.reverse() });
  } catch (e) { console.error(e); res.status(500).json({ error: 'messages load failed' }); }
});

app.post('/api/messages', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database unavailable' });
    const chatId = String(req.body.chat_id || 'chat-global');
    const username = String(req.body.username || '').slice(0, 100);
    const text = String(req.body.text || '').trim();
    if (!username || !text) return res.status(400).json({ error: 'username and text required' });
    const r = await pool.query(
      'INSERT INTO messages(chat_id,username,text,sender) VALUES($1,$2,$3,$4) RETURNING id,chat_id,username,text,sender,created_at',
      [chatId, username, text, 'me']
    );
    const msg = r.rows[0];
    io.to(chatId).emit('server_message', msg);
    res.json({ ok: true, message: msg });
  } catch (e) { console.error(e); res.status(500).json({ error: 'message save failed' }); }
});

app.post('/api/chats', async (req, res) => {
  try {
    if (!pool) return res.status(503).json({ error: 'Database unavailable' });
    const id = String(req.body.id || ('chat-' + Date.now())).slice(0, 150);
    const name = String(req.body.name || 'Chat').slice(0, 150);
    const username = req.body.username ? String(req.body.username).slice(0, 150) : null;
    const type = String(req.body.type || 'private').slice(0, 30);
    const owner = req.body.owner_username ? String(req.body.owner_username).slice(0, 100) : null;
    const r = await pool.query(`
      INSERT INTO chats(id,name,username,type,owner_username,joined)
      VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name, username=EXCLUDED.username, type=EXCLUDED.type, owner_username=EXCLUDED.owner_username
      RETURNING *`, [id, name, username, type, owner, true]);
    res.json({ ok: true, chat: r.rows[0] });
  } catch (e) { console.error(e); res.status(500).json({ error: 'chat save failed' }); }
});

app.get('/api/chats', async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database unavailable' });
  const r = await pool.query('SELECT * FROM chats ORDER BY created_at DESC');
  res.json({ ok: true, chats: r.rows });
});

io.on('connection', socket => {
  socket.on('join_chat', chatId => { if (chatId) socket.join(String(chatId)); });
  socket.on('leave_chat', chatId => { if (chatId) socket.leave(String(chatId)); });
  socket.on('typing', data => {
    const chatId = String(data?.chat_id || 'chat-global');
    socket.to(chatId).emit('typing', { username: data?.username || '' });
  });
});

const ROOT = path.join(__dirname, '..');
app.use(express.static(ROOT));
app.get('/{*splat}', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));

initDb().then(() => {
  server.listen(PORT, '0.0.0.0', () => console.log(`Telegram server listening on ${PORT}`));
}).catch(err => { console.error('DB startup error', err); process.exit(1); });
