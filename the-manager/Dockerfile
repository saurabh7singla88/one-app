# ─── Stage 1: Build frontend ──────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
# VITE_API_URL can be overridden at build time; default assumes same-origin nginx proxy
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
# Member insights panel — disabled by default; set to 'true' to enable
ARG VITE_ENABLE_MEMBER_INSIGHTS=false
ENV VITE_ENABLE_MEMBER_INSIGHTS=$VITE_ENABLE_MEMBER_INSIGHTS
ARG VITE_APP_AUTHOR=Nebrix
ENV VITE_APP_AUTHOR=$VITE_APP_AUTHOR
RUN npm run build

# ─── Stage 2: Bundle backend (source stays in this stage only) ────────────────
FROM node:20-alpine AS backend-build
WORKDIR /app

# Install all deps including devDeps (esbuild + prisma CLI)
COPY backend/package*.json ./
RUN npm ci

# Copy source and schema
COPY backend/src ./src
COPY backend/prisma ./prisma

# Generate Prisma client targeting linux/alpine
RUN npx prisma generate

# Bundle everything into a single CJS file; raw source is not copied forward
RUN npm run build:bundle

# ─── Stage 3: Backend runtime (no source files) ───────────────────────────────
FROM node:20-alpine AS backend
WORKDIR /app

# Install production deps only (bcrypt native addon, @prisma/client runtime)
COPY backend/package*.json ./
RUN npm ci --omit=dev

# Copy the generated Prisma query-engine binary from the build stage
COPY --from=backend-build /app/node_modules/.prisma ./node_modules/.prisma

# Copy the bundled server into src/ so import.meta.url-based relative paths
# (../public, ../prisma/migrations) resolve identically to the original source layout
COPY --from=backend-build /app/src/server.bundle.mjs ./src/server.bundle.mjs

# Migrations directory — needed when running with a local SQLite file
COPY backend/prisma ./prisma

# Copy frontend build output served as static files by the backend
COPY --from=frontend-build /app/frontend/dist ./public

# Ensure the default SQLite data directory exists so the app works without a volume mount
RUN mkdir -p /data

# Docker image labels — shown as hints in Docker Desktop and docker inspect
LABEL org.opencontainers.image.title="One"
LABEL org.opencontainers.image.description="AI-powered initiative tracker & personal workspace"
LABEL org.opencontainers.image.source="https://github.com/saurabh7singla88/one-app"
LABEL org.opencontainers.image.licenses="MIT"
LABEL com.docker.desktop.extension.api.version="1.0.0"
# Document env vars so Docker Desktop's "Run" dialog can surface them
LABEL com.nebrix.env.JWT_SECRET="Required: signs session tokens. Auto-generated if not set (sessions reset on restart)."
LABEL com.nebrix.env.ALLOWED_ORIGINS="URL you open in the browser, e.g. http://localhost:3000. Must match the port you map."
LABEL com.nebrix.env.TURSO_DATABASE_URL="Optional: Turso cloud DB URL (libsql://...). Defaults to local SQLite at /data/app.db."
LABEL com.nebrix.env.TURSO_AUTH_TOKEN="Required if using TURSO_DATABASE_URL."
LABEL com.nebrix.env.TOKEN_ENCRYPTION_KEY="Recommended: 64-char hex key to encrypt stored Gmail/JIRA credentials."

EXPOSE 47421

CMD ["node", "src/server.bundle.mjs"]
