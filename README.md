# Telegram APP — GitHub + Render

Existing UI is preserved. No aiogram and no Python are used.

Stack:
- Existing HTML/CSS/JS frontend
- Node.js + Express
- Socket.IO real-time messaging
- PostgreSQL
- Render Docker deployment

Deploy:
1. Upload this project to GitHub.
2. Render -> New -> Blueprint.
3. Select the GitHub repository.
4. Render reads render.yaml and creates the web service + PostgreSQL.
5. Open the generated Render URL.

API:
GET /api/health
POST /api/users {"username":"test"}
GET /api/messages?chat_id=global
WebSocket: Socket.IO event join_chat / send_message

Note: the original UI is preserved; its existing client-side features still need to be progressively connected to these server endpoints for every feature to become server-backed.
