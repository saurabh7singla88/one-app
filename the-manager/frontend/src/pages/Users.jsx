import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import {
  Box, Typography, Button, Avatar, Chip, Divider,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, FormControl, InputLabel, Select, MenuItem,
  IconButton, Tooltip, CircularProgress, InputAdornment,
  Table, TableBody, TableCell, TableHead, TableRow, TableContainer,
  Paper, Switch, FormControlLabel,
} from '@mui/material';
import {
  Add, Edit, Delete, Person, Lock, LockOpen, Search, Clear, Visibility, VisibilityOff
} from '@mui/icons-material';
import api from '../api/axios';

const ROLE_CONFIG = {
  ADMIN:   { label: 'Admin',   color: '#7c3aed', bg: '#f5f3ff' },
  MANAGER: { label: 'Manager', color: '#1d4ed8', bg: '#eff6ff' },
  VIEWER:  { label: 'Viewer',  color: '#475569', bg: '#f1f5f9' },
};

const EMPTY_FORM = { name: '', email: '', role: 'VIEWER', password: '', enableLogin: false };

function getInitials(name) {
  return (name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = ['#6366f1', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777'];
function avatarColor(name) {
  let h = 0;
  for (const c of (name || '')) h = (h * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[h];
}

export default function Users() {
  const { user: currentUser } = useSelector(s => s.auth);

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [setPasswordDialog, setSetPasswordDialog] = useState(false);
  const [setPasswordUser, setSetPasswordUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [settingPwd, setSettingPwd] = useState(false);

  const fetchUsers = async () => {
    try {
      const r = await api.get('/users');
      setUsers(r.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, []);

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setShowPassword(false);
    setError('');
    setDialogOpen(true);
  };

  const openEdit = (u) => {
    setEditingUser(u);
    setForm({ name: u.name, email: u.email, role: u.role, password: '', enableLogin: u.hasPassword });
    setShowPassword(false);
    setError('');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.email.trim()) {
      setError('Name and email are required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        role: form.role,
        ...(form.enableLogin && form.password.trim() ? { password: form.password.trim() } : {}),
      };
      if (editingUser) {
        const r = await api.put(`/users/${editingUser.id}`, payload);
        setUsers(prev => prev.map(u => u.id === editingUser.id ? r.data : u));
      } else {
        const r = await api.post('/users', payload);
        setUsers(prev => [...prev, r.data].sort((a, b) => a.name.localeCompare(b.name)));
      }
      setDialogOpen(false);
    } catch (e) {
      setError(e.response?.data?.error || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u) => {
    if (!window.confirm(`Delete ${u.name}? They will be unassigned from all items.`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      setUsers(prev => prev.filter(x => x.id !== u.id));
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to delete user');
    }
  };

  const handleSetPassword = async () => {
    if (!newPassword.trim()) return;
    setSettingPwd(true);
    try {
      const r = await api.put(`/users/${setPasswordUser.id}`, { password: newPassword.trim() });
      setUsers(prev => prev.map(u => u.id === setPasswordUser.id ? r.data : u));
      setSetPasswordDialog(false);
      setNewPassword('');
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to set password');
    } finally {
      setSettingPwd(false);
    }
  };

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Users</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {users.length} member{users.length !== 1 ? 's' : ''} · manage team access
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={openCreate}>New User</Button>
      </Box>

      {/* Search */}
      <Box mb={3}>
        <TextField
          size="small"
          placeholder="Search by name or email…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          sx={{ width: 320 }}
          InputProps={{
            startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: 'text.disabled' }} /></InputAdornment>,
            endAdornment: search ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearch('')}><Clear sx={{ fontSize: 14 }} /></IconButton>
              </InputAdornment>
            ) : null,
          }}
        />
      </Box>

      {/* Table */}
      {loading ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: '1px solid #e2e8f0', borderRadius: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: '#f8fafc' }}>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary', py: 1.5 }}>USER</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary', py: 1.5 }}>EMAIL</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary', py: 1.5 }}>ROLE</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary', py: 1.5 }}>LOGIN</TableCell>
                <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem', color: 'text.secondary', py: 1.5 }}>ADDED</TableCell>
                <TableCell align="right" sx={{ py: 1.5 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.map((u, idx) => (
                <TableRow key={u.id} sx={{ '&:last-child td': { border: 0 }, '&:hover': { bgcolor: '#f8fafc' } }}>
                  <TableCell sx={{ py: 1.5 }}>
                    <Box display="flex" alignItems="center" gap={1.5}>
                      <Avatar sx={{ width: 32, height: 32, fontSize: '0.75rem', bgcolor: avatarColor(u.name), fontWeight: 600 }}>
                        {getInitials(u.name)}
                      </Avatar>
                      <Box>
                        <Typography variant="body2" fontWeight={600}>{u.name}</Typography>
                        {u.id === currentUser?.id && (
                          <Typography variant="caption" sx={{ color: '#6366f1', fontSize: '0.65rem', fontWeight: 600 }}>You</Typography>
                        )}
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ py: 1.5 }}>
                    <Typography variant="body2" color="text.secondary">{u.email}</Typography>
                  </TableCell>
                  <TableCell sx={{ py: 1.5 }}>
                    <Chip
                      label={ROLE_CONFIG[u.role]?.label || u.role}
                      size="small"
                      sx={{
                        height: 20, fontSize: '0.68rem', fontWeight: 600, border: 0,
                        bgcolor: ROLE_CONFIG[u.role]?.bg,
                        color: ROLE_CONFIG[u.role]?.color,
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ py: 1.5 }}>
                    {u.hasPassword ? (
                      <Tooltip title="Can log in">
                        <Box display="flex" alignItems="center" gap={0.5}>
                          <Lock sx={{ fontSize: 14, color: '#059669' }} />
                          <Typography variant="caption" sx={{ color: '#059669', fontWeight: 500 }}>Enabled</Typography>
                        </Box>
                      </Tooltip>
                    ) : (
                      <Tooltip title="Set a password to allow login">
                        <Box
                          display="flex" alignItems="center" gap={0.5} sx={{ cursor: 'pointer' }}
                          onClick={() => { setSetPasswordUser(u); setNewPassword(''); setShowNewPwd(false); setSetPasswordDialog(true); }}
                        >
                          <LockOpen sx={{ fontSize: 14, color: '#f59e0b' }} />
                          <Typography variant="caption" sx={{ color: '#f59e0b', fontWeight: 500, textDecoration: 'underline dotted' }}>Set password</Typography>
                        </Box>
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell sx={{ py: 1.5 }}>
                    <Typography variant="caption" color="text.disabled">
                      {u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ py: 1.5 }}>
                    <Box display="flex" gap={0.5} justifyContent="flex-end">
                      {u.hasPassword && u.id !== currentUser?.id && (
                        <Tooltip title="Reset password">
                          <IconButton size="small" sx={{ color: 'text.disabled', '&:hover': { color: '#6366f1' } }}
                            onClick={() => { setSetPasswordUser(u); setNewPassword(''); setShowNewPwd(false); setSetPasswordDialog(true); }}
                          >
                            <Lock sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Edit">
                        <IconButton size="small" sx={{ color: 'text.disabled', '&:hover': { color: '#6366f1' } }} onClick={() => openEdit(u)}>
                          <Edit sx={{ fontSize: 15 }} />
                        </IconButton>
                      </Tooltip>
                      {u.id !== currentUser?.id && (
                        <Tooltip title="Delete">
                          <IconButton size="small" sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }} onClick={() => handleDelete(u)}>
                            <Delete sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4, color: 'text.disabled' }}>
                    No users found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Info box */}
      <Box mt={2} p={2} sx={{ bgcolor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 2 }}>
        <Typography variant="caption" sx={{ color: '#065f46', lineHeight: 1.8 }}>
          <strong>How login works:</strong> Users without a password can only be assigned to initiatives and tasks.
          Toggle <em>Enable Login</em> when creating a user (and set a password) to let them log in to the app.
          You can also set or reset a password any time using the <Lock sx={{ fontSize: 11, verticalAlign: 'middle' }} /> button.
        </Typography>
      </Box>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ pb: 1, fontWeight: 700 }}>
          {editingUser ? `Edit ${editingUser.name}` : 'New User'}
        </DialogTitle>
        <Divider />
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <TextField
              autoFocus fullWidth size="small" label="Full Name *"
              value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            />
            <TextField
              fullWidth size="small"
              label={form.enableLogin ? 'Email *' : 'Email (optional)'}
              type="email"
              value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
              helperText={!form.enableLogin ? 'Only needed if this person will log in' : ''}
            />
            <FormControl fullWidth size="small">
              <InputLabel>Role</InputLabel>
              <Select value={form.role} label="Role" onChange={e => setForm(p => ({ ...p, role: e.target.value }))}>
                <MenuItem value="ADMIN">
                  <Box>
                    <Typography variant="body2" fontWeight={600} sx={{ color: '#7c3aed' }}>Admin</Typography>
                    <Typography variant="caption" color="text.secondary">Full access</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="MANAGER">
                  <Box>
                    <Typography variant="body2" fontWeight={600} sx={{ color: '#1d4ed8' }}>Manager</Typography>
                    <Typography variant="caption" color="text.secondary">Create & manage initiatives</Typography>
                  </Box>
                </MenuItem>
                <MenuItem value="VIEWER">
                  <Box>
                    <Typography variant="body2" fontWeight={600} sx={{ color: '#475569' }}>Viewer</Typography>
                    <Typography variant="caption" color="text.secondary">Assignee only, read-only access</Typography>
                  </Box>
                </MenuItem>
              </Select>
            </FormControl>

            <Divider />

            <FormControlLabel
              control={
                <Switch
                  checked={form.enableLogin}
                  onChange={e => setForm(p => ({ ...p, enableLogin: e.target.checked, password: '' }))}
                  size="small"
                  sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#6366f1' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#6366f1' } }}
                />
              }
              label={
                <Box>
                  <Typography variant="body2" fontWeight={500}>Enable Login</Typography>
                  <Typography variant="caption" color="text.secondary">Allow this user to sign in to the app</Typography>
                </Box>
              }
            />

            {form.enableLogin && (
              <TextField
                fullWidth size="small"
                label={editingUser ? 'New Password (leave blank to keep current)' : 'Password *'}
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setShowPassword(v => !v)}>
                        {showPassword ? <VisibilityOff sx={{ fontSize: 16 }} /> : <Visibility sx={{ fontSize: 16 }} />}
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
            )}

            {error && (
              <Typography variant="caption" color="error.main" fontWeight={500}>{error}</Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={() => setDialogOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSave} disabled={saving || !form.name.trim() || (form.enableLogin && !form.email.trim())}>
            {saving ? <CircularProgress size={16} /> : editingUser ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Set / Reset Password Dialog */}
      <Dialog open={setPasswordDialog} onClose={() => setSetPasswordDialog(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ pb: 1, fontWeight: 700 }}>
          {setPasswordUser?.hasPassword ? 'Reset Password' : 'Set Password'} — {setPasswordUser?.name}
        </DialogTitle>
        <Divider />
        <DialogContent>
          <Box mt={1}>
            <TextField
              autoFocus fullWidth size="small" label="New Password"
              type={showNewPwd ? 'text' : 'password'}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSetPassword(); }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowNewPwd(v => !v)}>
                      {showNewPwd ? <VisibilityOff sx={{ fontSize: 16 }} /> : <Visibility sx={{ fontSize: 16 }} />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={() => setSetPasswordDialog(false)}>Cancel</Button>
          <Button variant="contained" onClick={handleSetPassword}
            disabled={settingPwd || !newPassword.trim()}
          >
            {settingPwd ? <CircularProgress size={16} /> : 'Set Password'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
