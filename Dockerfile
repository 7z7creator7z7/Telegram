FROM node:20-alpine
WORKDIR /app
COPY server/package.json ./server/package.json
RUN cd server && npm install --omit=dev
COPY . .
EXPOSE 10000
CMD ["node", "server/server.js"]
