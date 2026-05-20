/**
 * Shared Prisma client with automatic JSON serialization/deserialization.
 *
 * SQLite does not support the Json column type, so all JSON-valued fields are
 * stored as plain TEXT. This module transparently handles the conversion so
 * that route code can continue to work with JavaScript objects/arrays.
 *
 * Fields handled:
 *   User.preferences      (Object | null)
 *   Initiative.tags       (string[])
 *   Link.tags             (string[])
 *   ActivityLog.changes   (Object | null)
 *   BrainstormCanvas.nodes (any[])
 *   BrainstormCanvas.edges (any[])
 */

// Use default import for CJS/ESM interop compatibility (required in Electron packaged builds)
import _prismaClient from '@prisma/client';
const { PrismaClient } = _prismaClient;

// When DATABASE_URL is a Turso/libsql URL, use the driver adapter so Prisma
// Prisma 7 always requires a driver adapter — the URL is no longer in schema.prisma.
// For web/Docker:  TURSO_DATABASE_URL=libsql://... (Turso cloud)
// For desktop:     DATABASE_URL=file:/path/to/app.db (local SQLite via libsql file driver)
async function createPrismaClient() {
  const { PrismaLibSql } = await import('@prisma/adapter-libsql');

  const tursoUrl = process.env.TURSO_DATABASE_URL ?? '';
  const fileUrl  = process.env.DATABASE_URL ?? '';

  const isRemote = tursoUrl.startsWith('libsql://') || tursoUrl.startsWith('libsql+wss://');
  const isFile   = fileUrl.startsWith('file:');

  if (!isRemote && !isFile) {
    throw new Error(
      'No database configured. Set TURSO_DATABASE_URL (web) or DATABASE_URL=file:/path (desktop).'
    );
  }

  // v7 adapter takes a config object directly — no need to create a Client manually
  const adapter = new PrismaLibSql({
    url:       isRemote ? tursoUrl : fileUrl,
    authToken: isRemote ? process.env.TURSO_AUTH_TOKEN : undefined,
  });
  return new PrismaClient({ adapter });
}

const parse = (val, fallback = null) => {
  if (val === null || val === undefined) return fallback;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return fallback; }
};

const stringify = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'string') return val;
  return JSON.stringify(val);
};

const base = await createPrismaClient();

// Keep the Prisma query engine process alive while the server is running.
// The engine exits after ~5 min of idle by default — this prevents that.
setInterval(() => {
  base.$queryRaw`SELECT 1`.catch(() => {/* ignore */});
}, 4 * 60 * 1000);

export const prisma = base.$extends({
  // ── Read side: parse TEXT back to JS value ────────────────────────────────
  result: {
    user: {
      preferences: { needs: { preferences: true }, compute: u => parse(u.preferences) },
    },
    initiative: {
      tags: { needs: { tags: true }, compute: i => parse(i.tags, []) },
    },
    link: {
      tags: { needs: { tags: true }, compute: l => parse(l.tags, []) },
    },
    activityLog: {
      changes: { needs: { changes: true }, compute: a => parse(a.changes) },
    },
    brainstormCanvas: {
      nodes: { needs: { nodes: true }, compute: b => parse(b.nodes, []) },
      edges: { needs: { edges: true }, compute: b => parse(b.edges, []) },
    },
    bookmark: {
      tags: { needs: { tags: true }, compute: b => parse(b.tags, []) },
    },
  },

  // ── Write side: stringify JS value to TEXT before storing ─────────────────
  query: {
    user: {
      async create({ args, query }) {
        if (args.data.preferences !== undefined) args.data.preferences = stringify(args.data.preferences);
        return query(args);
      },
      async update({ args, query }) {
        if (args.data.preferences !== undefined) args.data.preferences = stringify(args.data.preferences);
        return query(args);
      },
      async upsert({ args, query }) {
        if (args.create?.preferences !== undefined) args.create.preferences = stringify(args.create.preferences);
        if (args.update?.preferences !== undefined) args.update.preferences = stringify(args.update.preferences);
        return query(args);
      },
    },
    initiative: {
      async create({ args, query }) {
        if (args.data.tags !== undefined) args.data.tags = stringify(args.data.tags ?? []);
        return query(args);
      },
      async update({ args, query }) {
        if (args.data.tags !== undefined) args.data.tags = stringify(args.data.tags);
        return query(args);
      },
      async upsert({ args, query }) {
        if (args.create?.tags !== undefined) args.create.tags = stringify(args.create.tags ?? []);
        if (args.update?.tags !== undefined) args.update.tags = stringify(args.update.tags);
        return query(args);
      },
    },
    link: {
      async create({ args, query }) {
        if (args.data.tags !== undefined) args.data.tags = stringify(args.data.tags ?? []);
        return query(args);
      },
      async update({ args, query }) {
        if (args.data.tags !== undefined) args.data.tags = stringify(args.data.tags);
        return query(args);
      },
      async upsert({ args, query }) {
        if (args.create?.tags !== undefined) args.create.tags = stringify(args.create.tags ?? []);
        if (args.update?.tags !== undefined) args.update.tags = stringify(args.update.tags);
        return query(args);
      },
    },
    activityLog: {
      async create({ args, query }) {
        if (args.data.changes !== undefined) args.data.changes = stringify(args.data.changes);
        return query(args);
      },
      async upsert({ args, query }) {
        if (args.create?.changes !== undefined) args.create.changes = stringify(args.create.changes);
        if (args.update?.changes !== undefined) args.update.changes = stringify(args.update.changes);
        return query(args);
      },
    },
    brainstormCanvas: {
      async create({ args, query }) {
        if (args.data.nodes !== undefined) args.data.nodes = stringify(args.data.nodes ?? []);
        if (args.data.edges !== undefined) args.data.edges = stringify(args.data.edges ?? []);
        return query(args);
      },
      async update({ args, query }) {
        if (args.data.nodes !== undefined) args.data.nodes = stringify(args.data.nodes);
        if (args.data.edges !== undefined) args.data.edges = stringify(args.data.edges);
        return query(args);
      },
      async upsert({ args, query }) {
        if (args.create?.nodes !== undefined) args.create.nodes = stringify(args.create.nodes ?? []);
        if (args.create?.edges !== undefined) args.create.edges = stringify(args.create.edges ?? []);
        if (args.update?.nodes !== undefined) args.update.nodes = stringify(args.update.nodes);
        if (args.update?.edges !== undefined) args.update.edges = stringify(args.update.edges);
        return query(args);
      },
    },
    bookmark: {
      async create({ args, query }) {
        if (args.data.tags !== undefined) args.data.tags = stringify(args.data.tags ?? []);
        return query(args);
      },
      async update({ args, query }) {
        if (args.data.tags !== undefined) args.data.tags = stringify(args.data.tags);
        return query(args);
      },
    },
  },
});
