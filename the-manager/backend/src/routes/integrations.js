import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { decrypt } from '../middleware/cipher.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

// ─── Load JIRA/Confluence settings ───────────────────────────────────────────
async function loadAtlassianSettings() {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: ['jira_base_url', 'jira_email', 'jira_api_token'] } }
  });
  const map = {};
  for (const r of rows) {
    map[r.key] = r.key === 'jira_api_token' ? decrypt(r.value) : r.value;
  }
  return map;
}

// ─── Validate Atlassian base URL (SSRF guard) ───────────────────────────────
// Ensures the stored base URL is HTTPS and not pointing at a private/reserved address.
function validateAtlassianBaseUrl(raw) {
  let parsed;
  try { parsed = new URL(raw); } catch {
    throw Object.assign(new Error('Invalid JIRA base URL.'), { status: 400 });
  }
  if (parsed.protocol !== 'https:') {
    throw Object.assign(new Error('JIRA base URL must use HTTPS.'), { status: 400 });
  }
  const host = parsed.hostname.toLowerCase();
  const blocked = [
    /^localhost$/,
    /^127\./,                        // IPv4 loopback
    /^::1$/,                         // IPv6 loopback
    /^0\.0\.0\.0$/,
    /^169\.254\./,                   // link-local / AWS IMDS
    /^10\./,                         // RFC1918
    /^172\.(1[6-9]|2\d|3[01])\./,   // RFC1918
    /^192\.168\./,                   // RFC1918
    /^fc00:/i,                        // IPv6 ULA
    /^fe80:/i,                        // IPv6 link-local
  ];
  if (blocked.some(re => re.test(host))) {
    throw Object.assign(new Error('JIRA base URL points to a private or reserved address.'), { status: 400 });
  }
  // Return normalized URL without trailing slash (preserving any path prefix)
  return parsed.href.replace(/\/+$/, '');
}

// ─── Helpers to fetch from JIRA / Confluence ────────────────────────────────────────
async function fetchJiraTicket(settings, ticketKey) {
  const baseUrl = validateAtlassianBaseUrl(settings['jira_base_url']);
  const credentials = Buffer.from(`${settings['jira_email']}:${settings['jira_api_token']}`).toString('base64');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(
      `${baseUrl}/rest/api/3/issue/${encodeURIComponent(ticketKey.toUpperCase())}?fields=summary,description,status,priority,assignee,issuetype,updated,labels,components,reporter`,
      { headers: { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' }, signal: controller.signal }
    );
    if (!res.ok) throw Object.assign(new Error(`JIRA API ${res.status}`), { status: res.status });
    const data = await res.json();
    const fields = data.fields || {};

    const extractDescription = (desc) => {
      if (!desc) return '';
      if (typeof desc === 'string') return desc;
      const texts = [];
      const walk = (node) => {
        if (!node) return;
        if (node.type === 'text' && node.text) texts.push(node.text);
        if (node.content) node.content.forEach(walk);
      };
      walk(desc);
      return texts.join('').trim();
    };

    return {
      key:            data.key,
      url:            `${baseUrl}/browse/${data.key}`,
      summary:        fields.summary || '',
      description:    extractDescription(fields.description),
      status:         fields.status?.name || '',
      statusCategory: fields.status?.statusCategory?.name || '',
      priority:       fields.priority?.name || '',
      issueType:      fields.issuetype?.name || '',
      assignee:       fields.assignee?.displayName || null,
      reporter:       fields.reporter?.displayName || null,
      labels:         fields.labels || [],
      components:     (fields.components || []).map(c => c.name),
      updated:        fields.updated || null,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchConfluencePage(settings, pageId) {
  const baseUrl = validateAtlassianBaseUrl(settings['jira_base_url']);
  const credentials = Buffer.from(`${settings['jira_email']}:${settings['jira_api_token']}`).toString('base64');
  const headers = { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    let cfRes = await fetch(
      `${baseUrl}/wiki/rest/api/content/${pageId}?expand=body.view,version,space,ancestors`,
      { headers, signal: controller.signal }
    );
    if (cfRes.status === 404) {
      cfRes = await fetch(
        `${baseUrl}/rest/api/content/${pageId}?expand=body.view,version,space,ancestors`,
        { headers, signal: controller.signal }
      );
    }
    if (!cfRes.ok) throw Object.assign(new Error(`Confluence API ${cfRes.status}`), { status: cfRes.status });
    const data = await cfRes.json();

    const stripHtml = (html) => (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);

    const selfLink = data._links?.base
      ? `${data._links.base}${data._links?.webui || ''}`
      : `${baseUrl}/wiki/pages/${pageId}`;

    return {
      id:          data.id,
      key:         data.id,
      url:         selfLink,
      title:       data.title || '',
      space:       data.space?.name || '',
      spaceKey:    data.space?.key || '',
      version:     data.version?.number || null,
      lastUpdated: data.version?.when || null,
      excerpt:     stripHtml(data.body?.view?.value),
      ancestors:   (data.ancestors || []).map(a => a.title),
    };
  } finally {
    clearTimeout(timer);
  }
}

// Extract Confluence page ID from URL or raw ID input
function parseConfluencePageId(input) {
  const pagesMatch = input.match(/\/pages\/(\d+)/);
  const viewMatch  = input.match(/[?&]pageId=(\d+)/);
  if (pagesMatch)     return pagesMatch[1];
  if (viewMatch)      return viewMatch[1];
  if (/^\d+$/.test(input.trim())) return input.trim();
  return null;
}

// ─── GET /api/integrations/initiatives/:initiativeId ─────────────────────────
router.get('/initiatives/:initiativeId', async (req, res, next) => {
  try {
    const items = await prisma.integrationItem.findMany({
      where: { initiativeId: req.params.initiativeId },
      orderBy: { createdAt: 'asc' },
    });
    res.json(items);
  } catch (err) { next(err); }
});

// ─── POST /api/integrations/initiatives/:initiativeId ────────────────────────
// Body: { type: 'JIRA'|'CONFLUENCE', input: 'PROJ-123' | '<pageUrl>' }
router.post('/initiatives/:initiativeId', async (req, res, next) => {
  try {
    const { initiativeId } = req.params;
    const { type, input } = req.body;

    if (!type || !['JIRA', 'CONFLUENCE'].includes(type)) {
      return res.status(400).json({ error: 'type must be JIRA or CONFLUENCE' });
    }
    if (!input?.trim()) {
      return res.status(400).json({ error: 'input is required' });
    }

    const settings = await loadAtlassianSettings();
    if (!settings['jira_base_url'] || !settings['jira_email'] || !settings['jira_api_token']) {
      return res.status(400).json({ error: 'JIRA/Confluence credentials are not configured. Set them up in Settings.' });
    }

    let fetched, key, url, title;

    if (type === 'JIRA') {
      const ticketKey = input.trim().toUpperCase();
      if (!/^[A-Z][A-Z0-9_]+-\d+$/i.test(ticketKey)) {
        return res.status(400).json({ error: 'Invalid JIRA ticket key. Expected format: PROJECT-123' });
      }
      fetched = await fetchJiraTicket(settings, ticketKey);
      key   = fetched.key;
      url   = fetched.url;
      title = fetched.summary;
    } else {
      const pageId = parseConfluencePageId(input.trim());
      if (!pageId) {
        return res.status(400).json({ error: 'Could not parse a Confluence page ID from the input. Paste the full page URL or numeric page ID.' });
      }
      fetched = await fetchConfluencePage(settings, pageId);
      key   = fetched.id;
      url   = fetched.url;
      title = fetched.title;
    }

    // Check not already linked
    const existing = await prisma.integrationItem.findFirst({
      where: { initiativeId, type, key },
    });
    if (existing) {
      return res.status(409).json({ error: `${type === 'JIRA' ? 'Ticket' : 'Page'} "${key}" is already linked.` });
    }

    const item = await prisma.integrationItem.create({
      data: {
        type,
        key,
        url,
        title,
        cachedData: JSON.stringify(fetched),
        initiativeId,
      },
    });

    res.status(201).json(item);
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Request timed out.' });
    }
    if (err.status === 401) return res.status(401).json({ error: 'Authentication failed. Check credentials in Settings.' });
    if (err.status === 404) return res.status(404).json({ error: 'Not found. Check the ticket key or page URL.' });
    next(err);
  }
});

// ─── GET /api/integrations/:id/children ─────────────────────────────────────
// Fetch JIRA child issues/subtasks for a linked JIRA ticket item.
// Returns the children as an array (not persisted — always live from JIRA).
router.get('/:id/children', async (req, res, next) => {
  try {
    const item = await prisma.integrationItem.findUnique({ 
      where: { id: req.params.id },
      include: { initiative: { select: { createdById: true } } }
    });
    if (!item) return res.status(404).json({ error: 'Integration item not found.' });
    // Verify ownership of parent initiative
    if (item.initiative.createdById !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    if (item.type !== 'JIRA') return res.status(400).json({ error: 'Children are only available for JIRA tickets.' });

    const settings = await loadAtlassianSettings();
    if (!settings['jira_base_url'] || !settings['jira_email'] || !settings['jira_api_token']) {
      return res.status(400).json({ error: 'JIRA credentials not configured.' });
    }

    const baseUrl = validateAtlassianBaseUrl(settings['jira_base_url']);
    const credentials = Buffer.from(`${settings['jira_email']}:${settings['jira_api_token']}`).toString('base64');
    const headers = { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);

    // Fetch subtasks AND child issues via JQL
    // Also include the parent ticket itself with full subtask list in the fields
    let children = [];
    try {
      // Use JQL to get all issues that have this as their parent (Next-gen/team-managed)
      // and also issues linked via "is subtask of" (classic projects)
      const jqlQuery = `parent = ${item.key} ORDER BY created ASC`;
      const jqlRes = await fetch(
        `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jqlQuery)}&fields=summary,status,priority,assignee,issuetype,updated,description&maxResults=50`,
        { headers, signal: controller.signal }
      );

      // Also fetch the issue itself to get subtasks from the subtasks field
      const issueRes = await fetch(
        `${baseUrl}/rest/api/3/issue/${encodeURIComponent(item.key)}?fields=subtasks,summary`,
        { headers, signal: controller.signal }
      );

      const extractDescription = (desc) => {
        if (!desc) return '';
        if (typeof desc === 'string') return desc;
        const texts = [];
        const walk = (node) => {
          if (!node) return;
          if (node.type === 'text' && node.text) texts.push(node.text);
          if (node.content) node.content.forEach(walk);
        };
        walk(desc);
        return texts.join('').trim().slice(0, 500);
      };

      const childrenSet = new Map();

      // From JQL parent search
      if (jqlRes.ok) {
        const jqlData = await jqlRes.json();
        for (const issue of (jqlData.issues || [])) {
          const f = issue.fields || {};
          childrenSet.set(issue.key, {
            key:         issue.key,
            url:         `${baseUrl}/browse/${issue.key}`,
            summary:     f.summary || '',
            description: extractDescription(f.description),
            status:      f.status?.name || '',
            statusCategory: f.status?.statusCategory?.name || '',
            priority:    f.priority?.name || '',
            issueType:   f.issuetype?.name || '',
            assignee:    f.assignee?.displayName || null,
            updated:     f.updated || null,
          });
        }
      }

      // From subtasks field on the parent — fetch missing ones in parallel (capped at 20)
      if (issueRes.ok) {
        const issueData = await issueRes.json();
        const subtasks = issueData.fields?.subtasks || [];
        const missingKeys = subtasks.map(s => s.key).filter(k => !childrenSet.has(k)).slice(0, 20);
        const subResults = await Promise.all(
          missingKeys.map(key =>
            fetch(
              `${baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,status,priority,assignee,issuetype,updated,description`,
              { headers, signal: controller.signal }
            ).then(r => r.ok ? r.json() : null).catch(() => null)
          )
        );
        for (const subData of subResults) {
          if (!subData) continue;
          const f = subData.fields || {};
          childrenSet.set(subData.key, {
            key:         subData.key,
            url:         `${baseUrl}/browse/${subData.key}`,
            summary:     f.summary || '',
            description: extractDescription(f.description),
            status:      f.status?.name || '',
            statusCategory: f.status?.statusCategory?.name || '',
            priority:    f.priority?.name || '',
            issueType:   f.issuetype?.name || '',
            assignee:    f.assignee?.displayName || null,
            updated:     f.updated || null,
          });
        }
      }

      children = [...childrenSet.values()];
    } finally {
      clearTimeout(timer);
    }

    res.json(children);
  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'JIRA request timed out.' });
    next(err);
  }
});

// ─── GET /api/integrations/:id/confluence-children ──────────────────────────
// Fetch child pages from Confluence for a linked Confluence item (not persisted).
router.get('/:id/confluence-children', async (req, res, next) => {
  try {
    const item = await prisma.integrationItem.findUnique({ 
      where: { id: req.params.id },
      include: { initiative: { select: { createdById: true } } }
    });
    if (!item) return res.status(404).json({ error: 'Integration item not found.' });
    // Verify ownership of parent initiative
    if (item.initiative.createdById !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
    if (item.type !== 'CONFLUENCE') return res.status(400).json({ error: 'Child pages are only available for Confluence items.' });

    const settings = await loadAtlassianSettings();
    if (!settings['jira_base_url'] || !settings['jira_email'] || !settings['jira_api_token']) {
      return res.status(400).json({ error: 'Confluence credentials not configured.' });
    }

    const baseUrl = validateAtlassianBaseUrl(settings['jira_base_url']);
    const credentials = Buffer.from(`${settings['jira_email']}:${settings['jira_api_token']}`).toString('base64');
    const headers = { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);

    let children = [];
    try {
      const stripHtml = (html) => (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);

      // Try cloud /wiki/ prefix first, fall back to server path
      let cfRes = await fetch(
        `${baseUrl}/wiki/rest/api/content/${encodeURIComponent(item.key)}/child/page?expand=body.view,version,space&limit=50`,
        { headers, signal: controller.signal }
      );
      if (cfRes.status === 404) {
        cfRes = await fetch(
          `${baseUrl}/rest/api/content/${encodeURIComponent(item.key)}/child/page?expand=body.view,version,space&limit=50`,
          { headers, signal: controller.signal }
        );
      }

      if (cfRes.ok) {
        const cfData = await cfRes.json();
        for (const page of (cfData.results || [])) {
          const selfLink = page._links?.base
            ? `${page._links.base}${page._links?.webui || ''}`
            : `${baseUrl}/wiki/pages/${page.id}`;
          children.push({
            id:          page.id,
            title:       page.title || '',
            url:         selfLink,
            space:       page.space?.name || '',
            spaceKey:    page.space?.key || '',
            version:     page.version?.number || null,
            lastUpdated: page.version?.when || null,
            excerpt:     stripHtml(page.body?.view?.value),
          });
        }
      }
    } finally {
      clearTimeout(timer);
    }

    res.json(children);
  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Confluence request timed out.' });
    next(err);
  }
});

// ─── POST /api/integrations/:id/refresh ──────────────────────────────────────
router.post('/:id/refresh', async (req, res, next) => {
  try {
    const item = await prisma.integrationItem.findUnique({ 
      where: { id: req.params.id },
      include: { initiative: { select: { createdById: true } } }
    });
    if (!item) return res.status(404).json({ error: 'Integration item not found.' });
    // Verify ownership of parent initiative
    if (item.initiative.createdById !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

    const settings = await loadAtlassianSettings();
    if (!settings['jira_base_url'] || !settings['jira_email'] || !settings['jira_api_token']) {
      return res.status(400).json({ error: 'Credentials not configured.' });
    }

    let fetched;
    if (item.type === 'JIRA') {
      fetched = await fetchJiraTicket(settings, item.key);
    } else {
      fetched = await fetchConfluencePage(settings, item.key);
    }

    const updated = await prisma.integrationItem.update({
      where: { id: item.id },
      data: {
        url:        fetched.url,
        title:      item.type === 'JIRA' ? fetched.summary : fetched.title,
        cachedData: JSON.stringify(fetched),
      },
    });

    res.json(updated);
  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Request timed out.' });
    next(err);
  }
});

// ─── DELETE /api/integrations/:id ────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.integrationItem.delete({ where: { id: req.params.id } });
    res.json({ message: 'Removed.' });
  } catch (err) { next(err); }
});

export default router;
