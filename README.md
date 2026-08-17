# Telegram APP — Full Global Server Version

Existing UI/design is preserved. This version adds:
- Node.js + Express 5
- Socket.IO real-time messaging
- PostgreSQL persistence
- User synchronization
- Global chat message history
- Render Blueprint deployment

## Deploy
1. Upload the project contents to GitHub.
2. Render → New → Blueprint.
3. Select the repository.
4. Deploy the Blueprint.
5. Keep the PostgreSQL database.
6. Open the generated `.onrender.com` URL.

The backend is in `server/server.js`. The frontend bridge is appended to `index.html` and the existing design is not replaced.
