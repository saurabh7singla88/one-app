import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import CanvasSelector from '../components/CanvasSelector';
import api from '../api/axios';
import {
  Box, Typography, Button, IconButton, Chip,
  Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Select, MenuItem, FormControl, InputLabel,
  Grid, CircularProgress, Divider, Tooltip, InputAdornment,
  Autocomplete
} from '@mui/material';
import { Add, Edit, Delete, ExpandMore, ExpandLess, AccountTree, AddCircleOutline, Search, Visibility, Clear, Label, PersonAdd, IosShare, Assessment, DragIndicator } from '@mui/icons-material';
import StatusReportDialog from '../components/StatusReportDialog';
import { AISuggestionsButton } from '../components/AISuggestionsPanel';
import { Avatar, AvatarGroup } from '@mui/material';
import {
  fetchInitiatives, fetchAllInitiatives, createInitiative, updateInitiative,
  deleteInitiative, updateStatus, updatePriority
} from '../features/initiatives/initiativesSlice';
import { format } from 'date-fns';
import InitiativeDetailDrawer from '../components/InitiativeDetailDrawer';
import InitiativeSummaryDialog from '../components/InitiativeSummaryDialog';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const STATUS_CONFIG = {
  OPEN:        { label: 'Open',        color: '#64748b', bg: '#f1f5f9' },
  IN_PROGRESS: { label: 'In Progress', color: '#2563eb', bg: '#eff6ff' },
  BLOCKED:     { label: 'Blocked',     color: '#dc2626', bg: '#fef2f2' },
  ON_HOLD:     { label: 'On Hold',     color: '#d97706', bg: '#fffbeb' },
  COMPLETED:   { label: 'Completed',   color: '#059669', bg: '#f0fdf4' },
  CANCELLED:   { label: 'Cancelled',   color: '#6b7280', bg: '#f9fafb' },
};

const PRIORITY_CONFIG = {
  CRITICAL: { color: '#dc2626', bg: '#fef2f2', border: '#dc2626' },
  HIGH:     { color: '#d97706', bg: '#fffbeb', border: '#d97706' },
  MEDIUM:   { color: '#2563eb', bg: '#eff6ff', border: '#2563eb' },
  LOW:      { color: '#64748b', bg: '#f1f5f9', border: '#64748b' },
};

const TYPE_LABELS = { INITIATIVE: 'Initiative', TASK: 'Task', SUBTASK: 'Subtask' };

const TIMELINE_PRESETS = [
  { label: 'Today',        key: 'today' },
  { label: 'This week',    key: 'this_week' },
  { label: 'Next 2 weeks', key: 'next_2_weeks' },
  { label: 'This month',   key: 'this_month' },
  { label: 'Next quarter', key: 'next_quarter' },
];

function getTimelineDate(key) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  switch (key) {
    case 'today': break;
    case 'this_week': {
      const day = d.getDay(); // 0=Sun
      d.setDate(d.getDate() + (day === 0 ? 7 : 7 - day));
      break;
    }
    case 'next_2_weeks': d.setDate(d.getDate() + 14); break;
    case 'this_month': {
      d.setFullYear(d.getFullYear(), d.getMonth() + 1, 0);
      break;
    }
    case 'next_quarter': {
      const endOfNextQtr = (Math.floor(d.getMonth() / 3) + 2) * 3;
      d.setFullYear(d.getFullYear(), endOfNextQtr, 0);
      break;
    }
    default: return '';
  }
  return d.toISOString().slice(0, 10);
}

// Sortable wrapper for root-level initiative rows (drag-and-drop)
function SortableInitiativeItem({ id, children }) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id });
  return (
    <Box
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      sx={{ opacity: isDragging ? 0.5 : 1, display: 'flex', alignItems: 'flex-start', gap: 0.5 }}
    >
      <Tooltip title="Drag to reorder" placement="left">
        <Box
          {...attributes}
          {...listeners}
          sx={{
            mt: 1.75, color: 'text.disabled', cursor: 'grab', flexShrink: 0, lineHeight: 0,
            '&:active': { cursor: 'grabbing' },
            '&:hover': { color: 'text.secondary' },
          }}
        >
          <DragIndicator sx={{ fontSize: 18 }} />
        </Box>
      </Tooltip>
      <Box sx={{ flex: 1, minWidth: 0 }}>{children}</Box>
    </Box>
  );
}

export default function InitiativesList() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { items, loading, allItems } = useSelector((state) => state.initiatives);
  const { activeCanvasId, canvases } = useSelector((state) => ({
    activeCanvasId: state.canvas.activeCanvasId.initiatives,
    canvases: state.canvas.canvases,
  }));
  const [openDialog, setOpenDialog] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'INITIATIVE',
    status: 'OPEN',
    priority: 'MEDIUM',
    parentId: null,
    tags: [],
    startDate: '',
    dueDate: '',
  });
  const [tagInput, setTagInput] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [users, setUsers] = useState([]);
  const [childrenMap, setChildrenMap] = useState({});

  const allTags = useMemo(
    () => [...new Set((items || []).flatMap(i => i.tags || []))].sort(),
    [items]
  );
  const [loadingChildren, setLoadingChildren] = useState({});

  // Status Report dialog
  const [reportOpen, setReportOpen] = useState(false);

  // Detail drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerInitiativeId, setDrawerInitiativeId] = useState(null);

  // Summary dialog
  const [summaryId, setSummaryId] = useState(null);

  // Drag-and-drop ordering (root-level only)
  const [orderedItems, setOrderedItems] = useState([]);
  const reorderTimerRef = useRef(null);
  useEffect(() => { setOrderedItems(items); }, [items]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  const handleDragEnd = useCallback(({ active, over }) => {
    if (!over || active.id === over.id) return;
    setOrderedItems(prev => {
      const oldIdx = prev.findIndex(i => i.id === active.id);
      const newIdx = prev.findIndex(i => i.id === over.id);
      const reordered = arrayMove(prev, oldIdx, newIdx);
      clearTimeout(reorderTimerRef.current);
      reorderTimerRef.current = setTimeout(() => {
        api.patch('/initiatives/reorder', {
          items: reordered.map((item, idx) => ({ id: item.id, sortOrder: idx })),
        }).catch(() => {});
      }, 400);
      return reordered;
    });
  }, []);

  // Auto-open drawer and expand ancestor chain when ?open=<id> is in the URL
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || items.length === 0) return; // wait until root items are loaded

    async function openAndExpand() {
      // 1. Walk up the ancestor chain by fetching each item's parentId
      const ancestors = []; // ordered root → direct parent
      let currentId = openId;
      const visited = new Set();
      while (currentId) {
        if (visited.has(currentId)) break;
        visited.add(currentId);
        try {
          const { data: item } = await api.get(`/initiatives/${currentId}`);
          if (item.parentId) ancestors.unshift(item.parentId); // prepend so order is root-first
          currentId = item.parentId;
        } catch {
          break;
        }
      }

      // 2. Expand each ancestor top-down (fetch children + mark expanded)
      for (const ancestorId of ancestors) {
        await new Promise(resolve => {
          setLoadingChildren(prev => ({ ...prev, [ancestorId]: true }));
          api.get(`/initiatives?parentId=${ancestorId}`)
            .then(r => {
              setChildrenMap(prev => ({ ...prev, [ancestorId]: r.data }));
              setExpanded(prev => ({ ...prev, [ancestorId]: true }));
            })
            .catch(() => {})
            .finally(() => {
              setLoadingChildren(prev => ({ ...prev, [ancestorId]: false }));
              resolve();
            });
        });
      }

      // 3. Open the drawer for the target item
      setDrawerInitiativeId(openId);
      setDrawerOpen(true);
    }

    openAndExpand();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, items]);

  // Search + filters (pre-populate status from ?status= URL param, e.g. from Dashboard cards)
  const [searchText, setSearchText] = useState('');
  const [filterStatus, setFilterStatus] = useState(() => searchParams.get('status') || '');
  const [filterPriority, setFilterPriority] = useState('');
  const searchTimer = useRef(null);

  // Quick user create
  const [quickUserOpen, setQuickUserOpen] = useState(false);
  const [quickUserName, setQuickUserName] = useState('');
  const [quickUserRole, setQuickUserRole] = useState('VIEWER');
  const [quickUserSaving, setQuickUserSaving] = useState(false);

  useEffect(() => {
    api.get('/users').then(r => setUsers(r.data)).catch(() => {});
  }, []);

  const handleQuickCreateUser = async (onCreated) => {
    if (!quickUserName.trim()) return;
    setQuickUserSaving(true);
    try {
      const r = await api.post('/users', { name: quickUserName.trim(), role: quickUserRole });
      setUsers(prev => [...prev, r.data].sort((a, b) => a.name.localeCompare(b.name)));
      onCreated(r.data.id);
      setQuickUserOpen(false);
      setQuickUserName('');
      setQuickUserRole('VIEWER');
    } catch (err) {
      console.error('Failed to create user', err);
    } finally {
      setQuickUserSaving(false);
    }
  };

  const doFetch = useCallback((search, status, priority, canvasId) => {
    dispatch(fetchInitiatives({
      parentId: 'null',
      type: 'INITIATIVE',
      ...(search && { search }),
      ...(status && { status }),
      ...(priority && { priority }),
      ...(canvasId !== undefined && canvasId !== null ? { canvasId } : {}),
    }));
  }, [dispatch]);

  useEffect(() => {
    dispatch(fetchAllInitiatives());
  }, [dispatch]); // eslint-disable-line

  useEffect(() => {
    doFetch(searchText, filterStatus, filterPriority, activeCanvasId);
  }, [filterStatus, filterPriority, activeCanvasId]); // eslint-disable-line

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      doFetch(searchText, filterStatus, filterPriority, activeCanvasId);
    }, 300);
  }, [searchText]); // eslint-disable-line

  // Initial fetch handled by the combined effect above

  const handleOpenDialog = (parentId = null, initiative = null) => {
    if (initiative) {
      setFormData({
        title: initiative.title,
        description: initiative.description || '',
        type: initiative.type,
        status: initiative.status,
        priority: initiative.priority,
        parentId: initiative.parentId,
        tags: initiative.tags || [],
        canvasId: initiative.canvasId || null,
        assigneeIds: initiative.assignees?.map(a => a.id) || [],
        startDate: initiative.startDate ? initiative.startDate.slice(0, 10) : '',
        dueDate: initiative.dueDate ? initiative.dueDate.slice(0, 10) : '',
      });
      setEditingId(initiative.id);
    } else {
      setFormData({
        title: '',
        description: '',
        type: parentId ? 'TASK' : 'INITIATIVE',
        status: 'OPEN',
        priority: 'MEDIUM',
        parentId,
        tags: [],
        canvasId: activeCanvasId || null,
        assigneeIds: [],
        startDate: '',
        dueDate: '',
      });
      setEditingId(null);
    }
    setTagInput('');
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setFormData({
      title: '',
      description: '',
      type: 'INITIATIVE',
      status: 'OPEN',
      priority: 'MEDIUM',
      parentId: null,
      tags: [],
      canvasId: null,
      assigneeIds: [],
      startDate: '',
      dueDate: '',
    });
    setTagInput('');
    setEditingId(null);
  };

  const addFormTag = (tag) => {
    const trimmed = tag.trim();
    if (!trimmed || formData.tags.includes(trimmed)) return;
    setFormData(prev => ({ ...prev, tags: [...prev.tags, trimmed] }));
    setTagInput('');
  };

  const removeFormTag = (tag) => {
    setFormData(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  const fetchChildren = useCallback(async (id) => {
    setLoadingChildren(prev => ({ ...prev, [id]: true }));
    try {
      const response = await api.get(`/initiatives?parentId=${id}`);
      setChildrenMap(prev => ({ ...prev, [id]: response.data }));
    } catch (e) {
      console.error('Failed to fetch children', e);
    } finally {
      setLoadingChildren(prev => ({ ...prev, [id]: false }));
    }
  }, []);

  const handleSubmit = async () => {
    const parentId = formData.parentId;
    if (editingId) {
      await dispatch(updateInitiative({ id: editingId, data: { ...formData, canvasId: formData.canvasId || null } }));
    } else {
      await dispatch(createInitiative({ ...formData, canvasId: formData.canvasId || null }));
    }
    handleCloseDialog();
    doFetch(searchText, filterStatus, filterPriority, activeCanvasId);
    if (parentId) {
      fetchChildren(parentId);
      setExpanded(prev => ({ ...prev, [parentId]: true }));
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this initiative and all its children?')) {
      await dispatch(deleteInitiative(id));
      // Remove the deleted item (and any of its children) from the local childrenMap
      setChildrenMap(prev => {
        const next = {};
        for (const [parentId, children] of Object.entries(prev)) {
          next[parentId] = children.filter(c => c.id !== id);
        }
        return next;
      });
      doFetch(searchText, filterStatus, filterPriority, activeCanvasId);
    }
  };

  const handleStatusChange = async (id, status) => {
    await dispatch(updateStatus({ id, status }));
  };

  const handlePriorityChange = async (id, priority) => {
    await dispatch(updatePriority({ id, priority }));
  };

  const handleViewDetails = (id) => {
    setDrawerInitiativeId(id);
    setDrawerOpen(true);
  };

  const toggleExpand = (id) => {
    setExpanded(prev => {
      const nowExpanded = !prev[id];
      if (nowExpanded) fetchChildren(id);
      return { ...prev, [id]: nowExpanded };
    });
  };

  const renderInitiative = (initiative, level = 0) => {
    const sc = STATUS_CONFIG[initiative.status] || STATUS_CONFIG.OPEN;
    const pc = PRIORITY_CONFIG[initiative.priority] || PRIORITY_CONFIG.MEDIUM;
    const hasChildren = initiative._count?.children > 0;
    const isExpanded = expanded[initiative.id];
    return (
      <Box key={initiative.id}>
        <Box
          onClick={() => handleViewDetails(initiative.id)}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            px: 2,
            py: 1.5,
            ml: level * 3,
            bgcolor: 'background.paper',
            border: '1px solid #e2e8f0',
            borderLeft: `3px solid ${pc.border}`,
            borderRadius: 2,
            mb: 1,
            cursor: 'pointer',
            transition: 'box-shadow 0.15s, background-color 0.15s',
            '&:hover': { boxShadow: '0 2px 8px rgba(0,0,0,0.07)', bgcolor: '#f8fafc' },
          }}
        >
          {/* Expand toggle */}
          <Box sx={{ width: 28, flexShrink: 0 }}>
            {hasChildren ? (
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); toggleExpand(initiative.id); }} sx={{ p: 0.25 }}>
                {isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
              </IconButton>
            ) : null}
          </Box>

          {/* Title + meta */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
              <Typography variant="body2" fontWeight={600} sx={{ lineHeight: 1.3 }}>
                {initiative.title}
              </Typography>
              <Chip
                label={TYPE_LABELS[initiative.type] || initiative.type}
                size="small"
                variant="outlined"
                sx={{ height: 18, fontSize: '0.65rem', px: 0.5, color: 'text.secondary', borderColor: '#e2e8f0' }}
              />
            </Box>
            {initiative.description && (
              <Typography variant="caption" color="text.secondary" noWrap display="block" sx={{ mt: 0.25 }}>
                {initiative.description}
              </Typography>
            )}
            <Box display="flex" gap={0.75} mt={0.75} flexWrap="wrap" alignItems="center">
              <FormControl size="small" onClick={e => e.stopPropagation()}>
                <Select
                  value={initiative.status}
                  onChange={(e) => handleStatusChange(initiative.id, e.target.value)}
                  sx={{
                    fontSize: '0.72rem', height: 24, bgcolor: sc.bg, color: sc.color,
                    fontWeight: 500, '.MuiOutlinedInput-notchedOutline': { border: 'none' },
                    '.MuiSelect-icon': { color: sc.color, right: 2 },
                    pr: 0.5,
                  }}
                >
                  {Object.entries(STATUS_CONFIG).map(([v, c]) => (
                    <MenuItem key={v} value={v} sx={{ fontSize: '0.78rem' }}>{c.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" onClick={e => e.stopPropagation()}>
                <Select
                  value={initiative.priority}
                  onChange={(e) => handlePriorityChange(initiative.id, e.target.value)}
                  sx={{
                    fontSize: '0.72rem', height: 24, bgcolor: pc.bg, color: pc.color,
                    fontWeight: 500, '.MuiOutlinedInput-notchedOutline': { border: 'none' },
                    '.MuiSelect-icon': { color: pc.color, right: 2 },
                    pr: 0.5,
                  }}
                >
                  {Object.entries(PRIORITY_CONFIG).map(([v, c]) => (
                    <MenuItem key={v} value={v} sx={{ fontSize: '0.78rem', color: c.color }}>{v.charAt(0) + v.slice(1).toLowerCase()}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {hasChildren && (
                <Typography variant="caption" color="text.disabled">
                  {initiative._count.children} sub-item{initiative._count.children !== 1 ? 's' : ''}
                </Typography>
              )}
              {initiative.createdBy && (
                <Typography variant="caption" color="text.disabled">
                  · {format(new Date(initiative.createdAt), 'MMM d')}
                </Typography>
              )}
              {initiative.assignees?.length > 0 && (
                <AvatarGroup max={5} sx={{ justifyContent: 'flex-start', '& .MuiAvatar-root': { width: 20, height: 20, fontSize: '0.58rem', border: '2px solid white' } }}>
                  {initiative.assignees.map(a => (
                    <Tooltip key={a.id} title={a.name}>
                      <Avatar sx={{ bgcolor: '#6366f1', width: 20, height: 20, fontSize: '0.58rem' }}>
                        {a.name.charAt(0).toUpperCase()}
                      </Avatar>
                    </Tooltip>
                  ))}
                </AvatarGroup>
              )}
            </Box>
            {initiative.tags?.length > 0 && (
              <Box display="flex" gap={0.5} mt={0.75} flexWrap="wrap">
                {initiative.tags.map(tag => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#eff6ff', color: '#1d4ed8', border: 0, fontWeight: 500 }}
                  />
                ))}
              </Box>
            )}
          </Box>

          {/* Actions */}
          <Box display="flex" gap={0.25} flexShrink={0} onClick={e => e.stopPropagation()}>
            <Tooltip title="View details">
              <IconButton size="small" onClick={() => handleViewDetails(initiative.id)} sx={{ color: 'primary.main' }}>
                <Visibility sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Share summary">
              <IconButton size="small" onClick={() => setSummaryId(initiative.id)} sx={{ color: 'text.secondary' }}>
                <IosShare sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Add sub-item">
              <IconButton size="small" onClick={() => handleOpenDialog(initiative.id)} sx={{ color: 'text.secondary' }}>
                <AddCircleOutline sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Edit">
              <IconButton size="small" onClick={() => handleOpenDialog(null, initiative)} sx={{ color: 'text.secondary' }}>
                <Edit sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton size="small" onClick={() => handleDelete(initiative.id)} sx={{ color: 'error.main' }}>
                <Delete sx={{ fontSize: 17 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Children */}
        {isExpanded && (
          loadingChildren[initiative.id]
            ? <Box sx={{ ml: (level + 1) * 3 + 2, mb: 1, py: 1 }}><CircularProgress size={18} /></Box>
            : (childrenMap[initiative.id] || []).map(child => renderInitiative(child, level + 1))
        )}
      </Box>
    );
  };

  if (loading && items.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <CanvasSelector
        screen="initiatives"
        countsByCanvas={allItems.length > 0
          ? Object.fromEntries(
              canvases.map(c => [
                c.id,
                allItems.filter(i =>
                  !i.parentId &&
                  !i.isStandaloneTask &&
                  i.canvasId === c.id &&
                  i.status !== 'COMPLETED' &&
                  i.status !== 'CANCELLED'
                ).length,
              ])
            )
          : undefined
        }
      />
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700}>Initiatives</Typography>
          <Typography variant="body2" color="text.secondary" mt={0.5}>
            {items.length} item{items.length !== 1 ? 's' : ''} total
          </Typography>
        </Box>
        <Box display="flex" gap={1}>
          <Button
            variant="outlined"
            startIcon={<AccountTree />}
            onClick={() => navigate('/mindmap')}
          >
            Mind Map
          </Button>
          <AISuggestionsButton canvasId={activeCanvasId} />
          <Tooltip title="Generate Status Report">
            <Button
              variant="outlined"
              startIcon={<Assessment />}
              onClick={() => setReportOpen(true)}
            >
              Status Report
            </Button>
          </Tooltip>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => handleOpenDialog()}
          >
            New Initiative
          </Button>
        </Box>
      </Box>

      {/* Search + Filter Row */}
      <Box display="flex" gap={1.5} mb={3} flexWrap="wrap" alignItems="center">
        <TextField
          size="small"
          placeholder="Search initiatives…"
          value={searchText}
          onChange={e => setSearchText(e.target.value)}
          sx={{ flex: 1, minWidth: 200 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ fontSize: 18, color: 'text.disabled' }} />
              </InputAdornment>
            ),
            endAdornment: searchText ? (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearchText('')}><Clear sx={{ fontSize: 14 }} /></IconButton>
              </InputAdornment>
            ) : null,
          }}
        />
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={filterStatus}
            label="Status"
            onChange={e => setFilterStatus(e.target.value)}
          >
            <MenuItem value="">All statuses</MenuItem>
            {Object.entries(STATUS_CONFIG).map(([v, c]) => (
              <MenuItem key={v} value={v}>{c.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 130 }}>
          <InputLabel>Priority</InputLabel>
          <Select
            value={filterPriority}
            label="Priority"
            onChange={e => setFilterPriority(e.target.value)}
          >
            <MenuItem value="">All priorities</MenuItem>
            {Object.entries(PRIORITY_CONFIG).map(([v, c]) => (
              <MenuItem key={v} value={v} sx={{ color: c.color, fontWeight: 600 }}>
                {v.charAt(0) + v.slice(1).toLowerCase()}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {(filterStatus || filterPriority || searchText) && (
          <Button
            size="small"
            variant="outlined"
            startIcon={<Clear />}
            onClick={() => { setSearchText(''); setFilterStatus(''); setFilterPriority(''); }}
          >
            Clear
          </Button>
        )}
      </Box>

      {items.length === 0 ? (
        <Box
          sx={{
            bgcolor: 'background.paper',
            borderRadius: 3,
            border: '1px solid #e2e8f0',
            p: 6,
            textAlign: 'center',
          }}
        >
          <Typography color="text.secondary" mb={2}>No initiatives yet. Create your first one!</Typography>
          <Button variant="contained" startIcon={<Add />} onClick={() => handleOpenDialog()}>Create Initiative</Button>
        </Box>
      ) : (
        (() => {
          const isDragEnabled = !searchText && !filterStatus && !filterPriority;
          const listContent = isDragEnabled ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={orderedItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                {orderedItems.map(initiative => (
                  <SortableInitiativeItem key={initiative.id} id={initiative.id}>
                    {renderInitiative(initiative)}
                  </SortableInitiativeItem>
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            orderedItems.map(initiative => renderInitiative(initiative))
          );
          return <Box>{listContent}</Box>;
        })()
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ pb: 1, fontWeight: 700 }}>{editingId ? 'Edit Initiative' : 'New Initiative'}</DialogTitle>
        <Divider />
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label="Description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Type</InputLabel>
                <Select
                  value={formData.type}
                  label="Type"
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                >
                  <MenuItem value="INITIATIVE">Initiative</MenuItem>
                  <MenuItem value="TASK">Task</MenuItem>
                  <MenuItem value="SUBTASK">Subtask</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Priority</InputLabel>
                <Select
                  value={formData.priority}
                  label="Priority"
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                >
                  <MenuItem value="CRITICAL">Critical</MenuItem>
                  <MenuItem value="HIGH">High</MenuItem>
                  <MenuItem value="MEDIUM">Medium</MenuItem>
                  <MenuItem value="LOW">Low</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={formData.status}
                  label="Status"
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <MenuItem value="OPEN">Open</MenuItem>
                  <MenuItem value="IN_PROGRESS">In Progress</MenuItem>
                  <MenuItem value="BLOCKED">Blocked</MenuItem>
                  <MenuItem value="ON_HOLD">On Hold</MenuItem>
                  <MenuItem value="COMPLETED">Completed</MenuItem>
                  <MenuItem value="CANCELLED">Cancelled</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            {canvases.length > 0 && (
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Canvas</InputLabel>
                  <Select
                    value={formData.canvasId || ''}
                    label="Canvas"
                    onChange={(e) => setFormData({ ...formData, canvasId: e.target.value || null })}
                  >
                    <MenuItem value="">— No canvas —</MenuItem>
                    {canvases.map(c => (
                      <MenuItem key={c.id} value={c.id}>
                        <Box display="flex" alignItems="center" gap={1}>
                          <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c.color, flexShrink: 0 }} />
                          {c.name}
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
            )}
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Assignees</InputLabel>
                <Select
                  multiple
                  value={formData.assigneeIds || []}
                  label="Assignees"
                  onChange={e => {
                    const v = e.target.value;
                    if (Array.isArray(v) && v.includes('__create__')) {
                      setQuickUserOpen(true);
                      return;
                    }
                    setFormData({ ...formData, assigneeIds: v });
                  }}
                  renderValue={(selected) => (
                    <Box display="flex" flexWrap="wrap" gap={0.5}>
                      {selected.map(id => {
                        const u = users.find(u => u.id === id);
                        return u ? (
                          <Box key={id} display="flex" alignItems="center" gap={0.4}
                            sx={{ bgcolor: '#eff6ff', borderRadius: 4, px: 0.75, py: 0.25 }}>
                            <Avatar sx={{ width: 16, height: 16, fontSize: '0.55rem', bgcolor: '#6366f1' }}>{u.name.charAt(0).toUpperCase()}</Avatar>
                            <Typography sx={{ fontSize: '0.72rem', color: '#1d4ed8', fontWeight: 500 }}>{u.name}</Typography>
                          </Box>
                        ) : null;
                      })}
                    </Box>
                  )}
                >
                  {users.map(u => (
                    <MenuItem key={u.id} value={u.id}>
                      <Box display="flex" alignItems="center" gap={1}>
                        <Avatar sx={{ width: 24, height: 24, fontSize: '0.65rem', bgcolor: '#6366f1' }}>{u.name.charAt(0).toUpperCase()}</Avatar>
                        <Box>
                          <Typography variant="body2" fontWeight={500}>{u.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                        </Box>
                      </Box>
                    </MenuItem>
                  ))}
                  <Divider />
                  <MenuItem value="__create__" sx={{ color: '#6366f1', gap: 1 }}>
                    <PersonAdd sx={{ fontSize: 16 }} />
                    <Typography variant="body2" fontWeight={500} color="#6366f1">New person…</Typography>
                  </MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.75}>
                TIMELINE
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={0.75} mb={1.5}>
                {TIMELINE_PRESETS.map(({ label, key }) => {
                  const val = getTimelineDate(key);
                  const active = formData.dueDate === val;
                  return (
                    <Chip
                      key={key}
                      label={label}
                      size="small"
                      clickable
                      onClick={() => setFormData(f => ({ ...f, dueDate: active ? '' : val }))}
                      color={active ? 'primary' : 'default'}
                      variant={active ? 'filled' : 'outlined'}
                      sx={{ fontSize: '0.72rem', fontWeight: 500 }}
                    />
                  );
                })}
              </Box>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    type="date"
                    label="Start Date"
                    size="small"
                    value={formData.startDate}
                    onChange={e => setFormData(f => ({ ...f, startDate: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <TextField
                    fullWidth
                    type="date"
                    label="Due Date"
                    size="small"
                    value={formData.dueDate}
                    onChange={e => setFormData(f => ({ ...f, dueDate: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
              </Grid>
            </Grid>
            <Grid item xs={12}>
              <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.75}>
                TAGS
              </Typography>
              <Box display="flex" flexWrap="wrap" gap={0.5} mb={0.75}>
                {formData.tags.map(tag => (
                  <Chip
                    key={tag}
                    label={tag}
                    size="small"
                    onDelete={() => removeFormTag(tag)}
                    sx={{ bgcolor: '#eff6ff', color: '#1d4ed8', border: 0, fontWeight: 500, fontSize: '0.72rem' }}
                  />
                ))}
              </Box>
              <Autocomplete
                freeSolo
                disableClearable
                options={allTags}
                filterOptions={(opts, { inputValue }) =>
                  inputValue.length >= 3
                    ? opts.filter(o => !formData.tags.includes(o) && o.toLowerCase().includes(inputValue.toLowerCase()))
                    : []
                }
                inputValue={tagInput}
                onInputChange={(_, val, reason) => { if (reason === 'input') setTagInput(val); }}
                onChange={(_, val) => { if (val) addFormTag(typeof val === 'string' ? val : ''); }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    size="small"
                    fullWidth
                    placeholder="Type a tag and press Enter or comma…"
                    onKeyDown={e => {
                      if (e.key === ',') { e.preventDefault(); addFormTag(tagInput); }
                    }}
                    onBlur={() => { if (tagInput.trim()) addFormTag(tagInput); }}
                    InputProps={{
                      ...params.InputProps,
                      startAdornment: (
                        <InputAdornment position="start">
                          <Label sx={{ fontSize: 16, color: 'text.disabled' }} />
                        </InputAdornment>
                      )
                    }}
                  />
                )}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseDialog} variant="outlined">Cancel</Button>
          <Button onClick={handleSubmit} variant="contained" disabled={!formData.title}>
            {editingId ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Detail Drawer */}
      <InitiativeDetailDrawer
        open={drawerOpen}
        initiativeId={drawerInitiativeId}
        onClose={() => setDrawerOpen(false)}
      />

      {/* Summary Dialog */}
      <InitiativeSummaryDialog
        open={!!summaryId}
        initiativeId={summaryId}
        onClose={() => setSummaryId(null)}
      />

      {/* Status Report Dialog */}
      <StatusReportDialog
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        activeCanvasId={activeCanvasId}
        canvases={canvases}
      />

      {/* Quick create user dialog */}
      <Dialog open={quickUserOpen} onClose={() => setQuickUserOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>New Assignee</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
          <TextField
            label="Name *"
            size="small"
            fullWidth
            autoFocus
            value={quickUserName}
            onChange={e => setQuickUserName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleQuickCreateUser(id => setFormData(f => ({ ...f, assigneeIds: [...(f.assigneeIds || []), id] })))}
          />
          <FormControl size="small" fullWidth>
            <InputLabel>Role</InputLabel>
            <Select label="Role" value={quickUserRole} onChange={e => setQuickUserRole(e.target.value)}>
              <MenuItem value="ADMIN">Admin</MenuItem>
              <MenuItem value="MANAGER">Manager</MenuItem>
              <MenuItem value="VIEWER">Viewer</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button size="small" onClick={() => setQuickUserOpen(false)}>Cancel</Button>
          <Button
            size="small" variant="contained" disabled={!quickUserName.trim() || quickUserSaving}
            onClick={() => handleQuickCreateUser(id => setFormData(f => ({ ...f, assigneeIds: [...(f.assigneeIds || []), id] })))}
          >
            {quickUserSaving ? 'Creating…' : 'Create & Add'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
