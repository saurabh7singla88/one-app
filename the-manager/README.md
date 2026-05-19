# One

An AI-powered initiative tracker and strategic management tool built for engineering managers 
and VPs. Track projects, tasks, notes, and meeting outcomes across multiple workspaces — with 
optional AI analysis, Gmail integration, and JIRA/Confluence connectivity.

Available as a **desktop app** (Electron, macOS/Windows) or a **web app** (Node.js + React).

---

## Features

### Initiative & Task Management
- **Unlimited hierarchy** — Initiatives → Sub-initiatives → Tasks → Subtasks, nested to any depth
- **Status workflow** — Open, In Progress, Blocked, On Hold, Completed, Cancelled
- **Priority levels** — Critical, High, Medium, Low
- **Drag-and-drop reordering** for root-level items
- **Assignees** — multi-select from registered users with avatar display
- **Due dates, start dates, and progress tracking** (0–100%)
- **Tags/labels** for categorisation
- **Standalone Tasks** — lightweight to-dos independent of the initiative tree, with checkbox completion

### Canvas Workspaces
- Named, colour-coded workspaces that scope initiatives, tasks, and notes
- "All" mode to view everything across canvases
- Canvas selector at the top of every list/view

### AI Priority Suggestions
- **Structural scoring** (no AI needed) — evaluates due dates, status, priority, staleness, blocked children, and open sub-item sprawl
- **LLM description analysis** (optional) — sends initiative descriptions to Ollama, OpenAI, Gemini, or any OpenAI-compatible API to detect urgency language
- Combined score ranks up to 8 initiatives in a suggestions drawer
- Separate AI strip for standalone tasks on the Tasks page
- Works fully offline with structural scoring; LLM is an optional enhancement

### AI Writing Assistant
- **Rephrase tool** on notes and descriptions — Professional, Elaborate, Concise, or Simplify styles
- Preview before applying; retries automatically on rate limits (Gemini 429/503)

### Mind Map Visualisation
- Spatial node graph of initiative hierarchies using React Flow
- Nodes colour-coded by status
- Zoom, pan, mini-map, and fit-to-view controls
- Click any node to open its detail drawer

### Notes
- Personal freeform notes with rich text editor (headings, bold, italic, lists, code blocks)
- **Nested hierarchy** — parent/child note trees
- **Password protection** — per-note lock using your login password; bcrypt-hashed
- **Global password** — optional master password for the entire Notes section
- Canvas scoping and search
- Auto-save with 1-second debounce

### Meeting Notes & Gmail Integration
- Create manual meeting notes with subject, date, and body
- **Pull emails from Gmail** via IMAP — fetches from a configurable label (e.g. "Gemini Notes")
- Save any email as a meeting note linked to an initiative
- **AI action-item extraction** — identifies action items from email body, separates "for you" vs others
- View linked meeting notes inside initiative details

### JIRA & Confluence Integration
- Link JIRA tickets or Confluence pages to any initiative
- Fetch live metadata — summary, status, priority, assignee, labels, content
- Expand sub-tasks (JIRA) or child pages (Confluence)
- **Per-item AI actions** — Summarise, Identify Risks, Surface Blockers, Key Decisions, Action Items
- **Batch AI actions** on multiple linked items
- **Chat panel** — ask natural-language questions about linked documents

### Status Reports & Newsletter
- **Status Report** — auto-generate a formatted progress update for any time period (week, month, custom range)
- **AI Newsletter** — generate a stakeholder-ready summary of all active initiatives
- Copy to clipboard for email/Slack

### Dashboard
- Top-level stats: total initiatives, in-progress, blocked, completed, completion rate
- AI Priority Suggestions strip (initiatives + tasks)
- Recent activity list

### Detail Drawer
- Opens on any initiative/task click with tabbed interface:
  - **Overview** — title, description, status, priority, assignees, dates, progress, tags
  - **Links** — attached URLs with title, description, category
  - **Comments** — inline discussion thread
  - **Activity** — full audit trail of changes
  - **Meetings** — linked meeting notes
  - **JIRA/Confluence** — linked tickets and pages

### Cloud Sync (Turso)
- **Push** local SQLite → Turso cloud database
- **Pull** Turso → local (with automatic backup before overwrite)
- Batched HTTP pipeline requests for reliable transfer
- Configure from Setup → Sync with database URL and auth token

### Multi-User & Security
- JWT authentication with role-based access (Admin, Manager, Viewer)
- AES-256 encryption for stored Gmail credentials
- SSRF protection on JIRA/Confluence URLs
- Electron: context isolation, no nodeIntegration

---

## Use Cases

| Role | How One Helps |
|------|---------------|
| **Engineering Manager** | Track team initiatives across sprints, link JIRA tickets, pull meeting notes from Gmail, generate weekly status reports |
| **VP / Director** | Bird's-eye dashboard of all programs, AI-ranked priorities, mind map for strategy reviews, brainstorm new initiatives |
| **Tech Lead** | Standalone task list alongside initiative tree, notes for architecture decisions, Confluence integration for design docs |
| **Individual Contributor** | Personal task tracking with canvas workspaces, password-protected notes, AI writing assistant for documentation |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Backend** | Node.js, Express, Prisma ORM, SQLite |
| **Frontend** | React 18, Redux Toolkit, Material-UI v5, React Flow, Vite |
| **Desktop** | Electron (macOS & Windows) |
| **AI Providers** | Ollama (local), OpenAI, Google Gemini, any OpenAI-compatible API |
| **Email** | IMAP via `imapflow` + `mailparser` |
| **Cloud Sync** | Turso (LibSQL) HTTP Pipeline API |
| **Security** | JWT, bcrypt, AES-256-GCM |

---

## Getting Started

### Desktop App (Recommended)

1. Download the `.dmg` (macOS) or `.exe` (Windows) from Releases
2. Install and launch — the app creates a local SQLite database automatically
3. Register an account on first launch
4. Optionally configure AI, Gmail, or JIRA from **Setup** in the sidebar

## Configuration

All integrations are configured from the **Setup** page in the app sidebar — no `.env` editing required for the desktop app.

### AI Provider

| Provider | Setup |
|----------|-------|
| **Ollama** (free, local) | Install from [ollama.com](https://ollama.com), pull a model (`ollama pull llama3.1`), select Ollama in Setup |
| **Google Gemini** | Get API key from [AI Studio](https://aistudio.google.com/apikey), paste in Setup |
| **OpenAI** | Get API key from [platform.openai.com](https://platform.openai.com/api-keys), paste in Setup |
| **OpenAI-compatible** | Enter base URL, API key, and model name (works with Groq, Together AI, LM Studio, etc.) |
| **Disabled** | Structural scoring still works; only LLM analysis is skipped |

### Gmail (Meeting Notes)

1. Enable 2-Step Verification on your Google account
2. Generate an App Password at [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Enter your email and app password in Setup → Gmail
4. Set the Gmail label to fetch from (default: "Gemini Notes")

### JIRA & Confluence

1. Enter your Atlassian base URL (e.g. `https://yourteam.atlassian.net`)
2. Enter your email and an [API token](https://id.atlassian.com/manage-profile/security/api-tokens)
3. Link tickets/pages to initiatives from the detail drawer

### Cloud Sync (Turso)

1. Create a free database at [turso.tech](https://turso.tech)
2. Enter the database URL and auth token in Setup → Sync
3. Use the Push/Pull buttons in the sidebar to sync between machines

---

## Database Options

### Desktop (Electron)
The desktop app always uses a local SQLite file — no configuration needed. The file is created automatically at:
- **macOS**: `~/Library/Application Support/one-desktop/app.db`
- **Windows**: `%APPDATA%\one-desktop\app.db`

### Web / Docker
Set one of these environment variables in your `.env` or `docker-compose.yml`:

| Database | Variable | Example value |
|----------|----------|---------------|
| **Turso** (managed cloud SQLite) | `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` | `libsql://your-db.turso.io` |
| **Self-hosted libsql server** ([sqld](https://github.com/tursodatabase/sqld)) | `TURSO_DATABASE_URL` | `http://your-server:8080` |
| **Local SQLite file** (on the server/container) | `DATABASE_URL` | `file:/data/app.db` |

`TURSO_DATABASE_URL` takes priority. If it is not set, `DATABASE_URL` is used. For the local file option in Docker, mount a volume so data persists across container restarts:

```yaml
volumes:
  - ./data:/data
environment:
  DATABASE_URL: file:/data/app.db
```

No code or schema changes are needed to switch between these options — the driver handles all three transparently.

### PostgreSQL
PostgreSQL is not supported out of the box. Adding it would require a second Prisma schema (`provider = "postgresql"`) and a different adapter (`@prisma/adapter-pg`). The existing SQLite/Turso schema stays unchanged.

---

## License

MIT
