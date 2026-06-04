import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTheme } from '@mui/material/styles';
import {
  Box, Typography, Button, TextField, Select, MenuItem,
  FormControl, InputLabel, Divider, CircularProgress, Alert,
  InputAdornment, IconButton, Chip, Paper, Link, Switch, FormControlLabel,
  Tabs, Tab,
} from '@mui/material';
import {
  SmartToy, Visibility, VisibilityOff, CheckCircle, Save,
  Email, CheckCircleOutline, ErrorOutline, Launch, BugReport,
  SyncAlt, CloudOff, FeedOutlined, Groups, ToggleOn, EventNote,
  LockOutlined, LinkOff, VpnKey,
} from '@mui/icons-material';
import api from '../api/axios';

// ─── shared data ──────────────────────────────────────────────────────────────
const PROVIDERS = [
  { value: 'ollama',            label: 'Ollama (local)',        icon: '🦙', desc: 'Free, runs locally. No API key needed.' },
  { value: 'openai',            label: 'OpenAI / ChatGPT',      icon: '✨', desc: 'GPT-4o and friends. Requires API key.' },
  { value: 'gemini',            label: 'Google Gemini',         icon: '♊', desc: 'Gemini 2.5 / 3.x. Requires API key.' },
  { value: 'openai_compatible', label: 'OpenAI-compatible API', icon: '🔌', desc: 'LM Studio, Groq, Together AI, Mistral, etc.' },
  { value: 'bedrock',           label: 'AWS Bedrock',           icon: '☁️', desc: 'Claude, Llama via AWS. Requires IAM credentials.' },
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
  const [showBDKeyId, setShowBDKeyId] = useState(false);
  const [showBDSecret, setShowBDSecret] = useState(false);
  const [keyStatus, setKeyStatus]     = useState({ openai: false, gemini: false, bedrockKeyId: false, bedrockSecret: false });

  const [form, setForm] = useState({
    provider: 'ollama',
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.1:latest',
    openaiBaseUrl: 'https://api.openai.com',
    openaiModel: 'gpt-4o-mini',
    openaiApiKey: '',
    geminiModel: 'gemini-2.5-flash-preview-04-17',
    geminiApiKey: '',
    bedrockRegion: 'us-east-1',
    bedrockModel: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    bedrockAccessKeyId: '',
    bedrockSecretKey: '',
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
          bedrockRegion: d.bedrockRegion  || 'us-east-1',
          bedrockModel:  d.bedrockModel   || 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        }));
        setKeyStatus({ openai: !!d.openaiApiKeySet, gemini: !!d.geminiApiKeySet, bedrockKeyId: !!d.bedrockAccessKeyIdSet, bedrockSecret: !!d.bedrockSecretKeySet });
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
        bedrockKeyId:  form.bedrockAccessKeyId ? true : keyStatus.bedrockKeyId,
        bedrockSecret: form.bedrockSecretKey   ? true : keyStatus.bedrockSecret,
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

      {p === 'bedrock' && (
        <Box display="flex" flexDirection="column" gap={2}>
          <Typography variant="body2" color="text.secondary">
            Long-term IAM credentials with <code>bedrock:InvokeModel</code> permission.{' '}
            <Link href="https://docs.aws.amazon.com/bedrock/latest/userguide/getting-started.html" target="_blank" rel="noopener">
              AWS Bedrock docs <Launch sx={{ fontSize: 12, verticalAlign: 'middle' }} />
            </Link>
          </Typography>
          <Box display="flex" gap={2}>
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Region</InputLabel>
              <Select value={form.bedrockRegion} label="Region" onChange={set('bedrockRegion')}>
                {['us-east-1','us-west-2','eu-west-1','eu-central-1','ap-southeast-1','ap-northeast-1'].map(r => (
                  <MenuItem key={r} value={r}>{r}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Model ID" value={form.bedrockModel} onChange={set('bedrockModel')}
              size="small" sx={{ flex: 2 }}
              helperText="e.g. anthropic.claude-3-5-sonnet-20241022-v2:0"
            />
          </Box>
          <Box display="flex" gap={2}>
            <TextField
              label="Access Key ID" type={showBDKeyId ? 'text' : 'password'}
              value={form.bedrockAccessKeyId} onChange={set('bedrockAccessKeyId')}
              size="small" sx={{ flex: 1 }}
              placeholder={keyStatus.bedrockKeyId ? 'Paste new key to replace…' : 'AKIA…'}
              helperText={keyStatus.bedrockKeyId ? '✓ Key is saved' : 'Required'}
              InputProps={{ endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowBDKeyId(v => !v)}>
                    {showBDKeyId ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              )}}
            />
            <TextField
              label="Secret Access Key" type={showBDSecret ? 'text' : 'password'}
              value={form.bedrockSecretKey} onChange={set('bedrockSecretKey')}
              size="small" sx={{ flex: 1 }}
              placeholder={keyStatus.bedrockSecret ? 'Paste new key to replace…' : 'Secret key'}
              helperText={keyStatus.bedrockSecret ? '✓ Key is saved' : 'Required'}
              InputProps={{ endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowBDSecret(v => !v)}>
                    {showBDSecret ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                </InputAdornment>
              )}}
            />
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
const _apiBase = (() => {
  const raw = import.meta.env.VITE_API_URL || 'http://localhost:47421/api';
  return raw.replace(/\/api\/?$/, '');
})();
const OAUTH_REDIRECT_URI = `${_apiBase}/api/gmail/oauth/callback`;

function GmailSection() {
  const theme  = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [searchParams, setSearchParams] = useSearchParams();

  // ── shared state ────────────────────────────────────────────────────────────
  const [loading, setLoading]         = useState(true);
  const [testing, setTesting]         = useState(false);
  const [testResult, setTestResult]   = useState(null);
  const [error, setError]             = useState('');
  const [oauthCallbackMsg, setOauthCallbackMsg] = useState(null); // {ok, text}

  const [status, setStatus] = useState({
    userSet: false, passwordSet: false, user: '',
    encrypted: false, source: 'none',
    label: '', search: '',
    authMethod: 'app_password',
    oauthClientIdSet: false, oauthConnected: false, oauthEmail: '',
  });

  // ── auth-method tab ─────────────────────────────────────────────────────────
  const [authMethod, setAuthMethod] = useState('oauth2');

  // ── App Password state ───────────────────────────────────────────────────────
  const [gmailUser, setGmailUser]         = useState('');
  const [appPassword, setAppPassword]     = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [saving, setSaving]               = useState(false);
  const [saved, setSaved]                 = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);



  // ── OAuth2 state ─────────────────────────────────────────────────────────────
  const [clientId, setClientId]             = useState('');
  const [clientSecret, setClientSecret]     = useState('');
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [savingOAuth, setSavingOAuth]       = useState(false);
  const [savedOAuth, setSavedOAuth]         = useState(false);
  const [connectingOAuth, setConnectingOAuth] = useState(false);
  const [disconnectingOAuth, setDisconnectingOAuth] = useState(false);

  // ── load settings ────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/gmail/settings');
      setStatus(data);
      setGmailUser(data.user || '');
      const method = data.authMethod || 'oauth2';
      setAuthMethod(method);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── handle OAuth2 callback redirect params ───────────────────────────────────
  useEffect(() => {
    const oauthResult = searchParams.get('oauth');
    if (!oauthResult) return;
    const email   = searchParams.get('email')   || '';
    const message = searchParams.get('message') || '';
    if (oauthResult === 'success') {
      setOauthCallbackMsg({ ok: true, text: `Connected${email ? ` as ${email}` : ''}!` });
      setAuthMethod('oauth2');
      load();
    } else {
      setOauthCallbackMsg({ ok: false, text: message || 'OAuth2 connection failed.' });
    }
    // clear the query params without reload
    const next = new URLSearchParams(searchParams);
    next.delete('oauth'); next.delete('email'); next.delete('message');
    setSearchParams(next, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── App Password – save ──────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true); setSaved(false); setError('');
    try {
      await api.put('/gmail/settings', {
        user: gmailUser, appPassword: appPassword || undefined,
        authMethod: 'app_password',
      });
      setAppPassword('');
      setSaved(true);
      await load();
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
    setSaving(false);
  };

  // ── App Password – disconnect ────────────────────────────────────────────────
  const handleDisconnect = async () => {
    setDisconnecting(true); setError('');
    try {
      await api.delete('/gmail/settings');
      await load();
    } catch (e) { setError(e.response?.data?.error || e.message); }
    setDisconnecting(false);
  };

  // ── OAuth2 – save credentials ────────────────────────────────────────────────
  const saveOAuth = async () => {
    setSavingOAuth(true); setSavedOAuth(false); setError('');
    try {
      await api.put('/gmail/settings', {
        authMethod: 'oauth2',
        clientId: clientId || undefined,
        clientSecret: clientSecret || undefined,
      });
      setClientSecret('');
      setSavedOAuth(true);
      await load();
      setTimeout(() => setSavedOAuth(false), 3000);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
    setSavingOAuth(false);
  };

  // ── OAuth2 – start Google consent flow ──────────────────────────────────────
  const connectOAuth = async () => {
    setConnectingOAuth(true); setError('');
    try {
      const { data } = await api.get('/gmail/oauth/auth-url');
      window.location.href = data.url;
    } catch (e) {
      setError(e.response?.data?.error || e.message);
      setConnectingOAuth(false);
    }
  };

  // ── OAuth2 – disconnect ───────────────────────────────────────────────────────
  const disconnectOAuth = async () => {
    setDisconnectingOAuth(true); setError('');
    try {
      await api.delete('/gmail/oauth');
      await load();
    } catch (e) { setError(e.response?.data?.error || e.message); }
    setDisconnectingOAuth(false);
  };

  // ── test connection ──────────────────────────────────────────────────────────
  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const { data } = await api.get('/gmail/test-config');
      setTestResult({ ok: true, ...data });
    } catch (e) {
      setTestResult({ ok: false, error: e.response?.data?.error || e.message });
    }
    setTesting(false);
  };

  const canTest = authMethod === 'oauth2'
    ? status.oauthConnected
    : (status.userSet && status.passwordSet);

  const cardBg   = isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)';
  const stepsBg  = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)';

  if (loading) return <Box sx={{ display:'flex', justifyContent:'center', py:4 }}><CircularProgress size={24}/></Box>;

  return (
    <Box>
      {/* OAuth callback banner */}
      {oauthCallbackMsg && (
        <Alert
          severity={oauthCallbackMsg.ok ? 'success' : 'error'}
          onClose={() => setOauthCallbackMsg(null)}
          sx={{ mb:2, borderRadius:2 }}
        >
          {oauthCallbackMsg.text}
        </Alert>
      )}

      {/* Shared error banner */}
      {error && (
        <Alert severity="error" onClose={() => setError('')} sx={{ mb:2, borderRadius:2 }}>
          {error}
        </Alert>
      )}

      {/* Auth method tabs */}
      <Tabs
        value={authMethod}
        onChange={(_, v) => { setAuthMethod(v); setTestResult(null); setError(''); }}
        sx={{ mb:2 }}
      >
        <Tab label="Google OAuth2 (Recommended)" value="oauth2" icon={<VpnKey sx={{ fontSize:16 }}/>} iconPosition="start" />
        <Tab label="App Password" value="app_password" />
      </Tabs>

      {/* ── App Password tab ────────────────────────────────────────────── */}
      {authMethod === 'app_password' && (
        <Box>
          <Alert severity="info" icon={<Email/>} sx={{ mb:2, borderRadius:2 }}>
            Connect Gmail using an App Password. Requires 2-Step Verification and a Google App Password.
          </Alert>

          <Paper variant="outlined" sx={{ p:2, mb:2, background:stepsBg, borderRadius:2 }}>
            <Typography variant="subtitle2" sx={{ mb:1, fontWeight:600 }}>How to get an App Password</Typography>
            <Typography variant="body2" component="ol" sx={{ pl:2, m:0 }}>
              <li>Enable 2-Step Verification on your Google account</li>
              <li>Go to <Link href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener">myaccount.google.com/apppasswords <Launch sx={{fontSize:11}}/></Link></li>
              <li>Create a new App Password (select "Mail" or a custom name)</li>
              <li>Copy the 16-character password and paste it below</li>
            </Typography>
          </Paper>

          {status.userSet && (
            <Box sx={{ display:'flex', alignItems:'center', gap:1, mb:2 }}>
              <Chip icon={<CheckCircle/>} label={`Connected as ${status.user}`} color="success" size="small"/>
              {status.encrypted && <Chip icon={<LockOutlined/>} label="Encrypted" color="primary" size="small" variant="outlined"/>}
              <Chip label={status.source === 'db' ? 'Database' : 'Environment'} size="small" variant="outlined"/>
            </Box>
          )}

          <TextField
            label="Gmail Address" fullWidth size="small" sx={{ mb:2 }}
            value={gmailUser} onChange={e => setGmailUser(e.target.value)}
            placeholder="you@gmail.com"
            autoComplete="username"
          />
          <TextField
            label="App Password" fullWidth size="small" sx={{ mb:2 }}
            type={showPassword ? 'text' : 'password'}
            value={appPassword} onChange={e => setAppPassword(e.target.value)}
            placeholder={status.passwordSet ? '(saved — enter new to update)' : '16-character App Password'}
            autoComplete="new-password"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowPassword(p => !p)}>
                    {showPassword ? <VisibilityOff/> : <Visibility/>}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <Box sx={{ display:'flex', gap:1, flexWrap:'wrap', mb:2 }}>
            <Button
              variant="contained" startIcon={saving ? <CircularProgress size={16}/> : <Save/>}
              onClick={handleSave} disabled={saving || (!gmailUser && !status.userSet)}
            >
              {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Credentials'}
            </Button>

            <Button
              variant="outlined" color="info"
              startIcon={testing ? <CircularProgress size={16}/> : <SyncAlt/>}
              onClick={handleTest} disabled={testing || !canTest}
            >
              {testing ? 'Testing…' : 'Test Connection'}
            </Button>

            {status.userSet && (
              <Button
                variant="outlined" color="error"
                startIcon={disconnecting ? <CircularProgress size={16}/> : <LinkOff/>}
                onClick={handleDisconnect} disabled={disconnecting}
              >
                {disconnecting ? 'Disconnecting…' : 'Disconnect'}
              </Button>
            )}
          </Box>

          {testResult && (
            <Alert severity={testResult.ok ? 'success' : 'error'} sx={{ borderRadius:2 }}>
              {testResult.ok
                ? <>Connected as <strong>{testResult.user}</strong>{testResult.encrypted ? ' · encrypted ✓' : ''}</>
                : testResult.error
              }
            </Alert>
          )}
        </Box>
      )}

      {/* ── OAuth2 tab ──────────────────────────────────────────────────── */}
      {authMethod === 'oauth2' && (
        <Box>
          {status.oauthConnected && (
            <Alert severity="success" icon={<CheckCircle/>} sx={{ mb:2, borderRadius:2 }}>
              Connected as <strong>{status.oauthEmail || 'your Google account'}</strong>
            </Alert>
          )}

          <Alert severity="info" icon={<VpnKey/>} sx={{ mb:2, borderRadius:2 }}>
            Secure, read-only access via Google OAuth2 — uses the <code>gmail.readonly</code> scope.
            Your credentials are never stored in plain text.
          </Alert>

          <Paper variant="outlined" sx={{ p:2, mb:2, background:stepsBg, borderRadius:2 }}>
            <Typography variant="subtitle2" sx={{ mb:1, fontWeight:600 }}>Setup steps</Typography>
            <Typography variant="body2" component="ol" sx={{ pl:2, m:0 }}>
              <li>Open <Link href="https://console.cloud.google.com/" target="_blank" rel="noopener">Google Cloud Console <Launch sx={{fontSize:11}}/></Link> and create or select a project</li>
              <li>Enable the <strong>Gmail API</strong> for your project</li>
              <li>Go to <em>APIs &amp; Services → Credentials → Create Credentials → OAuth client ID</em> — choose <strong>Web application</strong></li>
              <li>
                Add the following as <strong>Authorised redirect URIs</strong>:
                {[
                  'http://localhost:3000/api/gmail/oauth/callback',
                  'http://localhost:3000',
                ].filter((v, i, a) => a.indexOf(v) === i).map(uri => (
                  <Box key={uri} component="code" sx={{
                    display:'block', mt:0.5, p:0.75, borderRadius:1,
                    background: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
                    fontFamily:'monospace', fontSize:'0.8rem', wordBreak:'break-all',
                  }}>
                    {uri}
                  </Box>
                ))}
              </li>
              <li>Go to <em>APIs &amp; Services → OAuth consent screen → Test users</em> and add your Google account email address</li>
              <li>Copy the <strong>Client ID</strong> and <strong>Client Secret</strong> below and click <em>Save Credentials</em></li>
              <li>Click <em>Connect with Google</em> to authorise access</li>
            </Typography>
          </Paper>

          <TextField
            label="Client ID" fullWidth size="small" sx={{ mb:2 }}
            value={clientId} onChange={e => setClientId(e.target.value)}
            placeholder={status.oauthClientIdSet ? '(saved — enter new to update)' : 'Paste your OAuth2 Client ID'}
            autoComplete="off"
            inputProps={{ autoComplete: 'off' }}
          />
          <TextField
            label="Client Secret" fullWidth size="small" sx={{ mb:2 }}
            type={showClientSecret ? 'text' : 'password'}
            value={clientSecret} onChange={e => setClientSecret(e.target.value)}
            placeholder="Paste your OAuth2 Client Secret"
            autoComplete="new-password"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowClientSecret(p => !p)}>
                    {showClientSecret ? <VisibilityOff/> : <Visibility/>}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <Box sx={{ display:'flex', gap:1, flexWrap:'wrap', mb:2 }}>
            <Button
              variant="contained" startIcon={savingOAuth ? <CircularProgress size={16}/> : <Save/>}
              onClick={saveOAuth}
              disabled={savingOAuth || (!clientId && !status.oauthClientIdSet)}
            >
              {savingOAuth ? 'Saving…' : savedOAuth ? 'Saved!' : 'Save Credentials'}
            </Button>

            <Button
              variant="contained" color="success"
              startIcon={connectingOAuth ? <CircularProgress size={16}/> : <VpnKey/>}
              onClick={connectOAuth}
              disabled={connectingOAuth || !status.oauthClientIdSet}
            >
              {connectingOAuth ? 'Redirecting…' : status.oauthConnected ? 'Reconnect with Google' : 'Connect with Google'}
            </Button>

            {status.oauthConnected && (
              <Button
                variant="outlined" color="error"
                startIcon={disconnectingOAuth ? <CircularProgress size={16}/> : <LinkOff/>}
                onClick={disconnectOAuth} disabled={disconnectingOAuth}
              >
                {disconnectingOAuth ? 'Disconnecting…' : 'Disconnect OAuth2'}
              </Button>
            )}

            <Button
              variant="outlined" color="info"
              startIcon={testing ? <CircularProgress size={16}/> : <SyncAlt/>}
              onClick={handleTest} disabled={testing || !canTest}
            >
              {testing ? 'Testing…' : 'Test Connection'}
            </Button>
          </Box>

          {testResult && (
            <Alert severity={testResult.ok ? 'success' : 'error'} sx={{ borderRadius:2 }}>
              {testResult.ok
                ? <>Connected as <strong>{testResult.user}</strong> via {testResult.method === 'oauth2' ? 'OAuth2' : 'App Password'}</>
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
