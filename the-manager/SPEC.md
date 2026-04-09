# Initiative Tracker - Technical Specification

## 1. Project Overview

**Name:** Initiative Tracker  
**Description:** A hybrid TODO list and mind map application designed for VPs and top managers to track and manage multiple initiatives with hierarchical drill-down capabilities.

**Target Users:** VP-level executives and top managers who need to:
- Track multiple strategic initiatives
- Maintain high-level overview while accessing granular details
- Prioritize work and identify blockers
- Quick reference to important links and resources

## 2. Technical Stack

### Backend
- **Runtime:** Node.js (LTS version, 18.x or later)
- **Framework:** Express.js
- **Database:** SQLite (single local file, zero server required)
- **ORM:** Prisma (SQLite datasource — `file:./prisma/dev.db`)
- **Authentication:** JWT (JSON Web Tokens)
- **API Style:** RESTful API with GraphQL consideration for complex queries

### Frontend
- **Framework:** React 18+
- **State Management:** Redux Toolkit or Zustand
- **Routing:** React Router v6
- **UI Library:** Material-UI (MUI) or Ant Design
- **Visualization:** React Flow or D3.js for mind map view
- **Styling:** Tailwind CSS or Styled Components
- **Build Tool:** Vite

### DevOps & Tools
- **Package Manager:** npm or yarn
- **Version Control:** Git
- **Code Quality:** ESLint, Prettier
- **Testing:** Jest, React Testing Library, Supertest
- **Containerization:** Docker (optional)

## 3. Core Features

### 3.1 Hierarchical Task/Initiative Structure
- **Multi-level hierarchy:** Initiative → Sub-initiative → Task → Subtask
- **Unlimited depth** for drilling down
- **Parent-child relationships** maintained in data model

### 3.2 Dual View Modes

#### A. Mind Map View
- Visual representation of initiatives and their relationships
- Collapsible/expandable nodes
- Drag-and-drop repositioning
- Zoom and pan capabilities
- Visual indicators for status, priority, and progress

#### B. List View (TODO-style)
- Hierarchical list with indentation
- Sortable columns (priority, status, due date, owner)
- Filterable by status, priority, tags
- Quick actions (mark complete, change priority)

### 3.3 Priority Management
- **Priority Levels:** Critical, High, Medium, Low
- **Status Categories:** 
  - Open/Not Started
  - In Progress
  - Blocked
  - On Hold
  - Completed
  - Cancelled
- **Next Priority Queue:** Dedicated view for next actionable items

### 3.4 Link Management
- Attach multiple links to any initiative/task
- Link metadata: URL, title, description, tags
- Quick access panel for frequently used links
- Link categorization (documentation, resources, references)

### 3.5 Details Panel
- Rich text description
- Assignee(s)
- Due dates and milestones
- Progress tracking (percentage complete)
- Tags and labels
- Attachments and links
- Activity history/audit trail
- Comments/notes

### 3.6 Search & Filter
- Full-text search across all initiatives
- Filter by: status, priority, assignee, tags, date range
- Saved filter presets
- Quick filters (My Tasks, Overdue, This Week, etc.)

### 3.7 Dashboard & Analytics
- Overview of all initiatives
- Progress metrics
- Blocked items alert
- Upcoming deadlines
- Completion statistics
- Custom widgets

### 3.8 Canvas Workspaces
- Named workspaces that scope both List View and Mind Map to a subset of initiatives
- **"All" mode:** no canvas filter — all initiatives are visible across both views
- Each canvas has a name, optional description, and a color (used as accent in the UI)
- Initiatives are optionally linked to one canvas (`canvasId` nullable FK)
- Creating a canvas auto-switches the active workspace to it
- Deleting a canvas unlinks its initiatives (sets `canvasId = null`) but does not delete them
- Canvas selection persists in Redux state; both views re-fetch when it changes
- Pill-tab selector rendered at the top of both List View and Mind Map pages
- Right-click a canvas pill for Rename / Delete actions

### 3.9 Tasks View
**Architecture decision: reuse the `Initiative` table** (no separate table)
- Rationale: `type: 'TASK'` already exists; canvas, links, comments, activity, and tags work out of the box; a separate table would duplicate ~80% of the schema
- A standalone task is an `Initiative` record with `type = 'TASK'`, `parentId = null`, and `isStandaloneTask = true`
- Tasks optionally reference an initiative via `linkedInitiativeId` (separate from `parentId`) — they remain independent but carry context
- **Dedicated Tasks page** separate from the hierarchical Initiatives list
- **Checkbox UI** — checking a task sets `status = 'COMPLETED'`; unchecking sets it back to `'OPEN'`
- **Canvas scoping** — same `CanvasSelector` pill bar; tasks are filtered by `canvasId` like initiatives
- **Grouping** — tasks grouped by: Linked Initiative, Canvas, Priority, or Due Date (user-selectable)
- **Quick-add** — single-line input at the top to create a task instantly (title only, rest optional)
- Task detail opens in the same `InitiativeDetailDrawer` (links, comments, activity all available)
- Tasks are **not** shown in the Mind Map view (they are not spatial/hierarchical nodes)

### 3.10 Brainstorming Canvas

A free-form scratch-pad for ideation, separate from the structured Initiatives/MindMap views.

**Purpose:** Let users quickly sketch ideas as shapes and text, connect them with arrows, then promote finished blocks to real initiatives with one click.

**Canvas behaviour**
- Infinite free-form canvas powered by React Flow (same library as Mind Map)
- State is local (in-memory) — not persisted to the database; intentionally ephemeral
- Clearing the canvas or navigating away discards the board

**Shape palette (toolbar)**
| Shape | Use |
|---|---|
| Rectangle (Box) | Default idea block |
| Circle | Concept / key term |
| Diamond | Decision / branch point |
| Sticky Note | Quick annotation (yellow) |
| Text | Plain floating label |

**Interactions**
- Click a shape in the toolbar → click anywhere on the canvas to place it
- Double-click any shape to edit its label inline
- Drag from a node handle to another node to draw an arrow edge
- Select + `Delete`/`Backspace` to remove nodes or edges
- Multi-select with rubber-band drag or Shift+click
- Zoom + pan (mouse wheel / trackpad)
- "Clear All" button resets the canvas

**Push to Initiative**
- Select one or more nodes → "Push to Initiative" button becomes active in the toolbar
- Opens a dialog pre-filled with the node label as the title
- User can set: Title, Description, Type (INITIATIVE / TASK), Status, Priority, Canvas
- **Single node:** creates one Initiative record
- **Multiple nodes + edges:** creates a tree — edges between selected nodes determine parent-child relationships; the root node (no incoming edge from the selection) becomes the parent initiative, connected children become sub-initiatives
- On success: a success toast is shown and the pushed block(s) get a subtle ✓ badge

**Navigation:** Available in the sidebar as "Brainstorm" (Lightbulb icon)

### 3.11 AI Prioritization Suggestions ✅ Implemented

An intelligent advisor that analyses all active initiatives and surfaces the ones that need attention most urgently.

**How it works**
- Triggered by the **"AI Suggestions"** button in the Dashboard header and the Initiatives toolbar
- Opens a right-side drawer ranking up to 8 initiatives by computed urgency score
- Each suggestion shows: rank badge, status + priority chips, and up to 3 plain-English reason chips

**Scoring signals (structural)**
| Signal | Max pts | Example |
|---|---|---|
| Due date | 50 | Overdue by N days, Due today |
| Status | 38 | Blocked, On Hold |
| Priority | 40 | CRITICAL, HIGH |
| Staleness | 22 | No updates for N days |
| Blocked sub-items | 30 | 2 blocked sub-items |
| Open sub-item sprawl | 15 | 4 sub-items still open |

**LLM description analysis (Ollama)**
- All initiative descriptions are sent in a **single batched prompt** to a local Ollama model (`llama3.1:latest` by default)
- The model reads natural language intent — phrases like "must do", "scaling concern", "urgent", "at risk", "cannot wait" all raise the score
- Ollama urgency score (0–100) maps to 0–55 bonus points layered on top of structural signals
- **Graceful fallback:** if Ollama is unavailable or times out (30 s), structural scoring still runs and results are still returned
- A `🦙 Ollama` badge appears in the panel when LLM analysis successfully ran
- Configure via env vars: `OLLAMA_BASE_URL` (default `http://localhost:11434`), `OLLAMA_MODEL` (default `llama3.1:latest`)

**UI**
- Reason chips use `🧠` icon for LLM-sourced signals (distinct purple tint) vs structural chips
- When a `🧠` chip fires, the matching description snippet is quoted inline below the row
- Manual Refresh button re-runs the full analysis
- Footer lists all active scoring dimensions

### 3.12 Notes ✅ Implemented

A dedicated note-taking section for capturing private thoughts, meeting notes, research, or any freeform content — separate from actionable initiatives and tasks.

**Purpose:** Give managers a structured but flexible writing space, with optional password protection for sensitive or confidential content.

**Core behaviour**
- Notes are standalone pages — not linked to initiatives or tasks
- Each note has a **title** and a **content** body
- Notes can be assigned to a **Canvas** for organisation (same `CanvasSelector` pill bar used across the app)
- The notes list shows: title, last-updated timestamp, canvas badge, and a lock icon (🔒) for protected notes
- Clicking a note opens it in a full editor panel on the right side of the page

**Canvas scoping**
- `CanvasSelector` pill bar at the top — identical pill-tab behaviour to Initiatives and Tasks
- Per-canvas counts in the canvas pills show only note counts (not initiative/task counts)
- Creating a note stamps it with the currently active canvas, if any

**Password protection (confidential notes)**
- Any note can be marked **Protected** at creation time or toggled later in the editor
- Setting protection requires choosing a password at that moment
- A protected note shows *only its title* in the list; the lock icon indicates it is locked
- Opening a locked note shows a password prompt; correct entry fetches and displays the full content
- The unlock is **session-in-memory only** — navigating away re-locks the note
- Changing protection settings (enable / disable / change password) always requires the current password first
- Passwords stored as **bcrypt hashes**; plain-text passwords are never persisted or returned
- The API never returns `content` or `passwordHash` for a locked note without successful authentication

**Note editor**
- Title editable inline at the top
- Body: full-height textarea with auto-grow
- **Auto-save** on a 1-second debounce after each keystroke; "Saved" / "Saving…" indicator
- Lock icon button in the editor header to toggle protection on the current note
- Delete note with a confirmation prompt

**Navigation:** Available in the sidebar as **"Notes"** (NoteAlt icon), route `/notes`

## 4. Data Models

### 4.1 Initiative/Node Model
```javascript
{
  id: UUID,
  title: String (required),
  description: String (rich text),
  type: Enum ['INITIATIVE', 'TASK', 'SUBTASK'],
  isStandaloneTask: Boolean (default: false),  // true = appears in Tasks view
  linkedInitiativeId: UUID (nullable),         // optional initiative context for standalone tasks
  parentId: UUID (nullable),
  status: Enum ['OPEN', 'IN_PROGRESS', 'BLOCKED', 'ON_HOLD', 'COMPLETED', 'CANCELLED'],
  priority: Enum ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'],
  assignees: Array<UserId>,
  dueDate: Date (nullable),
  startDate: Date (nullable),
  progress: Number (0-100),
  tags: Array<String>,
  canvasId: UUID (nullable, FK → Canvas),
  position: Object { x: Number, y: Number }, // for mind map view
  createdAt: Timestamp,
  updatedAt: Timestamp,
  createdBy: UserId,
  completedAt: Timestamp (nullable)
}
```

### 4.2 Link Model
```javascript
{
  id: UUID,
  initiativeId: UUID (foreign key),
  url: String (required),
  title: String,
  description: String,
  category: String,
  tags: Array<String>,
  createdAt: Timestamp,
  createdBy: UserId
}
```

### 4.3 User Model
```javascript
{
  id: UUID,
  email: String (required, unique),
  name: String (required),
  avatar: String (URL),
  role: Enum ['admin', 'manager', 'viewer'],
  preferences: Object {
    defaultView: String,
    theme: String,
    notifications: Boolean
  },
  createdAt: Timestamp,
  lastLogin: Timestamp
}
```

### 4.4 Comment Model
```javascript
{
  id: UUID,
  initiativeId: UUID (foreign key),
  userId: UUID (foreign key),
  content: String (required),
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

### 4.5 Activity Log Model
```javascript
{
  id: UUID,
  initiativeId: UUID (foreign key),
  userId: UUID (foreign key),
  action: String (e.g., 'created', 'updated', 'status_changed'),
  changes: JSON,
  timestamp: Timestamp
}
```

### 4.6 Canvas Model
```javascript
{
  id: UUID,
  name: String (required),
  description: String (nullable),
  color: String (hex, default: '#6366f1'),
  createdById: UUID (foreign key → User),
  initiatives: Initiative[],   // back-relation
  notes: Note[],               // back-relation
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```
`Initiative` gains:
```javascript
{
  canvasId: UUID (nullable, FK → Canvas),
  // ... existing fields
}
```

### 4.7 Note Model
```javascript
{
  id: UUID,
  title: String (required),
  content: String (default: ""),
  isProtected: Boolean (default: false),
  passwordHash: String (nullable),  // bcrypt hash — NEVER included in API responses
  canvasId: UUID (nullable, FK → Canvas),
  createdById: UUID (foreign key → User),
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

**API response shapes:**

*Unprotected note (list or GET):*
```json
{ "id": "uuid", "title": "string", "content": "string", "isProtected": false, "canvasId": "uuid|null", "createdAt": "ISO", "updatedAt": "ISO" }
```

*Protected note (before unlock):*
```json
{ "id": "uuid", "title": "string", "isProtected": true, "locked": true, "canvasId": "uuid|null" }
```

*Protected note (after successful unlock):*
```json
{ "id": "uuid", "title": "string", "content": "string", "isProtected": true, "locked": false, "canvasId": "uuid|null", "createdAt": "ISO", "updatedAt": "ISO" }
```

## 5. API Endpoints

### 5.1 Initiatives
```
GET    /api/initiatives              - Get all initiatives (with filters)
                                       ?isStandaloneTask=true  – Tasks view fetch
                                       ?canvasId=<uuid>        – Canvas filter
                                       ?linkedInitiativeId=<id>– Tasks linked to an initiative
GET    /api/initiatives/:id          - Get single initiative with details
POST   /api/initiatives              - Create new initiative or standalone task
PUT    /api/initiatives/:id          - Update initiative / task
DELETE /api/initiatives/:id          - Delete initiative
GET    /api/initiatives/:id/children - Get child initiatives
GET    /api/initiatives/:id/path     - Get full hierarchy path
PATCH  /api/initiatives/:id/status   - Update status
PATCH  /api/initiatives/:id/priority - Update priority
PATCH  /api/initiatives/:id/position - Update position (for mind map)
```

### 5.2 Links
```
GET    /api/initiatives/:id/links    - Get all links for initiative
POST   /api/initiatives/:id/links    - Add link to initiative
PUT    /api/links/:id                - Update link
DELETE /api/links/:id                - Delete link
```

### 5.3 Comments
```
GET    /api/initiatives/:id/comments - Get comments
POST   /api/initiatives/:id/comments - Add comment
PUT    /api/comments/:id             - Update comment
DELETE /api/comments/:id             - Delete comment
```

### 5.4 Users
```
POST   /api/auth/register            - Register new user
POST   /api/auth/login               - Login
POST   /api/auth/logout              - Logout
GET    /api/users/me                 - Get current user
PUT    /api/users/me                 - Update current user
GET    /api/users                    - Get all users (for assignment)
```

### 5.5 Dashboard
```
GET    /api/dashboard/stats          - Get dashboard statistics
GET    /api/dashboard/upcoming       - Get upcoming deadlines
GET    /api/dashboard/blocked        - Get blocked items
```

### 5.6 Canvases
```
GET    /api/canvases                 - List canvases owned by current user (includes _count.initiatives)
POST   /api/canvases                 - Create new canvas
PUT    /api/canvases/:id             - Update canvas (owner only)
DELETE /api/canvases/:id             - Delete canvas; unlinks initiatives first (owner only)
```
`GET /api/initiatives` now accepts an optional `canvasId` query parameter:
```
GET /api/initiatives?canvasId=<uuid>   - Filter by canvas
GET /api/initiatives?canvasId=null     - Initiatives with no canvas
GET /api/initiatives                   - All initiatives (no filter)
```
`POST /api/initiatives` and `PUT /api/initiatives/:id` accept optional `canvasId` in the request body.

### 5.7 AI Suggestions
```
GET    /api/ai/suggestions           - Get ranked prioritization suggestions
                                       ?limit=<n>       – Max results (default 8)
                                       ?canvasId=<uuid> – Scope to a specific canvas
```
Response shape:
```json
{
  "suggestions": [
    {
      "id": "uuid",
      "title": "string",
      "description": "string | null",
      "status": "OPEN | IN_PROGRESS | BLOCKED | ON_HOLD",
      "priority": "CRITICAL | HIGH | MEDIUM | LOW",
      "dueDate": "ISO date | null",
      "parentId": "uuid | null",
      "score": 84,
      "reasons": [
        { "label": "string", "weight": 40, "icon": "🔴" }
      ]
    }
  ],
  "analysedCount": 12,
  "llmUsed": true,
  "generatedAt": "ISO timestamp"
}
```

### 5.8 Notes
```
GET    /api/notes                    - List notes for current user (metadata only, no content returned)
                                       ?canvasId=<uuid>  – Filter by canvas
                                       ?canvasId=null    – Notes with no canvas
                                       ?search=<string>  – Filter by title (case-insensitive)
POST   /api/notes                    - Create a new note
GET    /api/notes/:id                - Fetch note; returns { locked: true } if protected (no content)
POST   /api/notes/:id/unlock         - Verify password and return full note content
PUT    /api/notes/:id                - Update title, content, canvasId, or protection settings
DELETE /api/notes/:id                - Delete note (owner only)
```

**POST /api/notes** — request body:
```json
{
  "title": "string (required)",
  "content": "string (optional, default: '')",
  "isProtected": false,
  "password": "string — required when isProtected: true",
  "canvasId": "uuid | null"
}
```

**POST /api/notes/:id/unlock** — request body:
```json
{ "password": "string" }
```
Returns the full note object with `"locked": false` on success, `401` on wrong password.

**PUT /api/notes/:id** — protection change rules:
| Intent | Fields to send |
|---|---|
| Enable protection | `{ isProtected: true, password: "newpass" }` |
| Disable protection | `{ isProtected: false, currentPassword: "existing" }` |
| Change password | `{ isProtected: true, password: "newpass", currentPassword: "existing" }` |
| Regular content edit (unlocked note) | `{ title: "…", content: "…" }` |

## 6. UI/UX Design

### 6.1 Layout Structure
```
┌─────────────────────────────────────────────────┐
│ Header (Logo, Search, User Menu)               │
├─────────┬───────────────────────────────────────┤
│         │ Main Content Area                     │
│ Sidebar │ - Mind Map View / List View           │
│         │ - Details Panel (slide-in)            │
│ - Nav   │                                       │
│ - Quick │                                       │
│   Links │                                       │
│ - Filters│                                      │
│         │                                       │
└─────────┴───────────────────────────────────────┘
```

### 6.2 Navigation
- **Dashboard:** Overview and metrics
- **Mind Map:** Visual graph view
- **List View:** Hierarchical initiatives list
- **Tasks:** Standalone tasks with checkbox completion and canvas scoping
- **Notes:** Freeform note pages with optional password protection, canvas-scoped
- **My Tasks:** User's assigned items
- **Next Priority:** Priority queue view
- **Quick Links:** Saved links library
- **Settings:** User preferences and configuration

#### Canvas Selector (within List View & Mind Map)
- Horizontal pill-tab bar positioned above the main content
- "All" pill (dark/active when no canvas selected)
- One pill per canvas with color dot and initiative count
- "+" icon button opens Create Canvas dialog (name + description + color palette)
- Right-click any canvas pill for Rename / Delete context menu
- Active canvas stored globally in Redux; switching instantly re-fetches the view

### 6.3 Key Interactions
- **Double-click node:** Open details panel
- **Right-click node:** Context menu (edit, delete, add child, mark complete)
- **Drag node:** Reposition in mind map
- **Hover node:** Show quick info tooltip
- **Click expand/collapse:** Toggle children visibility
- **Keyboard shortcuts:** Navigation and quick actions

### 6.4 Design Principles
- **Clean and minimal:** Reduce visual clutter
- **Progressive disclosure:** Show details on demand
- **Responsive:** Work on desktop and tablet
- **Accessible:** WCAG 2.1 AA compliance
- **Fast:** Optimistic updates, lazy loading

## 7. Implementation Phases

### Phase 1: MVP (Core Functionality)
**Duration:** 4-6 weeks

- [ ] Project setup and configuration
- [ ] Database schema and models
- [ ] Basic authentication (register/login)
- [ ] CRUD operations for initiatives
- [ ] Hierarchical data structure
- [ ] Simple list view
- [ ] Basic details panel
- [ ] Status and priority management

### Phase 2: Visualization
**Duration:** 3-4 weeks

- [ ] Mind map view implementation
- [ ] Node positioning and layout algorithm
- [ ] Drag-and-drop functionality
- [ ] Zoom and pan controls
- [ ] Visual status indicators
- [ ] View toggle (list/mind map)

### Phase 3: Enhanced Features
**Duration:** 3-4 weeks

- [ ] Link management
- [ ] Comments system
- [ ] Activity log/history
- [ ] Search functionality
- [ ] Filters and sorting
- [ ] Tags system

### Phase 4: Management & Analytics
**Duration:** 2-3 weeks

- [ ] Dashboard implementation
- [ ] Progress tracking
- [ ] Next priority queue
- [ ] Analytics and metrics
- [ ] Due date and reminders
- [ ] Bulk operations

### Phase 5: Polish & Optimization
**Duration:** 2-3 weeks

- [ ] Performance optimization
- [ ] Responsive design refinement
- [ ] Keyboard shortcuts
- [ ] User preferences
- [ ] Export functionality (PDF, JSON)
- [ ] Testing and bug fixes

### Phase 6: Desktop App Support
**Duration:** 2-3 weeks

- [ ] Progressive Web App (PWA) implementation
- [ ] Service worker for offline capabilities
- [ ] Desktop installation support
- [ ] App manifest configuration
- [ ] Optional: Electron wrapper for true desktop app
- [ ] Desktop-specific optimizations (keyboard shortcuts, system tray)
- [ ] Auto-update mechanism

### Phase 7: Canvas Workspaces ✅ Implemented
**Duration:** Completed February 2026

- [x] `Canvas` Prisma model with `color`, `description`, `createdById` FK
- [x] `canvasId` nullable FK added to `Initiative`
- [x] Database migration applied (`add_canvas`)
- [x] Full Canvas CRUD API (`/api/canvases`)
- [x] `GET /api/initiatives` supports `canvasId` query filter
- [x] `canvasSlice` Redux slice — `fetchCanvases`, `createCanvas`, `updateCanvas`, `deleteCanvas`, `setActiveCanvas`
- [x] `CanvasSelector` component — pill tabs, create dialog with color picker, right-click rename/delete
- [x] List View and Mind Map scoped by active canvas
- [x] New initiatives stamped with `canvasId` of the active canvas

### Phase 8: Tasks View
**Duration:** In progress – March 2026

- [ ] `isStandaloneTask Boolean` field added to `Initiative` schema
- [ ] `linkedInitiativeId String?` field added to `Initiative` schema (self-relation, nullable)
- [ ] DB migration applied
- [ ] `GET /api/initiatives?isStandaloneTask=true` filter in backend
- [ ] `linkedInitiativeId` accepted in POST/PUT
- [ ] `Tasks.jsx` page — quick-add bar, checkbox rows, canvas selector, grouping toggle
- [ ] Sidebar nav updated to include Tasks link
- [ ] `initiativesSlice` — `fetchTasks` thunk
- [ ] Task detail opens in `InitiativeDetailDrawer` (full links/comments/activity)
- [ ] `linkedInitiativeId` picker in task create/edit (shows list of INITIATIVE-type items)

### Phase 9: AI Prioritization ✅ Implemented
**Duration:** Completed March 2026

- [x] `GET /api/ai/suggestions` endpoint — scoring engine with 6 structural signals
- [x] Batched Ollama LLM call — all descriptions analysed in a single prompt round-trip
- [x] Graceful fallback — structural scoring runs independently if Ollama is unavailable
- [x] `AISuggestionsPanel` component — right-side drawer with ranked suggestions
- [x] `AISuggestionsButton` trigger — placed in Dashboard header and Initiatives toolbar
- [x] Reason chips with distinct `🧠` icon for LLM-sourced signals
- [x] Description snippet quoted inline when LLM analysis fired
- [x] `🦙 Ollama` badge in panel header when LLM was used
- [x] Configurable via `OLLAMA_BASE_URL` and `OLLAMA_MODEL` env vars

### Phase 10: Notes ✅ Implemented (backend) / 🚧 In Progress (frontend)
**Duration:** March 2026

**Backend**
- [x] `Note` Prisma model — `title`, `content`, `isProtected`, `passwordHash`, `canvasId` FK, `createdById` FK
- [x] `Canvas` model updated with `notes` back-relation
- [x] `User` model updated with `notes` back-relation
- [x] Database migration applied (`add_notes`)
- [x] `GET /api/notes` — list notes metadata; supports `canvasId` and `search` filters
- [x] `POST /api/notes` — create note; bcrypt-hash password when `isProtected: true`
- [x] `GET /api/notes/:id` — returns `{ locked: true }` for protected notes; full note for unprotected
- [x] `POST /api/notes/:id/unlock` — bcrypt password comparison; full note on match, `401` on mismatch
- [x] `PUT /api/notes/:id` — update any field; protection changes require `currentPassword` when currently protected
- [x] `DELETE /api/notes/:id` — owner-only deletion
- [x] `passwordHash` and `content` never exposed without authentication
- [x] Notes route registered in `server.js` at `/api/notes`

**Frontend**
- [ ] `Notes.jsx` page — `CanvasSelector` pill bar, scrollable notes list (left), editor panel (right)
- [ ] Notes list items: title, updated-at, canvas colour dot, lock icon for protected notes
- [ ] Editor: inline title field, auto-grow textarea body, 1-second auto-save debounce, "Saved / Saving…" indicator
- [ ] Password unlock dialog — shown when opening a protected note; clears on navigation
- [ ] Protection toggle in editor header — password-set dialog (new protection) or confirm-disable dialog
- [ ] `CanvasSelector` receives `countsByCanvas` (note counts) so canvas pills are accurate
- [ ] "New Note" button creates a blank note and immediately selects it in the editor
- [ ] Delete note with confirmation; deselects editor on success
- [ ] Sidebar nav entry: "Notes" (`NoteAlt` icon), route `/notes`
- [ ] Route `/notes` added to `App.jsx`

## 8. Technical Considerations

### 8.1 Performance
- **Virtualization:** For large lists (react-window or react-virtualized)
- **Pagination:** For API responses
- **Caching:** Redis for frequently accessed data
- **Debouncing:** For search and auto-save
- **Code splitting:** Lazy load routes and heavy components

### 8.2 Security
- **Authentication:** Secure JWT implementation with refresh tokens
- **Authorization:** Role-based access control (RBAC)
- **Input validation:** Both client and server-side
- **SQL injection prevention:** Parameterized queries
- **XSS protection:** Sanitize user input
- **HTTPS:** Enforce secure connections

### 8.3 Data Integrity
- **Orphan prevention:** Cascade delete or prevent deletion with children
- **Soft deletes:** Mark as deleted rather than hard delete
- **Audit trail:** Track all important changes
- **Backup strategy:** Regular automated backups

### 8.4 Scalability
- **Database indexing:** On frequently queried fields
- **Load balancing:** For multiple server instances
- **CDN:** For static assets
- **Microservices consideration:** For future growth

## 9. Development Workflow

### 9.1 Setup
```bash
# Backend
cd backend
npm init -y
npm install express prisma @prisma/client jsonwebtoken bcrypt cors dotenv

# Frontend
npm create vite@latest frontend -- --template react
cd frontend
npm install react-router-dom @reduxjs/toolkit react-redux @mui/material @emotion/react @emotion/styled reactflow
```

### 9.2 Git Workflow
- **Main branch:** Production-ready code
- **Develop branch:** Integration branch
- **Feature branches:** feature/[feature-name]
- **Pull requests:** Required for merging to develop/main

### 9.3 Testing Strategy
- **Unit tests:** Individual functions and components
- **Integration tests:** API endpoints
- **E2E tests:** Critical user workflows (optional for MVP)
- **Coverage goal:** 70%+ for backend, 60%+ for frontend

## 10. Success Metrics

### 10.1 Technical Metrics
- Page load time: < 2 seconds
- API response time: < 500ms (p95)
- Time to interactive: < 3 seconds
- Test coverage: > 70%

### 10.2 User Metrics
- Task creation time: < 30 seconds
- Search response time: < 1 second
- Zero data loss
- 99% uptime

## 11. Future Enhancements
- **Collaboration:** Real-time collaboration (WebSockets)
- **Mobile app:** React Native implementation
- **Notifications:** Email and push notifications
- **Integrations:** Slack, Teams, Jira, etc.
- **AI assistance:** Smart prioritization suggestions ✅ Implemented (Phase 9 — Ollama LLM + structural scoring)
- **Templates:** Pre-built initiative templates
- **Gantt chart view:** Timeline visualization
- **Resource allocation:** Team capacity planning
- **Custom fields:** User-defined metadata

## 12. Documentation Requirements
- **README:** Setup and installation guide
- **API documentation:** Swagger/OpenAPI
- **Component library:** Storybook (optional)
- **User guide:** Feature documentation
- **Architecture diagram:** System overview

## 13. Data Synchronization (Desktop App)

Because the desktop app stores data in a local SQLite file, syncing between two machines (e.g. work laptop + home laptop) requires an explicit strategy. Options are listed from simplest to most capable:

---

### Option A — Manual Export / Import (MVP, recommended first)

Add **Export** and **Import** buttons to the Setup page.

- **Export:** Calls a new `GET /api/export` endpoint that reads every table and returns a single JSON document (`{ users, initiatives, canvases, notes, links, ... }`). The Electron main process triggers a Save dialog and writes the file.
- **Import:** User selects a previously exported `.json` file. A new `POST /api/import` endpoint receives it and upserts all records (using Prisma `upsert` on `id`). Conflicts are resolved by `updatedAt` — newer record wins.

**Pros:** No infrastructure, works fully offline, one-time effort.  
**Cons:** Manual step; data created on both machines between exports will conflict.

---

### Option B — Shared File via Cloud Storage (zero-code, with caveats)

Move the database file to a synced folder (OneDrive, Dropbox, iCloud) by configuring `DATABASE_URL` in the app settings to point to a file inside the sync folder.

**Pros:** Zero development effort; free with existing subscriptions.  
**Cons:** SQLite is not safe for concurrent writes. This only works reliably if the app is **never open on both machines at the same time**. Cloud clients sometimes hold file locks that corrupt SQLite. Not recommended for production use — only suitable for a single user who is disciplined about opening the app on one machine at a time.

---

### Option C — Turso / LibSQL Embedded Replicas (recommended medium-term)

[Turso](https://turso.tech) offers a hosted SQLite-compatible database with **embedded replica** support. The local replica is a real SQLite file (Prisma/libsql driver reads it directly), and changes sync to the cloud automatically.

**What changes:**
- Replace `@prisma/client` with `@prisma/adapter-libsql` + `@libsql/client`
- Swap the Prisma datasource driver to `libsql`
- Store `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` in app settings (entered by user on first run)
- Each device has its own local replica; Turso syncs them in the background

**Pros:** True bidirectional sync; works offline; SQLite-compatible (no schema changes); generous free tier.  
**Cons:** Requires a Turso account; extra setup for end users; sync conflicts resolved by Turso's last-write-wins per-row strategy.

---

### Option D — Self-Hosted Shared Server (teams / multi-user)

Skip Electron and run the app as a **web server** on a shared machine (NAS, VPS, home server). Every device accesses it via browser at e.g. `http://192.168.1.x:3001`. No desktop packaging needed.

**What changes:**
- Nothing in the backend; switch back to PostgreSQL for robustness
- Users access via browser; no Electron install required
- Optional: package as a Docker image for easy self-hosting

**Pros:** True multi-user; real-time access from any device including phone; no sync problem at all.  
**Cons:** Requires a always-on server; not offline-capable.

---

### Recommended Roadmap

| Stage | Approach |
|---|---|
| MVP desktop | Option A — Export/Import JSON |
| Single user, two machines | Option C — Turso embedded replica |
| Small team | Option D — Self-hosted server + PostgreSQL |

---

**Version:** 1.6  
**Last Updated:** March 8, 2026  
**Status:** Draft

### Phase 11: SQLite Migration ✅ Implemented
**Duration:** March 5, 2026

Replaced PostgreSQL with a local SQLite file — no database server required.

**What changed**
- [x] `backend/prisma/schema.prisma` — datasource provider switched from `postgresql` to `sqlite`; `String[]` array fields changed to `String @default("[]")` (JSON text); `Json` fields changed to `String` (SQLite JSON1 emulation); `enum` blocks replaced with `String` fields with documentation comments
- [x] `backend/src/lib/prisma.js` — new shared Prisma client with `$extends` that auto-parses JSON text to JS objects on reads and auto-stringifies JS objects to JSON text on writes; covers `User.preferences`, `Initiative.tags`, `Link.tags`, `ActivityLog.changes`, `BrainstormCanvas.nodes/edges`
- [x] All 7 route files + `middleware/auth.js` — switched from `new PrismaClient()` per-file to importing the shared `prisma` from `../lib/prisma.js`
- [x] `backend/.env` — `DATABASE_URL` changed to `"file:./prisma/dev.db"`
- [x] `mode: 'insensitive'` removed from `contains` queries in `initiatives.js` and `notes.js` (SQLite LIKE is case-insensitive for ASCII by default)
- [x] Old PostgreSQL migrations deleted; fresh migration `20260305154749_sqlite_init` applied
- [x] SQLite database file created at `backend/prisma/dev.db`

**Setup (after this change)**  
No database server needed. Run `npx prisma migrate dev` once after cloning — it creates `prisma/dev.db` automatically. Delete `dev.db` to fully reset all data.

---

### Phase 12: Desktop App (Electron) — Planned
**Duration:** 2–3 weeks  
**Target platforms:** Windows 10/11 (`.exe` NSIS installer), macOS 12+ (`.dmg`)

#### Architecture overview

Add an `electron/` package alongside `backend/` and `frontend/`. The Electron **main process**:

1. Resolves the user-data directory (`%APPDATA%\One` on Windows, `~/Library/Application Support/One` on Mac) and sets all required env vars in-process before anything else (`DATABASE_URL`, `JWT_SECRET`, `PORT`, `NODE_ENV`, `ALLOWED_ORIGINS`).
2. Runs `prisma migrate deploy` via `child_process.spawnSync` against the packaged Prisma CLI to apply any pending migrations on first launch or after an update.
3. Dynamically imports the Express server (`await import('../backend/src/server.js')`) so the backend runs **in-process** — no child process, no IPC overhead.
4. Once the server emits ready, opens a `BrowserWindow` that loads `frontend/dist/index.html` using a `file://` URL.

#### File / folder structure

```
one/
  electron/
    package.json          ← electron, electron-builder deps + build config
    main.js               ← Electron main process entry point
    preload.js            ← optional preload for contextBridge
  backend/               ← unchanged Express + Prisma (ESM)
  frontend/              ← unchanged React + Vite
    dist/                ← built output (generated, gitignored)
```

#### Changes required to existing code

| File | Change | Why |
|---|---|---|
| `frontend/vite.config.js` | Add `base: './'` | Asset URLs must be relative for `file://` loading |
| `frontend/.env.production` | `VITE_API_URL=http://localhost:3001/api` | Vite proxy only runs in dev; production build must hit the backend directly |
| `backend/src/server.js` | Export a `startServer()` promise that resolves when `app.listen` is ready | Allows `main.js` to `await` the server before opening the window |
| `.gitignore` | Add `electron/dist/`, `frontend/dist/` | Build artifacts should not be committed |

#### `electron/main.js` — responsibilities

```javascript
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const userDataPath = app.getPath('userData');

// 1. Set env vars before importing anything that reads them
process.env.DATABASE_URL   = `file:${path.join(userDataPath, 'app.db')}`;
process.env.JWT_SECRET     = 'desktop-local-secret-change-me';
process.env.PORT           = '3001';
process.env.NODE_ENV       = 'production';
process.env.ALLOWED_ORIGINS = 'file://';

// 2. Run migrations
spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: path.join(__dirname, '../backend'),
  env: process.env,
  stdio: 'inherit'
});

// 3. Start Express in-process
const { startServer } = await import('../backend/src/server.js');
await startServer();

// 4. Open window
app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1400, height: 900,
    webPreferences: { contextIsolation: true }
  });
  win.loadFile(path.join(__dirname, '../frontend/dist/index.html'));
});
```

#### `electron/package.json` — electron-builder config

```json
{
  "name": "one",
  "version": "1.0.0",
  "main": "main.js",
  "type": "module",
  "scripts": {
    "dev": "electron .",
    "build:frontend": "cd ../frontend && npm run build",
    "build": "npm run build:frontend && electron-builder --win --mac"
  },
  "build": {
    "appId": "com.one.app",
    "productName": "One",
    "files": [
      "main.js",
      "preload.js",
      "../backend/**/*",
      "../frontend/dist/**/*",
      "!../backend/node_modules/.cache"
    ],
    "asarUnpack": [
      "**/node_modules/.prisma/**",
      "**/node_modules/@prisma/client/**"
    ],
    "win": { "target": "nsis" },
    "mac": { "target": "dmg", "category": "public.app-category.productivity" }
  },
  "devDependencies": {
    "electron": "^29.0.0",
    "electron-builder": "^24.0.0"
  }
}
```

> **Why `asarUnpack` for Prisma?**  
> Prisma's query engine is a native `.node` / `.dll.node` / `.dylib.node` binary. Electron's `asar` archive cannot execute native binaries — they must be unpacked to the filesystem alongside the asar file.

#### Build commands

```powershell
# One-time: install Electron deps
cd electron && npm install

# Development (opens Electron with live backend, loads built frontend)
cd electron && npx electron .

# Production build (outputs installers to electron/dist/)
cd electron && npm run build
```

#### Implementation checklist

- [ ] Create `electron/` folder with `package.json`, `main.js`, `preload.js`
- [ ] Add `base: './'` to `frontend/vite.config.js`
- [ ] Create `frontend/.env.production` with `VITE_API_URL`
- [ ] Export `startServer()` from `backend/src/server.js`
- [ ] Configure `asarUnpack` for Prisma native binaries
- [ ] Test on Windows: `npm run build -- --win`
- [ ] Test on macOS: `npm run build -- --mac`
- [ ] Verify SQLite db created correctly in OS userData path
- [ ] Verify AI (Ollama) and Gmail integrations still work
- [ ] Set up auto-update via `electron-updater` (optional, post-MVP)

---

### First-Time User Steps (after installing the desktop app)

These steps apply to a user who has downloaded and installed the `.exe` (Windows) or `.dmg` (Mac) for the first time.

**Step 1 — Install the app**
- Windows: Run the `One-Setup-x.x.x.exe` installer. It installs to `%LOCALAPPDATA%\Programs\One` by default.
- Mac: Open the `.dmg`, drag *One* to your Applications folder.

**Step 2 — Launch the app**
- Double-click the app icon.
- On first launch, the app automatically creates the local SQLite database at:
  - Windows: `%APPDATA%\One\app.db`
  - Mac: `~/Library/Application Support/One/app.db`
- No internet connection is required for this step.

**Step 3 — Register your account**
- The app opens to the login screen.
- Click **"Register here"** and create your account (name, email, password).
- This account is stored locally — it is not sent to any server.

**Step 4 — (Optional) Configure AI features**
- Navigate to **Setup** in the sidebar.
- To use local AI (recommended): install [Ollama](https://ollama.ai), pull a model (`ollama pull llama3.1`), and set the Ollama URL to `http://localhost:11434`.
- To use OpenAI or Gemini: enter your API key in the Setup page.
- If you skip this, AI suggestions are disabled but all other features work.

**Step 5 — (Optional) Configure Gmail integration**
- Navigate to **Setup** and enter your Gmail address and an [App Password](https://support.google.com/accounts/answer/185833).
- Required only for the Meeting Notes / Gmail import feature.
- All other features (initiatives, tasks, notes, mind map) work without this.

**Step 6 — Start using the app**
- Create your first Canvas (optional grouping) from the top pill bar.
- Add initiatives from the **Dashboard** or **Initiatives** page.
- Use **Tasks** for standalone action items, **Notes** for freeform writing.
