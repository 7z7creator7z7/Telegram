const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const { Pool } = require("pg");

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 10000;

// ===============================
// DATABASE
// ===============================

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: {
        rejectUnauthorized: false,
      },
    })
  : null;

// ===============================
// SOCKET.IO
// ===============================

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// ===============================
// MIDDLEWARE
// ===============================

app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));

// ===============================
// FRONTEND
// ===============================

const frontendPath = path.join(__dirname);

app.use(express.static(frontendPath));

// ===============================
// DATABASE INITIALIZATION
// ===============================

async function initDatabase() {
  if (!pool) {
    console.log("DATABASE_URL not configured.");
    return;
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        display_name VARCHAR(100),
        avatar TEXT,
        telegram_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) NOT NULL,
        chat_id VARCHAR(150) NOT NULL DEFAULT 'global',
        text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS chats (
        id SERIAL PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        type VARCHAR(30) DEFAULT 'private',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_members (
        id SERIAL PRIMARY KEY,
        chat_id INTEGER REFERENCES chats(id) ON DELETE CASCADE,
        username VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("Database initialized successfully.");
  } catch (error) {
    console.error("Database initialization error:");
    console.error(error);
  }
}

// ===============================
// HEALTH CHECK
// ===============================

app.get("/api/health", async (req, res) => {
  let database = false;

  if (pool) {
    try {
      await pool.query("SELECT 1");
      database = true;
    } catch (error) {
      database = false;
    }
  }

  res.json({
    ok: true,
    server: "online",
    database,
    time: new Date().toISOString(),
  });
});

// ===============================
// USERS
// ===============================

app.post("/api/users", async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({
        error: "Database is not configured",
      });
    }

    const {
      username,
      display_name = null,
      avatar = null,
      telegram_id = null,
    } = req.body;

    if (!username || !String(username).trim()) {
      return res.status(400).json({
        error: "Username is required",
      });
    }

    const cleanUsername = String(username).trim().substring(0, 100);

    const result = await pool.query(
      `
      INSERT INTO users
        (username, display_name, avatar, telegram_id)
      VALUES
        ($1, $2, $3, $4)
      ON CONFLICT (username)
      DO UPDATE SET
        display_name = EXCLUDED.display_name,
        avatar = EXCLUDED.avatar,
        telegram_id = EXCLUDED.telegram_id
      RETURNING *;
      `,
      [
        cleanUsername,
        display_name,
        avatar,
        telegram_id,
      ]
    );

    res.json({
      ok: true,
      user: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to create user",
    });
  }
});

// ===============================
// GET USERS
// ===============================

app.get("/api/users", async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({
        error: "Database is not configured",
      });
    }

    const result = await pool.query(`
      SELECT *
      FROM users
      ORDER BY id DESC
      LIMIT 500;
    `);

    res.json({
      ok: true,
      users: result.rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to load users",
    });
  }
});

// ===============================
// GET USER
// ===============================

app.get("/api/users/:username", async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({
        error: "Database is not configured",
      });
    }

    const username = req.params.username;

    const result = await pool.query(
      `
      SELECT *
      FROM users
      WHERE username = $1
      LIMIT 1;
      `,
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    res.json({
      ok: true,
      user: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to load user",
    });
  }
});

// ===============================
// SEND MESSAGE
// ===============================

app.post("/api/messages", async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({
        error: "Database is not configured",
      });
    }

    const {
      username,
      text,
      chat_id = "global",
    } = req.body;

    if (!username || !text) {
      return res.status(400).json({
        error: "Username and text are required",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO messages
        (username, chat_id, text)
      VALUES
        ($1, $2, $3)
      RETURNING *;
      `,
      [
        String(username).substring(0, 100),
        String(chat_id).substring(0, 150),
        String(text),
      ]
    );

    const message = result.rows[0];

    // Real-time message
    io.emit("message", message);

    res.json({
      ok: true,
      message,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to send message",
    });
  }
});

// ===============================
// GET MESSAGES
// ===============================

app.get("/api/messages", async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({
        error: "Database is not configured",
      });
    }

    const chatId = req.query.chat_id || "global";

    let limit = Number(req.query.limit || 100);

    if (!Number.isFinite(limit)) {
      limit = 100;
    }

    limit = Math.max(1, Math.min(limit, 500));

    const result = await pool.query(
      `
      SELECT *
      FROM messages
      WHERE chat_id = $1
      ORDER BY id DESC
      LIMIT $2;
      `,
      [String(chatId), limit]
    );

    res.json({
      ok: true,
      messages: result.rows.reverse(),
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to load messages",
    });
  }
});

// ===============================
// CREATE CHAT
// ===============================

app.post("/api/chats", async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({
        error: "Database is not configured",
      });
    }

    const {
      name,
      type = "private",
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({
        error: "Chat name is required",
      });
    }

    const result = await pool.query(
      `
      INSERT INTO chats
        (name, type)
      VALUES
        ($1, $2)
      RETURNING *;
      `,
      [
        String(name).trim().substring(0, 150),
        String(type).substring(0, 30),
      ]
    );

    res.json({
      ok: true,
      chat: result.rows[0],
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to create chat",
    });
  }
});

// ===============================
// GET CHATS
// ===============================

app.get("/api/chats", async (req, res) => {
  try {
    if (!pool) {
      return res.status(503).json({
        error: "Database is not configured",
      });
    }

    const result = await pool.query(`
      SELECT *
      FROM chats
      ORDER BY id DESC;
    `);

    res.json({
      ok: true,
      chats: result.rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Failed to load chats",
    });
  }
});

// ===============================
// SOCKET.IO CONNECTION
// ===============================

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join_chat", (chatId) => {
    if (!chatId) return;

    socket.join(String(chatId));

    console.log(
      `${socket.id} joined chat ${chatId}`
    );
  });

  socket.on("send_message", async (data) => {
    try {
      if (!data) return;

      const username = String(
        data.username || ""
      ).trim();

      const text = String(
        data.text || ""
      ).trim();

      const chatId = String(
        data.chat_id || "global"
      );

      if (!username || !text) {
        return;
      }

      let message;

      if (pool) {
        const result = await pool.query(
          `
          INSERT INTO messages
            (username, chat_id, text)
          VALUES
            ($1, $2, $3)
          RETURNING *;
          `,
          [
            username.substring(0, 100),
            chatId.substring(0, 150),
            text,
          ]
        );

        message = result.rows[0];
      } else {
        message = {
          id: null,
          username,
          chat_id: chatId,
          text,
          created_at: new Date(),
        };
      }

      // Send only to this chat
      io.to(chatId).emit(
        "message",
        message
      );

      // Also send to sender
      socket.emit(
        "message",
        message
      );

    } catch (error) {
      console.error(
        "Socket message error:",
        error
      );
    }
  });

  socket.on("typing", (data) => {
    if (!data) return;

    const chatId = String(
      data.chat_id || "global"
    );

    socket
      .to(chatId)
      .emit("typing", {
        username: data.username || "",
      });
  });

  socket.on("disconnect", () => {
    console.log(
      "User disconnected:",
      socket.id
    );
  });
});

// ===============================
// FRONTEND FALLBACK
// ===============================
//
// IMPORTANT:
// Express 5 does NOT accept:
// app.get("*", ...)
//
// We use /{*splat} instead.
// This fixes:
// PathError: Missing parameter name at index 1: *
// ===============================

app.get("/{*splat}", (req, res) => {
  res.sendFile(
    path.join(frontendPath, "index.html")
  );
});

// ===============================
// ERROR HANDLER
// ===============================

app.use((err, req, res, next) => {
  console.error("Server error:", err);

  if (res.headersSent) {
    return next(err);
  }

  res.status(500).json({
    error: "Internal server error",
  });
});

// ===============================
// START SERVER
// ===============================

async function startServer() {
  await initDatabase();

  server.listen(PORT, "0.0.0.0", () => {
    console.log(
      `Server running on port ${PORT}`
    );
  });
}

startServer().catch((error) => {
  console.error(
    "Failed to start server:"
  );

  console.error(error);

  process.exit(1);
});
