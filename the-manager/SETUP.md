# Setup Guide

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- A free [Turso](https://turso.tech) account (cloud SQLite — free tier is sufficient)

---

## 1. Create your database

Sign up at https://turso.tech, then run the Turso CLI:

```bash
turso db create one-app
turso db show one-app          # copy the URL
turso db tokens create one-app # copy the auth token
```

---

## 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in the three required values:

```env
TURSO_DATABASE_URL=libsql://your-db-name.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token
JWT_SECRET=any-long-random-string
```

Generate a strong `JWT_SECRET` if you need one:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 3. Start the app

```bash
npm run docker:build
```

This builds the image, runs all database migrations automatically, and starts the container.
Open **http://localhost:3000** in your browser.

---

## 4. Register your account

Click **Register** on the login page to create your first account. No pre-seeded users exist.

---

## 5. Configure optional features (in-app)

Everything below is configured through **Setup** in the sidebar — no `.env` changes needed:

| Feature | Setup section | What to provide |
|---|---|---|
| AI priority scoring & summaries | AI Model | Provider (Ollama / OpenAI / Gemini / compatible), API key, model |
| Meeting Notes | Gmail | Gmail address, App Password, Gmail label name |
| Team Board | JIRA | JIRA base URL, email, API token |

Features not configured simply stay disabled and are hidden from the sidebar.

---

## Optional: encrypt stored Gmail password

If you use Meeting Notes and want the Gmail app-password stored encrypted in the database, add a `TOKEN_ENCRYPTION_KEY` to `.env`:

```bash
# Generate a 64-char hex key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```env
TOKEN_ENCRYPTION_KEY=your-64-char-hex-string
```

Then rebuild: `npm run docker:build`. Without this key the password is stored in plaintext.

---

## Useful commands

| Command | What it does |
|---|---|
| `npm run docker:build` | Build image + start (or restart after code changes) |
| `npm run docker:logs` | Tail container logs |
| `npm run docker:down` | Stop the container |
| `npm run docker:restart` | Restart without rebuilding |

---

## Troubleshooting

**Container starts but app is blank / API errors**
- Run `npm run docker:logs` and look for migration or connection errors.
- Confirm `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are correct in `.env`.

**Port 3000 already in use**
- Edit `docker-compose.yml` and change `"3000:47421"` to e.g. `"3001:47421"`, then rebuild.

**Forgot JWT_SECRET after data exists**
- Sessions will be invalidated (users must log in again) but data is unaffected. Update `.env` and rebuild.
```

Opens at http://localhost:5555

## Useful Commands

### Backend
- `npm run dev` - Start with hot reload
- `npm start` - Production start
- `npm run db:migrate` - Run migrations
- `npm run db:studio` - Open Prisma Studio

### Frontend
- `npm run dev` - Development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Default Test User

After registration, you can create a test user directly in the database:

```powershell
cd backend
npx prisma studio
```

Then navigate to Users table and add a user (password must be bcrypt hashed).

Or just use the Register page in the UI!

## Next Steps

After successful setup:
1. Explore the Dashboard
2. Create your first initiative
3. Try different status and priority levels
4. Create child tasks under initiatives
5. Check out the hierarchical structure

For more details, see the full README.md file.
