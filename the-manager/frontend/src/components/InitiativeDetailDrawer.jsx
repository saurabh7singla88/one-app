import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import {
  Drawer, Box, Typography, IconButton, Tabs, Tab, Chip, Divider,
  TextField, Button, LinearProgress, Select, MenuItem, FormControl,
  Avatar, Tooltip, CircularProgress, InputAdornment, Slider,
  List, ListItem, ListItemAvatar, ListItemText,
  Dialog, DialogTitle, DialogContent, DialogActions, InputLabel,
  Autocomplete, Menu, Checkbox, useTheme
} from '@mui/material';
import {
  Close, Add, Delete, Edit, Link as LinkIcon, Comment,
  History, Info, OpenInNew, Send, CheckCircle, Label,
  CalendarToday, Person, TrendingUp, PersonAdd,
  IosShare, EventNote, ArrowBack, AutoFixHigh, ContentCopy, Done,
  BugReport, Refresh, LinkOff, AccountTree, ExpandMore, ExpandLess, Chat, DeleteSweep, Visibility,
} from '@mui/icons-material';
import api from '../api/axios';
import { updateInitiative, updateStatus, updatePriority, fetchAllInitiatives } from '../features/initiatives/initiativesSlice';
import { format, formatDistanceToNow } from 'date-fns';
import InitiativeSummaryDialog from './InitiativeSummaryDialog';
import RephraseTool from './RephraseTool';
import RichEditor from './RichEditor';
import RichText, { stripMarkdown } from './RichText';
import TipTapEditor from './TipTapEditor';

const STATUS_CONFIG = {
  OPEN:        { label: 'Open',        color: '#475569', bg: '#f1f5f9',  darkBg: '#1e293b' },
  IN_PROGRESS: { label: 'In Progress', color: '#60a5fa', bg: '#dbeafe',  darkBg: '#1e3a5f' },
  BLOCKED:     { label: 'Blocked',     color: '#f87171', bg: '#fee2e2',  darkBg: '#3b1212' },
  ON_HOLD:     { label: 'On Hold',     color: '#fbbf24', bg: '#fef3c7',  darkBg: '#3b2a00' },
  COMPLETED:   { label: 'Completed',   color: '#34d399', bg: '#d1fae5',  darkBg: '#052e1c' },
  CANCELLED:   { label: 'Cancelled',   color: '#94a3b8', bg: '#f3f4f6',  darkBg: '#1e293b' },
};

const PRIORITY_CONFIG = {
  CRITICAL: { color: '#f87171', bg: '#fef2f2', darkBg: '#3b0a0a' },
  HIGH:     { color: '#fbbf24', bg: '#fffbeb', darkBg: '#3b2000' },
  MEDIUM:   { color: '#818cf8', bg: '#eff6ff', darkBg: '#1e1b4b' },
  LOW:      { color: '#94a3b8', bg: '#f1f2f9', darkBg: '#1e293b' },
};

const ACTION_LABELS = {
  created:          'Created this initiative',
  updated:          'Updated details',
  status_changed:   'Changed status',
  priority_changed: 'Changed priority',
  link_added:       'Added a link',
  comment_added:    'Left a comment',
};

const AI_ACTIONS = [
  { value: 'summarize',           label: 'Summarize',                    emoji: '\u2728' },
  { value: 'implementation_plan', label: 'Create Implementation Plan',   emoji: '\uD83D\uDCCB' },
  { value: 'risk_assessment',     label: 'Risk Assessment',              emoji: '\u26A0\uFE0F' },
  { value: 'acceptance_criteria', label: 'Generate Acceptance Criteria', emoji: '\u2705' },
  { value: 'status_report',       label: 'Draft Status Report',          emoji: '\uD83D\uDCCA' },
];

function TabPanel({ value, idx, children }) {
  return value === idx ? <Box sx={{ flex: 1, overflowY: 'auto' }}>{children}</Box> : null;
}

export default function InitiativeDetailDrawer({ initiativeId, open, onClose, pageMode = false }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { allItems, items } = useSelector(s => s.initiatives);
  const { user } = useSelector(s => s.auth);
  const { canvases } = useSelector(s => s.canvas);

  const allKnownItems = [...allItems, ...items];
  const initiative = allKnownItems.find(i => i.id === initiativeId) || null;

  const [tab, setTab] = useState(0);
  const [fullData, setFullData] = useState(null);
  const [loading, setLoading] = useState(false);

  // Links state
  const [links, setLinks] = useState([]);
  const [linkForm, setLinkForm] = useState({ url: '', title: '', description: '', category: '' });
  const [showLinkForm, setShowLinkForm] = useState(false);
  const [addingLink, setAddingLink] = useState(false);

  // Comments state
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [commentEditorKey, setCommentEditorKey] = useState(0);
  const [sendingComment, setSendingComment] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [viewComment, setViewComment] = useState(null);

  // Activity state
  const [activity, setActivity] = useState([]);

  // Meeting notes state
  const [meetingNotes, setMeetingNotes] = useState([]);
  const [meetingSummaryOpen, setMeetingSummaryOpen] = useState(false);
  const [meetingSummaryText, setMeetingSummaryText] = useState('');
  const [meetingSummaryTitle, setMeetingSummaryTitle] = useState('');
  const [meetingSummaryLoading, setMeetingSummaryLoading] = useState(false);
  const [meetingSummaryError, setMeetingSummaryError] = useState(null);
  const [meetingSummaryCopied, setMeetingSummaryCopied] = useState(false);
  const [summarizingNoteId, setSummarizingNoteId] = useState(null);
  // manual add meeting note
  const [addNoteOpen, setAddNoteOpen] = useState(false);
  const [addNoteSubject, setAddNoteSubject] = useState('');
  const [addNoteDate, setAddNoteDate] = useState('');
  const [addNoteBody, setAddNoteBody] = useState('');
  const [addNoteSaving, setAddNoteSaving] = useState(false);
  const [addNoteError, setAddNoteError] = useState(null);
  // edit meeting note
  const [editNote, setEditNote] = useState(null); // the note being edited
  const [editNoteSubject, setEditNoteSubject] = useState('');
  const [editNoteDate, setEditNoteDate] = useState('');
  const [editNoteBody, setEditNoteBody] = useState('');
  const [editNoteSaving, setEditNoteSaving] = useState(false);
  const [editNoteError, setEditNoteError] = useState(null);
  const [viewNote, setViewNote] = useState(null);

  // Inline edit state
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [users, setUsers] = useState([]);

  const allTags = useMemo(
    () => [...new Set([...(allItems || []), ...(items || [])].flatMap(i => i.tags || []))].sort(),
    [allItems, items]
  );

  // Integration items (JIRA tickets + Confluence pages)
  const [integrationItems, setIntegrationItems] = useState([]);
  const [intAddType, setIntAddType]     = useState('JIRA'); // 'JIRA' | 'CONFLUENCE'
  const [intInput, setIntInput]         = useState('');
  const [intAdding, setIntAdding]       = useState(false);
  const [intError, setIntError]         = useState('');
  const [showIntForm, setShowIntForm]   = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);
  const [childrenMap, setChildrenMap]     = useState({});   // itemId → child-ticket array
  const [fetchingChildrenId, setFetchingChildrenId] = useState(null);
  const [expandedChildren, setExpandedChildren]     = useState({});  // itemId → bool
  const [itemAiMap, setItemAiMap]               = useState({});  // itemId → {open,action,actionLabel,text,loading,error}
  const [selectedItemIds, setSelectedItemIds]   = useState(new Set());
  const [consolidatedAi, setConsolidatedAi]     = useState({ open: false, action: 'summarize', text: '', loading: false, error: '' });
  const [aiMenuAnchor, setAiMenuAnchor]         = useState(null); // { el, itemId } | null
  const [chatOpen, setChatOpen]                 = useState(false);
  const [chatMessages, setChatMessages]         = useState([]); // [{role:'user'|'assistant', content, ts}]
  const [chatInput, setChatInput]               = useState('');
  const [chatSending, setChatSending]           = useState(false);
  const [chatError, setChatError]               = useState('');
  const chatBottomRef                           = useRef(null);

  // Summary
  const [summaryOpen, setSummaryOpen] = useState(false);

  // Scroll chat to bottom when messages update
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatSending]);

  // Quick user create
  const [quickUserOpen, setQuickUserOpen] = useState(false);
  const [quickUserName, setQuickUserName] = useState('');
  const [quickUserRole, setQuickUserRole] = useState('VIEWER');
  const [quickUserSaving, setQuickUserSaving] = useState(false);

  const fetchAll = useCallback(async (id) => {
    setLoading(true);
    try {
      const [fullRes, linksRes, commentsRes, activityRes, meetingNotesRes, intRes] = await Promise.all([
        api.get(`/initiatives/${id}`),
        api.get(`/initiatives/${id}/links`),
        api.get(`/initiatives/${id}/comments`),
        api.get(`/initiatives/${id}/activity`),
        api.get('/meeting-notes', { params: { initiativeId: id } }),
        api.get(`/integrations/initiatives/${id}`),
      ]);
      setFullData(fullRes.data);
      setLinks(linksRes.data);
      setComments(commentsRes.data);
      setActivity(activityRes.data);
      setMeetingNotes(meetingNotesRes.data);
      setIntegrationItems(intRes.data);
    } catch (e) {
      console.error('Failed to load initiative details', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open && initiativeId) {
      setTab(0);
      fetchAll(initiativeId);
      api.get('/users').then(r => setUsers(r.data)).catch(() => {});
    }
  }, [open, initiativeId, fetchAll]);

  const handleQuickCreateUser = async (onCreated) => {
    if (!quickUserName.trim()) return;
    setQuickUserSaving(true);
    try {
      const r = await api.post('/users', { name: quickUserName.trim(), role: quickUserRole });
      setUsers(prev => [...prev, r.data].sort((a, b) => a.name.localeCompare(b.name)));
      onCreated(r.data);
      setQuickUserOpen(false);
      setQuickUserName('');
      setQuickUserRole('VIEWER');
    } catch (err) {
      console.error('Failed to create user', err);
    } finally {
      setQuickUserSaving(false);
    }
  };

  const detail = fullData || initiative;

  // ── Overview edits ────────────────────────────────────────────
  const saveField = async (field, value) => {
    await dispatch(updateInitiative({ id: initiativeId, data: { [field]: value } }));
    dispatch(fetchAllInitiatives());
    setFullData(prev => prev ? { ...prev, [field]: value } : prev);
  };

  const handleStatusChange = async (status) => {
    await dispatch(updateStatus({ id: initiativeId, status }));
    setFullData(prev => prev ? { ...prev, status } : prev);
  };

  const handlePriorityChange = async (priority) => {
    await dispatch(updatePriority({ id: initiativeId, priority }));
    setFullData(prev => prev ? { ...prev, priority } : prev);
  };

  const addTag = (tag) => {
    const trimmed = tag.trim();
    if (!trimmed || (detail?.tags || []).includes(trimmed)) return;
    const newTags = [...(detail?.tags || []), trimmed];
    saveField('tags', newTags);
    setTagInput('');
  };

  const removeTag = (tag) => {
    saveField('tags', (detail?.tags || []).filter(t => t !== tag));
  };

  // ── Links ──────────────────────────────────────────────────────
  const handleAddLink = async () => {
    if (!linkForm.url.trim()) return;
    setAddingLink(true);
    try {
      const res = await api.post(`/initiatives/${initiativeId}/links`, linkForm);
      setLinks(prev => [res.data, ...prev]);
      setLinkForm({ url: '', title: '', description: '', category: '' });
      setShowLinkForm(false);
    } catch (e) {
      console.error(e);
    } finally {
      setAddingLink(false);
    }
  };

  const handleDeleteLink = async (linkId) => {
    await api.delete(`/initiatives/links/${linkId}`);
    setLinks(prev => prev.filter(l => l.id !== linkId));
  };

  // ── Comments ───────────────────────────────────────────────────
  const handleSendComment = async () => {
    const isEmpty = !commentText.trim() || commentText === '<p></p>';
    if (isEmpty) return;
    setSendingComment(true);
    try {
      const res = await api.post(`/initiatives/${initiativeId}/comments`, { content: commentText });
      setComments(prev => [...prev, res.data]);
      setCommentText('');
      setCommentEditorKey(k => k + 1);
    } catch (e) {
      console.error(e);
    } finally {
      setSendingComment(false);
    }
  };

  const handleEditComment = async (commentId) => {
    if (!editingCommentText.trim()) return;
    const res = await api.put(`/initiatives/comments/${commentId}`, { content: editingCommentText });
    setComments(prev => prev.map(c => c.id === commentId ? res.data : c));
    setEditingCommentId(null);
  };

  const handleDeleteComment = async (commentId) => {
    await api.delete(`/initiatives/comments/${commentId}`);
    setComments(prev => prev.filter(c => c.id !== commentId));
  };

  // ── Meeting note save handlers ─────────────────────────────────────────────
  const handleSaveEditNote = async () => {
    if (!editNoteSubject.trim() || editNoteSaving || !editNote) return;
    setEditNoteSaving(true);
    setEditNoteError(null);
    try {
      const res = await api.patch(`/meeting-notes/${editNote.id}`, {
        subject: editNoteSubject.trim(),
        date:    editNoteDate || null,
        body:    editNoteBody.trim(),
      });
      setMeetingNotes(prev => prev.map(n => n.id === editNote.id ? res.data : n));
      setEditNote(null);
    } catch (e) {
      setEditNoteError(e.response?.data?.error || 'Failed to save');
    } finally {
      setEditNoteSaving(false);
    }
  };

  const handleSaveAddNote = async () => {
    if (!addNoteSubject.trim() || addNoteSaving) return;
    setAddNoteSaving(true);
    setAddNoteError(null);
    try {
      const res = await api.post('/meeting-notes', {
        subject:      addNoteSubject.trim(),
        date:         addNoteDate || null,
        body:         addNoteBody.trim(),
        initiativeId: initiativeId,
      });
      setMeetingNotes(prev => [res.data, ...prev]);
      setAddNoteOpen(false);
    } catch (e) {
      setAddNoteError(e.response?.data?.error || 'Failed to save note');
    } finally {
      setAddNoteSaving(false);
    }
  };

  // ── Integrations (JIRA + Confluence) ──────────────────────────────────────────────
  const handleAddIntegration = async () => {
    if (!intInput.trim()) return;
    setIntAdding(true);
    setIntError('');
    try {
      const res = await api.post(`/integrations/initiatives/${initiativeId}`, {
        type: intAddType,
        input: intInput.trim(),
      });
      setIntegrationItems(prev => [...prev, res.data]);
      setIntInput('');
      setShowIntForm(false);
    } catch (e) {
      setIntError(e.response?.data?.error || 'Failed to add.');
    } finally {
      setIntAdding(false);
    }
  };

  const handleRefreshIntegration = async (itemId) => {
    setRefreshingId(itemId);
    try {
      const res = await api.post(`/integrations/${itemId}/refresh`);
      setIntegrationItems(prev => prev.map(i => i.id === itemId ? res.data : i));
    } catch (e) {
      console.error('Failed to refresh', e);
    } finally {
      setRefreshingId(null);
    }
  };

  const handleRemoveIntegration = async (itemId) => {
    await api.delete(`/integrations/${itemId}`);
    setIntegrationItems(prev => prev.filter(i => i.id !== itemId));
    setChildrenMap(prev => { const n = {...prev}; delete n[itemId]; return n; });
    setItemAiMap(prev => { const n = {...prev}; delete n[itemId]; return n; });
    setSelectedItemIds(prev => { const n = new Set(prev); n.delete(itemId); return n; });
  };

  const handleFetchChildren = async (item) => {
    setFetchingChildrenId(item.id);
    try {
      const endpoint = item.type === 'JIRA'
        ? `/integrations/${item.id}/children`
        : `/integrations/${item.id}/confluence-children`;
      const res = await api.get(endpoint);
      setChildrenMap(prev => ({ ...prev, [item.id]: res.data }));
      setExpandedChildren(prev => ({ ...prev, [item.id]: true }));
    } catch (e) {
      console.error('Failed to fetch children', e);
    } finally {
      setFetchingChildrenId(null);
    }
  };

  const toggleExpandChildren = (itemId) =>
    setExpandedChildren(prev => ({ ...prev, [itemId]: !prev[itemId] }));

  const handleRunAiAction = async (item, action) => {
    const itemId = item.id;
    const actionMeta = AI_ACTIONS.find(a => a.value === action) || AI_ACTIONS[0];
    let data = {};
    try { data = JSON.parse(item.cachedData || '{}'); } catch {}
    setItemAiMap(prev => ({ ...prev, [itemId]: { open: true, action, actionLabel: actionMeta.label, text: '', loading: true, error: '' } }));
    try {
      let children = childrenMap[itemId] || [];
      if (children.length === 0) {
        const endpoint = item.type === 'JIRA'
          ? `/integrations/${itemId}/children`
          : `/integrations/${itemId}/confluence-children`;
        try {
          const r = await api.get(endpoint);
          children = r.data;
          if (children.length > 0) {
            setChildrenMap(prev => ({ ...prev, [itemId]: children }));
            setExpandedChildren(prev => ({ ...prev, [itemId]: true }));
          }
        } catch { /* proceed without children */ }
      }
      const res = await api.post('/ai/summarize-item', {
        initiativeTitle: detail?.title || '',
        action,
        item: {
          type:        item.type,
          key:         item.key,
          title:       item.type === 'JIRA' ? (data.summary || item.title || '') : (data.title || item.title || ''),
          description: item.type === 'JIRA' ? (data.description || '') : (data.excerpt || ''),
          status:      data.status || '',
          priority:    data.priority || '',
          assignee:    data.assignee || null,
          space:       data.space || '',
          url:         item.url,
        },
        children,
      });
      if (res.data?.summary) {
        setItemAiMap(prev => ({ ...prev, [itemId]: { open: true, action, actionLabel: actionMeta.label, text: res.data.summary, loading: false, error: '' } }));
      } else {
        setItemAiMap(prev => ({ ...prev, [itemId]: { open: true, action, actionLabel: actionMeta.label, text: '', loading: false, error: 'AI did not return a result.' } }));
      }
    } catch (e) {
      setItemAiMap(prev => ({ ...prev, [itemId]: { open: true, action, actionLabel: actionMeta.label, text: '', loading: false, error: e?.response?.data?.error || 'Failed to run AI action.' } }));
    }
  };

  const handleConsolidatedAiAction = async () => {
    const action = consolidatedAi.action;
    const selectedItems = integrationItems.filter(i => selectedItemIds.has(i.id));
    if (!selectedItems.length) return;
    setConsolidatedAi(prev => ({ ...prev, open: true, text: '', loading: true, error: '' }));
    try {
      const itemsWithChildren = await Promise.all(selectedItems.map(async (item) => {
        let data = {};
        try { data = JSON.parse(item.cachedData || '{}'); } catch {}
        let children = childrenMap[item.id] || [];
        if (children.length === 0) {
          const endpoint = item.type === 'JIRA'
            ? `/integrations/${item.id}/children`
            : `/integrations/${item.id}/confluence-children`;
          try {
            const r = await api.get(endpoint);
            children = r.data;
            if (children.length > 0) setChildrenMap(prev => ({ ...prev, [item.id]: children }));
          } catch { /* continue */ }
        }
        return {
          type:        item.type,
          key:         item.key,
          title:       item.type === 'JIRA' ? (data.summary || item.title || '') : (data.title || item.title || ''),
          description: item.type === 'JIRA' ? (data.description || '') : (data.excerpt || ''),
          status:      data.status || '',
          priority:    data.priority || '',
          assignee:    data.assignee || null,
          space:       data.space || '',
          url:         item.url,
          children,
        };
      }));
      const res = await api.post('/ai/action-on-items', {
        initiativeTitle: detail?.title || '',
        action,
        items: itemsWithChildren,
      });
      if (res.data?.summary) {
        setConsolidatedAi(prev => ({ ...prev, text: res.data.summary, loading: false, error: '' }));
      } else {
        setConsolidatedAi(prev => ({ ...prev, text: '', loading: false, error: 'AI did not return a result.' }));
      }
    } catch (e) {
      setConsolidatedAi(prev => ({ ...prev, text: '', loading: false, error: e?.response?.data?.error || 'Failed to run AI action.' }));
    }
  };

  const handleSendChatMessage = async () => {
    const msg = chatInput.trim();
    if (!msg || chatSending) return;
    setChatInput('');
    setChatError('');
    setChatMessages(prev => [...prev, { role: 'user', content: msg, ts: Date.now() }]);
    setChatSending(true);
    try {
      const targetItems = selectedItemIds.size > 0
        ? integrationItems.filter(i => selectedItemIds.has(i.id))
        : integrationItems;
      const itemsPayload = targetItems.map(item => {
        let data = {};
        try { data = JSON.parse(item.cachedData || '{}'); } catch {}
        return {
          type:        item.type,
          key:         item.key,
          title:       item.type === 'JIRA' ? (data.summary || item.title || '') : (data.title || item.title || ''),
          description: item.type === 'JIRA' ? (data.description || '') : (data.excerpt || ''),
          status:      data.status || '',
          priority:    data.priority || '',
          assignee:    data.assignee || null,
          space:       data.space || '',
          url:         item.url,
          children:    childrenMap[item.id] || [],
        };
      });
      // snapshot current history before this send (excludes the just-added user msg)
      const historyForApi = chatMessages.map(m => ({ role: m.role, content: m.content }));
      const res = await api.post('/ai/chat-with-items', {
        initiativeTitle: detail?.title || '',
        items: itemsPayload,
        history: historyForApi,
        userMessage: msg,
      });
      if (res.data?.response) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: res.data.response, ts: Date.now() }]);
      } else {
        setChatError('AI did not respond.');
      }
    } catch (e) {
      setChatError(e?.response?.data?.error || 'Failed to send message.');
    } finally {
      setChatSending(false);
    }
  };

  const handleClose = () => { if (pageMode) navigate(-1); else if (onClose) onClose(); };

  // ── Render a single JIRA/Confluence integration item card ─────────────────
  const renderIntItem = (item) => {
    let data = null;
    try { data = JSON.parse(item.cachedData || '{}'); } catch {}
    const isJira = item.type === 'JIRA';
    const statusColor = (() => {
      const cat = (data?.statusCategory || '').toLowerCase();
      if (cat === 'done') return { color: isDark ? '#6ee7b7' : '#065f46', bg: isDark ? '#052e1c' : '#d1fae5' };
      if (cat === 'in progress') return { color: isDark ? '#93c5fd' : '#1d4ed8', bg: isDark ? '#1e3a5f' : '#dbeafe' };
      return { color: isDark ? '#94a3b8' : '#475569', bg: isDark ? '#1e293b' : '#f1f5f9' };
    })();
    const isSelected = selectedItemIds.has(item.id);
    return (
      <Box key={item.id} sx={{
        p: 1.5, borderRadius: 2,
        border: `1.5px solid ${isSelected ? '#a78bfa' : isJira ? (isDark ? '#1e3a5f' : '#dbeafe') : (isDark ? '#0c4a6e' : '#e0f2fe')}`,
        bgcolor: isSelected ? (isDark ? 'rgba(139,92,246,0.12)' : '#fdf4ff') : isJira ? (isDark ? 'rgba(99,102,241,0.06)' : '#fafbff') : (isDark ? 'rgba(14,116,144,0.08)' : '#f0f9ff'),
        '&:hover': { borderColor: isSelected ? '#8b5cf6' : (isDark ? 'rgba(0,82,204,0.5)' : '#0052cc55'), boxShadow: isDark ? 'none' : '0 1px 6px rgba(0,82,204,0.07)' },
        transition: 'all 0.15s',
      }}>
        {/* Header row */}
        <Box display="flex" alignItems="center" gap={0.75} mb={0.4}>
          <Checkbox
            size="small"
            checked={isSelected}
            onChange={() => setSelectedItemIds(prev => {
              const n = new Set(prev);
              if (n.has(item.id)) n.delete(item.id); else n.add(item.id);
              return n;
            })}
            sx={{ p: 0.25, mr: -0.5, color: '#c4b5fd', '&.Mui-checked': { color: '#7c3aed' } }}
          />
          <Chip
            label={isJira ? 'JIRA' : 'Confluence'}
            size="small"
            sx={{ height: 16, fontSize: '0.58rem', fontWeight: 700, border: 0, bgcolor: isJira ? '#0052cc' : '#0077b6', color: '#fff' }}
          />
          <Typography
            variant="caption" component="a" href={item.url} target="_blank" rel="noopener noreferrer" fontWeight={700}
            sx={{ color: '#0052cc', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
          >
            {isJira ? item.key : (data?.spaceKey ? `${data.spaceKey} › ${item.key}` : item.key)}
          </Typography>
          <OpenInNew sx={{ fontSize: 10, color: '#0052cc' }} />
          {isJira && data?.issueType && (
            <Chip label={data.issueType} size="small"
              sx={{ height: 15, fontSize: '0.58rem', bgcolor: isDark ? '#1e3a5f' : '#eff6ff', color: isDark ? '#93c5fd' : '#1d4ed8', border: 0 }} />
          )}
          {isJira && data?.status && (
            <Chip label={data.status} size="small"
              sx={{ height: 15, fontSize: '0.58rem', bgcolor: statusColor.bg, color: statusColor.color, border: 0, ml: 'auto' }} />
          )}
          {!isJira && data?.space && (
            <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto', fontSize: '0.62rem' }}>{data.space}</Typography>
          )}
          <Box display="flex" gap={0.25} sx={{ ml: isJira && data?.status ? 0 : 'auto' }}>
            <Tooltip title={isJira ? (childrenMap[item.id] ? 'Reload child tickets' : 'Fetch child tickets') : (childrenMap[item.id] ? 'Reload child pages' : 'Fetch child pages')}>
              <IconButton size="small" sx={{ p: 0.25, color: fetchingChildrenId === item.id ? '#7c3aed' : 'text.secondary' }}
                onClick={() => handleFetchChildren(item)} disabled={fetchingChildrenId === item.id}>
                {fetchingChildrenId === item.id ? <CircularProgress size={11} sx={{ color: '#7c3aed' }} /> : <AccountTree sx={{ fontSize: 13 }} />}
              </IconButton>
            </Tooltip>
            <Tooltip title="AI actions">
              <IconButton size="small"
                sx={{ p: 0.25, color: '#7c3aed', opacity: itemAiMap[item.id]?.loading ? 1 : 0.45, '&:hover': { opacity: 1 } }}
                onClick={(e) => setAiMenuAnchor({ el: e.currentTarget, itemId: item.id })}
                disabled={itemAiMap[item.id]?.loading}>
                {itemAiMap[item.id]?.loading ? <CircularProgress size={11} sx={{ color: '#7c3aed' }} /> : <AutoFixHigh sx={{ fontSize: 13 }} />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Refresh">
              <IconButton size="small" sx={{ p: 0.25, color: 'text.secondary' }}
                onClick={() => handleRefreshIntegration(item.id)} disabled={refreshingId === item.id}>
                {refreshingId === item.id ? <CircularProgress size={11} /> : <Refresh sx={{ fontSize: 13 }} />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Remove">
              <IconButton size="small" sx={{ p: 0.25, color: 'text.secondary', '&:hover': { color: 'error.main' } }}
                onClick={() => handleRemoveIntegration(item.id)}>
                <LinkOff sx={{ fontSize: 13 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* Title */}
        <Typography variant="body2" fontWeight={600} mb={0.4} sx={{ color: 'text.primary', lineHeight: 1.3 }}>
          {isJira ? data?.summary : data?.title}
        </Typography>

        {/* Description / Excerpt */}
        {(isJira ? data?.description : data?.excerpt) && (
          <Typography variant="caption" color="text.secondary"
            sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>
            {isJira ? data.description : data.excerpt}
          </Typography>
        )}

        {/* Meta row */}
        <Box display="flex" flexWrap="wrap" gap={1} mt={0.5}>
          {isJira && data?.priority && <Typography variant="caption" color="text.disabled">Priority: <b>{data.priority}</b></Typography>}
          {isJira && data?.assignee && <Typography variant="caption" color="text.disabled">Assignee: <b>{data.assignee}</b></Typography>}
          {!isJira && data?.version && <Typography variant="caption" color="text.disabled">v{data.version}</Typography>}
          {(isJira ? data?.updated : data?.lastUpdated) && (
            <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
              Updated {format(new Date(isJira ? data.updated : data.lastUpdated), 'MMM d, yyyy')}
            </Typography>
          )}
        </Box>

        {/* JIRA Labels */}
        {isJira && data?.labels?.length > 0 && (
          <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.5}>
            {data.labels.map(lbl => (
              <Chip key={lbl} label={lbl} size="small"
                sx={{ height: 15, fontSize: '0.58rem', bgcolor: isDark ? '#1e293b' : '#f1f5f9', color: 'text.secondary', border: 0 }} />
            ))}
          </Box>
        )}

        {/* Confluence breadcrumb */}
        {!isJira && data?.ancestors?.length > 0 && (
          <Typography variant="caption" color="text.disabled" display="block" mt={0.4} sx={{ fontSize: '0.62rem' }}>
            {data.ancestors.join(' › ')}
          </Typography>
        )}

        {/* Children */}
        {childrenMap[item.id] !== undefined && (
          <Box mt={0.75}>
            <Box display="flex" alignItems="center" gap={0.5} sx={{ cursor: 'pointer', userSelect: 'none' }}
              onClick={() => toggleExpandChildren(item.id)}>
              {expandedChildren[item.id] ? <ExpandLess sx={{ fontSize: 13, color: 'text.secondary' }} /> : <ExpandMore sx={{ fontSize: 13, color: 'text.secondary' }} />}
              <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                {childrenMap[item.id].length === 0
                  ? (isJira ? 'No child tickets' : 'No child pages')
                  : `${childrenMap[item.id].length} child ${isJira ? `ticket${childrenMap[item.id].length > 1 ? 's' : ''}` : `page${childrenMap[item.id].length > 1 ? 's' : ''}`}`}
              </Typography>
            </Box>
            {expandedChildren[item.id] && childrenMap[item.id].length > 0 && (
              <Box mt={0.5} pl={0.5} sx={{ borderLeft: `2px solid ${isJira ? (isDark ? '#1e3a5f' : '#dbeafe') : (isDark ? '#0c4a6e' : '#bae6fd')}` }}
                display="flex" flexDirection="column" gap={0.5}>
                {isJira ? childrenMap[item.id].map(child => {
                  const childCat = (child.statusCategory || '').toLowerCase();
                  const childStatusColor = childCat === 'done' ? (isDark ? { color: '#6ee7b7', bg: '#064e3b' } : { color: '#065f46', bg: '#d1fae5' })
                    : childCat === 'in progress' ? { color: isDark ? '#93c5fd' : '#1d4ed8', bg: isDark ? '#1e3a5f' : '#dbeafe' } : { color: isDark ? '#94a3b8' : '#475569', bg: isDark ? '#1e293b' : '#f1f5f9' };
                  return (
                    <Box key={child.key} sx={{ pl: 1 }}>
                      <Box display="flex" alignItems="center" gap={0.5} flexWrap="wrap">
                        <Typography variant="caption" component="a" href={child.url}
                          target="_blank" rel="noopener noreferrer" fontWeight={700}
                          sx={{ color: '#0052cc', textDecoration: 'none', fontSize: '0.7rem', '&:hover': { textDecoration: 'underline' } }}>
                          {child.key}
                        </Typography>
                        {child.issueType && <Chip label={child.issueType} size="small" sx={{ height: 13, fontSize: '0.56rem', bgcolor: isDark ? '#1e3a5f' : '#eff6ff', color: isDark ? '#93c5fd' : '#1d4ed8', border: 0 }} />}
                        <Chip label={child.status || '?'} size="small"
                          sx={{ height: 13, fontSize: '0.56rem', bgcolor: childStatusColor.bg, color: childStatusColor.color, border: 0 }} />
                        {child.assignee && <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem' }}>{child.assignee}</Typography>}
                      </Box>
                      {child.summary && (
                        <Typography variant="caption" color="text.primary"
                          sx={{ fontSize: '0.7rem', display: 'block', lineHeight: 1.35, mt: 0.1 }}>
                          {child.summary}
                        </Typography>
                      )}
                    </Box>
                  );
                }) : childrenMap[item.id].map(page => (
                  <Box key={page.id} sx={{ pl: 1 }}>
                    <Box display="flex" alignItems="center" gap={0.5} flexWrap="wrap">
                      <Typography variant="caption" component="a" href={page.url}
                        target="_blank" rel="noopener noreferrer" fontWeight={700}
                        sx={{ color: '#0077b6', textDecoration: 'none', fontSize: '0.7rem', '&:hover': { textDecoration: 'underline' } }}>
                        {page.title}
                      </Typography>
                      {page.spaceKey && <Chip label={page.spaceKey} size="small" sx={{ height: 13, fontSize: '0.56rem', bgcolor: isDark ? '#0c4a6e' : '#e0f2fe', color: isDark ? '#7dd3fc' : '#0077b6', border: 0 }} />}
                    </Box>
                    {page.excerpt && (
                      <Typography variant="caption" color="text.secondary"
                        sx={{ fontSize: '0.68rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.35, mt: 0.1 }}>
                        {page.excerpt}
                      </Typography>
                    )}
                  </Box>
                ))}
              </Box>
            )}
          </Box>
        )}

        {/* Per-item AI result */}
        {itemAiMap[item.id]?.open && (
          <Box mt={1} sx={{ p: 1.25, borderRadius: 1.5, border: '1.5px solid', borderColor: isDark ? 'rgba(139,92,246,0.4)' : '#ddd6fe', bgcolor: isDark ? 'rgba(139,92,246,0.08)' : '#faf5ff' }}>
            <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
              <Typography variant="caption" fontWeight={700} color="#7c3aed" sx={{ fontSize: '0.7rem' }}>
                {AI_ACTIONS.find(a => a.value === itemAiMap[item.id]?.action)?.emoji || '✨'}{' '}
                {itemAiMap[item.id]?.actionLabel || 'AI Result'}
              </Typography>
              <IconButton size="small" sx={{ p: 0.2 }}
                onClick={() => setItemAiMap(prev => ({ ...prev, [item.id]: { ...prev[item.id], open: false } }))}>
                <Close sx={{ fontSize: 12 }} />
              </IconButton>
            </Box>
            {itemAiMap[item.id]?.loading && (
              <Box display="flex" alignItems="center" gap={0.75}>
                <CircularProgress size={12} sx={{ color: '#7c3aed' }} />
                <Typography variant="caption" color="text.secondary">Running…</Typography>
              </Box>
            )}
            {itemAiMap[item.id]?.error && <Typography variant="caption" color="error.main">{itemAiMap[item.id].error}</Typography>}
            {itemAiMap[item.id]?.text && (
              <Typography variant="caption" color="text.primary"
                sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, display: 'block', fontSize: '0.75rem' }}>
                {itemAiMap[item.id].text}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    );
  };

  const innerContent = loading || !detail ? (
        <Box display="flex" alignItems="center" justifyContent="center" flex={1}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* Header */}
          <Box sx={{ px: 3, pt: 2.5, pb: 0, borderBottom: '1px solid', borderBottomColor: 'divider' }}>
            <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
              <Box sx={{ flex: 1, pr: 1 }}>
                {editingTitle ? (
                  <TextField
                    autoFocus
                    fullWidth
                    size="small"
                    value={titleDraft}
                    onChange={e => setTitleDraft(e.target.value)}
                    onBlur={() => { saveField('title', titleDraft); setEditingTitle(false); }}
                    onKeyDown={e => { if (e.key === 'Enter') { saveField('title', titleDraft); setEditingTitle(false); } if (e.key === 'Escape') setEditingTitle(false); }}
                    sx={{ '& input': { fontWeight: 700, fontSize: '1.1rem' } }}
                  />
                ) : (
                  <Typography
                    variant="h6"
                    fontWeight={700}
                    sx={{ cursor: 'pointer', lineHeight: 1.3, '&:hover': { color: 'primary.main' } }}
                    onClick={() => { setTitleDraft(detail.title); setEditingTitle(true); }}
                  >
                    {detail.title}
                  </Typography>
                )}
                <Box display="flex" gap={0.75} mt={0.75} flexWrap="wrap" alignItems="center">
                  <Chip
                    label={detail.type}
                    size="small"
                    sx={{ height: 18, fontSize: '0.65rem', bgcolor: isDark ? '#1e293b' : '#f1f5f9', color: 'text.secondary', border: 0 }}
                  />
                  {detail.parent && (
                    <Chip
                      label={`↑ ${detail.parent.title}`}
                      size="small"
                      sx={{ height: 18, fontSize: '0.65rem', bgcolor: isDark ? '#1e293b' : '#f1f5f9', color: 'text.secondary', border: 0 }}
                    />
                  )}
                </Box>
              </Box>
              <Box display="flex" alignItems="center" gap={0.5}>
                {!pageMode && (
                  <Tooltip title="Open full page">
                    <IconButton size="small" onClick={() => navigate(`/initiatives/${initiativeId}`)} sx={{ color: 'text.secondary' }}>
                      <OpenInNew fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title="Share summary">
                  <IconButton size="small" onClick={() => setSummaryOpen(true)} sx={{ color: 'text.secondary' }}>
                    <IosShare fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={pageMode ? 'Go back' : 'Close'}>
                  <IconButton size="small" onClick={handleClose} sx={{ mt: -0.25, mr: -0.5 }}>
                    {pageMode ? <ArrowBack fontSize="small" /> : <Close fontSize="small" />}
                  </IconButton>
                </Tooltip>
              </Box>
            </Box>

            {/* Quick status + priority pills */}
            <Box display="flex" gap={1} pb={1.5} flexWrap="wrap">
              <FormControl size="small">
                <Select
                  value={detail.status}
                  onChange={e => handleStatusChange(e.target.value)}
                  sx={{
                    height: 26, fontSize: '0.72rem',
                    bgcolor: isDark ? STATUS_CONFIG[detail.status]?.darkBg : STATUS_CONFIG[detail.status]?.bg,
                    color: STATUS_CONFIG[detail.status]?.color,
                    fontWeight: 600,
                    '.MuiOutlinedInput-notchedOutline': { border: 'none' },
                  }}
                >
                  {Object.entries(STATUS_CONFIG).map(([v, c]) => (
                    <MenuItem key={v} value={v} sx={{ fontSize: '0.78rem' }}>{c.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small">
                <Select
                  value={detail.priority}
                  onChange={e => handlePriorityChange(e.target.value)}
                  sx={{
                    height: 26, fontSize: '0.72rem',
                    bgcolor: isDark ? PRIORITY_CONFIG[detail.priority]?.darkBg : PRIORITY_CONFIG[detail.priority]?.bg,
                    color: PRIORITY_CONFIG[detail.priority]?.color,
                    fontWeight: 600,
                    '.MuiOutlinedInput-notchedOutline': { border: 'none' },
                  }}
                >
                  {Object.entries(PRIORITY_CONFIG).map(([v, c]) => (
                    <MenuItem key={v} value={v} sx={{ fontSize: '0.78rem', color: c.color, fontWeight: 600 }}>
                      {v.charAt(0) + v.slice(1).toLowerCase()}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ minHeight: 36, mb: -0.5 }}>
              <Tab icon={<Info sx={{ fontSize: 15 }} />} iconPosition="start" label="Overview" sx={{ minHeight: 36, py: 0.5, fontSize: '0.78rem' }} />
              <Tab icon={<LinkIcon sx={{ fontSize: 15 }} />} iconPosition="start" label={`Links${(links.length + integrationItems.length) ? ` (${links.length + integrationItems.length})` : ''}`} sx={{ minHeight: 36, py: 0.5, fontSize: '0.78rem' }} />
              <Tab icon={<Comment sx={{ fontSize: 15 }} />} iconPosition="start" label={`Notes${comments.length ? ` (${comments.length})` : ''}`} sx={{ minHeight: 36, py: 0.5, fontSize: '0.78rem' }} />
              <Tab icon={<History sx={{ fontSize: 15 }} />} iconPosition="start" label="Activity" sx={{ minHeight: 36, py: 0.5, fontSize: '0.78rem' }} />
              <Tab icon={<EventNote sx={{ fontSize: 15 }} />} iconPosition="start" label={`Meetings${meetingNotes.length ? ` (${meetingNotes.length})` : ''}`} sx={{ minHeight: 36, py: 0.5, fontSize: '0.78rem' }} />
            </Tabs>
          </Box>

          {/* Tab bodies */}
          <Box sx={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

            {/* ── OVERVIEW ── */}
            <TabPanel value={tab} idx={0}>
              <Box sx={{ px: 3, py: 2.5 }}>

                {/* Description */}
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.75}>
                  DESCRIPTION
                </Typography>
                {editingDesc ? (
                  <Box sx={{ position: 'relative', mb: 2 }}>
                    <TextField
                      autoFocus
                      fullWidth
                      multiline
                      rows={4}
                      size="small"
                      value={descDraft}
                      onChange={e => setDescDraft(e.target.value)}
                      onBlur={() => { saveField('description', descDraft); setEditingDesc(false); }}
                      onKeyDown={e => { if (e.key === 'Escape') setEditingDesc(false); }}
                    />
                    <Box
                      sx={{ position: 'absolute', bottom: 4, right: 4 }}
                      onMouseDown={e => e.preventDefault()}
                    >
                      <RephraseTool
                        text={descDraft}
                        onApply={(v) => { setDescDraft(v); saveField('description', v); setEditingDesc(false); }}
                      />
                    </Box>
                  </Box>
                ) : (
                  <Typography
                    variant="body2"
                    color={detail.description ? 'text.primary' : 'text.disabled'}
                    sx={{ mb: 2, cursor: 'pointer', '&:hover': { color: 'primary.main' }, whiteSpace: 'pre-wrap' }}
                    onClick={() => { setDescDraft(detail.description || ''); setEditingDesc(true); }}
                  >
                    {detail.description || 'Click to add description…'}
                  </Typography>
                )}

                {/* Progress */}
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.5}>
                  PROGRESS — {detail.progress ?? 0}%
                </Typography>
                <Slider
                  value={detail.progress ?? 0}
                  min={0} max={100} step={5}
                  onChange={(_, v) => setFullData(prev => ({ ...prev, progress: v }))}
                  onChangeCommitted={(_, v) => saveField('progress', v)}
                  sx={{ mb: 2.5, color: 'primary.main' }}
                  size="small"
                />

                {/* Dates */}
                <Box display="flex" gap={2} mb={2.5} flexWrap="wrap">
                  <Box flex={1} minWidth={120}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.5}>
                      START DATE
                    </Typography>
                    <TextField
                      type="date"
                      size="small"
                      fullWidth
                      value={detail.startDate ? detail.startDate.slice(0, 10) : ''}
                      onChange={e => saveField('startDate', e.target.value || null)}
                      InputLabelProps={{ shrink: true }}
                    />
                  </Box>
                  <Box flex={1} minWidth={120}>
                    <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.5}
                      sx={{ color: detail.dueDate && new Date(detail.dueDate) < new Date() && detail.status !== 'COMPLETED' ? 'error.main' : undefined }}
                    >
                      DUE DATE
                    </Typography>
                    <TextField
                      type="date"
                      size="small"
                      fullWidth
                      value={detail.dueDate ? detail.dueDate.slice(0, 10) : ''}
                      onChange={e => saveField('dueDate', e.target.value || null)}
                      InputLabelProps={{ shrink: true }}
                      inputProps={{ style: { color: detail.dueDate && new Date(detail.dueDate) < new Date() && detail.status !== 'COMPLETED' ? '#dc2626' : undefined } }}
                    />
                  </Box>
                </Box>

                {/* Tags */}
                <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.75}>
                  TAGS
                </Typography>
                <Box display="flex" flexWrap="wrap" gap={0.5} mb={1}>
                  {(detail.tags || []).map(tag => (
                    <Chip
                      key={tag}
                      label={tag}
                      size="small"
                      onDelete={() => removeTag(tag)}
                      sx={{ bgcolor: isDark ? '#1e1b4b' : '#eff6ff', color: isDark ? '#a5b4fc' : '#1d4ed8', border: 0, fontWeight: 500, fontSize: '0.7rem' }}
                    />
                  ))}
                  <Autocomplete
                    freeSolo
                    disableClearable
                    options={allTags}
                    filterOptions={(opts, { inputValue }) =>
                      inputValue.length >= 3
                        ? opts.filter(o => !(detail.tags || []).includes(o) && o.toLowerCase().includes(inputValue.toLowerCase()))
                        : []
                    }
                    inputValue={tagInput}
                    onInputChange={(_, val, reason) => { if (reason === 'input') setTagInput(val); }}
                    onChange={(_, val) => { if (val) addTag(typeof val === 'string' ? val : ''); }}
                    sx={{ width: 130 }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        size="small"
                        placeholder="Add tag…"
                        onKeyDown={e => {
                          if (e.key === ',') { e.preventDefault(); addTag(tagInput); }
                        }}
                        onBlur={() => { if (tagInput.trim()) addTag(tagInput); }}
                        sx={{ '& .MuiInputBase-input': { py: 0.25, px: 0.75, fontSize: '0.72rem' } }}
                        InputProps={{ ...params.InputProps, sx: { height: 24 } }}
                      />
                    )}
                  />
                </Box>

                {/* Canvas */}
                {canvases.length > 0 && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.75}>
                      CANVAS
                    </Typography>
                    <FormControl size="small" fullWidth>
                      <Select
                        value={detail.canvasId || ''}
                        displayEmpty
                        onChange={e => saveField('canvasId', e.target.value || null)}
                        sx={{ fontSize: '0.8rem' }}
                      >
                        <MenuItem value="" sx={{ fontSize: '0.8rem', color: 'text.disabled' }}>— No canvas —</MenuItem>
                        {canvases.map(c => (
                          <MenuItem key={c.id} value={c.id} sx={{ fontSize: '0.8rem' }}>
                            <Box display="flex" alignItems="center" gap={1}>
                              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: c.color, flexShrink: 0 }} />
                              {c.name}
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </>
                )}

                {/* Assignees */}
                <>
                  <Divider sx={{ my: 2 }} />
                  <Typography variant="caption" color="text.secondary" fontWeight={600} display="block" mb={0.75}>
                    ASSIGNEES
                  </Typography>
                  <Box display="flex" flexWrap="wrap" gap={0.75} mb={1}>
                    {(detail.assignees || []).map(a => (
                      <Box key={a.id} display="flex" alignItems="center" gap={0.6}
                        sx={{ bgcolor: isDark ? 'rgba(99,102,241,0.1)' : '#f0f9ff', border: '1px solid', borderColor: isDark ? 'rgba(99,102,241,0.3)' : '#bae6fd', borderRadius: 5, pl: 0.75, pr: 0.5, py: 0.25 }}
                      >
                        <Avatar sx={{ width: 18, height: 18, fontSize: '0.6rem', bgcolor: '#6366f1' }}>
                          {a.name.charAt(0).toUpperCase()}
                        </Avatar>
                        <Typography variant="caption" fontWeight={500} sx={{ color: isDark ? '#7dd3fc' : '#0369a1' }}>{a.name}</Typography>
                        <IconButton
                          size="small"
                          sx={{ p: 0.1, ml: 0.1, color: '#94a3b8', '&:hover': { color: 'error.main' } }}
                          onClick={() => {
                            const newIds = (detail.assignees || []).filter(x => x.id !== a.id).map(x => x.id);
                            saveField('assigneeIds', newIds);
                            setFullData(prev => prev ? { ...prev, assignees: prev.assignees.filter(x => x.id !== a.id) } : prev);
                          }}
                        >
                          <Close sx={{ fontSize: 11 }} />
                        </IconButton>
                      </Box>
                    ))}
                  </Box>
                  <FormControl size="small" fullWidth>
                      <Select
                        displayEmpty
                        value=""
                        onChange={e => {
                          const uid = e.target.value;
                          if (!uid) return;
                          if (uid === '__create__') { setQuickUserOpen(true); return; }
                          const newUser = users.find(u => u.id === uid);
                          const newAssignees = [...(detail.assignees || []), newUser];
                          saveField('assigneeIds', newAssignees.map(a => a.id));
                          setFullData(prev => prev ? { ...prev, assignees: newAssignees } : prev);
                        }}
                        sx={{ fontSize: '0.8rem' }}
                        renderValue={() => <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>+ Add assignee…</Typography>}
                      >
                        {users
                          .filter(u => !(detail.assignees || []).find(a => a.id === u.id))
                          .map(u => (
                            <MenuItem key={u.id} value={u.id} sx={{ fontSize: '0.8rem' }}>
                              <Box display="flex" alignItems="center" gap={1}>
                                <Avatar sx={{ width: 22, height: 22, fontSize: '0.62rem', bgcolor: '#6366f1' }}>{u.name.charAt(0).toUpperCase()}</Avatar>
                                <Box>
                                  <Typography variant="body2" fontWeight={500}>{u.name}</Typography>
                                  <Typography variant="caption" color="text.secondary">{u.email}</Typography>
                                </Box>
                              </Box>
                            </MenuItem>
                          ))}
                        <Divider />
                        <MenuItem value="__create__" sx={{ fontSize: '0.8rem', color: '#6366f1', gap: 1 }}>
                          <PersonAdd sx={{ fontSize: 15 }} />
                          <Typography variant="body2" fontWeight={500} color="#6366f1">New person…</Typography>
                        </MenuItem>
                      </Select>
                    </FormControl>

                </>

                {/* JIRA & Confluence moved to the Links tab */}
                {null && <>
                  <Divider sx={{ my: 2 }} />
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.75}>
                    <Box display="flex" alignItems="center" gap={0.75}>
                      <BugReport sx={{ fontSize: 14, color: '#0052cc' }} />
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        JIRA &amp; CONFLUENCE
                      </Typography>
                      {integrationItems.length > 0 && (
                        <Chip label={integrationItems.length} size="small"
                          sx={{ height: 16, fontSize: '0.6rem', bgcolor: isDark ? '#1e3a5f' : '#eff6ff', color: isDark ? '#93c5fd' : '#1d4ed8', border: 0 }} />
                      )}
                    </Box>
                    <Box display="flex" alignItems="center" gap={0.5}>
                      {integrationItems.length > 0 && (
                        <Tooltip title={chatOpen ? 'Close chat' : 'Chat with linked documents'}>
                          <Button
                            size="small"
                            startIcon={<Chat sx={{ fontSize: '13px !important' }} />}
                            onClick={() => setChatOpen(v => !v)}
                            sx={{
                              fontSize: '0.72rem', textTransform: 'none', py: 0.25, px: 0.75, minWidth: 0,
                              color: chatOpen ? '#fff' : '#6366f1',
                              bgcolor: chatOpen ? '#6366f1' : 'transparent',
                              '&:hover': { bgcolor: chatOpen ? '#4f46e5' : (isDark ? 'rgba(99,102,241,0.12)' : '#eff6ff') },
                            }}
                          >
                            Chat
                          </Button>
                        </Tooltip>
                      )}
                      <Button
                        size="small"
                        startIcon={<Add sx={{ fontSize: '13px !important' }} />}
                        onClick={() => { setShowIntForm(v => !v); setIntError(''); setIntInput(''); }}
                        sx={{ fontSize: '0.72rem', textTransform: 'none', color: '#0052cc', py: 0.25, px: 0.75, minWidth: 0 }}
                      >
                        Link
                      </Button>
                    </Box>
                  </Box>

                  {/* Selection toolbar */}
                  {selectedItemIds.size > 0 && (
                    <Box display="flex" alignItems="center" gap={1} mb={1.25} px={1} py={0.75}
                      sx={{ bgcolor: isDark ? 'rgba(3,105,161,0.15)' : '#f0f9ff', borderRadius: 1.5, border: `1px solid ${isDark ? '#0c4a6e' : '#bae6fd'}`, flexWrap: 'wrap' }}>
                      <Typography variant="caption" fontWeight={700} color="#0369a1" sx={{ flexShrink: 0 }}>
                        {selectedItemIds.size} selected
                      </Typography>
                      <Select
                        size="small"
                        value={consolidatedAi.action}
                        onChange={e => setConsolidatedAi(prev => ({ ...prev, action: e.target.value }))}
                        sx={{ fontSize: '0.72rem', flex: 1, minWidth: 150, '& .MuiSelect-select': { py: 0.4, px: 1 } }}
                      >
                        {AI_ACTIONS.map(a => (
                          <MenuItem key={a.value} value={a.value} sx={{ fontSize: '0.8rem', gap: 1 }}>
                            {a.emoji} {a.label}
                          </MenuItem>
                        ))}
                      </Select>
                      <Button
                        size="small" variant="contained"
                        onClick={handleConsolidatedAiAction}
                        disabled={consolidatedAi.loading}
                        sx={{ fontSize: '0.72rem', textTransform: 'none', flexShrink: 0, bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' }, py: 0.4 }}
                      >
                        {consolidatedAi.loading
                          ? <CircularProgress size={12} sx={{ color: '#fff' }} />
                          : 'Run ✨'}
                      </Button>
                      <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setSelectedItemIds(new Set())}>
                        <Close sx={{ fontSize: 13 }} />
                      </IconButton>
                    </Box>
                  )}

                  {/* Consolidated AI result panel */}
                  {consolidatedAi.open && (
                    <Box sx={{ p: 1.5, mb: 1.5, borderRadius: 2, border: '1.5px solid', borderColor: isDark ? 'rgba(139,92,246,0.4)' : '#ddd6fe', bgcolor: isDark ? 'rgba(139,92,246,0.08)' : '#faf5ff' }}>
                      <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.75}>
                        <Typography variant="caption" fontWeight={700} color="#7c3aed">
                          {AI_ACTIONS.find(a => a.value === consolidatedAi.action)?.emoji || '✨'}{' '}
                          {AI_ACTIONS.find(a => a.value === consolidatedAi.action)?.label || 'AI Result'}
                          {selectedItemIds.size > 0 && ` — ${selectedItemIds.size} items`}
                        </Typography>
                        <IconButton size="small" sx={{ p: 0.25 }}
                          onClick={() => setConsolidatedAi(prev => ({ ...prev, open: false }))}>
                          <Close sx={{ fontSize: 13 }} />
                        </IconButton>
                      </Box>
                      {consolidatedAi.loading && (
                        <Box display="flex" alignItems="center" gap={1}>
                          <CircularProgress size={13} sx={{ color: '#7c3aed' }} />
                          <Typography variant="caption" color="text.secondary">Running…</Typography>
                        </Box>
                      )}
                      {consolidatedAi.error && (
                        <Typography variant="caption" color="error.main">{consolidatedAi.error}</Typography>
                      )}
                      {consolidatedAi.text && (
                        <Typography variant="caption" color="text.primary"
                          sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, display: 'block', fontSize: '0.78rem' }}>
                          {consolidatedAi.text}
                        </Typography>
                      )}
                    </Box>
                  )}

                  {/* ── Chat panel ── */}
                  {chatOpen && integrationItems.length > 0 && (
                    <Box sx={{ mb: 1.5, borderRadius: 2, border: '1.5px solid', borderColor: isDark ? 'rgba(99,102,241,0.3)' : '#c7d2fe', bgcolor: isDark ? 'rgba(99,102,241,0.06)' : '#fafbff', overflow: 'hidden' }}>
                      {/* Chat header */}
                      <Box display="flex" alignItems="center" justifyContent="space-between"
                        sx={{ px: 1.5, py: 0.75, bgcolor: '#6366f1', borderBottom: '1px solid #c7d2fe' }}>
                        <Box display="flex" alignItems="center" gap={0.75}>
                          <Chat sx={{ fontSize: 13, color: '#fff' }} />
                          <Typography variant="caption" fontWeight={700} color="#fff" sx={{ fontSize: '0.72rem' }}>
                            Chat —{' '}
                            {selectedItemIds.size > 0
                              ? `${selectedItemIds.size} selected item${selectedItemIds.size > 1 ? 's' : ''}`
                              : `all ${integrationItems.length} item${integrationItems.length > 1 ? 's' : ''}`}
                          </Typography>
                        </Box>
                        <Box display="flex" alignItems="center">
                          {chatMessages.length > 0 && (
                            <Tooltip title="Clear conversation">
                              <IconButton size="small" sx={{ p: 0.25, color: '#c7d2fe', '&:hover': { color: '#fff' } }}
                                onClick={() => { setChatMessages([]); setChatError(''); }}>
                                <DeleteSweep sx={{ fontSize: 13 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                          <IconButton size="small" sx={{ p: 0.25, color: '#c7d2fe', '&:hover': { color: '#fff' } }}
                            onClick={() => setChatOpen(false)}>
                            <Close sx={{ fontSize: 13 }} />
                          </IconButton>
                        </Box>
                      </Box>

                      {/* Message history */}
                      <Box sx={{ px: 1.25, py: 1, maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {chatMessages.length === 0 && !chatSending && (
                          <Box sx={{ textAlign: 'center', py: 2 }}>
                            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.75rem' }}>
                              Ask anything about the{' '}
                              {selectedItemIds.size > 0
                                ? `${selectedItemIds.size} selected item${selectedItemIds.size > 1 ? 's' : ''}`
                                : `${integrationItems.length} linked item${integrationItems.length > 1 ? 's' : ''}`}…
                            </Typography>
                            <Box display="flex" flexWrap="wrap" gap={0.5} justifyContent="center" mt={1.25}>
                              {['Summarize the current status', 'What are the blockers?', 'Who is working on what?', 'What should we do next?'].map(hint => (
                                <Chip key={hint} label={hint} size="small"
                                  onClick={() => setChatInput(hint)}
                                  sx={{ fontSize: '0.66rem', height: 20, cursor: 'pointer', bgcolor: isDark ? 'rgba(99,102,241,0.12)' : '#eff6ff', color: isDark ? '#a5b4fc' : '#4f46e5', '&:hover': { bgcolor: isDark ? 'rgba(99,102,241,0.2)' : '#e0e7ff' } }} />
                              ))}
                            </Box>
                          </Box>
                        )}
                        {chatMessages.map((msg, idx) => (
                          <Box key={idx} display="flex" justifyContent={msg.role === 'user' ? 'flex-end' : 'flex-start'}>
                            <Box sx={{
                              maxWidth: '88%', px: 1.25, py: 0.75,
                              borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                              bgcolor: msg.role === 'user' ? '#6366f1' : '#f1f5f9',
                              color: msg.role === 'user' ? '#fff' : 'text.primary',
                            }}>
                              <Typography variant="caption"
                                sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, display: 'block', fontSize: '0.76rem' }}>
                                {msg.content}
                              </Typography>
                            </Box>
                          </Box>
                        ))}
                        {chatSending && (
                          <Box display="flex" alignItems="center" gap={0.75} pl={0.5}>
                            <CircularProgress size={11} sx={{ color: '#6366f1' }} />
                            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.72rem' }}>Thinking…</Typography>
                          </Box>
                        )}
                        {chatError && (
                          <Typography variant="caption" color="error.main" sx={{ px: 0.5, fontSize: '0.72rem' }}>{chatError}</Typography>
                        )}
                        <div ref={chatBottomRef} />
                      </Box>

                      {/* Input area */}
                      <Box sx={{ px: 1.25, pb: 1.25, pt: 0.5, borderTop: '1px solid', borderTopColor: 'divider' }}>
                        <Box display="flex" gap={0.75} alignItems="flex-end">
                          <TextField
                            fullWidth size="small" multiline maxRows={4}
                            placeholder="Ask about these documents… (Enter to send, Shift+Enter for newline)"
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChatMessage(); } }}
                            disabled={chatSending}
                            sx={{ '& textarea': { fontSize: '0.82rem' }, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                          />
                          <Tooltip title="Send (Enter)">
                            <span>
                              <IconButton
                                onClick={handleSendChatMessage}
                                disabled={!chatInput.trim() || chatSending}
                                sx={{ p: 1, mb: 0.1, flexShrink: 0, color: '#6366f1', '&:disabled': { color: 'text.disabled' } }}
                              >
                                <Send sx={{ fontSize: 18 }} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Box>
                      </Box>
                    </Box>
                  )}

                  {/* Add form */}
                  {showIntForm && (
                    <Box sx={{ p: 1.5, bgcolor: isDark ? 'background.default' : '#f8fafc', borderRadius: 2, border: '1px solid', borderColor: 'divider', mb: 1.5 }}>
                      {/* Type toggle */}
                      <Box display="flex" gap={0.75} mb={1.25}>
                        {['JIRA', 'CONFLUENCE'].map(t => (
                          <Box
                            key={t}
                            onClick={() => { setIntAddType(t); setIntInput(''); setIntError(''); }}
                            sx={{
                              px: 1.25, py: 0.4, borderRadius: 1.5, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600,
                              border: `1.5px solid ${intAddType === t ? '#0052cc' : (isDark ? '#334155' : '#e2e8f0')}`,
                              bgcolor: intAddType === t ? (isDark ? '#1e3a5f' : '#eff6ff') : 'transparent',
                              color: intAddType === t ? (isDark ? '#93c5fd' : '#0052cc') : 'text.secondary',
                              transition: 'all 0.12s',
                            }}
                          >
                            {t === 'JIRA' ? '🔵 JIRA Ticket' : '📄 Confluence Page'}
                          </Box>
                        ))}
                      </Box>
                      <Box display="flex" gap={1} alignItems="flex-start">
                        <TextField
                          autoFocus
                          size="small"
                          placeholder={intAddType === 'JIRA' ? 'e.g. PROJ-123' : 'Page URL or numeric page ID'}
                          value={intInput}
                          onChange={e => setIntInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddIntegration(); if (e.key === 'Escape') setShowIntForm(false); }}
                          sx={{ flex: 1, '& input': { fontSize: '0.82rem' } }}
                          inputProps={intAddType === 'JIRA' ? { style: { textTransform: 'uppercase' } } : {}}
                        />
                        <Button size="small" variant="contained" onClick={handleAddIntegration}
                          disabled={intAdding || !intInput.trim()}
                          sx={{ fontSize: '0.78rem', textTransform: 'none', flexShrink: 0 }}>
                          {intAdding ? <CircularProgress size={14} /> : 'Fetch & Link'}
                        </Button>
                        <Button size="small" variant="outlined"
                          onClick={() => { setShowIntForm(false); setIntError(''); }}
                          sx={{ fontSize: '0.78rem', textTransform: 'none', flexShrink: 0 }}>
                          Cancel
                        </Button>
                      </Box>
                      {intError && (
                        <Typography variant="caption" color="error.main" display="block" mt={0.75}>{intError}</Typography>
                      )}
                    </Box>
                  )}

                  {/* Item list */}
                  {integrationItems.length === 0 && !showIntForm && (
                    <Typography variant="caption" color="text.disabled">
                      No JIRA tickets or Confluence pages linked.
                    </Typography>
                  )}

                  <Box display="flex" flexDirection="column" gap={1}>
                    {integrationItems.map(item => {
                      let data = null;
                      try { data = JSON.parse(item.cachedData || '{}'); } catch {}
                      const isJira = item.type === 'JIRA';

                      const statusColor = (() => {
                        const cat = (data?.statusCategory || '').toLowerCase();
                        if (cat === 'done') return isDark ? { color: '#6ee7b7', bg: '#064e3b' } : { color: '#065f46', bg: '#d1fae5' };
                        if (cat === 'in progress') return { color: isDark ? '#93c5fd' : '#1d4ed8', bg: isDark ? '#1e3a5f' : '#dbeafe' };
        return { color: isDark ? '#94a3b8' : '#475569', bg: isDark ? '#1e293b' : '#f1f5f9' };
                      })();

                      const isSelected = selectedItemIds.has(item.id);
                      return (
                        <Box key={item.id} sx={{
                          p: 1.5, borderRadius: 2,
                          border: `1.5px solid ${isSelected ? '#a78bfa' : isJira ? (isDark ? '#1e3a5f' : '#dbeafe') : (isDark ? '#0c4a6e' : '#e0f2fe')}`,
                          bgcolor: isSelected ? (isDark ? 'rgba(139,92,246,0.12)' : '#fdf4ff') : isJira ? (isDark ? 'rgba(99,102,241,0.06)' : '#fafbff') : (isDark ? 'rgba(14,116,144,0.08)' : '#f0f9ff'),
                          '&:hover': { borderColor: isSelected ? '#8b5cf6' : (isDark ? 'rgba(0,82,204,0.5)' : '#0052cc55'), boxShadow: isDark ? 'none' : '0 1px 6px rgba(0,82,204,0.07)' },
                          transition: 'all 0.15s',
                        }}>
                          {/* Header row: checkbox + type badge + key/link + actions */}
                          <Box display="flex" alignItems="center" gap={0.75} mb={0.4}>
                            <Checkbox
                              size="small"
                              checked={isSelected}
                              onChange={() => setSelectedItemIds(prev => {
                                const n = new Set(prev);
                                if (n.has(item.id)) n.delete(item.id); else n.add(item.id);
                                return n;
                              })}
                              sx={{ p: 0.25, mr: -0.5, color: '#c4b5fd', '&.Mui-checked': { color: '#7c3aed' } }}
                            />
                            <Chip
                              label={isJira ? 'JIRA' : 'Confluence'}
                              size="small"
                              sx={{
                                height: 16, fontSize: '0.58rem', fontWeight: 700, border: 0,
                                bgcolor: isJira ? '#0052cc' : '#0077b6',
                                color: '#fff',
                              }}
                            />
                            <Typography
                              variant="caption"
                              component="a"
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              fontWeight={700}
                              sx={{ color: '#0052cc', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                            >
                              {isJira ? item.key : (data?.spaceKey ? `${data.spaceKey} › ${item.key}` : item.key)}
                            </Typography>
                            <OpenInNew sx={{ fontSize: 10, color: '#0052cc' }} />
                            {isJira && data?.issueType && (
                              <Chip label={data.issueType} size="small"
                                sx={{ height: 15, fontSize: '0.58rem', bgcolor: isDark ? '#1e3a5f' : '#eff6ff', color: isDark ? '#93c5fd' : '#1d4ed8', border: 0 }} />
                            )}
                            {isJira && data?.status && (
                              <Chip label={data.status} size="small"
                                sx={{ height: 15, fontSize: '0.58rem', bgcolor: statusColor.bg, color: statusColor.color, border: 0, ml: 'auto' }} />
                            )}
                            {!isJira && data?.space && (
                              <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto', fontSize: '0.62rem' }}>
                                {data.space}
                              </Typography>
                            )}
                            {/* Actions */}
                            <Box display="flex" gap={0.25} sx={{ ml: isJira && data?.status ? 0 : 'auto' }}>
                              <Tooltip title={isJira
                                ? (childrenMap[item.id] ? 'Reload child tickets' : 'Fetch child tickets')
                                : (childrenMap[item.id] ? 'Reload child pages' : 'Fetch child pages')}>
                                <IconButton
                                  size="small"
                                  sx={{ p: 0.25, color: fetchingChildrenId === item.id ? '#7c3aed' : 'text.secondary' }}
                                  onClick={() => handleFetchChildren(item)}
                                  disabled={fetchingChildrenId === item.id}
                                >
                                  {fetchingChildrenId === item.id
                                    ? <CircularProgress size={11} sx={{ color: '#7c3aed' }} />
                                    : <AccountTree sx={{ fontSize: 13 }} />}
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="AI actions">
                                <IconButton
                                  size="small"
                                  sx={{ p: 0.25, color: '#7c3aed', opacity: itemAiMap[item.id]?.loading ? 1 : 0.45, '&:hover': { opacity: 1 } }}
                                  onClick={(e) => setAiMenuAnchor({ el: e.currentTarget, itemId: item.id })}
                                  disabled={itemAiMap[item.id]?.loading}
                                >
                                  {itemAiMap[item.id]?.loading
                                    ? <CircularProgress size={11} sx={{ color: '#7c3aed' }} />
                                    : <AutoFixHigh sx={{ fontSize: 13 }} />}
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Refresh">
                                <IconButton size="small" sx={{ p: 0.25, color: 'text.secondary' }}
                                  onClick={() => handleRefreshIntegration(item.id)}
                                  disabled={refreshingId === item.id}>
                                  {refreshingId === item.id
                                    ? <CircularProgress size={11} />
                                    : <Refresh sx={{ fontSize: 13 }} />}
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Remove">
                                <IconButton size="small"
                                  sx={{ p: 0.25, color: 'text.secondary', '&:hover': { color: 'error.main' } }}
                                  onClick={() => handleRemoveIntegration(item.id)}>
                                  <LinkOff sx={{ fontSize: 13 }} />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          </Box>

                          {/* Title / Summary */}
                          <Typography variant="body2" fontWeight={600} mb={0.4} sx={{ color: 'text.primary', lineHeight: 1.3 }}>
                            {isJira ? data?.summary : data?.title}
                          </Typography>

                          {/* Description / Excerpt */}
                          {(isJira ? data?.description : data?.excerpt) && (
                            <Typography variant="caption" color="text.secondary" sx={{
                              display: '-webkit-box', WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical', overflow: 'hidden',
                              lineHeight: 1.5,
                            }}>
                              {isJira ? data.description : data.excerpt}
                            </Typography>
                          )}

                          {/* Meta */}
                          <Box display="flex" flexWrap="wrap" gap={1} mt={0.5}>
                            {isJira && data?.priority && (
                              <Typography variant="caption" color="text.disabled">
                                Priority: <b>{data.priority}</b>
                              </Typography>
                            )}
                            {isJira && data?.assignee && (
                              <Typography variant="caption" color="text.disabled">
                                Assignee: <b>{data.assignee}</b>
                              </Typography>
                            )}
                            {!isJira && data?.version && (
                              <Typography variant="caption" color="text.disabled">
                                v{data.version}
                              </Typography>
                            )}
                            {(isJira ? data?.updated : data?.lastUpdated) && (
                              <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
                                Updated {format(new Date(isJira ? data.updated : data.lastUpdated), 'MMM d, yyyy')}
                              </Typography>
                            )}
                          </Box>

                          {/* JIRA Labels */}
                          {isJira && data?.labels?.length > 0 && (
                            <Box display="flex" flexWrap="wrap" gap={0.5} mt={0.5}>
                              {data.labels.map(lbl => (
                                <Chip key={lbl} label={lbl} size="small"
                                  sx={{ height: 15, fontSize: '0.58rem', bgcolor: isDark ? '#1e293b' : '#f1f5f9', color: 'text.secondary', border: 0 }} />
                              ))}
                            </Box>
                          )}

                          {/* Confluence breadcrumb */}
                          {!isJira && data?.ancestors?.length > 0 && (
                            <Typography variant="caption" color="text.disabled" display="block" mt={0.4} sx={{ fontSize: '0.62rem' }}>
                              {data.ancestors.join(' › ')}
                            </Typography>
                          )}

                          {/* Children (JIRA sub-tickets or Confluence child pages) */}
                          {childrenMap[item.id] !== undefined && (
                            <Box mt={0.75}>
                              <Box
                                display="flex" alignItems="center" gap={0.5}
                                sx={{ cursor: 'pointer', userSelect: 'none' }}
                                onClick={() => toggleExpandChildren(item.id)}
                              >
                                {expandedChildren[item.id]
                                  ? <ExpandLess sx={{ fontSize: 13, color: 'text.secondary' }} />
                                  : <ExpandMore sx={{ fontSize: 13, color: 'text.secondary' }} />}
                                <Typography variant="caption" fontWeight={600} color="text.secondary" sx={{ fontSize: '0.68rem' }}>
                                  {childrenMap[item.id].length === 0
                                    ? (isJira ? 'No child tickets' : 'No child pages')
                                    : `${childrenMap[item.id].length} child ${isJira
                                        ? `ticket${childrenMap[item.id].length > 1 ? 's' : ''}`
                                        : `page${childrenMap[item.id].length > 1 ? 's' : ''}`}`}
                                </Typography>
                              </Box>
                              {expandedChildren[item.id] && childrenMap[item.id].length > 0 && (
                                <Box mt={0.5} pl={0.5}
                                  sx={{ borderLeft: `2px solid ${isJira ? (isDark ? '#1e3a5f' : '#dbeafe') : (isDark ? '#0c4a6e' : '#bae6fd')}` }}
                                  display="flex" flexDirection="column" gap={0.5}>
                                  {isJira ? childrenMap[item.id].map(child => {
                                    const childCat = (child.statusCategory || '').toLowerCase();
                                    const childStatusColor = childCat === 'done'
                                      ? (isDark ? { color: '#6ee7b7', bg: '#064e3b' } : { color: '#065f46', bg: '#d1fae5' })
                                      : childCat === 'in progress'
                                        ? (isDark ? { color: '#93c5fd', bg: '#1e3a5f' } : { color: '#1d4ed8', bg: '#dbeafe' })
                                        : (isDark ? { color: '#94a3b8', bg: '#1e293b' } : { color: '#475569', bg: '#f1f5f9' });
                                    return (
                                      <Box key={child.key} sx={{ pl: 1 }}>
                                        <Box display="flex" alignItems="center" gap={0.5} flexWrap="wrap">
                                          <Typography variant="caption" component="a" href={child.url}
                                            target="_blank" rel="noopener noreferrer" fontWeight={700}
                                            sx={{ color: '#0052cc', textDecoration: 'none', fontSize: '0.7rem', '&:hover': { textDecoration: 'underline' } }}>
                                            {child.key}
                                          </Typography>
                                          {child.issueType && (
                                            <Chip label={child.issueType} size="small"
                                              sx={{ height: 13, fontSize: '0.56rem', bgcolor: isDark ? '#1e3a5f' : '#eff6ff', color: isDark ? '#93c5fd' : '#1d4ed8', border: 0 }} />
                                          )}
                                          <Chip label={child.status || '?'} size="small"
                                            sx={{ height: 13, fontSize: '0.56rem', bgcolor: childStatusColor.bg, color: childStatusColor.color, border: 0 }} />
                                          {child.assignee && (
                                            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.62rem' }}>
                                              {child.assignee}
                                            </Typography>
                                          )}
                                        </Box>
                                        {child.summary && (
                                          <Typography variant="caption" color="text.primary"
                                            sx={{ fontSize: '0.7rem', display: 'block', lineHeight: 1.35, mt: 0.1 }}>
                                            {child.summary}
                                          </Typography>
                                        )}
                                      </Box>
                                    );
                                  }) : childrenMap[item.id].map(page => (
                                    <Box key={page.id} sx={{ pl: 1 }}>
                                      <Box display="flex" alignItems="center" gap={0.5} flexWrap="wrap">
                                        <Typography variant="caption" component="a" href={page.url}
                                          target="_blank" rel="noopener noreferrer" fontWeight={700}
                                          sx={{ color: '#0077b6', textDecoration: 'none', fontSize: '0.7rem', '&:hover': { textDecoration: 'underline' } }}>
                                          {page.title}
                                        </Typography>
                                        {page.spaceKey && (
                                          <Chip label={page.spaceKey} size="small"
                                            sx={{ height: 13, fontSize: '0.56rem', bgcolor: isDark ? '#0c4a6e' : '#e0f2fe', color: isDark ? '#7dd3fc' : '#0077b6', border: 0 }} />
                                        )}
                                      </Box>
                                      {page.excerpt && (
                                        <Typography variant="caption" color="text.secondary"
                                          sx={{ fontSize: '0.68rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.35, mt: 0.1 }}>
                                          {page.excerpt}
                                        </Typography>
                                      )}
                                    </Box>
                                  ))}
                                </Box>
                              )}
                            </Box>
                          )}

                          {/* Per-item AI result */}
                          {itemAiMap[item.id]?.open && (
                            <Box mt={1} sx={{ p: 1.25, borderRadius: 1.5, border: '1.5px solid', borderColor: isDark ? 'rgba(139,92,246,0.4)' : '#ddd6fe', bgcolor: isDark ? 'rgba(139,92,246,0.08)' : '#faf5ff' }}>
                              <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.5}>
                                <Typography variant="caption" fontWeight={700} color="#7c3aed" sx={{ fontSize: '0.7rem' }}>
                                  {AI_ACTIONS.find(a => a.value === itemAiMap[item.id]?.action)?.emoji || '✨'}{' '}
                                  {itemAiMap[item.id]?.actionLabel || 'AI Result'}
                                </Typography>
                                <IconButton size="small" sx={{ p: 0.2 }}
                                  onClick={() => setItemAiMap(prev => ({ ...prev, [item.id]: { ...prev[item.id], open: false } }))}>
                                  <Close sx={{ fontSize: 12 }} />
                                </IconButton>
                              </Box>
                              {itemAiMap[item.id]?.loading && (
                                <Box display="flex" alignItems="center" gap={0.75}>
                                  <CircularProgress size={12} sx={{ color: '#7c3aed' }} />
                                  <Typography variant="caption" color="text.secondary">Running…</Typography>
                                </Box>
                              )}
                              {itemAiMap[item.id]?.error && (
                                <Typography variant="caption" color="error.main">{itemAiMap[item.id].error}</Typography>
                              )}
                              {itemAiMap[item.id]?.text && (
                                <Typography variant="caption" color="text.primary"
                                  sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, display: 'block', fontSize: '0.75rem' }}>
                                  {itemAiMap[item.id].text}
                                </Typography>
                              )}
                            </Box>
                          )}
                        </Box>
                      );
                    })}
                  </Box>

                  {/* AI actions dropdown menu (shared across all cards) */}
                  <Menu
                    anchorEl={aiMenuAnchor?.el}
                    open={Boolean(aiMenuAnchor)}
                    onClose={() => setAiMenuAnchor(null)}
                    PaperProps={{ sx: { minWidth: 240, py: 0.5 } }}
                  >
                    {AI_ACTIONS.map(a => (
                      <MenuItem
                        key={a.value}
                        sx={{ fontSize: '0.82rem', gap: 1, py: 0.75 }}
                        onClick={() => {
                          const target = integrationItems.find(i => i.id === aiMenuAnchor?.itemId);
                          if (target) handleRunAiAction(target, a.value);
                          setAiMenuAnchor(null);
                        }}
                      >
                        <span style={{ width: 22, display: 'inline-block', textAlign: 'center', fontSize: '1rem' }}>{a.emoji}</span>
                        {a.label}
                      </MenuItem>
                    ))}
                  </Menu>
                </>}

                {/* Created by */}
                {detail.createdBy && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Box display="flex" justifyContent="space-between">
                      <Typography variant="caption" color="text.disabled">
                        Created by {detail.createdBy.name}
                      </Typography>
                      <Typography variant="caption" color="text.disabled">
                        {format(new Date(detail.createdAt), 'MMM d, yyyy')}
                      </Typography>
                    </Box>
                  </>
                )}
              </Box>
            </TabPanel>

            {/* ── LINKS ── */}
            <TabPanel value={tab} idx={1}>
              <Box sx={{ px: 3, py: 2.5 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Add />}
                  onClick={() => setShowLinkForm(v => !v)}
                  fullWidth
                  sx={{ mb: 2 }}
                >
                  Add Link
                </Button>

                {showLinkForm && (
                  <Box sx={{ p: 2, bgcolor: isDark ? 'background.default' : '#f8fafc', borderRadius: 2, border: '1px solid', borderColor: 'divider', mb: 2 }}>
                    <TextField
                      fullWidth size="small" label="URL *" value={linkForm.url}
                      onChange={e => setLinkForm(f => ({ ...f, url: e.target.value }))}
                      sx={{ mb: 1.5 }}
                    />
                    <TextField
                      fullWidth size="small" label="Title" value={linkForm.title}
                      onChange={e => setLinkForm(f => ({ ...f, title: e.target.value }))}
                      sx={{ mb: 1.5 }}
                    />
                    <TextField
                      fullWidth size="small" label="Description" value={linkForm.description}
                      onChange={e => setLinkForm(f => ({ ...f, description: e.target.value }))}
                      sx={{ mb: 1.5 }}
                    />
                    <TextField
                      fullWidth size="small" label="Category" value={linkForm.category}
                      onChange={e => setLinkForm(f => ({ ...f, category: e.target.value }))}
                      placeholder="e.g. Documentation, Reference"
                      sx={{ mb: 1.5 }}
                    />
                    <Box display="flex" justifyContent="flex-end" gap={1}>
                      <Button size="small" onClick={() => setShowLinkForm(false)} variant="outlined">Cancel</Button>
                      <Button size="small" variant="contained" onClick={handleAddLink} disabled={addingLink || !linkForm.url.trim()}>
                        {addingLink ? <CircularProgress size={14} /> : 'Save'}
                      </Button>
                    </Box>
                  </Box>
                )}

                {links.length === 0 ? (
                  <Box textAlign="center" py={4}>
                    <LinkIcon sx={{ fontSize: 36, color: '#e2e8f0', mb: 1 }} />
                    <Typography variant="body2" color="text.disabled">No links yet</Typography>
                  </Box>
                ) : (
                  links.map(link => (
                    <Box
                      key={link.id}
                      sx={{
                        p: 1.75, mb: 1.25, borderRadius: 2, border: '1px solid', borderColor: isDark ? '#334155' : '#e2e8f0',
                        '&:hover': { borderColor: '#6366f1', boxShadow: isDark ? 'none' : '0 2px 8px rgba(99,102,241,0.08)' },
                        transition: 'all 0.15s',
                      }}
                    >
                      <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                        <Box flex={1} minWidth={0} mr={1}>
                          <Box display="flex" alignItems="center" gap={0.5}>
                            <Typography
                              variant="body2"
                              fontWeight={600}
                              component="a"
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              sx={{ color: '#6366f1', textDecoration: 'none', '&:hover': { textDecoration: 'underline' }, noWrap: true, overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', maxWidth: '100%' }}
                            >
                              {link.title || link.url}
                            </Typography>
                            <OpenInNew sx={{ fontSize: 12, color: '#6366f1', flexShrink: 0 }} />
                          </Box>
                          {link.title && (
                            <Typography variant="caption" color="text.disabled" noWrap display="block">{link.url}</Typography>
                          )}
                          {link.description && (
                            <Typography variant="caption" color="text.secondary" display="block" mt={0.25}>{link.description}</Typography>
                          )}
                          {link.category && (
                            <Chip label={link.category} size="small" sx={{ height: 16, fontSize: '0.6rem', mt: 0.5, bgcolor: isDark ? '#1e293b' : '#f1f5f9', color: 'text.secondary', border: 0 }} />
                          )}
                        </Box>
                        <Tooltip title="Delete">
                          <IconButton size="small" onClick={() => handleDeleteLink(link.id)} sx={{ color: 'error.main', flexShrink: 0 }}>
                            <Delete sx={{ fontSize: 15 }} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </Box>
                  ))
                )}

                <Divider sx={{ my: 2.5 }} />

                {/* ── JIRA & Confluence ── */}
                <>
                  {/* Top bar */}
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                    <Box display="flex" alignItems="center" gap={0.75}>
                      <BugReport sx={{ fontSize: 14, color: '#0052cc' }} />
                      <Typography variant="caption" color="text.secondary" fontWeight={600}>
                        JIRA &amp; CONFLUENCE
                      </Typography>
                      {integrationItems.length > 0 && (
                        <Chip label={integrationItems.length} size="small"
                          sx={{ height: 16, fontSize: '0.6rem', bgcolor: isDark ? '#1e3a5f' : '#eff6ff', color: isDark ? '#93c5fd' : '#1d4ed8', border: 0 }} />
                      )}
                    </Box>
                    {integrationItems.length > 0 && (
                      <Tooltip title={chatOpen ? 'Close chat' : 'Chat with linked documents'}>
                        <Button
                          size="small"
                          startIcon={<Chat sx={{ fontSize: '13px !important' }} />}
                          onClick={() => setChatOpen(v => !v)}
                          sx={{
                            fontSize: '0.72rem', textTransform: 'none', py: 0.25, px: 0.75, minWidth: 0,
                            color: chatOpen ? '#fff' : '#6366f1',
                            bgcolor: chatOpen ? '#6366f1' : 'transparent',
                            '&:hover': { bgcolor: chatOpen ? '#4f46e5' : '#eff6ff' },
                          }}
                        >
                          Chat
                        </Button>
                      </Tooltip>
                    )}
                  </Box>

                  {/* Selection toolbar */}
                  {selectedItemIds.size > 0 && (
                    <Box display="flex" alignItems="center" gap={1} mb={1.25} px={1} py={0.75}
                      sx={{ bgcolor: isDark ? 'rgba(99,102,241,0.1)' : '#f0f9ff', borderRadius: 1.5, border: '1px solid', borderColor: isDark ? 'rgba(99,102,241,0.3)' : '#bae6fd', flexWrap: 'wrap' }}>
                      <Typography variant="caption" fontWeight={700} color={isDark ? '#7dd3fc' : '#0369a1'} sx={{ flexShrink: 0 }}>
                        {selectedItemIds.size} selected
                      </Typography>
                      <Select
                        size="small"
                        value={consolidatedAi.action}
                        onChange={e => setConsolidatedAi(prev => ({ ...prev, action: e.target.value }))}
                        sx={{ fontSize: '0.72rem', flex: 1, minWidth: 150, '& .MuiSelect-select': { py: 0.4, px: 1 } }}
                      >
                        {AI_ACTIONS.map(a => (
                          <MenuItem key={a.value} value={a.value} sx={{ fontSize: '0.8rem', gap: 1 }}>
                            {a.emoji} {a.label}
                          </MenuItem>
                        ))}
                      </Select>
                      <Button
                        size="small" variant="contained"
                        onClick={handleConsolidatedAiAction}
                        disabled={consolidatedAi.loading}
                        sx={{ fontSize: '0.72rem', textTransform: 'none', flexShrink: 0, bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' }, py: 0.4 }}
                      >
                        {consolidatedAi.loading ? <CircularProgress size={12} sx={{ color: '#fff' }} /> : 'Run ✨'}
                      </Button>
                      <IconButton size="small" sx={{ p: 0.25 }} onClick={() => setSelectedItemIds(new Set())}>
                        <Close sx={{ fontSize: 13 }} />
                      </IconButton>
                    </Box>
                  )}

                  {/* Consolidated AI result */}
                  {consolidatedAi.open && (
                    <Box sx={{ p: 1.5, mb: 1.5, borderRadius: 2, border: '1.5px solid', borderColor: isDark ? 'rgba(139,92,246,0.4)' : '#ddd6fe', bgcolor: isDark ? 'rgba(139,92,246,0.08)' : '#faf5ff' }}>
                      <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.75}>
                        <Typography variant="caption" fontWeight={700} color="#7c3aed">
                          {AI_ACTIONS.find(a => a.value === consolidatedAi.action)?.emoji || '✨'}{' '}
                          {AI_ACTIONS.find(a => a.value === consolidatedAi.action)?.label || 'AI Result'}
                          {selectedItemIds.size > 0 && ` — ${selectedItemIds.size} items`}
                        </Typography>
                        <IconButton size="small" sx={{ p: 0.25 }}
                          onClick={() => setConsolidatedAi(prev => ({ ...prev, open: false }))}>
                          <Close sx={{ fontSize: 13 }} />
                        </IconButton>
                      </Box>
                      {consolidatedAi.loading && (
                        <Box display="flex" alignItems="center" gap={1}>
                          <CircularProgress size={13} sx={{ color: '#7c3aed' }} />
                          <Typography variant="caption" color="text.secondary">Running…</Typography>
                        </Box>
                      )}
                      {consolidatedAi.error && <Typography variant="caption" color="error.main">{consolidatedAi.error}</Typography>}
                      {consolidatedAi.text && (
                        <Typography variant="caption" color="text.primary"
                          sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, display: 'block', fontSize: '0.78rem' }}>
                          {consolidatedAi.text}
                        </Typography>
                      )}
                    </Box>
                  )}

                  {/* Chat panel */}
                  {chatOpen && integrationItems.length > 0 && (
                    <Box sx={{ mb: 1.5, borderRadius: 2, border: '1.5px solid', borderColor: isDark ? 'rgba(99,102,241,0.3)' : '#c7d2fe', bgcolor: isDark ? 'rgba(99,102,241,0.06)' : '#fafbff', overflow: 'hidden' }}>
                      <Box display="flex" alignItems="center" justifyContent="space-between"
                        sx={{ px: 1.5, py: 0.75, bgcolor: '#6366f1', borderBottom: '1px solid #c7d2fe' }}>
                        <Box display="flex" alignItems="center" gap={0.75}>
                          <Chat sx={{ fontSize: 13, color: '#fff' }} />
                          <Typography variant="caption" fontWeight={700} color="#fff" sx={{ fontSize: '0.72rem' }}>
                            Chat —{' '}
                            {selectedItemIds.size > 0
                              ? `${selectedItemIds.size} selected item${selectedItemIds.size > 1 ? 's' : ''}`
                              : `all ${integrationItems.length} item${integrationItems.length > 1 ? 's' : ''}`}
                          </Typography>
                        </Box>
                        <Box display="flex" alignItems="center">
                          {chatMessages.length > 0 && (
                            <Tooltip title="Clear conversation">
                              <IconButton size="small" sx={{ p: 0.25, color: '#c7d2fe', '&:hover': { color: '#fff' } }}
                                onClick={() => { setChatMessages([]); setChatError(''); }}>
                                <DeleteSweep sx={{ fontSize: 13 }} />
                              </IconButton>
                            </Tooltip>
                          )}
                          <IconButton size="small" sx={{ p: 0.25, color: '#c7d2fe', '&:hover': { color: '#fff' } }}
                            onClick={() => setChatOpen(false)}>
                            <Close sx={{ fontSize: 13 }} />
                          </IconButton>
                        </Box>
                      </Box>
                      <Box sx={{ px: 1.25, py: 1, maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {chatMessages.length === 0 && !chatSending && (
                          <Box sx={{ textAlign: 'center', py: 2 }}>
                            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.75rem' }}>
                              Ask anything about the{' '}
                              {selectedItemIds.size > 0
                                ? `${selectedItemIds.size} selected item${selectedItemIds.size > 1 ? 's' : ''}`
                                : `${integrationItems.length} linked item${integrationItems.length > 1 ? 's' : ''}`}…
                            </Typography>
                            <Box display="flex" flexWrap="wrap" gap={0.5} justifyContent="center" mt={1.25}>
                              {['Summarize the current status', 'What are the blockers?', 'Who is working on what?', 'What should we do next?'].map(hint => (
                                <Chip key={hint} label={hint} size="small"
                                  onClick={() => setChatInput(hint)}
                                  sx={{ fontSize: '0.66rem', height: 20, cursor: 'pointer', bgcolor: isDark ? 'rgba(99,102,241,0.12)' : '#eff6ff', color: isDark ? '#a5b4fc' : '#4f46e5', '&:hover': { bgcolor: isDark ? 'rgba(99,102,241,0.2)' : '#e0e7ff' } }} />
                              ))}
                            </Box>
                          </Box>
                        )}
                        {chatMessages.map((msg, idx) => (
                          <Box key={idx} display="flex" justifyContent={msg.role === 'user' ? 'flex-end' : 'flex-start'}>
                            <Box sx={{
                              maxWidth: '88%', px: 1.25, py: 0.75,
                              borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                              bgcolor: msg.role === 'user' ? '#6366f1' : '#f1f5f9',
                              color: msg.role === 'user' ? '#fff' : 'text.primary',
                            }}>
                              <Typography variant="caption"
                                sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, display: 'block', fontSize: '0.76rem' }}>
                                {msg.content}
                              </Typography>
                            </Box>
                          </Box>
                        ))}
                        {chatSending && (
                          <Box display="flex" alignItems="center" gap={0.75} pl={0.5}>
                            <CircularProgress size={11} sx={{ color: '#6366f1' }} />
                            <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.72rem' }}>Thinking…</Typography>
                          </Box>
                        )}
                        {chatError && (
                          <Typography variant="caption" color="error.main" sx={{ px: 0.5, fontSize: '0.72rem' }}>{chatError}</Typography>
                        )}
                        <div ref={chatBottomRef} />
                      </Box>
                      <Box sx={{ px: 1.25, pb: 1.25, pt: 0.5, borderTop: '1px solid', borderTopColor: 'divider' }}>
                        <Box display="flex" gap={0.75} alignItems="flex-end">
                          <TextField
                            fullWidth size="small" multiline maxRows={4}
                            placeholder="Ask about these documents… (Enter to send, Shift+Enter for newline)"
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChatMessage(); } }}
                            disabled={chatSending}
                            sx={{ '& textarea': { fontSize: '0.82rem' }, '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
                          />
                          <Tooltip title="Send (Enter)">
                            <span>
                              <IconButton
                                onClick={handleSendChatMessage}
                                disabled={!chatInput.trim() || chatSending}
                                sx={{ p: 1, mb: 0.1, flexShrink: 0, color: '#6366f1', '&:disabled': { color: 'text.disabled' } }}
                              >
                                <Send sx={{ fontSize: 18 }} />
                              </IconButton>
                            </span>
                          </Tooltip>
                        </Box>
                      </Box>
                    </Box>
                  )}

                  {/* Add form */}
                  {showIntForm && (
                    <Box sx={{ p: 1.5, bgcolor: isDark ? 'background.default' : '#f8fafc', borderRadius: 2, border: '1px solid', borderColor: 'divider', mb: 1.5 }}>
                      <Box display="flex" gap={0.75} mb={1.25}>
                        {['JIRA', 'CONFLUENCE'].map(t => (
                          <Box
                            key={t}
                            onClick={() => { setIntAddType(t); setIntInput(''); setIntError(''); }}
                            sx={{
                              px: 1.25, py: 0.4, borderRadius: 1.5, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 600,
                              border: `1.5px solid ${intAddType === t ? '#0052cc' : (isDark ? '#334155' : '#e2e8f0')}`,
                              bgcolor: intAddType === t ? (isDark ? '#1e3a5f' : '#eff6ff') : 'transparent',
                              color: intAddType === t ? (isDark ? '#93c5fd' : '#0052cc') : 'text.secondary',
                              transition: 'all 0.12s',
                            }}
                          >
                            {t === 'JIRA' ? '🔵 JIRA Ticket' : '📄 Confluence Page'}
                          </Box>
                        ))}
                      </Box>
                      <Box display="flex" gap={1} alignItems="flex-start">
                        <TextField
                          autoFocus size="small"
                          placeholder={intAddType === 'JIRA' ? 'e.g. PROJ-123' : 'Page URL or numeric page ID'}
                          value={intInput}
                          onChange={e => setIntInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleAddIntegration(); if (e.key === 'Escape') setShowIntForm(false); }}
                          sx={{ flex: 1, '& input': { fontSize: '0.82rem' } }}
                          inputProps={intAddType === 'JIRA' ? { style: { textTransform: 'uppercase' } } : {}}
                        />
                        <Button size="small" variant="contained" onClick={handleAddIntegration}
                          disabled={intAdding || !intInput.trim()}
                          sx={{ fontSize: '0.78rem', textTransform: 'none', flexShrink: 0 }}>
                          {intAdding ? <CircularProgress size={14} /> : 'Fetch & Link'}
                        </Button>
                        <Button size="small" variant="outlined"
                          onClick={() => { setShowIntForm(false); setIntError(''); }}
                          sx={{ fontSize: '0.78rem', textTransform: 'none', flexShrink: 0 }}>
                          Cancel
                        </Button>
                      </Box>
                      {intError && (
                        <Typography variant="caption" color="error.main" display="block" mt={0.75}>{intError}</Typography>
                      )}
                    </Box>
                  )}

                  {/* ── JIRA Tickets ── */}
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.75} mt={0.5}>
                    <Box display="flex" alignItems="center" gap={0.75}>
                      <Typography variant="caption" fontWeight={700} sx={{ color: '#0052cc' }}>🔵 JIRA Tickets</Typography>
                      {integrationItems.filter(i => i.type === 'JIRA').length > 0 && (
                        <Chip label={integrationItems.filter(i => i.type === 'JIRA').length} size="small"
                          sx={{ height: 16, fontSize: '0.6rem', bgcolor: isDark ? '#1e3a5f' : '#dbeafe', color: isDark ? '#93c5fd' : '#1d4ed8', border: 0 }} />
                      )}
                    </Box>
                    <Button size="small" startIcon={<Add sx={{ fontSize: '13px !important' }} />}
                      onClick={() => { setIntAddType('JIRA'); setShowIntForm(true); setIntError(''); setIntInput(''); }}
                      sx={{ fontSize: '0.72rem', textTransform: 'none', color: '#0052cc', py: 0.25, px: 0.75, minWidth: 0 }}>
                      Ticket
                    </Button>
                  </Box>
                  {integrationItems.filter(i => i.type === 'JIRA').length === 0 && !showIntForm && (
                    <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1.5 }}>
                      No JIRA tickets linked.
                    </Typography>
                  )}
                  <Box display="flex" flexDirection="column" gap={1} mb={0.5}>
                    {integrationItems.filter(i => i.type === 'JIRA').map(renderIntItem)}
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  {/* ── Confluence Pages ── */}
                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.75}>
                    <Box display="flex" alignItems="center" gap={0.75}>
                      <Typography variant="caption" fontWeight={700} sx={{ color: '#0077b6' }}>📄 Confluence Pages</Typography>
                      {integrationItems.filter(i => i.type !== 'JIRA').length > 0 && (
                        <Chip label={integrationItems.filter(i => i.type !== 'JIRA').length} size="small"
                          sx={{ height: 16, fontSize: '0.6rem', bgcolor: isDark ? '#0c4a6e' : '#bae6fd', color: isDark ? '#7dd3fc' : '#0077b6', border: 0 }} />
                      )}
                    </Box>
                    <Button size="small" startIcon={<Add sx={{ fontSize: '13px !important' }} />}
                      onClick={() => { setIntAddType('CONFLUENCE'); setShowIntForm(true); setIntError(''); setIntInput(''); }}
                      sx={{ fontSize: '0.72rem', textTransform: 'none', color: '#0077b6', py: 0.25, px: 0.75, minWidth: 0 }}>
                      Page
                    </Button>
                  </Box>
                  {integrationItems.filter(i => i.type !== 'JIRA').length === 0 && !showIntForm && (
                    <Typography variant="caption" color="text.disabled" sx={{ display: 'block', mb: 1.5 }}>
                      No Confluence pages linked.
                    </Typography>
                  )}
                  <Box display="flex" flexDirection="column" gap={1}>
                    {integrationItems.filter(i => i.type !== 'JIRA').map(renderIntItem)}
                  </Box>

                  {/* AI actions dropdown menu */}
                  <Menu
                    anchorEl={aiMenuAnchor?.el}
                    open={Boolean(aiMenuAnchor)}
                    onClose={() => setAiMenuAnchor(null)}
                    PaperProps={{ sx: { minWidth: 240, py: 0.5 } }}
                  >
                    {AI_ACTIONS.map(a => (
                      <MenuItem
                        key={a.value}
                        sx={{ fontSize: '0.82rem', gap: 1, py: 0.75 }}
                        onClick={() => {
                          const target = integrationItems.find(i => i.id === aiMenuAnchor?.itemId);
                          if (target) handleRunAiAction(target, a.value);
                          setAiMenuAnchor(null);
                        }}
                      >
                        <span style={{ width: 22, display: 'inline-block', textAlign: 'center', fontSize: '1rem' }}>{a.emoji}</span>
                        {a.label}
                      </MenuItem>
                    ))}
                  </Menu>
                </>
              </Box>
            </TabPanel>

            {/* ── COMMENTS ── */}
            <TabPanel value={tab} idx={2}>
              <Box sx={{ px: 3, py: 2.5, display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Comment list — minimised cards */}
                <Box flex={1} mb={2}>
                  {comments.length === 0 ? (
                    <Box textAlign="center" py={4}>
                      <Comment sx={{ fontSize: 36, color: '#e2e8f0', mb: 1 }} />
                      <Typography variant="body2" color="text.disabled">No notes yet</Typography>
                    </Box>
                  ) : (
                    <Box display="flex" flexDirection="column" gap={1}>
                      {comments.map(c => (
                        editingCommentId === c.id ? (
                          <Box key={c.id} sx={{ p: 1.5, borderRadius: 2, border: `1.5px solid ${isDark ? '#4338ca' : '#c7d2fe'}`, bgcolor: isDark ? 'background.paper' : '#fafbff' }}>
                            <Box display="flex" alignItems="center" gap={1} mb={1}>
                              <Avatar sx={{ width: 24, height: 24, fontSize: '0.65rem', bgcolor: '#6366f1' }}>
                                {c.user?.name?.charAt(0) || '?'}
                              </Avatar>
                              <Typography variant="caption" fontWeight={700}>{c.user?.name}</Typography>
                            </Box>
                            <Box sx={{ mb: 1.5 }}>
                              <TipTapEditor
                                content={editingCommentText}
                                onChange={v => setEditingCommentText(v)}
                                placeholder="Edit note…"
                                minHeight={80}
                              />
                            </Box>
                            <Box display="flex" gap={0.75}>
                              <Button size="small" variant="contained" sx={{ borderRadius: 2, textTransform: 'none', bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
                                onClick={() => handleEditComment(c.id)}>Save</Button>
                              <Button size="small" variant="outlined" sx={{ borderRadius: 2, textTransform: 'none' }}
                                onClick={() => setEditingCommentId(null)}>Cancel</Button>
                            </Box>
                          </Box>
                        ) : (
                          <Box
                            key={c.id}
                            onClick={() => setViewComment(c)}
                            sx={{
                              display: 'flex', alignItems: 'flex-start', gap: 1.25,
                              p: 1.25, borderRadius: 2, border: '1px solid', borderColor: isDark ? '#334155' : '#e2e8f0',
                              cursor: 'pointer',
                              '&:hover': { borderColor: isDark ? 'rgba(99,102,241,0.5)' : '#c7d2fe', bgcolor: isDark ? 'rgba(99,102,241,0.1)' : '#fafbff' },
                              '&:hover .note-delete-btn': { opacity: 1 },
                              transition: 'all 0.13s',
                            }}
                          >
                            <Avatar sx={{ width: 26, height: 26, fontSize: '0.68rem', bgcolor: '#6366f1', flexShrink: 0, mt: 0.1 }}>
                              {c.user?.name?.charAt(0) || '?'}
                            </Avatar>
                            <Box flex={1} minWidth={0}>
                              <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.3}>
                                <Typography variant="caption" fontWeight={700} color="text.primary">{c.user?.name}</Typography>
                                <Box display="flex" alignItems="center" gap={0.25}>
                                  {c.user?.id === user?.id && (
                                    <Tooltip title="Delete note">
                                      <IconButton
                                        className="note-delete-btn"
                                        size="small"
                                        onClick={async (e) => {
                                          e.stopPropagation();
                                          if (!window.confirm('Delete this note? This cannot be undone.')) return;
                                          await handleDeleteComment(c.id);
                                        }}
                                        sx={{ opacity: 0, transition: 'opacity 0.15s', p: 0.25, color: '#94a3b8', '&:hover': { color: '#dc2626', bgcolor: isDark ? 'rgba(220,38,38,0.12)' : '#fef2f2' } }}
                                      >
                                        <Delete sx={{ fontSize: 13 }} />
                                      </IconButton>
                                    </Tooltip>
                                  )}
                                  <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0, ml: 0.5 }}>
                                    {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                                  </Typography>
                                </Box>
                              </Box>
                              <Typography variant="caption" color="text.secondary"
                                sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.5 }}>
                                {stripMarkdown(c.content)}
                              </Typography>
                            </Box>
                          </Box>
                        )
                      ))}
                    </Box>
                  )}
                </Box>

                {/* New comment input */}
                <Box sx={{ borderTop: '1px solid', borderTopColor: 'divider', pt: 2 }}>
                  <TipTapEditor
                    key={commentEditorKey}
                    content={commentText}
                    onChange={v => setCommentText(v)}
                    placeholder="Add a note or comment…"
                    minHeight={72}
                    fontSize="0.875rem"
                  />
                  <Box display="flex" justifyContent="flex-end" mt={1}>
                    <Tooltip title="Send (Ctrl+Enter)">
                      <span>
                        <IconButton
                          size="small"
                          onClick={handleSendComment}
                          disabled={sendingComment || !commentText.trim() || commentText === '<p></p>'}
                          color="primary"
                        >
                          {sendingComment ? <CircularProgress size={14} /> : <Send sx={{ fontSize: 16 }} />}
                        </IconButton>
                      </span>
                    </Tooltip>
                  </Box>
                </Box>
              </Box>
            </TabPanel>

            {/* ── ACTIVITY ── */}
            <TabPanel value={tab} idx={3}>
              <Box sx={{ px: 3, py: 2.5 }}>
                {activity.length === 0 ? (
                  <Box textAlign="center" py={4}>
                    <History sx={{ fontSize: 36, color: '#e2e8f0', mb: 1 }} />
                    <Typography variant="body2" color="text.disabled">No activity yet</Typography>
                  </Box>
                ) : (
                  activity.map((log, idx) => (
                    <Box key={log.id} display="flex" gap={1.5} mb={2} sx={{ position: 'relative' }}>
                      {/* Timeline line */}
                      {idx < activity.length - 1 && (
                        <Box sx={{ position: 'absolute', left: 13, top: 28, bottom: -16, width: 1.5, bgcolor: '#e2e8f0' }} />
                      )}
                      <Avatar sx={{ width: 28, height: 28, fontSize: '0.72rem', bgcolor: isDark ? '#1e293b' : '#f1f5f9', color: isDark ? '#94a3b8' : '#64748b', flexShrink: 0, zIndex: 1 }}>
                        {log.user?.name?.charAt(0) || '?'}
                      </Avatar>
                      <Box flex={1} minWidth={0}>
                        <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                          <Typography variant="caption" color="text.secondary">
                            <b>{log.user?.name}</b> {ACTION_LABELS[log.action] || log.action}
                          </Typography>
                          <Typography variant="caption" color="text.disabled" sx={{ flexShrink: 0, ml: 1 }}>
                            {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                          </Typography>
                        </Box>
                        {log.changes && log.action === 'status_changed' && (
                          <Typography variant="caption" color="text.disabled" display="block">
                            → {STATUS_CONFIG[log.changes.status]?.label || log.changes.status}
                          </Typography>
                        )}
                        {log.changes && log.action === 'priority_changed' && (
                          <Typography variant="caption" color="text.disabled" display="block">
                            → {log.changes.priority}
                          </Typography>
                        )}
                        {log.changes && log.action === 'link_added' && (
                          <Typography variant="caption" color="text.disabled" display="block" noWrap>
                            {log.changes.title || log.changes.url}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                  ))
                )}
              </Box>
            </TabPanel>

            {/* ── MEETING NOTES ── */}
            <TabPanel value={tab} idx={4}>
              <Box sx={{ px: 3, py: 2 }}>
                {/* Tab header with Add button */}
                <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.5}>
                  <Typography variant="caption" fontWeight={700} color="text.disabled" letterSpacing={0.5} textTransform="uppercase">
                    Linked Meetings
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    startIcon={<Add sx={{ fontSize: '14px !important' }} />}
                    onClick={() => {
                      setAddNoteSubject('');
                      setAddNoteDate(new Date().toISOString().substring(0, 10));
                      setAddNoteBody('');
                      setAddNoteError(null);
                      setAddNoteOpen(true);
                    }}
                    sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, fontSize: '0.75rem', borderColor: isDark ? '#4338ca' : '#c7d2fe', color: '#6366f1', '&:hover': { bgcolor: isDark ? 'rgba(99,102,241,0.12)' : '#f0f0ff' } }}
                  >
                    Add Note
                  </Button>
                </Box>
                {meetingNotes.length === 0 ? (
                  <Box textAlign="center" py={5}>
                    <EventNote sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
                    <Typography variant="body2" color="text.secondary">No meeting notes linked yet.</Typography>
                    <Typography variant="caption" color="text.disabled">Add notes manually or save emails from the Meeting Notes page.</Typography>
                  </Box>
                ) : (
                  <Box display="flex" flexDirection="column" gap={1.5}>
                    {/* Summarize all button */}
                    <Box display="flex" justifyContent="flex-end">
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={meetingSummaryLoading
                          ? <CircularProgress size={13} sx={{ color: 'inherit' }} />
                          : <AutoFixHigh sx={{ fontSize: '14px !important' }} />}
                        disabled={meetingSummaryLoading}
                        onClick={async () => {
                          setMeetingSummaryLoading(true);
                          setMeetingSummaryError(null);
                          try {
                            const res = await api.post('/ai/summarize-meetings', {
                              initiativeTitle: detail?.title,
                              notes: meetingNotes,
                            });
                            setMeetingSummaryTitle(`All Meetings Summary (${meetingNotes.length})`);
                            setMeetingSummaryText(res.data.summary);
                            setMeetingSummaryOpen(true);
                          } catch (e) {
                            setMeetingSummaryError(e.response?.data?.error || 'Failed to summarize');
                          } finally {
                            setMeetingSummaryLoading(false);
                          }
                        }}
                        sx={{ bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' }, borderRadius: 2, textTransform: 'none', fontWeight: 600, fontSize: '0.78rem' }}
                      >
                        {meetingSummaryLoading ? 'Summarizing…' : `Summarize All (${meetingNotes.length})`}
                      </Button>
                    </Box>
                    {meetingSummaryError && (
                      <Typography variant="caption" color="error.main" sx={{ px: 0.5 }}>{meetingSummaryError}</Typography>
                    )}
                    {meetingNotes.map(note => (
                      <Box
                        key={note.id}
                        onClick={() => {
                          setEditNote(note);
                          setEditNoteSubject(note.subject || '');
                          setEditNoteDate(note.date ? note.date.substring(0, 10) : '');
                          setEditNoteBody(note.body || '');
                          setEditNoteError(null);
                        }}
                        sx={{
                          border: '1px solid', borderColor: isDark ? '#334155' : '#e2e8f0', borderRadius: 2, px: 2, py: 1.5,
                          cursor: 'pointer',
                          '&:hover': { bgcolor: isDark ? 'rgba(99,102,241,0.08)' : '#f8f7ff', borderColor: isDark ? 'rgba(99,102,241,0.4)' : '#c7d2fe' },
                          transition: 'all 0.15s',
                        }}
                      >
                        <Box display="flex" alignItems="flex-start" justifyContent="space-between" gap={1}>
                          <Typography variant="body2" fontWeight={700} color="text.primary" mb={0.4} sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{note.subject}</Typography>
                          <Box display="flex" gap={0.25} sx={{ flexShrink: 0 }}>
                            <Tooltip title="Summarize this note">
                              <IconButton
                                size="small"
                                sx={{ color: '#94a3b8', '&:hover': { color: '#6366f1' }, p: 0.25 }}
                                disabled={summarizingNoteId === note.id}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  setSummarizingNoteId(note.id);
                                  setMeetingSummaryError(null);
                                  try {
                                    const res = await api.post('/ai/summarize-meetings', {
                                      initiativeTitle: detail?.title,
                                      notes: [note],
                                    });
                                    setMeetingSummaryTitle(note.subject || 'Note Summary');
                                    setMeetingSummaryText(res.data.summary);
                                    setMeetingSummaryOpen(true);
                                  } catch (e) {
                                    setMeetingSummaryError(e.response?.data?.error || 'Failed to summarize');
                                  } finally {
                                    setSummarizingNoteId(null);
                                  }
                                }}
                              >
                                {summarizingNoteId === note.id
                                  ? <CircularProgress size={12} />
                                  : <AutoFixHigh sx={{ fontSize: 14 }} />}
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="View note">
                              <IconButton
                                size="small"
                                sx={{ color: '#94a3b8', '&:hover': { color: '#6366f1' }, p: 0.25 }}
                                onClick={(e) => { e.stopPropagation(); setViewNote(note); }}
                              >
                                <Visibility sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Edit">
                              <IconButton
                                size="small"
                                sx={{ color: '#94a3b8', '&:hover': { color: '#6366f1' }, p: 0.25 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditNote(note);
                                  setEditNoteSubject(note.subject || '');
                                  setEditNoteDate(note.date ? note.date.substring(0, 10) : '');
                                  setEditNoteBody(note.body || '');
                                  setEditNoteError(null);
                                }}
                              >
                                <Edit sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Delete note permanently">
                              <IconButton
                                size="small"
                                sx={{ color: '#94a3b8', '&:hover': { color: '#dc2626', bgcolor: isDark ? 'rgba(220,38,38,0.12)' : '#fef2f2' }, p: 0.25 }}
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!window.confirm(`Delete "${note.subject}"? This cannot be undone.`)) return;
                                  try {
                                    await api.delete(`/meeting-notes/${note.id}`);
                                    setMeetingNotes(prev => prev.filter(n => n.id !== note.id));
                                  } catch (e) { console.error(e); }
                                }}
                              >
                                <Delete sx={{ fontSize: 14 }} />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </Box>
                        <Box display="flex" alignItems="center" gap={1.5} flexWrap="wrap">
                          {note.fromEmail && (
                            <Typography variant="caption" color="#6366f1" fontWeight={600} noWrap>{note.fromEmail}</Typography>
                          )}
                          {note.date && (
                            <Typography variant="caption" color="text.disabled">
                              {format(new Date(note.date), 'MMM d, yyyy')}
                            </Typography>
                          )}
                          <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
                            Saved {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true })}
                          </Typography>
                        </Box>
                        {note.body && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', mt: 0.75, lineHeight: 1.5 }}
                          >
                            {note.body}
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            </TabPanel>

          </Box>
        </>
      );

  return (
    <>
    {pageMode ? (
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', bgcolor: 'background.paper', borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
        {innerContent}
      </Box>
    ) : (
      <Drawer
        anchor="right"
        open={open}
        onClose={handleClose}
        PaperProps={{
          sx: {
            width: { xs: '100vw', sm: 480 },
            display: 'flex',
            flexDirection: 'column',
            borderLeft: '1px solid',
            borderColor: 'divider',
            boxShadow: '-4px 0 32px rgba(0,0,0,0.15)',
            bgcolor: 'background.paper',
          }
        }}
      >
        {innerContent}
      </Drawer>
    )}

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
          onKeyDown={e => e.key === 'Enter' && handleQuickCreateUser(newUser => {
            const newAssignees = [...(fullData?.assignees || []), newUser];
            saveField('assigneeIds', newAssignees.map(a => a.id));
            setFullData(prev => prev ? { ...prev, assignees: newAssignees } : prev);
          })}
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
          onClick={() => handleQuickCreateUser(newUser => {
            const newAssignees = [...(fullData?.assignees || []), newUser];
            saveField('assigneeIds', newAssignees.map(a => a.id));
            setFullData(prev => prev ? { ...prev, assignees: newAssignees } : prev);
          })}
        >
          {quickUserSaving ? 'Creating…' : 'Create & Add'}
        </Button>
      </DialogActions>
    </Dialog>

    {/* Quick Summary Dialog */}
    <InitiativeSummaryDialog
      open={summaryOpen}
      onClose={() => setSummaryOpen(false)}
      initiativeId={initiativeId}
      initiativeData={fullData || null}
    />

    {/* View Comment */}
    <Dialog open={!!viewComment} onClose={() => setViewComment(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 0.5 }}>
        <Box display="flex" alignItems="center" gap={1.25}>
          <Avatar sx={{ width: 28, height: 28, fontSize: '0.72rem', bgcolor: '#6366f1' }}>
            {viewComment?.user?.name?.charAt(0) || '?'}
          </Avatar>
          <Box>
            <Typography variant="subtitle2" fontWeight={700}>{viewComment?.user?.name}</Typography>
            <Typography variant="caption" color="text.disabled">
              {viewComment && formatDistanceToNow(new Date(viewComment.createdAt), { addSuffix: true })}
            </Typography>
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <RichText text={viewComment?.content} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" variant="outlined" sx={{ borderRadius: 2, textTransform: 'none' }}
          onClick={() => setViewComment(null)}>Close</Button>
        {viewComment?.user?.id === user?.id && (
          <>
            <Button size="small" variant="outlined" color="error"
              sx={{ borderRadius: 2, textTransform: 'none', ml: 'auto' }}
              onClick={async () => {
                if (!window.confirm('Delete this note? This cannot be undone.')) return;
                await handleDeleteComment(viewComment.id);
                setViewComment(null);
              }}>Delete</Button>
            <Button size="small" variant="contained"
              sx={{ borderRadius: 2, textTransform: 'none', bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
              onClick={() => {
                setEditingCommentId(viewComment.id);
                setEditingCommentText(viewComment.content);
                setViewComment(null);
                setTab(2);
              }}>Edit</Button>
          </>
        )}
      </DialogActions>
    </Dialog>

    {/* Edit Meeting Note */}
    <Dialog open={!!editNote} onClose={() => setEditNote(null)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>Edit Meeting Note</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        {editNoteError && (
          <Typography variant="caption" color="error.main">{editNoteError}</Typography>
        )}
        <TextField
          label="Title / Subject *"
          size="small"
          fullWidth
          autoFocus
          value={editNoteSubject}
          onChange={e => setEditNoteSubject(e.target.value)}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <TextField
          label="Date"
          type="date"
          size="small"
          fullWidth
          value={editNoteDate}
          onChange={e => setEditNoteDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <Box sx={{ position: 'relative' }}>
          <RichEditor
            label="Notes"
            size="small"
            fullWidth
            multiline
            minRows={14}
            maxRows={28}
            value={editNoteBody}
            onChange={e => setEditNoteBody(e.target.value)}
            onSubmit={handleSaveEditNote}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '0 0 8px 8px' } }}
          />
          <Box sx={{ position: 'absolute', bottom: 6, right: 6 }}>
            <RephraseTool text={editNoteBody} onApply={v => setEditNoteBody(v)} />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={() => setEditNote(null)} sx={{ borderRadius: 2, textTransform: 'none' }}>Cancel</Button>
        <Button
          size="small"
          variant="contained"
          disabled={!editNoteSubject.trim() || editNoteSaving}
          onClick={handleSaveEditNote}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
        >
          {editNoteSaving ? 'Saving…' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>

    {/* View Meeting Note */}
    <Dialog open={!!viewNote} onClose={() => setViewNote(null)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', pb: 0.5 }}>
        {viewNote?.subject || 'Meeting Note'}
      </DialogTitle>
      <DialogContent sx={{ pt: '8px !important' }}>
        <Box display="flex" flexWrap="wrap" gap={1.5} mb={2}>
          {viewNote?.fromEmail && (
            <Typography variant="caption" color="#6366f1" fontWeight={600}>{viewNote.fromEmail}</Typography>
          )}
          {viewNote?.date && (
            <Typography variant="caption" color="text.disabled">
              {format(new Date(viewNote.date), 'MMM d, yyyy')}
            </Typography>
          )}
          <Typography variant="caption" color="text.disabled" sx={{ ml: 'auto' }}>
            Saved {viewNote && formatDistanceToNow(new Date(viewNote.createdAt), { addSuffix: true })}
          </Typography>
        </Box>
        {viewNote?.body ? (
          <RichText text={viewNote.body} />
        ) : (
          <Typography variant="body2" color="text.disabled" fontStyle="italic">No content.</Typography>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="outlined" size="small" sx={{ borderRadius: 2, textTransform: 'none' }}
          onClick={() => setViewNote(null)}>Close</Button>
        <Button variant="contained" size="small"
          sx={{ borderRadius: 2, textTransform: 'none', bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
          onClick={() => {
            setEditNote(viewNote);
            setEditNoteSubject(viewNote.subject || '');
            setEditNoteDate(viewNote.date ? viewNote.date.substring(0, 10) : '');
            setEditNoteBody(viewNote.body || '');
            setEditNoteError(null);
            setViewNote(null);
          }}>Edit
        </Button>
      </DialogActions>
    </Dialog>

    {/* Add Meeting Note manually */}
    <Dialog open={addNoteOpen} onClose={() => setAddNoteOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem' }}>Add Meeting Note</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '8px !important' }}>
        {addNoteError && (
          <Typography variant="caption" color="error.main">{addNoteError}</Typography>
        )}
        <TextField
          label="Title / Subject *"
          size="small"
          fullWidth
          autoFocus
          value={addNoteSubject}
          onChange={e => setAddNoteSubject(e.target.value)}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <TextField
          label="Date"
          type="date"
          size="small"
          fullWidth
          value={addNoteDate}
          onChange={e => setAddNoteDate(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
        />
        <Box sx={{ position: 'relative' }}>
          <RichEditor
            label="Notes"
            size="small"
            fullWidth
            multiline
            minRows={5}
            maxRows={14}
            placeholder="Paste or type meeting notes here…"
            value={addNoteBody}
            onChange={e => setAddNoteBody(e.target.value)}
            onSubmit={handleSaveAddNote}
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '0 0 8px 8px' } }}
          />
          <Box sx={{ position: 'absolute', bottom: 6, right: 6 }}>
            <RephraseTool text={addNoteBody} onApply={v => setAddNoteBody(v)} />
          </Box>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button size="small" onClick={() => setAddNoteOpen(false)} sx={{ borderRadius: 2, textTransform: 'none' }}>Cancel</Button>
        <Button
          size="small"
          variant="contained"
          disabled={!addNoteSubject.trim() || addNoteSaving}
          onClick={handleSaveAddNote}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' } }}
        >
          {addNoteSaving ? 'Saving…' : 'Save Note'}
        </Button>
      </DialogActions>
    </Dialog>

    {/* Meetings Summary Dialog */}
    <Dialog open={meetingSummaryOpen} onClose={() => setMeetingSummaryOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
      <DialogTitle sx={{ fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 1 }}>
        <AutoFixHigh sx={{ color: '#6366f1', fontSize: 20 }} />
        {meetingSummaryTitle || 'Meeting Summary'}
      </DialogTitle>
      <DialogContent sx={{ pt: '4px !important' }}>
        <Box
          sx={{
            bgcolor: isDark ? 'background.default' : '#f8fafc', border: '1px solid', borderColor: 'divider', borderRadius: 2,
            px: 2.5, py: 2, whiteSpace: 'pre-wrap', fontFamily: 'inherit',
            fontSize: '0.875rem', lineHeight: 1.7, color: 'text.primary', maxHeight: '60vh', overflowY: 'auto',
          }}
        >
          {meetingSummaryText}
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button size="small" onClick={() => setMeetingSummaryOpen(false)} sx={{ borderRadius: 2, textTransform: 'none' }}>Close</Button>
        <Button
          size="small"
          variant="outlined"
          startIcon={meetingSummaryCopied ? <Done sx={{ fontSize: 14 }} /> : <ContentCopy sx={{ fontSize: 14 }} />}
          onClick={() => {
            navigator.clipboard.writeText(meetingSummaryText);
            setMeetingSummaryCopied(true);
            setTimeout(() => setMeetingSummaryCopied(false), 2000);
          }}
          sx={{ borderRadius: 2, textTransform: 'none', fontWeight: 600, borderColor: '#6366f1', color: '#6366f1' }}
        >
          {meetingSummaryCopied ? 'Copied!' : 'Copy'}
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
}
