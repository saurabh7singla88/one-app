import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, TextField, Button, Paper, Avatar, Chip,
  CircularProgress, Alert, Collapse, IconButton, Tooltip,
  LinearProgress, Divider, Link, Select, MenuItem, FormControl,
  InputLabel, Card, CardContent, Stack, Drawer, Skeleton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  ToggleButtonGroup, ToggleButton, useTheme,
} from '@mui/material';
import {
  Groups, ExpandMore, ExpandLess, OpenInNew, Refresh,
  BugReport, Task as TaskIcon, BookmarkBorder, ArrowUpward,
  ArrowDownward, Remove, Circle, Close,
  TableRows, ViewAgenda, FilterList, InsightsOutlined,
  Article as ArticleIcon,
} from '@mui/icons-material';
import api from '../api/axios';

// ─── Role config ─────────────────────────────────────────────────────────────
const ROLE_CONFIG = {
  DEV:   { label: 'Dev',   color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  QA:    { label: 'QA',    color: '#7c3aed', bg: 'rgba(124,58,237,0.12)' },
  PM:    { label: 'PM',    color: '#0891b2', bg: 'rgba(8,145,178,0.12)' },
  OTHER: { label: 'Other', color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
};
const ROLE_ORDER = ['DEV', 'QA', 'PM', 'OTHER'];

// ─── Feature flags ───────────────────────────────────────────────────────────
const INSIGHTS_ENABLED = import.meta.env.VITE_ENABLE_MEMBER_INSIGHTS === 'true';

// ─── Priority color mapping ──────────────────────────────────────────────────
const PRIORITY_CONFIG = {
  Highest:  { color: '#d32f2f', icon: <ArrowUpward sx={{ fontSize: 14 }} /> },
  High:     { color: '#e65100', icon: <ArrowUpward sx={{ fontSize: 14 }} /> },
  Medium:   { color: '#ed6c02', icon: <Remove sx={{ fontSize: 14 }} /> },
  Low:      { color: '#2e7d32', icon: <ArrowDownward sx={{ fontSize: 14 }} /> },
  Lowest:   { color: '#558b2f', icon: <ArrowDownward sx={{ fontSize: 14 }} /> },
};

const STATUS_COLORS = {
  'To Do':       '#90a4ae',
  'In Progress': '#1976d2',
  'In Review':   '#7b1fa2',
  'Done':        '#2e7d32',
};

function getStatusColor(statusCategory) {
  if (statusCategory === 'Done') return '#2e7d32';
  if (statusCategory === 'In Progress') return '#1976d2';
  return '#90a4ae'; // To Do / New
}

// ─── Issue Type Icon ─────────────────────────────────────────────────────────
function IssueTypeIcon({ type }) {
  if (type === 'Bug') return <BugReport sx={{ fontSize: 16, color: '#d32f2f' }} />;
  if (type === 'Story') return <BookmarkBorder sx={{ fontSize: 16, color: '#2e7d32' }} />;
  return <TaskIcon sx={{ fontSize: 16, color: '#1976d2' }} />;
}

// ─── Single Issue Row ────────────────────────────────────────────────────────
function IssueRow({ issue }) {
  const theme = useTheme();
  const priorityCfg = PRIORITY_CONFIG[issue.priority] || { color: '#757575', icon: <Circle sx={{ fontSize: 8 }} /> };
  const statusColor = getStatusColor(issue.statusCategory);
  const isPast = issue.myRole === 'past';

  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, py: 1, px: 1.5,
        borderRadius: 1.5,
        '&:hover': { bgcolor: 'action.hover' },
        borderBottom: `1px solid ${theme.palette.divider}`,
        opacity: isPast ? 0.72 : 1,
      }}
    >
      <IssueTypeIcon type={issue.issueType} />

      <Tooltip title={issue.priority} arrow>
        <Box sx={{ color: priorityCfg.color, display: 'flex', alignItems: 'center' }}>
          {priorityCfg.icon}
        </Box>
      </Tooltip>

      <Link
        href={issue.url}
        target="_blank"
        rel="noopener noreferrer"
        sx={{ fontFamily: 'monospace', fontSize: 12, color: '#5c6bc0', whiteSpace: 'nowrap' }}
      >
        {issue.key}
      </Link>

      <Typography variant="body2" sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {issue.summary}
      </Typography>

      {isPast && (
        <Tooltip title={`Currently assigned to: ${issue.assignee}`} arrow>
          <Chip
            label="Past"
            size="small"
            sx={{ fontSize: 10, height: 18, bgcolor: 'rgba(123,31,162,0.12)', color: '#9c27b0', border: '1px solid rgba(123,31,162,0.3)', cursor: 'default' }}
          />
        </Tooltip>
      )}

      {issue.storyPoints != null && (
        <Chip label={`${issue.storyPoints} SP`} size="small" sx={{ fontSize: 11, height: 20 }} />
      )}

      <Chip
        label={issue.status}
        size="small"
        sx={{
          fontSize: 11, height: 22, fontWeight: 600,
          bgcolor: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}40`,
        }}
      />
    </Box>
  );
}

// ─── Team Member Card ────────────────────────────────────────────────────────
function MemberCard({ member, role, onRoleChange, onSummaryClick }) {
  const [expanded, setExpanded] = useState(true);
  const theme = useTheme();
  const roleCfg = role ? ROLE_CONFIG[role] : null;

  const currentIssues = member.issues.filter(i => i.myRole === 'current');
  const pastIssues    = member.issues.filter(i => i.myRole === 'past');

  const inProgress = currentIssues.filter(i => i.statusCategory === 'In Progress').length;
  const done       = currentIssues.filter(i => i.statusCategory === 'Done').length;
  const todo       = currentIssues.filter(i => i.statusCategory !== 'In Progress' && i.statusCategory !== 'Done').length;

  return (
    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, mb: 2 }}>
      <CardContent sx={{ pb: expanded ? 0 : 2, '&:last-child': { pb: expanded ? 1 : 2 } }}>
        {/* Member Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar
            src={member.avatar}
            sx={{ width: 36, height: 36, bgcolor: member.name === 'Unassigned' ? '#bdbdbd' : '#5c6bc0' }}
          >
            {member.name[0]}
          </Avatar>

          <Box sx={{ flex: 1 }}>
            <Typography variant="subtitle1" fontWeight={600} sx={{ lineHeight: 1.3 }}>
              {member.name}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.25 }}>
              <Typography variant="caption" color="text.secondary">
                {currentIssues.length} assigned
              </Typography>
              {pastIssues.length > 0 && (
                <Typography variant="caption" sx={{ color: '#7b1fa2' }}>
                  • {pastIssues.length} past
                </Typography>
              )}
              {member.totalStoryPoints > 0 && (
                <Typography variant="caption" color="text.secondary">
                  • {member.totalStoryPoints} SP
                </Typography>
              )}
            </Stack>
          </Box>

          {/* Role select */}
          {onRoleChange && member.name !== 'Unassigned' && (
            <FormControl size="small" variant="outlined" sx={{ minWidth: 82, flexShrink: 0 }}>
              <Select
                value={role || ''}
                onChange={e => onRoleChange(member.name, e.target.value || null)}
                displayEmpty
                sx={{
                  fontSize: 11, height: 26,
                  '& .MuiSelect-select': { py: 0.3, px: 1 },
                  ...(roleCfg ? { bgcolor: roleCfg.bg, color: roleCfg.color, '& fieldset': { borderColor: `${roleCfg.color}60` } } : {}),
                }}
                renderValue={v => v
                  ? <Typography variant="caption" fontWeight={600} sx={{ color: roleCfg?.color }}>{roleCfg?.label}</Typography>
                  : <Typography variant="caption" color="text.disabled">Tag role</Typography>
                }
              >
                {role && <MenuItem value=""><Typography variant="caption" color="text.secondary">— Remove tag —</Typography></MenuItem>}
                {ROLE_ORDER.map(r => (
                  <MenuItem key={r} value={r}>
                    <Chip label={ROLE_CONFIG[r].label} size="small"
                      sx={{ fontSize: 11, height: 20, bgcolor: ROLE_CONFIG[r].bg, color: ROLE_CONFIG[r].color,
                            border: `1px solid ${ROLE_CONFIG[r].color}40`, pointerEvents: 'none' }} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {/* Quick stats */}
          <Stack direction="row" spacing={0.75} sx={{ mr: 1 }}>
            {todo > 0 && (
              <Chip label={`${todo} To Do`} size="small" sx={{ fontSize: 10, height: 20, bgcolor: '#90a4ae20', color: '#546e7a' }} />
            )}
            {inProgress > 0 && (
              <Chip label={`${inProgress} In Progress`} size="small" sx={{ fontSize: 10, height: 20, bgcolor: '#1976d218', color: '#1976d2' }} />
            )}
            {done > 0 && (
              <Chip label={`${done} Done`} size="small" sx={{ fontSize: 10, height: 20, bgcolor: '#2e7d3218', color: '#2e7d32' }} />
            )}
          </Stack>

          <IconButton size="small" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ExpandLess /> : <ExpandMore />}
          </IconButton>

          {/* Insights icon — rightmost, visually separated */}
          {onSummaryClick && member.name !== 'Unassigned' && (
            <Box sx={{ borderLeft: '1px solid', borderColor: 'divider', pl: 0.75, ml: 0.25, display: 'flex', alignItems: 'center' }}>
              <Tooltip title="Member Insights" arrow>
                <IconButton size="small" onClick={() => onSummaryClick(member.name, member.avatar)}
                  sx={{ color: '#6366f1', '&:hover': { bgcolor: 'rgba(99,102,241,0.12)' } }}>
                  <InsightsOutlined sx={{ fontSize: 17 }} />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>

        {/* Progress Bar — based on current assignments only */}
        {currentIssues.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <Box sx={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', bgcolor: 'action.disabledBackground' }}>
              <Box sx={{ width: `${(done / currentIssues.length) * 100}%`, bgcolor: '#2e7d32' }} />
              <Box sx={{ width: `${(inProgress / currentIssues.length) * 100}%`, bgcolor: '#1976d2' }} />
              <Box sx={{ width: `${(todo / currentIssues.length) * 100}%`, bgcolor: '#bdbdbd' }} />
            </Box>
          </Box>
        )}

        {/* Issue List */}
        <Collapse in={expanded}>
          <Box sx={{ mt: 1.5 }}>
            {currentIssues.length > 0 && currentIssues.map(issue => (
              <IssueRow key={issue.key} issue={issue} />
            ))}
            {pastIssues.length > 0 && (
              <>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, mb: 0.5, px: 1.5, fontStyle: 'italic' }}>
                  Previously worked on
                </Typography>
                {pastIssues.map(issue => (
                  <IssueRow key={`past-${issue.key}`} issue={issue} />
                ))}
              </>
            )}
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
}

// ─── Role Section ─────────────────────────────────────────────────────────────
const ROLE_SECTION_META = {
  DEV:      { label: 'Developers',       icon: '🛠' },
  QA:       { label: 'QA Engineers',     icon: '🧪' },
  PM:       { label: 'Product Managers', icon: '📋' },
  OTHER:    { label: 'Other',            icon: '👤' },
  UNTAGGED: { label: 'Untagged',         icon: '◻' },
};

function RoleSection({ roleKey, members, memberRoles, onRoleChange, onSummaryClick }) {
  const [open, setOpen] = useState(true);
  if (members.length === 0) return null;
  const cfg = roleKey === 'UNTAGGED' ? { label: 'Untagged', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' } : ROLE_CONFIG[roleKey];
  const meta = ROLE_SECTION_META[roleKey] || { label: roleKey, icon: '•' };
  const totalTickets = members.reduce((s, m) => s + m.issueCount, 0);
  const totalSP = members.reduce((s, m) => s + m.totalStoryPoints, 0);

  return (
    <Box sx={{ mb: 1 }}>
      <Box
        onClick={() => setOpen(o => !o)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1, mb: 1.5,
          cursor: 'pointer', userSelect: 'none',
          px: 1.5, py: 0.75, borderRadius: 2,
          bgcolor: `${cfg.color}0d`,
          border: `1px solid ${cfg.color}30`,
          '&:hover': { bgcolor: `${cfg.color}18` },
        }}
      >
        <Typography sx={{ fontSize: 15 }}>{meta.icon}</Typography>
        <Typography variant="subtitle2" fontWeight={700} sx={{ color: cfg.color, flex: 1 }}>
          {meta.label}
        </Typography>
        <Chip label={`${members.length}`} size="small"
          sx={{ fontSize: 11, height: 20, fontWeight: 700, bgcolor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40` }} />
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: 'nowrap' }}>
          {totalTickets} tickets{totalSP > 0 ? ` · ${totalSP} SP` : ''}
        </Typography>
        {open ? <ExpandLess sx={{ fontSize: 18, color: cfg.color }} /> : <ExpandMore sx={{ fontSize: 18, color: cfg.color }} />}
      </Box>
      <Collapse in={open}>
        {members.map(m => (
          <MemberCard key={m.name} member={m} role={memberRoles[m.name]} onRoleChange={onRoleChange} onSummaryClick={onSummaryClick} />
        ))}
      </Collapse>
    </Box>
  );
}

// ─── Member Summary Drawer ────────────────────────────────────────────────────
const WORKLOAD_STYLE = {
  light:    { bg: '#dcfce7', color: '#166534' },
  moderate: { bg: '#fef9c3', color: '#854d0e' },
  heavy:    { bg: '#fed7aa', color: '#9a3412' },
  critical: { bg: '#fee2e2', color: '#991b1b' },
};

function HeatCell({ day, maxVal }) {
  const theme = useTheme();
  const pct = maxVal > 0 ? day.total / maxVal : 0;
  const bg = pct === 0 ? theme.palette.action.selected
    : pct <= 0.33 ? '#c7d2fe'
    : pct <= 0.66 ? '#818cf8'
    : '#4338ca';
  const label = day.date.slice(5); // MM-DD
  const tooltip = `${day.date}: ${day.jira} JIRA${day.confluence ? `, ${day.confluence} Confluence` : ''}`;
  return (
    <Tooltip title={tooltip} arrow placement="top">
      <Box sx={{
        width: 24, height: 24, borderRadius: 1, bgcolor: bg,
        border: '1px solid rgba(0,0,0,0.07)', cursor: 'default', position: 'relative',
        transition: 'transform 0.1s', '&:hover': { transform: 'scale(1.4)', zIndex: 1 },
        // Tiny teal dot on bottom-right if there's confluence activity
        '&::after': day.confluence > 0 ? {
          content: '""', position: 'absolute', bottom: 2, right: 2,
          width: 5, height: 5, borderRadius: '50%', bgcolor: '#0d9488',
        } : {},
      }} />
    </Tooltip>
  );
}

function MemberSummaryDrawer({ open, memberName, memberAvatar, project, onClose }) {
  const theme = useTheme();
  const [loading, setLoading] = useState(false);
  const [data, setData]       = useState(null);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (!open || !memberName || !project) return;
    setLoading(true); setData(null); setError('');
    api.get('/jira/member-summary', { params: { project, member: memberName }, timeout: 65000 })
      .then(r => setData(r.data))
      .catch(e => setError(e?.response?.data?.error || e.message || 'Failed to load summary'))
      .finally(() => setLoading(false));
  }, [open, memberName, project]);

  const activityMax = useMemo(
    () => data ? Math.max(...data.activityByDay.map(d => d.total), 1) : 1,
    [data]
  );

  // Day-of-week labels aligned with the first day
  const weekLabels = data
    ? (() => {
        const first = new Date(data.activityByDay[0]?.date);
        const days = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
        return Array.from({ length: 7 }, (_, i) => days[(first.getDay() + i) % 7]);
      })()
    : [];

  const wl = data?.aiSummary?.workloadLevel;
  const wlStyle = WORKLOAD_STYLE[wl] || null;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: '100vw', sm: 500 }, display: 'flex', flexDirection: 'column' } }}
    >
      {/* ── Header ── */}
      <Box sx={{ flexShrink: 0, borderBottom: '1px solid', borderBottomColor: 'divider' }}>
        <Box sx={{ px: 2.5, pt: 2, pb: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <InsightsOutlined sx={{ fontSize: 20, color: '#6366f1' }} />
          <Typography variant="h6" fontWeight={700} sx={{ flex: 1 }}>
            Member Insights
          </Typography>
          <IconButton onClick={onClose} size="small"><Close /></IconButton>
        </Box>
        <Box sx={{ px: 2.5, pb: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Avatar src={memberAvatar} sx={{ width: 38, height: 38, bgcolor: '#5c6bc0' }}>{memberName?.[0]}</Avatar>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>{memberName}</Typography>
            <Typography variant="caption" color="text.secondary">{project} · Last 30 days</Typography>
          </Box>
        </Box>
      </Box>

      {/* ── Body ── */}
      <Box sx={{ flex: 1, overflow: 'auto', p: 2.5 }}>

        {loading && (
          <Box>
            <Skeleton variant="text" width="60%" sx={{ mb: 0.5 }} />
            <Skeleton variant="rounded" height={70} sx={{ mb: 3 }} />
            <Skeleton variant="text" width="40%" sx={{ mb: 0.5 }} />
            <Skeleton variant="rounded" height={110} sx={{ mb: 3 }} />
            <Skeleton variant="text" width="50%" sx={{ mb: 0.5 }} />
            <Skeleton variant="rounded" height={180} />
          </Box>
        )}

        {!loading && error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        {!loading && data && (
          <>
            {/* ── 30-Day Activity Heatmap ── */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.25 }}>
                📊 30-Day Activity
              </Typography>
              {/* Week-day header */}
              <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                {weekLabels.map((d, i) => (
                  <Typography key={i} variant="caption" color="text.disabled"
                    sx={{ width: 24, textAlign: 'center', fontSize: 9, flexShrink: 0 }}>
                    {d}
                  </Typography>
                ))}
              </Box>
              {/* Grid: 7 columns, rows of up to 7 days */}
              {Array.from({ length: Math.ceil(data.activityByDay.length / 7) }).map((_, row) => (
                <Box key={row} sx={{ display: 'flex', gap: 0.5, mb: 0.5 }}>
                  {data.activityByDay.slice(row * 7, row * 7 + 7).map(day => (
                    <HeatCell key={day.date} day={day} maxVal={activityMax} />
                  ))}
                </Box>
              ))}
              {/* Legend */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>Less</Typography>
                {[theme.palette.action.selected, '#c7d2fe', '#818cf8', '#4338ca'].map(c => (
                  <Box key={c} sx={{ width: 11, height: 11, borderRadius: 0.5, bgcolor: c, border: '1px solid rgba(0,0,0,0.1)' }} />
                ))}
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>More</Typography>
                <Box sx={{ width: 1, height: 14, bgcolor: 'divider', mx: 0.5 }} />
                <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: '#0d9488' }} />
                <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>Confluence</Typography>
              </Box>
            </Box>

            {/* ── AI Focus Summary ── */}
            {data.aiSummary ? (
              <Box sx={{ mb: 3, p: 2, borderRadius: 2.5, border: '1px solid rgba(124,58,237,0.25)', bgcolor: 'rgba(124,58,237,0.07)' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  <Typography variant="subtitle2" fontWeight={700}>🎯 Focus Summary</Typography>
                  {wlStyle && (
                    <Chip label={wl} size="small"
                      sx={{ fontSize: 10, height: 20, fontWeight: 700, bgcolor: wlStyle.bg, color: wlStyle.color }} />
                  )}
                </Box>
                {/* Focus area chips */}
                <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
                  {(data.aiSummary.focusAreas || []).map((area, i) => (
                    <Chip key={i} label={area} size="small"
                      sx={{ fontSize: 11, height: 22, bgcolor: 'rgba(124,58,237,0.12)', color: '#a78bfa' }} />
                  ))}
                </Box>
                {/* Narrative */}
                <Typography variant="body2" sx={{ color: 'text.secondary', lineHeight: 1.65, mb: 1.5 }}>
                  {data.aiSummary.summary}
                </Typography>
                {/* Highlights */}
                {(data.aiSummary.highlights || []).length > 0 && (
                  <Box sx={{ borderTop: '1px solid', borderTopColor: 'divider', pt: 1.25 }}>
                    {data.aiSummary.highlights.map((h, i) => (
                      <Box key={i} sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
                        <Typography variant="caption" sx={{ color: '#7c3aed', fontWeight: 700 }}>•</Typography>
                        <Typography variant="caption" sx={{ color: '#4b5563', lineHeight: 1.5 }}>{h}</Typography>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            ) : (
              <Alert severity="info" sx={{ mb: 3, fontSize: 12 }}>
                AI summary unavailable — check AI settings in Setup.
              </Alert>
            )}

            {/* ── JIRA Tickets ── */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.25 }}>
                📋 JIRA Tickets ({data.issues.length})
              </Typography>
              {data.issues.length === 0 ? (
                <Typography variant="body2" color="text.disabled">No tickets updated in last 30 days</Typography>
              ) : (
                data.issues.slice(0, 20).map(issue => (
                  <Box key={issue.key}
                    sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, borderBottom: '1px solid', borderBottomColor: 'divider' }}>
                    <Chip label={issue.key} size="small"
                      sx={{ fontFamily: 'monospace', fontSize: 10, height: 20, bgcolor: 'rgba(29,78,216,0.1)', color: '#60a5fa', flexShrink: 0 }} />
                    <Typography variant="caption"
                      sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {issue.summary}
                    </Typography>
                    <Chip label={issue.status} size="small" sx={{
                      fontSize: 10, height: 18, flexShrink: 0,
                      bgcolor: issue.statusCat === 'Done' ? 'rgba(22,101,52,0.15)' : issue.statusCat === 'In Progress' ? 'rgba(29,78,216,0.12)' : theme.palette.action.selected,
                      color:   issue.statusCat === 'Done' ? '#4ade80' : issue.statusCat === 'In Progress' ? '#60a5fa' : 'text.secondary',
                    }} />
                  </Box>
                ))
              )}
              {data.issues.length > 20 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
                  + {data.issues.length - 20} more tickets
                </Typography>
              )}
            </Box>

            {/* ── Confluence Pages ── */}
            <Box>
              <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.25 }}>
                📄 Confluence Pages ({data.confluencePages.length})
              </Typography>
              {data.confluencePages.length === 0 ? (
                <Typography variant="body2" color="text.disabled">No Confluence activity in last 30 days</Typography>
              ) : (
                data.confluencePages.slice(0, 15).map((page, i) => (
                  <Box key={page.id || i} sx={{ py: 0.75, borderBottom: '1px solid', borderBottomColor: 'divider' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <ArticleIcon sx={{ fontSize: 14, color: '#0d9488', flexShrink: 0 }} />
                      {page.url ? (
                        <Link href={page.url} target="_blank" rel="noopener noreferrer" variant="caption"
                          sx={{ fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {page.title}
                        </Link>
                      ) : (
                        <Typography variant="caption" fontWeight={500}
                          sx={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {page.title}
                        </Typography>
                      )}
                      {page.url && <OpenInNew sx={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }} />}
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ pl: 2.5 }}>
                      {page.spaceName}{page.spaceName && page.lastModified ? ' · ' : ''}{page.lastModified}
                    </Typography>
                    {page.excerpt && (
                      <Typography variant="caption" color="text.disabled"
                        sx={{ display: 'block', pl: 2.5, mt: 0.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {page.excerpt}
                      </Typography>
                    )}
                  </Box>
                ))
              )}
            </Box>
          </>
        )}
      </Box>
    </Drawer>
  );
}

const RECENT_KEY = 'one_jira_recent_projects';
const MAX_RECENT = 8;

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; }
}
function saveRecent(key) {
  const list = [key, ...loadRecent().filter(k => k !== key)].slice(0, MAX_RECENT);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch {}
  return list;
}
function removeRecent(key) {
  const list = loadRecent().filter(k => k !== key);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch {}
  return list;
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function TeamBoard() {
  const [project, setProject] = useState(() => localStorage.getItem('one_jira_team_project') || '');
  const [sprint, setSprint] = useState('active');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [jiraConfigured, setJiraConfigured] = useState(null);
  const [recentProjects, setRecentProjects] = useState(loadRecent);
  const [sprints, setSprints] = useState([]);
  const [sprintsLoading, setSprintsLoading] = useState(false);
  const [sprintsError, setSprintsError] = useState('');
  const [view, setView] = useState(() => localStorage.getItem('teamboard_view') || 'cards');

  // ── Team member roles (persisted in DB) ───────────────────────────────────
  const [memberRoles, setMemberRoles] = useState({}); // { [jiraName]: 'DEV'|'QA'|'PM'|'OTHER' }

  // Load roles whenever the project changes
  useEffect(() => {
    if (!project.trim()) return;
    api.get('/jira/team-roles', { params: { project } })
      .then(r => setMemberRoles(r.data))
      .catch(() => {});
  }, [project]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRoleChange = useCallback(async (name, role) => {
    const prev = memberRoles;
    const next = { ...memberRoles };
    if (role) next[name] = role; else delete next[name];
    setMemberRoles(next); // optimistic update
    try {
      await api.put('/jira/team-roles', { project, name, role: role || '' });
    } catch {
      setMemberRoles(prev); // revert on error
    }
  }, [memberRoles, project]);

  // ── Member summary drawer ─────────────────────────────────────────────────
  const [summaryTarget, setSummaryTarget] = useState(null); // { name, avatar } | null
  const handleSummaryClick = useCallback((name, avatar) => {
    setSummaryTarget({ name, avatar });
  }, []);

  // ── Filters ──────────────────────────────────────────────────────────────
  const [filterAssignees,  setFilterAssignees]  = useState([]);
  const [filterStatuses,   setFilterStatuses]   = useState([]);
  const [filterPriorities, setFilterPriorities] = useState([]);
  const [filterIssueTypes, setFilterIssueTypes] = useState([]);
  const [filterRole,       setFilterRole]       = useState('all'); // 'all' | 'current' | 'past'
  const [filterMinSP,      setFilterMinSP]      = useState('');
  const [filterTeamRole,   setFilterTeamRole]   = useState('all'); // 'all' | DEV | QA | PM | OTHER | UNTAGGED

  const hasActiveFilters = filterAssignees.length > 0 || filterStatuses.length > 0 ||
    filterPriorities.length > 0 || filterIssueTypes.length > 0 ||
    filterRole !== 'all' || filterMinSP !== '' || filterTeamRole !== 'all';

  const clearFilters = () => {
    setFilterAssignees([]); setFilterStatuses([]); setFilterPriorities([]);
    setFilterIssueTypes([]); setFilterRole('all'); setFilterMinSP('');
    setFilterTeamRole('all');
  };

  // Reset filters whenever a new fetch completes
  useEffect(() => { clearFilters(); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Unique options derived from current data
  const availableOptions = useMemo(() => {
    if (!data) return { statuses: [], priorities: [], issueTypes: [], assignees: [] };
    const allIssues = data.team.flatMap(m => m.issues);
    return {
      statuses:   [...new Set(allIssues.map(i => i.statusCategory).filter(Boolean))].sort(),
      priorities: ['Highest', 'High', 'Medium', 'Low', 'Lowest'].filter(p => allIssues.some(i => i.priority === p)),
      issueTypes: [...new Set(allIssues.map(i => i.issueType).filter(Boolean))].sort(),
      assignees:  data.team.map(m => ({ name: m.name, avatar: m.avatar })),
    };
  }, [data]);

  // Filtered team — issues matched by all active filters
  const filteredTeam = useMemo(() => {
    if (!data) return [];
    const minSP = parseFloat(filterMinSP);
    return data.team
      .filter(m => filterAssignees.length === 0 || filterAssignees.includes(m.name))
      .filter(m => {
        if (filterTeamRole === 'all') return true;
        const role = memberRoles[m.name];
        if (filterTeamRole === 'UNTAGGED') return !role;
        return role === filterTeamRole;
      })
      .map(m => {
        const issues = m.issues.filter(issue => {
          if (filterStatuses.length > 0   && !filterStatuses.includes(issue.statusCategory)) return false;
          if (filterPriorities.length > 0 && !filterPriorities.includes(issue.priority))     return false;
          if (filterIssueTypes.length > 0 && !filterIssueTypes.includes(issue.issueType))    return false;
          if (filterRole === 'current'    && issue.myRole !== 'current')                      return false;
          if (filterRole === 'past'       && issue.myRole !== 'past')                         return false;
          if (!isNaN(minSP) && minSP > 0  && (issue.storyPoints == null || issue.storyPoints < minSP)) return false;
          return true;
        });
        const totalStoryPoints = issues
          .filter(i => i.myRole === 'current')
          .reduce((s, i) => s + (i.storyPoints || 0), 0);
        return { ...m, issues, issueCount: issues.length, totalStoryPoints };
      })
      .filter(m => m.issues.length > 0);
  }, [data, filterAssignees, filterStatuses, filterPriorities, filterIssueTypes, filterRole, filterMinSP, filterTeamRole, memberRoles]);

  // Group filtered team by role for cards view
  const memberGroups = useMemo(() => {
    const groups = { DEV: [], QA: [], PM: [], OTHER: [], UNTAGGED: [] };
    filteredTeam.forEach(m => {
      const role = memberRoles[m.name];
      if (role && groups[role]) groups[role].push(m);
      else groups.UNTAGGED.push(m);
    });
    return groups;
  }, [filteredTeam, memberRoles]);

  // Check JIRA config on mount
  useEffect(() => {
    api.get('/jira/settings')
      .then(r => setJiraConfigured(r.data.apiTokenSet && r.data.baseUrl))
      .catch(() => setJiraConfigured(false));
  }, []);

  const fetchTeam = useCallback(async (overrideProject) => {
    const proj = (overrideProject || project).trim();
    if (!proj) return;
    setLoading(true);
    setError('');
    try {
      localStorage.setItem('one_jira_team_project', proj);
      setRecentProjects(saveRecent(proj));
      const sprintParam = sprint;
      const r = await api.get('/jira/team', { params: { project: proj, sprint: sprintParam } });
      setData(r.data);
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'Failed to fetch team data';
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [project, sprint]);

  const loadSprints = useCallback(async (proj) => {
    const p = (proj || project).trim();
    if (!p) return;
    setSprintsLoading(true);
    setSprintsError('');
    try {
      const r = await api.get('/jira/sprints', { params: { project: p } });
      setSprints(r.data.sprints || []);
      // Auto-select active sprint if present
      const active = (r.data.sprints || []).find(s => s.state === 'active');
      if (active) setSprint(active.name);
    } catch (e) {
      setSprintsError(e?.response?.data?.error || 'Could not load sprints');
      setSprints([]);
    } finally {
      setSprintsLoading(false);
    }
  }, [project]);

  // Auto-fetch if project is saved
  useEffect(() => {
    if (project.trim() && jiraConfigured) fetchTeam();
  }, [jiraConfigured]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-load sprints when project key changes (debounced)
  useEffect(() => {
    if (!project.trim() || !jiraConfigured) return;
    const t = setTimeout(() => loadSprints(project), 600);
    return () => clearTimeout(t);
  }, [project, jiraConfigured]); // eslint-disable-line react-hooks/exhaustive-deps

  if (jiraConfigured === null) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
        <Groups sx={{ color: '#5c6bc0', fontSize: 28 }} />
        <Typography variant="h5" fontWeight={700}>Team Board</Typography>
      </Box>

      {/* JIRA not configured warning */}
      {!jiraConfigured && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          JIRA is not configured. Go to <strong>Setup → JIRA</strong> to add your credentials.
        </Alert>
      )}

      {/* Controls */}
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2.5, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <TextField
            label="Project Key"
            placeholder="e.g. PROJ"
            size="small"
            value={project}
            onChange={e => { setProject(e.target.value.toUpperCase()); setSprints([]); }}
            sx={{ width: 160 }}
            disabled={!jiraConfigured}
            InputProps={sprintsLoading ? { endAdornment: <CircularProgress size={14} sx={{ mr: 0.5 }} /> } : {}}
          />
          <FormControl size="small" sx={{ width: 220 }}>
            <InputLabel>Sprint</InputLabel>
            <Select value={sprint} label="Sprint" onChange={e => setSprint(e.target.value)} disabled={!jiraConfigured}>
              <MenuItem value="active">Active Sprint (auto)</MenuItem>
              <MenuItem value="">All Open (Unresolved)</MenuItem>
              {sprints.length > 0 && <Divider />}
              {sprints.map(s => (
                <MenuItem key={s.id} value={s.name}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%' }}>
                    <Box
                      sx={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        bgcolor: s.state === 'active' ? '#2e7d32' : s.state === 'future' ? '#1976d2' : '#bdbdbd',
                      }}
                    />
                    <Typography variant="body2" sx={{ flex: 1 }}>{s.name}</Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                      {s.state}
                    </Typography>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            variant="contained"
            onClick={() => fetchTeam()}
            disabled={!project.trim() || loading || !jiraConfigured}
            startIcon={loading ? <CircularProgress size={16} color="inherit" /> : <Refresh />}
            sx={{ textTransform: 'none', borderRadius: 2 }}
          >
            {loading ? 'Loading…' : 'Fetch Team'}
          </Button>
        </Box>

        {/* Recent project chips */}
        {recentProjects.length > 0 && (
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 1.5, alignItems: 'center' }}>
            <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>Recent:</Typography>
            {recentProjects.map(key => (
              <Chip
                key={key}
                label={key}
                size="small"
                onClick={() => { setProject(key); fetchTeam(key); }}
                onDelete={() => setRecentProjects(removeRecent(key))}
                deleteIcon={<Close sx={{ fontSize: '12px !important' }} />}
                variant={project === key ? 'filled' : 'outlined'}
                color={project === key ? 'primary' : 'default'}
                sx={{ fontSize: 11, height: 22, fontFamily: 'monospace', cursor: 'pointer' }}
              />
            ))}
          </Box>
        )}

        {sprintsError && (
          <Alert severity="warning" sx={{ mt: 1.5, py: 0.5, fontSize: 12 }}>{sprintsError}</Alert>
        )}

        {data && (
          <Box sx={{ mt: 1.5 }}>
            {data.sprintFallback && (
              <Alert severity="info" sx={{ mb: 1, py: 0.5, fontSize: 12 }}>
                This project doesn't use sprints — showing all open (unresolved) tickets instead.
              </Alert>
            )}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              Showing {data.returned} of {data.total} issues • JQL: <code>{data.jql}</code>
              {data.spFieldUsed
                ? <> • SP field: <code>{data.spFieldUsed}</code></>
                : <> • <span style={{ color: '#e65100' }}>Story points not found — no known SP custom field had a value</span></>
              }
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Error */}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      {/* Loading state */}
      {loading && <LinearProgress sx={{ mb: 2, borderRadius: 1 }} />}

      {/* Summary Strip + View Toggle */}
      {data && !loading && (
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, mb: 3, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', gap: 2, flex: 1, flexWrap: 'wrap' }}>
            <StatCard label="Team Members" value={filteredTeam.filter(m => m.name !== 'Unassigned').length} color="#5c6bc0" />
            <StatCard label="Total Tickets" value={filteredTeam.reduce((s, m) => s + m.issueCount, 0)} color="#1976d2" />
            <StatCard
              label="Total Story Points"
              value={filteredTeam.reduce((s, m) => s + m.totalStoryPoints, 0)}
              color="#2e7d32"
            />
            <StatCard
              label="Unassigned"
              value={filteredTeam.find(m => m.name === 'Unassigned')?.issueCount || 0}
              color="#e65100"
            />
          </Box>
          <ToggleButtonGroup
            value={view}
            exclusive
            size="small"
            onChange={(_, v) => { if (v) { setView(v); try { localStorage.setItem('teamboard_view', v); } catch {} } }}
            sx={{ alignSelf: 'center', flexShrink: 0 }}
          >
            <ToggleButton value="table"><Tooltip title="Allocation table"><TableRows fontSize="small" /></Tooltip></ToggleButton>
            <ToggleButton value="cards"><Tooltip title="Detailed cards"><ViewAgenda fontSize="small" /></Tooltip></ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      {/* Filter Bar */}
      {data && !loading && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 2, mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            {/* Label + active count */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mr: 0.5, flexShrink: 0 }}>
              <FilterList sx={{ fontSize: 18, color: '#5c6bc0' }} />
              <Typography variant="body2" fontWeight={600} color="#5c6bc0">Filters</Typography>
              {hasActiveFilters && (
                <Chip
                  label={filterAssignees.length + filterStatuses.length + filterPriorities.length +
                    filterIssueTypes.length + (filterRole !== 'all' ? 1 : 0) + (filterMinSP ? 1 : 0)}
                  size="small" color="primary" sx={{ height: 18, fontSize: 10 }}
                />
              )}
            </Box>

            {/* Assignee */}
            <FormControl size="small" sx={{ minWidth: 155 }}>
              <InputLabel>Assignee</InputLabel>
              <Select multiple value={filterAssignees} label="Assignee"
                onChange={e => setFilterAssignees(e.target.value)}
                renderValue={sel => `${sel.length} selected`}
              >
                {availableOptions.assignees.map(a => (
                  <MenuItem key={a.name} value={a.name}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar src={a.avatar} sx={{ width: 20, height: 20, fontSize: 10, bgcolor: a.name === 'Unassigned' ? '#bdbdbd' : '#5c6bc0' }}>
                        {a.name[0]}
                      </Avatar>
                      <Typography variant="body2">{a.name}</Typography>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Status */}
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel>Status</InputLabel>
              <Select multiple value={filterStatuses} label="Status"
                onChange={e => setFilterStatuses(e.target.value)}
                renderValue={sel => sel.join(', ')}
              >
                {availableOptions.statuses.map(s => (
                  <MenuItem key={s} value={s}>{s}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Priority */}
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>Priority</InputLabel>
              <Select multiple value={filterPriorities} label="Priority"
                onChange={e => setFilterPriorities(e.target.value)}
                renderValue={sel => sel.join(', ')}
              >
                {availableOptions.priorities.map(p => (
                  <MenuItem key={p} value={p}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box sx={{ color: PRIORITY_CONFIG[p]?.color, display: 'flex', alignItems: 'center' }}>
                        {PRIORITY_CONFIG[p]?.icon}
                      </Box>
                      {p}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Issue Type */}
            <FormControl size="small" sx={{ minWidth: 130 }}>
              <InputLabel>Issue Type</InputLabel>
              <Select multiple value={filterIssueTypes} label="Issue Type"
                onChange={e => setFilterIssueTypes(e.target.value)}
                renderValue={sel => sel.join(', ')}
              >
                {availableOptions.issueTypes.map(t => (
                  <MenuItem key={t} value={t}>{t}</MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Min Story Points */}
            <TextField
              label="Min Story Pts"
              type="number"
              size="small"
              value={filterMinSP}
              onChange={e => setFilterMinSP(e.target.value)}
              sx={{ width: 115 }}
              inputProps={{ min: 0, step: 1 }}
            />

            {/* Role (current/past) */}
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Role</InputLabel>
              <Select value={filterRole} label="Role" onChange={e => setFilterRole(e.target.value)}>
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="current">Assigned</MenuItem>
                <MenuItem value="past">Past only</MenuItem>
              </Select>
            </FormControl>

            {/* Team Role */}
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Team Role</InputLabel>
              <Select value={filterTeamRole} label="Team Role" onChange={e => setFilterTeamRole(e.target.value)}>
                <MenuItem value="all">All</MenuItem>
                {ROLE_ORDER.map(r => (
                  <MenuItem key={r} value={r}>
                    <Chip label={ROLE_CONFIG[r].label} size="small"
                      sx={{ fontSize: 11, height: 20, bgcolor: ROLE_CONFIG[r].bg, color: ROLE_CONFIG[r].color, pointerEvents: 'none' }} />
                  </MenuItem>
                ))}
                <MenuItem value="UNTAGGED"><Typography variant="body2" color="text.secondary">Untagged</Typography></MenuItem>
              </Select>
            </FormControl>

            {/* Clear */}
            {hasActiveFilters && (
              <Button size="small" variant="outlined" onClick={clearFilters}
                sx={{ textTransform: 'none', borderRadius: 2, ml: 'auto', flexShrink: 0 }}
              >
                Clear filters
              </Button>
            )}
          </Box>

          {/* Active filter chips */}
          {hasActiveFilters && (
            <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 1.25 }}>
              {filterAssignees.map(a => (
                <Chip key={a} label={a} size="small" onDelete={() => setFilterAssignees(prev => prev.filter(x => x !== a))}
                  sx={{ fontSize: 11, height: 22 }} />
              ))}
              {filterStatuses.map(s => (
                <Chip key={s} label={s} size="small" onDelete={() => setFilterStatuses(prev => prev.filter(x => x !== s))}
                  sx={{ fontSize: 11, height: 22, bgcolor: '#1976d218', color: '#1976d2' }} />
              ))}
              {filterPriorities.map(p => (
                <Chip key={p} label={p} size="small" onDelete={() => setFilterPriorities(prev => prev.filter(x => x !== p))}
                  sx={{ fontSize: 11, height: 22, bgcolor: `${PRIORITY_CONFIG[p]?.color}18`, color: PRIORITY_CONFIG[p]?.color }} />
              ))}
              {filterIssueTypes.map(t => (
                <Chip key={t} label={t} size="small" onDelete={() => setFilterIssueTypes(prev => prev.filter(x => x !== t))}
                  sx={{ fontSize: 11, height: 22 }} />
              ))}
              {filterRole !== 'all' && (
                <Chip label={filterRole === 'current' ? 'Assigned only' : 'Past only'} size="small"
                  onDelete={() => setFilterRole('all')} sx={{ fontSize: 11, height: 22, bgcolor: 'rgba(123,31,162,0.12)', color: '#9c27b0' }} />
              )}
              {filterTeamRole !== 'all' && (
                <Chip
                  label={filterTeamRole === 'UNTAGGED' ? 'Untagged' : ROLE_CONFIG[filterTeamRole]?.label}
                  size="small"
                  onDelete={() => setFilterTeamRole('all')}
                  sx={{
                    fontSize: 11, height: 22,
                    bgcolor: filterTeamRole === 'UNTAGGED' ? 'rgba(148,163,184,0.12)' : ROLE_CONFIG[filterTeamRole]?.bg,
                    color:   filterTeamRole === 'UNTAGGED' ? '#64748b' : ROLE_CONFIG[filterTeamRole]?.color,
                  }}
                />
              )}
              {filterMinSP && (
                <Chip label={`≥ ${filterMinSP} SP`} size="small" onDelete={() => setFilterMinSP('')}
                  sx={{ fontSize: 11, height: 22, bgcolor: '#e8f5e918', color: '#2e7d32' }} />
              )}
            </Box>
          )}
        </Paper>
      )}

      {/* Allocation Table */}
      {data && !loading && view === 'table' && (
        <AllocationTable team={filteredTeam} memberRoles={memberRoles} onRoleChange={handleRoleChange} onSummaryClick={INSIGHTS_ENABLED ? handleSummaryClick : undefined} />
      )}

      {/* Team Member Cards — grouped by role */}
      {data && !loading && view === 'cards' && (
        <Box>
          {[...ROLE_ORDER, 'UNTAGGED'].map(roleKey => (
            <RoleSection
              key={roleKey}
              roleKey={roleKey}
              members={memberGroups[roleKey] || []}
              memberRoles={memberRoles}
              onRoleChange={handleRoleChange}
              onSummaryClick={INSIGHTS_ENABLED ? handleSummaryClick : undefined}
            />
          ))}
        </Box>
      )}

      {/* Empty state */}
      {data && !loading && filteredTeam.length === 0 && (
        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 5, textAlign: 'center' }}>
          <Typography color="text.secondary">No issues found for this project/sprint.</Typography>
        </Paper>
      )}

      {/* Member Summary Drawer */}
      {INSIGHTS_ENABLED && (
        <MemberSummaryDrawer
          open={!!summaryTarget}
          memberName={summaryTarget?.name}
          memberAvatar={summaryTarget?.avatar}
          project={project}
          onClose={() => setSummaryTarget(null)}
        />
      )}
    </Box>
  );
}

// ─── Allocation Table ─────────────────────────────────────────────────────────
const PRIORITY_ORDER = { Highest: 0, High: 1, Medium: 2, Low: 3, Lowest: 4 };

function AllocationTable({ team, memberRoles = {}, onRoleChange, onSummaryClick }) {
  // Group rows by role for section headers
  const grouped = useMemo(() => {
    const buckets = Object.fromEntries([...ROLE_ORDER, 'UNTAGGED'].map(r => [r, []]));
    team.forEach(member => {
      const r = memberRoles[member.name];
      buckets[r && buckets[r] ? r : 'UNTAGGED'].push(member);
    });
    return [...ROLE_ORDER, 'UNTAGGED'].filter(r => buckets[r].length > 0).map(r => ({ roleKey: r, members: buckets[r] }));
  }, [team, memberRoles]);

  const rows = team.map(member => {
    const current = member.issues.filter(i => i.myRole === 'current');
    const past    = member.issues.filter(i => i.myRole === 'past');

    const byPriority = (issues) => ({
      highest: issues.filter(i => i.priority === 'Highest').length,
      high:    issues.filter(i => i.priority === 'High').length,
      medium:  issues.filter(i => i.priority === 'Medium').length,
      low:     issues.filter(i => ['Low', 'Lowest'].includes(i.priority)).length,
    });

    const byStatus = (issues) => ({
      todo:       issues.filter(i => i.statusCategory !== 'In Progress' && i.statusCategory !== 'Done').length,
      inProgress: issues.filter(i => i.statusCategory === 'In Progress').length,
      done:       issues.filter(i => i.statusCategory === 'Done').length,
    });

    return {
      name:         member.name,
      avatar:       member.avatar,
      current:      current.length,
      past:         past.length,
      storyPoints:  member.totalStoryPoints,
      priority:     byPriority(current),
      status:       byStatus(current),
    };
  });

  const PriorityDot = ({ color, count }) => count > 0 ? (
    <Chip label={count} size="small" sx={{ height: 20, fontSize: 11, bgcolor: `${color}18`, color, border: `1px solid ${color}40`, mr: 0.4 }} />
  ) : <Typography variant="caption" color="text.disabled">—</Typography>;

  return (
    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, mb: 3 }}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: 'background.default' }}>
            <TableCell sx={{ fontWeight: 700, py: 1.5 }}>Team Member</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Role</TableCell>
            <TableCell align="center" sx={{ fontWeight: 700 }}>Assigned</TableCell>
            <TableCell align="center" sx={{ fontWeight: 700 }}>Previously</TableCell>
            <TableCell align="center" sx={{ fontWeight: 700 }}>Story Pts</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Priority Breakdown</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Status Breakdown</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {grouped.map(({ roleKey, members }) => {
            const cfg  = roleKey === 'UNTAGGED' ? { label: 'Untagged', color: '#94a3b8', bg: 'rgba(148,163,184,0.12)' } : ROLE_CONFIG[roleKey];
            const meta = ROLE_SECTION_META[roleKey] || { icon: '•', label: roleKey };
            const groupRows = rows.filter(r => members.some(m => m.name === r.name));
            return [
              <TableRow key={`hdr-${roleKey}`}>
                <TableCell colSpan={7} sx={{ py: 0.75, px: 2, bgcolor: `${cfg.color}0d`, borderBottom: `2px solid ${cfg.color}30` }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography sx={{ fontSize: 13 }}>{meta.icon}</Typography>
                    <Typography variant="caption" fontWeight={700} sx={{ color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {meta.label}
                    </Typography>
                    <Chip label={members.length} size="small"
                      sx={{ fontSize: 10, height: 18, fontWeight: 700, bgcolor: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}40` }} />
                  </Box>
                </TableCell>
              </TableRow>,
              ...groupRows.map(row => (
            <TableRow key={row.name} hover sx={{ '&:last-child td': { border: 0 } }}>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Avatar src={row.avatar} sx={{ width: 28, height: 28, fontSize: 12, bgcolor: row.name === 'Unassigned' ? '#bdbdbd' : '#5c6bc0' }}>
                    {row.name[0]}
                  </Avatar>
                  <Typography variant="body2" fontWeight={500}>{row.name}</Typography>
                  {onSummaryClick && row.name !== 'Unassigned' && (
                    <Tooltip title="Member Insights" arrow>
                      <IconButton size="small" onClick={() => onSummaryClick(row.name, row.avatar)}
                        sx={{ p: 0.25, color: '#6366f1', '&:hover': { bgcolor: 'rgba(99,102,241,0.12)' }, ml: 'auto' }}>
                        <InsightsOutlined sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                  )}
                </Box>
              </TableCell>
              <TableCell>
                {row.name !== 'Unassigned' && onRoleChange ? (
                  <FormControl size="small" variant="outlined" sx={{ minWidth: 82 }}>
                    <Select
                      value={memberRoles[row.name] || ''}
                      onChange={e => onRoleChange(row.name, e.target.value || null)}
                      displayEmpty
                      sx={{
                        fontSize: 11, height: 24,
                        '& .MuiSelect-select': { py: 0.3, px: 1 },
                        ...(memberRoles[row.name] ? {
                          bgcolor: ROLE_CONFIG[memberRoles[row.name]]?.bg,
                          color:   ROLE_CONFIG[memberRoles[row.name]]?.color,
                          '& fieldset': { borderColor: `${ROLE_CONFIG[memberRoles[row.name]]?.color}60` },
                        } : {}),
                      }}
                      renderValue={v => v
                        ? <Typography variant="caption" fontWeight={600} sx={{ color: ROLE_CONFIG[v]?.color }}>{ROLE_CONFIG[v]?.label}</Typography>
                        : <Typography variant="caption" color="text.disabled">Tag</Typography>
                      }
                    >
                      {memberRoles[row.name] && <MenuItem value=""><Typography variant="caption" color="text.secondary">— Remove —</Typography></MenuItem>}
                      {ROLE_ORDER.map(r => (
                        <MenuItem key={r} value={r}>
                          <Chip label={ROLE_CONFIG[r].label} size="small"
                            sx={{ fontSize: 11, height: 20, bgcolor: ROLE_CONFIG[r].bg, color: ROLE_CONFIG[r].color,
                                  border: `1px solid ${ROLE_CONFIG[r].color}40`, pointerEvents: 'none' }} />
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                ) : <Typography variant="caption" color="text.disabled">—</Typography>}
              </TableCell>
              <TableCell align="center">
                <Typography variant="body2" fontWeight={700} color={row.current > 0 ? '#1976d2' : 'text.secondary'}>
                  {row.current}
                </Typography>
              </TableCell>
              <TableCell align="center">
                {row.past > 0
                  ? <Typography variant="body2" sx={{ color: '#7b1fa2' }}>{row.past}</Typography>
                  : <Typography variant="body2" color="text.disabled">—</Typography>
                }
              </TableCell>
              <TableCell align="center">
                <Typography variant="body2" fontWeight={row.storyPoints > 0 ? 600 : 400} color={row.storyPoints > 0 ? '#2e7d32' : 'text.disabled'}>
                  {row.storyPoints > 0 ? row.storyPoints : '—'}
                </Typography>
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                  <PriorityDot color="#d32f2f" count={row.priority.highest} />
                  <PriorityDot color="#e65100" count={row.priority.high} />
                  <PriorityDot color="#ed6c02" count={row.priority.medium} />
                  <PriorityDot color="#2e7d32" count={row.priority.low} />
                </Box>
              </TableCell>
              <TableCell>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {row.status.inProgress > 0 && (
                    <Chip label={`${row.status.inProgress} In Progress`} size="small" sx={{ fontSize: 10, height: 20, bgcolor: '#1976d218', color: '#1976d2' }} />
                  )}
                  {row.status.todo > 0 && (
                    <Chip label={`${row.status.todo} To Do`} size="small" sx={{ fontSize: 10, height: 20, bgcolor: '#90a4ae20', color: '#546e7a' }} />
                  )}
                  {row.status.done > 0 && (
                    <Chip label={`${row.status.done} Done`} size="small" sx={{ fontSize: 10, height: 20, bgcolor: '#2e7d3218', color: '#2e7d32' }} />
                  )}
                </Box>
              </TableCell>
            </TableRow>
              ))
            ];
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

// ─── Stat Card ───────────────────────────────────────────────────────────────
function StatCard({ label, value, color }) {
  return (
    <Paper
      elevation={0}
      sx={{
        border: '1px solid', borderColor: 'divider', borderRadius: 2.5, px: 2.5, py: 1.5,
        flex: '1 1 140px', minWidth: 120,
      }}
    >
      <Typography variant="h5" fontWeight={700} sx={{ color }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Paper>
  );
}
