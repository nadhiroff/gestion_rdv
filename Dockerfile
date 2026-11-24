# Image unique : API Node + frontend statique (server.js sert frontend/ lui-même)
FROM node:22-alpine

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/ ./

WORKDIR /app
COPY frontend ./frontend

ENV NODE_ENV=production
EXPOSE 4000
# db-init.js applique le schéma SQL (idempotent) puis démarre l'API
CMD ["sh", "-c", "cd /app/backend && node db-init.js && exec node server.js"]
