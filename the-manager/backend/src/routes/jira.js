import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { encrypt, decrypt } from '../middleware/cipher.js';
import logger from '../lib/logger.js';
import { loadAISettings, callLLM, getActiveModel } from '../lib/llm.js';

function safeEncrypt(value) {
  return (process.env.TOKEN_ENCRYPTION_KEY?.length === 64) ? encrypt(value) : value;
}

const router = Router();
router.use(authenticate);

const SETTING_KEYS = ['jira_base_url', 'jira_email', 'jira_api_token'];

// ─── Load JIRA settings from DB ──────────────────────────────────────────────
async function loadJiraSettings(userId) {
  const rows = await prisma.userSetting.findMany({ where: { userId, key: { in: SETTING_KEYS } } });
  const map = {};
  for (const row of rows) {
    map[row.key] = row.key === 'jira_api_token' ? decrypt(row.value) : row.value;
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

// ─── GET /api/jira/settings ───────────────────────────────────────────────────
router.get('/settings', async (req, res, next) => {
  try {
    const settings = await loadJiraSettings(req.user.id);
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
    const userId = req.user.id;

    const upserts = [];

    if (baseUrl !== undefined) {
      upserts.push(prisma.userSetting.upsert({
        where: { userId_key: { userId, key: 'jira_base_url' } },
        update: { value: baseUrl.trim() },
        create: { userId, key: 'jira_base_url', value: baseUrl.trim() },
      }));
    }

    if (email !== undefined) {
      upserts.push(prisma.userSetting.upsert({
        where: { userId_key: { userId, key: 'jira_email' } },
        update: { value: email.trim() },
        create: { userId, key: 'jira_email', value: email.trim() },
      }));
    }

    if (apiToken) {
      upserts.push(prisma.userSetting.upsert({
        where: { userId_key: { userId, key: 'jira_api_token' } },
        update: { value: safeEncrypt(apiToken) },
        create: { userId, key: 'jira_api_token', value: safeEncrypt(apiToken) },
      }));
    }

    await Promise.all(upserts);

    const settings = await loadJiraSettings(userId);
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

    const settings = await loadJiraSettings(req.user.id);

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

    const settings = await loadJiraSettings(req.user.id);
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

    const settings = await loadJiraSettings(req.user.id);
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

    const settings = await loadJiraSettings(req.user.id);
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

// ─── AI helper for member summary ─────────────────────────────────────────────
async function generateMemberAISummary(memberName, issues, confluencePages, userId) {
  try {
    const settings = await loadAISettings(userId);
    const provider = settings.ai_provider;
    if (provider === 'disabled') return null;

    const issueLines = issues.slice(0, 40).map(i =>
      `- [${i.key}] ${i.summary} (${i.type}, ${i.status}, ${i.priority || 'no priority'}, updated: ${i.updated}${i.components?.length ? ', components: ' + i.components.join(',') : ''})`
    ).join('\n');
    const confLines = confluencePages.slice(0, 15).map(p =>
      `- "${p.title}" in space "${p.spaceName}" (modified: ${p.lastModified})`
    ).join('\n');

    const systemPrompt = `You are an engineering manager assistant. Analyze a team member's work data and return ONLY a valid JSON object with these exact keys:
{
  "focusAreas": ["string"],
  "summary": "string",
  "workloadLevel": "light|moderate|heavy|critical",
  "highlights": ["string", "string", "string"]
}
focusAreas: 3-6 concise labels (e.g. "Bug Fixes", "API Development", "Documentation")
summary: 2-3 sentences on what the person is focused on and their current workload
workloadLevel: one of light/moderate/heavy/critical based on volume and priority of issues
highlights: exactly 3 short actionable observations`;

    const userPrompt = `Team member: ${memberName}
JIRA issues in last 30 days (${issues.length} total):
${issueLines || '(none)'}

Confluence pages contributed to in last 30 days (${confluencePages.length} total):
${confLines || '(none)'}

Analyze the above and return the JSON summary.`;

    const { text, error: aiError } = await callLLM(settings, systemPrompt, userPrompt);

    if (text) logger.info('Member Insights AI call succeeded', { provider, model: getActiveModel(settings), member: memberName });
    if (!text) return { data: null, error: aiError || 'AI returned an empty response' };
    try { return { data: JSON.parse(text), error: null }; } catch { return { data: null, error: 'AI returned invalid JSON — try a different model' }; }
  } catch (err) {
    logger.error('generateMemberAISummary failed', err);
    return { data: null, error: err.message || 'AI summary failed' };
  }
}

// ─── Helper: fetch member raw data (steps 1-4, no AI) ────────────────────────
async function fetchMemberRawData(project, member, baseUrl, atFetch) {
  // 1. Resolve display name → accountId
  const userRes = await atFetch(
    `${baseUrl}/rest/api/3/user/search?query=${encodeURIComponent(member)}&maxResults=10`
  );
  if (!userRes.ok) { const e = new Error('Could not search JIRA users.'); e.statusCode = 502; throw e; }
  const users = await userRes.json();
  const matched = (Array.isArray(users) ? users : []).find(u => u.displayName === member)
    || (Array.isArray(users) && users.length > 0 ? users[0] : null);
  if (!matched) { const e = new Error(`User "${member}" not found in JIRA.`); e.statusCode = 404; throw e; }
  const accountId = matched.accountId;

  // 2. JIRA issues updated in last 30 days
  const since = new Date();
  since.setDate(since.getDate() - 30);
  const sinceStr = since.toISOString().split('T')[0];

  const jql = `project = "${project}" AND assignee = "${accountId}" AND updated >= "${sinceStr}" ORDER BY updated DESC`;
  const jiraRes = await atFetch(
    `${baseUrl}/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=100` +
    `&fields=summary,status,priority,updated,issuetype,labels,components`
  );
  if (!jiraRes.ok) {
    const errBody = await jiraRes.json().catch(() => ({}));
    const e = new Error(errBody?.errorMessages?.[0] || 'Could not fetch JIRA issues.'); e.statusCode = 502; throw e;
  }
  const jiraData = await jiraRes.json();
  const issues = (jiraData.issues || []).map(i => ({
    key:        i.key,
    summary:    i.fields.summary,
    status:     i.fields.status?.name,
    statusCat:  i.fields.status?.statusCategory?.name,
    priority:   i.fields.priority?.name,
    type:       i.fields.issuetype?.name,
    updated:    i.fields.updated?.split('T')[0],
    labels:     i.fields.labels || [],
    components: (i.fields.components || []).map(c => c.name),
  }));

  // 3. Confluence pages contributed in last 30 days
  let confluencePages = [];
  try {
    const cql = `contributor = "${accountId}" AND lastModified >= "${sinceStr}" AND type = "page" ORDER BY lastModified DESC`;
    const confRes = await atFetch(`${baseUrl}/wiki/rest/api/search?cql=${encodeURIComponent(cql)}&limit=25`);
    if (confRes.ok) {
      const confData = await confRes.json();
      confluencePages = (confData.results || []).map(p => ({
        id:           p.content?.id,
        title:        p.content?.title || p.title || 'Untitled',
        spaceName:    p.resultGlobalContainer?.title || '',
        url:          p.content?._links?.webui
                        ? `${baseUrl}/wiki${p.content._links.webui}`
                        : (p.url || ''),
        lastModified: p.lastModified?.split('T')[0],
        excerpt:      (p.excerpt || '').replace(/<[^>]+>/g, '').slice(0, 200),
      }));
    }
  } catch { /* Confluence not available — not fatal */ }

  // 4. Build 30-day activity heatmap
  const activityByDay = [];
  const now = new Date();
  for (let d = 29; d >= 0; d--) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    activityByDay.push({ date: date.toISOString().split('T')[0], jira: 0, confluence: 0, total: 0 });
  }
  const dayMap = Object.fromEntries(activityByDay.map(d => [d.date, d]));
  issues.forEach(i => {
    if (i.updated && dayMap[i.updated]) { dayMap[i.updated].jira += 1; dayMap[i.updated].total += 1; }
  });
  confluencePages.forEach(p => {
    if (p.lastModified && dayMap[p.lastModified]) {
      dayMap[p.lastModified].confluence += 1; dayMap[p.lastModified].total += 1;
    }
  });

  return { accountId, issues, confluencePages, activityByDay };
}

// ─── GET /api/jira/member-summary ─────────────────────────────────────────────
// Fetches JIRA issues + Confluence pages for a member in the last 30 days,
// builds a 30-day activity heatmap. Pass ?skipAi=true to skip AI (fast path).
// Query params: project (JIRA key), member (JIRA display name), skipAi (bool)
router.get('/member-summary', async (req, res, next) => {
  try {
    const { project, member, skipAi } = req.query;
    if (!project?.trim() || !member?.trim())
      return res.status(400).json({ error: 'project and member query params are required' });

    const settings = await loadJiraSettings(req.user.id);
    if (!settings['jira_base_url'] || !settings['jira_email'] || !settings['jira_api_token'])
      return res.status(400).json({ error: 'JIRA credentials not configured.' });

    const baseUrl = validateAtlassianBaseUrl(settings['jira_base_url']);
    const credentials = Buffer.from(`${settings['jira_email']}:${settings['jira_api_token']}`).toString('base64');
    const headers = { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' };
    const atFetch = (url, opts = {}) => fetch(url, { ...opts, headers: { ...headers, ...opts.headers } });

    let rawData;
    try { rawData = await fetchMemberRawData(project, member, baseUrl, atFetch); }
    catch (err) { return res.status(err.statusCode || 502).json({ error: err.message }); }

    const { accountId, issues, confluencePages, activityByDay } = rawData;

    let aiSummary = null, aiError = null;
    if (skipAi !== 'true') {
      const aiResult = await generateMemberAISummary(member, issues, confluencePages, req.user.id);
      aiSummary = aiResult?.data || null;
      aiError   = aiResult?.error || null;
    }

    res.json({ member, accountId, issues, confluencePages, activityByDay, aiSummary, aiError });
  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Request timed out.' });
    next(err);
  }
});

// ─── GET /api/jira/member-summary-ai ──────────────────────────────────────────
// Returns only the AI focus summary for a member. Called in parallel with
// /member-summary?skipAi=true so the UI can render data without waiting for AI.
router.get('/member-summary-ai', async (req, res, next) => {
  try {
    const { project, member } = req.query;
    if (!project?.trim() || !member?.trim())
      return res.status(400).json({ error: 'project and member query params are required' });

    const settings = await loadJiraSettings(req.user.id);
    if (!settings['jira_base_url'] || !settings['jira_email'] || !settings['jira_api_token'])
      return res.status(400).json({ error: 'JIRA credentials not configured.' });

    const baseUrl = validateAtlassianBaseUrl(settings['jira_base_url']);
    const credentials = Buffer.from(`${settings['jira_email']}:${settings['jira_api_token']}`).toString('base64');
    const headers = { 'Authorization': `Basic ${credentials}`, 'Accept': 'application/json' };
    const atFetch = (url, opts = {}) => fetch(url, { ...opts, headers: { ...headers, ...opts.headers } });

    let rawData;
    try { rawData = await fetchMemberRawData(project, member, baseUrl, atFetch); }
    catch (err) { return res.status(err.statusCode || 502).json({ error: err.message }); }

    const { issues, confluencePages } = rawData;
    const aiResult = await generateMemberAISummary(member, issues, confluencePages, req.user.id);
    res.json({ aiSummary: aiResult?.data || null, aiError: aiResult?.error || null });
  } catch (err) {
    if (err.name === 'AbortError') return res.status(504).json({ error: 'Request timed out.' });
    next(err);
  }
});

// ─── Team Member Roles ────────────────────────────────────────────────────────
// Returns { [name]: role } map for all tagged members in a project
router.get('/team-roles', async (req, res, next) => {
  try {
    const { project } = req.query;
    if (!project) return res.status(400).json({ error: 'project query param required' });
    const rows = await prisma.teamMemberRole.findMany({ where: { project } });
    const map = {};
    rows.forEach(r => { map[r.name] = r.role; });
    res.json(map);
  } catch (err) {
    next(err);
  }
});

// PUT /api/jira/team-roles
// Body: { project, name, role }  — role must be DEV | QA | PM | OTHER or null/'' to remove
router.put('/team-roles', async (req, res, next) => {
  try {
    const { project, name, role } = req.body;
    if (!project || !name) return res.status(400).json({ error: 'project and name required' });

    // Empty / null role means "remove tag"
    if (!role) {
      await prisma.teamMemberRole.deleteMany({ where: { project, name } });
      return res.json({ ok: true, removed: true });
    }

    const allowed = ['DEV', 'QA', 'PM', 'OTHER'];
    if (!allowed.includes(role)) return res.status(400).json({ error: `role must be one of ${allowed.join(', ')}` });

    const row = await prisma.teamMemberRole.upsert({
      where:  { project_name: { project, name } },
      update: { role },
      create: { project, name, role },
    });
    res.json(row);
  } catch (err) {
    next(err);
  }
});

export default router;
