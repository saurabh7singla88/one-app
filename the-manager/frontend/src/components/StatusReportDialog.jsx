import React, { useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, FormControl, InputLabel, Select, MenuItem,
  Box, Typography, CircularProgress, Chip, Divider,
  IconButton, Tooltip, TextField, ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import { Close, ContentCopy, Download, Assessment } from '@mui/icons-material';
import api from '../api/axios';

const PERIODS = [
  { value: 'week',       label: 'This Week' },
  { value: 'month',      label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'custom',     label: 'Custom Range' },
];

const PROVIDER_LABELS = { gemini: 'Gemini', openai: 'OpenAI', ollama: 'Ollama' };

export default function StatusReportDialog({ open, onClose, activeCanvasId, canvases = [] }) {
  const [period, setPeriod]     = useState('week');
  const [canvasId, setCanvasId] = useState(activeCanvasId ?? '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');
  const [loading, setLoading]   = useState(false);
  const [result, setResult]     = useState(null);   // { report, provider, period, metrics }
  const [error, setError]       = useState('');
  const [copied, setCopied]     = useState(false);

  // Reset when dialog opens with a new canvas
  React.useEffect(() => {
    if (open) {
      setCanvasId(activeCanvasId ?? '');
      setResult(null);
      setError('');
    }
  }, [open, activeCanvasId]);

  const handleGenerate = async () => {
    setLoading(true);
    setResult(null);
    setError('');
    try {
      const payload = { period };
      if (canvasId) payload.canvasId = canvasId;
      if (period === 'custom') {
        if (startDate) payload.startDate = startDate;
        if (endDate)   payload.endDate   = endDate;
      }
      const { data } = await api.post('/ai/status-report', payload);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate report. Check AI settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result?.report) return;
    navigator.clipboard.writeText(result.report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!result?.report) return;
    const blob = new Blob([result.report], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    const periodLabel = result.period?.replace(/\s+/g, '_') ?? period;
    a.download = `status_report_${periodLabel}_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { minHeight: 520 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1 }}>
        <Assessment fontSize="small" sx={{ color: 'primary.main' }} />
        <Typography variant="h6" component="span" sx={{ flex: 1 }}>Status Report Generator</Typography>
        <IconButton onClick={onClose} size="small"><Close fontSize="small" /></IconButton>
      </DialogTitle>

      <Divider />

      <DialogContent sx={{ pt: 2 }}>
        {/* ── Controls ─────────────────────────────────────── */}
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'flex-start', mb: 2 }}>
          {/* Period selector */}
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ mb: 0.5, display: 'block' }}>Period</Typography>
            <ToggleButtonGroup
              value={period}
              exclusive
              onChange={(_, v) => { if (v) setPeriod(v); }}
              size="small"
            >
              {PERIODS.map(p => (
                <ToggleButton key={p.value} value={p.value} sx={{ px: 1.5, textTransform: 'none', fontSize: 13 }}>
                  {p.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          {/* Canvas selector */}
          {canvases.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Canvas</InputLabel>
              <Select value={canvasId} label="Canvas" onChange={e => setCanvasId(e.target.value)}>
                <MenuItem value="">All Canvases</MenuItem>
                {canvases.map(c => (
                  <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        </Box>

        {/* Custom date range */}
        {period === 'custom' && (
          <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
            <TextField
              label="Start Date" type="date" size="small"
              value={startDate} onChange={e => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="End Date" type="date" size="small"
              value={endDate} onChange={e => setEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
            />
          </Box>
        )}

        {/* ── Error ─────────────────────────────────────────── */}
        {error && (
          <Box sx={{ bgcolor: 'error.dark', borderRadius: 1, p: 1.5, mb: 2 }}>
            <Typography variant="body2" color="error.contrastText">{error}</Typography>
          </Box>
        )}

        {/* ── Loading ───────────────────────────────────────── */}
        {loading && (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6, gap: 2 }}>
            <CircularProgress size={36} />
            <Typography variant="body2" color="text.secondary">Analyzing initiatives and generating report…</Typography>
          </Box>
        )}

        {/* ── Report output ─────────────────────────────────── */}
        {result && !loading && (
          <>
            {/* Top metrics strip */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              <Chip label={`Total: ${result.metrics.total}`} size="small" variant="outlined" />
              <Chip label={`Completed: ${result.metrics.completed}`} size="small" color="success" variant="outlined" />
              <Chip label={`In Progress: ${result.metrics.inProgress}`} size="small" color="info" variant="outlined" />
              {result.metrics.blocked > 0 &&
                <Chip label={`Blocked: ${result.metrics.blocked}`} size="small" color="error" variant="outlined" />}
              {result.metrics.critical > 0 &&
                <Chip label={`Critical Open: ${result.metrics.critical}`} size="small" color="warning" variant="outlined" />}
              <Chip
                label={PROVIDER_LABELS[result.provider] || result.provider}
                size="small"
                sx={{ bgcolor: 'primary.dark', color: 'primary.contrastText', ml: 'auto' }}
              />
            </Box>

            {/* Report text */}
            <Box
              sx={{
                bgcolor: 'background.default',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 1,
                p: 2,
                maxHeight: 380,
                overflowY: 'auto',
                fontFamily: '"Roboto Mono", monospace',
                fontSize: 13,
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {result.report}
            </Box>
          </>
        )}
      </DialogContent>

      <Divider />

      <DialogActions sx={{ px: 2, py: 1.5, gap: 1 }}>
        {result && (
          <>
            <Tooltip title={copied ? 'Copied!' : 'Copy to clipboard'}>
              <Button
                size="small" startIcon={<ContentCopy fontSize="small" />}
                onClick={handleCopy}
                color={copied ? 'success' : 'inherit'}
                sx={{ textTransform: 'none' }}
              >
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </Tooltip>
            <Tooltip title="Download as .txt">
              <Button
                size="small" startIcon={<Download fontSize="small" />}
                onClick={handleDownload}
                color="inherit"
                sx={{ textTransform: 'none' }}
              >
                Download
              </Button>
            </Tooltip>
            <Box sx={{ flex: 1 }} />
          </>
        )}
        <Button onClick={onClose} size="small" sx={{ textTransform: 'none' }}>Close</Button>
        <Button
          onClick={handleGenerate}
          variant="contained"
          size="small"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <Assessment fontSize="small" />}
          sx={{ textTransform: 'none' }}
        >
          {result ? 'Regenerate' : 'Generate Report'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
