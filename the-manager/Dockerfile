# ─── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# VITE_API_URL can be overridden at build time; default assumes same-origin nginx proxy
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ─── Stage 2: Backend runtime ─────────────────────────────────────────────────
FROM node:20-alpine AS backend
WORKDIR /app

# Install only production dependencies
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy backend source
COPY backend/src ./src
COPY backend/prisma ./prisma

# Generate Prisma client (targeting the linux/alpine native binary)
RUN npx prisma generate

# Copy frontend build output into a folder served as static files by the backend
COPY --from=frontend-build /app/frontend/dist ./public

EXPOSE 47421

# Migrations are managed via the desktop app's Turso push.
# Just start the server directly.
CMD ["node", "src/server.js"]
