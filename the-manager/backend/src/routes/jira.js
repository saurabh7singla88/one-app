import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

const SETTING_KEYS = ['jira_base_url', 'jira_email', 'jira_api_token'];

// ─── Load JIRA settings from DB ──────────────────────────────────────────────
async function loadJiraSettings() {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: SETTING_KEYS } } });
  const map = {};
  for (const row of rows) map[row.key] = row.value;
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

// ─── GET /api/jira/settings ───────────────────────────────────────────────────
router.get('/settings', async (req, res, next) => {
  try {
    const settings = await loadJiraSettings();
    res.json({
      baseUrl:      settings['jira_base_url'] || '',
      email:        settings['jira_email'] || '',
      apiTokenSet:  !!(settings['jira_api_token']),
    });
  } catch (err) {
    next(err);
  }
});

// ─── PUT /api/jira/settings ───────────────────────────────────────────────────
router.put('/settings', async (req, res, next) => {
  try {
    const { baseUrl, email, apiToken } = req.body;

    const upserts = [];

    if (baseUrl !== undefined) {
      upserts.push(prisma.appSetting.upsert({
        where: { key: 'jira_base_url' },
        update: { value: baseUrl.trim() },
        create: { key: 'jira_base_url', value: baseUrl.trim() },
      }));
    }

    if (email !== undefined) {
      upserts.push(prisma.appSetting.upsert({
        where: { key: 'jira_email' },
        update: { value: email.trim() },
        create: { key: 'jira_email', value: email.trim() },
      }));
    }

    if (apiToken) {
      upserts.push(prisma.appSetting.upsert({
        where: { key: 'jira_api_token' },
        update: { value: apiToken },
        create: { key: 'jira_api_token', value: apiToken },
      }));
    }

    await Promise.all(upserts);

    const settings = await loadJiraSettings();
    res.json({
      baseUrl:      settings['jira_base_url'] || '',
      email:        settings['jira_email'] || '',
      apiTokenSet:  !!(settings['jira_api_token']),
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/jira/fetch/:ticketKey ──────────────────────────────────────────
// Proxy request to JIRA API - fetch ticket details
router.get('/fetch/:ticketKey', async (req, res, next) => {
  try {
    const { ticketKey } = req.params;

    // Validate ticket key format (e.g. PROJ-123)
    if (!/^[A-Z][A-Z0-9_]+-\d+$/i.test(ticketKey)) {
      return res.status(400).json({ error: 'Invalid JIRA ticket key format. Expected format: PROJECT-123' });
    }

    const settings = await loadJiraSettings();

    if (!settings['jira_base_url'] || !settings['jira_email'] || !settings['jira_api_token']) {
      return res.status(400).json({ error: 'JIRA is not configured. Please set up JIRA credentials in Settings.' });
    }

    const baseUrl = validateAtlassianBaseUrl(settings['jira_base_url']);
    const credentials = Buffer.from(`${settings['jira_email']}:${settings['jira_api_token']}`).toString('base64');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    let jiraRes;
    try {
      jiraRes = await fetch(
        `${baseUrl}/rest/api/3/issue/${encodeURIComponent(ticketKey.toUpperCase())}?fields=summary,description,status,priority,assignee,issuetype,updated,labels,components,fixVersions,reporter`,
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timer);
    }

    if (jiraRes.status === 401) {
      return res.status(401).json({ error: 'JIRA authentication failed. Check your email and API token.' });
    }
    if (jiraRes.status === 403) {
      return res.status(403).json({ error: 'Access denied to this JIRA ticket. Check your permissions.' });
    }
    if (jiraRes.status === 404) {
      return res.status(404).json({ error: `JIRA ticket "${ticketKey.toUpperCase()}" not found.` });
    }
    if (!jiraRes.ok) {
      logger.error('JIRA API error', { status: jiraRes.status, ticketKey });
      return res.status(502).json({ error: `JIRA API returned status ${jiraRes.status}` });
    }

    const data = await jiraRes.json();
    const fields = data.fields || {};

    // Extract description text from Atlassian Document Format (ADF) or plain text
    const extractDescription = (desc) => {
      if (!desc) return '';
      if (typeof desc === 'string') return desc;
      // ADF format - extract text nodes
      const texts = [];
      const walk = (node) => {
        if (!node) return;
        if (node.type === 'text' && node.text) texts.push(node.text);
        if (node.content) node.content.forEach(walk);
      };
      walk(desc);
      return texts.join('').trim();
    };

    const ticket = {
      key:          data.key,
      url:          `${baseUrl}/browse/${data.key}`,
      summary:      fields.summary || '',
      description:  extractDescription(fields.description),
      status:       fields.status?.name || '',
      statusCategory: fields.status?.statusCategory?.name || '',
      priority:     fields.priority?.name || '',
      issueType:    fields.issuetype?.name || '',
      assignee:     fields.assignee?.displayName || null,
      reporter:     fields.reporter?.displayName || null,
      labels:       fields.labels || [],
      components:   (fields.components || []).map(c => c.name),
      fixVersions:  (fields.fixVersions || []).map(v => v.name),
      updated:      fields.updated || null,
    };

    res.json(ticket);
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'JIRA request timed out. Check your base URL and network access.' });
    }
    next(err);
  }
});

// ─── GET /api/jira/confluence/fetch?url=<pageUrl|pageId> ─────────────────────
// Fetch a Confluence page by URL or page ID. Reuses the same JIRA credentials
// since Atlassian Cloud shares auth across JIRA + Confluence on the same instance.
router.get('/confluence/fetch', async (req, res, next) => {
  try {
    const { url: rawInput } = req.query;
    if (!rawInput?.trim()) {
      return res.status(400).json({ error: 'Provide a Confluence page URL or page ID.' });
    }

    const settings = await loadJiraSettings();
    if (!settings['jira_base_url'] || !settings['jira_email'] || !settings['jira_api_token']) {
      return res.status(400).json({ error: 'JIRA/Confluence credentials are not configured. Set them up in Settings.' });
    }

    const baseUrl = validateAtlassianBaseUrl(settings['jira_base_url']);
    const credentials = Buffer.from(`${settings['jira_email']}:${settings['jira_api_token']}`).toString('base64');
    const headers = { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' };

    // Parse page ID from URL patterns:
    //   /wiki/spaces/SPACE/pages/123456789/Page-Title
    //   /wiki/spaces/SPACE/pages/123456789
    //   /pages/viewpage.action?pageId=123456789
    //   or just a numeric ID
    let pageId = null;
    const input = rawInput.trim();

    const pagesMatch = input.match(/\/pages\/(\d+)/);
    const viewMatch  = input.match(/[?&]pageId=(\d+)/);
    if (pagesMatch)    pageId = pagesMatch[1];
    else if (viewMatch) pageId = viewMatch[1];
    else if (/^\d+$/.test(input)) pageId = input;

    if (!pageId) {
      return res.status(400).json({ error: 'Could not extract a page ID from the provided URL or input. Paste the full Confluence page URL or just the numeric page ID.' });
    }

    // Detect whether instance is Cloud (/wiki prefix) or Server (no /wiki prefix)
    // Try Cloud first, fall back to Server path
    const confluenceBase = `${baseUrl}/wiki`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    let cfRes;
    try {
      cfRes = await fetch(
        `${confluenceBase}/rest/api/content/${pageId}?expand=body.view,version,space,ancestors`,
        { headers, signal: controller.signal }
      );
      // If Cloud path fails with 404 try Server (no /wiki) path
      if (cfRes.status === 404) {
        cfRes = await fetch(
          `${baseUrl}/rest/api/content/${pageId}?expand=body.view,version,space,ancestors`,
          { headers, signal: controller.signal }
        );
      }
    } finally {
      clearTimeout(timer);
    }

    if (cfRes.status === 401) {
      return res.status(401).json({ error: 'Confluence authentication failed. Check your email and API token.' });
    }
    if (cfRes.status === 403) {
      return res.status(403).json({ error: 'Access denied to this Confluence page.' });
    }
    if (cfRes.status === 404) {
      return res.status(404).json({ error: `Confluence page ID "${pageId}" not found.` });
    }
    if (!cfRes.ok) {
      return res.status(502).json({ error: `Confluence API returned status ${cfRes.status}` });
    }

    const data = await cfRes.json();

    // Strip HTML tags from body preview
    const stripHtml = (html) => {
      if (!html) return '';
      return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 500);
    };

    // Detect actual page URL
    const selfLink = data._links?.base
      ? `${data._links.base}${data._links?.webui || ''}`
      : `${confluenceBase}/pages/${pageId}`;

    const page = {
      id:          data.id,
      key:         data.id,
      url:         selfLink,
      title:       data.title || '',
      space:       data.space?.name || data.space?.key || '',
      spaceKey:    data.space?.key || '',
      version:     data.version?.number || null,
      lastUpdated: data.version?.when || null,
      excerpt:     stripHtml(data.body?.view?.value),
      ancestors:   (data.ancestors || []).map(a => a.title),
    };

    res.json(page);
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Confluence request timed out.' });
    }
    next(err);
  }
});

// ─── GET /api/jira/sprints?project=PROJ ──────────────────────────────────────
// List sprints for a project via the Agile API (board auto-detected from project key).
router.get('/sprints', async (req, res, next) => {
  try {
    const { project } = req.query;
    if (!project?.trim()) {
      return res.status(400).json({ error: 'Project key is required.' });
    }

    const settings = await loadJiraSettings();
    if (!settings['jira_base_url'] || !settings['jira_email'] || !settings['jira_api_token']) {
      return res.status(400).json({ error: 'JIRA is not configured.' });
    }

    const baseUrl = validateAtlassianBaseUrl(settings['jira_base_url']);
    const credentials = Buffer.from(`${settings['jira_email']}:${settings['jira_api_token']}`).toString('base64');
    const headers = { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    try {
      // Step 1: find boards for this project
      const boardUrl = new URL(`${baseUrl}/rest/agile/1.0/board`);
      boardUrl.searchParams.set('projectKeyOrId', project.trim().toUpperCase());
      boardUrl.searchParams.set('maxResults', '10');

      const boardRes = await fetch(boardUrl.toString(), { headers, signal: controller.signal });

      if (boardRes.status === 401) return res.status(401).json({ error: 'JIRA authentication failed.' });
      if (boardRes.status === 403) return res.status(403).json({ error: 'Access denied. Agile API may require Software project type.' });
      if (!boardRes.ok) {
        return res.status(502).json({ error: `Could not load boards (status ${boardRes.status}). This project may not have a board.` });
      }

      const boardData = await boardRes.json();
      const boards = boardData.values || [];
      if (boards.length === 0) {
        return res.status(404).json({ error: 'No boards found for this project.' });
      }

      // Use the first board (prefer Scrum boards over Kanban)
      const board = boards.find(b => b.type === 'scrum') || boards[0];

      // Step 2: fetch sprints for that board
      const sprintUrl = new URL(`${baseUrl}/rest/agile/1.0/board/${board.id}/sprint`);
      sprintUrl.searchParams.set('state', 'active,future,closed');
      sprintUrl.searchParams.set('maxResults', '50');

      const sprintRes = await fetch(sprintUrl.toString(), { headers, signal: controller.signal });
      if (!sprintRes.ok) {
        return res.status(502).json({ error: `Could not load sprints (status ${sprintRes.status}).` });
      }

      const sprintData = await sprintRes.json();
      const sprints = (sprintData.values || [])
        .sort((a, b) => {
          // active first, then future, then closed by start date desc
          const order = { active: 0, future: 1, closed: 2 };
          if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
          return new Date(b.startDate || 0) - new Date(a.startDate || 0);
        })
        .map(s => ({
          id:        s.id,
          name:      s.name,
          state:     s.state,       // active | future | closed
          startDate: s.startDate || null,
          endDate:   s.endDate || null,
        }));

      res.json({ board: { id: board.id, name: board.name }, sprints });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Request timed out.' });
    next(err);
  }
});

// ─── GET /api/jira/team ──────────────────────────────────────────────────────
// Fetch issues for the team using JQL. Supports filtering by project, sprint, etc.
// Query params:
//   project  - JIRA project key (required)
//   sprint   - sprint name or "active" (optional, defaults to active sprint)
//   maxResults - max issues to return (optional, defaults to 100)
router.get('/team', async (req, res, next) => {
  try {
    const { project, sprint, maxResults = 100 } = req.query;

    if (!project?.trim()) {
      return res.status(400).json({ error: 'Project key is required. Pass ?project=PROJ' });
    }

    // Validate project key format
    if (!/^[A-Z][A-Z0-9_]+$/i.test(project.trim())) {
      return res.status(400).json({ error: 'Invalid project key format.' });
    }

    const settings = await loadJiraSettings();
    if (!settings['jira_base_url'] || !settings['jira_email'] || !settings['jira_api_token']) {
      return res.status(400).json({ error: 'JIRA is not configured. Please set up JIRA credentials in Settings.' });
    }

    const baseUrl = validateAtlassianBaseUrl(settings['jira_base_url']);
    const credentials = Buffer.from(`${settings['jira_email']}:${settings['jira_api_token']}`).toString('base64');

    const cap = Math.min(Math.max(parseInt(maxResults, 10) || 100, 1), 200);

    // Discover the "Story Points" field ID dynamically from this Jira instance
    let spFieldId = null;
    try {
      const fieldsRes = await fetch(`${baseUrl}/rest/api/3/field`, {
        headers: { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' },
      });
      if (fieldsRes.ok) {
        const allFields = await fieldsRes.json();
        const spField = allFields.find(f =>
          f.name?.toLowerCase() === 'story points' ||
          f.name?.toLowerCase() === 'story point estimate'
        );
        if (spField) spFieldId = spField.id;
      }
    } catch (_) { /* non-fatal — fall back to known candidates */ }

    // Fallback candidates if dynamic lookup failed
    const SP_FIELDS = spFieldId
      ? [spFieldId]
      : ['customfield_10016', 'customfield_10028', 'customfield_10014', 'customfield_10004'];

    const FIELDS = `summary,status,priority,assignee,issuetype,updated,labels,components,${SP_FIELDS.join(',')},timeoriginalestimate,timeestimate`;

    // Helper: execute a JQL search and return the raw fetch response
    const doSearch = async (jql) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000); // extra time for changelog
      try {
        const searchUrl = new URL(`${baseUrl}/rest/api/3/search/jql`);
        searchUrl.searchParams.set('jql', jql);
        searchUrl.searchParams.set('maxResults', String(cap));
        searchUrl.searchParams.set('fields', FIELDS);
        searchUrl.searchParams.set('expand', 'changelog');
        return await fetch(searchUrl.toString(), {
          headers: { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
    };

    // Build JQL — prefer sprint-based filtering, fall back to unresolved if not supported
    let jql;
    let usedFallback = false;

    if (sprint === 'active' || sprint === '') {
      jql = `project = "${project.trim()}" AND sprint in openSprints() ORDER BY assignee ASC, priority DESC, updated DESC`;
    } else {
      jql = `project = "${project.trim()}" AND sprint = "${sprint.trim()}" ORDER BY assignee ASC, priority DESC, updated DESC`;
    }

    let jiraRes = await doSearch(jql);

    // 410 = sprint JQL function not available (Kanban / no Software license)
    // 400 = JQL syntax rejected — also fall back
    if ((jiraRes.status === 410 || jiraRes.status === 400) && (sprint === 'active' || sprint === '')) {
      usedFallback = true;
      jql = `project = "${project.trim()}" AND statusCategory != Done ORDER BY assignee ASC, priority DESC, updated DESC`;
      jiraRes = await doSearch(jql);
    }

    if (jiraRes.status === 401) {
      return res.status(401).json({ error: 'JIRA authentication failed.' });
    }
    if (jiraRes.status === 403) {
      return res.status(403).json({ error: 'Access denied. Check your JIRA permissions.' });
    }
    if (!jiraRes.ok) {
      const body = await jiraRes.text().catch(() => '');
      logger.error('JIRA search error', { status: jiraRes.status, body: body.slice(0, 300) });
      return res.status(502).json({ error: `JIRA API returned status ${jiraRes.status}` });
    }

    const data = await jiraRes.json();
    const issues = (data.issues || []).map(issue => {
      const f = issue.fields || {};

      // Build contributors: everyone who was ever assigned (from changelog) + current assignee
      const contributorsMap = new Map();

      // Past assignees from changelog (oldest first so current assignee wins on overwrite)
      const histories = issue.changelog?.histories || [];
      for (const history of histories) {
        for (const item of (history.items || [])) {
          if (item.field === 'assignee' && item.toString) {
            const id = item.to || item.toString;
            if (id && !contributorsMap.has(id)) {
              contributorsMap.set(id, {
                name: item.toString,
                avatar: null,
                accountId: item.to || null,
                role: 'past',
              });
            }
          }
        }
      }

      // Current assignee (overwrites past entry if they're reassigned back)
      if (f.assignee) {
        const id = f.assignee.accountId || f.assignee.displayName;
        contributorsMap.set(id, {
          name:      f.assignee.displayName,
          avatar:    f.assignee.avatarUrls?.['32x32'] || null,
          accountId: f.assignee.accountId || null,
          role:      'current',
        });
      }

      // If nobody ever touched it, treat as Unassigned
      const contributors = contributorsMap.size > 0
        ? Array.from(contributorsMap.values())
        : [{ name: 'Unassigned', avatar: null, accountId: null, role: 'current' }];

      return {
        key:        issue.key,
        url:        `${baseUrl}/browse/${issue.key}`,
        summary:    f.summary || '',
        status:     f.status?.name || '',
        statusCategory: f.status?.statusCategory?.name || '',
        priority:   f.priority?.name || '',
        priorityId: f.priority?.id || null,
        issueType:  f.issuetype?.name || '',
        assignee:   f.assignee?.displayName || 'Unassigned',
        assigneeAvatar: f.assignee?.avatarUrls?.['32x32'] || null,
        assigneeId: f.assignee?.accountId || null,
        contributors,
        labels:     f.labels || [],
        components: (f.components || []).map(c => c.name),
        storyPoints: SP_FIELDS.reduce((v, k) => v ?? (f[k] != null ? Number(f[k]) : null), null),
        originalEstimate: f.timeoriginalestimate || null,
        remainingEstimate: f.timeestimate || null,
        updated:    f.updated || null,
      };
    });

    // Group by ALL contributors (current + past), so a ticket appears under everyone who touched it
    const teamMap = {};
    for (const issue of issues) {
      for (const contributor of issue.contributors) {
        const name = contributor.name;
        if (!teamMap[name]) {
          teamMap[name] = {
            name,
            avatar:     contributor.avatar,
            accountId:  contributor.accountId,
            issues:     [],
            totalStoryPoints: 0,
            issueCount: 0,
          };
        }
        // Store the role (current/past) alongside the issue for this person
        teamMap[name].issues.push({ ...issue, myRole: contributor.role });
        teamMap[name].issueCount += 1;
        // Only count story points once — for the current assignee
        if (contributor.role === 'current' && issue.storyPoints) {
          teamMap[name].totalStoryPoints += issue.storyPoints;
        }
      }
    }

    const team = Object.values(teamMap).sort((a, b) => {
      if (a.name === 'Unassigned') return 1;
      if (b.name === 'Unassigned') return -1;
      return a.name.localeCompare(b.name);
    });

    // Detect which SP field was actually populated (for debugging)
    const spFieldUsed = spFieldId ||
      (issues.length > 0
        ? SP_FIELDS.find(k => data.issues[0]?.fields?.[k] != null) || null
        : null);

    res.json({
      total: data.total || issues.length,
      returned: issues.length,
      jql,
      sprintFallback: usedFallback,
      spFieldUsed,
      team,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'JIRA request timed out.' });
    }
    next(err);
  }
});

export default router;
