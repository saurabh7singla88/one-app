/**
 * RephraseTool — small "wand" icon button that opens a dropdown of AI
 * rephrase styles.  On success it previews the rewritten text and lets the
 * user apply or discard it.
 *
 * Props:
 *   text       {string}   current text value
 *   onApply    {fn}       called with the new string when user clicks Apply
 *   disabled   {boolean}  (optional) greys out the button
 *   size       {string}   MUI IconButton size (default 'small')
 *   sx         {object}   extra sx for the IconButton
 */
import React, { useState } from 'react';
import {
  IconButton, Tooltip, Menu, MenuItem, Divider,
  CircularProgress, Box, Typography, Button, Paper,
  ListItemIcon, ListItemText,
} from '@mui/material';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import BusinessCenterIcon from '@mui/icons-material/BusinessCenter';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import ContentCutIcon from '@mui/icons-material/ContentCut';
import TranslateIcon from '@mui/icons-material/Translate';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
import api from '../api/axios';

const STYLES = [
  { key: 'professional', label: 'Make it professional', Icon: BusinessCenterIcon, color: '#6366f1' },
  { key: 'elaborate',    label: 'Elaborate',             Icon: UnfoldMoreIcon,      color: '#0ea5e9' },
  { key: 'concise',      label: 'Make it concise',       Icon: ContentCutIcon,      color: '#f59e0b' },
  { key: 'simplify',     label: 'Simplify language',     Icon: TranslateIcon,       color: '#10b981' },
];

export default function RephraseTool({ text, onApply, disabled, size = 'small', sx }) {
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingStyle, setLoadingStyle] = useState(null);
  const [preview, setPreview] = useState(null);   // { style, rephrased }
  const [error, setError] = useState(null);

  const openMenu = (e) => {
    e.stopPropagation();
    setPreview(null);
    setError(null);
    setMenuAnchor(e.currentTarget);
  };
  const closeMenu = () => {
    if (loading) return;
    setMenuAnchor(null);
    setPreview(null);
    setError(null);
  };

  const handleStyle = async (styleKey) => {
    if (!text || !text.trim()) {
      setError('Nothing to rephrase yet.');
      return;
    }
    setLoading(true);
    setLoadingStyle(styleKey);
    setPreview(null);
    setError(null);
    try {
      const res = await api.post('/ai/rephrase', { text: text.trim(), style: styleKey });
      setPreview({ style: styleKey, rephrased: res.data.rephrased });
    } catch (e) {
      setError(e.response?.data?.error || 'AI rephrase failed. Check AI settings.');
    } finally {
      setLoading(false);
      setLoadingStyle(null);
    }
  };

  const handleApply = () => {
    if (preview) onApply(preview.rephrased);
    closeMenu();
  };

  const handleDiscard = () => {
    setPreview(null);
    setError(null);
  };

  const open = Boolean(menuAnchor);

  return (
    <>
      <Tooltip title="Rephrase with AI" placement="top">
        <span>
          <IconButton
            size={size}
            onClick={openMenu}
            disabled={disabled || !text?.trim()}
            sx={{
              color: 'text.disabled',
              '&:hover': { color: '#6366f1', bgcolor: 'rgba(99,102,241,0.08)' },
              transition: 'all 0.15s',
              ...sx,
            }}
          >
            <AutoFixHighIcon sx={{ fontSize: size === 'small' ? 16 : 20 }} />
          </IconButton>
        </span>
      </Tooltip>

      <Menu
        anchorEl={menuAnchor}
        open={open}
        onClose={closeMenu}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        PaperProps={{
          sx: {
            borderRadius: 2.5,
            boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
            minWidth: 240,
            maxWidth: 380,
            overflow: 'hidden',
          },
        }}
      >
        {/* Header */}
        <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" textTransform="uppercase" letterSpacing="0.07em">
            Rephrase with AI
          </Typography>
        </Box>

        {/* Style options (hidden while preview is shown) */}
        {!preview && !loading && STYLES.map(({ key, label, Icon, color }) => (
          <MenuItem key={key} onClick={() => handleStyle(key)} dense sx={{ gap: 1.5, py: 1 }}>
            <ListItemIcon sx={{ minWidth: 0 }}>
              <Icon sx={{ fontSize: 17, color }} />
            </ListItemIcon>
            <ListItemText primary={label} primaryTypographyProps={{ fontSize: '0.85rem' }} />
          </MenuItem>
        ))}

        {/* Loading spinner */}
        {loading && (
          <Box sx={{ px: 2, py: 2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <CircularProgress size={16} sx={{ color: '#6366f1' }} />
            <Typography variant="body2" color="text.secondary">
              {STYLES.find(s => s.key === loadingStyle)?.label || 'Rephrasing…'}&nbsp;
              <Typography component="span" variant="caption" color="text.disabled">(may retry…)</Typography>
            </Typography>
          </Box>
        )}

        {/* Error */}
        {error && !loading && (
          <Box sx={{ px: 2, py: 1 }}>
            <Typography variant="caption" color="error.main">{error}</Typography>
          </Box>
        )}

        {/* Preview */}
        {preview && !loading && (
          <>
            <Divider />
            <Box sx={{ px: 2, py: 1.5 }}>
              <Typography variant="caption" fontWeight={600} color="text.secondary" display="block" mb={0.75}>
                PREVIEW
              </Typography>
              <Paper
                variant="outlined"
                sx={{
                  p: 1.5,
                  borderRadius: 1.5,
                  bgcolor: 'rgba(99,102,241,0.04)',
                  borderColor: 'rgba(99,102,241,0.25)',
                  maxHeight: 180,
                  overflowY: 'auto',
                }}
              >
                <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', lineHeight: 1.65, fontSize: '0.82rem' }}>
                  {preview.rephrased}
                </Typography>
              </Paper>
              <Box display="flex" gap={1} mt={1.5} justifyContent="flex-end">
                <Button
                  size="small"
                  startIcon={<CloseIcon sx={{ fontSize: 14 }} />}
                  onClick={handleDiscard}
                  sx={{ textTransform: 'none', fontSize: '0.78rem', borderRadius: 2, color: 'text.secondary' }}
                >
                  Try another
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<CheckIcon sx={{ fontSize: 14 }} />}
                  onClick={handleApply}
                  sx={{
                    textTransform: 'none', fontSize: '0.78rem', borderRadius: 2,
                    bgcolor: '#6366f1', '&:hover': { bgcolor: '#4f46e5' },
                  }}
                >
                  Apply
                </Button>
              </Box>
            </Box>
          </>
        )}
      </Menu>
    </>
  );
}
