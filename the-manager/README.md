# One

An AI-powered initiative tracker and strategic management tool for engineering managers and VPs. Track projects, tasks, notes, and meeting outcomes across multiple workspaces — with optional AI analysis, Gmail integration, and JIRA/Confluence connectivity.

Available as a **desktop app** (Electron, macOS/Windows) or a **web app** (Docker / Node.js + React).

---

## Features

| Area | Highlights |
|------|-----------|
| **Initiatives & Tasks** | Unlimited hierarchy, status workflow, priority, assignees, due dates, progress, tags, drag-and-drop |
| **Canvas Workspaces** | Named colour-coded workspaces scoping initiatives, tasks, and notes |
| **AI Priority** | Structural scoring (offline) + optional LLM analysis (Ollama, OpenAI, Gemini) |
| **AI Writing** | Rephrase tool — Professional, Elaborate, Concise, Simplify |
| **Mind Map** | React Flow graph of initiative hierarchies, colour-coded by status |
| **Notes** | Rich text, nested hierarchy, per-note password protection, auto-save |
| **Bookmarks** | Save and organise URLs in colour-coded nested folders; auto-fetches page title, description, and favicon |
| **Meeting Notes** | Manual entry or pull from Gmail via IMAP; AI action-item extraction |
| **JIRA / Confluence** | Link tickets/pages, live metadata, per-item and batch AI actions, chat panel |
| **Status Reports** | Auto-generate weekly/monthly progress updates and AI newsletters |
| **Cloud Sync** | Push/pull between local SQLite and Turso cloud database |
| **Security** | JWT auth, role-based access, AES-256-GCM for credentials, SSRF protection |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Node.js, Express, Prisma ORM, SQLite / Turso (libsql) |
| **Frontend** | React 18, Redux Toolkit, Material-UI v5, React Flow, Vite |
| **Desktop** | Electron (macOS & Windows) |
| **AI** | Ollama, OpenAI, Google Gemini, any OpenAI-compatible API |
| **Security** | JWT, bcrypt, AES-256-GCM |

---

## Running with Docker

### Option A — Pull from Docker Hub (quickest)

```bash
docker pull nebrix001/one-app:latest
```

Create a `.env` file:

```env
JWT_SECRET=                  # required — generate: openssl rand -hex 32
TOKEN_ENCRYPTION_KEY=        # optional — generate: openssl rand -hex 16

# Pick one database option:
TURSO_DATABASE_URL=libsql://your-db.turso.io   # recommended (no volume needed)
TURSO_AUTH_TOKEN=your-turso-auth-token

# DATABASE_URL=file:/data/app.db               # alternative: local SQLite

ALLOWED_ORIGINS=http://localhost:3000
```

Then run:

```bash
docker run -d \
  --name one-app \
  -p 3000:47421 \
  --env-file .env \
  nebrix001/one-app:latest
```

Open `http://localhost:3000`, register your account, and start.

---

### Option B — docker-compose (recommended for self-hosting)

```bash
docker compose up -d        # start
docker compose down         # stop
docker compose logs -f app  # tail logs
```

Requires the same `.env` file alongside `docker-compose.yml`.

For local SQLite, add to `docker-compose.yml`:

```yaml
volumes:
  - ./data:/data
environment:
  DATABASE_URL: file:/data/app.db
```

---

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | **Yes** | Sign session tokens. Use `openssl rand -hex 32`. |
| `TURSO_DATABASE_URL` | One of two | Turso / libsql URL, e.g. `libsql://your-db.turso.io` |
| `TURSO_AUTH_TOKEN` | If using Turso | Auth token from Turso dashboard |
| `DATABASE_URL` | One of two | Local SQLite path, e.g. `file:/data/app.db`. Mount a volume for persistence. |
| `TOKEN_ENCRYPTION_KEY` | No | 64-char hex key for encrypting stored Gmail credentials. |
| `ALLOWED_ORIGINS` | No | CORS origins, default `http://localhost:3000` |
| `PORT` | No | Internal port, default `47421` |
| `NODE_ENV` | No | Set to `production` for production deployments |

> **Minimum required**: `JWT_SECRET` + one of `TURSO_DATABASE_URL` / `DATABASE_URL`.

---

### Build the image yourself

```bash
git clone https://github.com/yourusername/one-app.git
cd the-manager
docker build -t one-app:latest .
```

---

## Desktop App

1. Download the `.dmg` (macOS) or `.exe` (Windows) from Releases
2. Install and launch — creates a local SQLite database automatically
3. Register on first launch; configure AI / Gmail / JIRA from **Setup** in the sidebar

Database file location:
- **macOS**: `~/Library/Application Support/one-desktop/app.db`
- **Windows**: `%APPDATA%\one-desktop\app.db`

---

## Configuration (all via Setup page in the app)

**AI Provider** — Ollama (local/free), Google Gemini, OpenAI, or any OpenAI-compatible API (Groq, LM Studio, etc.)

**Gmail** — Enable 2-Step Verification → generate an App Password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) → enter in Setup → Gmail

**JIRA / Confluence** — Enter your Atlassian base URL, email, and [API token](https://id.atlassian.com/manage-profile/security/api-tokens)

**Cloud Sync** — Create a free database at [turso.tech](https://turso.tech) → enter URL and token in Setup → Sync

---

## License

MIT
