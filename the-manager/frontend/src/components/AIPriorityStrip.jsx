/**
 * Reusable AI priority suggestions strip.
 * Props:
 *   mode        – 'initiatives' | 'tasks'   (default: 'initiatives')
 *   limit       – max suggestions to fetch  (default: 5)
 *   title       – section heading text
 *   onCardClick – (id) => void  — called when a card is clicked
 *   canvasId    – optional canvas filter
 *   lazy        – if true, don't auto-fetch; show a button instead (results cached for session)
 *   sx          – extra Box sx for the outer container
 */
import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@mui/material/styles';
import {
  Box, Typography, Chip, IconButton, Skeleton, Tooltip, Button,
} from '@mui/material';
import { AutoAwesome, Refresh, FiberManualRecord, Settings } from '@mui/icons-material';
import api from '../api/axios';
import AISettingsDialog from './AISettingsDialog';

// ── Session-level cache (lives as long as the tab/app is open) ──────────────
const _cache = new Map(); // key: `${mode}:${canvasId ?? 'all'}` → data object

const PROVIDER_BADGE = {
  ollama:            { label: '🦙 Ollama',   color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', darkColor: '#4ade80', darkBg: 'rgba(21,128,61,0.15)',   darkBorder: 'rgba(21,128,61,0.3)'   },
  openai:            { label: '✨ OpenAI',    color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', darkColor: '#60a5fa', darkBg: 'rgba(59,130,246,0.15)',  darkBorder: 'rgba(59,130,246,0.3)'  },
  openai_compatible: { label: '🔌 Custom AI', color: '#6b21a8', bg: '#faf5ff', border: '#e9d5ff', darkColor: '#c084fc', darkBg: 'rgba(168,85,247,0.15)',  darkBorder: 'rgba(168,85,247,0.3)'  },
  gemini:            { label: '♊ Gemini',    color: '#b45309', bg: '#fffbeb', border: '#fde68a', darkColor: '#fbbf24', darkBg: 'rgba(251,191,36,0.15)',  darkBorder: 'rgba(251,191,36,0.3)'  },
};

const STATUS_CHIP = {
  OPEN:        { label: 'Open',        color: '#64748b', bg: '#f1f5f9', darkBg: 'rgba(100,116,139,0.15)' },
  IN_PROGRESS: { label: 'In Progress', color: '#2563eb', bg: '#eff6ff', darkBg: 'rgba(37,99,235,0.15)'   },
  BLOCKED:     { label: 'Blocked',     color: '#dc2626', bg: '#fef2f2', darkBg: 'rgba(220,38,38,0.15)'   },
  ON_HOLD:     { label: 'On Hold',     color: '#d97706', bg: '#fffbeb', darkBg: 'rgba(217,119,6,0.15)'   },
};

const PRIORITY_COLOR = { CRITICAL: '#dc2626', HIGH: '#d97706', MEDIUM: '#2563eb', LOW: '#64748b' };

export default function AIPriorityStrip({
  mode = 'initiatives',
  limit = 5,
  title,
  onCardClick,
  canvasId,
  lazy = false,
  sx = {},
}) {
  const cacheKey = `${mode}:${canvasId ?? 'all'}`;
  const cached = _cache.get(cacheKey);

  const [state, setState] = useState(() => ({
    loading: !lazy && !cached,   // auto-fetch → start loading; lazy + no cache → idle
    data: cached ?? null,
    error: false,
    idle: lazy && !cached,       // true = waiting for user to click the button
  }));
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback((force = false) => {
    setState(prev => ({ ...prev, loading: true, error: false, idle: false }));
    api.get('/ai/suggestions', { params: { limit, mode, ...(canvasId ? { canvasId } : {}) } })
      .then(r => {
        _cache.set(cacheKey, r.data);
        setState({ loading: false, data: r.data, error: false, idle: false });
      })
      .catch(() => setState(prev => ({ ...prev, loading: false, data: null, error: true, idle: false })));
  }, [mode, limit, canvasId, cacheKey]);

  useEffect(() => {
    // Auto-fetch only when not lazy
    if (!lazy && !cached) load();
    // If canvasId changes and we have a stale cache entry for a different key → auto-load for non-lazy
    else if (!lazy && cached) {
      setState({ loading: false, data: cached, error: false, idle: false });
    }
  }, [lazy, load]); // eslint-disable-line

  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const heading = title || (mode === 'tasks' ? '⚡ Task Priorities' : '🧠 AI Priority Suggestions');
  const accentColor = mode === 'tasks'
    ? (isDark ? '#38bdf8' : '#0369a1')
    : (isDark ? '#a78bfa' : '#7c3aed');
  const accentLight = mode === 'tasks'
    ? (isDark ? '#7dd3fc' : '#075985')
    : (isDark ? '#c4b5fd' : '#5b21b6');

  return (
    <Box
      sx={{
        p: 2.5,
        borderRadius: 3,
        background: isDark
          ? (mode === 'tasks' ? 'rgba(3,105,161,0.1)' : 'rgba(99,102,241,0.08)')
          : (mode === 'tasks' ? 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)' : 'linear-gradient(135deg, #f5f3ff 0%, #ede9fe 100%)'),
        border: isDark
          ? (mode === 'tasks' ? '1px solid rgba(125,211,252,0.2)' : '1px solid rgba(167,139,250,0.2)')
          : (mode === 'tasks' ? '1px solid #bae6fd' : '1px solid #ddd6fe'),
        ...sx,
      }}
    >
      {/* Header */}
      <Box display="flex" alignItems="center" justifyContent="space-between"
        mb={state.loading || (state.data?.suggestions?.length > 0) ? 2 : 0}>
        <Box display="flex" alignItems="center" gap={1}>
          <AutoAwesome sx={{ fontSize: 16, color: accentColor }} />
          <Typography variant="subtitle2" fontWeight={700} color={accentLight}>
            {heading}
          </Typography>
          {state.data?.llmProvider && (() => {
            const badge = PROVIDER_BADGE[state.data.llmProvider] || PROVIDER_BADGE.ollama;
            return (
              <Chip
                label={badge.label}
                size="small"
                sx={{ bgcolor: isDark ? badge.darkBg : badge.bg, color: isDark ? badge.darkColor : badge.color, border: `1px solid ${isDark ? badge.darkBorder : badge.border}`, fontWeight: 600, fontSize: '0.62rem', height: 18 }}
              />
            );
          })()}
          {state.data && !state.loading && (
            <Typography variant="caption" color="text.secondary">
              {state.data.analysedCount} item{state.data.analysedCount !== 1 ? 's' : ''} analysed
            </Typography>
          )}
          {state.data && !state.loading && cached && (
            <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic', fontSize: '0.65rem' }}>
              cached
            </Typography>
          )}
        </Box>
        <Box display="flex" alignItems="center" gap={0.25}>
          <Tooltip title="AI Settings">
            <IconButton size="small" onClick={() => setSettingsOpen(true)} sx={{ color: accentColor }}>
              <Settings fontSize="small" />
            </IconButton>
          </Tooltip>
          {!state.idle && (
            <Tooltip title="Refresh suggestions">
              <IconButton size="small" onClick={() => load(true)} disabled={state.loading} sx={{ color: accentColor }}>
                <Refresh fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Box>

      {/* Idle state — lazy mode, no data yet → show button */}
      {state.idle && (
        <Button
          variant="outlined"
          size="small"
          startIcon={<AutoAwesome sx={{ fontSize: '1rem !important' }} />}
          onClick={() => load()}
          sx={{
            borderColor: mode === 'tasks' ? '#7dd3fc' : '#a78bfa',
            color: accentColor,
            fontWeight: 600,
            fontSize: '0.78rem',
            borderRadius: 2,
            px: 2,
            py: 0.75,
            '&:hover': {
              borderColor: accentColor,
              bgcolor: isDark
                ? (mode === 'tasks' ? 'rgba(3,105,161,0.15)' : 'rgba(99,102,241,0.1)')
                : (mode === 'tasks' ? '#e0f2fe' : '#f5f3ff'),
            },
          }}
        >
          Run AI Analysis
        </Button>
      )}

      {/* Loading skeletons */}
      {state.loading && (
        <Box display="flex" gap={1.5} overflow="hidden">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} variant="rounded" width={200} height={90} sx={{ flexShrink: 0, borderRadius: 2 }} />
          ))}
        </Box>
      )}

      {/* Error */}
      {!state.loading && !state.idle && state.error && (
        <Typography variant="body2" color="text.secondary">Could not load suggestions.</Typography>
      )}

      {/* Empty */}
      {!state.loading && !state.idle && !state.error && state.data?.suggestions?.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          {mode === 'tasks' ? 'All tasks look on track — nothing urgent.' : 'All items look on track — no urgent items flagged.'}
        </Typography>
      )}

      {/* Cards */}
      {!state.loading && !state.error && state.data?.suggestions?.length > 0 && (
        <Box display="flex" gap={1.5} sx={{ overflowX: 'auto', pb: 0.5 }}>
          {state.data.suggestions.map((item, idx) => {
            const sc = STATUS_CHIP[item.status] || STATUS_CHIP.OPEN;
            const priorityColor = PRIORITY_COLOR[item.priority] || '#64748b';
            const accentColor = mode === 'tasks'
              ? (isDark ? '#38bdf8' : '#0369a1')
              : (isDark ? '#a78bfa' : '#7c3aed');
            const accentBorder = isDark
              ? (mode === 'tasks' ? 'rgba(56,189,248,0.25)' : 'rgba(167,139,250,0.25)')
              : (mode === 'tasks' ? '#7dd3fc' : '#e9d5ff');
            const accentHoverBorder = isDark
              ? (mode === 'tasks' ? 'rgba(56,189,248,0.5)' : 'rgba(167,139,250,0.5)')
              : (mode === 'tasks' ? '#38bdf8' : '#c084fc');
            const accentHoverShadow = mode === 'tasks'
              ? 'rgba(3,105,161,0.12)'
              : 'rgba(124,58,237,0.12)';
            const rankGrad0 = mode === 'tasks'
              ? 'linear-gradient(135deg,#0369a1,#38bdf8)'
              : 'linear-gradient(135deg,#7c3aed,#a78bfa)';
            const rankGrad1 = mode === 'tasks'
              ? 'linear-gradient(135deg,#0284c7,#7dd3fc)'
              : 'linear-gradient(135deg,#2563eb,#60a5fa)';

            return (
              <Box
                key={item.id}
                onClick={() => onCardClick?.(item.id)}
                sx={{
                  flexShrink: 0, width: 210,
                  bgcolor: 'background.paper',
                  borderRadius: 2.5,
                  border: `1px solid ${accentBorder}`,
                  p: 1.75,
                  cursor: 'pointer',
                  transition: 'box-shadow 0.15s, border-color 0.15s',
                  '&:hover': {
                    boxShadow: `0 4px 16px ${accentHoverShadow}`,
                    borderColor: accentHoverBorder,
                  },
                  display: 'flex', flexDirection: 'column', gap: 0.75,
                }}
              >
                {/* Rank + title */}
                <Box display="flex" alignItems="flex-start" gap={1}>
                  <Box
                    sx={{
                      minWidth: 20, height: 20, borderRadius: '50%', flexShrink: 0, mt: 0.1,
                      background: idx === 0 ? rankGrad0 : idx === 1 ? rankGrad1 : (isDark ? '#334155' : '#e2e8f0'),
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Typography variant="caption" fontWeight={700}
                      sx={{ color: idx < 2 ? '#fff' : '#64748b', fontSize: '0.62rem', lineHeight: 1 }}>
                      {idx + 1}
                    </Typography>
                  </Box>
                  <Typography variant="caption" fontWeight={700}
                    sx={{ lineHeight: 1.35, fontSize: '0.75rem' }} noWrap title={item.title}>
                    {item.title}
                  </Typography>
                </Box>

                {/* Status + priority */}
                <Box display="flex" alignItems="center" gap={0.75}>
                  <Chip label={sc.label} size="small"
                    sx={{ bgcolor: isDark ? sc.darkBg : sc.bg, color: sc.color, fontWeight: 600, fontSize: '0.62rem', height: 18, border: 0 }} />
                  <Box display="flex" alignItems="center" gap={0.3}>
                    <FiberManualRecord sx={{ fontSize: 7, color: priorityColor }} />
                    <Typography variant="caption" sx={{ color: priorityColor, fontWeight: 600, fontSize: '0.62rem' }}>
                      {item.priority}
                    </Typography>
                  </Box>
                </Box>

                {/* Top reason */}
                {item.reasons[0] && (
                  <Typography variant="caption"
                    sx={{ color: accentColor, fontSize: '0.68rem', lineHeight: 1.3 }}>
                    {item.reasons[0].icon} {item.reasons[0].label}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {/* Footer */}
      {!state.loading && !state.error && state.data?.suggestions?.length > 0 && (
        <Typography variant="caption" color="text.secondary"
          sx={{ display: 'block', mt: 1.5, fontStyle: 'italic' }}>
          Ranked by urgency · priority · due date · staleness
          {state.data?.llmUsed ? ' · description read by LLM' : ''}
        </Typography>
      )}
      <AISettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => load()}
      />
    </Box>
  );
}
