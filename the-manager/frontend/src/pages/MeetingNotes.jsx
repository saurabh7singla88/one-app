import { useEffect, useState, useCallback } from 'react';
import { useSelector } from 'react-redux';
import {
  Box, Typography, IconButton, Chip, CircularProgress,
  Divider, Tooltip, TextField, InputAdornment, Alert,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, Autocomplete,
} from '@mui/material';
import {
  Refresh, Email, EventNote, CalendarMonth, InboxOutlined,
  Label as LabelIcon, AutoFixHigh, Person, CheckCircle, ContentCopy, Done,
  BookmarkAdd, Bookmark, Edit,
} from '@mui/icons-material';

const PRESET_LABELS = [
  { label: 'Gemini Notes', icon: '✦' },
  { label: 'INBOX',        icon: '📥' },
];
import { format, isToday, parseISO } from 'date-fns';
import api from '../api/axios';

// ── helpers ───────────────────────────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '';
  try {
    const d = parseISO(iso);
    if (isToday(d)) return format(d, 'h:mm a');
    return format(d, 'MMM d, h:mm a');
  } catch { return ''; }
}

function timeAgo(iso) {
  if (!iso) return '';
  try {
    const diff = Math.floor((Date.now() - parseISO(iso).getTime()) / 1000);
    if (diff < 60)    return 'just now';
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch { return ''; }
}

// Format plain text email body into readable paragraphs
function renderEmailBody(text) {
  if (!text) return null;
  return text.split(/\n{2,}/).map((para, i) => (
    <Typography
      key={i}
      variant="body2"
      sx={{ mb: 1.5, lineHeight: 1.75, color: '#374151', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
    >
      {para.trim()}
    </Typography>
  ));
}

// ── Action Items Panel ────────────────────────────────────────────────────────
const PROVIDER_LABEL = {
  ollama: '🦙 Ollama', openai: '✨ OpenAI', gemini: '♊ Gemini',
  openai_compatible: '🔌 Compatible', disabled: '—',
};

function ActionItemsPanel({ data, userName }) {
  const { items = [], provider, llmCalled, llmFailed, emptyBody } = data;
  const forMe  = items.filter(i => i.isForMe);
  const others = items.filter(i => !i.isForMe);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const lines = [];
    if (forMe.length > 0) {
      lines.push('FOR YOU:');
      forMe.forEach(a => lines.push(`☐ ${a.text}${a.assignee ? ` (${a.assignee})` : ''}`));
    }
    if (others.length > 0) {
      if (forMe.length > 0) lines.push('');
      lines.push('OTHER ACTIONS:');
      others.forEach(a => lines.push(`☐ ${a.text}${a.assignee ? ` (${a.assignee})` : ''}`));
    }
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (items.length === 0) {
    let msg = 'No action items found in this email.';
    let color = 'text.secondary';
    if (emptyBody) {
      msg = 'Email body is empty — nothing to extract. Try refreshing emails.';
      color = 'warning.main';
    } else if (llmFailed) {
      msg = data.llmError || `AI provider (${PROVIDER_LABEL[provider] || provider}) did not respond. Check AI settings in Setup.`;
      color = 'error.main';
    } else if (llmCalled === false && provider === 'disabled') {
      msg = 'AI is disabled. Enable a provider in Setup → AI Settings.';
      color = 'text.secondary';
    }
    return (
      <Box
        sx={{ bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 2, px: 2.5, py: 2, mb: 3 }}
      >
        <Typography variant="body2" color={color} fontStyle="italic">
          {msg}
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        bgcolor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 2.5,
        overflow: 'hidden', mb: 3,
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2.5, py: 1.5,
          bgcolor: '#6366f1',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <Box display="flex" alignItems="center" gap={1}>
          <AutoFixHigh sx={{ color: '#fff', fontSize: 16 }} />
          <Typography variant="body2" fontWeight={700} color="#fff" fontSize="0.85rem">
            Action Items
          </Typography>
          <Chip
            label={`${items.length} total`}
            size="small"
            sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: '#fff', fontWeight: 700, fontSize: '0.7rem', height: 20 }}
          />
        </Box>
        <Box display="flex" alignItems="center" gap={1.5}>
          {provider && provider !== 'disabled' && (
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.7rem' }}>
              via {PROVIDER_LABEL[provider] || provider}
            </Typography>
          )}
          <Tooltip title={copied ? 'Copied!' : 'Copy to clipboard'}>
            <Box
              component="span"
              onClick={handleCopy}
              sx={{
                display: 'inline-flex', alignItems: 'center', gap: 0.5,
                cursor: 'pointer', color: copied ? '#86efac' : 'rgba(255,255,255,0.7)',
                fontSize: '0.72rem', fontWeight: 600,
                transition: 'color 0.2s',
                '&:hover': { color: '#fff' },
              }}
            >
              {copied
                ? <Done sx={{ fontSize: 13 }} />
                : <ContentCopy sx={{ fontSize: 13 }} />
              }
              {copied ? 'Copied' : 'Copy'}
            </Box>
          </Tooltip>
        </Box>
      </Box>

      <Box sx={{ px: 2.5, py: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {/* For me */}
        {forMe.length > 0 && (
          <Box>
            <Box display="flex" alignItems="center" gap={0.75} mb={1}>
              <Person sx={{ fontSize: 13, color: '#7c3aed' }} />
              <Typography variant="caption" fontWeight={700} color="#7c3aed" letterSpacing={0.3}>
                FOR YOU
              </Typography>
            </Box>
            {forMe.map((item, i) => (
              <Box
                key={i}
                sx={{
                  display: 'flex', alignItems: 'flex-start', gap: 1.25,
                  bgcolor: '#faf5ff', border: '1px solid #e9d5ff',
                  borderRadius: 2, px: 1.75, py: 1.25, mb: 0.75,
                }}
              >
                <CheckCircle sx={{ fontSize: 15, color: '#7c3aed', mt: '2px', flexShrink: 0 }} />
                <Box flex={1}>
                  <Typography variant="body2" fontWeight={600} fontSize="0.85rem" color="#3b0764" lineHeight={1.5}>
                    {item.text}
                  </Typography>
                  {item.assignee && (
                    <Typography variant="caption" color="#7c3aed" fontSize="0.72rem">
                      {item.assignee}
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {/* For others */}
        {others.length > 0 && (
          <Box>
            {forMe.length > 0 && <Divider sx={{ mb: 1.5 }} />}
            <Box display="flex" alignItems="center" gap={0.75} mb={1}>
              <Typography variant="caption" fontWeight={700} color="text.secondary" letterSpacing={0.3}>
                OTHER ACTIONS
              </Typography>
            </Box>
            {others.map((item, i) => (
              <Box
                key={i}
                sx={{
                  display: 'flex', alignItems: 'flex-start', gap: 1.25,
                  borderRadius: 2, px: 1.75, py: 1, mb: 0.5,
                  bgcolor: '#f8fafc', border: '1px solid #e2e8f0',
                }}
              >
                <Box
                  sx={{
                    width: 8, height: 8, borderRadius: '50%',
                    bgcolor: '#94a3b8', flexShrink: 0, mt: '6px',
                  }}
                />
                <Box flex={1}>
                  <Typography variant="body2" fontSize="0.84rem" color="#334155" lineHeight={1.5}>
                    {item.text}
                  </Typography>
                  {item.assignee && (
                    <Typography variant="caption" color="text.disabled" fontSize="0.72rem">
                      {item.assignee}
                    </Typography>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function MeetingNotes() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const { user } = useSelector((s) => s.auth);
  const [date, setDate]           = useState(today);
  const [label, setLabel]         = useState('Gemini Notes');  // active Gmail label
  const [customLabel, setCustomLabel] = useState('');
  const [emails, setEmails]       = useState([]);
  const [selected, setSelected]   = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [availableMailboxes, setAvailableMailboxes] = useState([]);

  // action items state: { [messageId]: { items, provider } } | null = not yet fetched
  const [actionItemsMap, setActionItemsMap] = useState({});
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [actionError, setActionError] = useState(null);

  // first-visit setup banner — dismissed per-browser via localStorage
  const SETUP_KEY = 'meeting_notes_setup_seen';
  const [showSetupBanner, setShowSetupBanner] = useState(() => !localStorage.getItem(SETUP_KEY));
  const dismissSetupBanner = () => {
    localStorage.setItem(SETUP_KEY, '1');
    setShowSetupBanner(false);
  };

  // save-to-initiative state
  const [initiatives, setInitiatives] = useState([]);
  const [savedNotesMap, setSavedNotesMap] = useState({}); // { [messageId]: savedNote }
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveSelectedInit, setSaveSelectedInit] = useState(null);
  const [savingNote, setSavingNote] = useState(false);
  const [saveError, setSaveError] = useState(null);

  // fetch flat initiatives list for the picker
  useEffect(() => {
    api.get('/initiatives').then(r => setInitiatives((r.data || []).filter(i => !i.parentId))).catch(() => {});
  }, []);

  const fetchActionItems = useCallback(async (email) => {
    if (!email) return;
    setActionLoadingId(email.messageId);
    setActionError(null);
    try {
      const res = await api.post('/ai/action-items', {
        subject:  email.subject,
        text:     email.text,
        userName: user?.name || 'me',
      });
      setActionItemsMap(prev => ({ ...prev, [email.messageId]: res.data }));
    } catch (e) {
      setActionError(e.response?.data?.error || 'Failed to extract action items');
    } finally {
      setActionLoadingId(null);
    }
  }, [user]);

  const openSaveDialog = useCallback(() => {
    if (!selected) return;
    // Pre-select the already-linked initiative if this note was saved before
    const existing = savedNotesMap[selected.messageId];
    setSaveSelectedInit(existing?.initiative || null);
    setSaveError(null);
    setSaveDialogOpen(true);
  }, [selected, savedNotesMap]);

  const handleSaveNote = useCallback(async () => {
    if (!selected) return;
    setSavingNote(true);
    setSaveError(null);
    try {
      const existing = savedNotesMap[selected.messageId];
      if (existing) {
        // Update the existing record's initiative link
        const r = await api.patch(`/meeting-notes/${existing.id}`, {
          initiativeId: saveSelectedInit?.id || null,
        });
        setSavedNotesMap(prev => ({ ...prev, [selected.messageId]: r.data }));
      } else {
        const r = await api.post('/meeting-notes', {
          subject:     selected.subject,
          fromEmail:   selected.from,
          date:        selected.date,
          body:        selected.text || '',
          initiativeId: saveSelectedInit?.id || null,
        });
        setSavedNotesMap(prev => ({ ...prev, [selected.messageId]: r.data }));
      }
      setSaveDialogOpen(false);
    } catch (e) {
      setSaveError(e.response?.data?.error || 'Failed to save meeting note');
    } finally {
      setSavingNote(false);
    }
  }, [selected, saveSelectedInit, savedNotesMap]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAvailableMailboxes([]);
    try {
      const res = await api.get('/gmail/meeting-notes', {
        params: { date, label },
      });
      setEmails(res.data.emails || []);
      setSelected(res.data.emails?.length > 0 ? res.data.emails[0] : null);
    } catch (e) {
      const errData = e.response?.data;
      setError(errData?.error || 'Failed to fetch emails from Gmail.');
      if (errData?.availableMailboxes) setAvailableMailboxes(errData.availableMailboxes);
      setEmails([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }, [date, label]);

  useEffect(() => { load(); }, [load]);

  const applyCustomLabel = () => {
    if (customLabel.trim()) {
      setLabel(customLabel.trim());
      setCustomLabel('');
    }
  };

  // ── layout ───────────────────────────────────────────────────────────────────
  return (    <>    <Box display="flex" height="100vh" overflow="hidden" bgcolor="#f8fafc">

      {/* ── Left panel ─────────────────────────────────────────────────────── */}
      <Box
        sx={{
          width: 300,
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid #e2e8f0',
          bgcolor: '#ffffff',
        }}
      >
        {/* Header */}
        <Box sx={{ px: 2.5, pt: 2.5, pb: 1.5 }}>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
            <Box display="flex" alignItems="center" gap={1}>
              <EventNote sx={{ color: '#6366f1', fontSize: 22 }} />
              <Typography variant="h6" fontWeight={700} fontSize="1rem">
                Meeting Notes
              </Typography>
            </Box>
            <Tooltip title="Refresh">
              <span>
                <IconButton size="small" onClick={load} disabled={loading}>
                  <Refresh fontSize="small" sx={{ color: '#6366f1' }} />
                </IconButton>
              </span>
            </Tooltip>
          </Box>

          {/* Date picker */}
          <TextField
            type="date"
            size="small"
            fullWidth
            value={date}
            onChange={(e) => setDate(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <CalendarMonth sx={{ fontSize: 16, color: '#94a3b8' }} />
                </InputAdornment>
              ),
            }}
            sx={{ mb: 2, '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.85rem' } }}
          />

          {/* Label filter */}
          <Box mb={1}>
            <Box display="flex" alignItems="center" gap={0.75} mb={1}>
              <LabelIcon sx={{ fontSize: 14, color: '#94a3b8' }} />
              <Typography variant="caption" color="text.secondary" fontWeight={600} letterSpacing={0.3}>
                GMAIL LABEL
              </Typography>
            </Box>

            {/* Preset label chips */}
            <Box display="flex" flexWrap="wrap" gap={0.75} mb={1}>
              {PRESET_LABELS.map((pl) => (
                <Chip
                  key={pl.label}
                  label={`${pl.icon} ${pl.label}`}
                  size="small"
                  onClick={() => setLabel(pl.label)}
                  sx={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    borderRadius: 2,
                    cursor: 'pointer',
                    bgcolor: label === pl.label ? '#6366f1' : '#f1f5f9',
                    color:   label === pl.label ? '#fff'     : '#475569',
                    border:  label === pl.label ? 'none'     : '1px solid #e2e8f0',
                    '&:hover': { bgcolor: label === pl.label ? '#4f46e5' : '#e2e8f0' },
                  }}
                />
              ))}
            </Box>

            {/* Custom label input */}
            <TextField
              size="small"
              fullWidth
              placeholder="Custom label name…"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyCustomLabel(); } }}
              InputProps={{
                endAdornment: customLabel ? (
                  <InputAdornment position="end">
                    <Button
                      size="small"
                      sx={{ minWidth: 0, px: 1, fontSize: '0.7rem', textTransform: 'none' }}
                      onClick={applyCustomLabel}
                    >
                      Apply
                    </Button>
                  </InputAdornment>
                ) : null,
              }}
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.82rem' } }}
            />

            {/* Active label indicator */}
            {!PRESET_LABELS.find(p => p.label === label) && (
              <Chip
                label={`✦ ${label}`}
                size="small"
                onDelete={() => setLabel('Gemini Notes')}
                sx={{ mt: 0.75, fontSize: '0.72rem', fontWeight: 600, bgcolor: '#6366f1', color: '#fff', borderRadius: 2 }}
              />
            )}
          </Box>
        </Box>

        <Divider />

        {/* Email list */}
        <Box sx={{ flex: 1, overflowY: 'auto' }}>
          {loading && (
            <Box display="flex" alignItems="center" justifyContent="center" py={6}>
              <CircularProgress size={28} sx={{ color: '#6366f1' }} />
            </Box>
          )}

          {!loading && error && (
            <Box px={2.5} py={3}>
              <Alert severity="error" sx={{ borderRadius: 2, fontSize: '0.8rem', mb: availableMailboxes.length > 0 ? 1.5 : 0 }}>
                {error}
              </Alert>
              {availableMailboxes.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.75}>
                    Your Gmail labels:
                  </Typography>
                  <Box display="flex" flexWrap="wrap" gap={0.5}>
                    {availableMailboxes.map((mb) => (
                      <Chip
                        key={mb}
                        label={mb}
                        size="small"
                        onClick={() => setLabel(mb)}
                        sx={{ fontSize: '0.68rem', cursor: 'pointer', borderRadius: 1.5,
                          bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e0e7ff' } }}
                      />
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {!loading && !error && emails.length === 0 && (
            <Box px={2.5} py={6} textAlign="center">
              <InboxOutlined sx={{ fontSize: 40, color: '#cbd5e1', mb: 1 }} />
              <Typography variant="body2" color="text.secondary" fontWeight={600}>No emails found</Typography>
              <Typography variant="caption" color="text.disabled">
                No emails in <strong>{label}</strong> on {format(new Date(date + 'T00:00:00'), 'MMM d, yyyy')}
              </Typography>
            </Box>
          )}

          {!loading && !error && emails.map((email) => {
            const active = selected?.messageId === email.messageId;
            return (
              <Box
                key={email.messageId}
                onClick={() => setSelected(email)}
                sx={{
                  px: 2.5, py: 1.75,
                  borderBottom: '1px solid #f1f5f9',
                  cursor: 'pointer',
                  bgcolor: active ? '#f0f0ff' : 'transparent',
                  borderLeft: active ? '3px solid #6366f1' : '3px solid transparent',
                  transition: 'all 0.1s',
                  '&:hover': { bgcolor: active ? '#f0f0ff' : '#f8fafc' },
                }}
              >
                {/* From */}
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: '#6366f1',
                      fontWeight: 600,
                      fontSize: '0.72rem',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: '65%',
                    }}
                  >
                    {email.from}
                  </Typography>
                  <Typography variant="caption" color="text.disabled" fontSize="0.7rem">
                    {timeAgo(email.date)}
                  </Typography>
                </Box>

                {/* Subject */}
                <Typography
                  variant="body2"
                  fontWeight={active ? 700 : 600}
                  sx={{
                    fontSize: '0.82rem',
                    color: '#1e293b',
                    mb: 0.4,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {email.subject}
                </Typography>

                {/* Snippet */}
                <Typography
                  variant="caption"
                  sx={{
                    color: '#94a3b8',
                    fontSize: '0.73rem',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    lineHeight: 1.45,
                  }}
                >
                  {email.snippet || '(no content)'}
                </Typography>
              </Box>
            );
          })}
        </Box>

        {/* Footer count */}
        {!loading && emails.length > 0 && (
          <Box px={2.5} py={1.25} sx={{ borderTop: '1px solid #f1f5f9' }}>
            <Typography variant="caption" color="text.disabled">
              {emails.length} email{emails.length !== 1 ? 's' : ''} · {label} · {format(new Date(date + 'T00:00:00'), 'MMM d, yyyy')}
            </Typography>
          </Box>
        )}
      </Box>

      {/* ── Right panel ────────────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* ── First-visit setup banner ──────────────────────────────────────── */}
        {showSetupBanner && (
          <Box sx={{
            mx: 3, mt: 2.5, mb: 0,
            p: 2, borderRadius: 2.5,
            bgcolor: '#eff6ff',
            border: '1px solid #bfdbfe',
            display: 'flex', alignItems: 'flex-start', gap: 1.5,
            flexShrink: 0,
          }}>
            <Box sx={{ fontSize: '1.3rem', lineHeight: 1, flexShrink: 0, mt: 0.1 }}>📬</Box>
            <Box flex={1}>
              <Typography fontWeight={700} sx={{ fontSize: '0.9rem', color: '#1d4ed8', mb: 0.4 }}>
                Setting up Meeting Notes
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', color: '#3b82f6', lineHeight: 1.6 }}>
                Meeting Notes pulls emails from a Gmail label and uses AI to extract action items.
                To get started:
              </Typography>
              <Box component="ol" sx={{ m: 0, mt: 0.75, pl: 2.5, fontSize: '0.8rem', color: '#1e40af', lineHeight: 1.9 }}>
                <li>Go to <strong>Setup → Gmail</strong> and connect your Google account.</li>
                <li>Create a Gmail label (e.g. <em>"Gemini Notes"</em>) and apply it to meeting emails.</li>
                <li>Optionally configure an AI provider in <strong>Setup → AI Model</strong> for action-item extraction.</li>
                <li>Come back here, pick a date and label, and hit <strong>Refresh</strong>.</li>
              </Box>
            </Box>
            <Tooltip title="Dismiss">
              <IconButton size="small" onClick={dismissSetupBanner} sx={{ color: '#93c5fd', flexShrink: 0, mt: -0.25 }}>
                <CheckCircle sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Box>
        )}

        {!selected ? (
          <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100%" gap={2}>
            <Email sx={{ fontSize: 64, color: '#e2e8f0' }} />
            <Typography variant="h6" color="text.secondary" fontWeight={600}>
              Select an email to read
            </Typography>
            <Typography variant="body2" color="text.disabled">
              {emails.length > 0
                ? 'Click any email on the left'
                : 'No emails loaded yet'}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ flex: 1, overflowY: 'auto', p: { xs: 2, sm: 4 }, maxWidth: 820, mx: 'auto', width: '100%' }}>
            {/* Subject + action-items button */}
            <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={2} mb={2}>
              <Typography variant="h5" fontWeight={700} color="#1e293b" lineHeight={1.3} flex={1}>
                {selected.subject}
              </Typography>
              <Tooltip title={actionItemsMap[selected.messageId] ? 'Refresh action items' : 'Extract action items with AI'}>
                <span>
                  <Button
                    size="small"
                    variant={actionItemsMap[selected.messageId] ? 'outlined' : 'contained'}
                    onClick={() => fetchActionItems(selected)}
                    disabled={actionLoadingId === selected.messageId}
                    startIcon={
                      actionLoadingId === selected.messageId
                        ? <CircularProgress size={12} sx={{ color: 'inherit' }} />
                        : <AutoFixHigh sx={{ fontSize: '14px !important' }} />
                    }
                    sx={{
                      flexShrink: 0,
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 600,
                      fontSize: '0.78rem',
                      whiteSpace: 'nowrap',
                      ...(actionItemsMap[selected.messageId] ? {
                        borderColor: '#6366f1', color: '#6366f1',
                        '&:hover': { bgcolor: '#f0f0ff', borderColor: '#4f46e5' },
                      } : {
                        bgcolor: '#6366f1',
                        '&:hover': { bgcolor: '#4f46e5' },
                      }),
                    }}
                  >
                    {actionLoadingId === selected.messageId ? 'Extracting…' : 'Action Items'}
                  </Button>
                </span>
              </Tooltip>
            </Box>

            {/* Meta row */}
            <Box
              sx={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 1.5,
                mb: 3,
                pb: 2.5,
                borderBottom: '1px solid #e2e8f0',
                alignItems: 'center',
              }}
            >
              <Chip
                icon={<Email sx={{ fontSize: '14px !important' }} />}
                label={selected.from}
                size="small"
                sx={{ bgcolor: '#f0f0ff', color: '#4338ca', borderRadius: 2, fontWeight: 600, fontSize: '0.75rem' }}
              />
              {selected.date && (
                <Chip
                  icon={<CalendarMonth sx={{ fontSize: '14px !important' }} />}
                  label={formatDate(selected.date)}
                  size="small"
                  sx={{ bgcolor: '#f0fdf4', color: '#166534', borderRadius: 2, fontSize: '0.75rem' }}
                />
              )}
              <Box sx={{ ml: 'auto' }}>
                {savedNotesMap[selected.messageId] ? (
                  <Box display="flex" alignItems="center" gap={0.75}>
                    <Chip
                      icon={<Bookmark sx={{ fontSize: '14px !important', color: '#059669 !important' }} />}
                      label={savedNotesMap[selected.messageId].initiative?.title || 'Saved (no initiative)'}
                      size="small"
                      sx={{ bgcolor: '#ecfdf5', color: '#065f46', borderRadius: 2, fontWeight: 600, fontSize: '0.75rem', border: '1px solid #a7f3d0' }}
                    />
                    <Tooltip title="Change initiative link">
                      <IconButton size="small" onClick={openSaveDialog} sx={{ color: '#94a3b8', '&:hover': { color: '#6366f1' } }}>
                        <Edit sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                ) : (
                  <Tooltip title="Save this email and link it to an initiative">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<BookmarkAdd sx={{ fontSize: '15px !important' }} />}
                      onClick={openSaveDialog}
                      sx={{
                        borderRadius: 2, textTransform: 'none', fontWeight: 600,
                        fontSize: '0.75rem', borderColor: '#c7d2fe', color: '#6366f1',
                        '&:hover': { bgcolor: '#f0f0ff', borderColor: '#6366f1' },
                      }}
                    >
                      Save to Initiative
                    </Button>
                  </Tooltip>
                )}
              </Box>
            </Box>

            {/* Action items panel */}
            {actionError && (
              <Alert severity="error" sx={{ mb: 2, borderRadius: 2, fontSize: '0.8rem' }} onClose={() => setActionError(null)}>
                {actionError}
              </Alert>
            )}
            {actionItemsMap[selected.messageId] && (
              <ActionItemsPanel
                data={actionItemsMap[selected.messageId]}
                userName={user?.name || 'me'}
              />
            )}

            {/* Body */}
            <Box>
              {selected.text
                ? renderEmailBody(selected.text)
                : (
                  <Typography variant="body2" color="text.secondary" fontStyle="italic">
                    (No text content in this email)
                  </Typography>
                )}
            </Box>

            {/* Nav arrows */}
            {emails.length > 1 && (
              <Box display="flex" gap={1.5} mt={4} pt={3} borderTop="1px solid #f1f5f9">
                <Button
                  size="small"
                  variant="outlined"
                  disabled={emails.indexOf(selected) === 0}
                  onClick={() => setSelected(emails[emails.indexOf(selected) - 1])}
                  sx={{ borderRadius: 2, textTransform: 'none' }}
                >
                  ← Newer
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  disabled={emails.indexOf(selected) === emails.length - 1}
                  onClick={() => setSelected(emails[emails.indexOf(selected) + 1])}
                  sx={{ borderRadius: 2, textTransform: 'none' }}
                >
                  Older →
                </Button>
                <Typography variant="caption" color="text.secondary" sx={{ ml: 'auto', alignSelf: 'center' }}>
                  {emails.indexOf(selected) + 1} / {emails.length}
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Box>

      {/* Save to Initiative dialog */}
      <Dialog open={saveDialogOpen} onClose={() => setSaveDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Save Meeting Note</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
          <Typography variant="body2" color="text.secondary" noWrap>
            <strong>{selected?.subject}</strong>
          </Typography>
          <Autocomplete
            options={initiatives}
            getOptionLabel={(opt) => opt.title || ''}
            value={saveSelectedInit}
            onChange={(_, val) => setSaveSelectedInit(val)}
            isOptionEqualToValue={(opt, val) => opt.id === val?.id}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Link to Initiative (optional)"
                size="small"
                placeholder="Search initiatives…"
                helperText="Leave blank to save without linking to an initiative"
              />
            )}
            renderOption={(props, opt) => (
              <Box component="li" {...props} key={opt.id} sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <Box sx={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, mt: '6px',
                  bgcolor: opt.status === 'IN_PROGRESS' ? '#3b82f6' : opt.status === 'COMPLETED' ? '#10b981' :
                           opt.status === 'BLOCKED' ? '#ef4444' : '#94a3b8' }} />
                <Box>
                  <Typography variant="body2" fontWeight={500}>{opt.title}</Typography>
                  {opt.type && <Typography variant="caption" color="text.disabled">{opt.type}</Typography>}
                </Box>
              </Box>
            )}
          />
          {saveError && <Alert severity="error" sx={{ borderRadius: 2 }}>{saveError}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setSaveDialogOpen(false)} variant="outlined" sx={{ borderRadius: 2, textTransform: 'none' }}>Cancel</Button>
          <Button
            onClick={handleSaveNote}
            variant="contained"
            disabled={savingNote}
            startIcon={savingNote ? <CircularProgress size={14} /> : <BookmarkAdd />}
            sx={{ borderRadius: 2, textTransform: 'none', bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
          >
            {savingNote ? 'Saving…' : savedNotesMap[selected?.messageId] ? 'Update' : 'Save Note'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
