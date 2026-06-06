import { useState, useEffect } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, TextField, Select, MenuItem,
  FormControl, InputLabel, Divider, CircularProgress, Alert,
  InputAdornment, IconButton, Chip, Autocomplete,
} from '@mui/material';
import { Settings, Visibility, VisibilityOff, CheckCircle, SmartToy } from '@mui/icons-material';
import api from '../api/axios';

const PROVIDERS = [
  { value: 'ollama',            label: 'Ollama (local)',         icon: '🦙', desc: 'Free, runs locally. No API key needed.' },
  { value: 'openai',   label: 'OpenAI / ChatGPT', icon: '✨', desc: 'GPT-4o, GPT-4o-mini, etc. Requires API key.' },
  { value: 'gemini',   label: 'Google Gemini',    icon: '♊', desc: 'Gemini 1.5 / 2.0 / 2.5 / 3. Requires API key.' },
  { value: 'disabled', label: 'Disabled',         icon: '🚫', desc: 'Use structural scoring only, no LLM analysis.' },
];

const OPENAI_MODELS   = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
const GEMINI_MODELS   = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
];
const OLLAMA_DEFAULTS = ['llama3.1:latest', 'llama3.2:latest', 'mistral:latest', 'phi3:latest', 'gemma2:latest'];

export default function AISettingsDialog({ open, onClose, onSaved }) {
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState('');
  const [showOpenAIKey, setShowOpenAIKey] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);

  const [form, setForm] = useState({
    provider:       'ollama',
    ollamaBaseUrl:  'http://localhost:11434',
    ollamaModel:    'llama3.1:latest',
    openaiBaseUrl:  'https://api.openai.com',
    openaiModel:    'gpt-4o-mini',
    openaiApiKey:   '',
    geminiModel:    'gemini-1.5-flash',
    geminiApiKey:   '',
  });

  // Track whether server already has a key set (so we don't require re-entry)
  const [keyStatus, setKeyStatus] = useState({ openai: false, gemini: false });

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError('');
    setSaved(false);
    api.get('/ai/settings')
      .then(r => {
        const d = r.data;
        setForm(f => ({
          ...f,
          provider:      d.provider      || 'ollama',
          ollamaBaseUrl: d.ollamaBaseUrl  || 'http://localhost:11434',
          ollamaModel:   d.ollamaModel    || 'llama3.1:latest',
          openaiBaseUrl: d.openaiBaseUrl  || 'https://api.openai.com',
          openaiModel:   d.openaiModel    || 'gpt-4o-mini',
          openaiApiKey:  '',   // never pre-fill the raw key
          geminiModel:   d.geminiModel    || 'gemini-1.5-flash',
          geminiApiKey:  '',
        }));
        setKeyStatus({ openai: !!d.openaiApiKeySet, gemini: !!d.geminiApiKeySet });
      })
      .catch(() => setError('Failed to load settings.'))
      .finally(() => setLoading(false));
  }, [open]);

  const set = (field) => (e) => {
    setForm(f => ({ ...f, [field]: e.target.value }));
    setSaved(false);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await api.put('/ai/settings', form);
      setSaved(true);
      setKeyStatus({
        openai: form.openaiApiKey ? true : keyStatus.openai,
        gemini: form.geminiApiKey ? true : keyStatus.gemini,
      });
      onSaved?.();
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const provider = form.provider;
  const selectedProviderMeta = PROVIDERS.find(p => p.value === provider);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 700, pb: 1 }}>
        <SmartToy fontSize="small" sx={{ color: '#7c3aed' }} />
        AI Model Settings
      </DialogTitle>
      <Divider />
      <DialogContent sx={{ pt: 2.5 }}>
        {loading ? (
          <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
        ) : (
          <Box display="flex" flexDirection="column" gap={2.5}>

            {/* Provider selector */}
            <FormControl fullWidth>
              <InputLabel>AI Provider</InputLabel>
              <Select value={provider} label="AI Provider" onChange={set('provider')}>
                {PROVIDERS.map(p => (
                  <MenuItem key={p.value} value={p.value}>
                    <Box display="flex" alignItems="center" gap={1.5}>
                      <Typography sx={{ fontSize: '1.1rem', lineHeight: 1 }}>{p.icon}</Typography>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{p.label}</Typography>
                        <Typography variant="caption" color="text.secondary">{p.desc}</Typography>
                      </Box>
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {selectedProviderMeta && provider !== 'disabled' && (
              <Box sx={{ bgcolor: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 2, px: 2, py: 1.25 }}>
                <Typography variant="caption" color="#7c3aed" fontWeight={600}>
                  {selectedProviderMeta.icon} {selectedProviderMeta.label} — {selectedProviderMeta.desc}
                </Typography>
              </Box>
            )}

            {/* ── Ollama fields ── */}
            {(provider === 'ollama') && (
              <>
                <TextField
                  label="Ollama Base URL"
                  value={form.ollamaBaseUrl}
                  onChange={set('ollamaBaseUrl')}
                  fullWidth
                  size="small"
                  helperText="Default: http://localhost:11434"
                />
                <TextField
                  label="Model"
                  value={form.ollamaModel}
                  onChange={set('ollamaModel')}
                  fullWidth size="small"
                  helperText={`e.g. ${OLLAMA_DEFAULTS.join(', ')}`}
                  select={false}
                />
              </>
            )}

            {/* ── OpenAI fields ── */}
            {(provider === 'openai') && (
              <>
                <TextField
                  label="API Key"
                  type={showOpenAIKey ? 'text' : 'password'}
                  value={form.openaiApiKey}
                  onChange={set('openaiApiKey')}
                  fullWidth size="small"
                  placeholder={keyStatus.openai ? 'Key already saved — paste new key to replace' : 'sk-...'}
                  helperText={keyStatus.openai ? '✓ API key is set' : 'Get yours at platform.openai.com/api-keys'}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShowOpenAIKey(v => !v)}>
                          {showOpenAIKey ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <Autocomplete
                  freeSolo
                  size="small"
                  options={OPENAI_MODELS}
                  value={form.openaiModel}
                  onChange={(_, v) => v && set('openaiModel')({ target: { value: v } })}
                  onInputChange={(_, v) => set('openaiModel')({ target: { value: v } })}
                  renderInput={(params) => (
                    <TextField {...params} label="Model" fullWidth helperText="Pick from list or type any model name" />
                  )}
                />
              </>
            )}

            {/* ── Gemini fields ── */}
            {(provider === 'gemini') && (
              <>
                <TextField
                  label="API Key"
                  type={showGeminiKey ? 'text' : 'password'}
                  value={form.geminiApiKey}
                  onChange={set('geminiApiKey')}
                  fullWidth size="small"
                  placeholder={keyStatus.gemini ? 'Key already saved — paste new key to replace' : 'AIza...'}
                  helperText={keyStatus.gemini ? '✓ API key is set' : 'Get yours at aistudio.google.com/app/apikey'}
                  InputProps={{
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShowGeminiKey(v => !v)}>
                          {showGeminiKey ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
                <Autocomplete
                  freeSolo
                  size="small"
                  options={GEMINI_MODELS}
                  value={form.geminiModel}
                  onChange={(_, v) => v && set('geminiModel')({ target: { value: v } })}
                  onInputChange={(_, v) => set('geminiModel')({ target: { value: v } })}
                  renderInput={(params) => (
                    <TextField {...params} label="Model" fullWidth helperText="Pick from list or type any model name" />
                  )}
                />
              </>
            )}

            {provider === 'disabled' && (
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                LLM analysis will be skipped. Initiatives will still be ranked using structural signals
                (priority, due date, staleness, blocked sub-items, etc.).
              </Alert>
            )}

            {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button size="small" onClick={onClose} sx={{ color: 'text.secondary' }}>Close</Button>
        <Button
          size="small" variant="contained"
          disabled={loading || saving}
          startIcon={saved ? <CheckCircle fontSize="small" /> : saving ? <CircularProgress size={14} /> : <Settings fontSize="small" />}
          onClick={handleSave}
          sx={{ bgcolor: saved ? 'success.main' : undefined, '&:hover': { bgcolor: saved ? 'success.dark' : undefined } }}
        >
          {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Settings'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
