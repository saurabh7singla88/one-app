import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, Link } from 'react-router-dom';
import {
  Box, TextField, Button, Typography, Alert, InputAdornment, IconButton, CircularProgress
} from '@mui/material';
import { Person, Email, Lock, Visibility, VisibilityOff, AccountTree } from '@mui/icons-material';
import { register } from '../features/auth/authSlice';

export default function Register() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { loading, error } = useSelector((state) => state.auth);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [validationError, setValidationError] = useState('');

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setValidationError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password !== formData.confirmPassword) { setValidationError('Passwords do not match'); return; }
    if (formData.password.length < 6) { setValidationError('Password must be at least 6 characters'); return; }
    const { confirmPassword, ...registerData } = formData;
    const result = await dispatch(register(registerData));
    if (register.fulfilled.match(result)) navigate('/');
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', bgcolor: 'background.default' }}>
      {/* Left decorative panel */}
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
          <Typography variant="h3" fontWeight={700} gutterBottom>One</Typography>
          <Typography variant="body1" sx={{ opacity: 0.8, lineHeight: 1.7 }}>
            Your strategic command centre for initiatives, tasks, and priorities.
          </Typography>
        </Box>
      </Box>

      {/* Right form panel */}
      <Box
        sx={{
          flex: { xs: 1, md: '0 0 460px' },
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          p: { xs: 3, sm: 5 },
        }}
      >
        <Box sx={{ width: '100%', maxWidth: 380 }}>
          <Typography variant="h4" fontWeight={700} mb={0.75}>Create account</Typography>
          <Typography variant="body2" color="text.secondary" mb={3.5}>
            Get started — it only takes a minute
          </Typography>

          {(error || validationError) && (
            <Alert severity="error" sx={{ mb: 2.5 }}>{validationError || error}</Alert>
          )}

          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth label="Full name" name="name" value={formData.name}
              onChange={handleChange} required sx={{ mb: 2 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><Person sx={{ fontSize: 18, color: 'text.disabled' }} /></InputAdornment> }}
            />
            <TextField
              fullWidth label="Email address" name="email" type="email" value={formData.email}
              onChange={handleChange} required sx={{ mb: 2 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><Email sx={{ fontSize: 18, color: 'text.disabled' }} /></InputAdornment> }}
            />
            <TextField
              fullWidth label="Password" name="password"
              type={showPassword ? 'text' : 'password'}
              value={formData.password} onChange={handleChange} required sx={{ mb: 2 }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><Lock sx={{ fontSize: 18, color: 'text.disabled' }} /></InputAdornment>,
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowPassword(v => !v)} edge="end">
                      {showPassword ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              fullWidth label="Confirm password" name="confirmPassword"
              type={showPassword ? 'text' : 'password'}
              value={formData.confirmPassword} onChange={handleChange} required sx={{ mb: 3 }}
              InputProps={{ startAdornment: <InputAdornment position="start"><Lock sx={{ fontSize: 18, color: 'text.disabled' }} /></InputAdornment> }}
            />
            <Button type="submit" fullWidth variant="contained" size="large" disabled={loading} sx={{ py: 1.4 }}>
              {loading ? <CircularProgress size={20} color="inherit" /> : 'Create account'}
            </Button>
          </form>

          <Typography variant="body2" color="text.secondary" textAlign="center" mt={3}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: '#6366f1', fontWeight: 500 }}>Sign in</Link>
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
