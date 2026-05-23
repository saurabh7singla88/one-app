import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Typography, Grid, Box, Button, Chip, LinearProgress, Divider, Tooltip, Avatar,
} from '@mui/material';
import {
  Add, CheckCircleOutline, AccessTime, Block, TrendingUp,
  ChevronRight, AccountTree, TaskAlt, Warning, CalendarToday, Groups,
} from '@mui/icons-material';
import { fetchAllInitiatives, fetchTasks } from '../features/initiatives/initiativesSlice';
import { fetchCanvases } from '../features/canvas/canvasSlice';
import { useNavigate } from 'react-router-dom';
import AIPriorityStrip from '../components/AIPriorityStrip';

function SparkBars({ data, height = 52 }) {
  const max = Math.max(...data.map(d => d.count), 1);
  const barW = 22;
  const gap = 6;
  const totalW = data.length * (barW + gap) - gap;
  return (
    <svg width={totalW} height={height + 18} style={{ display: 'block', overflow: 'visible' }}>
      {data.map((d, i) => {
        const barH = d.count > 0 ? Math.max((d.count / max) * height, 6) : 3;
        const isLast = i === data.length - 1;
        return (
          <g key={i}>
            <Tooltip title={`${d.label}: ${d.count} completed`}>
              <rect
                x={i * (barW + gap)} y={height - barH}
                width={barW} height={barH} rx={3}
                fill={isLast ? '#10b981' : '#d1fae5'}
                style={{ cursor: 'default' }}
              />
            </Tooltip>
            {d.count > 0 && (
              <text
                x={i * (barW + gap) + barW / 2} y={height - barH - 5}
                textAnchor="middle" fontSize={10} fill="#64748b" fontFamily="inherit"
              >{d.count}</text>
            )}
            <text
              x={i * (barW + gap) + barW / 2} y={height + 15}
              textAnchor="middle" fontSize={9} fill="#94a3b8" fontFamily="inherit"
            >{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

const STATUS_CONFIG = {
  OPEN:        { label: 'Open',        color: '#64748b', bg: '#f1f5f9' },
  IN_PROGRESS: { label: 'In Progress', color: '#2563eb', bg: '#eff6ff' },
  BLOCKED:     { label: 'Blocked',     color: '#dc2626', bg: '#fef2f2' },
  ON_HOLD:     { label: 'On Hold',     color: '#d97706', bg: '#fffbeb' },
  COMPLETED:   { label: 'Completed',   color: '#059669', bg: '#f0fdf4' },
  CANCELLED:   { label: 'Cancelled',   color: '#6b7280', bg: '#f9fafb' },
};
const PRIORITY_CONFIG = {
  CRITICAL: { color: '#dc2626', bg: '#fef2f2' },
  HIGH:     { color: '#d97706', bg: '#fffbeb' },
  MEDIUM:   { color: '#2563eb', bg: '#eff6ff' },
  LOW:      { color: '#64748b', bg: '#f1f5f9' },
};

export default function Dashboard() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { allItems, tasks } = useSelector((state) => state.initiatives);
  const { canvases } = useSelector((state) => state.canvas);

  useEffect(() => {
    dispatch(fetchAllInitiatives());
    dispatch(fetchTasks());
    dispatch(fetchCanvases());
  }, [dispatch]);

  // Root vs sub-items — explicitly exclude standalone tasks (parentId=null but isStandaloneTask=true)
  const rootItems = allItems.filter(i => !i.parentId && !i.isStandaloneTask);
  const subItems  = allItems.filter(i =>  i.parentId);

  // Date helpers
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const fourteenDaysAgo = new Date(today);
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

  const activeRoots = rootItems.filter(i => i.status !== 'COMPLETED' && i.status !== 'CANCELLED');
  const overdueItems = activeRoots.filter(i => i.dueDate && new Date(i.dueDate) < today);
  const dueSoonItems = activeRoots
    .filter(i => i.dueDate && new Date(i.dueDate) >= today && new Date(i.dueDate) <= weekEnd)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const noDueDateCount = activeRoots.filter(i => !i.dueDate).length;
  const staleCount = activeRoots.filter(i =>
    new Date(i.updatedAt || i.createdAt) < fourteenDaysAgo
  ).length;

  const rootStats = {
    total:      rootItems.length,
    inProgress: rootItems.filter(i => i.status === 'IN_PROGRESS').length,
    blocked:    rootItems.filter(i => i.status === 'BLOCKED').length,
    completed:  rootItems.filter(i => i.status === 'COMPLETED').length,
    overdue:    overdueItems.length,
  };

  const subStats = {
    total:      subItems.length,
    inProgress: subItems.filter(i => i.status === 'IN_PROGRESS').length,
    blocked:    subItems.filter(i => i.status === 'BLOCKED').length,
    completed:  subItems.filter(i => i.status === 'COMPLETED').length,
  };

  const standaloneTaskStats = {
    total:     tasks.length,
    open:      tasks.filter(t => t.status !== 'COMPLETED' && t.status !== 'CANCELLED').length,
    completed: tasks.filter(t => t.status === 'COMPLETED').length,
  };

  const completionRate = rootStats.total > 0
    ? Math.round((rootStats.completed / rootStats.total) * 100)
    : 0;

  // Completion trend — last 6 weeks
  const completionTrend = Array.from({ length: 6 }, (_, wi) => {
    const w = 5 - wi;
    const wEnd = new Date(today);
    wEnd.setDate(wEnd.getDate() - w * 7);
    const wStart = new Date(wEnd);
    wStart.setDate(wStart.getDate() - 6);
    const count = rootItems.filter(i => {
      const d = i.completedAt ? new Date(i.completedAt) : null;
      return d && d >= wStart && d <= wEnd;
    }).length;
    return {
      label: wEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      count,
    };
  });

  // Canvas breakdown
  const canvasBreakdown = (() => {
    const map = {};
    rootItems.forEach(i => {
      const key = i.canvasId || '__none__';
      if (!map[key]) map[key] = { total: 0, completed: 0, blocked: 0 };
      map[key].total++;
      if (i.status === 'COMPLETED') map[key].completed++;
      if (i.status === 'BLOCKED')   map[key].blocked++;
    });
    return Object.entries(map)
      .map(([cId, stats]) => ({
        name: canvases.find(c => c.id === cId)?.name || 'Uncategorised',
        ...stats,
      }))
      .sort((a, b) => b.total - a.total);
  })();

  // Assignee workload
  const assigneeWorkload = (() => {
    const map = {};
    rootItems.forEach(i => {
      (i.assignees || []).forEach(a => {
        if (!map[a.id]) map[a.id] = { name: a.name || a.email, open: 0, blocked: 0, total: 0 };
        map[a.id].total++;
        if (i.status === 'BLOCKED') map[a.id].blocked++;
        if (i.status !== 'COMPLETED' && i.status !== 'CANCELLED') map[a.id].open++;
      });
    });
    return Object.values(map).sort((a, b) => b.open - a.open).slice(0, 8);
  })();

  const topLevelStatCards = [
    { label: 'Initiatives', value: rootStats.total,      icon: <TrendingUp />,        gradient: 'linear-gradient(135deg, #6366f1, #818cf8)', nav: '/initiatives' },
    { label: 'In Progress', value: rootStats.inProgress, icon: <AccessTime />,         gradient: 'linear-gradient(135deg, #3b82f6, #60a5fa)', nav: '/initiatives?status=IN_PROGRESS' },
    { label: 'Blocked',     value: rootStats.blocked,    icon: <Block />,              gradient: 'linear-gradient(135deg, #ef4444, #f87171)', nav: '/initiatives?status=BLOCKED' },
    { label: 'Completed',   value: rootStats.completed,  icon: <CheckCircleOutline />, gradient: 'linear-gradient(135deg, #10b981, #34d399)', nav: '/initiatives?status=COMPLETED' },
    {
      label: 'Overdue',
      value: rootStats.overdue,
      icon: <Warning />,
      gradient: rootStats.overdue > 0
        ? 'linear-gradient(135deg, #f59e0b, #fbbf24)'
        : 'linear-gradient(135deg, #94a3b8, #cbd5e1)',
      nav: '/initiatives',
    },
  ];

  const attentionItems = [
    overdueItems.length > 0 && {
      label: `${overdueItems.length} overdue`,
      icon: <Warning sx={{ fontSize: 13 }} />,
      sx: { bgcolor: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' },
    },
    dueSoonItems.length > 0 && {
      label: `${dueSoonItems.length} due this week`,
      icon: <CalendarToday sx={{ fontSize: 13 }} />,
      sx: { bgcolor: '#fffbeb', color: '#d97706', border: '1px solid #fde68a' },
    },
    noDueDateCount > 0 && {
      label: `${noDueDateCount} missing due date`,
      icon: null,
      sx: { bgcolor: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' },
    },
    staleCount > 0 && {
      label: `${staleCount} stale (14+ days)`,
      icon: null,
      sx: { bgcolor: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0' },
    },
  ].filter(Boolean);

  // Recent list: root items only, excluding completed, sorted by most recently updated
  const recentRoots = [...rootItems]
    .filter(i => i.status !== 'COMPLETED' && i.status !== 'CANCELLED')
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .slice(0, 8);

  return (
    <Box>
      {/* ── Header ── */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={4}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Dashboard</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => navigate('/initiatives')} sx={{ mt: 0.5 }}>
          New Initiative
        </Button>
      </Box>

      {/* ── AI Prioritization Suggestions ── */}
      <AIPriorityStrip
        mode="initiatives"
        lazy
        limit={5}
        title="AI Priority Suggestions"
        onCardClick={id => navigate(`/initiatives?open=${id}`)}
        sx={{ mb: 3 }}
      />

      {/* ── AI Task Priorities ── */}
      <AIPriorityStrip
        mode="tasks"
        lazy
        limit={5}
        title="Task Priorities"
        onCardClick={id => navigate(`/tasks?open=${id}`)}
        sx={{ mb: 4 }}
      />

      {/* ── Stat cards (clickable) ── */}
      <Box mb={1}>
        <Box display="flex" alignItems="center" gap={1} mb={1.5}>
          <AccountTree sx={{ fontSize: 16, color: 'text.secondary' }} />
          <Typography variant="overline" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 1 }}>
            Top-level Initiatives
          </Typography>
        </Box>
        <Box display="flex" gap={2} flexWrap="wrap">
          {topLevelStatCards.map((card) => (
            <Box
              key={card.label}
              onClick={() => navigate(card.nav)}
              sx={{
                flex: '1 1 150px', minWidth: 130,
                borderRadius: 3, p: 2.5, background: card.gradient, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
                cursor: 'pointer',
                transition: 'transform 0.15s, box-shadow 0.15s',
                '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 8px 20px rgba(0,0,0,0.18)' },
              }}
            >
              <Box>
                <Typography variant="caption" sx={{ opacity: 0.85, fontWeight: 500 }}>{card.label}</Typography>
                <Typography variant="h3" fontWeight={700} sx={{ lineHeight: 1.1, mt: 0.25 }}>{card.value}</Typography>
              </Box>
              <Box sx={{ opacity: 0.7, '& svg': { fontSize: 36 } }}>{card.icon}</Box>
            </Box>
          ))}
        </Box>
      </Box>

      {/* ── Attention callout chips ── */}
      {attentionItems.length > 0 && (
        <Box display="flex" gap={1} flexWrap="wrap" mt={2} mb={0.5}>
          {attentionItems.map((a, i) => (
            <Chip
              key={i}
              size="small"
              icon={a.icon || undefined}
              label={a.label}
              onClick={() => navigate('/initiatives')}
              sx={{ fontWeight: 500, ...a.sx }}
            />
          ))}
        </Box>
      )}

      {/* ── Sub-items & Standalone Tasks strip ── */}
      <Box
        sx={{
          mt: 2.5, mb: dueSoonItems.length > 0 ? 2.5 : 4, px: 3, py: 2,
          bgcolor: 'background.paper',
          border: '1px solid #e2e8f0',
          borderRadius: 3,
          display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap',
        }}
      >
        <Box display="flex" alignItems="center" gap={1}>
          <TaskAlt sx={{ fontSize: 16, color: '#6366f1' }} />
          <Typography variant="overline" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 1 }}>
            Sub-items
          </Typography>
        </Box>
        <Divider orientation="vertical" flexItem />
        {[
          { label: 'Total',       value: subStats.total,      color: '#64748b' },
          { label: 'In Progress', value: subStats.inProgress, color: '#2563eb' },
          { label: 'Blocked',     value: subStats.blocked,    color: '#dc2626' },
          { label: 'Completed',   value: subStats.completed,  color: '#059669' },
        ].map((s, idx) => (
          <Box key={s.label} display="flex" alignItems="center" gap={1.5}>
            {idx > 0 && <Divider orientation="vertical" flexItem />}
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">{s.label}</Typography>
              <Typography variant="h6" fontWeight={700} sx={{ color: s.color, lineHeight: 1 }}>{s.value}</Typography>
            </Box>
          </Box>
        ))}

        {standaloneTaskStats.total > 0 && (
          <>
            <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
            <Box display="flex" alignItems="center" gap={1}>
              <Groups sx={{ fontSize: 16, color: '#8b5cf6' }} />
              <Typography variant="overline" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 1 }}>
                Standalone Tasks
              </Typography>
            </Box>
            {[
              { label: 'Total',     value: standaloneTaskStats.total,     color: '#64748b' },
              { label: 'Open',      value: standaloneTaskStats.open,      color: '#7c3aed' },
              { label: 'Completed', value: standaloneTaskStats.completed, color: '#059669' },
            ].map((s, idx) => (
              <Box key={s.label} display="flex" alignItems="center" gap={1.5}>
                {idx > 0 && <Divider orientation="vertical" flexItem />}
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block">{s.label}</Typography>
                  <Typography variant="h6" fontWeight={700} sx={{ color: s.color, lineHeight: 1 }}>{s.value}</Typography>
                </Box>
              </Box>
            ))}
          </>
        )}
      </Box>

      {/* ── Due This Week ── */}
      {dueSoonItems.length > 0 && (
        <Box mb={4}>
          <Box display="flex" alignItems="center" gap={1} mb={1.5} mt={0.5}>
            <CalendarToday sx={{ fontSize: 16, color: '#d97706' }} />
            <Typography variant="overline" color="text.secondary" fontWeight={600} sx={{ letterSpacing: 1 }}>
              Due This Week
            </Typography>
          </Box>
          <Box display="flex" gap={2} sx={{ overflowX: 'auto', pb: 0.5 }}>
            {dueSoonItems.map(item => {
              const sc = STATUS_CONFIG[item.status] || STATUS_CONFIG.OPEN;
              const dueDate = new Date(item.dueDate);
              const daysLeft = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
              return (
                <Box
                  key={item.id}
                  onClick={() => navigate(`/initiatives?open=${item.id}`)}
                  sx={{
                    flexShrink: 0, width: 220,
                    bgcolor: 'background.paper',
                    border: '1px solid #e2e8f0',
                    borderRadius: 2.5, p: 2,
                    cursor: 'pointer',
                    transition: 'border-color 0.15s, box-shadow 0.15s',
                    '&:hover': { borderColor: '#6366f1', boxShadow: '0 2px 8px rgba(99,102,241,0.12)' },
                  }}
                >
                  <Typography variant="body2" fontWeight={600} noWrap mb={0.75}>{item.title}</Typography>
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Chip label={sc.label} size="small" sx={{ bgcolor: sc.bg, color: sc.color, fontWeight: 500, border: 0, fontSize: '0.68rem' }} />
                    <Typography variant="caption" sx={{ color: daysLeft === 0 ? '#dc2626' : '#d97706', fontWeight: 600 }}>
                      {daysLeft === 0 ? 'Today' : `${daysLeft}d left`}
                    </Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}

      {/* ── Analytics row: Progress · Assignee Workload · Canvas Breakdown ── */}
      <Grid container spacing={3} mb={3}>

        {/* Progress breakdown */}
        <Grid item xs={12} md={4}>
          <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, border: '1px solid #e2e8f0', p: 3, height: '100%' }}>
            <Typography variant="h6" mb={0.5}>Initiative Progress</Typography>
            <Typography variant="caption" color="text.secondary">Top-level initiatives only</Typography>
            <Box display="flex" alignItems="flex-end" gap={1} mb={1.5} mt={2}>
              <Typography variant="h2" fontWeight={700} color="primary">{completionRate}%</Typography>
              <Typography variant="body2" color="text.secondary" mb={0.75}>complete</Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={completionRate}
              sx={{ height: 8, borderRadius: 4, mb: 3 }}
              color="success"
            />
            <Divider sx={{ mb: 2 }} />
            {[
              { label: 'Open',        value: rootItems.filter(i => i.status === 'OPEN').length,    color: '#64748b' },
              { label: 'In Progress', value: rootStats.inProgress,                                 color: '#3b82f6' },
              { label: 'On Hold',     value: rootItems.filter(i => i.status === 'ON_HOLD').length, color: '#f59e0b' },
              { label: 'Blocked',     value: rootStats.blocked,                                    color: '#ef4444' },
              { label: 'Completed',   value: rootStats.completed,                                  color: '#10b981' },
            ].map(row => (
              <Box key={row.label} display="flex" justifyContent="space-between" alignItems="center" mb={1.25}>
                <Box display="flex" alignItems="center" gap={1}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: row.color, flexShrink: 0 }} />
                  <Typography variant="body2" color="text.secondary">{row.label}</Typography>
                </Box>
                <Typography variant="body2" fontWeight={600}>{row.value}</Typography>
              </Box>
            ))}
          </Box>
        </Grid>

        {/* Assignee workload */}
        <Grid item xs={12} md={4}>
          <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, border: '1px solid #e2e8f0', p: 3, height: '100%' }}>
            <Box display="flex" alignItems="center" gap={1} mb={0.5}>
              <Groups sx={{ fontSize: 18, color: '#6366f1' }} />
              <Typography variant="h6">Assignee Workload</Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">Open root initiatives per person</Typography>
            <Divider sx={{ my: 2 }} />
            {assigneeWorkload.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No assignees on root initiatives yet.</Typography>
            ) : (
              assigneeWorkload.map(a => (
                <Box key={a.name} display="flex" alignItems="center" gap={1.5} mb={1.75}>
                  <Avatar sx={{ width: 28, height: 28, fontSize: 12, bgcolor: '#6366f1', flexShrink: 0 }}>
                    {(a.name || '?')[0].toUpperCase()}
                  </Avatar>
                  <Box flex={1} minWidth={0}>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.4}>
                      <Typography variant="body2" fontWeight={500} noWrap sx={{ maxWidth: 110 }}>{a.name}</Typography>
                      <Box display="flex" gap={0.5}>
                        <Chip
                          label={`${a.open} open`}
                          size="small"
                          sx={{ bgcolor: '#eff6ff', color: '#2563eb', fontWeight: 600, fontSize: '0.65rem', height: 18, border: 0 }}
                        />
                        {a.blocked > 0 && (
                          <Chip
                            label={`${a.blocked} blocked`}
                            size="small"
                            sx={{ bgcolor: '#fef2f2', color: '#dc2626', fontWeight: 600, fontSize: '0.65rem', height: 18, border: 0 }}
                          />
                        )}
                      </Box>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={a.total > 0 ? Math.round(((a.total - a.open) / a.total) * 100) : 0}
                      sx={{ height: 4, borderRadius: 2 }}
                      color="success"
                    />
                  </Box>
                </Box>
              ))
            )}
          </Box>
        </Grid>

        {/* Canvas breakdown */}
        <Grid item xs={12} md={4}>
          <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, border: '1px solid #e2e8f0', p: 3, height: '100%' }}>
            <Typography variant="h6" mb={0.5}>Canvas Breakdown</Typography>
            <Typography variant="caption" color="text.secondary">Root initiatives by workspace</Typography>
            <Divider sx={{ my: 2 }} />
            {canvasBreakdown.length === 0 ? (
              <Typography variant="body2" color="text.secondary">No initiatives yet.</Typography>
            ) : (
              canvasBreakdown.map(c => (
                <Box key={c.name} mb={2}>
                  <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                    <Typography variant="body2" fontWeight={500} noWrap sx={{ maxWidth: 140 }}>{c.name}</Typography>
                    <Box display="flex" gap={0.75} alignItems="center">
                      <Typography variant="caption" color="text.secondary">{c.completed}/{c.total}</Typography>
                      {c.blocked > 0 && (
                        <Typography variant="caption" sx={{ color: '#dc2626' }}>· {c.blocked} blocked</Typography>
                      )}
                    </Box>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0}
                    sx={{ height: 6, borderRadius: 3 }}
                    color="success"
                  />
                </Box>
              ))
            )}
          </Box>
        </Grid>
      </Grid>

      {/* ── Completion Trend ── */}
      <Box
        sx={{
          mb: 3, px: 3, py: 2.5,
          bgcolor: 'background.paper',
          border: '1px solid #e2e8f0',
          borderRadius: 3,
        }}
      >
        <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2.5}>
          <Box>
            <Typography variant="h6">Completion Trend</Typography>
            <Typography variant="caption" color="text.secondary">
              Root initiatives completed per week · last 6 weeks
            </Typography>
          </Box>
          <Box textAlign="right">
            <Typography variant="h4" fontWeight={700} color="success.main" lineHeight={1}>
              {completionTrend[completionTrend.length - 1].count}
            </Typography>
            <Typography variant="caption" color="text.secondary">this week</Typography>
          </Box>
        </Box>
        <SparkBars data={completionTrend} />
      </Box>

      {/* ── Recent Initiatives ── */}
      <Box sx={{ bgcolor: 'background.paper', borderRadius: 3, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" px={3} py={2.25}>
          <Box>
            <Typography variant="h6">Recent Initiatives</Typography>
            <Typography variant="caption" color="text.secondary">Active top-level only · sub-item counts shown</Typography>
          </Box>
          <Button size="small" endIcon={<ChevronRight />} onClick={() => navigate('/initiatives')} sx={{ color: 'primary.main' }}>
            View all
          </Button>
        </Box>
        <Divider />
        {recentRoots.length === 0 ? (
          <Box px={3} py={5} textAlign="center">
            <Typography color="text.secondary" mb={1.5}>No active initiatives.</Typography>
            {noDueDateCount > 0 && (
              <Typography variant="caption" color="text.secondary" display="block" mb={1.5}>
                {noDueDateCount} initiatives have no due date set.
              </Typography>
            )}
            <Button variant="contained" size="small" startIcon={<Add />} onClick={() => navigate('/initiatives')}>
              Create First
            </Button>
          </Box>
        ) : (
          <>
            {recentRoots.map((item, idx) => {
              const sc = STATUS_CONFIG[item.status] || STATUS_CONFIG.OPEN;
              const pc = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.MEDIUM;
              const childCount = allItems.filter(i => i.parentId === item.id).length
                || item._count?.children
                || 0;
              const isOverdue = item.dueDate && new Date(item.dueDate) < today
                && item.status !== 'COMPLETED' && item.status !== 'CANCELLED';
              return (
                <Box
                  key={item.id}
                  onClick={() => navigate(`/initiatives?open=${item.id}`)}
                  sx={{
                    px: 3, py: 1.75,
                    borderBottom: idx < recentRoots.length - 1 ? '1px solid #f1f5f9' : 0,
                    display: 'flex', alignItems: 'center', gap: 2,
                    '&:hover': { bgcolor: '#fafbff' },
                    transition: 'background 0.15s',
                    cursor: 'pointer',
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box display="flex" alignItems="center" gap={0.75} flexWrap="wrap">
                      <Typography variant="body2" fontWeight={600} noWrap>{item.title}</Typography>
                      {isOverdue && (
                        <Chip
                          label="overdue"
                          size="small"
                          sx={{ bgcolor: '#fef2f2', color: '#dc2626', fontWeight: 600, fontSize: '0.65rem', height: 18, border: 0 }}
                        />
                      )}
                    </Box>
                    {item.description && (
                      <Typography variant="caption" color="text.secondary" noWrap display="block">
                        {item.description}
                      </Typography>
                    )}
                  </Box>
                  <Box display="flex" gap={0.75} alignItems="center" flexShrink={0}>
                    {childCount > 0 && (
                      <Chip
                        label={`${childCount} sub`}
                        size="small"
                        sx={{ bgcolor: '#f1f5f9', color: '#64748b', fontWeight: 500, border: 0, fontSize: '0.68rem' }}
                      />
                    )}
                    <Chip label={sc.label} size="small" sx={{ bgcolor: sc.bg, color: sc.color, fontWeight: 500, border: 0 }} />
                    <Chip label={item.priority} size="small" sx={{ bgcolor: pc.bg, color: pc.color, fontWeight: 500, border: 0 }} />
                    {item.dueDate && (
                      <Typography variant="caption" sx={{ color: isOverdue ? '#dc2626' : 'text.secondary', fontWeight: isOverdue ? 600 : 400 }}>
                        {new Date(item.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Typography>
                    )}
                  </Box>
                </Box>
              );
            })}
            {(noDueDateCount > 0 || staleCount > 0) && (
              <Box px={3} py={1.25} bgcolor="#fafbff" display="flex" gap={2} flexWrap="wrap" borderTop="1px solid #f1f5f9">
                {noDueDateCount > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    ⚠ {noDueDateCount} active initiative{noDueDateCount !== 1 ? 's have' : ' has'} no due date
                  </Typography>
                )}
                {staleCount > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    · {staleCount} not updated in 14+ days
                  </Typography>
                )}
              </Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}


