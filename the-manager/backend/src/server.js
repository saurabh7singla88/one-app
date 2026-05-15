import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import initiativeRoutes from './routes/initiatives.js';
import userRoutes from './routes/users.js';
import canvasRoutes from './routes/canvases.js';
import brainstormRoutes from './routes/brainstorm.js';
import aiRoutes from './routes/ai.js';
import notesRoutes from './routes/notes.js';
import gmailRoutes from './routes/gmail.js';
import meetingNotesRoutes from './routes/meeting-notes.js';
import jiraRoutes from './routes/jira.js';
import integrationsRoutes from './routes/integrations.js';
import syncRoutes from './routes/sync.js';
import featuresRoutes from './routes/features.js';
import { errorHandler } from './middleware/errorHandler.js';
import { prisma } from './lib/prisma.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 47421;

// Middleware
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Electron file:// sends Origin: null, or same-origin server calls)
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/initiatives', initiativeRoutes);
app.use('/api/users', userRoutes);
app.use('/api/canvases', canvasRoutes);
app.use('/api/brainstorm', brainstormRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/gmail', gmailRoutes);
app.use('/api/meeting-notes', meetingNotesRoutes);
app.use('/api/jira', jiraRoutes);
app.use('/api/integrations', integrationsRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/features', featuresRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling
app.use(errorHandler);

// Export for Electron (starts the server and resolves when listening)
export function startServer() {
  return new Promise((resolve, reject) => {
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      resolve(server);
    });
    server.on('error', reject);
  });
}

// Export for Electron migrations — reuses this module's already-loaded prisma
// singleton so only one Prisma engine process is ever spawned per app launch.
export async function runMigrations(migrationsDir) {
  const { existsSync, readdirSync, readFileSync, mkdirSync, appendFileSync } = await import('fs');
  const path = await import('path');
  const userDataDir = path.default.dirname(process.env.DATABASE_URL?.replace('file:', '') || '');
  const logPath = path.default.join(userDataDir, 'migration.log');
  mkdirSync(userDataDir, { recursive: true });
  const log = (msg) => appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`);

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      id                      TEXT PRIMARY KEY,
      checksum                TEXT NOT NULL,
      finished_at             DATETIME,
      migration_name          TEXT NOT NULL,
      logs                    TEXT,
      rolled_back_at          DATETIME,
      started_at              DATETIME NOT NULL DEFAULT current_timestamp,
      applied_steps_count     INTEGER NOT NULL DEFAULT 0
    )
  `);

  const rows = await prisma.$queryRawUnsafe(
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL'
  );
  const applied = new Set(rows.map(r => r.migration_name));

  let folders = [];
  try {
    folders = readdirSync(migrationsDir)
      .filter(f => !f.startsWith('.') && f !== 'migration_lock.toml')
      .sort();
  } catch {
    log('WARN migrations directory not found — skipping');
    return;
  }

  let appliedCount = 0;
  for (const folder of folders) {
    if (applied.has(folder)) continue;
    const sqlFile = path.default.join(migrationsDir, folder, 'migration.sql');
    if (!existsSync(sqlFile)) continue;
    const sql = readFileSync(sqlFile, 'utf8');
    log(`Applying migration: ${folder}`);
    try {
      const statements = sql
        .split(';')
        .map(s => s.replace(/--[^\n]*/g, '').trim())
        .filter(s => s.length > 0);
      for (const stmt of statements) {
        await prisma.$executeRawUnsafe(stmt);
      }
      await prisma.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, applied_steps_count)
         VALUES ('${folder}-id', 'n/a', datetime('now'), '${folder}', 1)`
      );
      appliedCount++;
      log(`OK: ${folder}`);
    } catch (e) {
      log(`ERROR applying ${folder}: ${e.message}`);
      throw new Error(`Migration "${folder}" failed: ${e.message}`);
    }
  }
  log(appliedCount > 0 ? `Done — ${appliedCount} migration(s) applied` : 'No new migrations');
}

// Auto-start when run directly (not imported by Electron)
if (process.env.ELECTRON !== 'true') {
  startServer();
}
