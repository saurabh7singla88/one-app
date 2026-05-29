import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  Panel,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { toPng } from 'html-to-image';
import {
  Box,
  Typography,
  Button,
  Chip,
  IconButton,
  Tooltip,
  CircularProgress,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  InputAdornment,
  Avatar,
  Autocomplete,
  Snackbar,
  Alert,
  Menu as MuiMenu,
  MenuItem as MuiMenuItem,
  useTheme,
} from '@mui/material';
import { Add, List as ListIcon, Refresh, Label, PersonAdd, Download, SelectAll, CropFree, AutoFixHigh, Fullscreen, FullscreenExit, ChevronLeft, ChevronRight, FormatListBulleted, Search as SearchIcon } from '@mui/icons-material';
import api from '../api/axios';
import { useNavigate } from 'react-router-dom';
import {
  fetchAllInitiatives,
  updatePosition,
  createInitiative,
} from '../features/initiatives/initiativesSlice';
import MindMapNode from '../components/MindMapNode';
import InitiativeDetailDrawer from '../components/InitiativeDetailDrawer';
import CanvasSelector from '../components/CanvasSelector';

const NODE_TYPES = { initiative: MindMapNode };

const NODE_WIDTH = 260;
const NODE_HEIGHT = 130;
const H_GAP = 90;
const V_GAP = 100;

const STATUS_CONFIG = {
  OPEN:        { label: 'Open',        color: '#475569', bg: '#f1f5f9', dot: '#94a3b8' },
  IN_PROGRESS: { label: 'In Progress', color: '#1d4ed8', bg: '#dbeafe', dot: '#3b82f6' },
  BLOCKED:     { label: 'Blocked',     color: '#b91c1c', bg: '#fee2e2', dot: '#ef4444' },
  ON_HOLD:     { label: 'On Hold',     color: '#b45309', bg: '#fef3c7', dot: '#f59e0b' },
  COMPLETED:   { label: 'Completed',   color: '#065f46', bg: '#d1fae5', dot: '#10b981' },
  CANCELLED:   { label: 'Cancelled',   color: '#6b7280', bg: '#f3f4f6', dot: '#9ca3af' },
};

const PRIORITY_COLORS = {
  CRITICAL: '#dc2626',
  HIGH:     '#d97706',
  MEDIUM:   '#6366f1',
  LOW:      '#94a3b8',
};

// Auto tree layout algorithm
function computeLayout(initiatives) {
  const childrenOf = {};
  initiatives.forEach(init => {
    if (!childrenOf[init.id]) childrenOf[init.id] = [];
    if (init.parentId) {
      if (!childrenOf[init.parentId]) childrenOf[init.parentId] = [];
      if (!childrenOf[init.parentId].includes(init.id)) {
        childrenOf[init.parentId].push(init.id);
      }
    }
  });

  const subtreeWidth = {};
  const computeWidth = (id) => {
    const children = childrenOf[id] || [];
    if (children.length === 0) {
      subtreeWidth[id] = NODE_WIDTH;
      return NODE_WIDTH;
    }
    const total = children.reduce((sum, cid) => sum + computeWidth(cid) + H_GAP, -H_GAP);
    subtreeWidth[id] = Math.max(NODE_WIDTH, total);
    return subtreeWidth[id];
  };

  const roots = initiatives.filter(i => !i.parentId);
  roots.forEach(r => computeWidth(r.id));

  const positions = {};
  const placeNode = (id, x, y) => {
    positions[id] = { x, y };
    const children = childrenOf[id] || [];
    if (!children.length) return;
    const totalW = children.reduce((sum, cid) => sum + (subtreeWidth[cid] || NODE_WIDTH) + H_GAP, -H_GAP);
    let cx = x - totalW / 2;
    children.forEach(cid => {
      const cw = subtreeWidth[cid] || NODE_WIDTH;
      placeNode(cid, cx + cw / 2, y + NODE_HEIGHT + V_GAP);
      cx += cw + H_GAP;
    });
  };

  let rx = 0;
  roots.forEach(r => {
    const rw = subtreeWidth[r.id] || NODE_WIDTH;
    placeNode(r.id, rx + rw / 2, 0);
    rx += rw + H_GAP * 3;
  });

  return positions;
}

// Get all descendant IDs of a collapsed node
function getDescendants(id, childrenOf) {
  const result = new Set();
  const queue = [...(childrenOf[id] || [])];
  while (queue.length) {
    const cur = queue.shift();
    result.add(cur);
    (childrenOf[cur] || []).forEach(c => queue.push(c));
  }
  return result;
}

// Persists across React Router navigations (module-level, one instance).
// Shape: { [canvasKey: string]: { x, y, zoom } }
const savedViewports = {};

function MindMapInner() {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { allItems, allItemsLoading } = useSelector(state => state.initiatives);
  const { activeCanvasId } = useSelector(state => ({ activeCanvasId: state.canvas.activeCanvasId.mindmap }));
  const canvasKey = activeCanvasId ?? 'all';

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [collapsed, setCollapsed] = useState({});
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedInitiativeId, setSelectedInitiativeId] = useState(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'INITIATIVE',
    status: 'OPEN',
    priority: 'MEDIUM',
    tags: [],
    assigneeIds: [],
  });
  const [tagInput, setTagInput] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedRootId, setSelectedRootId] = useState(null);
  const [leftPanelOpen, setLeftPanelOpen] = useState(false);
  const [panelSearch, setPanelSearch] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  const splitPanelRef = useRef(null);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      splitPanelRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const allTags = useMemo(
    () => [...new Set((allItems || []).flatMap(i => i.tags || []))].sort(),
    [allItems]
  );

  const { getNodes, fitView, setViewport } = useReactFlow();
  const initialFitDoneRef = useRef(false);
  // Key = canvasKey:selectedRootId — tracks which view has already been positioned.
  const viewportRestoredRef = useRef(null);
  const prevSelectedRootRef = useRef(undefined);

  // Reset guards when the canvas changes.
  useEffect(() => {
    initialFitDoneRef.current = false;
    viewportRestoredRef.current = null;
    prevSelectedRootRef.current = undefined;
  }, [canvasKey]);

  // Restore / fit viewport after nodes are populated & positioned.
  useEffect(() => {
    if (nodes.length === 0) return;

    const viewKey = `${canvasKey}:${selectedRootId ?? 'all'}`;
    const selectionChanged = prevSelectedRootRef.current !== selectedRootId;
    prevSelectedRootRef.current = selectedRootId;

    // Already handled this exact view — don't re-run unless selection changed
    if (!selectionChanged && viewportRestoredRef.current === viewKey) return;
    viewportRestoredRef.current = viewKey;
    initialFitDoneRef.current = true;

    const saved = savedViewports[viewKey];
    if (saved && !selectionChanged) {
      // Returning to a view the user has panned before — restore their position
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setViewport(saved))
      );
    } else {
      // First visit OR user just drilled into a different initiative — fit nodes
      setTimeout(() => fitView({ padding: 0.06, minZoom: 0.5, maxZoom: 1, duration: 350 }), 150);
    }
  }, [nodes, canvasKey, selectedRootId, setViewport, fitView]);

  // Persist viewport whenever the user finishes panning or zooming
  const onMoveEnd = useCallback((_event, viewport) => {
    savedViewports[`${canvasKey}:${selectedRootId ?? 'all'}`] = viewport;
  }, [canvasKey, selectedRootId]);

  // Quick user create
  const [quickUserOpen, setQuickUserOpen] = useState(false);
  const [quickUserName, setQuickUserName] = useState('');
  const [quickUserRole, setQuickUserRole] = useState('VIEWER');
  const [quickUserSaving, setQuickUserSaving] = useState(false);

  const [exportMsg, setExportMsg] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportMenuAnchor, setExportMenuAnchor] = useState(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState([]);

  const doCapture = async (filterFn = null, nodeIdsForFit = null) => {
    if (nodeIdsForFit) {
      fitView({ nodes: nodeIdsForFit.map(id => ({ id })), padding: 0.2, duration: 300 });
    } else {
      fitView({ padding: 0.15, duration: 300 });
    }
    await new Promise(r => setTimeout(r, 420));
    const rfEl = document.querySelector('.react-flow');
    if (!rfEl) return;
    await toPng(rfEl, {
      backgroundColor: '#f5f6fa',
      pixelRatio: 2,
      filter: node => {
        const cls = node?.classList;
        if (!cls) return true;
        if (cls.contains('react-flow__minimap')) return false;
        if (cls.contains('react-flow__controls')) return false;
        if (cls.contains('react-flow__panel')) return false;
        if (filterFn && !filterFn(node)) return false;
        return true;
      },
    }).then(dataUrl => {
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = nodeIdsForFit ? 'mindmap-selection.png' : 'mindmap.png';
      link.click();
      setExportMsg(nodeIdsForFit ? 'Selection exported!' : 'Image downloaded!');
    }).catch(() => setExportMsg('Export failed. Try again.'));
  };

  const handleExportImage = async () => {
    if (!getNodes().length) return;
    setExportMenuAnchor(null);
    setExporting(true);
    await doCapture();
    setExporting(false);
  };

  const handleExportSelected = async () => {
    const sel = getNodes().filter(n => n.selected);
    if (sel.length === 0) return;
    setExportMenuAnchor(null);
    setExporting(true);
    const selIds = sel.map(n => n.id);
    const selIdSet = new Set(selIds);

    // Remove selection highlight from selected nodes + hide unselected nodes
    setNodes(prev => prev.map(n => {
      if (selIdSet.has(n.id)) return { ...n, selected: false };
      return { ...n, style: { ...n.style, opacity: 0 } };
    }));

    // Hide any edge whose source or target is not in the selection
    setEdges(prev => prev.map(e =>
      selIdSet.has(e.source) && selIdSet.has(e.target)
        ? e
        : { ...e, style: { ...e.style, opacity: 0 } }
    ));

    // Wait for re-render then animate fit
    await new Promise(r => setTimeout(r, 80));
    fitView({ nodes: selIds.map(id => ({ id })), padding: 0.2, duration: 300 });
    await new Promise(r => setTimeout(r, 420));

    const rfEl = document.querySelector('.react-flow');
    if (rfEl) {
      await toPng(rfEl, {
        backgroundColor: '#ffffff',
        pixelRatio: 2,
        filter: node => {
          const cls = node?.classList;
          if (!cls) return true;
          if (cls.contains('react-flow__minimap')) return false;
          if (cls.contains('react-flow__controls')) return false;
          if (cls.contains('react-flow__panel')) return false;
          return true;
        },
      }).then(dataUrl => {
        const link = document.createElement('a');
        link.href = dataUrl;
        link.download = 'mindmap-selection.png';
        link.click();
        setExportMsg('Selection exported!');
      }).catch(() => setExportMsg('Export failed. Try again.'));
    }

    // Restore nodes: re-apply selection, remove opacity override
    setNodes(prev => prev.map(n => {
      if (selIdSet.has(n.id)) return { ...n, selected: true };
      const { opacity, ...rest } = n.style || {}; // eslint-disable-line no-unused-vars
      return { ...n, style: rest };
    }));

    // Restore edges
    setEdges(prev => prev.map(e => {
      if (selIdSet.has(e.source) && selIdSet.has(e.target)) return e;
      const { opacity, ...rest } = e.style || {}; // eslint-disable-line no-unused-vars
      return { ...e, style: rest };
    }));

    setExporting(false);
  };

  const savePositionTimer = useRef({});

  useEffect(() => {
    dispatch(fetchAllInitiatives({ canvasId: activeCanvasId }));
  }, [dispatch, activeCanvasId]);

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

  // Client-side canvas filter (belt-and-suspenders in case API returns stale/unfiltered data)
  const displayItems = useMemo(() => {
    // Exclude standalone tasks — they belong on the Tasks page, not the mind map
    const initiatives = allItems.filter(i => !i.isStandaloneTask);
    // Hide completed/cancelled unless the user opts in
    const statusFiltered = showCompleted
      ? initiatives
      : initiatives.filter(i => i.status !== 'COMPLETED' && i.status !== 'CANCELLED');

    if (!activeCanvasId) return statusFiltered;
    // Include items directly on this canvas plus any descendants
    const inCanvas = new Set(statusFiltered.filter(i => i.canvasId === activeCanvasId).map(i => i.id));
    let changed = true;
    while (changed) {
      changed = false;
      statusFiltered.forEach(i => {
        if (!inCanvas.has(i.id) && i.parentId && inCanvas.has(i.parentId)) {
          inCanvas.add(i.id);
          changed = true;
        }
      });
    }
    return statusFiltered.filter(i => inCanvas.has(i.id));
  }, [allItems, activeCanvasId, showCompleted]);

  // Build children map (memoised)
  const childrenOf = useMemo(() => {
    const map = {};
    displayItems.forEach(i => {
      if (!map[i.id]) map[i.id] = [];
      if (i.parentId) {
        if (!map[i.parentId]) map[i.parentId] = [];
        if (!map[i.parentId].includes(i.id)) map[i.parentId].push(i.id);
      }
    });
    return map;
  }, [displayItems]);

  // Compute hidden nodes (collapsed subtrees)
  const hiddenIds = useMemo(() => {
    const hidden = new Set();
    Object.entries(collapsed).forEach(([id, isCollapsed]) => {
      if (isCollapsed) {
        getDescendants(id, childrenOf).forEach(d => hidden.add(d));
      }
    });
    return hidden;
  }, [collapsed, childrenOf]);

  // ── Per-initiative drill-down ──────────────────────────────────────────────

  // Root-level initiatives for the left panel list
  const rootInitiatives = useMemo(
    () => displayItems.filter(i => !i.parentId),
    [displayItems]
  );

  const filteredRootInitiatives = useMemo(() => {
    if (!panelSearch.trim()) return rootInitiatives;
    const q = panelSearch.toLowerCase();
    return rootInitiatives.filter(i => i.title.toLowerCase().includes(q));
  }, [rootInitiatives, panelSearch]);

  // Spawn a draft node directly on the canvas — Lucidchart-style inline editing.
  // isSibling=true: parentId=parent of source node, sourceNodeId=source node (position ref).
  // isSibling=false: parentId=source node, draft placed below it.
  const spawnDraftNode = useCallback((parentId, priority, sourceNodeId = null, isSibling = false) => {
    const currentNodes = getNodes();
    // Only one draft at a time
    if (currentNodes.some(n => n.id.startsWith('draft-'))) return;

    let pos;
    if (isSibling && sourceNodeId) {
      const src = currentNodes.find(n => n.id === sourceNodeId);
      pos = src
        ? { x: src.position.x + NODE_WIDTH + H_GAP, y: src.position.y }
        : { x: 0, y: 0 };
    } else {
      const parentNode = currentNodes.find(n => n.id === parentId);
      if (!parentNode) return;
      const children = currentNodes.filter(n => n.data?.initiative?.parentId === parentId);
      const rightmost = children.reduce((r, n) => (!r || n.position.x > r.position.x) ? n : r, null);
      pos = {
        x: rightmost ? rightmost.position.x + NODE_WIDTH + H_GAP : parentNode.position.x,
        y: parentNode.position.y + NODE_HEIGHT + V_GAP,
      };
    }

    const draftId = `draft-${Date.now()}`;

    const onConfirm = async (title) => {
      setNodes(nds => nds.filter(n => n.id !== draftId));
      setEdges(eds => eds.filter(e => e.id !== `e-${draftId}`));
      await dispatch(createInitiative({
        title,
        type: parentId ? 'TASK' : 'INITIATIVE',
        status: 'OPEN',
        priority: priority || 'MEDIUM',
        parentId: parentId || null,
        ...(activeCanvasId ? { canvasId: activeCanvasId } : {}),
      }));
      dispatch(fetchAllInitiatives({ canvasId: activeCanvasId }));
    };

    const onCancel = () => {
      setNodes(nds => nds.filter(n => n.id !== draftId));
      setEdges(eds => eds.filter(e => e.id !== `e-${draftId}`));
    };

    setNodes(nds => [...nds, {
      id: draftId, type: 'initiative', position: pos,
      data: { isDraft: true, priority, onConfirm, onCancel },
    }]);

    if (parentId) {
      setEdges(eds => [...eds, {
        id: `e-${draftId}`,
        source: parentId, target: draftId,
        type: 'smoothstep',
        style: { stroke: '#a5b4fc', strokeWidth: 1.5, strokeDasharray: '6,4' },
      }]);
    }
  }, [getNodes, setNodes, setEdges, dispatch, activeCanvasId]);

  // Keyboard shortcuts on selected node: Tab=add child, Enter=add sibling
  const onKeyDown = useCallback((e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const sel = getNodes().find(n => n.selected && !n.id.startsWith('draft-'));
    if (!sel) return;
    const init = sel.data?.initiative;
    if (!init) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      spawnDraftNode(init.id, init.priority, null, false);
    } else if (e.key === 'Enter' && init.parentId) {
      e.preventDefault();
      spawnDraftNode(init.parentId, init.priority, sel.id, true);
    }
  }, [getNodes, spawnDraftNode]);

  // Reset selection when canvas switches
  useEffect(() => { setSelectedRootId(null); }, [activeCanvasId]);

  // Always show exactly one tree: the selected root, or auto-pick the first root
  const selectedDisplayItems = useMemo(() => {
    const effectiveRootId = selectedRootId ?? rootInitiatives[0]?.id;
    if (!effectiveRootId) return [];
    const included = new Set([effectiveRootId]);
    const queue = [effectiveRootId];
    while (queue.length) {
      const cur = queue.shift();
      (childrenOf[cur] || []).forEach(cid => { included.add(cid); queue.push(cid); });
    }
    return displayItems.filter(i => included.has(i.id));
  }, [selectedRootId, rootInitiatives, displayItems, childrenOf]);

  const autoArrange = useCallback(() => {
    if (!selectedDisplayItems.length) return;

    // Snapshot current live positions from React Flow (respects unsaved drags too)
    const livePos = {};
    nodes.forEach(n => { livePos[n.id] = { x: n.position.x, y: n.position.y }; });

    const newPositions = {};

    // Process each parent's children:
    //   - Snap Y to parent.y + NODE_HEIGHT + V_GAP (clean depth alignment)
    //   - Blend X: 60% user position + 40% ideal center-under-parent
    //   - Resolve any remaining sibling overlaps with minimal rightward nudge
    //   - Roots are NEVER moved
    const processChildren = (parentId, parentPos) => {
      const children = childrenOf[parentId] || [];
      if (!children.length) return;

      const targetY = parentPos.y + NODE_HEIGHT + V_GAP;
      const parentCenterX = parentPos.x + NODE_WIDTH / 2;
      const totalW = children.length * NODE_WIDTH + (children.length - 1) * H_GAP;
      const idealStartX = parentCenterX - totalW / 2;

      // Sort siblings by current X to preserve the user's left-right order
      const sorted = [...children].sort((a, b) =>
        (livePos[a]?.x ?? 0) - (livePos[b]?.x ?? 0)
      );

      // Gently blend each child's X toward its ideal slot
      let blended = sorted.map((id, i) => {
        const userX = livePos[id]?.x ?? (idealStartX + i * (NODE_WIDTH + H_GAP));
        const idealX = idealStartX + i * (NODE_WIDTH + H_GAP);
        return { id, x: Math.round(userX * 0.6 + idealX * 0.4) };
      });

      // Re-sort blended positions and de-overlap (nudge right only if too close)
      blended.sort((a, b) => a.x - b.x);
      for (let i = 1; i < blended.length; i++) {
        const minX = blended[i - 1].x + NODE_WIDTH + H_GAP;
        if (blended[i].x < minX) blended[i].x = minX;
      }

      blended.forEach(({ id, x }) => {
        const newPos = { x, y: Math.round(targetY) };
        newPositions[id] = newPos;
        livePos[id] = newPos; // use updated pos for grandchildren
        processChildren(id, newPos);
      });
    };

    selectedDisplayItems.filter(i => !i.parentId).forEach(root => {
      processChildren(root.id, livePos[root.id] || { x: 0, y: 0 });
    });

    if (!Object.keys(newPositions).length) return;

    setNodes(prev => prev.map(n => ({
      ...n,
      position: newPositions[n.id] || n.position,
    })));

    Object.entries(newPositions).forEach(([id, pos]) => {
      dispatch(updatePosition({ id, positionX: pos.x, positionY: pos.y }));
    });

    if (!initialFitDoneRef.current) {
      setTimeout(() => fitView({ padding: 0.18, duration: 450 }), 120);
      initialFitDoneRef.current = true;
    }
  }, [nodes, selectedDisplayItems, childrenOf, dispatch, fitView]);

  // Build React Flow nodes + edges
  useEffect(() => {
    if (!selectedDisplayItems.length) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const autoPositions = computeLayout(selectedDisplayItems);

    const handleToggleCollapse = (id) => {
      setCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleOpenDetails = (initiative) => {
      setSelectedInitiativeId(initiative.id);
      setDetailsOpen(true);
    };

    // Node-level add child/sibling → spawn draft node inline on canvas
    const handleAddChild = (nodeId, priority) => {
      spawnDraftNode(nodeId, priority, null, false);
    };

    const handleAddSibling = (parentId, sourceNodeId, priority) => {
      spawnDraftNode(parentId, priority, sourceNodeId, true);
    };

    const rfNodes = selectedDisplayItems
      .filter(i => !hiddenIds.has(i.id))
      .map(initiative => {
        const savedPos = initiative.positionX != null && initiative.positionY != null;
        let pos;
        if (savedPos) {
          pos = { x: initiative.positionX, y: initiative.positionY };
        } else if (initiative.parentId) {
          // Place near parent if parent has a saved position
          const parent = selectedDisplayItems.find(p => p.id === initiative.parentId);
          if (parent && parent.positionX != null && parent.positionY != null) {
            const placedSiblings = selectedDisplayItems.filter(
              s => s.parentId === initiative.parentId && s.positionX != null && s.id !== initiative.id
            );
            const offsetX = placedSiblings.length * (NODE_WIDTH + H_GAP);
            pos = { x: parent.positionX + offsetX, y: parent.positionY + NODE_HEIGHT + V_GAP };
          } else {
            pos = autoPositions[initiative.id] || { x: 0, y: 0 };
          }
        } else {
          pos = autoPositions[initiative.id] || { x: 0, y: 0 };
        }

        return {
          id: initiative.id,
          type: 'initiative',
          position: pos,
          data: {
            initiative,
            isCollapsed: !!collapsed[initiative.id],
            onToggleCollapse: handleToggleCollapse,
            onOpenDetails: handleOpenDetails,
            onAddChild: handleAddChild,
            onAddSibling: handleAddSibling,
          }
        };
      });

    const rfEdges = selectedDisplayItems
      .filter(i => i.parentId && !hiddenIds.has(i.id) && !hiddenIds.has(i.parentId))
      .map(initiative => ({
        id: `e-${initiative.parentId}-${initiative.id}`,
        source: initiative.parentId,
        target: initiative.id,
        type: 'smoothstep',
        style: { stroke: '#c7d2fe', strokeWidth: 1.5, opacity: 0.85 },
        animated: initiative.status === 'IN_PROGRESS',
        markerEnd: { type: 'arrowclosed', width: 10, height: 10, color: '#c7d2fe' }
      }));

    setNodes(rfNodes);
    setEdges(rfEdges);
  }, [selectedDisplayItems, collapsed, hiddenIds]);

  const onNodeDragStop = useCallback((_, node, draggedNodes) => {
    // Save positions for all nodes that moved (supports group drag)
    const toSave = draggedNodes?.length > 1 ? draggedNodes : [node];
    toSave.forEach(n => {
      if (savePositionTimer.current[n.id]) clearTimeout(savePositionTimer.current[n.id]);
      savePositionTimer.current[n.id] = setTimeout(() => {
        dispatch(updatePosition({
          id: n.id,
          positionX: n.position.x,
          positionY: n.position.y
        }));
      }, 500);
    });
  }, [dispatch]);

  const onNodeDoubleClick = useCallback((_, node) => {
    setSelectedInitiativeId(node.data.initiative.id);
    setDetailsOpen(true);
  }, []);

  const handleCreateSubmit = async () => {
    await dispatch(createInitiative({ ...formData, parentId: createParentId, ...(activeCanvasId ? { canvasId: activeCanvasId } : {}) }));
    setCreateDialogOpen(false);
    setFormData({ title: '', description: '', type: 'INITIATIVE', status: 'OPEN', priority: 'MEDIUM', tags: [], assigneeIds: [] });
    setTagInput('');
    dispatch(fetchAllInitiatives({ canvasId: activeCanvasId }));
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

  if (allItemsLoading && !allItems.length) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="80vh">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ height: 'calc(100vh - 58px)', display: 'flex', flexDirection: 'column' }}>
      <CanvasSelector screen="mindmap" />

      {/* ── FULL-WIDTH CANVAS ────────────────────────────────────────────── */}
      <Box
        ref={splitPanelRef}
        sx={{ flex: 1, position: 'relative', overflow: 'hidden', borderRadius: isFullscreen ? 0 : 3, ...(isFullscreen ? { height: '100vh', width: '100vw' } : {}) }}
      >
        {/* Canvas fills entire container */}
        <Box sx={{ position: 'absolute', inset: 0 }} onKeyDown={onKeyDown} tabIndex={-1}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={NODE_TYPES}
            onNodeDragStop={onNodeDragStop}
            onNodeDoubleClick={onNodeDoubleClick}
            onSelectionChange={({ nodes: sel }) => setSelectedNodeIds((sel || []).map(n => n.id))}
            selectionOnDrag
            panOnDrag={[1, 2]}
            multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
            selectionKeyCode={null}
            onMoveEnd={onMoveEnd}
            minZoom={0.08}
            maxZoom={2}
            defaultEdgeOptions={{ type: 'smoothstep' }}
            style={{ background: isDark ? '#0f172a' : '#f5f6fa' }}
          >
            <Background variant="dots" color={isDark ? '#334155' : '#c7d2fe'} gap={28} size={1.5} />
            <Controls
              style={{ boxShadow: '0 2px 12px rgba(0,0,0,0.1)', borderRadius: 10, border: '1px solid #e2e8f0', overflow: 'hidden' }}
            />
            <MiniMap
              nodeColor={(node) => STATUS_CONFIG[node.data?.initiative?.status]?.dot || '#94a3b8'}
              maskColor="rgba(99,102,241,0.06)"
              style={{ borderRadius: 10, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
            />

            {/* Top-left: panel toggle + new initiative */}
            <Panel position="top-left">
              <Box display="flex" gap={0.75} alignItems="center">
                <Tooltip title={leftPanelOpen ? 'Close panel' : 'Open initiatives panel'} placement="right">
                  <IconButton
                    onClick={() => setLeftPanelOpen(v => !v)}
                    size="small"
                    sx={{
                      bgcolor: leftPanelOpen ? '#6366f1' : (isDark ? 'background.paper' : 'white'),
                      color: leftPanelOpen ? 'white' : 'text.secondary',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                      border: `1px solid ${theme.palette.divider}`,
                      '&:hover': { bgcolor: leftPanelOpen ? '#4f46e5' : (isDark ? 'rgba(255,255,255,0.08)' : '#f5f5f5') },
                    }}
                  >
                    <FormatListBulleted fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="New initiative" placement="right">
                  <IconButton
                    onClick={() => {
                      setCreateParentId(null);
                      setFormData({ title: '', description: '', type: 'INITIATIVE', status: 'OPEN', priority: 'MEDIUM', tags: [], assigneeIds: [] });
                      setTagInput('');
                      setCreateDialogOpen(true);
                    }}
                    size="small"
                    sx={{ bgcolor: isDark ? 'background.paper' : 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', border: `1px solid ${theme.palette.divider}`, '&:hover': { bgcolor: isDark ? 'rgba(255,255,255,0.08)' : '#f5f5f5' } }}
                  >
                    <Add fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            </Panel>

            {/* Top-right: action toolbar */}
            <Panel position="top-right">
              <Box
                display="flex" gap={0.75} alignItems="center"
                sx={{ bgcolor: isDark ? 'rgba(30,41,59,0.92)' : 'rgba(255,255,255,0.92)', backdropFilter: 'blur(8px)', border: `1px solid ${theme.palette.divider}`, borderRadius: 2.5, px: 1, py: 0.75, boxShadow: '0 2px 12px rgba(0,0,0,0.08)' }}
              >
                <Chip
                  label={showCompleted ? 'Showing all' : 'Active only'}
                  size="small"
                  onClick={() => setShowCompleted(v => !v)}
                  color={showCompleted ? 'primary' : 'default'}
                  variant={showCompleted ? 'filled' : 'outlined'}
                  sx={{ cursor: 'pointer', fontWeight: 500, height: 26 }}
                />
                <Tooltip title="Export as image">
                  <span>
                    <IconButton
                      onClick={e => setExportMenuAnchor(e.currentTarget)}
                      disabled={exporting}
                      size="small"
                      sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5, color: 'text.secondary' }}
                    >
                      {exporting ? <CircularProgress size={16} /> : <Download fontSize="small" />}
                    </IconButton>
                  </span>
                </Tooltip>
                <MuiMenu
                  anchorEl={exportMenuAnchor}
                  open={Boolean(exportMenuAnchor)}
                  onClose={() => setExportMenuAnchor(null)}
                  PaperProps={{ sx: { borderRadius: 2, minWidth: 200, boxShadow: '0 4px 20px rgba(0,0,0,0.12)' } }}
                >
                  <MuiMenuItem dense onClick={handleExportImage} sx={{ gap: 1.5 }}>
                    <SelectAll sx={{ fontSize: 18, color: 'text.secondary' }} />
                    <Box>
                      <Typography variant="body2" fontWeight={500}>Export all</Typography>
                      <Typography variant="caption" color="text.secondary">Save entire mind map</Typography>
                    </Box>
                  </MuiMenuItem>
                  <MuiMenuItem dense onClick={handleExportSelected} disabled={selectedNodeIds.length === 0} sx={{ gap: 1.5 }}>
                    <CropFree sx={{ fontSize: 18, color: 'text.secondary' }} />
                    <Box>
                      <Typography variant="body2" fontWeight={500}>
                        Export selected{selectedNodeIds.length > 0 ? ` (${selectedNodeIds.length})` : ''}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {selectedNodeIds.length === 0 ? 'Select nodes first' : 'Save selected nodes only'}
                      </Typography>
                    </Box>
                  </MuiMenuItem>
                </MuiMenu>
                <Tooltip title="Auto-arrange">
                  <IconButton onClick={autoArrange} size="small" sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5, color: 'text.secondary' }}>
                    <AutoFixHigh fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Refresh">
                  <IconButton onClick={() => dispatch(fetchAllInitiatives({ canvasId: activeCanvasId }))} size="small" sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5, color: 'text.secondary' }}>
                    <Refresh fontSize="small" />
                  </IconButton>
                </Tooltip>
                <Tooltip title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                  <IconButton onClick={toggleFullscreen} size="small" sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5, color: isFullscreen ? '#6366f1' : 'text.secondary' }}>
                    {isFullscreen ? <FullscreenExit fontSize="small" /> : <Fullscreen fontSize="small" />}
                  </IconButton>
                </Tooltip>
                <Button variant="outlined" size="small" startIcon={<ListIcon />} onClick={() => navigate('/initiatives')}>
                  List
                </Button>
              </Box>
            </Panel>

            {/* Bottom hint */}
            <Panel position="bottom-center">
              <Box sx={{ bgcolor: isDark ? 'rgba(30,41,59,0.88)' : 'rgba(255,255,255,0.88)', backdropFilter: 'blur(6px)', border: `1px solid ${theme.palette.divider}`, borderRadius: 6, px: 1.75, py: 0.5 }}>
                <Typography variant="caption" color="text.disabled">Drag to pan · scroll to zoom · double-click to open</Typography>
              </Box>
            </Panel>

            {/* Status + priority legend */}
            <Panel position="bottom-left">
              <Box
                display="flex" gap={1} flexWrap="wrap" alignItems="center"
                sx={{ bgcolor: isDark ? 'rgba(30,41,59,0.88)' : 'rgba(255,255,255,0.88)', backdropFilter: 'blur(6px)', border: `1px solid ${theme.palette.divider}`, borderRadius: 2, px: 1.5, py: 0.75, maxWidth: 420 }}
              >
                {Object.entries(STATUS_CONFIG).map(([status, cfg]) => (
                  <Box key={status} display="flex" alignItems="center" gap={0.5}>
                    <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: cfg.dot }} />
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>{cfg.label}</Typography>
                  </Box>
                ))}
                <Divider orientation="vertical" flexItem sx={{ mx: 0.5 }} />
                {Object.entries(PRIORITY_COLORS).map(([p, color]) => (
                  <Box key={p} display="flex" alignItems="center" gap={0.4}>
                    <Box sx={{ width: 3, height: 12, bgcolor: color, borderRadius: 1 }} />
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>{p.charAt(0) + p.slice(1).toLowerCase()}</Typography>
                  </Box>
                ))}
              </Box>
            </Panel>

            {allItems.length === 0 && (
              <Panel position="top-center">
                <Box sx={{ bgcolor: 'white', p: 3, borderRadius: 3, boxShadow: '0 4px 20px rgba(0,0,0,0.1)', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                  <Typography variant="body2" color="text.secondary" mb={1.5}>No initiatives yet.</Typography>
                  <Button variant="contained" size="small" startIcon={<Add />} onClick={() => setCreateDialogOpen(true)}>
                    Create First Initiative
                  </Button>
                </Box>
              </Panel>
            )}
          </ReactFlow>
        </Box>

        {/* ── FLOATING INITIATIVES PANEL ───────────────────────────────────── */}
        {leftPanelOpen && (
          <Box
            sx={{
              position: 'absolute', top: 0, left: 0, bottom: 0, width: 290, zIndex: 20,
              bgcolor: 'background.paper', boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
              display: 'flex', flexDirection: 'column', overflow: 'hidden',
              borderRight: `1px solid ${theme.palette.divider}`,
            }}
          >
            {/* Panel header */}
            <Box sx={{ px: 2, pt: 2, pb: 1.5 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="subtitle1" fontWeight={700}>Initiatives</Typography>
                <Tooltip title="Close panel">
                  <IconButton size="small" onClick={() => setLeftPanelOpen(false)} sx={{ color: 'text.secondary' }}>
                    <ChevronLeft fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              <TextField
                size="small"
                fullWidth
                placeholder="Search…"
                value={panelSearch}
                onChange={e => setPanelSearch(e.target.value)}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 16, color: 'text.disabled' }} /></InputAdornment>,
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: 2 } }}
              />
            </Box>
            <Divider />

            {/* "All" row */}
            <Box
              onClick={() => setSelectedRootId(null)}
              sx={{
                px: 2, py: 1.5, cursor: 'pointer',
                borderLeft: selectedRootId === null ? '3px solid #6366f1' : '3px solid transparent',
                bgcolor: selectedRootId === null ? (isDark ? 'rgba(99,102,241,0.15)' : '#f5f3ff') : 'transparent',
                '&:hover': { bgcolor: selectedRootId === null ? (isDark ? 'rgba(99,102,241,0.15)' : '#f5f3ff') : (isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc') },
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}
            >
              <Typography variant="body2" fontWeight={600} color={selectedRootId === null ? '#4f46e5' : 'text.primary'}>
                All initiatives
              </Typography>
              <Typography variant="caption" color="text.disabled">{displayItems.length}</Typography>
            </Box>
            <Divider />

            {/* Root initiatives list */}
            <Box sx={{ flex: 1, overflowY: 'auto' }}>
              {filteredRootInitiatives.length === 0 && panelSearch && (
                <Typography variant="caption" color="text.disabled" sx={{ display: 'block', p: 2 }}>
                  No results for "{panelSearch}"
                </Typography>
              )}
              {filteredRootInitiatives.map(init => {
                const isActive = selectedRootId === init.id;
                const childCount = (childrenOf[init.id] || []).length;
                return (
                  <Box
                    key={init.id}
                    onClick={() => setSelectedRootId(init.id)}
                    sx={{
                      px: 2, py: 1.25, cursor: 'pointer',
                      borderLeft: isActive ? '3px solid #6366f1' : '3px solid transparent',
                      bgcolor: isActive ? (isDark ? 'rgba(99,102,241,0.15)' : '#f5f3ff') : 'transparent',
                      borderBottom: `1px solid ${theme.palette.divider}`,
                      '&:hover': { bgcolor: isActive ? (isDark ? 'rgba(99,102,241,0.15)' : '#f5f3ff') : (isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc') },
                      display: 'flex', alignItems: 'flex-start', gap: 1,
                    }}
                  >
                    <Box sx={{ mt: 0.6, width: 7, height: 7, borderRadius: '50%', bgcolor: STATUS_CONFIG[init.status]?.dot || '#94a3b8', flexShrink: 0 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" fontWeight={isActive ? 600 : 500} color={isActive ? '#4f46e5' : 'text.primary'} noWrap>
                        {init.title}
                      </Typography>
                      <Box display="flex" alignItems="center" gap={0.75} mt={0.25}>
                        <Box sx={{ width: 3, height: 10, bgcolor: PRIORITY_COLORS[init.priority] || '#94a3b8', borderRadius: 1 }} />
                        <Typography variant="caption" color="text.disabled" sx={{ fontSize: '0.68rem' }}>
                          {init.priority?.charAt(0) + init.priority?.slice(1).toLowerCase()}
                          {childCount > 0 && ` · ${childCount} child${childCount !== 1 ? 'ren' : ''}`}
                        </Typography>
                      </Box>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        )}
      </Box>

      {/* Detail Drawer (full tabs: Overview, Links, Comments, Activity) */}
      <InitiativeDetailDrawer
        open={detailsOpen}
        initiativeId={selectedInitiativeId}
        onClose={() => setDetailsOpen(false)}
      />

      {/* Create Initiative Dialog */}
      <Dialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ pb: 1, fontWeight: 700 }}>
          {createParentId ? 'Add Child Item' : 'New Initiative'}
        </DialogTitle>
        <Divider />
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 0.5 }}>
            <TextField
              fullWidth
              label="Title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              autoFocus
            />
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
            <Box display="flex" gap={2}>
              <FormControl fullWidth size="small">
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
              <FormControl fullWidth size="small">
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
            </Box>
            {users.length > 0 && (
              <FormControl fullWidth size="small">
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
                    setFormData(f => ({ ...f, assigneeIds: v }));
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
            )}
            <Box>
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
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateDialogOpen(false)} variant="outlined">Cancel</Button>
          <Button onClick={handleCreateSubmit} variant="contained" disabled={!formData.title.trim()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>
      {/* Export feedback */}
      <Snackbar
        open={!!exportMsg}
        autoHideDuration={3000}
        onClose={() => setExportMsg('')}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setExportMsg('')} sx={{ width: '100%' }}>{exportMsg}</Alert>
      </Snackbar>

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

export default function MindMap() {
  return (
    <ReactFlowProvider>
      <MindMapInner />
    </ReactFlowProvider>
  );
}
