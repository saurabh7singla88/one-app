import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  Box, Typography, IconButton, Button, TextField, Tooltip, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions, InputAdornment,
  CircularProgress, Divider, Menu, MenuItem, Collapse, Alert, Snackbar, Select,
  FormControl, InputLabel, useTheme,
} from '@mui/material';
import {
  BookmarkBorder, Folder as FolderIcon, FolderOpen, Add, Search,
  ExpandMore, ChevronRight, Delete, Edit, OpenInNew, ContentCopy,
  Close, MoreVert, Inbox, Refresh, ViewModule, ViewList,
} from '@mui/icons-material';
import {
  fetchFolders, createFolder, updateFolder, deleteFolder,
  fetchBookmarks, createBookmark, updateBookmark, deleteBookmark,
} from '../features/bookmarks/bookmarksSlice';
import api from '../api/axios';

const FOLDER_COLORS = ['#6366f1','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#64748b'];
const SIDEBAR_WIDTH = 240;

// ── Folder tree node ─────────────────────────────────────────────────────────
function FolderItem({ folder, depth, selected, onSelect, onAdd, onRename, onDelete, allFolders }) {
  const [open, setOpen] = useState(depth === 0);
  const [hovered, setHovered] = useState(false);
  const children = allFolders.filter(f => f.parentId === folder.id);
  const hasChildren = children.length > 0;
  const isSelected = selected === folder.id;

  return (
    <>
      <Box
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => onSelect(folder.id)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 0.5,
          pl: `${12 + depth * 16}px`, pr: 0.5, py: 0.5,
          borderRadius: 1.5, cursor: 'pointer', mx: 0.5,
          bgcolor: isSelected ? 'rgba(99,102,241,0.1)' : hovered ? 'rgba(0,0,0,0.04)' : 'transparent',
          transition: 'background 0.1s',
          '&:hover': {},
        }}
      >
        {/* Expand/collapse chevron */}
        <Box sx={{ width: 16, flexShrink: 0 }}>
          {hasChildren && (
            <IconButton size="small" onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
              sx={{ p: 0, width: 16, height: 16 }}>
              {open ? <ExpandMore sx={{ fontSize: 14, color: '#94a3b8' }} /> : <ChevronRight sx={{ fontSize: 14, color: '#94a3b8' }} />}
            </IconButton>
          )}
        </Box>

        {/* Folder icon */}
        <Box sx={{ fontSize: '0.85rem', lineHeight: 1, flexShrink: 0 }}>{folder.icon}</Box>

        {/* Name */}
        <Typography sx={{ fontSize: '0.8rem', flex: 1, color: isSelected ? '#6366f1' : 'text.primary', fontWeight: isSelected ? 600 : 400, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {folder.name}
        </Typography>

        {/* Count */}
        {folder._count?.bookmarks > 0 && (
          <Typography sx={{ fontSize: '0.68rem', color: '#94a3b8', flexShrink: 0 }}>{folder._count.bookmarks}</Typography>
        )}

        {/* Actions (hover) */}
        {hovered && (
          <Box display="flex" sx={{ flexShrink: 0 }}>
            <Tooltip title="Add subfolder" arrow>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onAdd(folder.id); }} sx={{ p: 0.2 }}>
                <Add sx={{ fontSize: 12, color: '#94a3b8' }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Rename" arrow>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onRename(folder); }} sx={{ p: 0.2 }}>
                <Edit sx={{ fontSize: 12, color: '#94a3b8' }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete" arrow>
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); onDelete(folder); }} sx={{ p: 0.2 }}>
                <Delete sx={{ fontSize: 12, color: '#94a3b8' }} />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>

      {hasChildren && (
        <Collapse in={open}>
          {children.map(child => (
            <FolderItem key={child.id} folder={child} depth={depth + 1}
              selected={selected} onSelect={onSelect} onAdd={onAdd}
              onRename={onRename} onDelete={onDelete} allFolders={allFolders}
            />
          ))}
        </Collapse>
      )}
    </>
  );
}

// ── Bookmark card ─────────────────────────────────────────────────────────────
function BookmarkCard({ bookmark, onEdit, onDelete, onCopy }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [hovered, setHovered] = useState(false);
  let domain = '';
  try { domain = new URL(bookmark.url).hostname.replace('www.', ''); } catch {}

  return (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        position: 'relative',
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: hovered ? 'rgba(99,102,241,0.3)' : theme.palette.divider,
        borderRadius: 2.5,
        overflow: 'hidden',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.04)',
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column',
      }}
      onClick={() => window.open(bookmark.url, '_blank', 'noopener')}
    >
      {/* Card header actions */}
      {hovered && (
        <Box
          onClick={e => e.stopPropagation()}
          sx={{ position: 'absolute', top: 6, right: 6, display: 'flex', gap: 0.25, bgcolor: 'background.paper', borderRadius: 1.5, boxShadow: '0 1px 6px rgba(0,0,0,0.12)', p: 0.25, zIndex: 2 }}
        >
          <Tooltip title="Copy URL" arrow><IconButton size="small" onClick={() => onCopy(bookmark.url)} sx={{ p: 0.4 }}><ContentCopy sx={{ fontSize: 13, color: '#64748b' }} /></IconButton></Tooltip>
          <Tooltip title="Edit" arrow><IconButton size="small" onClick={() => onEdit(bookmark)} sx={{ p: 0.4 }}><Edit sx={{ fontSize: 13, color: '#64748b' }} /></IconButton></Tooltip>
          <Tooltip title="Delete" arrow><IconButton size="small" onClick={() => onDelete(bookmark)} sx={{ p: 0.4 }}><Delete sx={{ fontSize: 13, color: '#ef4444' }} /></IconButton></Tooltip>
        </Box>
      )}

      <Box sx={{ p: '12px 14px 10px' }}>
        {/* Favicon + title */}
        <Box display="flex" alignItems="flex-start" gap={1} mb={0.75}>
          {bookmark.favicon
            ? <Box component="img" src={bookmark.favicon} alt="" sx={{ width: 18, height: 18, borderRadius: 0.5, flexShrink: 0, mt: 0.15, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
            : <BookmarkBorder sx={{ fontSize: 18, color: '#94a3b8', flexShrink: 0, mt: 0.15 }} />
          }
          <Typography fontWeight={600} sx={{ fontSize: '0.83rem', color: 'text.primary', lineHeight: 1.35, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
            {bookmark.title}
          </Typography>
        </Box>

        {/* Domain */}
        <Typography sx={{ fontSize: '0.71rem', color: '#6366f1', mb: bookmark.description ? 0.5 : 0, fontWeight: 500 }}>
          {domain}
        </Typography>

        {/* Description */}
        {bookmark.description && (
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', mb: 0.5 }}>
            {bookmark.description}
          </Typography>
        )}

        {/* Tags */}
        {bookmark.tags?.length > 0 && (
          <Box display="flex" flexWrap="wrap" gap={0.4} mt={0.5}>
            {bookmark.tags.slice(0, 4).map(t => (
              <Chip key={t} label={t} size="small" sx={{ height: 18, fontSize: '0.62rem', bgcolor: isDark ? 'rgba(3,105,161,0.15)' : '#f0f9ff', color: isDark ? '#38bdf8' : '#0369a1', '& .MuiChip-label': { px: 0.6 } }} />
            ))}
            {bookmark.tags.length > 4 && <Typography sx={{ fontSize: '0.62rem', color: '#94a3b8', alignSelf: 'center' }}>+{bookmark.tags.length - 4}</Typography>}
          </Box>
        )}
      </Box>

      {/* Footer: folder + date */}
      <Box sx={{ px: '14px', pb: '8px', mt: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {bookmark.folder && (
          <Box display="flex" alignItems="center" gap={0.4}>
            <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: bookmark.folder.color || '#6366f1', flexShrink: 0 }} />
            <Typography sx={{ fontSize: '0.65rem', color: '#94a3b8' }}>{bookmark.folder.name}</Typography>
          </Box>
        )}
        <Typography sx={{ fontSize: '0.65rem', color: '#d1d5db', ml: 'auto' }}>
          {new Date(bookmark.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </Typography>
      </Box>
    </Box>
  );
}

// ── Bookmark list row ────────────────────────────────────────────────────────
function BookmarkRow({ bookmark, onEdit, onDelete, onCopy }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [hovered, setHovered] = useState(false);
  let domain = '';
  try { domain = new URL(bookmark.url).hostname.replace('www.', ''); } catch {}

  return (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => window.open(bookmark.url, '_blank', 'noopener')}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.5,
        px: 2, py: 1.25, cursor: 'pointer',
        borderBottom: '1px solid #f1f5f9',
        bgcolor: hovered ? (isDark ? 'rgba(99,102,241,0.06)' : '#fafafe') : 'background.paper',
        transition: 'background 0.1s',
        '&:last-child': { borderBottom: 0 },
      }}
    >
      {/* Favicon */}
      {bookmark.favicon
        ? <Box component="img" src={bookmark.favicon} alt="" sx={{ width: 16, height: 16, borderRadius: 0.5, flexShrink: 0, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
        : <BookmarkBorder sx={{ fontSize: 16, color: '#94a3b8', flexShrink: 0 }} />
      }

      {/* Title */}
      <Typography fontWeight={600} sx={{ fontSize: '0.83rem', color: 'text.primary', minWidth: 180, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {bookmark.title}
      </Typography>

      {/* Domain */}
      <Typography sx={{ fontSize: '0.73rem', color: '#6366f1', minWidth: 100, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
        {domain}
      </Typography>

      {/* Description */}
      <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: { xs: 'none', md: 'block' } }}>
        {bookmark.description || ''}
      </Typography>

      {/* Tags */}
      <Box display="flex" gap={0.4} flexShrink={0} sx={{ display: { xs: 'none', lg: 'flex' } }}>
        {bookmark.tags?.slice(0, 3).map(t => (
          <Chip key={t} label={t} size="small" sx={{ height: 18, fontSize: '0.62rem', bgcolor: isDark ? 'rgba(3,105,161,0.15)' : '#f0f9ff', color: isDark ? '#38bdf8' : '#0369a1', '& .MuiChip-label': { px: 0.6 } }} />
        ))}
      </Box>

      {/* Folder dot */}
      {bookmark.folder && (
        <Box display="flex" alignItems="center" gap={0.4} flexShrink={0} sx={{ display: { xs: 'none', sm: 'flex' } }}>
          <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: bookmark.folder.color || '#6366f1' }} />
          <Typography sx={{ fontSize: '0.65rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>{bookmark.folder.name}</Typography>
        </Box>
      )}

      {/* Date */}
      <Typography sx={{ fontSize: '0.65rem', color: '#d1d5db', flexShrink: 0, minWidth: 50, textAlign: 'right', display: { xs: 'none', sm: 'block' } }}>
        {new Date(bookmark.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </Typography>

      {/* Hover actions */}
      <Box onClick={e => e.stopPropagation()} sx={{ display: 'flex', gap: 0.25, flexShrink: 0, opacity: hovered ? 1 : 0, transition: 'opacity 0.15s' }}>
        <Tooltip title="Copy URL" arrow><IconButton size="small" onClick={() => onCopy(bookmark.url)} sx={{ p: 0.4 }}><ContentCopy sx={{ fontSize: 13, color: '#64748b' }} /></IconButton></Tooltip>
        <Tooltip title="Edit" arrow><IconButton size="small" onClick={() => onEdit(bookmark)} sx={{ p: 0.4 }}><Edit sx={{ fontSize: 13, color: '#64748b' }} /></IconButton></Tooltip>
        <Tooltip title="Delete" arrow><IconButton size="small" onClick={() => onDelete(bookmark)} sx={{ p: 0.4 }}><Delete sx={{ fontSize: 13, color: '#ef4444' }} /></IconButton></Tooltip>
      </Box>
    </Box>
  );
}

// ── Add/Edit Bookmark Dialog ──────────────────────────────────────────────────
function BookmarkDialog({ open, onClose, onSave, initial, folders }) {
  const [form, setForm] = useState({ url: '', title: '', description: '', folderId: '', tags: [] });
  const [tagInput, setTagInput] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(initial
        ? { url: initial.url, title: initial.title, description: initial.description || '', folderId: initial.folderId || '', tags: initial.tags || [] }
        : { url: '', title: '', description: '', folderId: '', tags: [] }
      );
      setTagInput('');
      setFetchError('');
    }
  }, [open, initial]);

  const fetchMeta = async () => {
    if (!form.url.trim()) return;
    setFetching(true); setFetchError('');
    try {
      const { data } = await api.post('/bookmarks/fetch-meta', { url: form.url.trim() });
      setForm(f => ({ ...f, title: data.title || f.title, description: data.description || f.description, _favicon: data.favicon, _image: data.image }));
    } catch { setFetchError('Could not fetch page info'); }
    finally { setFetching(false); }
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !form.tags.includes(t)) setForm(f => ({ ...f, tags: [...f.tags, t] }));
    setTagInput('');
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, pb: 0.5 }}>{initial ? 'Edit Bookmark' : 'Add Bookmark'}</DialogTitle>
      <Divider />
      <DialogContent>
        <Box display="flex" flexDirection="column" gap={2} mt={1}>
          {/* URL */}
          <TextField
            label="URL" value={form.url} size="small" fullWidth autoFocus={!initial}
            onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
            onBlur={() => !initial && !form.title && fetchMeta()}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title="Auto-fill title & description"><span>
                    <IconButton size="small" onClick={fetchMeta} disabled={fetching || !form.url.trim()}>
                      {fetching ? <CircularProgress size={14} /> : <Refresh sx={{ fontSize: 16 }} />}
                    </IconButton>
                  </span></Tooltip>
                </InputAdornment>
              )
            }}
          />
          {fetchError && <Alert severity="warning" sx={{ py: 0.5 }}>{fetchError}</Alert>}

          {/* Title */}
          <TextField label="Title" value={form.title} size="small" fullWidth
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />

          {/* Description */}
          <TextField label="Description (optional)" value={form.description} size="small" fullWidth multiline rows={2}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />

          {/* Folder */}
          <FormControl size="small" fullWidth>
            <InputLabel>Folder</InputLabel>
            <Select
              label="Folder"
              value={form.folderId}
              onChange={e => setForm(f => ({ ...f, folderId: e.target.value }))}
            >
              <MenuItem value=""><em>— No folder (Unsorted) —</em></MenuItem>
              {folders.filter(f => !f.parentId).map(f => (
                <MenuItem key={f.id} value={f.id}>{f.name}</MenuItem>
              ))}
              {folders.filter(f => f.parentId).map(f => (
                <MenuItem key={f.id} value={f.id} sx={{ pl: 4 }}>↳ {f.name}</MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Tags */}
          <Box>
            <TextField
              label="Add tag" value={tagInput} size="small"
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
              InputProps={{ endAdornment: <InputAdornment position="end"><Button size="small" onClick={addTag} disabled={!tagInput.trim()}>Add</Button></InputAdornment> }}
              sx={{ width: '100%' }}
            />
            {form.tags.length > 0 && (
              <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.75}>
                {form.tags.map(t => (
                  <Chip key={t} label={t} size="small" onDelete={() => setForm(f => ({ ...f, tags: f.tags.filter(x => x !== t) }))} />
                ))}
              </Box>
            )}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: '#6b7280' }}>Cancel</Button>
        <Button variant="contained" disabled={!form.url.trim() || !form.title.trim()}
          onClick={() => onSave({ ...form, favicon: form._favicon, image: form._image })}
          sx={{ borderRadius: 2, background: 'linear-gradient(135deg,#6366f1,#818cf8)', boxShadow: 'none' }}>
          {initial ? 'Save' : 'Add Bookmark'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function Bookmarks() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const dispatch = useDispatch();
  const { folders, bookmarks, loading } = useSelector(s => s.bookmarks);

  const [selectedFolder, setSelectedFolder] = useState('all'); // 'all' | 'unsorted' | <folderId>
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null); // { type: 'bookmark'|'folder', item }
  const [folderDialog, setFolderDialog] = useState(null); // null | { parentId, existing }
  const [folderName, setFolderName] = useState('');
  const [snackbar, setSnackbar] = useState('');
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('bookmarks_view') || 'grid');

  // Load
  useEffect(() => { dispatch(fetchFolders()); }, [dispatch]);
  useEffect(() => {
    const params = {};
    if (selectedFolder === 'unsorted') params.folderId = 'unsorted';
    else if (selectedFolder !== 'all') params.folderId = selectedFolder;
    if (search) params.search = search;
    dispatch(fetchBookmarks(params));
  }, [dispatch, selectedFolder, search]);

  // Folder tree: only root folders in the sidebar list
  const rootFolders = useMemo(() => folders.filter(f => !f.parentId), [folders]);

  const totalCount = useMemo(() => bookmarks.length, [bookmarks]);
  const unsortedCount = useMemo(() => folders.length > 0
    ? bookmarks.filter(b => !b.folderId).length
    : 0, [bookmarks, folders]);

  // Folder dialog handlers
  const openAddFolder = (parentId = null) => {
    setFolderName('');
    setFolderDialog({ parentId, existing: null });
  };
  const openRenameFolder = (folder) => {
    setFolderName(folder.name);
    setFolderDialog({ parentId: folder.parentId, existing: folder });
  };
  const submitFolderDialog = async () => {
    if (!folderName.trim()) return;
    if (folderDialog.existing) {
      await dispatch(updateFolder({ id: folderDialog.existing.id, name: folderName.trim() }));
    } else {
      const result = await dispatch(createFolder({ name: folderName.trim(), parentId: folderDialog.parentId }));
      if (result.meta.requestStatus === 'fulfilled') setSelectedFolder(result.payload.id);
    }
    setFolderDialog(null);
  };

  // Bookmark handlers
  const handleSaveBookmark = async (form) => {
    const payload = {
      url: form.url,
      title: form.title,
      description: form.description || null,
      favicon: form.favicon || null,
      image: form.image || null,
      folderId: form.folderId || null,
      tags: form.tags,
    };
    if (editTarget) {
      await dispatch(updateBookmark({ id: editTarget.id, ...payload }));
    } else {
      await dispatch(createBookmark(payload));
    }
    setDialogOpen(false);
    setEditTarget(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.type === 'bookmark') {
      await dispatch(deleteBookmark(deleteTarget.item.id));
      setSnackbar('Bookmark deleted');
    } else {
      await dispatch(deleteFolder(deleteTarget.item.id));
      if (selectedFolder === deleteTarget.item.id) setSelectedFolder('all');
      setSnackbar('Folder deleted');
    }
    setDeleteTarget(null);
  };

  const handleCopy = (url) => {
    navigator.clipboard.writeText(url).then(() => setSnackbar('URL copied'));
  };

  // Current folder name for header
  const currentFolderName = useMemo(() => {
    if (selectedFolder === 'all') return 'All Bookmarks';
    if (selectedFolder === 'unsorted') return 'Unsorted';
    return folders.find(f => f.id === selectedFolder)?.name || '';
  }, [selectedFolder, folders]);

  return (
    <Box display="flex" height="100%" bgcolor="background.default" overflow="hidden">

      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <Box sx={{
        width: SIDEBAR_WIDTH, flexShrink: 0,
        bgcolor: 'background.paper', borderRight: `1px solid ${theme.palette.divider}`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <Box sx={{ px: 1.5, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography fontWeight={700} sx={{ fontSize: '0.82rem', color: 'text.secondary', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Bookmarks</Typography>
          <Tooltip title="New folder"><IconButton size="small" onClick={() => openAddFolder(null)} sx={{ color: '#94a3b8' }}><Add sx={{ fontSize: 16 }} /></IconButton></Tooltip>
        </Box>

        <Box sx={{ flex: 1, overflowY: 'auto', pb: 2 }}>
          {/* All Bookmarks */}
          <Box onClick={() => setSelectedFolder('all')}
            sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, mx: 0.5, borderRadius: 1.5, cursor: 'pointer', bgcolor: selectedFolder === 'all' ? 'rgba(99,102,241,0.09)' : 'transparent', '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' } }}>
            <BookmarkBorder sx={{ fontSize: 16, color: selectedFolder === 'all' ? '#6366f1' : '#94a3b8' }} />
            <Typography sx={{ fontSize: '0.8rem', flex: 1, color: selectedFolder === 'all' ? '#6366f1' : 'text.primary', fontWeight: selectedFolder === 'all' ? 600 : 400 }}>All Bookmarks</Typography>
          </Box>

          {/* Unsorted */}
          <Box onClick={() => setSelectedFolder('unsorted')}
            sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75, mx: 0.5, borderRadius: 1.5, cursor: 'pointer', bgcolor: selectedFolder === 'unsorted' ? 'rgba(99,102,241,0.09)' : 'transparent', '&:hover': { bgcolor: 'rgba(0,0,0,0.04)' } }}>
            <Inbox sx={{ fontSize: 16, color: selectedFolder === 'unsorted' ? '#6366f1' : '#94a3b8' }} />
            <Typography sx={{ fontSize: '0.8rem', flex: 1, color: selectedFolder === 'unsorted' ? '#6366f1' : 'text.primary', fontWeight: selectedFolder === 'unsorted' ? 600 : 400 }}>Unsorted</Typography>
          </Box>

          {rootFolders.length > 0 && <Divider sx={{ my: 1, mx: 1.5 }} />}

          {/* Folder tree */}
          {rootFolders.map(folder => (
            <FolderItem
              key={folder.id}
              folder={folder}
              depth={0}
              selected={selectedFolder}
              onSelect={setSelectedFolder}
              onAdd={openAddFolder}
              onRename={openRenameFolder}
              onDelete={(f) => setDeleteTarget({ type: 'folder', item: f })}
              allFolders={folders}
            />
          ))}

          {/* New folder button */}
          <Box onClick={() => openAddFolder(null)}
            sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1.5, py: 0.75, mx: 0.5, mt: 0.5, borderRadius: 1.5, cursor: 'pointer', color: '#94a3b8', '&:hover': { bgcolor: 'rgba(0,0,0,0.04)', color: '#6366f1' } }}>
            <Add sx={{ fontSize: 15 }} />
            <Typography sx={{ fontSize: '0.78rem' }}>New folder</Typography>
          </Box>
        </Box>
      </Box>

      {/* ── Main area ─────────────────────────────────────────────────────── */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Toolbar */}
        <Box sx={{ px: 3, py: 1.75, borderBottom: `1px solid ${theme.palette.divider}`, bgcolor: 'background.paper', display: 'flex', alignItems: 'center', gap: 2 }}>
          <Box>
            <Typography fontWeight={700} sx={{ fontSize: '1rem', color: 'text.primary', lineHeight: 1.2 }}>{currentFolderName}</Typography>
            {!loading && <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8' }}>{bookmarks.length} bookmark{bookmarks.length !== 1 ? 's' : ''}</Typography>}
          </Box>

          {/* Search */}
          <TextField
            size="small" placeholder="Search bookmarks…" value={search}
            onChange={e => setSearch(e.target.value)}
            sx={{ ml: 'auto', width: 240 }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 16, color: '#94a3b8' }} /></InputAdornment>,
              endAdornment: search ? <InputAdornment position="end"><IconButton size="small" onClick={() => setSearch('')}><Close sx={{ fontSize: 14 }} /></IconButton></InputAdornment> : null,
              sx: { borderRadius: 2, bgcolor: '#f9fafb' },
            }}
          />

          {/* View toggle */}
          <Box sx={{ display: 'flex', border: `1px solid ${theme.palette.divider}`, borderRadius: 1.5, overflow: 'hidden', flexShrink: 0 }}>
            <Tooltip title="Grid view">
              <IconButton size="small" onClick={() => { setViewMode('grid'); localStorage.setItem('bookmarks_view','grid'); }}
                sx={{ borderRadius: 0, px: 0.75, py: 0.5, bgcolor: viewMode === 'grid' ? '#ede9fe' : 'transparent', color: viewMode === 'grid' ? '#6366f1' : '#94a3b8' }}>
                <ViewModule sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="List view">
              <IconButton size="small" onClick={() => { setViewMode('list'); localStorage.setItem('bookmarks_view','list'); }}
                sx={{ borderRadius: 0, px: 0.75, py: 0.5, bgcolor: viewMode === 'list' ? '#ede9fe' : 'transparent', color: viewMode === 'list' ? '#6366f1' : '#94a3b8' }}>
                <ViewList sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Add */}
          <Button variant="contained" startIcon={<Add />}
            onClick={() => { setEditTarget(null); setDialogOpen(true); }}
            sx={{ borderRadius: 2, background: 'linear-gradient(135deg,#6366f1,#818cf8)', boxShadow: 'none', whiteSpace: 'nowrap', '&:hover': { boxShadow: '0 4px 12px rgba(99,102,241,0.35)' } }}>
            Add Bookmark
          </Button>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflowY: 'auto', p: 3 }}>
          {loading ? (
            <Box display="flex" justifyContent="center" pt={6}><CircularProgress /></Box>
          ) : bookmarks.length === 0 ? (
            <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" pt={8} gap={2}>
              <Box sx={{ width: 64, height: 64, borderRadius: '50%', bgcolor: isDark ? 'rgba(3,105,161,0.15)' : '#f0f9ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <BookmarkBorder sx={{ fontSize: 32, color: '#6366f1' }} />
              </Box>
              <Typography fontWeight={600} sx={{ color: 'text.primary' }}>
                {search ? 'No bookmarks match your search' : 'No bookmarks yet'}
              </Typography>
              <Typography sx={{ fontSize: '0.85rem', color: '#9ca3af', textAlign: 'center', maxWidth: 320 }}>
                {search ? 'Try a different search term.' : 'Add your first bookmark to get started. Paste any URL and we\'ll fetch the details automatically.'}
              </Typography>
              {!search && (
                <Button variant="contained" startIcon={<Add />}
                  onClick={() => { setEditTarget(null); setDialogOpen(true); }}
                  sx={{ borderRadius: 2, mt: 1, background: 'linear-gradient(135deg,#6366f1,#818cf8)', boxShadow: 'none' }}>
                  Add Bookmark
                </Button>
              )}
            </Box>
          ) : viewMode === 'grid' ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 2 }}>
              {bookmarks.map(b => (
                <BookmarkCard key={b.id} bookmark={b}
                  onEdit={(bk) => { setEditTarget(bk); setDialogOpen(true); }}
                  onDelete={(bk) => setDeleteTarget({ type: 'bookmark', item: bk })}
                  onCopy={handleCopy}
                />
              ))}
            </Box>
          ) : (
            <Box sx={{ bgcolor: 'background.paper', border: `1px solid ${theme.palette.divider}`, borderRadius: 2.5, overflow: 'hidden' }}>
              {bookmarks.map(b => (
                <BookmarkRow key={b.id} bookmark={b}
                  onEdit={(bk) => { setEditTarget(bk); setDialogOpen(true); }}
                  onDelete={(bk) => setDeleteTarget({ type: 'bookmark', item: bk })}
                  onCopy={handleCopy}
                />
              ))}
            </Box>
          )}
        </Box>
      </Box>

      {/* ── Add/Edit Dialog ──────────────────────────────────────────────── */}
      <BookmarkDialog
        open={dialogOpen}
        onClose={() => { setDialogOpen(false); setEditTarget(null); }}
        onSave={handleSaveBookmark}
        initial={editTarget}
        folders={folders}
      />

      {/* ── Add/Rename Folder Dialog ─────────────────────────────────────── */}
      <Dialog open={!!folderDialog} onClose={() => setFolderDialog(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700, pb: 0.5 }}>
          {folderDialog?.existing ? 'Rename Folder' : folderDialog?.parentId ? 'New Subfolder' : 'New Folder'}
        </DialogTitle>
        <DialogContent>
          <TextField autoFocus label="Folder name" value={folderName} size="small" fullWidth
            onChange={e => setFolderName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submitFolderDialog()}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setFolderDialog(null)} sx={{ color: '#6b7280' }}>Cancel</Button>
          <Button variant="contained" disabled={!folderName.trim()} onClick={submitFolderDialog}
            sx={{ borderRadius: 2, background: 'linear-gradient(135deg,#6366f1,#818cf8)', boxShadow: 'none' }}>
            {folderDialog?.existing ? 'Rename' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Delete Confirm Dialog ────────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700, pb: 0.5 }}>
          {deleteTarget?.type === 'folder' ? 'Delete Folder?' : 'Delete Bookmark?'}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ color: '#4b5563' }}>
            {deleteTarget?.type === 'folder'
              ? `"${deleteTarget?.item?.name}" and all its subfolders will be deleted. Bookmarks inside will become unsorted.`
              : `"${deleteTarget?.item?.title}" will be permanently deleted.`}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteTarget(null)} sx={{ color: '#6b7280' }}>Cancel</Button>
          <Button variant="contained" color="error" onClick={handleDeleteConfirm} sx={{ borderRadius: 2, boxShadow: 'none' }}>Delete</Button>
        </DialogActions>
      </Dialog>

      {/* ── Snackbar ─────────────────────────────────────────────────────── */}
      <Snackbar open={!!snackbar} autoHideDuration={2500} onClose={() => setSnackbar('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        message={snackbar}
      />
    </Box>
  );
}
