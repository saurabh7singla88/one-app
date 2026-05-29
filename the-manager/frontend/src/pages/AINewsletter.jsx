import { useEffect, useState, useCallback } from 'react';
import {
  Box, Typography, IconButton, Chip, CircularProgress,
  Divider, Tooltip, TextField, InputAdornment, Alert,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, useTheme,
} from '@mui/material';
import {
  Refresh, Email, CalendarMonth, InboxOutlined,
  AutoAwesome, ContentCopy, Done, FeedOutlined,
} from '@mui/icons-material';
import { format, isToday, parseISO } from 'date-fns';
import api from '../api/axios';

const ACCENT      = '#0891b2';   // cyan-600
const ACCENT_DARK = '#0e7490';
const ACCENT_BG   = '#ecfeff';
const ACCENT_BORDER = '#a5f3fc';

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

function renderEmailBody(text) {
  if (!text) return null;
  return text.split(/\n{2,}/).map((para, i) => (
    <Typography
      key={i}
      variant="body2"
      sx={{ mb: 1.5, lineHeight: 1.8, color: 'text.primary', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
    >
      {para.trim()}
    </Typography>
  ));
}

// ── Summary dialog content ────────────────────────────────────────────────────
function SummaryPanel({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <Box>
      <Box display="flex" justifyContent="flex-end" mb={1}>
        <Tooltip title={copied ? 'Copied!' : 'Copy summary'}>
          <IconButton size="small" onClick={handleCopy} sx={{ color: ACCENT }}>
            {copied ? <Done sx={{ fontSize: 17 }} /> : <ContentCopy sx={{ fontSize: 17 }} />}
          </IconButton>
        </Tooltip>
      </Box>
      {text.split(/\n{2,}/).map((para, i) => (
        <Typography key={i} variant="body2" sx={{ mb: 1.5, lineHeight: 1.75, whiteSpace: 'pre-wrap', color: 'text.primary' }}>
          {para}
        </Typography>
      ))}
    </Box>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
const GMAIL_LABEL = 'AI Newsletter';

export default function AINewsletter() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const accentBg = isDark ? 'rgba(8,145,178,0.12)' : ACCENT_BG;
  const today = format(new Date(), 'yyyy-MM-dd');

  const [date, setDate]         = useState(today);
  const [emails, setEmails]     = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [availableMailboxes, setAvailableMailboxes] = useState([]);

  // per-email summary state
  const [summaryMap, setSummaryMap]     = useState({});     // { [messageId]: string }
  const [summaryLoadingId, setSummaryLoadingId] = useState(null);
  const [summaryError, setSummaryError] = useState(null);

  // summarize-all dialog
  const [allSummaryOpen, setAllSummaryOpen]     = useState(false);
  const [allSummaryText, setAllSummaryText]     = useState('');
  const [allSummaryLoading, setAllSummaryLoading] = useState(false);
  const [allSummaryError, setAllSummaryError]   = useState(null);

  // ── fetch emails ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAvailableMailboxes([]);
    try {
      const res = await api.get('/gmail/meeting-notes', {
        params: { date, label: GMAIL_LABEL },
      });
      const mails = res.data.emails || [];
      setEmails(mails);
      setSelected(mails.length > 0 ? mails[0] : null);
    } catch (e) {
      const errData = e.response?.data;
      setError(errData?.error || 'Failed to fetch emails from Gmail.');
      if (errData?.availableMailboxes) setAvailableMailboxes(errData.availableMailboxes);
      setEmails([]);
      setSelected(null);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { load(); }, [load]);

  // ── summarize single email ──────────────────────────────────────────────────
  const fetchSummary = useCallback(async (email) => {
    if (!email) return;
    setSummaryLoadingId(email.messageId);
    setSummaryError(null);
    try {
      const res = await api.post('/ai/summarize-meetings', {
        initiativeTitle: email.subject,
        type: 'newsletter',
        notes: [{
          subject: email.subject,
          date:    email.date,
          fromEmail: email.from,
          body:    email.text || '',
        }],
      });
      setSummaryMap(prev => ({ ...prev, [email.messageId]: res.data.summary }));
    } catch (e) {
      setSummaryError(e.response?.data?.error || 'AI summarization failed.');
    } finally {
      setSummaryLoadingId(null);
    }
  }, []);

  // ── summarize all loaded emails ─────────────────────────────────────────────
  const summarizeAll = useCallback(async () => {
    if (emails.length === 0) return;
    setAllSummaryLoading(true);
    setAllSummaryError(null);
    setAllSummaryText('');
    setAllSummaryOpen(true);
    try {
      const res = await api.post('/ai/summarize-meetings', {
        initiativeTitle: `AI Newsletter — ${format(new Date(date + 'T00:00:00'), 'MMM d, yyyy')}`,
        type: 'newsletter',
        notes: emails.map(e => ({
          subject:   e.subject,
          date:      e.date,
          fromEmail: e.from,
          body:      e.text || '',
        })),
      });
      setAllSummaryText(res.data.summary || '');
    } catch (e) {
      setAllSummaryError(e.response?.data?.error || 'Failed to summarize newsletters.');
    } finally {
      setAllSummaryLoading(false);
    }
  }, [emails, date]);

  // ── layout ──────────────────────────────────────────────────────────────────
  return (
    <>
      <Box display="flex" height="100vh" overflow="hidden" bgcolor={isDark ? 'background.default' : '#f0fdff'}>

        {/* ── Left panel ───────────────────────────────────────────────────── */}
        <Box sx={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderRight: `1px solid ${theme.palette.divider}`, bgcolor: 'background.paper' }}>

          {/* Header */}
          <Box sx={{ px: 2.5, pt: 2.5, pb: 1.5 }}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
              <Box display="flex" alignItems="center" gap={1}>
                <FeedOutlined sx={{ color: ACCENT, fontSize: 22 }} />
                <Typography variant="h6" fontWeight={700} fontSize="1rem">
                  AI Newsletter
                </Typography>
              </Box>
              <Box display="flex" alignItems="center" gap={0.5}>
                {emails.length > 0 && (
                  <Tooltip title={`Summarize all ${emails.length} newsletters with AI`}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<AutoAwesome sx={{ fontSize: '13px !important' }} />}
                      onClick={summarizeAll}
                      sx={{
                        borderColor: ACCENT_BORDER, color: ACCENT, fontWeight: 600,
                        fontSize: '0.7rem', borderRadius: 2, px: 1, py: 0.3, textTransform: 'none',
                        '&:hover': { borderColor: ACCENT, bgcolor: accentBg },
                      }}
                    >
                      Summarize All ({emails.length})
                    </Button>
                  </Tooltip>
                )}
                <Tooltip title="Refresh">
                  <span>
                    <IconButton size="small" onClick={load} disabled={loading}>
                      <Refresh fontSize="small" sx={{ color: ACCENT }} />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
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
              sx={{ mb: 1.5, '& .MuiOutlinedInput-root': { borderRadius: 2, fontSize: '0.85rem' } }}
            />

            <Chip
              label={`📰 ${GMAIL_LABEL}`}
              size="small"
              sx={{ fontSize: '0.72rem', fontWeight: 600, borderRadius: 2,
                bgcolor: accentBg, color: ACCENT, border: `1px solid ${isDark ? 'rgba(8,145,178,0.3)' : ACCENT_BORDER}` }}
            />
          </Box>

          <Divider />

          {/* Email list */}
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            {loading && (
              <Box display="flex" alignItems="center" justifyContent="center" py={6}>
                <CircularProgress size={28} sx={{ color: ACCENT }} />
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
                      Available Gmail labels:
                    </Typography>
                    <Box display="flex" flexWrap="wrap" gap={0.5}>
                      {availableMailboxes.map((mb) => (
                        <Chip key={mb} label={mb} size="small"
                          sx={{ fontSize: '0.68rem', cursor: 'default', borderRadius: 1.5, bgcolor: isDark ? 'rgba(255,255,255,0.08)' : '#f1f5f9' }} />
                      ))}
                    </Box>
                  </Box>
                )}
              </Box>
            )}

            {!loading && !error && emails.length === 0 && (
              <Box px={2.5} py={6} textAlign="center">
                <InboxOutlined sx={{ fontSize: 40, color: '#cbd5e1', mb: 1 }} />
                <Typography variant="body2" color="text.secondary" fontWeight={600}>No newsletters found</Typography>
                <Typography variant="caption" color="text.disabled">
                  No emails in <strong>{GMAIL_LABEL}</strong> on {format(new Date(date + 'T00:00:00'), 'MMM d, yyyy')}
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
                    bgcolor: active ? accentBg : 'transparent',
                    borderLeft: active ? `3px solid ${ACCENT}` : '3px solid transparent',
                    transition: 'all 0.1s',
                    '&:hover': { bgcolor: active ? accentBg : (isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc') },
                  }}
                >
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                    <Typography variant="caption" sx={{ color: ACCENT, fontWeight: 600, fontSize: '0.72rem',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '65%' }}>
                      {email.from}
                    </Typography>
                    <Typography variant="caption" color="text.disabled" fontSize="0.7rem">
                      {timeAgo(email.date)}
                    </Typography>
                  </Box>
                  <Typography variant="body2" fontWeight={active ? 700 : 600}
                    sx={{ fontSize: '0.82rem', color: 'text.primary', mb: 0.4,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {email.subject}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#94a3b8', fontSize: '0.73rem',
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden', lineHeight: 1.45 }}>
                    {email.snippet || '(no content)'}
                  </Typography>
                </Box>
              );
            })}
          </Box>

          {!loading && emails.length > 0 && (
            <Box px={2.5} py={1.25} sx={{ borderTop: '1px solid #f1f5f9' }}>
              <Typography variant="caption" color="text.disabled">
                {emails.length} newsletter{emails.length !== 1 ? 's' : ''} · {format(new Date(date + 'T00:00:00'), 'MMM d, yyyy')}
              </Typography>
            </Box>
          )}
        </Box>

        {/* ── Right panel ──────────────────────────────────────────────────── */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selected ? (
            <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100%" gap={2}>
              <FeedOutlined sx={{ fontSize: 64, color: '#a5f3fc' }} />
              <Typography variant="h6" color="text.secondary" fontWeight={600}>
                Select a newsletter to read
              </Typography>
              <Typography variant="body2" color="text.disabled">
                {emails.length > 0 ? 'Click any email on the left' : 'No newsletters loaded yet'}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ flex: 1, overflowY: 'auto', p: { xs: 2, sm: 4 }, maxWidth: 820, mx: 'auto', width: '100%' }}>
              {/* Title + summarize button */}
              <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={2} mb={2}>
                <Typography variant="h5" fontWeight={700} color="text.primary" lineHeight={1.3} flex={1}>
                  {selected.subject}
                </Typography>
                <Tooltip title={summaryMap[selected.messageId] ? 'Refresh summary' : 'Summarize this newsletter with AI'}>
                  <span>
                    <Button
                      size="small"
                      variant={summaryMap[selected.messageId] ? 'outlined' : 'contained'}
                      onClick={() => fetchSummary(selected)}
                      disabled={summaryLoadingId === selected.messageId}
                      startIcon={
                        summaryLoadingId === selected.messageId
                          ? <CircularProgress size={12} sx={{ color: 'inherit' }} />
                          : <AutoAwesome sx={{ fontSize: '14px !important' }} />
                      }
                      sx={{
                        flexShrink: 0, borderRadius: 2, textTransform: 'none',
                        fontWeight: 600, fontSize: '0.78rem', whiteSpace: 'nowrap',
                        ...(summaryMap[selected.messageId] ? {
                          borderColor: ACCENT, color: ACCENT,
                          '&:hover': { bgcolor: ACCENT_BG, borderColor: ACCENT_DARK },
                        } : {
                          bgcolor: ACCENT, '&:hover': { bgcolor: ACCENT_DARK },
                        }),
                      }}
                    >
                      {summaryLoadingId === selected.messageId ? 'Summarizing…' : 'Summarize'}
                    </Button>
                  </span>
                </Tooltip>
              </Box>

              {/* Meta row */}
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 3, pb: 2.5, borderBottom: '1px solid #e2e8f0' }}>
                <Chip
                  icon={<Email sx={{ fontSize: '14px !important' }} />}
                  label={selected.from}
                  size="small"
                  sx={{ bgcolor: accentBg, color: ACCENT_DARK, borderRadius: 2, fontWeight: 600, fontSize: '0.75rem' }}
                />
                {selected.date && (
                  <Chip
                    icon={<CalendarMonth sx={{ fontSize: '14px !important' }} />}
                    label={formatDate(selected.date)}
                    size="small"
                    sx={{ bgcolor: isDark ? 'rgba(16,185,129,0.12)' : '#f0fdf4', color: isDark ? '#34d399' : '#166534', borderRadius: 2, fontSize: '0.75rem' }}
                  />
                )}
              </Box>

              {/* Summary error */}
              {summaryError && (
                <Alert severity="error" sx={{ mb: 2, borderRadius: 2, fontSize: '0.8rem' }} onClose={() => setSummaryError(null)}>
                  {summaryError}
                </Alert>
              )}

              {/* Inline summary */}
              {summaryMap[selected.messageId] && (
                <Box sx={{ mb: 3, p: 2.5, borderRadius: 2.5,
                  background: isDark ? `linear-gradient(135deg, rgba(8,145,178,0.12) 0%, rgba(6,182,212,0.08) 100%)` : 'linear-gradient(135deg, #ecfeff 0%, #cffafe 100%)',
                  border: `1px solid ${isDark ? 'rgba(8,145,178,0.3)' : ACCENT_BORDER}` }}>
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <AutoAwesome sx={{ fontSize: 15, color: ACCENT }} />
                      <Typography variant="caption" fontWeight={700} color={ACCENT_DARK} textTransform="uppercase" letterSpacing={0.5}>
                        AI Summary
                      </Typography>
                    </Box>
                    <Tooltip title="Dismiss summary">
                      <IconButton size="small" onClick={() => setSummaryMap(prev => { const n = {...prev}; delete n[selected.messageId]; return n; })}
                        sx={{ color: '#94a3b8', '&:hover': { color: ACCENT } }}>
                        <Done sx={{ fontSize: 15 }} />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.75, color: '#0e4f5c', fontSize: '0.85rem' }}>
                    {summaryMap[selected.messageId]}
                  </Typography>
                </Box>
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
                  <Button size="small" variant="outlined" disabled={emails.indexOf(selected) === 0}
                    onClick={() => setSelected(emails[emails.indexOf(selected) - 1])}
                    sx={{ borderRadius: 2, textTransform: 'none', borderColor: ACCENT_BORDER, color: ACCENT }}>
                    ← Newer
                  </Button>
                  <Button size="small" variant="outlined" disabled={emails.indexOf(selected) === emails.length - 1}
                    onClick={() => setSelected(emails[emails.indexOf(selected) + 1])}
                    sx={{ borderRadius: 2, textTransform: 'none', borderColor: ACCENT_BORDER, color: ACCENT }}>
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

      {/* Summarize All dialog */}
      <Dialog open={allSummaryOpen} onClose={() => !allSummaryLoading && setAllSummaryOpen(false)}
        maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
          <AutoAwesome sx={{ color: ACCENT, fontSize: 18 }} />
          AI Newsletter Summary
        </DialogTitle>
        <DialogContent sx={{ pt: '4px !important' }}>
          {allSummaryLoading && (
            <Box display="flex" alignItems="center" gap={1.5} py={3}>
              <CircularProgress size={20} sx={{ color: ACCENT }} />
              <Typography variant="body2" color="text.secondary">Summarizing {emails.length} newsletters…</Typography>
            </Box>
          )}
          {allSummaryError && (
            <Alert severity="error" sx={{ borderRadius: 2, mt: 1 }}>{allSummaryError}</Alert>
          )}
          {allSummaryText && <SummaryPanel text={allSummaryText} />}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button size="small" onClick={() => setAllSummaryOpen(false)} disabled={allSummaryLoading}
            sx={{ borderRadius: 2, textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
