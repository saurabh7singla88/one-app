import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position } from 'reactflow';
import { Box, Typography, LinearProgress, IconButton, Tooltip, useTheme } from '@mui/material';
import { ExpandMore, ExpandLess, OpenInNew, Add } from '@mui/icons-material';

// Draft node — appears directly on canvas when user clicks "+".
// useEffect focuses the input after ReactFlow settles; Enter=save, Esc=cancel, blur=save if non-empty.
function DraftNode({ data }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const inputRef = useRef(null);
  const confirmed = useRef(false);

  // ReactFlow steals focus when a new node is mounted — delay to win it back
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, []);

  const commit = () => {
    if (confirmed.current) return;
    const v = inputRef.current?.value.trim();
    if (v) { confirmed.current = true; data.onConfirm(v); }
    else data.onCancel();
  };

  const handleKey = (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { data.onCancel(); return; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); commit(); }
  };

  return (
    <Box sx={{
      position: 'relative',
      bgcolor: isDark ? 'rgba(99,102,241,0.15)' : '#f5f3ff',
      border: '2px dashed #818cf8',
      borderRadius: '12px',
      p: '11px 12px 10px',
      minWidth: 190,
      maxWidth: 250,
      boxShadow: '0 0 0 6px rgba(99,102,241,0.10)',
      animation: 'mmFadeIn 0.13s ease',
      '@keyframes mmFadeIn': { from: { opacity: 0, transform: 'scale(0.93)' }, to: { opacity: 1, transform: 'scale(1)' } },
    }}>
      <Handle type="target" position={Position.Top} style={{ background: 'transparent', border: 'none' }} />
      <input
        ref={inputRef}
        className="nodrag"
        placeholder="Type a title…"
        onKeyDown={handleKey}
        onBlur={commit}
        style={{
          width: '100%', border: 'none', outline: 'none',
          background: 'transparent', fontSize: '0.84rem', fontWeight: 600,
          color: isDark ? '#f1f5f9' : '#1e293b', fontFamily: 'inherit', lineHeight: 1.4,
          letterSpacing: '-0.01em', padding: 0,
        }}
      />
      <Typography sx={{ color: '#a5b4fc', fontSize: '0.62rem', mt: 0.75, display: 'block' }}>
        Enter to save · Esc to cancel
      </Typography>
      <Handle type="source" position={Position.Bottom} style={{ background: 'transparent', border: 'none' }} />
    </Box>
  );
}

// Floating "+" button — visibility driven by React state (hovered prop), not CSS class
function AddBtn({ placement, onClick, tooltip, visible }) {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const isBottom = placement === 'bottom';
  return (
    <Tooltip title={tooltip} placement={placement} arrow>
      <IconButton
        size="small"
        onMouseDown={(e) => e.stopPropagation()} // prevent ReactFlow drag
        onClick={(e) => { e.stopPropagation(); onClick(e); }}
        sx={{
          position: 'absolute',
          ...(isBottom
            ? { bottom: -14, left: '50%', transform: visible ? 'translateX(-50%) scale(1)' : 'translateX(-50%) scale(0.7)' }
            : { right: -14, top: '50%', transform: visible ? 'translateY(-50%) scale(1)' : 'translateY(-50%) scale(0.7)' }
          ),
          width: 24, height: 24,
          opacity: visible ? 1 : 0,
          pointerEvents: visible ? 'auto' : 'none',
          transition: 'opacity 0.14s, transform 0.14s',
          ...(isBottom
            ? { background: 'linear-gradient(135deg, #6366f1, #818cf8)', color: 'white', border: '2px solid white', boxShadow: '0 2px 8px rgba(99,102,241,0.45)' }
            : { bgcolor: isDark ? 'background.paper' : 'white', color: '#6366f1', border: '1.5px solid #c7d2fe', boxShadow: '0 2px 6px rgba(0,0,0,0.1)' }
          ),
          zIndex: 20,
          '&:hover': isBottom
            ? { background: 'linear-gradient(135deg, #4f46e5, #6366f1)', transform: 'translateX(-50%) scale(1.18)' }
            : { bgcolor: isDark ? 'rgba(99,102,241,0.15)' : '#eff6ff', border: '1.5px solid #6366f1', transform: 'translateY(-50%) scale(1.18)' },
        }}
      >
        <Add sx={{ fontSize: 13 }} />
      </IconButton>
    </Tooltip>
  );
}

const STATUS_CONFIG = {
  OPEN:        { label: 'Open',        color: '#475569', bg: '#f1f5f9', border: '#94a3b8' },
  IN_PROGRESS: { label: 'In Progress', color: '#1d4ed8', bg: '#dbeafe', border: '#3b82f6' },
  BLOCKED:     { label: 'Blocked',     color: '#b91c1c', bg: '#fee2e2', border: '#ef4444' },
  ON_HOLD:     { label: 'On Hold',     color: '#b45309', bg: '#fef3c7', border: '#f59e0b' },
  COMPLETED:   { label: 'Completed',   color: '#065f46', bg: '#d1fae5', border: '#10b981' },
  CANCELLED:   { label: 'Cancelled',   color: '#6b7280', bg: '#f3f4f6', border: '#9ca3af' },
};

const PRIORITY_COLORS = {
  CRITICAL: '#dc2626',
  HIGH:     '#d97706',
  MEDIUM:   '#6366f1',
  LOW:      '#94a3b8',
};

function MindMapNode({ data, selected }) {
  // Render inline-edit draft node when spawned from canvas
  if (data.isDraft) return <DraftNode data={data} />;

  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';
  const [hovered, setHovered] = useState(false);
  const showActions = hovered || selected;

  const { initiative, onToggleCollapse, isCollapsed, onOpenDetails, onAddChild, onAddSibling } = data;
  const hasChildren = (initiative._count?.children ?? 0) > 0;
  const canAddSibling = !!initiative.parentId;
  const sc = STATUS_CONFIG[initiative.status] || STATUS_CONFIG.OPEN;
  const priorityColor = PRIORITY_COLORS[initiative.priority] || '#94a3b8';

  return (
    <Box
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      sx={{
        position: 'relative',
        bgcolor: isDark ? 'rgba(30,41,59,0.98)' : 'rgba(255,255,255,0.98)',
        border: `1.5px solid ${selected ? '#6366f1' : hovered ? 'rgba(99,102,241,0.35)' : (isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)')}`,
        borderLeft: `4px solid ${priorityColor}`,
        borderRadius: '12px',
        p: '11px 12px 10px',
        minWidth: 190,
        maxWidth: 250,
        boxShadow: selected
          ? '0 0 0 3px rgba(99,102,241,0.18), 0 6px 20px rgba(0,0,0,0.13)'
          : hovered ? '0 4px 16px rgba(0,0,0,0.11)' : '0 2px 8px rgba(0,0,0,0.07)',
        userSelect: 'none',
        transition: 'box-shadow 0.15s, border-color 0.15s',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: 'transparent', border: 'none' }} />

      {/* Title row */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={0.5}>
        <Typography
          fontWeight={600}
          sx={{ wordBreak: 'break-word', flex: 1, lineHeight: 1.4, fontSize: '0.84rem', color: 'text.primary', letterSpacing: '-0.01em' }}
        >
          {initiative.title}
        </Typography>
        {/* Action icons — fade in on hover/select */}
        <Box display="flex" alignItems="center" sx={{ flexShrink: 0, ml: 0.5, mt: -0.25, opacity: showActions ? 1 : 0, transition: 'opacity 0.14s' }}>
          {hasChildren && (
            <Tooltip title={isCollapsed ? 'Expand' : 'Collapse'} arrow>
              <IconButton
                size="small"
                onClick={(e) => { e.stopPropagation(); onToggleCollapse(initiative.id); }}
                sx={{ p: 0.3, color: '#94a3b8', '&:hover': { color: '#6366f1', bgcolor: isDark ? 'rgba(99,102,241,0.15)' : '#eff6ff' }, borderRadius: 1 }}
              >
                {isCollapsed ? <ExpandMore sx={{ fontSize: 14 }} /> : <ExpandLess sx={{ fontSize: 14 }} />}
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title="Open details (dbl-click)" arrow>
            <IconButton
              size="small"
              onClick={(e) => { e.stopPropagation(); onOpenDetails(initiative); }}
              sx={{ p: 0.3, color: '#cbd5e1', '&:hover': { color: '#6366f1', bgcolor: isDark ? 'rgba(99,102,241,0.15)' : '#eff6ff' }, borderRadius: 1 }}
            >
              <OpenInNew sx={{ fontSize: 12 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {/* Status + priority pills */}
      <Box display="flex" gap={0.5} mt={0.75} flexWrap="wrap" alignItems="center">
        <Box
          sx={{
            display: 'inline-flex', alignItems: 'center', gap: 0.4,
            bgcolor: isDark ? `${sc.border}28` : sc.bg, color: isDark ? sc.border : sc.color, fontWeight: 600, fontSize: '0.64rem',
            px: 0.8, py: 0.2, borderRadius: '20px', lineHeight: 1.6,
          }}
        >
          <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: sc.border, flexShrink: 0 }} />
          {sc.label}
        </Box>
        <Box
          sx={{
            display: 'inline-flex', alignItems: 'center',
            bgcolor: `${priorityColor}14`, color: priorityColor, fontWeight: 600, fontSize: '0.64rem',
            px: 0.8, py: 0.2, borderRadius: '20px', lineHeight: 1.6,
          }}
        >
          {initiative.priority.charAt(0) + initiative.priority.slice(1).toLowerCase()}
        </Box>
      </Box>

      {/* Tags (max 3) */}
      {initiative.tags?.length > 0 && (
        <Box display="flex" gap={0.4} mt={0.6} flexWrap="wrap">
          {initiative.tags.slice(0, 3).map(tag => (
            <Box
              key={tag}
              sx={{ bgcolor: isDark ? 'rgba(3,105,161,0.18)' : '#f0f9ff', color: isDark ? '#38bdf8' : '#0369a1', fontWeight: 500, fontSize: '0.58rem', px: 0.55, py: 0.1, borderRadius: '5px', lineHeight: 1.6 }}
            >
              #{tag}
            </Box>
          ))}
          {initiative.tags.length > 3 && (
            <Box sx={{ color: '#94a3b8', fontSize: '0.58rem', lineHeight: 1.6 }}>+{initiative.tags.length - 3}</Box>
          )}
        </Box>
      )}

      {/* Progress */}
      {initiative.progress > 0 && (
        <Box mt={0.75}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.25}>
            <Typography sx={{ color: '#94a3b8', fontSize: '0.6rem', fontWeight: 500 }}>Progress</Typography>
            <Typography sx={{ color: '#64748b', fontSize: '0.6rem', fontWeight: 600 }}>{initiative.progress}%</Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={initiative.progress}
            sx={{
              height: 4, borderRadius: 4, bgcolor: isDark ? 'rgba(255,255,255,0.1)' : '#f1f5f9',
              '& .MuiLinearProgress-bar': {
                borderRadius: 4,
                background: initiative.progress === 100 ? '#10b981' : 'linear-gradient(90deg, #6366f1, #818cf8)',
              }
            }}
          />
        </Box>
      )}

      {/* Sub-item count */}
      {hasChildren && (
        <Typography sx={{ color: '#94a3b8', fontSize: '0.6rem', fontWeight: 500, mt: 0.5, display: 'block' }}>
          {initiative._count.children} sub-item{initiative._count.children !== 1 ? 's' : ''}
          {isCollapsed ? ' · collapsed' : ''}
        </Typography>
      )}

      <Handle type="source" position={Position.Bottom} style={{ background: 'transparent', border: 'none' }} />

      {/* Bottom: add child */}
      <AddBtn
        placement="bottom"
        tooltip="Add child — Tab"
        visible={showActions}
        onClick={() => onAddChild(initiative.id, initiative.priority)}
      />

      {/* Right: add sibling */}
      {canAddSibling && (
        <AddBtn
          placement="right"
          tooltip="Add sibling — Enter"
          visible={showActions}
          onClick={() => onAddSibling(initiative.parentId, initiative.id, initiative.priority)}
        />
      )}
    </Box>
  );
}

export default memo(MindMapNode);
