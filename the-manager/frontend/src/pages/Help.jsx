import { useState } from 'react';
import {
  Box, Typography, Chip, Divider, Accordion, AccordionSummary,
  AccordionDetails, TextField, InputAdornment, IconButton,
} from '@mui/material';
import {
  ExpandMore, Dashboard, FormatListBulleted, AccountTree,
  CheckBox as TasksIcon, NoteAlt, EventNote, FeedOutlined,
  Settings, People, BugReport, AutoFixHigh, Search, Clear,
  SmartToy, Chat, Palette, OpenInNew, Star,
} from '@mui/icons-material';

// ── Feature data ──────────────────────────────────────────────────────────────
const FEATURES = [
  {
    id: 'dashboard',
    icon: <Dashboard />,
    color: '#6366f1',
    bg: '#eef2ff',
    title: 'Dashboard',
    path: '/',
    tagline: 'Bird\'s-eye view of all your work',
    description:
      'The home screen gives you a real-time snapshot of everything in flight. Stats for active initiatives, tasks in progress, and blocked items are shown at a glance, together with AI-powered recommendation strips that surface what to work on next.',
    steps: [
      'Open the app — you land here automatically after login.',
      '"AI Priority Suggestions" strip shows AI-ranked initiatives that need attention. Click any card to open the detail drawer.',
      '"Task Priorities" strip does the same for standalone tasks.',
      'Use the "New Initiative" button to quickly create something without leaving the dashboard.',
      'Stats cards show total, In Progress, Blocked, and Completed counts for both initiatives and tasks.',
    ],
    tips: [
      'AI strips are lazy-loaded — they only call the AI once you scroll to them, saving resources.',
      'Clicking a card in the strips navigates directly to that item with the detail panel open.',
    ],
  },
  {
    id: 'initiatives',
    icon: <FormatListBulleted />,
    color: '#0052cc',
    bg: '#eff6ff',
    title: 'Initiatives',
    path: '/initiatives',
    tagline: 'Track every project and its sub-tasks',
    description:
      'The Initiatives list is the core of the app. Initiatives are hierarchical — a top-level initiative can contain any number of sub-initiatives, forming a tree. Each item has a status, priority, labels, assignees, due-date, and a rich detail panel with tabs for overview, links, notes, activity history, and meeting notes.',
    steps: [
      'Click "New Initiative" (top-right) to create a root-level item.',
      'Click any row to open the detail drawer on the right.',
      'Inside the drawer, use the Overview tab to edit the title, description, status, priority, labels, assignees, start/due dates, and progress.',
      'To add a sub-initiative: open the drawer and click "Add sub-initiative" inside the item list on the Overview tab.',
      'Use the "Links" tab to save URLs (tickets, docs, designs) associated with the initiative.',
      'Use the "Notes" tab to leave inline comments and notes.',
      'Use the "Activity" tab to see the full audit trail of who changed what.',
      '"Meetings" tab shows all meeting notes linked to this initiative.',
      'Use the canvas selector (top of the list) to filter initiatives by workspace. The "All" pill shows everything.',
      'Click the "⚡ AI Suggestions" button for AI-generated next steps, risks, and blockers.',
      'Click the "📊 Status Report" button to auto-generate a formatted status update.',
    ],
    tips: [
      'Drag the status chip directly on the list row to quick-change status via a popup.',
      'Right-click (or hover) a row to reveal extra actions like Move to Canvas or Delete.',
      'The "Expand / Collapse" toggle on each row reveals its sub-initiatives inline.',
      'Use search + filter chips to narrow down the list by status, priority, or assignee.',
    ],
  },
  {
    id: 'mindmap',
    icon: <AccountTree />,
    color: '#059669',
    bg: '#f0fdf4',
    title: 'Mind Map',
    path: '/mindmap',
    tagline: 'See your initiatives as a visual graph',
    description:
      'The Mind Map renders every initiative and its children as an interactive node-graph using React Flow. It gives a spatial overview that is hard to achieve in a list. Nodes are colour-coded by status.',
    steps: [
      'Navigate to Mind Map in the left sidebar.',
      'Select a canvas from the pill-bar at the top to focus on one workspace, or leave "All" active.',
      'Pan by clicking and dragging the canvas background.',
      'Zoom with the scroll wheel or the + / − controls (bottom-right).',
      'Click any node to open its detail drawer directly from the Mind Map.',
      'Use "Fit view" (bottom-right) to re-center all nodes.',
    ],
    tips: [
      'Node border colour maps to status: grey = Open, blue = In Progress, red = Blocked, green = Completed.',
      'If you have many items, pick a specific canvas first to reduce noise.',
    ],
  },
  {
    id: 'tasks',
    icon: <TasksIcon />,
    color: '#d97706',
    bg: '#fffbeb',
    title: 'Tasks',
    path: '/tasks',
    tagline: 'Standalone to-do items independent of initiatives',
    description:
      'Tasks are lightweight action items that live outside the initiative hierarchy. They have a title, status, priority, labels, assignees, and a due date. Check off a task to mark it done instantly. They support the same canvas scoping as initiatives.',
    steps: [
      'Click "New Task" to create a task in the current canvas.',
      'Check the checkbox on a row to toggle completion immediately (no drawer needed).',
      'Click the row title or the "Open" icon to open the full task detail drawer.',
      'Filter tasks by status or priority using the chips above the list.',
      'Search by keyword using the search box at the top.',
      'The AI Priority Strip on this page ranks your tasks by urgency.',
    ],
    tips: [
      'Use the "My Tasks" filter to see only items assigned to you.',
      'Labels and assignees can be multi-valued — use them to group related tasks.',
    ],
  },
  {
    id: 'notes',
    icon: <NoteAlt />,
    color: '#7c3aed',
    bg: '#f5f3ff',
    title: 'Notes',
    path: '/notes',
    tagline: 'Freeform rich-text notes, optionally password-protected',
    description:
      'Notes is a personal scratchpad. Notes can be nested (parent → child), are canvas-scoped, and can be individually locked with a password so sensitive content stays private. The editor supports rich text including headings, bold, bullets, and code blocks.',
    steps: [
      'Click "New Note" to create a note in the current canvas.',
      'Type a title and then click into the body area to start writing.',
      'Use the toolbar at the top of the editor to format (headings, bold, italic, lists, code).',
      'To add a child note: with a note selected, click "Add child note".',
      'To password-protect a note: click the lock icon on a note row, set a password. The note body will be hidden until the correct password is entered.',
      'To move or reparent a note: click the "..." menu → Move.',
    ],
    tips: [
      'Password protection is per-note; nested children are not automatically locked.',
      'Notes are scoped to the active canvas — switch canvases to see different note sets.',
    ],
  },
  {
    id: 'meeting-notes',
    icon: <EventNote />,
    color: '#0369a1',
    bg: '#f0f9ff',
    title: 'Meeting Notes',
    path: '/meeting-notes',
    tagline: 'Capture meeting notes and pull in email threads from Gmail',
    description:
      'Meeting Notes lets you write freeform notes about any meeting and optionally pull in related emails from your Gmail inbox. Notes can be linked to one or more initiatives so that they appear inside the initiative\'s "Meetings" tab.',
    steps: [
      'Open Meeting Notes from the sidebar.',
      'Click "New Note" to create a manual note — give it a subject, date, and body text.',
      'To pull emails from Gmail: first configure Gmail OAuth in Setup, then click the "Gmail" button to browse your inbox.',
      'To save an email as a meeting note: open the email in the Gmail pane, click "Save as meeting note".',
      'To link a note to an initiative: open the note, click "Link to Initiative", and search for the initiative by name.',
      'Within an initiative\'s Meetings tab you can also click "Add Note" to create one directly linked.',
      'Use "Summarize All (n)" inside the Meetings tab of an initiative to generate an AI summary of all linked meeting notes.',
    ],
    tips: [
      'Gmail integration requires OAuth setup (see Setup → Gmail).',
      'You can link one meeting note to multiple initiatives.',
    ],
  },
  {
    id: 'ai-newsletter',
    icon: <FeedOutlined />,
    color: '#b45309',
    bg: '#fffbeb',
    title: 'AI Newsletter',
    path: '/ai-newsletter',
    tagline: 'Auto-generate a status newsletter from all your initiatives',
    description:
      'The AI Newsletter page compiles all active initiatives into a human-readable newsletter-style summary. Useful for weekly status updates to stakeholders, all-hands prep, or just keeping yourself oriented.',
    steps: [
      'Open AI Newsletter from the sidebar.',
      'Click "Generate Newsletter".',
      'The AI reads all your initiatives (title, status, priority, description) and writes a summary.',
      'Edit the generated text directly in the text area if needed.',
      'Use "Copy to clipboard" to paste it into an email or Slack message.',
    ],
    tips: [
      'Be sure to keep initiative descriptions up to date — they are the primary input to the AI.',
      'You can regenerate as many times as you like; each generation is independent.',
    ],
  },
  {
    id: 'jira-confluence',
    icon: <BugReport />,
    color: '#0052cc',
    bg: '#eff6ff',
    title: 'JIRA & Confluence Integration',
    path: '/initiatives',
    tagline: 'Link JIRA tickets and Confluence pages to any initiative',
    description:
      'Inside any initiative\'s detail drawer you can attach one or more JIRA tickets or Confluence pages. The app fetches live data (title, status, assignee, labels, description) and caches it. You can also expand child tickets / sub-pages, run per-item AI actions, and chat with the linked documents.',
    steps: [
      'Open any initiative → detail drawer.',
      'Find the "JIRA & CONFLUENCE" section in the Overview tab.',
      'Click "Link" → type a JIRA ticket key (e.g. PROJ-123) or a Confluence page URL / page ID → click "Fetch & Link".',
      'The card appears with live data fetched from Atlassian. Click the ticket key to open it in a browser.',
      'Click the tree icon (⑂) on a card to fetch child tickets (JIRA) or child pages (Confluence).',
      'Click the ✨ wand icon to run an AI action on a single item: Summarize, Identify Risks, Surface Blockers, Key Decisions, or Action Items.',
      'Check multiple cards to enable the selection toolbar. Use the action dropdown + "Run ✨" to run an action across all selected items simultaneously.',
      'Click "💬 Chat" (header button) to open the inline chat panel scoped to selected or all linked items. Type a question and press Enter.',
      'Click "Refresh" (↻) to re-fetch the latest data from JIRA / Confluence.',
    ],
    tips: [
      'Configure JIRA credentials first in Setup → JIRA.',
      'Confluence uses the same Atlassian credentials as JIRA.',
      'The chat panel supports multi-turn conversation — ask follow-ups freely.',
      'Chat is scoped: if items are selected, the AI only sees those; otherwise it sees everything linked.',
      'Use Shift+Enter in the chat input for a newline, Enter to send.',
    ],
  },
  {
    id: 'ai',
    icon: <AutoFixHigh />,
    color: '#7c3aed',
    bg: '#f5f3ff',
    title: 'AI Features (all)',
    path: null,
    tagline: 'AI throughout the app — priority ranking, summaries, brainstorming, chat',
    description:
      'AI is woven into the whole product rather than isolated in one place. The AI provider is configurable (Ollama local, OpenAI, Gemini, or any OpenAI-compatible endpoint). All AI calls go through the backend so your API keys never touch the frontend.',
    steps: [
      'Priority Strip — shown on Dashboard and Tasks. AI ranks items by urgency.',
      'AI Suggestions in Initiatives — click "⚡ AI" on an initiative row for next steps, risks, and blockers.',
      'Status Report — click "📊 Status Report" on an initiative for a formatted stakeholder update.',
      'Initiative Summary Dialog — click the summary icon on a row for a one-liner AI summary.',
      'JIRA / Confluence single-item actions — ✨ wand gives Summarize, Risks, Blockers, Key Decisions, Action Items.',
      'JIRA / Confluence multi-item actions — check multiple cards and run a consolidated action.',
      'Chat with documents — "💬 Chat" inside JIRA & Confluence section for multi-turn Q&A.',
      'Meeting notes summarisation — "Summarize All" button inside the Meetings tab.',
      'AI Newsletter — full-page AI-written status digest.',
    ],
    tips: [
      'Configure your preferred AI provider in Setup → AI Provider.',
      'Ollama requires the server running locally (default: http://localhost:11434).',
      'OpenAI and Gemini require valid API keys — never leave them blank.',
      'If an AI call times out or fails, a red error message appears inline — check Setup first.',
    ],
  },
  {
    id: 'canvases',
    icon: <Palette />,
    color: '#0891b2',
    bg: '#ecfeff',
    title: 'Canvases',
    path: '/initiatives',
    tagline: 'Separate workspaces to organise initiatives and tasks',
    description:
      'Canvases let you group initiatives and tasks into named workspaces — for example one per team, product, or quarter. The canvas selector appears as a pill-bar above the Initiatives list, Tasks list, Mind Map, and Notes. Switching canvases instantly filters everything.',
    steps: [
      'Navigate to Initiatives or Tasks.',
      'The canvas pill-bar sits at the top of the content area. "All" is the default.',
      'Click "+" to create a new canvas. Give it a name, optional description, and a colour.',
      'Click any canvas pill to filter the view to that workspace.',
      'Right-click a canvas pill to rename or delete it.',
      'When creating an initiative or task while a canvas is active, the item is automatically assigned to that canvas.',
    ],
    tips: [
      'Deleting a canvas does not delete its initiatives — they move to "uncategorised" (visible in All).',
      'Canvas colours appear as dots in the pill and as left-border accents on initiative rows.',
    ],
  },
  {
    id: 'users',
    icon: <People />,
    color: '#475569',
    bg: '#f1f5f9',
    title: 'Users',
    path: '/users',
    tagline: 'Manage team members and their access levels',
    description:
      'Admins can add, edit, disable, and delete user accounts. There are three roles: Admin (full access), Manager (create and manage initiatives), and Viewer (read-only, can be assigned items).',
    steps: [
      'Open Users from the sidebar (Admin only).',
      'Click "Add User" → fill in name, email, password, and role.',
      'Click the edit (pencil) icon on any row to change name, role, or reset password.',
      'Toggle the "Active" switch to disable a user without deleting them.',
      'Click the delete icon to permanently remove a user.',
    ],
    tips: [
      'Only Admins can see this page.',
      'Disabled users cannot log in but their names remain on historical activity logs.',
      'Viewers can be assigned to initiatives and tasks but cannot make changes.',
    ],
  },
  {
    id: 'setup',
    icon: <Settings />,
    color: '#64748b',
    bg: '#f8fafc',
    title: 'Setup',
    path: '/setup',
    tagline: 'Configure AI, JIRA, Gmail, and application settings',
    description:
      'Setup is the central configuration page. Configure your AI provider, Atlassian (JIRA + Confluence) credentials, and Gmail OAuth. Changes take effect immediately without a restart.',
    steps: [
      'Open Setup from the sidebar.',
      'AI Provider: choose Ollama, OpenAI, Gemini, or an OpenAI-compatible endpoint. Fill in the model name and API key where required.',
      'Click "Save AI Settings" to persist your chosen provider.',
      'JIRA / Confluence: enter your Atlassian base URL (e.g. https://yourcompany.atlassian.net), your email, and an Atlassian API token. Click "Save JIRA Settings".',
      'Test JIRA connection using the "Test Connection" button.',
      'Gmail OAuth: click "Connect Gmail" and follow the browser OAuth flow. Once connected, Meeting Notes can read your inbox.',
      'To disconnect Gmail: click "Disconnect Gmail".',
    ],
    tips: [
      'Atlassian API tokens are created at https://id.atlassian.com/manage-profile/security/api-tokens.',
      'Gmail OAuth stores only a refresh token — your emails are never stored permanently.',
      'All credentials are stored encrypted in the local SQLite database.',
    ],
  },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepList({ steps }) {
  return (
    <Box component="ol" sx={{ m: 0, pl: 2.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
      {steps.map((step, i) => (
        <Box component="li" key={i}>
          <Typography variant="body2" color="text.primary" sx={{ lineHeight: 1.65 }}>
            {step}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function TipList({ tips }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {tips.map((tip, i) => (
        <Box key={i} display="flex" gap={1} alignItems="flex-start">
          <Star sx={{ fontSize: 13, color: '#f59e0b', mt: '3px', flexShrink: 0 }} />
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.65 }}>
            {tip}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function FeatureAccordion({ feature, defaultExpanded }) {
  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      disableGutters
      elevation={0}
      sx={{
        border: '1px solid #e2e8f0',
        borderRadius: '12px !important',
        '&:before': { display: 'none' },
        mb: 1.5,
        overflow: 'hidden',
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMore />}
        sx={{
          bgcolor: feature.bg,
          px: 2.5,
          py: 1.25,
          minHeight: 0,
          '& .MuiAccordionSummary-content': { alignItems: 'center', gap: 1.5, my: 0 },
        }}
      >
        <Box sx={{
          width: 36, height: 36, borderRadius: 2, flexShrink: 0,
          bgcolor: feature.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff',
        }}>
          {feature.icon}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
            <Typography variant="subtitle1" fontWeight={700} color={feature.color}>
              {feature.title}
            </Typography>
            {feature.path && (
              <Chip
                label={feature.path}
                size="small"
                sx={{ height: 18, fontSize: '0.62rem', bgcolor: '#fff', color: 'text.secondary', border: '1px solid #e2e8f0' }}
              />
            )}
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.15 }}>
            {feature.tagline}
          </Typography>
        </Box>
      </AccordionSummary>

      <AccordionDetails sx={{ px: 2.5, pt: 2, pb: 2.5, bgcolor: '#fff' }}>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.7 }}>
          {feature.description}
        </Typography>

        <Typography variant="caption" fontWeight={700} color="text.disabled" letterSpacing={0.6}
          textTransform="uppercase" display="block" mb={1}>
          How to use
        </Typography>
        <StepList steps={feature.steps} />

        {feature.tips?.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="caption" fontWeight={700} color="text.disabled" letterSpacing={0.6}
              textTransform="uppercase" display="block" mb={1}>
              Tips
            </Typography>
            <TipList tips={feature.tips} />
          </>
        )}
      </AccordionDetails>
    </Accordion>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Help() {
  const [search, setSearch] = useState('');

  const filtered = FEATURES.filter(f => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      f.title.toLowerCase().includes(q) ||
      f.tagline.toLowerCase().includes(q) ||
      f.description.toLowerCase().includes(q) ||
      f.steps.some(s => s.toLowerCase().includes(q)) ||
      (f.tips || []).some(t => t.toLowerCase().includes(q))
    );
  });

  return (
    <Box sx={{ maxWidth: 820, mx: 'auto', px: 3, py: 3 }}>

      {/* Hero */}
      <Box sx={{
        mb: 3, p: 3, borderRadius: 3,
        background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 60%, #4f46e5 100%)',
        color: '#fff',
      }}>
        <Box display="flex" alignItems="center" gap={1.5} mb={1}>
          <SmartToy sx={{ fontSize: 28, color: '#a5b4fc' }} />
          <Typography variant="h5" fontWeight={800} letterSpacing="-0.02em">
            Help &amp; Feature Guide
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ color: '#c7d2fe', lineHeight: 1.75, maxWidth: 560 }}>
          <strong style={{ color: '#fff' }}>One</strong> is an AI-assisted initiative tracker built for senior managers to track projects, tasks, notes, and meeting outcomes — all with optional AI analysis powered by Ollama, OpenAI, or Gemini.
        </Typography>
        <Box display="flex" flexWrap="wrap" gap={0.75} mt={2}>
          {FEATURES.map(f => (
            <Chip key={f.id} label={f.title} size="small"
              onClick={() => {
                setSearch(f.title);
                setTimeout(() => {
                  document.getElementById(`feature-${f.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
              }}
              sx={{ fontSize: '0.7rem', bgcolor: 'rgba(255,255,255,0.12)', color: '#e0e7ff',
                cursor: 'pointer', '&:hover': { bgcolor: 'rgba(255,255,255,0.22)' } }}
            />
          ))}
        </Box>
      </Box>

      {/* Search */}
      <TextField
        fullWidth
        size="small"
        placeholder="Search features, steps, tips…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        sx={{ mb: 2.5, '& .MuiOutlinedInput-root': { borderRadius: 2.5, bgcolor: '#fff' } }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <Search sx={{ fontSize: 18, color: 'text.disabled' }} />
            </InputAdornment>
          ),
          endAdornment: search ? (
            <InputAdornment position="end">
              <IconButton size="small" onClick={() => setSearch('')}>
                <Clear sx={{ fontSize: 16 }} />
              </IconButton>
            </InputAdornment>
          ) : null,
        }}
      />

      {filtered.length === 0 && (
        <Box textAlign="center" py={6}>
          <Typography color="text.disabled">No features match "{search}"</Typography>
        </Box>
      )}

      {/* Feature accordions */}
      {filtered.map((f, i) => (
        <Box key={f.id} id={`feature-${f.id}`}>
          <FeatureAccordion feature={f} defaultExpanded={i === 0 && !search} />
        </Box>
      ))}

      {/* Footer note */}
      <Box sx={{ mt: 2, p: 2, borderRadius: 2, bgcolor: '#f8fafc', border: '1px solid #e2e8f0' }}>
        <Box display="flex" alignItems="center" gap={0.75} mb={0.5}>
          <Chat sx={{ fontSize: 14, color: '#6366f1' }} />
          <Typography variant="caption" fontWeight={700} color="#6366f1">Need more help?</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          Check the <code>SPEC.md</code> and <code>README.md</code> files in the project root for developer documentation. For AI features, ensure your provider is configured in <strong>Setup</strong>.
        </Typography>
      </Box>

    </Box>
  );
}
