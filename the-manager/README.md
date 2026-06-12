# One

> Built by **Saurabh Singla** · [@nebrix](https://github.com/saurabh7singla88)

An AI-powered initiative tracker, task manager, and personal workspace — with optional AI analysis, Gmail integration, and JIRA/Confluence connectivity. Runs in a single Docker container.

---

## ⚡ Quickest start — Docker Desktop GUI

1. Open Docker Desktop → search **`nebrix001/one-app`** → Pull → **Run**
2. Set host port to any free port (e.g. **3000**) → 47421
3. Click **Run** → open **http://localhost:3000** (or whichever port you chose)

No environment variables needed — the app auto-configures for any localhost port.

> ⚠️ **Data is not persistent** when running from the Docker Desktop GUI — all your data will be lost if the container is removed. For persistent data, use the terminal commands below.

---

## Option 1 — Local SQLite (persistent, no account needed)

Data is stored in a folder on your machine. No sign-up required.

### Quick command

```bash
docker run -d \
  --name one-app \
  -p 3000:47421 \
  -v "$(pwd)/data:/data" \
  -e JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
  -e ALLOWED_ORIGINS=http://localhost:3000 \
  nebrix001/one-app:latest
```

Open **http://localhost:3000**, click **Register**, and you're in.
Your database is saved to `./data/app.db` on your machine.

### With a `.env` file (recommended for repeated use)

Create `one-app.env`:

```env
JWT_SECRET=        # generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ALLOWED_ORIGINS=http://localhost:3000
PUBLIC_URL=http://localhost:3000
```

Then run:

```bash
docker run -d \
  --name one-app \
  -p 3000:47421 \
  -v "$(pwd)/data:/data" \
  --env-file one-app.env \
  nebrix001/one-app:latest
```

---

## Option 2 — Turso Cloud DB (sync across devices, no volume management)

Data lives in a free cloud database — no volume mount needed.

### 1. Create your Turso database (one-time)

```bash
turso db create one-app
turso db show one-app           # copy the libsql:// URL
turso db tokens create one-app  # copy the auth token
```

Sign up free at https://turso.tech · Install CLI: https://docs.turso.tech/cli/installation

### 2. Quick command

```bash
docker run -d \
  --name one-app \
  -p 3000:47421 \
  -e JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))") \
  -e TURSO_DATABASE_URL=libsql://your-db.turso.io \
  -e TURSO_AUTH_TOKEN=your-turso-auth-token \
  -e ALLOWED_ORIGINS=http://localhost:3000 \
  nebrix001/one-app:latest
```

### 3. With a `.env` file (recommended)

Create `one-app.env`:

```env
JWT_SECRET=        # generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token
ALLOWED_ORIGINS=http://localhost:3000
PUBLIC_URL=http://localhost:3000
```

Then run:

```bash
docker run -d \
  --name one-app \
  -p 3000:47421 \
  --env-file one-app.env \
  nebrix001/one-app:latest
```

---

## Container management

```bash
docker stop one-app    # stop
docker start one-app   # start again (data persists)
docker rm -f one-app   # remove container (data folder / Turso DB unaffected)
docker logs one-app    # view logs
```

> **Custom port** — replace `-p 3000:47421` with e.g. `-p 8080:47421` and update `ALLOWED_ORIGINS` / `PUBLIC_URL` to match.

---

## Extra Features (configured in-app via Setup)

All optional. Features that aren't configured stay hidden from the sidebar.

| Feature | What you need |
|---|---|
| **AI priority & summaries** | Pick Ollama (free, local) or paste an OpenAI / Gemini / Groq API key |
| **Gmail / Meeting Notes** | Google OAuth2 client ID & secret, or a Gmail App Password |
| **JIRA / Confluence** | Atlassian base URL, email, and [API token](https://id.atlassian.com/manage-profile/security/api-tokens) |
| **Cloud Sync** | Turso database URL & token — sync between local SQLite and cloud |
| **Team Board & AI Newsletter** | Toggle on/off in Features settings |
| **Credential encryption** | Set `TOKEN_ENCRYPTION_KEY` (64-char hex) to encrypt stored passwords at rest |

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | **Yes** | Signs session tokens. Generate: `openssl rand -hex 32` |
| `TURSO_DATABASE_URL` | Option 2 | Turso DB URL, e.g. `libsql://your-db.turso.io` |
| `TURSO_AUTH_TOKEN` | Option 2 | Auth token from Turso dashboard |
| `DATABASE_URL` | Option 1 | SQLite path, e.g. `file:/data/app.db` (auto-set when using `-v ./data:/data`) |
| `ALLOWED_ORIGINS` | No | CORS origins — must match the URL you open in the browser. Default: `http://localhost:3000` |
| `PUBLIC_URL` | No | Base URL for OAuth2 redirect URIs. Default: `http://localhost:3000` |
| `TOKEN_ENCRYPTION_KEY` | No | 64-char hex key — encrypts stored Gmail / JIRA / AI credentials |
| `APP_PORT` | No | Host port (docker-compose only). Default: `3000` |

---

## Best Practices

**Always set `TOKEN_ENCRYPTION_KEY`** — especially when using Turso or any cloud database.
Without it, Gmail App Passwords, JIRA tokens, and AI API keys are stored in plaintext in the database.
Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Use a strong `JWT_SECRET`** — at least 32 random bytes. Never reuse a secret across deployments.

**Use a `.env` file instead of `-e` flags** — avoids secrets appearing in shell history and `docker inspect` output.

**For Turso** — treat your `TURSO_AUTH_TOKEN` like a password. Rotate it from the Turso dashboard if it's ever exposed.

**For local SQLite** — always mount a volume (`-v ./data:/data`). Without it, all data is lost when the container is removed.

**ALLOWED_ORIGINS must match your browser URL exactly** — including the port. If you change the port, update this variable too or you'll get CORS errors on login.

---

## License

MIT
