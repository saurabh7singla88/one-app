import { useEffect, useState } from 'react';
import { useTheme } from '@mui/material/styles';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box, Typography, IconButton, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions, Button, TextField, Chip,
  Menu, MenuItem, Divider, CircularProgress
} from '@mui/material';
import { Add, Edit, Delete, Dashboard } from '@mui/icons-material';
import {
  fetchCanvases, createCanvas, updateCanvas, deleteCanvas, setActiveCanvas
} from '../features/canvas/canvasSlice';

const PALETTE = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
  '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#64748b',
];

export default function CanvasSelector({ screen, countsByCanvas }) {
  const dispatch = useDispatch();
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const inactiveBg = isDark ? 'rgba(255,255,255,0.07)' : '#f1f5f9';
  const inactiveHover = isDark ? 'rgba(255,255,255,0.12)' : '#e2e8f0';
  const canvases = useSelector(s => s.canvas.canvases);
  const activeCanvasId = useSelector(s => s.canvas.activeCanvasId[screen] ?? null);
  const loading = useSelector(s => s.canvas.loading);

  const [createOpen, setCreateOpen] = useState(false);
  const [editCanvas, setEditCanvas] = useState(null); // canvas object being edited
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formColor, setFormColor] = useState(PALETTE[0]);
  const [saving, setSaving] = useState(false);

  // Context menu
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuCanvas, setMenuCanvas] = useState(null);

  useEffect(() => {
    dispatch(fetchCanvases());
  }, [dispatch]);

  const openCreate = () => {
    setFormName('');
    setFormDesc('');
    setFormColor(PALETTE[0]);
    setEditCanvas(null);
    setCreateOpen(true);
  };

  const openEdit = (canvas) => {
    setFormName(canvas.name);
    setFormDesc(canvas.description || '');
    setFormColor(canvas.color);
    setEditCanvas(canvas);
    setCreateOpen(true);
    setMenuAnchor(null);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      if (editCanvas) {
        await dispatch(updateCanvas({ id: editCanvas.id, data: { name: formName.trim(), description: formDesc.trim() || null, color: formColor } }));
      } else {
        const result = await dispatch(createCanvas({ name: formName.trim(), description: formDesc.trim() || null, color: formColor })).unwrap();
        // Auto-switch only this screen to the newly created canvas
        dispatch(setActiveCanvas({ screen, canvasId: result.id }));
      }
      setCreateOpen(false);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    setMenuAnchor(null);
    if (window.confirm('Delete this canvas? Initiatives will be unlinked but not deleted.')) {
      await dispatch(deleteCanvas(id));
    }
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        mb: 2.5,
        px: 1.5,
        py: 1,
        bgcolor: 'background.paper',
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 3,
        flexWrap: 'wrap',
      }}
    >
      <Dashboard sx={{ fontSize: 15, color: 'text.disabled', mr: 0.25 }} />
      <Typography variant="caption" color="text.disabled" fontWeight={600} mr={0.5}>
        CANVAS
      </Typography>

      {/* "All" tab */}
      <Chip
        label="All"
        size="small"
        onClick={() => dispatch(setActiveCanvas({ screen, canvasId: null }))}
        sx={{
          height: 26,
          fontSize: '0.75rem',
          fontWeight: activeCanvasId === null ? 700 : 500,
          bgcolor: activeCanvasId === null ? '#1e1b4b' : inactiveBg,
          color: activeCanvasId === null ? 'white' : 'text.secondary',
          border: 'none',
          cursor: 'pointer',
          '&:hover': { bgcolor: activeCanvasId === null ? '#1e1b4b' : inactiveHover },
        }}
      />

      {/* Canvas tabs */}
      {canvases.map(canvas => {
        const active = activeCanvasId === canvas.id;
        return (
          <Chip
            key={canvas.id}
            label={
              <Box component="span" display="flex" alignItems="center" gap={0.5}>
                <Box component="span"
                  sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: active ? 'white' : canvas.color, display: 'inline-block' }}
                />
                {canvas.name}
                {(() => {
                  const n = countsByCanvas
                    ? (countsByCanvas[canvas.id] ?? 0)
                    : (canvas._count?.initiatives ?? 0);
                  return n > 0 ? (
                    <Box component="span" sx={{ opacity: 0.7, fontSize: '0.65rem' }}>
                      {' '}({n})
                    </Box>
                  ) : null;
                })()}
              </Box>
            }
            size="small"
            onClick={() => dispatch(setActiveCanvas({ screen, canvasId: canvas.id }))}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenuCanvas(canvas);
              setMenuAnchor(e.currentTarget);
            }}
            sx={{
              height: 26,
              fontSize: '0.75rem',
              fontWeight: active ? 700 : 500,
              bgcolor: active ? canvas.color : inactiveBg,
              color: active ? 'white' : 'text.secondary',
              border: active ? 'none' : '1px solid transparent',
              cursor: 'pointer',
              '&:hover': { bgcolor: active ? canvas.color : inactiveHover, opacity: active ? 0.9 : 1 },
            }}
          />
        );
      })}

      {loading && <CircularProgress size={14} sx={{ ml: 0.5 }} />}

      {/* Add canvas button */}
      <Tooltip title="New Canvas">
        <IconButton size="small" onClick={openCreate} sx={{ ml: 0.5, p: 0.4, color: 'text.disabled', '&:hover': { color: 'primary.main' } }}>
          <Add sx={{ fontSize: 16 }} />
        </IconButton>
      </Tooltip>

      {/* Context menu for canvas actions */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        PaperProps={{ sx: { minWidth: 140, borderRadius: 2, boxShadow: '0 4px 20px rgba(0,0,0,0.12)' } }}
      >
        <MenuItem dense onClick={() => openEdit(menuCanvas)} sx={{ gap: 1 }}>
          <Edit sx={{ fontSize: 15 }} /> Rename
        </MenuItem>
        <Divider />
        <MenuItem dense onClick={() => handleDelete(menuCanvas?.id)} sx={{ gap: 1, color: 'error.main' }}>
          <Delete sx={{ fontSize: 15 }} /> Delete
        </MenuItem>
      </Menu>

      {/* Create / Edit dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ fontWeight: 700, pb: 1 }}>{editCanvas ? 'Edit Canvas' : 'New Canvas'}</DialogTitle>
        <Divider />
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Name"
              value={formName}
              onChange={e => setFormName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            />
            <TextField
              fullWidth
              size="small"
              label="Description (optional)"
              value={formDesc}
              onChange={e => setFormDesc(e.target.value)}
            />
            <Box>
              <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.75}>
                COLOR
              </Typography>
              <Box display="flex" gap={0.75} flexWrap="wrap">
                {PALETTE.map(c => (
                  <Box
                    key={c}
                    onClick={() => setFormColor(c)}
                    sx={{
                      width: 24, height: 24, borderRadius: '50%', bgcolor: c, cursor: 'pointer',
                      border: formColor === c ? `3px solid ${c}` : '3px solid transparent',
                      outline: formColor === c ? '2px solid white' : 'none',
                      boxShadow: formColor === c ? `0 0 0 2px ${c}` : 'none',
                      transition: 'transform 0.1s',
                      '&:hover': { transform: 'scale(1.2)' },
                    }}
                  />
                ))}
              </Box>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button variant="outlined" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={!formName.trim() || saving}
            sx={{ bgcolor: formColor, '&:hover': { bgcolor: formColor, filter: 'brightness(0.9)' } }}
          >
            {saving ? <CircularProgress size={16} /> : editCanvas ? 'Save' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
