import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import {
  Box, Typography, Button, IconButton, TextField, Chip,
  CircularProgress, Divider, Tooltip, InputAdornment,
  Dialog, DialogTitle, DialogContent, DialogActions,
  Menu, MenuItem,
} from '@mui/material';
import {
  Add, Delete, Lock, LockOpen, LockOutlined, Search, Clear,
  NoteAlt, CheckCircle, ChevronRight, ExpandMore, SubdirectoryArrowRight,
  Dashboard, EnhancedEncryption,
} from '@mui/icons-material';
import { format } from 'date-fns';
import api from '../api/axios';
import CanvasSelector from '../components/CanvasSelector';
import { fetchCanvases } from '../features/canvas/canvasSlice';
import RephraseTool from '../components/RephraseTool';
import TipTapEditor from '../components/TipTapEditor';

// ── helpers ───────────────────────────────────────────────────────────────────
function timeAgo(iso) {
  const d = new Date(iso);
  const diff = Math.floor((Date.now() - d) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return format(d, 'MMM d');
}
// Build a forest (array of root nodes) from a flat list; each node gets a .children[] array
function buildTree(flatNotes) {
  const map = {};
  flatNotes.forEach(n => (map[n.id] = { ...n, children: [] }));
  const roots = [];
  flatNotes.forEach(n => {
    if (n.parentId && map[n.parentId]) {
      map[n.parentId].children.push(map[n.id]);
    } else {
      roots.push(map[n.id]);
    }
  });
  return roots;
}

// Walk up the tree and collect all ancestor IDs for a given note
function getAncestorIds(noteId, flatNotes) {
  const map = {};
  flatNotes.forEach(n => (map[n.id] = n));
  const ids = [];
  let cur = map[noteId];
  while (cur?.parentId && map[cur.parentId]) {
    ids.push(cur.parentId);
    cur = map[cur.parentId];
  }
  return ids;
}
// ── Global password management dialog ────────────────────────────────────────
// Handles: set / change / remove
function PasswordMgmtDialog({ open, hasPassword, onClose, onSuccess }) {
  const [step, setStep] = useState('menu'); // 'menu' | 'set' | 'change' | 'remove'
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) { setStep(hasPassword ? 'menu' : 'set'); setCurrent(''); setNext(''); setConfirm(''); setError(''); }
  }, [open, hasPassword]);

  const submit = async () => {
    setError('');
    if ((step === 'set' || step === 'change') && next !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      if (step === 'set') {
        if (!next) { setError('Enter a password'); setLoading(false); return; }
        await api.put('/notes/password', { action: 'set', password: next });
      } else if (step === 'change') {
        if (!current || !next) { setError('Fill all fields'); setLoading(false); return; }
        await api.put('/notes/password', { action: 'change', currentPassword: current, password: next });
      } else if (step === 'remove') {
        if (!current) { setError('Enter current password'); setLoading(false); return; }
        await api.put('/notes/password', { action: 'remove', currentPassword: current });
      }
      onSuccess(step);
    } catch (e) {
      setError(e.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const titles = { menu: 'Password protection', set: 'Set a password', change: 'Change password', remove: 'Remove password' };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{titles[step]}</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {step === 'menu' ? (
          <Box display="flex" flexDirection="column" gap={1.5} pt={0.5}>
            <Button fullWidth variant="outlined" onClick={() => { setStep('change'); setError(''); }}>Change password</Button>
            <Button fullWidth variant="outlined" color="error" onClick={() => { setStep('remove'); setError(''); }}>Remove password</Button>
          </Box>
        ) : (
          <Box display="flex" flexDirection="column" gap={2} pt={0.5}>
            {(step === 'change' || step === 'remove') && (
              <TextField
                autoFocus fullWidth type="password" label="Current password"
                value={current} onChange={e => setCurrent(e.target.value)}
                inputProps={{ autoComplete: 'new-password' }}
                onKeyDown={e => { if (e.key === 'Enter' && step === 'remove') submit(); }}
              />
            )}
            {(step === 'set' || step === 'change') && (
              <TextField
                autoFocus={step === 'set'} fullWidth type="password" label="New password"
                value={next} onChange={e => { setNext(e.target.value); setError(''); }}
                inputProps={{ autoComplete: 'new-password' }}
              />
            )}
            {(step === 'set' || step === 'change') && (
              <TextField
                fullWidth type="password" label="Confirm new password"
                value={confirm} onChange={e => { setConfirm(e.target.value); setError(''); }}
                inputProps={{ autoComplete: 'new-password' }}
                error={!!error && error === 'Passwords do not match'}
                onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              />
            )}
            {error && <Typography variant="caption" color="error">{error}</Typography>}
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={step === 'menu' ? onClose : () => { setStep(hasPassword ? 'menu' : 'set'); setError(''); }} variant="outlined">
          {step === 'menu' ? 'Close' : 'Back'}
        </Button>
        {step !== 'menu' && (
          <Button onClick={submit} variant="contained" color={step === 'remove' ? 'error' : 'primary'} disabled={loading}>
            {loading ? <CircularProgress size={18} /> : step === 'remove' ? 'Remove' : 'Save'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

// ── Unlock screen ─────────────────────────────────────────────────────────────
function UnlockScreen({ onUnlocked, encryptionEnabled }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!pw) return;
    setError('');
    setLoading(true);
    try {
      await api.post('/notes/unlock', { password: pw });
      onUnlocked();
    } catch (e) {
      setError(e.response?.data?.error || 'Incorrect password');
      setLoading(false);
    }
  };

  return (
    <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100%" gap={2.5}>
      <Lock sx={{ fontSize: 56, color: '#94a3b8' }} />
      <Typography variant="h6" fontWeight={700} color="text.secondary">Notes are protected</Typography>
      <Typography variant="body2" color="text.disabled">Enter your password to unlock</Typography>
      {encryptionEnabled && (
        <Box display="flex" alignItems="center" gap={0.75} px={1.5} py={0.75}
          sx={{ bgcolor: '#f0f4ff', borderRadius: 1.5, border: '1px solid #e0e7ff' }}>
          <EnhancedEncryption sx={{ fontSize: 15, color: '#6366f1', flexShrink: 0 }} />
          <Typography variant="caption" sx={{ color: '#4f46e5' }}>Protected notes are AES-256-GCM encrypted at rest</Typography>
        </Box>
      )}
      <Box display="flex" flexDirection="column" alignItems="center" gap={1.5} width={280}>
        <TextField
          autoFocus fullWidth type="password" label="Password" size="small"
          value={pw} onChange={e => setPw(e.target.value)}
          error={!!error} helperText={error || ''}
          inputProps={{ autoComplete: 'new-password' }}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        />
        <Button fullWidth variant="contained" onClick={submit} disabled={loading || !pw}
          startIcon={loading ? <CircularProgress size={16} /> : <LockOpen />}
          sx={{ borderRadius: 2, textTransform: 'none' }}>
          Unlock
        </Button>
      </Box>
    </Box>
  );
}
// ── Per-note unlock dialog ──────────────────────────────────────────────
function NoteUnlockDialog({ note, open, onClose, onUnlocked, encryptionEnabled }) {
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) { setPw(''); setError(''); }
  }, [open]);

  const submit = async () => {
    if (!pw || !note) return;
    setLoading(true);
    setError('');
    try {
      const r = await api.post(`/notes/${note.id}/unlock`, { password: pw });
      onUnlocked(r.data);
    } catch (e) {
      setError(e.response?.data?.error || 'Incorrect password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
        <Lock sx={{ color: '#6366f1', fontSize: 20 }} /> Unlock note
      </DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        <Typography variant="body2" color="text.secondary" mb={encryptionEnabled ? 1.5 : 2}>
          "{note?.title}" is protected. Enter your login password to open it.
        </Typography>
        {encryptionEnabled && (
          <Box display="flex" alignItems="center" gap={0.75} mb={2} px={1.25} py={0.75}
            sx={{ bgcolor: '#f0f4ff', borderRadius: 1.5, border: '1px solid #e0e7ff' }}>
            <EnhancedEncryption sx={{ fontSize: 15, color: '#6366f1', flexShrink: 0 }} />
            <Typography variant="caption" sx={{ color: '#4f46e5', lineHeight: 1.4 }}>
              Content is AES-256-GCM encrypted at rest
            </Typography>
          </Box>
        )}
        <TextField
          autoFocus fullWidth type="password" label="Password" size="small"
          value={pw} onChange={e => { setPw(e.target.value); setError(''); }}
          error={!!error} helperText={error || ''}
          inputProps={{ autoComplete: 'new-password' }}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} variant="outlined">Cancel</Button>
        <Button onClick={submit} variant="contained" disabled={loading || !pw}
          startIcon={loading ? <CircularProgress size={16} /> : <LockOpen />}>
          Unlock
        </Button>
      </DialogActions>
    </Dialog>
  );
}
// ── NoteTreeItem — renders one node and its children recursively ───────────────
function NoteTreeItem({ note, depth, selectedId, onSelect, onAddChild, expandedIds, onToggle, canvases, onAssignCanvas }) {
  const isExpanded = expandedIds.has(note.id);
  const hasChildren = note.children?.length > 0;
  const active = selectedId === note.id;
  const canvas = depth === 0 ? canvases.find(c => c.id === note.canvasId) : null;
  const [canvasAnchor, setCanvasAnchor] = useState(null);

  return (
    <>
      <Box
        onClick={() => onSelect(note)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5,
          pl: `${6 + depth * 14}px`, pr: 0.5,
          py: 0.85, cursor: 'pointer',
          borderLeft: '3px solid',
          borderLeftColor: active ? '#6366f1' : 'transparent',
          bgcolor: active ? '#f5f3ff' : 'transparent',
          borderBottom: '1px solid #f1f5f9',
          '&:hover': { bgcolor: active ? '#f5f3ff' : '#f8fafc' },
          '&:hover .note-add-btn': { opacity: 1 },
        }}
      >
        {/* Expand/collapse toggle — always reserves 18 px */}
        <Box sx={{ width: 18, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {hasChildren ? (
            <IconButton size="small" onClick={e => { e.stopPropagation(); onToggle(note.id); }}
              sx={{ p: 0, color: 'text.secondary' }}>
              {isExpanded ? <ExpandMore sx={{ fontSize: 15 }} /> : <ChevronRight sx={{ fontSize: 15 }} />}
            </IconButton>
          ) : depth > 0 ? (
            <Box sx={{ width: 4, height: 4, borderRadius: '50%', bgcolor: '#d1d5db', mx: 'auto' }} />
          ) : null}
        </Box>

        {/* Title + meta */}
        <Box sx={{ flex: 1, overflow: 'hidden', pl: 0.25, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography
              variant="body2"
              fontWeight={active ? 700 : depth === 0 ? 600 : 500}
              sx={{
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: active ? '#4f46e5' : 'text.primary',
                fontSize: depth === 0 ? '0.875rem' : `${Math.max(0.78, 0.875 - depth * 0.025)}rem`,
                lineHeight: 1.4, flex: 1, minWidth: 0,
              }}
            >
              {note.title}
            </Typography>
            {note.isProtected && <Lock sx={{ fontSize: 11, color: active ? '#a5b4fc' : '#94a3b8', flexShrink: 0 }} />}
          </Box>
          {depth === 0 && (
            <Box display="flex" alignItems="center" gap={0.75} mt={0.15} flexWrap="wrap">
              <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.65rem' }}>
                {timeAgo(note.updatedAt)}
              </Typography>
              {canvas && (
                <Chip label={canvas.name} size="small"
                  sx={{ height: 14, fontSize: '0.6rem', bgcolor: canvas.color + '22', color: canvas.color, border: 'none', fontWeight: 600 }} />
              )}
            </Box>
          )}
        </Box>

        {/* Canvas assign button — revealed on hover, root notes only */}
        {depth === 0 && (
          <Tooltip title={canvas ? `Canvas: ${canvas.name} — click to change` : 'Assign to canvas'} placement="right">
            <IconButton
              className="note-add-btn"
              size="small"
              onClick={e => { e.stopPropagation(); setCanvasAnchor(e.currentTarget); }}
              sx={{ opacity: 0, transition: 'opacity 0.15s', p: 0.3, color: canvas ? canvas.color : '#94a3b8', flexShrink: 0 }}
            >
              <Dashboard sx={{ fontSize: 13 }} />
            </IconButton>
          </Tooltip>
        )}
        {/* Add-child button — revealed on hover */}
        <Tooltip title="Add child note" placement="right">
          <IconButton
            className="note-add-btn"
            size="small"
            onClick={e => { e.stopPropagation(); onAddChild(note.id); }}
            sx={{ opacity: 0, transition: 'opacity 0.15s', p: 0.3, color: '#94a3b8', flexShrink: 0 }}
          >
            <Add sx={{ fontSize: 13 }} />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Canvas picker menu */}
      <Menu anchorEl={canvasAnchor} open={!!canvasAnchor} onClose={() => setCanvasAnchor(null)}
        PaperProps={{ sx: { borderRadius: 2, minWidth: 160 } }}>
        <MenuItem dense onClick={() => { onAssignCanvas(note.id, null); setCanvasAnchor(null); }}>
          <Typography variant="body2" color="text.secondary">None</Typography>
        </MenuItem>
        {canvases.map(c => (
          <MenuItem key={c.id} dense onClick={() => { onAssignCanvas(note.id, c.id); setCanvasAnchor(null); }}
            selected={note.canvasId === c.id}>
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: c.color, mr: 1, flexShrink: 0 }} />
            <Typography variant="body2">{c.name}</Typography>
          </MenuItem>
        ))}
      </Menu>

      {/* Recurse into children */}
      {isExpanded && hasChildren && note.children.map(child => (
        <NoteTreeItem
          key={child.id} note={child} depth={depth + 1}
          selectedId={selectedId} onSelect={onSelect} onAddChild={onAddChild}
          expandedIds={expandedIds} onToggle={onToggle} canvases={canvases} onAssignCanvas={onAssignCanvas}
        />
      ))}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Notes() {
  const dispatch = useDispatch();
  const { activeCanvasId, canvases } = useSelector(s => ({
    activeCanvasId: s.canvas.activeCanvasId.notes,
    canvases: s.canvas.canvases,
  }));

  // Global password state
  const [hasPassword, setHasPassword] = useState(false);
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [pwMgmtOpen, setPwMgmtOpen] = useState(false);

  // Per-note lock state
  const [unlockTarget, setUnlockTarget] = useState(null);
  const [unlockedNoteIds, setUnlockedNoteIds] = useState(() => new Set());

  // Flat list of all user notes (includes parentId)
  const [allNotes, setAllNotes] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [search, setSearch] = useState('');
  const searchTimer = useRef(null);

  // Tree expand/collapse state
  const [expandedIds, setExpandedIds] = useState(new Set());

  // Selected / editor state
  const [selectedId, setSelectedId] = useState(null);
  const [editorNote, setEditorNote] = useState(null);
  const [saveState, setSaveState] = useState('saved');
  const saveTimer = useRef(null);
  const editorRef = useRef(null);
  const openNoteSeq = useRef(0);
  // Cache of decrypted content for protected notes — server GET /notes/:id always
  // returns content:null for protected notes; this avoids a blank editor on re-navigation.
  const unlockedNoteCache = useRef(new Map());

  // Delete confirm / creating
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [creating, setCreating] = useState(false);

  // Canvas assignment menu
  const [canvasMenuAnchor, setCanvasMenuAnchor] = useState(null);

  // ── Load settings ──────────────────────────────────────────────────────────
  useEffect(() => {
    dispatch(fetchCanvases());
    api.get('/notes/settings').then(r => {
      setHasPassword(r.data.hasPassword);
      setEncryptionEnabled(!!r.data.encryptionEnabled);
      if (!r.data.hasPassword) setIsUnlocked(true);
    }).catch(console.error);
  }, [dispatch]);

  // ── Fetch ALL notes flat (canvas filtering is client-side) ─────────────────
  const fetchNotes = useCallback(async (s = '') => {
    setListLoading(true);
    try {
      const params = {};
      if (s) params.search = s;
      const r = await api.get('/notes', { params });
      setAllNotes(r.data);
    } catch (e) {
      console.error(e);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isUnlocked) fetchNotes();
  }, [isUnlocked]); // eslint-disable-line

  useEffect(() => {
    if (!isUnlocked) return;
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => fetchNotes(search), 300);
  }, [search]); // eslint-disable-line

  // ── Derived data ───────────────────────────────────────────────────────────
  // Forest of root nodes, filtered by active canvas (canvas filter on roots only)
  const visibleTree = useMemo(() => {
    if (search) return [];
    const forest = buildTree(allNotes);
    if (!activeCanvasId) return forest;
    return forest.filter(root => root.canvasId === activeCanvasId);
  }, [allNotes, activeCanvasId, search]);

  // Flat search results across all canvases
  const flatSearchResults = useMemo(() => {
    if (!search) return [];
    return allNotes.filter(n => n.title.toLowerCase().includes(search.toLowerCase()));
  }, [allNotes, search]);

  // Note counts per canvas — root notes only (for CanvasSelector badges)
  const noteCounts = useMemo(() => {
    const map = {};
    allNotes.filter(n => !n.parentId).forEach(n => {
      if (n.canvasId) map[n.canvasId] = (map[n.canvasId] || 0) + 1;
    });
    return map;
  }, [allNotes]);

  // ── Expand helpers ─────────────────────────────────────────────────────────
  const expandAncestors = useCallback((noteId, flat) => {
    const ids = getAncestorIds(noteId, flat);
    if (!ids.length) return;
    setExpandedIds(prev => { const s = new Set(prev); ids.forEach(id => s.add(id)); return s; });
  }, []);

  const toggleExpand = useCallback((id) => {
    setExpandedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }, []);

  // Keep cache in sync: whenever editorNote changes (including content edits) for a
  // protected note, persist the latest full note object so re-navigation can use it.
  useEffect(() => {
    if (editorNote?.isProtected) {
      unlockedNoteCache.current.set(editorNote.id, editorNote);
    }
  }, [editorNote]);

  // ── Open note ──────────────────────────────────────────────────
  const openNote = useCallback(async (note) => {
    if (note.isProtected && !unlockedNoteIds.has(note.id)) {
      setUnlockTarget(note);
      return;
    }
    // Protected notes: server GET returns content:null — use the in-session cache instead.
    if (note.isProtected && unlockedNoteCache.current.has(note.id)) {
      setSelectedId(note.id);
      setSaveState('saved');
      expandAncestors(note.id, allNotes);
      setEditorNote(unlockedNoteCache.current.get(note.id));
      return;
    }
    // Non-protected notes: fetch normally with stale-response guard.
    const seq = ++openNoteSeq.current;
    setSelectedId(note.id);
    setSaveState('saved');
    expandAncestors(note.id, allNotes);
    try {
      const r = await api.get(`/notes/${note.id}`);
      if (seq !== openNoteSeq.current) return; // stale — a newer openNote already fired
      setEditorNote(r.data);
    } catch (e) {
      if (seq === openNoteSeq.current) console.error(e);
    }
  }, [allNotes, expandAncestors, unlockedNoteIds]);

  // ── Create note (root when parentId=null, child otherwise) ─────────────────
  const handleCreate = useCallback(async (parentId = null) => {
    setCreating(true);
    try {
      // Child notes inherit their root ancestor's canvasId
      let canvasId = activeCanvasId || null;
      if (parentId) {
        const map = {};
        allNotes.forEach(n => (map[n.id] = n));
        let cur = map[parentId];
        while (cur?.parentId && map[cur.parentId]) cur = map[cur.parentId];
        canvasId = cur?.canvasId || null;
      }

      const r = await api.post('/notes', { title: 'Untitled Note', content: '', parentId: parentId || null, canvasId });
      const newNote = r.data;
      setAllNotes(prev => [newNote, ...prev]);

      // Auto-expand parent + all its ancestors
      if (parentId) {
        setExpandedIds(prev => {
          const s = new Set(prev);
          s.add(parentId);
          getAncestorIds(parentId, allNotes).forEach(id => s.add(id));
          return s;
        });
      }

      setSelectedId(newNote.id);
      setEditorNote({ ...newNote, content: '' });
      setSaveState('saved');
    } catch (e) {
      console.error(e);
    } finally {
      setCreating(false);
    }
  }, [activeCanvasId, allNotes]);

  // ── Auto-save ──────────────────────────────────────────────────────────────
  const persistSave = useCallback(async (id, data) => {
    setSaveState('saving');
    try {
      const r = await api.put(`/notes/${id}`, data);
      setAllNotes(prev => prev.map(n => n.id === id ? { ...n, title: r.data.title, updatedAt: r.data.updatedAt } : n));
      setSaveState('saved');
    } catch { setSaveState('error'); }
  }, []);

  const handleEditorChange = useCallback((field, value) => {
    if (!editorNote) return;
    setEditorNote(prev => ({ ...prev, [field]: value }));
    setSaveState('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persistSave(editorNote.id, { [field]: value }), 1000);
  }, [editorNote, persistSave]);
  // ── Per-note lock ───────────────────────────────────────────────────────
  const handleNoteUnlocked = useCallback((fullNote) => {
    setUnlockedNoteIds(prev => { const s = new Set(prev); s.add(fullNote.id); return s; });
    setUnlockTarget(null);
    setSelectedId(fullNote.id);
    setSaveState('saved');
    expandAncestors(fullNote.id, allNotes);
    setEditorNote(fullNote);
  }, [allNotes, expandAncestors]);

  const handleToggleLock = useCallback(async () => {
    if (!editorNote) return;
    const newProtected = !editorNote.isProtected;
    try {
      const r = await api.put(`/notes/${editorNote.id}`, { isProtected: newProtected });
      setEditorNote(prev => ({ ...prev, isProtected: r.data.isProtected }));
      setAllNotes(prev => prev.map(n => n.id === editorNote.id ? { ...n, isProtected: r.data.isProtected } : n));
      if (newProtected) {
        setUnlockedNoteIds(prev => { const s = new Set(prev); s.delete(editorNote.id); return s; });
      }
    } catch (e) { console.error(e); }
  }, [editorNote]);
  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!editorNote) return;
    try {
      await api.delete(`/notes/${editorNote.id}`);
      // Remove the note + all its descendants from local state (DB cascade handles the rest)
      const toDelete = new Set();
      const collect = (id) => {
        toDelete.add(id);
        allNotes.filter(n => n.parentId === id).forEach(n => collect(n.id));
      };
      collect(editorNote.id);
      setAllNotes(prev => prev.filter(n => !toDelete.has(n.id)));
      setEditorNote(null);
      setSelectedId(null);
      setDeleteConfirm(false);
    } catch (e) { console.error(e); }
  };

  // ── Canvas assignment ────────────────────────────────────────────────────
  const handleAssignCanvas = useCallback(async (noteId, canvasId) => {
    setCanvasMenuAnchor(null);
    try {
      const r = await api.put(`/notes/${noteId}`, { canvasId: canvasId || null });
      setAllNotes(prev => prev.map(n => n.id === noteId ? { ...n, canvasId: r.data.canvasId } : n));
      setEditorNote(prev => prev?.id === noteId ? { ...prev, canvasId: r.data.canvasId } : prev);
    } catch (e) { console.error(e); }
  }, []);

  // ── Password management ────────────────────────────────────────────────────
  const handlePwSuccess = (step) => {
    if (step === 'set') { setHasPassword(true); setIsUnlocked(true); }
    else if (step === 'remove') { setHasPassword(false); setIsUnlocked(true); }
    setPwMgmtOpen(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Box sx={{ height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column', gap: 0 }}>
      <CanvasSelector screen="notes" countsByCanvas={noteCounts} />

      <Box sx={{ display: 'flex', flex: 1, gap: 0, overflow: 'hidden', borderRadius: 3, border: '1px solid #e2e8f0', bgcolor: 'background.paper' }}>

        {/* ── Left panel ── */}
        <Box sx={{ width: 280, flexShrink: 0, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box sx={{ px: 2, pt: 2, pb: 1.5 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={1.5}>
              <Typography fontWeight={700} variant="subtitle1">Notes</Typography>
              <Box display="flex" gap={0.5}>
                <Button size="small" variant="contained"
                  startIcon={creating ? <CircularProgress size={14} /> : <Add />}
                  onClick={() => handleCreate(null)} disabled={creating || !isUnlocked}
                  sx={{ borderRadius: 2, textTransform: 'none', fontSize: '0.78rem', py: 0.5 }}>
                  New
                </Button>
              </Box>
            </Box>
            <TextField
              size="small" fullWidth placeholder="Search notes…" value={search}
              onChange={e => setSearch(e.target.value)} disabled={!isUnlocked}
              inputProps={{ autoComplete: 'off' }}
              InputProps={{
                startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 16, color: 'text.disabled' }} /></InputAdornment>,
                endAdornment: search ? (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearch('')}><Clear sx={{ fontSize: 14 }} /></IconButton>
                  </InputAdornment>
                ) : null,
              }}
            />
          </Box>
          <Divider />

          {/* ── List / Tree ── */}
          <Box sx={{ flex: 1, overflowY: 'auto' }}>
            {!isUnlocked ? (
              <Box textAlign="center" pt={6} px={2}>
                <Lock sx={{ fontSize: 36, color: '#c7d2fe', mb: 1 }} />
                <Typography variant="body2" color="text.disabled">Unlock to view notes</Typography>
              </Box>
            ) : listLoading ? (
              <Box display="flex" justifyContent="center" pt={4}><CircularProgress size={24} /></Box>
            ) : search ? (
              // Flat search results
              flatSearchResults.length === 0 ? (
                <Box textAlign="center" pt={6} px={2}>
                  <NoteAlt sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">No notes match your search</Typography>
                </Box>
              ) : (
                flatSearchResults.map(note => {
                  const active = selectedId === note.id;
                  const canvas = canvases.find(c => c.id === note.canvasId);
                  return (
                    <Box key={note.id} onClick={() => openNote(note)}
                      sx={{
                        px: 2, py: 1.5, cursor: 'pointer', borderLeft: '3px solid',
                        borderLeftColor: active ? '#6366f1' : 'transparent',
                        bgcolor: active ? '#f5f3ff' : 'transparent',
                        borderBottom: '1px solid #f1f5f9',
                        '&:hover': { bgcolor: active ? '#f5f3ff' : '#f8fafc' },
                      }}>
                      <Typography variant="body2" fontWeight={600}
                        sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: active ? '#4f46e5' : 'text.primary' }}>
                        {note.title}
                      </Typography>
                      <Box display="flex" alignItems="center" gap={0.75} mt={0.4} flexWrap="wrap">
                        <Typography variant="caption" color="text.disabled">{timeAgo(note.updatedAt)}</Typography>
                        {canvas && (
                          <Chip label={canvas.name} size="small"
                            sx={{ height: 16, fontSize: '0.6rem', bgcolor: canvas.color + '22', color: canvas.color, border: 'none', fontWeight: 600 }} />
                        )}
                      </Box>
                    </Box>
                  );
                })
              )
            ) : (
              // Tree mode
              visibleTree.length === 0 ? (
                <Box textAlign="center" pt={6} px={2}>
                  <NoteAlt sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                  <Typography variant="body2" color="text.secondary">No notes yet. Click New to start.</Typography>
                </Box>
              ) : (
                visibleTree.map(root => (
                  <NoteTreeItem
                    key={root.id}
                    note={root}
                    depth={0}
                    selectedId={selectedId}
                    onSelect={openNote}
                    onAddChild={handleCreate}
                    expandedIds={expandedIds}
                    onToggle={toggleExpand}
                    canvases={canvases}
                    onAssignCanvas={handleAssignCanvas}
                  />
                ))
              )
            )}
          </Box>
        </Box>

        {/* ── Right panel ── */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!isUnlocked ? (
            <UnlockScreen onUnlocked={() => { setIsUnlocked(true); fetchNotes(); }} encryptionEnabled={encryptionEnabled} />
          ) : !editorNote ? (
            <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height="100%" color="text.disabled">
              <NoteAlt sx={{ fontSize: 56, mb: 2 }} />
              <Typography variant="body1" color="text.secondary">Select a note to view or edit it</Typography>
              <Typography variant="caption" color="text.disabled" mt={0.5}>or click New to create one</Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Toolbar */}
              <Box sx={{ px: 3, py: 1.5, borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 1, bgcolor: '#fafafa' }}>
                <Box display="flex" alignItems="center" gap={0.75} sx={{ flex: 1 }}>
                  {saveState === 'saving' && <><CircularProgress size={12} /><Typography variant="caption" color="text.disabled">Saving…</Typography></>}
                  {saveState === 'saved'  && <><CheckCircle sx={{ fontSize: 14, color: '#22c55e' }} /><Typography variant="caption" color="text.disabled">Saved</Typography></>}
                  {saveState === 'error'  && <Typography variant="caption" color="error">Save failed</Typography>}
                </Box>
                {/* Canvas assignment */}
                {(() => {
                  const assignedCanvas = canvases.find(c => c.id === editorNote.canvasId);
                  return (
                    <Tooltip title={assignedCanvas ? `Canvas: ${assignedCanvas.name} — click to change` : 'Assign to canvas'}>
                      <IconButton
                        size="small"
                      onClick={e => setCanvasMenuAnchor(e.currentTarget)}
                        sx={{
                          color: assignedCanvas ? assignedCanvas.color : 'text.disabled',
                          bgcolor: assignedCanvas ? assignedCanvas.color + '18' : 'transparent',
                          '&:hover': { bgcolor: assignedCanvas ? assignedCanvas.color + '30' : '#f0f4ff', color: assignedCanvas ? assignedCanvas.color : '#6366f1' },
                          borderRadius: 1.5,
                        }}
                      >
                        <Dashboard sx={{ fontSize: 17 }} />
                      </IconButton>
                    </Tooltip>
                  );
                })()}
                <Tooltip title={editorNote.isProtected ? (encryptionEnabled ? 'Protected — content AES-256 encrypted at rest. Click to remove.' : 'Protected. Click to remove.') : 'Lock note (uses login password)'}>
                  <IconButton size="small" onClick={handleToggleLock}
                    sx={{ color: editorNote.isProtected ? '#6366f1' : 'text.disabled', '&:hover': { color: '#6366f1', bgcolor: '#f0f4ff' }, borderRadius: 1.5 }}>
                    {editorNote.isProtected ? <Lock sx={{ fontSize: 17 }} /> : <LockOpen sx={{ fontSize: 17 }} />}
                  </IconButton>
                </Tooltip>
                {editorNote.isProtected && encryptionEnabled && (
                  <Tooltip title="Note content is AES-256-GCM encrypted before storing in the database">
                    <Chip
                      icon={<EnhancedEncryption sx={{ fontSize: '13px !important' }} />}
                      label="Encrypted"
                      size="small"
                      sx={{ height: 20, fontSize: '0.65rem', bgcolor: '#f0f4ff', color: '#4f46e5', border: '1px solid #c7d2fe', cursor: 'default',
                        '& .MuiChip-icon': { color: '#6366f1', ml: '6px' },
                        '& .MuiChip-label': { px: '6px' },
                      }}
                    />
                  </Tooltip>
                )}
                <Tooltip title="Delete note (and all children)">
                  <IconButton size="small" onClick={() => setDeleteConfirm(true)} sx={{ color: 'text.disabled', '&:hover': { color: '#dc2626', bgcolor: '#fef2f2' }, borderRadius: 1.5 }}>
                    <Delete sx={{ fontSize: 17 }} />
                  </IconButton>
                </Tooltip>
              </Box>
              {/* Breadcrumb */}
              {editorNote.parentId && (() => {
                const ancestorIds = getAncestorIds(editorNote.id, allNotes).reverse();
                const ancestors = ancestorIds.map(id => allNotes.find(n => n.id === id)).filter(Boolean);
                return ancestors.length > 0 ? (
                  <Box sx={{ px: 3, pt: 2, pb: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.25 }}>
                    {ancestors.map((anc, i) => (
                      <Box key={anc.id} display="flex" alignItems="center">
                        {i > 0 && <ChevronRight sx={{ fontSize: 14, color: 'text.disabled', mx: 0.25 }} />}
                        <Typography
                          variant="caption"
                          sx={{ color: '#6366f1', cursor: 'pointer', fontWeight: 500, '&:hover': { textDecoration: 'underline' } }}
                          onClick={() => openNote(anc)}
                        >
                          {anc.title || 'Untitled'}
                        </Typography>
                      </Box>
                    ))}
                    <ChevronRight sx={{ fontSize: 14, color: 'text.disabled', mx: 0.25 }} />
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>{editorNote.title || 'Untitled'}</Typography>
                  </Box>
                ) : null;
              })()}
              {/* Title */}
              <Box sx={{ px: 3, pt: editorNote.parentId ? 1.5 : 2.5, pb: 0 }}>
                <TextField
                  fullWidth variant="standard" placeholder="Note title…"
                  value={editorNote.title} onChange={e => handleEditorChange('title', e.target.value)}
                  InputProps={{
                    disableUnderline: true,
                    sx: {
                      fontSize: '1.65rem', fontWeight: 700, lineHeight: 1.3,
                      letterSpacing: '-0.01em',
                      '&:hover::after': { content: 'none' },
                    },
                  }}
                  sx={{
                    '& .MuiInputBase-root': {
                      borderBottom: '2px solid transparent',
                      transition: 'border-color 0.15s',
                      '&.Mui-focused': { borderBottom: '2px solid #6366f1' },
                    },
                  }}
                />
                <Typography variant="caption" color="text.disabled" mt={0.75} display="block">
                  Last edited {format(new Date(editorNote.updatedAt), 'MMM d, yyyy · h:mm a')}
                </Typography>
              </Box>
              <Divider sx={{ mx: 3, my: 1.5 }} />
              {/* Body */}
              <Box sx={{ flex: 1, px: 3, pb: 3, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box sx={{ position: 'relative' }}>
                  <TipTapEditor
                    ref={editorRef}
                    key={editorNote.id}
                    content={editorNote.content}
                    onChange={v => handleEditorChange('content', v)}
                    placeholder="Start writing…"
                    minHeight={320}
                    fontSize="1rem"
                  />
                  <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 0.75 }}>
                    <RephraseTool
                      text={editorRef.current?.getText() ?? ''}
                      onApply={v => {
                        editorRef.current?.setContent(v);
                        handleEditorChange('content', v);
                      }}
                    />
                  </Box>
                </Box>
                {/* Sub-notes section */}
                {(() => {
                  const children = allNotes.filter(n => n.parentId === editorNote.id);
                  return (
                    <Box sx={{ mt: 1, borderTop: '1px solid #f1f5f9', pt: 2 }}>
                      <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
                        <Box display="flex" alignItems="center" gap={1}>
                          <SubdirectoryArrowRight sx={{ fontSize: 16, color: 'text.disabled' }} />
                          <Typography variant="caption" fontWeight={700} color="text.secondary" textTransform="uppercase" letterSpacing="0.06em">
                            Sub-notes
                          </Typography>
                          {children.length > 0 && (
                            <Box sx={{ px: 0.75, py: 0.1, borderRadius: 10, bgcolor: '#6366f122', minWidth: 20, textAlign: 'center' }}>
                              <Typography variant="caption" fontWeight={700} sx={{ color: '#6366f1', fontSize: '0.7rem' }}>{children.length}</Typography>
                            </Box>
                          )}
                        </Box>
                        <Tooltip title="Add sub-note">
                          <IconButton size="small" onClick={() => handleCreate(editorNote.id)}
                            sx={{ color: '#6366f1', bgcolor: '#6366f111', '&:hover': { bgcolor: '#6366f122' }, width: 26, height: 26 }}>
                            <Add sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                      {children.length === 0 ? (
                        <Box sx={{ py: 2, textAlign: 'center', border: '1.5px dashed #e2e8f0', borderRadius: 2 }}>
                          <Typography variant="caption" color="text.disabled">No sub-notes yet — click + to add one</Typography>
                        </Box>
                      ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                          {children.map(child => (
                            <Box
                              key={child.id}
                              onClick={() => openNote(child)}
                              sx={{
                                display: 'flex', alignItems: 'center', gap: 1.5,
                                px: 2, py: 1.25, borderRadius: 2, cursor: 'pointer',
                                border: '1px solid #e2e8f0',
                                '&:hover': { bgcolor: '#f8f7ff', borderColor: '#c7d2fe' },
                                transition: 'all 0.15s',
                              }}
                            >
                              <NoteAlt sx={{ fontSize: 16, color: '#94a3b8', flexShrink: 0 }} />
                              <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography variant="body2" fontWeight={600} noWrap>{child.title || 'Untitled'}</Typography>
                                <Typography variant="caption" color="text.disabled">{timeAgo(child.updatedAt)}</Typography>
                              </Box>
                              <ChevronRight sx={{ fontSize: 16, color: 'text.disabled' }} />
                            </Box>
                          ))}
                        </Box>
                      )}
                    </Box>
                  );
                })()}
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      {/* Global password management */}
      <PasswordMgmtDialog
        open={pwMgmtOpen} hasPassword={hasPassword}
        onClose={() => setPwMgmtOpen(false)}
        onSuccess={handlePwSuccess}
      />

      {/* Per-note unlock */}
      <NoteUnlockDialog
        note={unlockTarget}
        open={!!unlockTarget}
        onClose={() => setUnlockTarget(null)}
        onUnlocked={handleNoteUnlocked}
        encryptionEnabled={encryptionEnabled}
      />

      {/* Canvas assignment menu */}
      <Menu
        anchorEl={canvasMenuAnchor}
        open={!!canvasMenuAnchor}
        onClose={() => setCanvasMenuAnchor(null)}
        PaperProps={{ sx: { borderRadius: 2, minWidth: 200 } }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <Typography variant="caption" color="text.disabled" fontWeight={700} sx={{ px: 2, pt: 1, pb: 0.5, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Assign to canvas
        </Typography>
        <Divider sx={{ mb: 0.5 }} />
        <MenuItem
          onClick={() => handleAssignCanvas(editorNote.id, null)}
          selected={!editorNote?.canvasId}
          sx={{ gap: 1, borderRadius: 1, mx: 0.5 }}
        >
          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#94a3b8', flexShrink: 0 }} />
          <Typography variant="body2">None</Typography>
        </MenuItem>
        {canvases.map(canvas => (
          <MenuItem
            key={canvas.id}
            onClick={() => handleAssignCanvas(editorNote.id, canvas.id)}
            selected={editorNote?.canvasId === canvas.id}
            sx={{ gap: 1, borderRadius: 1, mx: 0.5 }}
          >
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: canvas.color, flexShrink: 0 }} />
            <Typography variant="body2">{canvas.name}</Typography>
          </MenuItem>
        ))}
      </Menu>

      {/* Delete confirm */}
      <Dialog open={deleteConfirm} onClose={() => setDeleteConfirm(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700 }}>Delete Note?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary">
            <strong>{editorNote?.title}</strong> will be permanently deleted, along with all its child notes. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteConfirm(false)} variant="outlined">Cancel</Button>
          <Button onClick={handleDelete} variant="contained" color="error">Delete</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
