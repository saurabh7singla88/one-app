import { useState, useEffect, useCallback } from 'react';
import { useTheme } from '@mui/material/styles';
import {
  Box, Typography, Button, TextField, Select, MenuItem,
  FormControl, InputLabel, Divider, CircularProgress, Alert,
  InputAdornment, IconButton, Chip, Paper, Link, Switch, FormControlLabel,
} from '@mui/material';
import {
  SmartToy, Visibility, VisibilityOff, CheckCircle, Save,
  Email, CheckCircleOutline, ErrorOutline, Launch, BugReport,
  SyncAlt, CloudOff, FeedOutlined, Groups, ToggleOn, EventNote,
  LockOutlined, LinkOff,
} from '@mui/icons-material';
import api from '../api/axios';

// ─── shared data ──────────────────────────────────────────────────────────────
const PROVIDERS = [
  { value: 'ollama',            label: 'Ollama (local)',        icon: '🦙', desc: 'Free, runs locally. No API key needed.' },
  { value: 'openai',            label: 'OpenAI / ChatGPT',      icon: '✨', desc: 'GPT-4o and friends. Requires API key.' },
  { value: 'gemini',            label: 'Google Gemini',         icon: '♊', desc: 'Gemini 2.5 / 3.x. Requires API key.' },
  { value: 'openai_compatible', label: 'OpenAI-compatible API', icon: '🔌', desc: 'LM Studio, Groq, Together AI, Mistral, etc.' },
  { value: 'disabled',          label: 'Disabled',              icon: '🚫', desc: 'Structural scoring only — no LLM analysis.' },
];

const OPENAI_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
const GEMINI_MODELS = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-pro-preview-03-25',
  'gemini-2.5-flash-preview-04-17',
  'gemini-3-flash-preview',
];
const OLLAMA_DEFAULTS = ['llama3.1:latest', 'llama3.2:latest', 'mistral:latest', 'phi3:latest', 'gemma2:latest'];

// ─── Features Section ────────────────────────────────────────────────────────
function FeaturesSection() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(null); // key being saved
  const [flags, setFlags]       = useState({ feature_team_board: false, feature_ai_newsletter: false, feature_meeting_notes: true });
  // Dependency config status
  const [jiraOk, setJiraOk]     = useState(null);
  const [aiOk,   setAiOk]       = useState(null);

  useEffect(() => {
    Promise.all([
      api.get('/features'),
      api.get('/jira/settings').catch(() => ({ data: {} })),
      api.get('/ai/settings').catch(() => ({ data: {} })),
    ]).then(([featRes, jiraRes, aiRes]) => {
      setFlags(featRes.data);
      setJiraOk(!!(jiraRes.data.apiTokenSet && jiraRes.data.baseUrl));
      const ai = aiRes.data;
      setAiOk(!!(ai.openaiApiKeySet || ai.geminiApiKeySet || ai.provider === 'ollama'));
    }).finally(() => setLoading(false));
  }, []);

  const toggle = async (key, value) => {
    setSaving(key);
    try {
      await api.put('/features', { [key]: value });
      setFlags(f => ({ ...f, [key]: value }));
      window.dispatchEvent(new CustomEvent('features-changed'));
    } catch { /* ignore */ }
    finally { setSaving(null); }
  };

  if (loading) return <Box display="flex" justifyContent="center" py={4}><CircularProgress size={24} /></Box>;

  const FeatureRow = ({ flagKey, label, description, icon, enabled, available, unavailableMsg, learnMorePath }) => (
    <Box
      sx={{
        display: 'flex', alignItems: 'flex-start', gap: 2, py: 2,
        borderBottom: '1px solid', borderBottomColor: isDark ? '#334155' : '#f1f5f9',
        '&:last-child': { borderBottom: 0 },
        opacity: (!available && !enabled) ? 0.6 : 1,
      }}
    >
      <Box sx={{ mt: 0.25, color: enabled ? '#6366f1' : 'text.disabled' }}>{icon}</Box>
      <Box sx={{ flex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="body1" fontWeight={600}>{label}</Typography>
          {enabled && <Chip label="Enabled" size="small" color="primary" sx={{ height: 20, fontSize: 10 }} />}
        </Box>
        <Typography variant="body2" color="text.secondary" mt={0.25}>{description}</Typography>
        {enabled && !available && (
          <Alert severity="warning" sx={{ mt: 1, py: 0.5, borderRadius: 2, fontSize: 12 }}>
            {unavailableMsg}
          </Alert>
        )}
        {!enabled && !available && (
          <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mt: 0.5 }}>
            {unavailableMsg}
          </Typography>
        )}
      </Box>
      <FormControlLabel
        control={
          <Switch
            checked={enabled}
            onChange={e => toggle(flagKey, e.target.checked)}
            disabled={saving === flagKey}
            color="primary"
          />
        }
        label=""
        sx={{ mr: 0 }}
      />
    </Box>
  );

  return (
    <Box>
      {/* ── Meeting Notes ── highlighted feature ──────────────────────────── */}
      <Box
        sx={{
          border: '1.5px solid', borderColor: isDark ? '#3730a3' : '#e0e7ff',
          borderRadius: 2.5,
          overflow: 'hidden',
          mb: 2,
          bgcolor: isDark ? 'background.paper' : (flags.feature_meeting_notes ? '#fafafe' : '#fafafa'),
          transition: 'background 0.2s',
        }}
      >
        {/* Toggle row */}
        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2, px: 2.5, pt: 2, pb: flags.feature_meeting_notes ? 1.5 : 2 }}>
          <Box sx={{ mt: 0.25, color: flags.feature_meeting_notes ? '#6366f1' : 'text.disabled' }}><EventNote /></Box>
          <Box sx={{ flex: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="body1" fontWeight={700}>Meeting Notes</Typography>
              {flags.feature_meeting_notes && <Chip label="Enabled" size="small" color="primary" sx={{ height: 20, fontSize: 10 }} />}
            </Box>
            <Typography variant="body2" color="text.secondary" mt={0.25}>
              Pulls emails from a Gmail label, extracts action items with AI, and links notes directly to your initiatives.
            </Typography>
          </Box>
          <FormControlLabel
            control={<Switch checked={flags.feature_meeting_notes} onChange={e => toggle('feature_meeting_notes', e.target.checked)} disabled={saving === 'feature_meeting_notes'} color="primary" />}
            label="" sx={{ mr: 0 }}
          />
        </Box>

        {/* Marketing callout — only when enabled */}
        {flags.feature_meeting_notes && (
          <Box
            sx={{
              mx: 2.5, mb: 2, px: 2, py: 1.5,
              bgcolor: isDark ? 'background.default' : 'white',
              border: '1px solid', borderColor: isDark ? '#3730a3' : '#e0e7ff',
              borderRadius: 2,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: 1.5,
            }}
          >
            {[
              { icon: '🔗', title: 'Link to initiatives', desc: 'Save any email as a meeting note and attach it to an initiative for full context.' },
              { icon: '⚡', title: 'AI action items',     desc: 'Instantly extract who needs to do what from any email thread.' },
              { icon: '📋', title: 'Concise view',        desc: 'Read long email chains as clean, scannable notes — no inbox clutter.' },
              { icon: '📅', title: 'Browse by date',      desc: 'Filter notes by day and Gmail label to find any meeting in seconds.' },
            ].map(({ icon, title, desc }) => (
              <Box key={title} display="flex" gap={1} alignItems="flex-start">
                <Box sx={{ fontSize: '1rem', lineHeight: 1, mt: 0.15, flexShrink: 0 }}>{icon}</Box>
                <Box>
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: isDark ? '#a5b4fc' : '#4338ca', lineHeight: 1.3 }}>{title}</Typography>
                  <Typography sx={{ fontSize: '0.72rem', color: 'text.secondary', lineHeight: 1.4, mt: 0.25 }}>{desc}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* ── Optional integrations divider ─────────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, mt: 1 }}>
        <Divider sx={{ flex: 1 }} />
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          Optional integrations
        </Typography>
        <Divider sx={{ flex: 1 }} />
      </Box>

      <FeatureRow
        flagKey="feature_ai_newsletter"
        label="AI Newsletter"
        description="Weekly digest of your initiatives, meeting notes, and tasks summarised by AI. Requires an AI provider to be configured."
        icon={<FeedOutlined />}
        enabled={flags.feature_ai_newsletter}
        available={!!aiOk}
        unavailableMsg="AI provider not configured — go to the AI Model section below to set one up."
      />
      <FeatureRow
        flagKey="feature_team_board"
        label="Team Board"
        description="JIRA-powered team allocation view showing sprint tickets, assignees, story points and past contributors."
        icon={<Groups />}
        enabled={flags.feature_team_board}
        available={!!jiraOk}
        unavailableMsg="JIRA integration not configured — go to the JIRA section below to add your credentials."
      />
    </Box>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ icon, title, subtitle, children }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  return (
    <Paper
      elevation={0}
      sx={{
        border: '1px solid', borderColor: 'divider', borderRadius: 3, overflow: 'hidden', mb: 3,
      }}
    >
      <Box sx={{ px: 3, py: 2.5, borderBottom: '1px solid', borderBottomColor: isDark ? '#334155' : '#f1f5f9', bgcolor: isDark ? 'background.default' : '#fafafa' }}>
        <Box display="flex" alignItems="center" gap={1.25}>
          {icon}
          <Box>
            <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>{title}</Typography>
            {subtitle && <Typography variant="caption" color="text.secondary">{subtitle}</Typography>}
          </Box>
        </Box>
      </Box>
      <Box sx={{ px: 3, py: 3 }}>{children}</Box>
    </Paper>
  );
}

// ─── AI Section ───────────────────────────────────────────────────────────────
function AISection() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState('');
  const [showOAIKey, setShowOAIKey]   = useState(false);
  const [showGemKey, setShowGemKey]   = useState(false);
  const [keyStatus, setKeyStatus]     = useState({ openai: false, gemini: false });

  const [form, setForm] = useState({
    provider: 'ollama',
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.1:latest',
    openaiBaseUrl: 'https://api.openai.com',
    openaiModel: 'gpt-4o-mini',
    openaiApiKey: '',
    geminiModel: 'gemini-2.5-flash-preview-04-17',
    geminiApiKey: '',
  });

  useEffect(() => {
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
          geminiModel:   d.geminiModel    || 'gemini-2.5-flash-preview-04-17',
        }));
        setKeyStatus({ openai: !!d.openaiApiKeySet, gemini: !!d.geminiApiKeySet });
      })
      .catch(() => setError('Failed to load AI settings.'))
      .finally(() => setLoading(false));
  }, []);

  const set = f => e => { setForm(p => ({ ...p, [f]: e.target.value })); setSaved(false); };

  const save = async () => {
    setSaving(true); setError('');
    try {
      await api.put('/ai/settings', form);
      setSaved(true);
      setKeyStatus({
        openai: form.openaiApiKey ? true : keyStatus.openai,
        gemini: form.geminiApiKey ? true : keyStatus.gemini,
      });
      setTimeout(() => setSaved(false), 3000);
    } catch { setError('Failed to save. Please try again.'); }
    finally { setSaving(false); }
  };

  const p = form.provider;
  const providerMeta = PROVIDERS.find(pr => pr.value === p);

  if (loading) return <Box display="flex" justifyContent="center" py={4}><CircularProgress size={28} /></Box>;

  return (
    <Box display="flex" flexDirection="column" gap={2.5}>
      {/* Provider grid */}
      <Box>
        <Typography variant="body2" fontWeight={600} color="text.secondary" mb={1.25}>
          AI Provider
        </Typography>
        <Box display="flex" flexWrap="wrap" gap={1}>
          {PROVIDERS.map(pr => (
            <Box
              key={pr.value}
              onClick={() => { setForm(f => ({ ...f, provider: pr.value })); setSaved(false); }}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1, px: 1.75, py: 1.25,
                border: `2px solid ${p === pr.value ? '#6366f1' : (isDark ? '#334155' : '#e2e8f0')}`,
                borderRadius: 2.5, cursor: 'pointer', minWidth: 160,
                bgcolor: p === pr.value ? (isDark ? 'rgba(99,102,241,0.15)' : '#f0f0ff') : 'transparent',
                transition: 'all 0.15s',
                '&:hover': { borderColor: '#6366f1', bgcolor: isDark ? 'rgba(99,102,241,0.12)' : '#f5f3ff' },
              }}
            >
              <Typography sx={{ fontSize: '1.2rem', lineHeight: 1 }}>{pr.icon}</Typography>
              <Box>
                <Typography variant="body2" fontWeight={p === pr.value ? 700 : 500} fontSize="0.82rem">
                  {pr.label}
                </Typography>
                <Typography variant="caption" color="text.secondary" fontSize="0.7rem" display="block">
                  {pr.desc}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      <Divider />

      {/* Provider-specific fields */}
      {p === 'ollama' && (
        <Box display="flex" flexDirection="column" gap={2}>
          <Typography variant="body2" color="text.secondary">
            Ollama runs locally — no API key needed. Install from{' '}
            <Link href="https://ollama.com" target="_blank" rel="noopener">ollama.com</Link>
            , then pull a model: <code>ollama pull llama3.1</code>
          </Typography>
          <Box display="flex" gap={2}>
            <TextField label="Base URL" value={form.ollamaBaseUrl} onChange={set('ollamaBaseUrl')}
              size="small" sx={{ flex: 2 }} helperText="Default: http://localhost:11434" />
            <TextField label="Model" value={form.ollamaModel} onChange={set('ollamaModel')}
              size="small" sx={{ flex: 2 }} helperText={`e.g. ${OLLAMA_DEFAULTS.slice(0, 3).join(', ')}`} />
          </Box>
        </Box>
      )}

      {p === 'openai' && (
        <Box display="flex" flexDirection="column" gap={2}>
          <Typography variant="body2" color="text.secondary">
            Get your API key at{' '}
            <Link href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">
              platform.openai.com/api-keys <Launch sx={{ fontSize: 12, verticalAlign: 'middle' }} />
            </Link>
          </Typography>
          <Box display="flex" gap={2}>
            <TextField
              label="API Key" type={showOAIKey ? 'text' : 'password'}
              value={form.openaiApiKey} onChange={set('openaiApiKey')}
              size="small" sx={{ flex: 3 }}
              placeholder={keyStatus.openai ? 'Paste new key to replace…' : 'sk-…'}
              helperText={keyStatus.openai ? '✓ Key is saved' : 'Required'}
              InputProps={{ endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowOAIKey(v => !v)}>
                    {showOAIKey ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              )}}
            />
            <FormControl size="small" sx={{ flex: 2 }}>
              <InputLabel>Model</InputLabel>
              <Select value={form.openaiModel} label="Model" onChange={set('openaiModel')}>
                {OPENAI_MODELS.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
        </Box>
      )}

      {p === 'openai_compatible' && (
        <Box display="flex" flexDirection="column" gap={2}>
          <Typography variant="body2" color="text.secondary">
            Works with LM Studio, Groq, Together AI, Mistral, or any OpenAI-compatible endpoint.
          </Typography>
          <TextField label="Base URL" value={form.openaiBaseUrl} onChange={set('openaiBaseUrl')}
            size="small" fullWidth
            helperText="e.g. http://localhost:1234 (LM Studio), https://api.groq.com, https://api.together.xyz" />
          <Box display="flex" gap={2}>
            <TextField
              label="API Key" type={showOAIKey ? 'text' : 'password'}
              value={form.openaiApiKey} onChange={set('openaiApiKey')}
              size="small" sx={{ flex: 2 }}
              placeholder={keyStatus.openai ? 'Paste new key to replace…' : 'API key or token'}
              helperText={keyStatus.openai ? '✓ Key is saved' : 'Leave blank if auth is not required'}
              InputProps={{ endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowOAIKey(v => !v)}>
                    {showOAIKey ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              )}}
            />
            <TextField label="Model name" value={form.openaiModel} onChange={set('openaiModel')}
              size="small" sx={{ flex: 2 }} helperText="As recognised by your endpoint" />
          </Box>
        </Box>
      )}

      {p === 'gemini' && (
        <Box display="flex" flexDirection="column" gap={2}>
          <Typography variant="body2" color="text.secondary">
            Get a free API key at{' '}
            <Link href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">
              aistudio.google.com/apikey <Launch sx={{ fontSize: 12, verticalAlign: 'middle' }} />
            </Link>
          </Typography>
          <Box display="flex" gap={2}>
            <TextField
              label="API Key" type={showGemKey ? 'text' : 'password'}
              value={form.geminiApiKey} onChange={set('geminiApiKey')}
              size="small" sx={{ flex: 3 }}
              placeholder={keyStatus.gemini ? 'Paste new key to replace…' : 'AIza…'}
              helperText={keyStatus.gemini ? '✓ Key is saved' : 'Required'}
              InputProps={{ endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowGemKey(v => !v)}>
                    {showGemKey ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              )}}
            />
            <FormControl size="small" sx={{ flex: 2 }}>
              <InputLabel>Model</InputLabel>
              <Select value={form.geminiModel} label="Model" onChange={set('geminiModel')}>
                {GEMINI_MODELS.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
        </Box>
      )}

      {p === 'disabled' && (
        <Alert severity="info" sx={{ borderRadius: 2 }}>
          LLM analysis is disabled. Initiatives will still be ranked using structural signals —
          priority, due dates, staleness, blocked sub-items, etc.
        </Alert>
      )}

      {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
      {saved  && <Alert severity="success" icon={<CheckCircle />} sx={{ borderRadius: 2 }}>Settings saved!</Alert>}

      <Box display="flex" justifyContent="flex-end">
        <Button
          variant="contained" onClick={save} disabled={saving || p === 'disabled'}
          startIcon={saving ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <Save fontSize="small" />}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
        >
          {saving ? 'Saving…' : 'Save AI Settings'}
        </Button>
      </Box>
    </Box>
  );
}

// ─── Gmail Section ────────────────────────────────────────────────────────────
function GmailSection() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [testing, setTesting]           = useState(false);
  const [testResult, setTestResult]     = useState(null);
  const [error, setError]               = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const [gmailUser, setGmailUser]     = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [gmailLabel, setGmailLabel]   = useState('Gemini Notes');
  const [gmailSearch, setGmailSearch] = useState('gemini');
  const [status, setStatus] = useState({ userSet: false, passwordSet: false, source: 'none', user: '' });

  useEffect(() => {
    api.get('/gmail/settings')
      .then(r => {
        setStatus(r.data);
        setGmailUser(r.data.user || '');
        setGmailLabel(r.data.label || 'Gemini Notes');
        setGmailSearch(r.data.search || 'gemini');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async () => {
    if (!gmailUser.trim()) { setError('Gmail address is required.'); return; }
    if (!appPassword.trim() && !status.passwordSet) { setError('App Password is required.'); return; }
    setSaving(true); setError(''); setSaved(false);
    try {
      const payload = {
        user: gmailUser.trim(),
        label: gmailLabel.trim() || 'Gemini Notes',
        search: gmailSearch.trim() || 'gemini',
      };
      if (appPassword.trim()) payload.appPassword = appPassword.trim();
      const r = await api.put('/gmail/settings', payload);
      setSaved(true);
      setStatus(s => ({ ...s, userSet: true, passwordSet: true, user: gmailUser.trim(), encrypted: r.data?.encrypted, source: 'db' }));
      setAppPassword('');
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  }, [gmailUser, appPassword, gmailLabel, gmailSearch, status.passwordSet]);

  const testConnection = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api.get('/gmail/test-config');
      setTestResult({ ok: true, user: r.data.user, encrypted: r.data.encrypted });
    } catch (e) {
      setTestResult({ ok: false, error: e.response?.data?.error || e.message });
    } finally {
      setTesting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setDisconnecting(true); setError('');
    try {
      await api.delete('/gmail/settings');
      setStatus({ userSet: false, passwordSet: false, source: 'none', user: '' });
      setGmailUser('');
      setAppPassword('');
      setTestResult(null);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setDisconnecting(false);
    }
  }, []);

  return (
    <Box display="flex" flexDirection="column" gap={3}>

      {/* ── What is an App Password ── */}
      <Alert
        severity="info"
        icon={<LockOutlined />}
        sx={{ borderRadius: 2, '& .MuiAlert-message': { width: '100%' } }}
      >
        <Typography variant="body2" fontWeight={700} mb={0.5}>
          This is not your Google Account password
        </Typography>
        <Typography variant="body2" sx={{ opacity: 0.9 }}>
          An App Password is a 16-character access key generated separately in your Google Account.
          Your main Google password is never entered here, and you can revoke this key at any time
          from your Google Account security settings.
        </Typography>
      </Alert>

      {/* ── How-to steps — always visible ── */}
      <Box sx={{ bgcolor: isDark ? 'background.default' : '#fafafa', border: '1px solid', borderColor: isDark ? '#334155' : '#e2e8f0', borderRadius: 2, px: 2.5, py: 2 }}>
        <Typography variant="body2" fontWeight={700} mb={1.5} color="text.primary">
          How to generate a Google App Password
        </Typography>
        {[
          {
            text: 'Enable 2-Step Verification on your Google Account (required first).',
            href: 'https://myaccount.google.com/security',
            linkLabel: 'Open Security settings',
          },
          {
            text: 'Go to App Passwords and create one — name it "One" or similar. Google shows a 16-character code.',
            href: 'https://myaccount.google.com/apppasswords',
            linkLabel: 'Open App Passwords',
          },
          {
            text: 'Paste the 16-character code into the field below and click Save.',
          },
        ].map((step, i) => (
          <Box key={i} display="flex" gap={1.5} mb={i < 2 ? 1.25 : 0} alignItems="flex-start">
            <Box
              sx={{
                width: 22, height: 22, borderRadius: '50%',
                bgcolor: '#6366f1', color: '#fff', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.7rem', fontWeight: 700, mt: 0.15,
              }}
            >
              {i + 1}
            </Box>
            <Typography variant="body2" color="text.secondary">
              {step.text}
              {step.href && (
                <>
                  {' '}
                  <Button
                    size="small" variant="text" endIcon={<Launch sx={{ fontSize: '0.75rem' }} />}
                    href={step.href} target="_blank" rel="noopener"
                    sx={{ textTransform: 'none', fontSize: '0.78rem', p: 0, minWidth: 0, verticalAlign: 'baseline', lineHeight: 'inherit' }}
                  >
                    {step.linkLabel}
                  </Button>
                </>
              )}
            </Typography>
          </Box>
        ))}
      </Box>

      {/* ── Credentials form ── */}
      {loading ? (
        <Box display="flex" justifyContent="center" py={2}><CircularProgress size={24} /></Box>
      ) : (
        <Box display="flex" flexDirection="column" gap={2}>
          {status.userSet && status.passwordSet && (
            <Alert severity="success" icon={<CheckCircleOutline />} sx={{ borderRadius: 2 }}>
              Connected as <strong>{status.user}</strong>
              {status.encrypted ? ' · encrypted ✓' : ''}
              {status.source === 'env' ? ' (from .env)' : ''}
            </Alert>
          )}

          <TextField
            label="Gmail address"
            type="email"
            size="small"
            value={gmailUser}
            onChange={e => setGmailUser(e.target.value)}
            placeholder="you@gmail.com"
            fullWidth
            autoComplete="new-password"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />

          <TextField
            label="App Password"
            type={showPassword ? 'text' : 'password'}
            size="small"
            value={appPassword}
            onChange={e => setAppPassword(e.target.value)}
            placeholder={status.passwordSet ? '••••••••••••••••  (leave blank to keep current)' : 'xxxx xxxx xxxx xxxx'}
            fullWidth
            autoComplete="new-password"
            helperText="The 16-character code from Google — not your Google account password"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowPassword(v => !v)} edge="end">
                    {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          {/* Security assurance badges */}
          <Box display="flex" gap={1} flexWrap="wrap">
            {[
              { icon: '🔒', label: 'AES-256 encrypted at rest' },
              { icon: '📧', label: 'Read-only IMAP access' },
              { icon: '🚫', label: 'Never logged or shared' },
              { icon: '🔑', label: 'Revoke anytime from Google' },
            ].map(b => (
              <Chip
                key={b.label}
                label={`${b.icon}  ${b.label}`}
                size="small"
                sx={{ bgcolor: isDark ? 'rgba(16,185,129,0.12)' : '#f0fdf4', color: isDark ? '#6ee7b7' : '#166534', border: '1px solid', borderColor: isDark ? 'rgba(16,185,129,0.3)' : '#bbf7d0', fontWeight: 500, fontSize: '0.7rem' }}
              />
            ))}
          </Box>

          <Divider sx={{ my: 0.5 }} />

          <TextField
            label="Gmail Label"
            size="small"
            value={gmailLabel}
            onChange={e => setGmailLabel(e.target.value)}
            placeholder="Gemini Notes"
            fullWidth
            helperText="Gmail label to fetch emails from (e.g. Gemini Notes, INBOX)"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />

          <TextField
            label="Search Filter"
            size="small"
            value={gmailSearch}
            onChange={e => setGmailSearch(e.target.value)}
            placeholder="gemini"
            fullWidth
            helperText="Used when no label is set — filters by sender or subject"
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
          />

          {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}

          <Box display="flex" gap={1.5} alignItems="center" flexWrap="wrap">
            <Button
              variant="contained"
              onClick={save}
              disabled={saving || (!gmailUser.trim() && !appPassword.trim())}
              startIcon={
                saving ? <CircularProgress size={14} sx={{ color: 'inherit' }} />
                : saved  ? <CheckCircle fontSize="small" />
                : <Save fontSize="small" />
              }
              sx={{
                borderRadius: 2, textTransform: 'none', fontWeight: 600,
                bgcolor: saved ? 'success.main' : undefined,
                '&:hover': { bgcolor: saved ? 'success.dark' : undefined },
              }}
            >
              {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Credentials'}
            </Button>

            <Button
              variant="outlined"
              onClick={testConnection}
              disabled={testing || (!status.userSet && !status.passwordSet)}
              startIcon={
                testing
                  ? <CircularProgress size={14} />
                  : testResult?.ok
                    ? <CheckCircleOutline sx={{ color: 'success.main' }} />
                    : <Email />
              }
              sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
            >
              {testing ? 'Testing…' : 'Test Connection'}
            </Button>

            {status.userSet && status.passwordSet && status.source !== 'env' && (
              <Button
                variant="outlined"
                color="error"
                onClick={disconnect}
                disabled={disconnecting}
                startIcon={disconnecting ? <CircularProgress size={14} /> : <LinkOff fontSize="small" />}
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, ml: 'auto' }}
              >
                {disconnecting ? 'Disconnecting…' : 'Disconnect Gmail'}
              </Button>
            )}
          </Box>

          {testResult && (
            <Alert
              severity={testResult.ok ? 'success' : 'error'}
              icon={testResult.ok ? <CheckCircleOutline /> : <ErrorOutline />}
              sx={{ borderRadius: 2 }}
            >
              {testResult.ok
                ? <>Connected as <strong>{testResult.user}</strong>{testResult.encrypted ? ' · encrypted ✓' : ''}</>
                : testResult.error
              }
            </Alert>
          )}
        </Box>
      )}
    </Box>
  );
}


// ─── JIRA Section ────────────────────────────────────────────────────────────
function JiraSection() {
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState('');
  const [showToken, setShowToken] = useState(false);

  const [form, setForm] = useState({ baseUrl: '', email: '', apiToken: '' });
  const [tokenSet, setTokenSet] = useState(false);

  useEffect(() => {
    api.get('/jira/settings')
      .then(r => {
        setForm(f => ({ ...f, baseUrl: r.data.baseUrl || '', email: r.data.email || '' }));
        setTokenSet(r.data.apiTokenSet);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (field) => (e) => {
    setForm(f => ({ ...f, [field]: e.target.value }));
    setSaved(false);
  };

  const save = async () => {
    if (!form.baseUrl.trim()) { setError('JIRA base URL is required.'); return; }
    if (!form.email.trim()) { setError('Email is required.'); return; }
    if (!form.apiToken.trim() && !tokenSet) { setError('API token is required.'); return; }
    setSaving(true); setError(''); setSaved(false);
    try {
      const r = await api.put('/jira/settings', form);
      setSaved(true);
      setTokenSet(r.data.apiTokenSet);
      setForm(f => ({ ...f, apiToken: '' }));
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Box display="flex" justifyContent="center" py={4}><CircularProgress size={28} /></Box>;

  return (
    <Box display="flex" flexDirection="column" gap={2.5}>
      <Alert severity="info" sx={{ borderRadius: 2 }}>
        Connect to your Atlassian instance to link <strong>JIRA tickets</strong> and <strong>Confluence pages</strong> with
        initiatives. The same credentials cover both products. Supports Cloud (<em>company.atlassian.net</em>)
        and Server/Data Center instances.
      </Alert>

      <TextField
        label="JIRA Base URL"
        size="small"
        fullWidth
        value={form.baseUrl}
        onChange={set('baseUrl')}
        placeholder="https://yourcompany.atlassian.net"
        helperText="For JIRA Cloud: https://yourcompany.atlassian.net  |  For Server: https://jira.yourcompany.com"
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
      />

      <TextField
        label="Email / Username"
        size="small"
        fullWidth
        value={form.email}
        onChange={set('email')}
        placeholder="you@company.com"
        helperText="For JIRA Cloud: your Atlassian email. For Server: your JIRA username."
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
      />

      <TextField
        label="API Token"
        type={showToken ? 'text' : 'password'}
        size="small"
        fullWidth
        value={form.apiToken}
        onChange={set('apiToken')}
        placeholder={tokenSet ? 'Paste new token to replace…' : 'Your API token or PAT'}
        helperText={
          tokenSet
            ? '✓ Token is saved'
            : 'For JIRA Cloud: create at id.atlassian.com/manage-profile/security/api-tokens  |  For Server: create a PAT'
        }
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton size="small" onClick={() => setShowToken(v => !v)}>
                {showToken ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
              </IconButton>
            </InputAdornment>
          ),
        }}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
      />

      {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
      {saved  && <Alert severity="success" icon={<CheckCircle />} sx={{ borderRadius: 2 }}>JIRA settings saved!</Alert>}

      <Box display="flex" justifyContent="flex-end">
        <Button
          variant="contained"
          onClick={save}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <Save fontSize="small" />}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
        >
          {saving ? 'Saving…' : 'Save JIRA Settings'}
        </Button>
      </Box>
    </Box>
  );
}

// ─── Turso Sync Section ───────────────────────────────────────────────────────
function TursoSection() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');
  const [showToken, setShowToken] = useState(false);
  const [form, setForm] = useState({ databaseUrl: '', authToken: '' });

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  useEffect(() => {
    api.get('/sync/status')
      .then(r => { setStatus(r.data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const save = async () => {
    setError(''); setSaving(true); setSaved(false);
    try {
      await api.post('/sync/config', form);
      setSaved(true);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save credentials.');
    } finally { setSaving(false); }
  };

  if (loading) return <CircularProgress size={24} />;

  // ── Connected via environment variables (Docker / server deployment) ──────
  // The database URL comes from TURSO_DATABASE_URL env var set at deploy time.
  // Credentials cannot be changed here — update your .env and rebuild.
  if (status?.configured) {
    return (
      <Box display="flex" flexDirection="column" gap={2}>
        <Alert severity="success" icon={<CheckCircleOutline />} sx={{ borderRadius: 2 }}>
          <strong>Connected</strong> — using database{' '}
          <code style={{ fontSize: '0.8em' }}>{status.databaseUrl}</code>
        </Alert>
        <Alert severity="info" icon={false} sx={{ borderRadius: 2, bgcolor: isDark ? 'background.default' : '#f8faff', border: '1px solid', borderColor: isDark ? '#334155' : '#e0e7ff' }}>
          <Typography variant="caption" color="text.secondary">
            The database connection is configured via environment variables (<code>TURSO_DATABASE_URL</code> / <code>TURSO_AUTH_TOKEN</code>).
            To change the database, update your <code>.env</code> file and run <code>npm run docker:build</code>.
          </Typography>
        </Alert>
      </Box>
    );
  }

  // ── Not configured — show setup form (Electron / local dev scenario) ──────
  return (
    <Box display="flex" flexDirection="column" gap={2.5}>
      <Alert severity="warning" icon={<CloudOff />} sx={{ borderRadius: 2 }}>
        No database configured. Add your Turso credentials below.
      </Alert>

      <Alert severity="info" icon={false} sx={{ borderRadius: 2, bgcolor: isDark ? 'background.default' : '#f8faff', border: '1px solid', borderColor: isDark ? '#334155' : '#e0e7ff' }}>
        <Typography variant="caption" color="text.secondary">
          Create a free database at{' '}
          <Link href="https://turso.tech" target="_blank" rel="noreferrer">turso.tech</Link>, then run:{' '}
          <code>turso db create one</code> and <code>turso db tokens create one</code>
          <br />The URL looks like: <code>libsql://one-yourname.turso.io</code>
        </Typography>
      </Alert>

      <TextField
        label="Turso Database URL" size="small" fullWidth
        value={form.databaseUrl} onChange={set('databaseUrl')}
        placeholder="libsql://your-db-name.turso.io"
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
      />
      <TextField
        label="Auth Token" type={showToken ? 'text' : 'password'} size="small" fullWidth
        value={form.authToken} onChange={set('authToken')}
        placeholder="Your Turso auth token"
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton size="small" onClick={() => setShowToken(v => !v)}>
                {showToken ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
              </IconButton>
            </InputAdornment>
          ),
        }}
        sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
      />

      {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
      {saved && (
        <Alert severity="success" icon={<CheckCircle />} sx={{ borderRadius: 2 }}>
          Credentials saved. <strong>Restart the app</strong> to activate.
        </Alert>
      )}

      <Box display="flex" justifyContent="flex-end">
        <Button
          variant="contained" onClick={save}
          disabled={saving || !form.databaseUrl || !form.authToken}
          startIcon={saving ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <Save fontSize="small" />}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </Box>
    </Box>
  );
}

// ─── Main Setup page ──────────────────────────────────────────────────────────
export default function Setup() {
  return (
    <Box sx={{ maxWidth: 860, mx: 'auto', px: { xs: 2, sm: 4 }, py: 4 }}>
      {/* Page title */}
      <Box mb={4}>
        <Typography variant="h4" fontWeight={800} color="text.primary" mb={0.5}>
          Setup
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Configure AI providers and integrations. Settings are stored in the database and take effect immediately.
        </Typography>
      </Box>

      {/* Features */}
      <Section
        icon={<ToggleOn sx={{ color: '#6366f1', fontSize: 22 }} />}
        title="Features"
        subtitle="Enable optional pages that appear in the sidebar"
      >
        <FeaturesSection />
      </Section>

      {/* AI */}
      <Section
        icon={<SmartToy sx={{ color: '#7c3aed', fontSize: 22 }} />}
        title="AI Model"
        subtitle="Powers priority suggestions and description analysis on your initiatives"
      >
        <AISection />
      </Section>

      {/* Gmail */}
      <Section
        icon={<Email sx={{ color: '#ea4335', fontSize: 22 }} />}
        title="Gmail Integration"
        subtitle="Fetch meeting notes from a Gmail label and display them in the Meeting Notes page"
      >
        <GmailSection />
      </Section>

      {/* JIRA */}
      <Section
        icon={<BugReport sx={{ color: '#0052cc', fontSize: 22 }} />}
        title="JIRA & Confluence Integration"
        subtitle="Link JIRA tickets and Confluence pages to initiatives"
      >
        <JiraSection />
      </Section>

      {/* Turso Sync */}
      <Section
        icon={<SyncAlt sx={{ color: '#0ea5e9', fontSize: 22 }} />}
        title="Cross-Device Sync (Turso)"
        subtitle="Sync your data between Windows and Mac using a Turso embedded replica"
      >
        <TursoSection />
      </Section>
    </Box>
  );
}
