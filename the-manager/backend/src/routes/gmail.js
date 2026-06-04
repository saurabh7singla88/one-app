import { Router }           from 'express';
import { ImapFlow }         from 'imapflow';
import { simpleParser }     from 'mailparser';
import { google }           from 'googleapis';
import { randomBytes }      from 'crypto';
import { authenticate }     from '../middleware/auth.js';
import { encrypt, decrypt } from '../middleware/cipher.js';
import { prisma }           from '../lib/prisma.js';
import logger               from '../lib/logger.js';

const router = Router();

const OAUTH_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';

function getBackendOrigin() {
  // PUBLIC_URL lets you override the externally-visible base URL (e.g. when running
  // behind Docker port-mapping or a reverse proxy where the internal port differs).
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  return `http://localhost:${process.env.PORT || 47421}`;
}

function getFrontendOrigin() {
  const origins = process.env.ALLOWED_ORIGINS?.split(',') ?? ['http://localhost:5173'];
  return origins[0].trim();
}

function getRedirectUri() {
  return `${getBackendOrigin()}/api/gmail/oauth/callback`;
}

function makeOAuth2Client({ clientId, clientSecret }) {
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri());
}

// Encrypt only when the key is configured; otherwise store plain.
function safeEncrypt(value) {
  if (!value) return value;
  return (process.env.TOKEN_ENCRYPTION_KEY?.length === 64) ? encrypt(value) : value;
}

// ── Load all Gmail settings from DB (fallback to env for legacy fields) ───────
const SETTING_KEYS = [
  'gmail_user', 'gmail_app_password', 'gmail_label', 'gmail_search',
  'gmail_auth_method',
  'gmail_oauth_client_id', 'gmail_oauth_client_secret',
  'gmail_oauth_refresh_token', 'gmail_oauth_access_token',
  'gmail_oauth_token_expiry', 'gmail_oauth_email',
];

async function loadGmailSettings() {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: SETTING_KEYS } } });
  const map  = Object.fromEntries(rows.map(r => [r.key, r.value]));
  return {
    authMethod:        map.gmail_auth_method          ?? null,
    user:              map.gmail_user                 ?? process.env.GMAIL_USER         ?? '',
    password:          map.gmail_app_password         ?? process.env.GMAIL_APP_PASSWORD ?? '',
    label:             map.gmail_label                ?? 'Gemini Notes',
    search:            map.gmail_search               ?? 'gemini',
    oauthClientId:     map.gmail_oauth_client_id      ?? '',
    oauthClientSecret: map.gmail_oauth_client_secret  ?? '',
    oauthRefreshToken: map.gmail_oauth_refresh_token  ?? '',
    oauthAccessToken:  map.gmail_oauth_access_token   ?? '',
    oauthTokenExpiry:  map.gmail_oauth_token_expiry   ?? '0',
    oauthEmail:        map.gmail_oauth_email          ?? '',
  };
}

// ── Get a valid OAuth2 access token, refreshing if needed ────────────────────
async function getValidAccessToken(settings) {
  const { oauthClientId, oauthClientSecret, oauthRefreshToken } = settings;
  if (!oauthClientId || !oauthClientSecret || !oauthRefreshToken) {
    throw new Error('OAuth2 not fully configured. Connect via Setup → Gmail Integration.');
  }

  const now = Date.now();
  const { oauthAccessToken, oauthTokenExpiry } = settings;

  // Reuse existing token if it has more than 60 s left
  if (oauthAccessToken && Number(oauthTokenExpiry) - 60_000 > now) {
    return decrypt(oauthAccessToken);
  }

  // Refresh
  const oauth2Client = makeOAuth2Client({
    clientId:     oauthClientId,
    clientSecret: decrypt(oauthClientSecret),
  });
  oauth2Client.setCredentials({ refresh_token: decrypt(oauthRefreshToken) });
  const { credentials } = await oauth2Client.refreshAccessToken();
  const newToken  = credentials.access_token;
  const newExpiry = String(credentials.expiry_date ?? now + 3_600_000);

  await Promise.all([
    prisma.appSetting.upsert({
      where:  { key: 'gmail_oauth_access_token' },
      update: { value: safeEncrypt(newToken) },
      create: { key: 'gmail_oauth_access_token', value: safeEncrypt(newToken) },
    }),
    prisma.appSetting.upsert({
      where:  { key: 'gmail_oauth_token_expiry' },
      update: { value: newExpiry },
      create: { key: 'gmail_oauth_token_expiry', value: newExpiry },
    }),
  ]);

  return newToken;
}

// ── Shared HTML → plain text strip ───────────────────────────────────────────
function htmlToText(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi,   '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── Fetch emails via Gmail REST API (gmail.readonly) ─────────────────────────
async function fetchEmailsViaGmailAPI({ settings, dateParam, labelParam, searchTerm }) {
  const accessToken = await getValidAccessToken(settings);
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const gmail = google.gmail({ version: 'v1', auth });

  // Build date range
  const base   = dateParam ? new Date(`${dateParam}T00:00:00`) : new Date();
  const since  = new Date(base); since.setHours(0, 0, 0, 0);
  const before = new Date(base); before.setHours(0, 0, 0, 0); before.setDate(before.getDate() + 1);

  const fmt = d =>
    `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;

  let q       = `after:${fmt(since)} before:${fmt(before)}`;
  let labelIds;

  if (labelParam) {
    // Resolve label name → label ID
    const labelsRes = await gmail.users.labels.list({ userId: 'me' });
    const found = (labelsRes.data.labels ?? [])
      .find(l => l.name.toLowerCase() === labelParam.toLowerCase());
    if (!found) {
      const err = new Error(`Gmail label "${labelParam}" not found.`);
      err.availableLabels = (labelsRes.data.labels ?? []).map(l => l.name);
      err.statusCode = 404;
      throw err;
    }
    labelIds = [found.id];
  } else if (searchTerm) {
    q += ` ${searchTerm}`;
  }

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q,
    ...(labelIds ? { labelIds } : {}),
    maxResults: 100,
  });

  const messages = listRes.data.messages ?? [];
  const emails   = [];

  for (const m of messages) {
    try {
      const msgRes = await gmail.users.messages.get({ userId: 'me', id: m.id, format: 'raw' });
      const rawBuf = Buffer.from(msgRes.data.raw, 'base64url');
      const parsed = await simpleParser(rawBuf);
      const textBody = parsed.text || htmlToText(parsed.html || '');

      emails.push({
        uid:       m.id,
        messageId: parsed.messageId || m.id,
        from:      parsed.from?.text ?? 'Unknown',
        subject:   parsed.subject   ?? '(no subject)',
        date:      parsed.date?.toISOString() ?? null,
        text:      textBody.trim(),
        html:      null,
        snippet:   textBody.trim().slice(0, 200),
      });
    } catch { /* skip unparseable messages */ }
  }

  emails.sort((a, b) => new Date(b.date) - new Date(a.date));
  return emails;
}

// ─────────────────────────────────────────────────────────────────────────────
// OAuth callback is a public route — must be registered BEFORE authenticate
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /api/gmail/oauth/callback ─────────────────────────────────────────────
router.get('/oauth/callback', async (req, res) => {
  const { code, state, error: oauthError } = req.query;
  const frontend = getFrontendOrigin();

  if (oauthError) {
    return res.redirect(
      `${frontend}/setup?oauth=error&message=${encodeURIComponent(oauthError)}`
    );
  }
  if (!code || !state) {
    return res.redirect(`${frontend}/setup?oauth=error&message=Missing+code+or+state`);
  }

  try {
    // Verify CSRF state
    const storedRow = await prisma.appSetting.findFirst({ where: { key: 'gmail_oauth_state' } });
    if (!storedRow || storedRow.value !== state) {
      return res.redirect(`${frontend}/setup?oauth=error&message=Invalid+state+parameter`);
    }
    await prisma.appSetting.deleteMany({ where: { key: 'gmail_oauth_state' } });

    const settings = await loadGmailSettings();
    if (!settings.oauthClientId || !settings.oauthClientSecret) {
      return res.redirect(
        `${frontend}/setup?oauth=error&message=OAuth+client+credentials+not+found`
      );
    }

    const oauth2Client = makeOAuth2Client({
      clientId:     settings.oauthClientId,
      clientSecret: decrypt(settings.oauthClientSecret),
    });
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    // Get the user's email via Gmail profile (works with gmail.readonly scope)
    const gmail   = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const email   = profile.data.emailAddress ?? '';

    const ops = [
      prisma.appSetting.upsert({
        where:  { key: 'gmail_oauth_access_token' },
        update: { value: safeEncrypt(tokens.access_token) },
        create: { key: 'gmail_oauth_access_token', value: safeEncrypt(tokens.access_token) },
      }),
      prisma.appSetting.upsert({
        where:  { key: 'gmail_oauth_token_expiry' },
        update: { value: String(tokens.expiry_date ?? Date.now() + 3_600_000) },
        create: { key: 'gmail_oauth_token_expiry', value: String(tokens.expiry_date ?? Date.now() + 3_600_000) },
      }),
      prisma.appSetting.upsert({
        where:  { key: 'gmail_oauth_email' },
        update: { value: email },
        create: { key: 'gmail_oauth_email', value: email },
      }),
    ];

    if (tokens.refresh_token) {
      ops.push(
        prisma.appSetting.upsert({
          where:  { key: 'gmail_oauth_refresh_token' },
          update: { value: safeEncrypt(tokens.refresh_token) },
          create: { key: 'gmail_oauth_refresh_token', value: safeEncrypt(tokens.refresh_token) },
        })
      );
    }

    await Promise.all(ops);
    logger.info('Gmail OAuth2 connected', { email });

    return res.redirect(
      `${frontend}/setup?oauth=success&email=${encodeURIComponent(email)}`
    );
  } catch (e) {
    logger.error('Gmail OAuth callback error', e);
    return res.redirect(
      `${frontend}/setup?oauth=error&message=${encodeURIComponent(e.message)}`
    );
  }
});

// Apply JWT auth to all routes registered below this line
router.use(authenticate);

// ── GET /api/gmail/settings ───────────────────────────────────────────────────
router.get('/settings', async (req, res) => {
  try {
    const s      = await loadGmailSettings();
    const fromDB = !!(await prisma.appSetting.findFirst({ where: { key: 'gmail_user' } }));
    res.json({
      // App Password
      userSet:          !!s.user,
      passwordSet:      !!s.password,
      user:             s.user,
      encrypted:        s.password.startsWith('enc:'),
      source:           fromDB ? 'db' : (process.env.GMAIL_USER ? 'env' : 'none'),
      // Shared
      label:            s.label,
      search:           s.search,
      authMethod:       s.authMethod,
      // OAuth2
      oauthClientIdSet: !!s.oauthClientId,
      oauthConnected:   !!s.oauthRefreshToken,
      oauthEmail:       s.oauthEmail,
    });
  } catch (e) {
    logger.error('Failed to load Gmail settings', e);
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /api/gmail/settings ───────────────────────────────────────────────────
router.put('/settings', async (req, res) => {
  const { user, appPassword, label, search, authMethod, clientId, clientSecret } = req.body;
  try {
    const ops = [];

    if (authMethod !== undefined) {
      ops.push(prisma.appSetting.upsert({
        where:  { key: 'gmail_auth_method' },
        update: { value: authMethod },
        create: { key: 'gmail_auth_method', value: authMethod },
      }));
    }
    if (user !== undefined) {
      ops.push(prisma.appSetting.upsert({
        where:  { key: 'gmail_user' },
        update: { value: user },
        create: { key: 'gmail_user', value: user },
      }));
    }
    if (appPassword !== undefined && appPassword !== '') {
      ops.push(prisma.appSetting.upsert({
        where:  { key: 'gmail_app_password' },
        update: { value: safeEncrypt(appPassword) },
        create: { key: 'gmail_app_password', value: safeEncrypt(appPassword) },
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
    if (clientId !== undefined) {
      ops.push(prisma.appSetting.upsert({
        where:  { key: 'gmail_oauth_client_id' },
        update: { value: clientId },
        create: { key: 'gmail_oauth_client_id', value: clientId },
      }));
    }
    if (clientSecret !== undefined && clientSecret !== '') {
      ops.push(prisma.appSetting.upsert({
        where:  { key: 'gmail_oauth_client_secret' },
        update: { value: safeEncrypt(clientSecret) },
        create: { key: 'gmail_oauth_client_secret', value: safeEncrypt(clientSecret) },
      }));
    }

    if (ops.length === 0) return res.status(400).json({ error: 'Nothing to save' });
    await Promise.all(ops);
    logger.info('Gmail settings saved', { authMethod, user, label, search });
    res.json({ ok: true });
  } catch (e) {
    logger.error('Failed to save Gmail settings', e);
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/gmail/settings (App Password credentials only) ────────────────
router.delete('/settings', async (req, res) => {
  try {
    await prisma.appSetting.deleteMany({
      where: { key: { in: ['gmail_user', 'gmail_app_password'] } },
    });
    logger.info('Gmail app-password credentials removed');
    res.json({ ok: true });
  } catch (e) {
    logger.error('Failed to remove Gmail settings', e);
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/gmail/oauth (OAuth2 credentials only) ────────────────────────
router.delete('/oauth', async (req, res) => {
  try {
    await prisma.appSetting.deleteMany({
      where: {
        key: {
          in: [
            'gmail_oauth_client_id', 'gmail_oauth_client_secret',
            'gmail_oauth_refresh_token', 'gmail_oauth_access_token',
            'gmail_oauth_token_expiry', 'gmail_oauth_email',
          ],
        },
      },
    });
    logger.info('Gmail OAuth2 credentials removed');
    res.json({ ok: true });
  } catch (e) {
    logger.error('Failed to remove Gmail OAuth2 settings', e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/gmail/oauth/auth-url ─────────────────────────────────────────────
router.get('/oauth/auth-url', async (req, res) => {
  try {
    const settings = await loadGmailSettings();
    if (!settings.oauthClientId || !settings.oauthClientSecret) {
      return res.status(400).json({ error: 'Save Client ID and Client Secret first.' });
    }

    const state = randomBytes(16).toString('hex');
    await prisma.appSetting.upsert({
      where:  { key: 'gmail_oauth_state' },
      update: { value: state },
      create: { key: 'gmail_oauth_state', value: state },
    });

    const oauth2Client = makeOAuth2Client({
      clientId:     settings.oauthClientId,
      clientSecret: decrypt(settings.oauthClientSecret),
    });
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope:       OAUTH_SCOPE,
      state,
      prompt:      'consent', // always return a fresh refresh_token
    });

    res.json({ url });
  } catch (e) {
    logger.error('Failed to generate OAuth2 auth URL', e);
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/gmail/test-config ────────────────────────────────────────────────
router.get('/test-config', async (req, res) => {
  const s = await loadGmailSettings();

  if (s.authMethod === 'oauth2') {
    if (!s.oauthRefreshToken) {
      return res.status(503).json({
        ok: false,
        error: 'OAuth2 not connected. Click "Connect with Google" in Setup.',
      });
    }
    try {
      const accessToken = await getValidAccessToken(s);
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: accessToken });
      const gmail   = google.gmail({ version: 'v1', auth });
      const profile = await gmail.users.getProfile({ userId: 'me' });
      return res.json({ ok: true, user: profile.data.emailAddress, method: 'oauth2' });
    } catch (e) {
      return res.status(401).json({ ok: false, error: e.message });
    }
  }

  // App Password / IMAP
  const { user, password } = s;
  if (!user || !password) {
    return res.status(503).json({
      ok: false,
      error: 'Gmail credentials not configured. Add them in Setup → Gmail Integration.',
    });
  }
  const isEncrypted = password.startsWith('enc:');
  if (isEncrypted && (process.env.TOKEN_ENCRYPTION_KEY ?? '').length !== 64) {
    return res.status(503).json({
      ok: false,
      error: 'TOKEN_ENCRYPTION_KEY is missing or wrong length (need 64 hex chars)',
    });
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
    return res.json({ ok: true, user, encrypted: isEncrypted, method: 'app_password' });
  } catch (e) {
    return res.status(401).json({ ok: false, error: e.message });
  }
});

// ── IMAP client factory (App Password path) ───────────────────────────────────
function makeClient({ user, password }) {
  return new ImapFlow({
    host: 'imap.gmail.com', port: 993, secure: true,
    auth: { user, pass: decrypt(password) },
    logger: false,
  });
}

// ── GET /api/gmail/meeting-notes ──────────────────────────────────────────────
router.get('/meeting-notes', async (req, res, next) => {
  const s          = await loadGmailSettings();
  const dateParam  = req.query.date;
  const labelParam = req.query.label !== undefined ? req.query.label.trim() : s.label;
  const searchTerm = labelParam ? null : (req.query.search ?? s.search).toLowerCase();
  const mailbox    = labelParam || 'INBOX';

  // ── OAuth2 path ────────────────────────────────────────────────────────────
  if (s.authMethod === 'oauth2') {
    if (!s.oauthRefreshToken) {
      return res.status(503).json({
        error: 'Gmail OAuth2 not connected. Configure it in Setup → Gmail Integration.',
      });
    }
    try {
      const emails = await fetchEmailsViaGmailAPI({ settings: s, dateParam, labelParam, searchTerm });
      const base   = dateParam ? new Date(`${dateParam}T00:00:00`) : new Date();
      const since  = new Date(base); since.setHours(0, 0, 0, 0);
      return res.json({ emails, date: since.toISOString(), mailbox, searchTerm });
    } catch (err) {
      if (err.statusCode === 404) {
        return res.status(404).json({ error: err.message, availableLabels: err.availableLabels });
      }
      logger.error('Gmail REST API error', err);
      return next(err);
    }
  }

  // ── App Password / IMAP path ───────────────────────────────────────────────
  const { user, password } = s;
  if (!user || !password) {
    return res.status(503).json({
      error: 'Gmail credentials not configured. Add them in Setup → Gmail Integration.',
    });
  }

  const base   = dateParam ? new Date(`${dateParam}T00:00:00`) : new Date();
  const since  = new Date(base); since.setHours(0, 0, 0, 0);
  const before = new Date(base); before.setHours(0, 0, 0, 0); before.setDate(before.getDate() + 1);

  const client = makeClient({ user, password });
  try {
    await client.connect();

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
      for await (const msg of client.fetch(toFetch, { source: true })) {
        try {
          const parsed   = await simpleParser(msg.source);
          const from     = (parsed.from?.text ?? '').toLowerCase();
          const subject  = (parsed.subject   ?? '').toLowerCase();
          const textBody = parsed.text || htmlToText(parsed.html || '');

          if (searchTerm && !from.includes(searchTerm) && !subject.includes(searchTerm)) continue;

          emails.push({
            uid:       msg.uid,
            messageId: parsed.messageId || String(msg.uid),
            from:      parsed.from?.text ?? 'Unknown',
            subject:   parsed.subject   ?? '(no subject)',
            date:      parsed.date?.toISOString() ?? null,
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
      return res.status(401).json({
        error: 'Gmail authentication failed. Check your credentials in Setup → Gmail Integration.',
      });
    }
    logger.error('Gmail IMAP error', err);
    next(err);
  } finally {
    await client.logout().catch(() => {});
  }
});

export default router;

