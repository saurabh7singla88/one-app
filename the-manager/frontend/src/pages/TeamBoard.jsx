import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box, Typography, TextField, Button, Paper, Avatar, Chip,
  CircularProgress, Alert, Collapse, IconButton, Tooltip,
  LinearProgress, Divider, Link, Select, MenuItem, FormControl,
  InputLabel, Card, CardContent, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import {
  Groups, ExpandMore, ExpandLess, OpenInNew, Refresh,
  BugReport, Task as TaskIcon, BookmarkBorder, ArrowUpward,
  ArrowDownward, Remove, Circle, Close,
  TableRows, ViewAgenda, FilterList,
} from '@mui/icons-material';
import api from '../api/axios';

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
  const priorityCfg = PRIORITY_CONFIG[issue.priority] || { color: '#757575', icon: <Circle sx={{ fontSize: 8 }} /> };
  const statusColor = getStatusColor(issue.statusCategory);
  const isPast = issue.myRole === 'past';

  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5, py: 1, px: 1.5,
        borderRadius: 1.5,
        '&:hover': { bgcolor: 'rgba(0,0,0,0.02)' },
        borderBottom: '1px solid #f0f0f0',
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
            sx={{ fontSize: 10, height: 18, bgcolor: '#f3e5f5', color: '#7b1fa2', border: '1px solid #ce93d8', cursor: 'default' }}
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
function MemberCard({ member }) {
  const [expanded, setExpanded] = useState(true);

  const currentIssues = member.issues.filter(i => i.myRole === 'current');
  const pastIssues    = member.issues.filter(i => i.myRole === 'past');

  const inProgress = currentIssues.filter(i => i.statusCategory === 'In Progress').length;
  const done       = currentIssues.filter(i => i.statusCategory === 'Done').length;
  const todo       = currentIssues.filter(i => i.statusCategory !== 'In Progress' && i.statusCategory !== 'Done').length;

  return (
    <Card elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 3, mb: 2 }}>
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
        </Box>

        {/* Progress Bar — based on current assignments only */}
        {currentIssues.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <Box sx={{ display: 'flex', height: 4, borderRadius: 2, overflow: 'hidden', bgcolor: '#f5f5f5' }}>
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
  const [view, setView] = useState('table'); // 'table' | 'cards'

  // ── Filters ──────────────────────────────────────────────────────────────
  const [filterAssignees,  setFilterAssignees]  = useState([]);
  const [filterStatuses,   setFilterStatuses]   = useState([]);
  const [filterPriorities, setFilterPriorities] = useState([]);
  const [filterIssueTypes, setFilterIssueTypes] = useState([]);
  const [filterRole,       setFilterRole]       = useState('all'); // 'all' | 'current' | 'past'
  const [filterMinSP,      setFilterMinSP]      = useState('');

  const hasActiveFilters = filterAssignees.length > 0 || filterStatuses.length > 0 ||
    filterPriorities.length > 0 || filterIssueTypes.length > 0 ||
    filterRole !== 'all' || filterMinSP !== '';

  const clearFilters = () => {
    setFilterAssignees([]); setFilterStatuses([]); setFilterPriorities([]);
    setFilterIssueTypes([]); setFilterRole('all'); setFilterMinSP('');
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
  }, [data, filterAssignees, filterStatuses, filterPriorities, filterIssueTypes, filterRole, filterMinSP]);

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
      <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 3, p: 2.5, mb: 3 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <TextField
            label="Project Key"
            placeholder="e.g. PROJ"
            size="small"
            value={project}
            onChange={e => { setProject(e.target.value.toUpperCase()); setSprints([]); }}
            sx={{ width: 160 }}
            disabled={!jiraConfigured}
          />
          <Button
            variant="outlined"
            size="small"
            onClick={() => loadSprints()}
            disabled={!project.trim() || sprintsLoading || !jiraConfigured}
            startIcon={sprintsLoading ? <CircularProgress size={14} color="inherit" /> : null}
            sx={{ textTransform: 'none', borderRadius: 2, height: 40, whiteSpace: 'nowrap' }}
          >
            {sprintsLoading ? 'Loading…' : 'Load Sprints'}
          </Button>
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
            onChange={(_, v) => { if (v) setView(v); }}
            sx={{ alignSelf: 'center', flexShrink: 0 }}
          >
            <ToggleButton value="table"><Tooltip title="Allocation table"><TableRows fontSize="small" /></Tooltip></ToggleButton>
            <ToggleButton value="cards"><Tooltip title="Detailed cards"><ViewAgenda fontSize="small" /></Tooltip></ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}

      {/* Filter Bar */}
      {data && !loading && (
        <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 3, p: 2, mb: 3 }}>
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

            {/* Role */}
            <FormControl size="small" sx={{ minWidth: 120 }}>
              <InputLabel>Role</InputLabel>
              <Select value={filterRole} label="Role" onChange={e => setFilterRole(e.target.value)}>
                <MenuItem value="all">All</MenuItem>
                <MenuItem value="current">Assigned</MenuItem>
                <MenuItem value="past">Past only</MenuItem>
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
                  onDelete={() => setFilterRole('all')} sx={{ fontSize: 11, height: 22, bgcolor: '#f3e5f5', color: '#7b1fa2' }} />
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
        <AllocationTable team={filteredTeam} />
      )}

      {/* Team Member Cards */}
      {data && !loading && view === 'cards' && filteredTeam.map(member => (
        <MemberCard key={member.name} member={member} />
      ))}

      {/* Empty state */}
      {data && !loading && filteredTeam.length === 0 && (
        <Paper elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 3, p: 5, textAlign: 'center' }}>
          <Typography color="text.secondary">No issues found for this project/sprint.</Typography>
        </Paper>
      )}
    </Box>
  );
}

// ─── Allocation Table ─────────────────────────────────────────────────────────
const PRIORITY_ORDER = { Highest: 0, High: 1, Medium: 2, Low: 3, Lowest: 4 };

function AllocationTable({ team }) {
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
    <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 3, mb: 3 }}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ bgcolor: '#f8fafc' }}>
            <TableCell sx={{ fontWeight: 700, py: 1.5 }}>Team Member</TableCell>
            <TableCell align="center" sx={{ fontWeight: 700 }}>Assigned</TableCell>
            <TableCell align="center" sx={{ fontWeight: 700 }}>Previously</TableCell>
            <TableCell align="center" sx={{ fontWeight: 700 }}>Story Pts</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Priority Breakdown</TableCell>
            <TableCell sx={{ fontWeight: 700 }}>Status Breakdown</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map(row => (
            <TableRow key={row.name} hover sx={{ '&:last-child td': { border: 0 } }}>
              <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Avatar src={row.avatar} sx={{ width: 28, height: 28, fontSize: 12, bgcolor: row.name === 'Unassigned' ? '#bdbdbd' : '#5c6bc0' }}>
                    {row.name[0]}
                  </Avatar>
                  <Typography variant="body2" fontWeight={500}>{row.name}</Typography>
                </Box>
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
          ))}
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
        border: '1px solid #e2e8f0', borderRadius: 2.5, px: 2.5, py: 1.5,
        flex: '1 1 140px', minWidth: 120,
      }}
    >
      <Typography variant="h5" fontWeight={700} sx={{ color }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
    </Paper>
  );
}
