import { Router } from 'express';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { authenticate } from '../middleware/auth.js';
import { encrypt, decrypt } from '../middleware/cipher.js';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

// ── Load Gmail credentials from DB (fallback to env) ─────────────────────────
async function loadGmailSettings() {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: ['gmail_user', 'gmail_app_password', 'gmail_label', 'gmail_search'] } },
  });
  const map = {};
  for (const row of rows) map[row.key] = row.value;
  return {
    user:     map.gmail_user          || process.env.GMAIL_USER          || '',
    password: map.gmail_app_password  || process.env.GMAIL_APP_PASSWORD  || '',
    label:    map.gmail_label         || 'Gemini Notes',
    search:   map.gmail_search        || 'gemini',
  };
}

// ── GET /api/gmail/settings ───────────────────────────────────────────────────
// Returns whether credentials are saved — never exposes the plaintext password.
router.get('/settings', async (req, res) => {
  try {
    const { user, password, label, search } = await loadGmailSettings();
    const fromDB = !!(await prisma.appSetting.findFirst({ where: { key: 'gmail_user' } }));
    res.json({
      userSet:     !!user,
      passwordSet: !!password,
      user:        user || '',
      encrypted:   password.startsWith('enc:'),
      source:      fromDB ? 'db' : (process.env.GMAIL_USER ? 'env' : 'none'),
      label,
      search,
    });
  } catch (e) {
    logger.error('Failed to load Gmail settings', e);
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /api/gmail/settings ───────────────────────────────────────────────────
// Accepts { user, appPassword } — encrypts password if TOKEN_ENCRYPTION_KEY is set.
router.put('/settings', async (req, res) => {
  const { user, appPassword, label, search } = req.body;
  // user + appPassword required only when setting credentials for the first time;
  // label/search can be updated independently if credentials are already saved.
  try {
    const ops = [];
    if (user !== undefined) {
      ops.push(prisma.appSetting.upsert({
        where:  { key: 'gmail_user' },
        update: { value: user },
        create: { key: 'gmail_user', value: user },
      }));
    }
    if (appPassword !== undefined && appPassword !== '') {
      let storedPassword = appPassword;
      if (process.env.TOKEN_ENCRYPTION_KEY?.length === 64) {
        storedPassword = encrypt(appPassword);
      }
      ops.push(prisma.appSetting.upsert({
        where:  { key: 'gmail_app_password' },
        update: { value: storedPassword },
        create: { key: 'gmail_app_password', value: storedPassword },
      }));
    }
    if (label !== undefined) {
      ops.push(prisma.appSetting.upsert({
        where:  { key: 'gmail_label' },
        update: { value: label },
        create: { key: 'gmail_label', value: label },
      }));
    }
    if (search !== undefined) {
      ops.push(prisma.appSetting.upsert({
        where:  { key: 'gmail_search' },
        update: { value: search },
        create: { key: 'gmail_search', value: search },
      }));
    }
    if (ops.length === 0) {
      return res.status(400).json({ error: 'Nothing to save' });
    }
    await Promise.all(ops);
    logger.info('Gmail settings saved', { user, label, search });
    res.json({ ok: true });
  } catch (e) {
    logger.error('Failed to save Gmail settings', e);
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/gmail/settings ───────────────────────────────────────────────
// Removes saved credentials from the database (env-sourced credentials are unaffected).
router.delete('/settings', async (req, res) => {
  try {
    await prisma.appSetting.deleteMany({
      where: { key: { in: ['gmail_user', 'gmail_app_password'] } },
    });
    logger.info('Gmail credentials removed');
    res.json({ ok: true });
  } catch (e) {
    logger.error('Failed to remove Gmail settings', e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/gmail/test-config  ───────────────────────────────────────────────
// Quick connection test — returns success/error without exposing credentials.
router.get('/test-config', async (req, res) => {
  const { user, password } = await loadGmailSettings();
  if (!user || !password) {
    return res.status(503).json({ ok: false, error: 'Gmail credentials not configured. Add them in Setup → Gmail Integration.' });
  }
  const isEncrypted = password.startsWith('enc:');
  if (isEncrypted && (process.env.TOKEN_ENCRYPTION_KEY || '').length !== 64) {
    return res.status(503).json({ ok: false, error: 'TOKEN_ENCRYPTION_KEY is missing or wrong length (need 64 hex chars)' });
  }
  let pass;
  try { pass = decrypt(password); } catch (e) {
    return res.status(503).json({ ok: false, error: `Decryption failed: ${e.message}` });
  }
  const client = new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user, pass },
    logger: false,
  });
  try {
    await client.connect();
    await client.logout();
    return res.json({ ok: true, user, encrypted: isEncrypted });
  } catch (e) {
    return res.status(401).json({ ok: false, error: e.message });
  }
});

// ── connect & return client ───────────────────────────────────────────────────
function makeClient({ user, password }) {
  return new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass: decrypt(password) },
    logger: false,
  });
}

// ── GET /api/gmail/meeting-notes  ─────────────────────────────────────────────
// Query params:
//   date   – "YYYY-MM-DD", defaults to today
//   label  – Gmail label name to open as mailbox (e.g. "Gemini Notes")
//            if omitted, falls back to INBOX + subject/sender text filter
//   search – text filter applied when label is NOT set (default: "gemini")
router.get('/meeting-notes', async (req, res, next) => {
  const { user, password, label: dbLabel, search: dbSearch } = await loadGmailSettings();
  if (!user || !password) {
    return res.status(503).json({ error: 'Gmail credentials not configured. Add them in Setup → Gmail Integration.' });
  }

  const dateParam  = req.query.date;
  // Use query param if provided, otherwise fall back to saved setting (default: "Gemini Notes")
  const labelParam = req.query.label !== undefined ? req.query.label.trim() : dbLabel;
  const searchTerm = labelParam ? null : (req.query.search ?? dbSearch).toLowerCase();
  const mailbox    = labelParam || 'INBOX';

  // Build date boundaries (local midnight)
  const base   = dateParam ? new Date(dateParam + 'T00:00:00') : new Date();
  const since  = new Date(base); since.setHours(0, 0, 0, 0);
  const before = new Date(base); before.setHours(0, 0, 0, 0); before.setDate(before.getDate() + 1);

  const client = makeClient({ user, password });
  try {
    await client.connect();

    // Open the requested mailbox/label
    let lock;
    try {
      lock = await client.getMailboxLock(mailbox);
    } catch (e) {
      const boxes = [];
      for await (const mb of client.list()) boxes.push(mb.path);
      return res.status(404).json({
        error: `Gmail label "${mailbox}" not found. Available mailboxes: ${boxes.join(', ')}`,
        availableMailboxes: boxes,
      });
    }

    const emails = [];
    try {
      const uids = await client.search({ since, before });

      if (uids.length === 0) {
        return res.json({ emails: [], date: since.toISOString(), mailbox, searchTerm });
      }

      const toFetch = uids.slice(-100);

      let skipped = 0;
      for await (const msg of client.fetch(toFetch, { source: true })) {
        try {
          const parsed   = await simpleParser(msg.source);
          const from     = (parsed.from?.text || '').toLowerCase();
          const subject  = (parsed.subject   || '').toLowerCase();
          // Prefer plain-text body; fall back to HTML stripped of tags
          // (Gemini Notes and many modern emails are HTML-only)
          const rawHtml  = parsed.html || '';
          const textBody = parsed.text
            || rawHtml
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<\/p>/gi, '\n')
                .replace(/<\/div>/gi, '\n')
                .replace(/<[^>]+>/g, '')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/[ \t]+/g, ' ')
                .replace(/\n{3,}/g, '\n\n')
                .trim();

          // Only apply text filter when NOT using a label (label itself is the filter)
          if (searchTerm && !from.includes(searchTerm) && !subject.includes(searchTerm)) {
            skipped++;
            continue;
          }

          emails.push({
            uid:       msg.uid,
            messageId: parsed.messageId || String(msg.uid),
            from:      parsed.from?.text || 'Unknown',
            subject:   parsed.subject   || '(no subject)',
            date:      parsed.date?.toISOString() || null,
            text:      textBody.trim(),
            html:      null,
            snippet:   textBody.trim().slice(0, 200),
          });
        } catch { /* skip unparseable messages */ }
      }
    } finally {
      lock.release();
    }

    emails.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json({ emails, date: since.toISOString(), mailbox, searchTerm });
  } catch (err) {
    if (err.message?.includes('AUTHENTICATIONFAILED') || err.message?.includes('Invalid credentials')) {
      logger.error('Gmail IMAP authentication failed', { user });
      return res.status(401).json({ error: 'Gmail authentication failed. Check your credentials in Setup → Gmail Integration.' });
    }
    logger.error('Gmail IMAP error', err);
    next(err);
  } finally {
    await client.logout().catch(() => {});
  }
});

export default router;
