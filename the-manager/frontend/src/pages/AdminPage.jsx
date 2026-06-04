import { useState, useEffect } from 'react';
import { useTheme } from '@mui/material/styles';
import {
  Box, Typography, TextField, Button, Alert, CircularProgress,
  Paper, Divider, Select, MenuItem, FormControl, InputLabel,
  InputAdornment, IconButton, Link,
} from '@mui/material';
import { Lock, Save, Logout, SmartToy, Visibility, VisibilityOff, CheckCircle } from '@mui/icons-material';
import {
  adminLogin, adminLogout, isAdminLoggedIn,
  getAdminAISettings, putAdminAISettings,
} from '../api/admin';

const PROVIDERS = [
  { value: 'ollama',            label: 'Ollama (local)',        icon: '🦙', desc: 'Free, runs locally. No API key needed.' },
  { value: 'openai',            label: 'OpenAI / ChatGPT',      icon: '✨', desc: 'GPT-4o and friends. Requires API key.' },
  { value: 'gemini',            label: 'Google Gemini',         icon: '♊', desc: 'Gemini 2.5 / 3.x. Requires API key.' },
  { value: 'openai_compatible', label: 'OpenAI-compatible API', icon: '🔌', desc: 'LM Studio, Groq, Together AI, Mistral, etc.' },
  { value: 'bedrock',           label: 'AWS Bedrock',           icon: '☁️', desc: 'Claude, Llama via AWS. Requires IAM credentials.' },
  { value: 'disabled',          label: 'Disabled',              icon: '🚫', desc: 'AI disabled by default for all users.' },
];

const OPENAI_MODELS = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
const GEMINI_MODELS = ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-preview-04-17', 'gemini-3-flash-preview'];
const BEDROCK_REGIONS = ['us-east-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1', 'ap-northeast-1'];

// ─── Login form ───────────────────────────────────────────────────────────────
function LoginForm({ onLogin }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await adminLogin(username, password);
      onLogin();
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check credentials.');
    } finally { setLoading(false); }
  };

  // autofill override for webkit browsers
  const paperBg = isDark ? '#1e293b' : '#ffffff';
  const autofillSx = {
    '& input:-webkit-autofill, & input:-webkit-autofill:hover, & input:-webkit-autofill:focus': {
      WebkitBoxShadow: `0 0 0 100px ${paperBg} inset`,
      WebkitTextFillColor: isDark ? '#f1f5f9' : '#0f172a',
      caretColor: isDark ? '#f1f5f9' : '#0f172a',
      borderRadius: 'inherit',
    },
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: isDark ? '#0f172a' : '#f8fafc' }}>
      <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 4, width: '100%', maxWidth: 380, bgcolor: paperBg }}>
        <Box display="flex" alignItems="center" gap={1.5} mb={3}>
          <Lock sx={{ color: '#6366f1' }} />
          <Box>
            <Typography variant="h6" fontWeight={700}>Admin Panel</Typography>
            <Typography variant="caption" color="text.secondary">App-level AI settings</Typography>
          </Box>
        </Box>
        <Box component="form" onSubmit={submit} display="flex" flexDirection="column" gap={2}>
          <TextField
            label="Username" value={username} onChange={e => setUsername(e.target.value)}
            size="small" fullWidth autoComplete="username" required
            sx={autofillSx}
          />
          <TextField
            label="Password" type={showPass ? 'text' : 'password'}
            value={password} onChange={e => setPassword(e.target.value)}
            size="small" fullWidth required autoComplete="current-password"
            sx={autofillSx}
            InputProps={{ endAdornment: (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setShowPass(v => !v)}>
                  {showPass ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                </IconButton>
              </InputAdornment>
            )}}
          />
          {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
          <Button
            type="submit" variant="contained" disabled={loading || !username || !password}
            startIcon={loading ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <Lock fontSize="small" />}
            sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600 }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}

// ─── AI settings panel ────────────────────────────────────────────────────────
function AISettingsPanel({ onLogout }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [loading, setLoading]           = useState(true);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [error, setError]               = useState('');
  const [showOAIKey, setShowOAIKey]     = useState(false);
  const [showGemKey, setShowGemKey]     = useState(false);
  const [showBDKeyId, setShowBDKeyId]   = useState(false);
  const [showBDSecret, setShowBDSecret] = useState(false);
  const [keyStatus, setKeyStatus]       = useState({ openai: false, gemini: false, bedrockKeyId: false, bedrockSecret: false });

  const [form, setForm] = useState({
    provider: 'ollama',
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.1:latest',
    openaiBaseUrl: 'https://api.openai.com',
    openaiModel: 'gpt-4o-mini',
    openaiApiKey: '',
    geminiModel: 'gemini-2.5-flash',
    geminiApiKey: '',
    bedrockRegion: 'us-east-1',
    bedrockModel: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    bedrockAccessKeyId: '',
    bedrockSecretKey: '',
  });

  useEffect(() => {
    getAdminAISettings()
      .then(d => {
        setForm(f => ({
          ...f,
          provider:      d.provider      || 'ollama',
          ollamaBaseUrl: d.ollamaBaseUrl  || 'http://localhost:11434',
          ollamaModel:   d.ollamaModel    || 'llama3.1:latest',
          openaiBaseUrl: d.openaiBaseUrl  || 'https://api.openai.com',
          openaiModel:   d.openaiModel    || 'gpt-4o-mini',
          geminiModel:   d.geminiModel    || 'gemini-2.5-flash',
          bedrockRegion: d.bedrockRegion  || 'us-east-1',
          bedrockModel:  d.bedrockModel   || 'anthropic.claude-3-5-sonnet-20241022-v2:0',
        }));
        setKeyStatus({
          openai:       !!d.openaiApiKeySet,
          gemini:       !!d.geminiApiKeySet,
          bedrockKeyId: !!d.bedrockAccessKeyIdSet,
          bedrockSecret: !!d.bedrockSecretKeySet,
        });
      })
      .catch(() => setError('Failed to load settings. Your session may have expired.'))
      .finally(() => setLoading(false));
  }, []);

  const set = f => e => { setForm(p => ({ ...p, [f]: e.target.value })); setSaved(false); };

  const save = async () => {
    setSaving(true); setError('');
    try {
      await putAdminAISettings(form);
      setSaved(true);
      setKeyStatus({
        openai:        form.openaiApiKey      ? true : keyStatus.openai,
        gemini:        form.geminiApiKey      ? true : keyStatus.gemini,
        bedrockKeyId:  form.bedrockAccessKeyId ? true : keyStatus.bedrockKeyId,
        bedrockSecret: form.bedrockSecretKey   ? true : keyStatus.bedrockSecret,
      });
      setTimeout(() => setSaved(false), 3000);
    } catch { setError('Failed to save. Please try again.'); }
    finally { setSaving(false); }
  };

  const logout = () => { adminLogout(); onLogout(); };
  const p = form.provider;

  if (loading) return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: isDark ? '#0f172a' : '#f8fafc' }}>
      <CircularProgress />
    </Box>
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: isDark ? '#0f172a' : '#f8fafc', p: { xs: 2, sm: 4 } }}>
      <Box maxWidth={720} mx="auto">

        {/* Header */}
        <Box display="flex" alignItems="center" justifyContent="space-between" mb={3}>
          <Box display="flex" alignItems="center" gap={1.5}>
            <SmartToy sx={{ color: '#6366f1' }} />
            <Box>
              <Typography variant="h6" fontWeight={700}>Admin — AI Settings</Typography>
              <Typography variant="caption" color="text.secondary">
                App-level defaults. Users may override their own settings in Setup → AI Model.
              </Typography>
            </Box>
          </Box>
          <Button
            size="small" variant="outlined" onClick={logout}
            startIcon={<Logout fontSize="small" />}
            sx={{ borderRadius: 2, textTransform: 'none', fontSize: '0.8rem' }}
          >
            Sign out
          </Button>
        </Box>

        <Paper elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, p: 3 }}>
          <Box display="flex" flexDirection="column" gap={2.5}>

            {/* Provider grid */}
            <Box>
              <Typography variant="body2" fontWeight={600} color="text.secondary" mb={1.25}>
                Default AI Provider
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={1}>
                {PROVIDERS.map(pr => (
                  <Box
                    key={pr.value}
                    onClick={() => { setForm(f => ({ ...f, provider: pr.value })); setSaved(false); }}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1, px: 1.75, py: 1.25,
                      border: `2px solid ${p === pr.value ? '#6366f1' : (isDark ? '#334155' : '#e2e8f0')}`,
                      borderRadius: 2.5, cursor: 'pointer', minWidth: 140,
                      bgcolor: p === pr.value ? (isDark ? 'rgba(99,102,241,0.15)' : '#f0f0ff') : 'transparent',
                      transition: 'all 0.15s',
                      '&:hover': { borderColor: '#6366f1', bgcolor: isDark ? 'rgba(99,102,241,0.12)' : '#f5f3ff' },
                    }}
                  >
                    <Typography sx={{ fontSize: '1.1rem', lineHeight: 1 }}>{pr.icon}</Typography>
                    <Box>
                      <Typography variant="body2" fontWeight={p === pr.value ? 700 : 500} fontSize="0.82rem">{pr.label}</Typography>
                      <Typography variant="caption" color="text.secondary" fontSize="0.7rem" display="block">{pr.desc}</Typography>
                    </Box>
                  </Box>
                ))}
              </Box>
            </Box>

            <Divider />

            {/* Ollama */}
            {p === 'ollama' && (
              <Box display="flex" gap={2}>
                <TextField label="Base URL" value={form.ollamaBaseUrl} onChange={set('ollamaBaseUrl')} size="small" sx={{ flex: 2 }} helperText="Default: http://localhost:11434" />
                <TextField label="Model" value={form.ollamaModel} onChange={set('ollamaModel')} size="small" sx={{ flex: 2 }} helperText="e.g. llama3.1:latest" />
              </Box>
            )}

            {/* OpenAI / OpenAI-compatible */}
            {(p === 'openai' || p === 'openai_compatible') && (
              <Box display="flex" flexDirection="column" gap={2}>
                {p === 'openai_compatible' && (
                  <TextField label="Base URL" value={form.openaiBaseUrl} onChange={set('openaiBaseUrl')} size="small" fullWidth
                    helperText="e.g. http://localhost:1234, https://api.groq.com, https://api.together.xyz" />
                )}
                <Box display="flex" gap={2}>
                  <TextField
                    label="API Key" type={showOAIKey ? 'text' : 'password'}
                    value={form.openaiApiKey} onChange={set('openaiApiKey')} size="small" sx={{ flex: 3 }}
                    placeholder={keyStatus.openai ? 'Paste new key to replace…' : (p === 'openai' ? 'sk-…' : 'API key or token')}
                    helperText={keyStatus.openai ? '✓ Key is saved' : (p === 'openai_compatible' ? 'Leave blank if not required' : 'Required')}
                    InputProps={{ endAdornment: (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={() => setShowOAIKey(v => !v)}>
                          {showOAIKey ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                        </IconButton>
                      </InputAdornment>
                    )}}
                  />
                  {p === 'openai' ? (
                    <FormControl size="small" sx={{ flex: 2 }}>
                      <InputLabel>Model</InputLabel>
                      <Select value={form.openaiModel} label="Model" onChange={set('openaiModel')}>
                        {OPENAI_MODELS.map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
                      </Select>
                    </FormControl>
                  ) : (
                    <TextField label="Model name" value={form.openaiModel} onChange={set('openaiModel')} size="small" sx={{ flex: 2 }} helperText="As recognised by your endpoint" />
                  )}
                </Box>
              </Box>
            )}

            {/* Gemini */}
            {p === 'gemini' && (
              <Box display="flex" gap={2}>
                <TextField
                  label="API Key" type={showGemKey ? 'text' : 'password'}
                  value={form.geminiApiKey} onChange={set('geminiApiKey')} size="small" sx={{ flex: 3 }}
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
            )}

            {/* AWS Bedrock */}
            {p === 'bedrock' && (
              <Box display="flex" flexDirection="column" gap={2}>
                <Typography variant="body2" color="text.secondary">
                  Long-term IAM credentials with <code>bedrock:InvokeModel</code> permission.{' '}
                  <Link href="https://docs.aws.amazon.com/bedrock/latest/userguide/getting-started.html" target="_blank" rel="noopener">
                    AWS Bedrock docs
                  </Link>
                </Typography>
                <Box display="flex" gap={2}>
                  <FormControl size="small" sx={{ flex: 1 }}>
                    <InputLabel>Region</InputLabel>
                    <Select value={form.bedrockRegion} label="Region" onChange={set('bedrockRegion')}>
                      {BEDROCK_REGIONS.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
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
                    value={form.bedrockAccessKeyId} onChange={set('bedrockAccessKeyId')} size="small" sx={{ flex: 1 }}
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
                    value={form.bedrockSecretKey} onChange={set('bedrockSecretKey')} size="small" sx={{ flex: 1 }}
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
                AI is disabled by default for all users. Individual users can still override this in their own Setup → AI Model page.
              </Alert>
            )}

            {error && <Alert severity="error" sx={{ borderRadius: 2 }}>{error}</Alert>}
            {saved  && <Alert severity="success" icon={<CheckCircle />} sx={{ borderRadius: 2 }}>Settings saved!</Alert>}

            <Box display="flex" justifyContent="flex-end">
              <Button
                variant="contained" onClick={save} disabled={saving}
                startIcon={saving ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <Save fontSize="small" />}
                sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, px: 3 }}
              >
                {saving ? 'Saving…' : 'Save Settings'}
              </Button>
            </Box>

          </Box>
        </Paper>

        <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mt={2}>
          These are app-level defaults. Users can override their own AI provider in Setup → AI Model.
        </Typography>
      </Box>
    </Box>
  );
}

// ─── Page root ────────────────────────────────────────────────────────────────
export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(isAdminLoggedIn());
  if (!loggedIn) return <LoginForm onLogin={() => setLoggedIn(true)} />;
  return <AISettingsPanel onLogout={() => setLoggedIn(false)} />;
}
