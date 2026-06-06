import { useState, useCallback } from 'react';
import { useTheme } from '@mui/material/styles';
import {
  Drawer, Box, Typography, IconButton, Chip,
  CircularProgress, Tooltip, Divider, Button,
} from '@mui/material';
import {
  AutoAwesome, Close, Refresh, ChevronRight,
  FiberManualRecord, Settings,
} from '@mui/icons-material';
import api from '../api/axios';
import { useNavigate } from 'react-router-dom';
import AISettingsDialog from './AISettingsDialog';

const PROVIDER_BADGE = {
  ollama:  { label: '🦙 Ollama',  color: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', darkColor: '#4ade80', darkBg: 'rgba(21,128,61,0.15)',  darkBorder: 'rgba(21,128,61,0.3)'  },
  openai:  { label: '✨ OpenAI',   color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe', darkColor: '#60a5fa', darkBg: 'rgba(59,130,246,0.15)', darkBorder: 'rgba(59,130,246,0.3)' },
  gemini:  { label: '♊ Gemini',   color: '#b45309', bg: '#fffbeb', border: '#fde68a', darkColor: '#fbbf24', darkBg: 'rgba(251,191,36,0.15)', darkBorder: 'rgba(251,191,36,0.3)' },
};

const STATUS_CONFIG = {
  OPEN:        { label: 'Open',        color: '#64748b', bg: '#f1f5f9', darkBg: 'rgba(100,116,139,0.15)' },
  IN_PROGRESS: { label: 'In Progress', color: '#2563eb', bg: '#eff6ff', darkBg: 'rgba(37,99,235,0.15)'   },
  BLOCKED:     { label: 'Blocked',     color: '#dc2626', bg: '#fef2f2', darkBg: 'rgba(220,38,38,0.15)'   },
  ON_HOLD:     { label: 'On Hold',     color: '#d97706', bg: '#fffbeb', darkBg: 'rgba(217,119,6,0.15)'   },
};

const PRIORITY_COLOR = {
  CRITICAL: '#dc2626',
  HIGH:     '#d97706',
  MEDIUM:   '#2563eb',
  LOW:      '#64748b',
};

// ─── Trigger button ─────────────────────────────────────────────────────────
export function AISuggestionsButton({ canvasId, sx = {} }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Tooltip title="AI prioritization suggestions">
        <Button
          variant="outlined"
          size="small"
          startIcon={<AutoAwesome sx={{ fontSize: '1rem !important' }} />}
          onClick={() => setOpen(true)}
          sx={{
            borderColor: '#a78bfa',
            color: '#7c3aed',
            fontWeight: 600,
            fontSize: '0.75rem',
            px: 1.5,
            py: 0.5,
            borderRadius: 2,
            '&:hover': { borderColor: '#7c3aed', bgcolor: 'rgba(124,58,237,0.08)' },
            ...sx,
          }}
        >
          AI Suggestions
        </Button>
      </Tooltip>
      <AISuggestionsPanel open={open} onClose={() => setOpen(false)} canvasId={canvasId} />
    </>
  );
}

// ─── Panel (Drawer) ─────────────────────────────────────────────────────────
export default function AISuggestionsPanel({ open, onClose, canvasId }) {
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null); // { suggestions, analysedCount, generatedAt, llmProvider }
  const [error, setError] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (canvasId && canvasId !== 'all') params.canvasId = canvasId;
      const res = await api.get('/ai/suggestions', { params });
      setData(res.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to load suggestions. Please check your connection.');
    } finally {
      setLoading(false);
    }
  }, [canvasId]);

  // Load on drawer open
  const handleOpen = useCallback(() => {
    if (!data) load();
  }, [data, load]);

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      onAnimationStart={open ? handleOpen : undefined}
      PaperProps={{
        sx: {
          width: { xs: '100vw', sm: 420 },
          borderLeft: `1px solid ${theme.palette.divider}`,
          boxShadow: '-4px 0 32px rgba(0,0,0,0.08)',
        },
      }}
    >
      {/* ── Header ── */}
      <Box
        sx={{
          px: 3, py: 2.5,
          background: 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <Box display="flex" alignItems="center" gap={1.25}>
          <AutoAwesome sx={{ color: '#fff', fontSize: 20 }} />
          <Box>
            <Typography variant="subtitle1" fontWeight={700} color="#fff" lineHeight={1.1}>
              AI Suggestions
            </Typography>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)' }}>
              Smart prioritization
            </Typography>
          </Box>
        </Box>
        <Box display="flex" alignItems="center" gap={0.5}>
          <Tooltip title="AI Settings">
            <IconButton size="small" onClick={() => setSettingsOpen(true)} sx={{ color: 'rgba(255,255,255,0.8)' }}>
              <Settings fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh">
            <IconButton size="small" onClick={load} disabled={loading} sx={{ color: 'rgba(255,255,255,0.8)' }}>
              <Refresh fontSize="small" />
            </IconButton>
          </Tooltip>
          <IconButton size="small" onClick={onClose} sx={{ color: 'rgba(255,255,255,0.8)' }}>
            <Close fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ flex: 1, overflowY: 'auto' }}>
        {/* ── Loading ── */}
        {loading && (
          <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" py={10} gap={2}>
            <CircularProgress size={32} sx={{ color: '#7c3aed' }} />
            <Typography variant="body2" color="text.secondary">Analysing your initiatives…</Typography>
          </Box>
        )}

        {/* ── Error ── */}
        {!loading && error && (
          <Box px={3} py={6} textAlign="center">
            <Typography color="error" mb={2}>{error}</Typography>
            <Box display="flex" gap={1} justifyContent="center">
              <Button size="small" onClick={load} startIcon={<Refresh />}>Retry</Button>
              <Button size="small" onClick={() => setSettingsOpen(true)} startIcon={<Settings />}>AI Settings</Button>
            </Box>
          </Box>
        )}

        {/* ── AI error warning (AI failed but structural results still shown) ── */}
        {!loading && !error && data?.llmError && (
          <Box
            sx={{
              mx: 3, mt: 1.5,
              p: 1.5, borderRadius: 2,
              bgcolor: isDark ? 'rgba(217,119,6,0.1)' : '#fffbeb',
              border: '1px solid',
              borderColor: isDark ? 'rgba(217,119,6,0.3)' : '#fde68a',
            }}
          >
            <Typography variant="caption" sx={{ color: isDark ? '#fbbf24' : '#92400e', display: 'block', lineHeight: 1.4 }}>
              ⚠️ AI scoring unavailable — {data.llmError}
            </Typography>
            <Button
              size="small"
              onClick={() => setSettingsOpen(true)}
              sx={{ mt: 0.75, fontSize: '0.7rem', color: '#7c3aed', p: 0, minWidth: 0, textTransform: 'none', fontWeight: 600 }}
            >
              Configure AI →
            </Button>
          </Box>
        )}

        {/* ── Empty ── */}
        {!loading && !error && data && data.suggestions.length === 0 && (
          <Box px={3} py={8} textAlign="center">
            <AutoAwesome sx={{ fontSize: 40, color: '#a78bfa', mb: 1.5 }} />
            <Typography variant="subtitle1" fontWeight={600} mb={0.5}>All clear!</Typography>
            <Typography variant="body2" color="text.secondary">
              No urgent items found. Everything looks on track.
            </Typography>
          </Box>
        )}

        {/* ── Suggestions ── */}
        {!loading && !error && data && data.suggestions.length > 0 && (
          <Box>
            {/* Meta bar */}
            <Box
              sx={{
                px: 3, py: 1.5,
                bgcolor: isDark ? 'rgba(124,58,237,0.08)' : '#faf5ff',
                borderBottom: `1px solid ${isDark ? 'rgba(124,58,237,0.15)' : '#ede9fe'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <Typography variant="caption" color="text.secondary">
                Analysed <strong>{data.analysedCount}</strong> active item{data.analysedCount !== 1 ? 's' : ''}
              </Typography>
              <Box display="flex" alignItems="center" gap={1}>
                {data.llmUsed && (() => {
                  const badge = PROVIDER_BADGE[data.llmProvider] || PROVIDER_BADGE.ollama;
                  return (
                    <Chip
                      label={badge.label}
                      size="small"
                      sx={{ bgcolor: isDark ? badge.darkBg : badge.bg, color: isDark ? badge.darkColor : badge.color, border: `1px solid ${isDark ? badge.darkBorder : badge.border}`, fontWeight: 600, fontSize: '0.65rem', height: 18 }}
                    />
                  );
                })()}
                <Typography variant="caption" color="text.secondary">
                  {data.suggestions.length} suggestion{data.suggestions.length !== 1 ? 's' : ''}
                </Typography>
              </Box>
            </Box>

            {data.suggestions.map((item, idx) => {
              const sc = STATUS_CONFIG[item.status] || STATUS_CONFIG.OPEN;
              const priorityColor = PRIORITY_COLOR[item.priority] || '#64748b';
              return (
                <Box key={item.id}>
                  <Box
                    sx={{
                      px: 3, py: 2.25,
                      '&:hover': { bgcolor: isDark ? 'rgba(124,58,237,0.08)' : '#faf5ff' },
                      cursor: 'pointer',
                      transition: 'background 0.12s',
                    }}
                    onClick={() => { navigate(`/initiatives?open=${item.id}`); onClose(); }}
                  >
                    {/* Rank + title row */}
                    <Box display="flex" alignItems="flex-start" gap={1.5} mb={1}>
                      <Box
                        sx={{
                          minWidth: 24, height: 24, borderRadius: '50%',
                          background: idx === 0
                            ? 'linear-gradient(135deg,#7c3aed,#a78bfa)'
                            : idx === 1
                              ? 'linear-gradient(135deg,#2563eb,#60a5fa)'
                              : (isDark ? '#334155' : '#e2e8f0'),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0, mt: 0.1,
                        }}
                      >
                        <Typography variant="caption" fontWeight={700} sx={{ color: idx < 2 ? '#fff' : '#64748b', fontSize: '0.7rem' }}>
                          {idx + 1}
                        </Typography>
                      </Box>
                      <Box flex={1} minWidth={0}>
                        <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                          {item.title}
                        </Typography>
                        {item.parentId && (
                          <Typography variant="caption" color="text.secondary">Sub-item</Typography>
                        )}
                      </Box>
                      <ChevronRight sx={{ color: '#cbd5e1', flexShrink: 0, fontSize: 18, mt: 0.2 }} />
                    </Box>

                    {/* Status + priority chips */}
                    <Box display="flex" gap={0.75} mb={1.25} ml={4.5}>
                      <Chip
                        label={sc.label}
                        size="small"
                        sx={{ bgcolor: isDark ? sc.darkBg : sc.bg, color: sc.color, fontWeight: 600, fontSize: '0.68rem', height: 20, border: 0 }}
                      />
                      <Box display="flex" alignItems="center" gap={0.4}>
                        <FiberManualRecord sx={{ fontSize: 8, color: priorityColor }} />
                        <Typography variant="caption" sx={{ color: priorityColor, fontWeight: 600, fontSize: '0.68rem' }}>
                          {item.priority}
                        </Typography>
                      </Box>
                    </Box>

                    {/* Reasons */}
                    <Box display="flex" flexWrap="wrap" gap={0.75} ml={4.5}>
                      {item.reasons.map((r, ri) => (
                        <Chip
                          key={ri}
                          label={`${r.icon} ${r.label}`}
                          size="small"
                          sx={{
                            bgcolor: r.icon === '🧠'
                              ? (isDark ? 'rgba(126,34,206,0.15)' : '#fdf4ff')
                              : (isDark ? 'rgba(91,33,182,0.15)' : '#f5f3ff'),
                            color:   r.icon === '🧠' ? '#a78bfa' : '#8b5cf6',
                            fontWeight: 500,
                            fontSize: '0.68rem',
                            height: 20,
                            border: `1px solid ${isDark ? 'rgba(167,139,250,0.2)' : (r.icon === '🧠' ? '#e9d5ff' : '#ede9fe')}`,
                          }}
                        />
                      ))}
                    </Box>

                    {/* Description snippet — shown when text analysis fired */}
                    {item.description && item.reasons.some(r => r.icon === '🧠') && (
                      <Box
                        ml={4.5}
                        mt={1}
                        px={1.25}
                        py={0.75}
                        sx={{
                          bgcolor: isDark ? 'rgba(126,34,206,0.12)' : '#fdf4ff',
                          border: `1px solid ${isDark ? 'rgba(167,139,250,0.2)' : '#e9d5ff'}`,
                          borderRadius: 1.5,
                        }}
                      >
                        <Typography
                          variant="caption"
                          color="#6b21a8"
                          sx={{ display: 'block', lineHeight: 1.45, fontStyle: 'italic' }}
                        >
                          "{item.description.length > 160
                            ? item.description.slice(0, 160) + '…'
                            : item.description}"
                        </Typography>
                      </Box>
                    )}
                  </Box>
                  {idx < data.suggestions.length - 1 && <Divider sx={{ mx: 3 }} />}
                </Box>
              );
            })}

            {/* Footer note */}
            <Box px={3} py={2} sx={{ bgcolor: isDark ? 'rgba(124,58,237,0.08)' : '#faf5ff', borderTop: `1px solid ${isDark ? 'rgba(124,58,237,0.15)' : '#ede9fe'}` }}>
              <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                Ranked by urgency · priority · staleness · blocked sub-items · due date{data.llmUsed ? ' · description read by LLM' : ''}
              </Typography>
            </Box>
          </Box>
        )}
      </Box>
      <AISettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => { setData(null); load(); }}
      />
    </Drawer>
  );
}
