# Image unique : API Node + frontend statique (server.js sert frontend/ lui-même)
FROM node:22-alpine

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/server.js ./

WORKDIR /app
COPY frontend ./frontend

ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "backend/server.js"]
