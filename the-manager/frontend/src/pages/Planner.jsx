import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Box, Typography, IconButton, Button, Chip, Tooltip,
  CircularProgress, Alert, Tabs, Tab, TextField, Divider,
  Paper, Skeleton, Menu, MenuItem, ListItemIcon, ListItemText,
} from '@mui/material';
import {
  ChevronLeft, ChevronRight, AutoAwesome, Psychology,
  DragIndicator, Close, Add, Today, LightMode, NightlightRound,
  AccessTime, CheckCircle, Warning, DriveFileMove, CalendarToday,
  East,
} from '@mui/icons-material';
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  DragOverlay, useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api from '../api/axios';
import { format, addDays, subDays, startOfWeek, parseISO, isToday, addWeeks } from 'date-fns';

// ─── Constants ────────────────────────────────────────────────────────────────

const HOURLY_SLOTS = [
  { key: '09:00', label: '9 AM' },
  { key: '10:00', label: '10 AM' },
  { key: '11:00', label: '11 AM' },
  { key: '12:00', label: '12 PM' },
  { key: '13:00', label: '1 PM' },
  { key: '14:00', label: '2 PM' },
  { key: '15:00', label: '3 PM' },
  { key: '16:00', label: '4 PM' },
  { key: '17:00', label: '5 PM' },
  { key: '18:00', label: '6 PM' },
  { key: '19:00', label: '7 PM' },
  { key: '20:00', label: '8 PM' },
  { key: '21:00', label: '9 PM' },
  { key: '22:00', label: '10 PM' },
];
const HALF_DAY_SLOTS = [
  { key: 'FIRST_HALF',  label: '🌅 Morning' },
  { key: 'SECOND_HALF', label: '🌆 Afternoon' },
];

const PRIORITY_COLOR = {
  CRITICAL: '#dc2626', HIGH: '#d97706', MEDIUM: '#6366f1', LOW: '#64748b',
};
const STATUS_ICONS = {
  COMPLETED: <CheckCircle sx={{ fontSize: 13, color: '#10b981' }} />,
  BLOCKED:   <Warning sx={{ fontSize: 13, color: '#ef4444' }} />,
};

// Which slot keys "belong to" each half-day bucket
const SLOT_MEMBERSHIP = {
  FIRST_HALF:  new Set(['FIRST_HALF',  '09:00', '10:00', '11:00', '12:00']),
  SECOND_HALF: new Set(['SECOND_HALF', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00']),
};
const ALL_KNOWN_SLOTS = new Set([...SLOT_MEMBERSHIP.FIRST_HALF, ...SLOT_MEMBERSHIP.SECOND_HALF]);

// For a given slot key and mode, return the matching entries
function getSlotEntries(entries, slotKey) {
  if (SLOT_MEMBERSHIP[slotKey]) {
    // Half-day slot: include entries from all hourly sub-slots
    return entries.filter(e => SLOT_MEMBERSHIP[slotKey].has(e.slot));
  }
  // Hourly slot: exact match only
  return entries.filter(e => e.slot === slotKey);
}

const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// ─── Task Card (draggable inside a slot) ─────────────────────────────────────

function TaskCard({ entry, onRemove, onEdit, onMove, isDragging }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSelf } = useSortable({ id: entry.id });
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState('');
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [customDateMode, setCustomDateMode] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const inputRef = useRef(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSelf ? 0.4 : 1,
  };
  const displayTitle = entry.customTitle || entry.initiative?.title || '(Untitled)';
  const priority = entry.initiative?.priority;
  const status = entry.initiative?.status;

  function startEdit() {
    setEditVal(entry.customTitle || entry.initiative?.title || '');
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 30);
  }

  function commitEdit() {
    const val = editVal.trim();
    if (val && val !== (entry.customTitle || entry.initiative?.title)) {
      onEdit(entry.id, val);
    }
    setEditing(false);
  }

  function handleMovePreset(targetDate) {
    setMenuAnchor(null);
    setCustomDateMode(false);
    onMove(entry.id, entry, targetDate);
  }

  const today = new Date();

  return (
    <Box
      ref={setNodeRef} style={style}
      sx={{
        display: 'flex', alignItems: 'center', gap: 0.75,
        px: 1, py: 0.75,
        borderRadius: 1.5,
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: editing ? 'primary.main' : isDragging ? 'primary.main' : 'divider',
        boxShadow: isDragging ? 3 : 0,
        cursor: editing ? 'default' : 'grab', userSelect: 'none',
        '&:hover': { borderColor: 'primary.light', boxShadow: 1 },
        '&:hover .move-btn': { opacity: 1 },
        minWidth: 0,
      }}
    >
      {!editing && (
        <Box {...attributes} {...listeners} sx={{ color: 'text.disabled', flexShrink: 0, cursor: 'grab', display: 'flex' }}>
          <DragIndicator sx={{ fontSize: 14 }} />
        </Box>
      )}
      {priority && (
        <Box sx={{ width: 3, height: 24, borderRadius: 1, bgcolor: PRIORITY_COLOR[priority] || '#94a3b8', flexShrink: 0 }} />
      )}

      {editing ? (
        <TextField
          inputRef={inputRef}
          value={editVal}
          onChange={e => setEditVal(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
            if (e.key === 'Escape') { setEditing(false); }
          }}
          variant="standard"
          size="small"
          fullWidth
          InputProps={{ disableUnderline: false, sx: { fontSize: '0.8rem', fontWeight: 500 } }}
          sx={{ flex: 1 }}
        />
      ) : (
        <Tooltip title="Double-click to edit" placement="top" enterDelay={800}>
          <Typography
            variant="caption"
            onDoubleClick={startEdit}
            sx={{ flex: 1, fontWeight: 500, fontSize: '0.8rem', lineHeight: 1.3, cursor: 'text' }}
            noWrap
          >
            {displayTitle}
          </Typography>
        </Tooltip>
      )}

      {!editing && status && STATUS_ICONS[status]}

      {!editing && (
        <Tooltip title="Move to another day">
          <IconButton
            className="move-btn"
            size="small"
            onClick={e => { setMenuAnchor(e.currentTarget); setCustomDateMode(false); }}
            sx={{ p: 0.25, opacity: 0, transition: 'opacity 0.15s', color: 'text.disabled', flexShrink: 0, '&:hover': { color: 'primary.main' } }}
          >
            <East sx={{ fontSize: 13 }} />
          </IconButton>
        </Tooltip>
      )}

      {!editing && (
        <Tooltip title="Remove from slot">
          <IconButton size="small" onClick={() => onRemove(entry.id)} sx={{ p: 0.25, color: 'text.disabled', flexShrink: 0, '&:hover': { color: 'error.main' } }}>
            <Close sx={{ fontSize: 13 }} />
          </IconButton>
        </Tooltip>
      )}

      {/* Move menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => { setMenuAnchor(null); setCustomDateMode(false); }}
        slotProps={{ paper: { sx: { minWidth: 180 } } }}
      >
        {!customDateMode ? (
          [
            <MenuItem key="tomorrow" onClick={() => handleMovePreset(format(addDays(today, 1), 'yyyy-MM-dd'))}>
              <ListItemIcon><CalendarToday sx={{ fontSize: 15 }} /></ListItemIcon>
              <ListItemText primary="Tomorrow" secondary={format(addDays(today, 1), 'EEE, MMM d')} slotProps={{ secondary: { style: { fontSize: '0.7rem' } } }} />
            </MenuItem>,
            <MenuItem key="2days" onClick={() => handleMovePreset(format(addDays(today, 2), 'yyyy-MM-dd'))}>
              <ListItemIcon><CalendarToday sx={{ fontSize: 15 }} /></ListItemIcon>
              <ListItemText primary="In 2 days" secondary={format(addDays(today, 2), 'EEE, MMM d')} slotProps={{ secondary: { style: { fontSize: '0.7rem' } } }} />
            </MenuItem>,
            <MenuItem key="nextweek" onClick={() => handleMovePreset(format(addWeeks(today, 1), 'yyyy-MM-dd'))}>
              <ListItemIcon><CalendarToday sx={{ fontSize: 15 }} /></ListItemIcon>
              <ListItemText primary="Next week" secondary={format(addWeeks(today, 1), 'EEE, MMM d')} slotProps={{ secondary: { style: { fontSize: '0.7rem' } } }} />
            </MenuItem>,
            <Divider key="div" />,
            <MenuItem key="custom" onClick={() => setCustomDateMode(true)}>
              <ListItemIcon><DriveFileMove sx={{ fontSize: 15 }} /></ListItemIcon>
              <ListItemText primary="Pick a date…" />
            </MenuItem>,
          ]
        ) : (
          <Box sx={{ px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Typography variant="caption" fontWeight={600}>Pick a date</Typography>
            <TextField
              type="date"
              size="small"
              value={customDate}
              onChange={e => setCustomDate(e.target.value)}
              inputProps={{ min: format(addDays(today, 1), 'yyyy-MM-dd') }}
              sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem' } }}
            />
            <Button
              size="small" variant="contained" disabled={!customDate}
              onClick={() => handleMovePreset(customDate)}
              sx={{ textTransform: 'none', fontSize: '0.78rem' }}
            >
              Move
            </Button>
          </Box>
        )}
      </Menu>
    </Box>
  );
}

// ─── Inline slot add input ────────────────────────────────────────────────────

function SlotAddInput({ onAdd, onCancel }) {
  const [val, setVal] = useState('');
  const ref = useRef(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center', mt: 0.5 }}>
      <TextField
        inputRef={ref}
        size="small" fullWidth
        placeholder="Task title…"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && val.trim()) { onAdd(val.trim()); }
          if (e.key === 'Escape') { onCancel(); }
        }}
        sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem', py: 0.6 } }}
      />
      <IconButton size="small" onClick={() => val.trim() && onAdd(val.trim())} sx={{ color: 'primary.main' }}>
        <Add sx={{ fontSize: 16 }} />
      </IconButton>
      <IconButton size="small" onClick={onCancel} sx={{ color: 'text.disabled' }}>
        <Close sx={{ fontSize: 16 }} />
      </IconButton>
    </Box>
  );
}

// ─── Droppable slot ───────────────────────────────────────────────────────────

function SlotDropZone({ slotKey, children, isOver }) {
  const { setNodeRef } = useDroppable({ id: `slot:${slotKey}` });
  return (
    <Box
      ref={setNodeRef}
      sx={{
        minHeight: 48, borderRadius: 1.5, p: 0.5,
        border: '1.5px dashed',
        borderColor: isOver ? 'primary.main' : 'transparent',
        bgcolor: isOver ? 'primary.50' : 'transparent',
        transition: 'all 0.15s',
      }}
    >
      {children}
    </Box>
  );
}

// ─── Draggable task bank item ─────────────────────────────────────────────────

function BankItem({ task, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `bank:${task.id}` });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  return (
    <Box
      ref={setNodeRef} style={style}
      sx={{
        display: 'flex', alignItems: 'flex-start', gap: 1,
        px: 1.25, py: 1,
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'background.paper',
        userSelect: 'none',
        '&:hover': { borderColor: 'primary.light', boxShadow: 1 },
        '&:hover .bank-remove': { opacity: 1 },
      }}
    >
      <Box {...attributes} {...listeners} sx={{ cursor: 'grab', display: 'flex', mt: 0.5, color: 'text.disabled' }}>
        <DragIndicator sx={{ fontSize: 14 }} />
      </Box>
      <Box sx={{ width: 3, height: 32, borderRadius: 1, bgcolor: PRIORITY_COLOR[task.priority] || '#94a3b8', flexShrink: 0, mt: 0.25 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" sx={{ fontWeight: 600, fontSize: '0.8rem', display: 'block' }} noWrap>
          {task.title}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25, flexWrap: 'wrap' }}>
          <Chip label={task.priority} size="small" sx={{ height: 16, fontSize: '0.62rem', bgcolor: PRIORITY_COLOR[task.priority] + '22', color: PRIORITY_COLOR[task.priority] }} />
          {task.dueDate && (
            <Chip label={`Due ${format(parseISO(task.dueDate), 'MMM d')}`} size="small" sx={{ height: 16, fontSize: '0.62rem' }} />
          )}
        </Box>
      </Box>
      {onRemove && (
        <Tooltip title="Remove from bank">
          <IconButton
            className="bank-remove" size="small"
            onClick={() => onRemove(task.id)}
            sx={{ p: 0.25, opacity: 0, transition: 'opacity 0.15s', color: 'text.disabled', '&:hover': { color: 'error.main' } }}
          >
            <Close sx={{ fontSize: 13 }} />
          </IconButton>
        </Tooltip>
      )}
    </Box>
  );
}

// ─── Daily View ───────────────────────────────────────────────────────────────

function DailyView({ date, mode, slots }) {
  const [entries, setEntries] = useState([]);   // PlannerEntry[] from DB
  const [bank, setBank] = useState([]);          // unscheduled tasks
  const [customBankItems, setCustomBankItems] = useState([]); // free-text bank items
  const [addingToSlot, setAddingToSlot] = useState(null); // slotKey | null
  const [bankInput, setBankInput] = useState('');
  const [dayNote, setDayNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [recommending, setRecommending] = useState(false);
  const [aiRecommending, setAiRecommending] = useState(false);
  const [aiReasoning, setAiReasoning] = useState('');
  const [aiTips, setAiTips] = useState([]);
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [overSlot, setOverSlot] = useState(null);
  const dayNoteTimer = useRef(null);

  const dateStr = format(date, 'yyyy-MM-dd');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ── Load entries + tasks ──
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [entriesRes, tasksRes] = await Promise.all([
        api.get(`/planner?date=${dateStr}`),
        api.get('/initiatives?isStandaloneTask=true&status=OPEN'),
      ]);
      const all = await api.get('/initiatives?status=IN_PROGRESS');
      const dayNoteEntry = entriesRes.data.find(e => e.slot === 'DAY_NOTE');
      setDayNote(dayNoteEntry?.note || '');
      const slotEntries = entriesRes.data.filter(e => e.slot !== 'DAY_NOTE');
      setEntries(slotEntries);

      // Build bank: all open tasks + in-progress initiatives not already scheduled
      const scheduledIds = new Set(slotEntries.map(e => e.initiativeId).filter(Boolean));
      const allTasks = [...tasksRes.data, ...all.data.filter(t => !tasksRes.data.find(x => x.id === t.id))];
      setBank(allTasks.filter(t => !scheduledIds.has(t.id)));
    } catch (e) {
      setError('Failed to load planner data');
    } finally {
      setLoading(false);
    }
  }, [dateStr]);

  useEffect(() => { load(); }, [load]);

  // ── Day note auto-save ──
  const handleDayNoteChange = (val) => {
    setDayNote(val);
    clearTimeout(dayNoteTimer.current);
    dayNoteTimer.current = setTimeout(() => {
      api.post('/planner/day-note', { date: dateStr, note: val }).catch(() => {});
    }, 800);
  };

  // ── Drag handlers ──
  function handleDragStart(e) { setActiveId(e.active.id); }
  function handleDragOver(e) {
    const over = e.over?.id || '';
    setOverSlot(over.startsWith('slot:') ? over.replace('slot:', '') : null);
  }

  async function handleDragEnd(e) {
    const { active, over } = e;
    setActiveId(null);
    setOverSlot(null);
    if (!over) return;

    const activeId = active.id;
    const overId = over.id;

    // Drag from bank → slot
    if (String(activeId).startsWith('bank:') && String(overId).startsWith('slot:')) {
      const taskId = String(activeId).replace('bank:', '');
      const slotKey = String(overId).replace('slot:', '');
      const task = bank.find(t => t.id === taskId) || customBankItems.find(t => t.id === taskId);
      if (!task) return;
      try {
        const maxPos = entries.filter(e => e.slot === slotKey).length;
        const isCustom = customBankItems.some(t => t.id === taskId);
        const payload = isCustom
          ? { date: dateStr, slot: slotKey, customTitle: task.title, position: maxPos }
          : { date: dateStr, slot: slotKey, initiativeId: taskId, position: maxPos };
        const res = await api.put('/planner', payload);
        setEntries(prev => [...prev, res.data]);
        setBank(prev => prev.filter(t => t.id !== taskId));
        setCustomBankItems(prev => prev.filter(t => t.id !== taskId));
      } catch { setError('Failed to add task to slot'); }
      return;
    }

    // Drag entry → different slot
    if (!String(activeId).startsWith('bank:') && String(overId).startsWith('slot:')) {
      const slotKey = String(overId).replace('slot:', '');
      const entry = entries.find(e => e.id === activeId);
      if (!entry || entry.slot === slotKey) return;
      try {
        await api.put('/planner', { id: entry.id, date: dateStr, slot: slotKey, initiativeId: entry.initiativeId, customTitle: entry.customTitle, position: 0 });
        setEntries(prev => prev.map(e => e.id === activeId ? { ...e, slot: slotKey } : e));
      } catch { setError('Failed to move entry'); }
      return;
    }

    // Reorder within same slot OR move entry to a different slot (when dropped on another entry)
    if (!String(activeId).startsWith('bank:') && !String(overId).startsWith('slot:') && !String(overId).startsWith('bank:')) {
      const oldIdx = entries.findIndex(e => e.id === activeId);
      const newIdx = entries.findIndex(e => e.id === overId);
      if (oldIdx !== -1 && newIdx !== -1) {
        const activeEntry = entries[oldIdx];
        const overEntry = entries[newIdx];
        if (activeEntry.slot !== overEntry.slot) {
          // Cross-slot drop — move the entry into the target's slot
          try {
            await api.put('/planner', { id: activeEntry.id, date: dateStr, slot: overEntry.slot, initiativeId: activeEntry.initiativeId, customTitle: activeEntry.customTitle, position: newIdx });
            setEntries(prev => prev.map(e => e.id === activeId ? { ...e, slot: overEntry.slot } : e));
          } catch { setError('Failed to move entry'); }
        } else {
          // Same slot — reorder
          const reordered = arrayMove(entries, oldIdx, newIdx);
          setEntries(reordered);
          reordered.filter(e => e.slot === activeEntry.slot).forEach((e, i) => {
            api.put('/planner', { id: e.id, date: dateStr, slot: e.slot, initiativeId: e.initiativeId, position: i }).catch(() => {});
          });
        }
      }
    }
  }

  async function handleRemove(entryId) {
    const entry = entries.find(e => e.id === entryId);
    try {
      await api.delete(`/planner/${entryId}`);
      setEntries(prev => prev.filter(e => e.id !== entryId));
      if (entry?.initiative) setBank(prev => [...prev, entry.initiative]);
      if (entry?.customTitle && !entry?.initiativeId) {
        setCustomBankItems(prev => [...prev, { id: `custom-${Date.now()}`, title: entry.customTitle, priority: 'MEDIUM' }]);
      }
    } catch { setError('Failed to remove entry'); }
  }

  async function handleAddToSlot(slotKey, title) {
    setAddingToSlot(null);
    try {
      const maxPos = entries.filter(e => e.slot === slotKey).length;
      const res = await api.put('/planner', { date: dateStr, slot: slotKey, customTitle: title, position: maxPos });
      setEntries(prev => [...prev, res.data]);
      // Remove from custom bank if it was there
      setCustomBankItems(prev => prev.filter(i => i.title !== title));
    } catch { setError('Failed to add entry'); }
  }

  async function handleEdit(entryId, newTitle) {
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;
    try {
      await api.put('/planner', { id: entryId, date: dateStr, slot: entry.slot, initiativeId: entry.initiativeId, customTitle: newTitle, position: entry.position });
      setEntries(prev => prev.map(e => e.id === entryId ? { ...e, customTitle: newTitle } : e));
    } catch { setError('Failed to update entry'); }
  }

  async function handleMove(entryId, entry, targetDate) {
    try {
      await api.put('/planner', { id: entryId, date: targetDate, slot: entry.slot, initiativeId: entry.initiativeId, customTitle: entry.customTitle, position: entry.position });
      setEntries(prev => prev.filter(e => e.id !== entryId));
      if (entry.initiative) setBank(prev => [...prev, entry.initiative]);
    } catch { setError('Failed to move entry'); }
  }

  function handleAddCustomToBank() {
    const title = bankInput.trim();
    if (!title) return;
    setCustomBankItems(prev => [...prev, { id: `custom-${Date.now()}-${Math.random()}`, title, priority: 'MEDIUM' }]);
    setBankInput('');
  }

  function handleRemoveFromBank(taskId) {
    setBank(prev => prev.filter(t => t.id !== taskId));
    setCustomBankItems(prev => prev.filter(t => t.id !== taskId));
  }

  async function handleRecommend() {
    setRecommending(true); setError(''); setAiReasoning(''); setAiTips([]);
    try {
      const modeKey = mode === 'hourly' ? 'hourly' : 'halfday';
      const res = await api.post('/planner/recommend', { date: dateStr, mode: modeKey });
      await api.post('/planner/bulk', { date: dateStr, entries: res.data.entries });
      await load();
    } catch { setError('Recommendation failed'); } finally { setRecommending(false); }
  }

  async function handleAIRecommend() {
    setAiRecommending(true); setError(''); setAiReasoning(''); setAiTips([]);
    try {
      const modeKey = mode === 'hourly' ? 'hourly' : 'halfday';
      const res = await api.post('/planner/ai-recommend', { date: dateStr, mode: modeKey });
      setAiReasoning(res.data.reasoning || '');
      setAiTips(res.data.tips || []);
      await api.post('/planner/bulk', { date: dateStr, entries: res.data.entries });
      await load();
    } catch (e) {
      setError(e.response?.data?.error || 'AI recommendation failed');
    } finally { setAiRecommending(false); }
  }

  const activeEntry = activeId ? entries.find(e => e.id === activeId) : null;
  const activeBankTask = activeId ? bank.find(t => `bank:${t.id}` === activeId) : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      autoScroll={{ enabled: true, threshold: { x: 0.1, y: 0.15 } }}
    >
      <Box sx={{ display: 'flex', gap: 2.5, minHeight: 0 }}>

        {/* ── Left: Slots ── */}
        <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {error && <Alert severity="error" onClose={() => setError('')} sx={{ mb: 1 }}>{error}</Alert>}
          {(aiReasoning || aiTips.length > 0) && (
            <Alert severity="info" icon={<AutoAwesome fontSize="small" />} onClose={() => { setAiReasoning(''); setAiTips([]); }}>
              {aiReasoning && <Typography variant="caption" display="block">{aiReasoning}</Typography>}
              {aiTips.map((t, i) => <Typography key={i} variant="caption" display="block">• {t}</Typography>)}
            </Alert>
          )}

          {loading ? (
            slots.map((s, i) => <Skeleton key={i} variant="rounded" height={80} />)
          ) : (
            <>
            {slots.map(slotDef => {
              const slotEntries = getSlotEntries(entries, slotDef.key).sort((a, b) => a.position - b.position);
              return (
                <Paper key={slotDef.key} variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    {mode === 'hourly'
                      ? <AccessTime sx={{ fontSize: 15, color: 'text.secondary' }} />
                      : <Typography sx={{ fontSize: '1rem', lineHeight: 1 }}>{slotDef.label.split(' ')[0]}</Typography>
                    }
                    <Typography variant="caption" fontWeight={700} sx={{ color: 'text.primary' }}>
                      {mode === 'hourly' ? slotDef.label : slotDef.label.replace(/^\S+\s/, '')}
                    </Typography>
                    {slotDef.sub && <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem' }}>{slotDef.sub}</Typography>}
                    <Chip label={slotEntries.length} size="small" sx={{ height: 16, fontSize: '0.65rem', ml: 'auto' }} />
                  </Box>

                  <SlotDropZone slotKey={slotDef.key} isOver={overSlot === slotDef.key}>
                    <SortableContext items={slotEntries.map(e => e.id)} strategy={verticalListSortingStrategy}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                        {slotEntries.map(entry => (
                          <TaskCard key={entry.id} entry={entry} onRemove={handleRemove} onEdit={handleEdit} onMove={handleMove} />
                        ))}
                        {slotEntries.length === 0 && !addingToSlot && (
                          <Typography variant="caption" sx={{ color: 'text.disabled', py: 0.5, textAlign: 'center', display: 'block' }}>
                            Drop tasks here
                          </Typography>
                        )}
                        {addingToSlot === slotDef.key
                          ? <SlotAddInput onAdd={(t) => handleAddToSlot(slotDef.key, t)} onCancel={() => setAddingToSlot(null)} />
                          : (
                            <Button
                              size="small" startIcon={<Add sx={{ fontSize: 13 }} />}
                              onClick={() => setAddingToSlot(slotDef.key)}
                              sx={{ textTransform: 'none', fontSize: '0.72rem', color: 'text.disabled', justifyContent: 'flex-start', px: 0.5, py: 0.25, '&:hover': { color: 'primary.main', bgcolor: 'transparent' } }}
                            >
                              Add item
                            </Button>
                          )
                        }
                      </Box>
                    </SortableContext>
                  </SlotDropZone>
                </Paper>
              );
            })}

            {/* Unslotted — entries whose slot is unknown / not in any current mode mapping */}
            {(() => {
              const currentKeys = new Set(slots.map(s => s.key));
              // In hourly mode: FIRST_HALF/SECOND_HALF are covered by SLOT_MEMBERSHIP, not unslotted
              // Truly unslotted = slot not in ALL_KNOWN_SLOTS
              const unslotted = entries.filter(e => !ALL_KNOWN_SLOTS.has(e.slot)).sort((a, b) => a.position - b.position);
              if (unslotted.length === 0) return null;
              const slotLabel = s => {
                if (s === 'FIRST_HALF') return 'Morning';
                if (s === 'SECOND_HALF') return 'Afternoon';
                return s;
              };
              return (
                <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, borderColor: 'warning.light', bgcolor: 'warning.50' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography variant="caption" fontWeight={700} sx={{ color: 'warning.dark' }}>
                      ⚠️ Unslotted items
                    </Typography>
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.7rem', ml: 'auto' }}>
                      Drag to a slot to reassign
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                    {unslotted.map(entry => (
                      <Box key={entry.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Chip label={slotLabel(entry.slot)} size="small" sx={{ height: 16, fontSize: '0.62rem', flexShrink: 0 }} />
                        <TaskCard entry={entry} onRemove={handleRemove} onEdit={handleEdit} onMove={handleMove} />
                      </Box>
                    ))}
                  </Box>
                </Paper>
              );
            })()}
            </>
          )}

          {/* Day Note */}
          <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
            <Typography variant="caption" fontWeight={700} sx={{ display: 'block', mb: 0.75, color: 'text.secondary' }}>
              📝 Day Notes
            </Typography>
            <TextField
              multiline minRows={2} maxRows={6} fullWidth size="small"
              placeholder="Jot down thoughts, blockers, or anything for the day..."
              value={dayNote}
              onChange={e => handleDayNoteChange(e.target.value)}
              variant="standard"
              InputProps={{ disableUnderline: true, sx: { fontSize: '0.85rem' } }}
            />
          </Paper>
        </Box>

        {/* ── Right: Task Bank ── */}
        <Box sx={{ width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" fontWeight={700} sx={{ color: 'text.secondary', textTransform: 'uppercase', fontSize: '0.7rem', letterSpacing: '0.06em' }}>
              Task Bank
            </Typography>
            <Chip label={bank.length} size="small" sx={{ height: 16, fontSize: '0.65rem' }} />
          </Box>

          {/* Recommend buttons */}
          <Button
            variant="outlined" size="small" fullWidth startIcon={recommending ? <CircularProgress size={13} /> : <Psychology />}
            onClick={handleRecommend} disabled={recommending || aiRecommending}
            sx={{ textTransform: 'none', fontSize: '0.8rem', borderRadius: 1.5 }}
          >
            Smart Recommend
          </Button>
          <Button
            variant="contained" size="small" fullWidth startIcon={aiRecommending ? <CircularProgress size={13} color="inherit" /> : <AutoAwesome />}
            onClick={handleAIRecommend} disabled={recommending || aiRecommending}
            sx={{ textTransform: 'none', fontSize: '0.8rem', borderRadius: 1.5, background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}
          >
            ✨ AI Recommend
          </Button>

          <Divider sx={{ my: 0.5 }} />

          {/* Add custom bank item */}
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            <TextField
              size="small" fullWidth
              placeholder="Add custom item…"
              value={bankInput}
              onChange={e => setBankInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddCustomToBank()}
              sx={{ '& .MuiInputBase-input': { fontSize: '0.8rem', py: 0.6 } }}
            />
            <Tooltip title="Add to bank">
              <IconButton size="small" onClick={handleAddCustomToBank} disabled={!bankInput.trim()} sx={{ color: 'primary.main' }}>
                <Add sx={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          </Box>

          <SortableContext items={[...bank, ...customBankItems].map(t => `bank:${t.id}`)} strategy={verticalListSortingStrategy}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, overflowY: 'auto', maxHeight: 'calc(100vh - 360px)', pr: 0.5 }}>
              {loading ? [1, 2, 3].map(i => <Skeleton key={i} variant="rounded" height={56} />) :
                (bank.length === 0 && customBankItems.length === 0)
                  ? <Typography variant="caption" sx={{ color: 'text.disabled', textAlign: 'center', py: 2, display: 'block' }}>All tasks scheduled!</Typography>
                  : [
                      ...bank.map(task => <BankItem key={task.id} task={task} onRemove={handleRemoveFromBank} />),
                      ...customBankItems.map(task => <BankItem key={task.id} task={task} onRemove={handleRemoveFromBank} />),
                    ]
              }
            </Box>
          </SortableContext>
        </Box>
      </Box>

      {/* Drag overlay */}
      <DragOverlay>
        {activeEntry && (
          <Box sx={{ px: 1.25, py: 0.75, borderRadius: 1.5, bgcolor: 'background.paper', border: '1.5px solid', borderColor: 'primary.main', boxShadow: 4, opacity: 0.95 }}>
            <Typography variant="caption" fontWeight={600}>{activeEntry.initiative?.title || activeEntry.customTitle}</Typography>
          </Box>
        )}
        {activeBankTask && (
          <Box sx={{ px: 1.25, py: 0.75, borderRadius: 1.5, bgcolor: 'background.paper', border: '1.5px solid', borderColor: 'primary.main', boxShadow: 4, opacity: 0.95 }}>
            <Typography variant="caption" fontWeight={600}>{activeBankTask.title}</Typography>
          </Box>
        )}
      </DragOverlay>
    </DndContext>
  );
}

// ─── Weekly View ──────────────────────────────────────────────────────────────

function WeeklyView({ weekStart, onDayClick }) {
  const [weekEntries, setWeekEntries] = useState([]);
  const [loading, setLoading] = useState(true);

  const startStr = format(weekStart, 'yyyy-MM-dd');
  const endStr   = format(addDays(weekStart, 6), 'yyyy-MM-dd');

  useEffect(() => {
    setLoading(true);
    api.get(`/planner?startDate=${startStr}&endDate=${endStr}`)
      .then(r => setWeekEntries(r.data.filter(e => e.slot !== 'DAY_NOTE')))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [startStr, endStr]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const entriesForDay = (day, bucket) => {
    const keys = Array.from(SLOT_MEMBERSHIP[bucket] || []);
    return weekEntries.filter(e =>
      e.date === format(day, 'yyyy-MM-dd') && keys.includes(e.slot)
    );
  };

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: '80px repeat(7, 1fr)', gap: 0, minWidth: 700 }}>
        {/* Header */}
        <Box />
        {days.map((day, i) => (
          <Box
            key={i}
            onClick={() => onDayClick(day)}
            sx={{
              p: 1, textAlign: 'center', cursor: 'pointer', borderBottom: '2px solid',
              borderColor: isToday(day) ? 'primary.main' : 'divider',
              bgcolor: isToday(day) ? 'primary.50' : 'transparent',
              borderRadius: i === 0 ? '8px 0 0 0' : i === 6 ? '0 8px 0 0' : 0,
              '&:hover': { bgcolor: 'action.hover' },
            }}
          >
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: '0.7rem' }}>{weekDays[i]}</Typography>
            <Typography variant="body2" fontWeight={isToday(day) ? 700 : 400} sx={{ color: isToday(day) ? 'primary.main' : 'text.primary' }}>
              {format(day, 'd')}
            </Typography>
          </Box>
        ))}

        {/* Rows: Morning / Afternoon / Evening */}
        {[{ bucket: 'FIRST_HALF', label: '🌅 Morning' }, { bucket: 'SECOND_HALF', label: '🌆 Afternoon' }].map(({ bucket, label }, rowIdx) => (
          <>
            <Box key={`label-${bucket}`} sx={{ p: 1, display: 'flex', alignItems: 'center', borderRight: '1px solid', borderColor: 'divider', borderBottom: rowIdx < 1 ? '1px solid' : 'none', borderBottomColor: 'divider' }}>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 700, fontSize: '0.7rem' }}>
                {label}
              </Typography>
            </Box>
            {days.map((day, i) => {
              const daySlotEntries = entriesForDay(day, bucket);
              return (
                <Box
                  key={`${bucket}-${i}`}
                  onClick={() => onDayClick(day)}
                  sx={{
                    p: 0.75, minHeight: 72, cursor: 'pointer',
                    border: '1px solid', borderColor: 'divider',
                    borderTop: 'none', borderLeft: 'none',
                    bgcolor: isToday(day) ? 'primary.50' : 'background.default',
                    '&:hover': { bgcolor: 'action.hover' },
                    display: 'flex', flexDirection: 'column', gap: 0.5,
                  }}
                >
                  {loading
                    ? <Skeleton variant="rounded" height={20} />
                    : daySlotEntries.slice(0, 3).map(e => (
                        <Box key={e.id} sx={{ px: 0.75, py: 0.25, borderRadius: 1, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider' }}>
                          <Typography variant="caption" sx={{ fontSize: '0.68rem', fontWeight: 500 }} noWrap>
                            {e.initiative?.title || e.customTitle || '–'}
                          </Typography>
                        </Box>
                      ))
                  }
                  {!loading && daySlotEntries.length > 3 && (
                    <Typography variant="caption" sx={{ fontSize: '0.65rem', color: 'text.disabled' }}>+{daySlotEntries.length - 3} more</Typography>
                  )}
                  {!loading && daySlotEntries.length === 0 && (
                    <Typography variant="caption" sx={{ color: 'text.disabled', fontSize: '0.65rem' }}>–</Typography>
                  )}
                </Box>
              );
            })}
          </>
        ))}
      </Box>
    </Box>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Planner() {
  const [tab, setTab] = useState(0);         // 0=daily, 1=weekly
  const [mode, setMode] = useState('halfday'); // 'halfday' | 'hourly'
  const [currentDate, setCurrentDate] = useState(new Date());

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const slots = mode === 'hourly' ? HOURLY_SLOTS : HALF_DAY_SLOTS;

  const goToday = () => setCurrentDate(new Date());
  const prevDay = () => setCurrentDate(d => subDays(d, 1));
  const nextDay = () => setCurrentDate(d => addDays(d, 1));
  const prevWeek = () => setCurrentDate(d => subDays(d, 7));
  const nextWeek = () => setCurrentDate(d => addDays(d, 7));

  return (
    <Box sx={{ maxWidth: 1200 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2.5, flexWrap: 'wrap' }}>
        <Box>
          <Typography variant="h5" fontWeight={700} sx={{ lineHeight: 1.2 }}>Planner</Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>Plan your day and week</Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, ml: { xs: 0, sm: 'auto' } }}>
          {/* Date nav */}
          {tab === 0 ? (
            <>
              <Tooltip title="Previous day"><IconButton size="small" onClick={prevDay}><ChevronLeft /></IconButton></Tooltip>
              <Button variant="text" onClick={goToday} startIcon={<Today sx={{ fontSize: 16 }} />}
                sx={{ textTransform: 'none', fontSize: '0.9rem', fontWeight: 600, px: 1.5, minWidth: 160, justifyContent: 'center' }}>
                {isToday(currentDate) ? 'Today' : format(currentDate, 'EEE, MMM d')}
              </Button>
              <Tooltip title="Next day"><IconButton size="small" onClick={nextDay}><ChevronRight /></IconButton></Tooltip>
            </>
          ) : (
            <>
              <Tooltip title="Previous week"><IconButton size="small" onClick={prevWeek}><ChevronLeft /></IconButton></Tooltip>
              <Button variant="text" onClick={goToday}
                sx={{ textTransform: 'none', fontSize: '0.85rem', fontWeight: 600, px: 1.5, minWidth: 180, justifyContent: 'center' }}>
                {format(weekStart, 'MMM d')} – {format(addDays(weekStart, 6), 'MMM d, yyyy')}
              </Button>
              <Tooltip title="Next week"><IconButton size="small" onClick={nextWeek}><ChevronRight /></IconButton></Tooltip>
            </>
          )}

          {/* Mode toggle (daily only) */}
          {tab === 0 && (
            <Box sx={{ display: 'flex', gap: 0.5, ml: 1, bgcolor: 'action.hover', borderRadius: 2, p: 0.5 }}>
              <Tooltip title="Half-day view">
                <IconButton size="small" onClick={() => setMode('halfday')} sx={{ borderRadius: 1.5, bgcolor: mode === 'halfday' ? 'background.paper' : 'transparent', boxShadow: mode === 'halfday' ? 1 : 0 }}>
                  <NightlightRound sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Hourly view">
                <IconButton size="small" onClick={() => setMode('hourly')} sx={{ borderRadius: 1.5, bgcolor: mode === 'hourly' ? 'background.paper' : 'transparent', boxShadow: mode === 'hourly' ? 1 : 0 }}>
                  <AccessTime sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            </Box>
          )}
        </Box>
      </Box>

      {/* Tabs */}
      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Tab label="Daily" sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.9rem' }} />
        <Tab label="Weekly" sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.9rem' }} />
      </Tabs>

      {tab === 0 && (
        <DailyView
          key={format(currentDate, 'yyyy-MM-dd')}
          date={currentDate}
          mode={mode}
          slots={slots}
        />
      )}
      {tab === 1 && (
        <WeeklyView
          weekStart={weekStart}
          onDayClick={(day) => { setCurrentDate(day); setTab(0); }}
        />
      )}
    </Box>
  );
}
