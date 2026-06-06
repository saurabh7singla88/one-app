import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import {
  Box, TextField, Button, Typography, Alert, Paper, InputAdornment, IconButton, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Divider, FormControlLabel, Checkbox,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Email, Lock, Visibility, VisibilityOff, AccountTree, ContentCopy, CheckCircle } from '@mui/icons-material';
import { login } from '../features/auth/authSlice';
import api from '../api/axios';

// ── Forgot password dialog ─────────────────────────────────────────────────
function ForgotPasswordDialog({ open, onClose }) {
  const [step, setStep] = useState('email'); // 'email' | 'reset' | 'done'
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = () => { setStep('email'); setEmail(''); setToken(''); setTokenInput(''); setNewPw(''); setConfirmPw(''); setCopied(false); setError(''); };
  const handleClose = () => { reset(); onClose(); };

  const requestToken = async () => {
    if (!email) { setError('Enter your email'); return; }
    setError(''); setLoading(true);
    try {
      const r = await api.post('/auth/forgot-password', { email });
      const t = r.data.resetToken;
      if (!t) {
        setError('No account found with that email address');
        setLoading(false);
        return;
      }
      setToken(t);
      setTokenInput(t); // pre-fill so user doesn't need to copy-paste
      setStep('reset');
    } catch (e) {
      setError(e.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const copyToken = () => {
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const resetPassword = async () => {
    if (!tokenInput) { setError('Enter the reset token'); return; }
    if (!newPw) { setError('Enter a new password'); return; }
    if (newPw.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (newPw !== confirmPw) { setError('Passwords do not match'); return; }
    setError(''); setLoading(true);
    try {
      await api.post('/auth/reset-password', { token: tokenInput, password: newPw });
      setStep('done');
    } catch (e) {
      setError(e.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>
        {step === 'email' && 'Reset your password'}
        {step === 'reset' && 'Set a new password'}
        {step === 'done' && 'Password updated'}
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {step === 'email' && (
          <Box display="flex" flexDirection="column" gap={2} pt={0.5}>
            <Typography variant="body2" color="text.secondary">
              Enter your email address. A reset token will be generated and shown on screen.
            </Typography>
            <TextField
              autoFocus fullWidth label="Email address" type="email"
              value={email} onChange={e => setEmail(e.target.value)}
              autoComplete="off"
              onKeyDown={e => { if (e.key === 'Enter') requestToken(); }}
              error={!!error} helperText={error || ''}
            />
          </Box>
        )}
        {step === 'reset' && (
          <Box display="flex" flexDirection="column" gap={2} pt={0.5}>
            {token && (
              <Box sx={{ bgcolor: 'action.hover', borderRadius: 2, p: 1.5 }}>
                <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                  Your reset token (valid for 24 hours):
                </Typography>
                <Box display="flex" alignItems="center" justifyContent="space-between" gap={1}>
                  <Typography variant="body2" fontFamily="monospace" sx={{ wordBreak: 'break-all', fontSize: '0.72rem', color: '#4f46e5' }}>
                    {token}
                  </Typography>
                  <IconButton size="small" onClick={copyToken} sx={{ flexShrink: 0 }}>
                    {copied ? <CheckCircle sx={{ fontSize: 16, color: '#22c55e' }} /> : <ContentCopy sx={{ fontSize: 16 }} />}
                  </IconButton>
                </Box>
                <Typography variant="caption" color="text.disabled" mt={0.5} display="block">
                  Copy it above or check the backend terminal.
                </Typography>
              </Box>
            )}
            <Divider />
            <TextField
              autoFocus fullWidth label="Reset token" value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              autoComplete="off" size="small"
              placeholder="Paste token here…"
            />
            <TextField
              fullWidth label="New password" type="password"
              value={newPw} onChange={e => { setNewPw(e.target.value); setError(''); }}
              autoComplete="off" size="small"
            />
            <TextField
              fullWidth label="Confirm new password" type="password"
              value={confirmPw} onChange={e => { setConfirmPw(e.target.value); setError(''); }}
              autoComplete="off" size="small"
              onKeyDown={e => { if (e.key === 'Enter') resetPassword(); }}
            />
            {error && <Typography variant="caption" color="error">{error}</Typography>}
          </Box>
        )}
        {step === 'done' && (
          <Box display="flex" flexDirection="column" alignItems="center" gap={1.5} py={2}>
            <CheckCircle sx={{ fontSize: 48, color: '#22c55e' }} />
            <Typography variant="body1" fontWeight={600}>Password updated successfully</Typography>
            <Typography variant="body2" color="text.secondary">You can now log in with your new password.</Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {step === 'email' && (
          <>
            <Button onClick={handleClose} variant="outlined">Cancel</Button>
            <Button onClick={requestToken} variant="contained" disabled={loading}>
              {loading ? <CircularProgress size={18} /> : 'Get reset token'}
            </Button>
          </>
        )}
        {step === 'reset' && (
          <>
            <Button onClick={() => { setStep('email'); setError(''); }} variant="outlined">Back</Button>
            <Button onClick={resetPassword} variant="contained" disabled={loading}>
              {loading ? <CircularProgress size={18} /> : 'Reset password'}
            </Button>
          </>
        )}
        {step === 'done' && (
          <Button onClick={handleClose} variant="contained" fullWidth>Back to login</Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

export default function Login() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const { loading, error } = useSelector((state) => state.auth);
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  const autofillSx = {
    '& input:-webkit-autofill, & input:-webkit-autofill:hover, & input:-webkit-autofill:focus': {
      WebkitBoxShadow: `0 0 0 100px ${isDark ? '#0f172a' : '#f8fafc'} inset`,
      WebkitTextFillColor: isDark ? '#f1f5f9' : '#0f172a',
      caretColor: isDark ? '#f1f5f9' : '#0f172a',
      borderRadius: 'inherit',
    },
  };

  useEffect(() => {
    const saved = localStorage.getItem('one_saved_credentials');
    if (saved) {
      try {
        const { email, password } = JSON.parse(saved);
        setFormData({ email: email || '', password: password || '' });
        setRememberMe(true);
      } catch {}
    }
  }, []);

  const handleChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rememberMe) {
      localStorage.setItem('one_saved_credentials', JSON.stringify({ email: formData.email, password: formData.password }));
    } else {
      localStorage.removeItem('one_saved_credentials');
    }
    const result = await dispatch(login(formData));
    if (login.fulfilled.match(result)) navigate('/');
  };

  return (
    <>
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        bgcolor: 'background.default',
      }}
    >
      {/* Left panel */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flex: 1,
          background: 'linear-gradient(135deg, #1e1b4b 0%, #4f46e5 60%, #818cf8 100%)',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          p: 6,
          color: '#fff',
        }}
      >
        <Box sx={{ maxWidth: 360, textAlign: 'center' }}>
          <Box
            sx={{
              width: 56, height: 56, borderRadius: 3,
              background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              mx: 'auto', mb: 3,
            }}
          >
            <AccountTree sx={{ fontSize: 30, color: '#fff' }} />
          </Box>
          <Typography variant="h3" fontWeight={700} gutterBottom>
            One
          </Typography>
          <Typography variant="body1" sx={{ opacity: 0.8, lineHeight: 1.7 }}>
            Track strategic initiatives, manage priorities, and visualise your work — all in one place.
          </Typography>
        </Box>
      </Box>

      {/* Right panel */}
      <Box
        sx={{
          flex: { xs: 1, md: '0 0 460px' },
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          p: { xs: 3, sm: 5 },
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 380 }}>
          <Typography variant="h4" fontWeight={700} mb={0.75}>
            Welcome back
          </Typography>
          <Typography variant="body2" color="text.secondary" mb={3.5}>
            Sign in to your account to continue
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2.5 }}>{error}</Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Email address"
              name="email"
              type="email"
              autoComplete="username"
              value={formData.email}
              onChange={handleChange}
              required
              sx={{ mb: 2, ...autofillSx }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><Email sx={{ fontSize: 18, color: 'text.disabled' }} /></InputAdornment>
              }}
            />
            <TextField
              fullWidth
              label="Password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={formData.password}
              onChange={handleChange}
              required
              sx={{ mb: 3, ...autofillSx }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><Lock sx={{ fontSize: 18, color: 'text.disabled' }} /></InputAdornment>,
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowPassword(v => !v)} edge="end">
                      {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  size="small"
                />
              }
              label={<Typography variant="body2">Remember me</Typography>}
              sx={{ mb: 1.5 }}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ py: 1.4 }}
            >
              {loading ? <CircularProgress size={20} color="inherit" /> : 'Sign in'}
            </Button>
          </form>

          <Box textAlign="right" mt={1}>
            <Typography
              variant="body2"
              component="span"
              onClick={() => setForgotOpen(true)}
              sx={{ color: '#6366f1', cursor: 'pointer', fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}
            >
              Forgot password?
            </Typography>
          </Box>

          <Typography variant="body2" color="text.secondary" textAlign="center" mt={2}>
            Don't have an account?{' '}
            <Link to="/register" style={{ color: '#6366f1', fontWeight: 500 }}>Create one</Link>
          </Typography>
        </Box>
      </Box>
    </Box>

    <ForgotPasswordDialog open={forgotOpen} onClose={() => setForgotOpen(false)} />
    </>
  );
}

