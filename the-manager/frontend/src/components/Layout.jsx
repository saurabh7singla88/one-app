import { Outlet } from 'react-router-dom';
import {
  Box, Typography, Button, Drawer, List, ListItem,
  ListItemButton, ListItemIcon, ListItemText, IconButton,
  Avatar, Divider, Tooltip, AppBar, Toolbar, Container,
} from '@mui/material';
import {
  Dashboard as DashboardIcon, List as ListIcon, Logout, Menu as MenuIcon,
  AccountTree, CheckBox as TasksIcon, People as PeopleIcon,
  NoteAlt, EventNote, FeedOutlined, Groups,
  Settings as SettingsIcon, ChevronLeft, ChevronRight, HelpOutline,
  Bookmark as BookmarkIcon,
} from '@mui/icons-material';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import { logout } from '../features/auth/authSlice';
import { useState, useCallback, useEffect } from 'react';
import api from '../api/axios';

const EXPANDED_WIDTH = 220;
const COLLAPSED_WIDTH = 58;
const SIDEBAR_BG = '#1e1b4b';
const SIDEBAR_HOVER = 'rgba(255,255,255,0.07)';
const SIDEBAR_ACTIVE = 'rgba(99,102,241,0.22)';
const SIDEBAR_TEXT = 'rgba(255,255,255,0.75)';
const SIDEBAR_ACTIVE_TEXT = '#a5b4fc';

export default function Layout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useSelector((state) => state.auth);
  const [mobileOpen, setMobileOpen] = useState(false);

  // ── Feature flags (from Setup → Features toggles) ──────────────────────
  const [jiraEnabled,      setJiraEnabled]      = useState(false);
  const [aiEnabled,        setAiEnabled]        = useState(false);

  useEffect(() => {
    api.get('/features')
      .then(r => {
        setJiraEnabled(!!r.data.feature_team_board);
        setAiEnabled(!!r.data.feature_ai_newsletter);
      })
      .catch(() => {});
  }, [location.pathname]); // re-fetch on every navigation so toggles take effect immediately

  // Persist collapsed state across sessions
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === 'true'; } catch { return false; }
  });

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('sidebar_collapsed', String(next)); } catch {}
      return next;
    });
  };

  const drawerWidth = collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH;

  const handleLogout = () => { dispatch(logout()); navigate('/login'); };

  const menuItems = [
    { text: 'Dashboard',     icon: <DashboardIcon fontSize="small" />,  path: '/' },
    { text: 'Initiatives',   icon: <ListIcon fontSize="small" />,        path: '/initiatives' },
    { text: 'Mind Map',      icon: <AccountTree fontSize="small" />,     path: '/mindmap' },
    { text: 'Tasks',         icon: <TasksIcon fontSize="small" />,       path: '/tasks' },
    { text: 'Bookmarks',     icon: <BookmarkIcon fontSize="small" />,    path: '/bookmarks' },

    { text: 'Notes',         icon: <NoteAlt fontSize="small" />,         path: '/notes' },
    { text: 'Meeting Notes', icon: <EventNote fontSize="small" />,       path: '/meeting-notes' },
    ...(aiEnabled   ? [{ text: 'AI Newsletter', icon: <FeedOutlined fontSize="small" />, path: '/ai-newsletter' }] : []),
    ...(jiraEnabled ? [{ text: 'Team Board',    icon: <Groups fontSize="small" />,        path: '/team-board'    }] : []),
    { text: 'Users',         icon: <PeopleIcon fontSize="small" />,      path: '/users' },
    { text: 'Setup',         icon: <SettingsIcon fontSize="small" />,    path: '/setup' },
    { text: 'Help',          icon: <HelpOutline fontSize="small" />,     path: '/help' },
  ];

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', bgcolor: SIDEBAR_BG, overflow: 'hidden' }}>

      {/* Logo */}
      <Box sx={{ px: collapsed ? 1 : 2.5, py: 2.5, display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start' }}>
        <Box
          sx={{
            width: 32, height: 32, borderRadius: 2, flexShrink: 0,
            background: 'linear-gradient(135deg, #6366f1, #818cf8)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <AccountTree sx={{ color: '#fff', fontSize: 18 }} />
        </Box>
        {!collapsed && (
          <Typography
            variant="body1" fontWeight={700}
            sx={{ color: '#ffffff', letterSpacing: '-0.01em', ml: 1.25, whiteSpace: 'nowrap' }}
          >
            One
          </Typography>
        )}
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mx: collapsed ? 1 : 2 }} />

      {/* Nav items */}
      <List sx={{ flex: 1, pt: 1.5, px: 0 }}>
        {menuItems.map((item) => {
          const active = location.pathname === item.path;
          const btn = (
            <ListItemButton
              onClick={() => { navigate(item.path); setMobileOpen(false); }}
              sx={{
                borderRadius: 2,
                mx: 1,
                width: 'auto',
                mb: 0.25,
                py: 1,
                justifyContent: collapsed ? 'center' : 'flex-start',
                bgcolor: active ? SIDEBAR_ACTIVE : 'transparent',
                color: active ? SIDEBAR_ACTIVE_TEXT : SIDEBAR_TEXT,
                '&:hover': { bgcolor: active ? SIDEBAR_ACTIVE : SIDEBAR_HOVER, color: '#ffffff' },
                '& .MuiListItemIcon-root': { color: active ? SIDEBAR_ACTIVE_TEXT : SIDEBAR_TEXT },
                '&:hover .MuiListItemIcon-root': { color: '#ffffff' },
              }}
            >
              <ListItemIcon sx={{ minWidth: collapsed ? 0 : 34 }}>{item.icon}</ListItemIcon>
              {!collapsed && (
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: active ? 600 : 400 }}
                />
              )}
            </ListItemButton>
          );

          return (
            <ListItem key={item.text} disablePadding>
              {collapsed ? (
                <Tooltip title={item.text} placement="right" arrow>
                  {btn}
                </Tooltip>
              ) : btn}
            </ListItem>
          );
        })}
      </List>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mx: collapsed ? 1 : 2 }} />

      <Box sx={{ display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end', px: 1, py: 0.75 }}>
        <Tooltip title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right" arrow>
          <IconButton
            size="small"
            onClick={toggleCollapsed}
            sx={{
              color: SIDEBAR_TEXT,
              bgcolor: 'rgba(255,255,255,0.05)',
              borderRadius: 1.5,
              p: 0.6,
              '&:hover': { bgcolor: 'rgba(255,255,255,0.12)', color: '#ffffff' },
            }}
          >
            {collapsed ? <ChevronRight sx={{ fontSize: 17 }} /> : <ChevronLeft sx={{ fontSize: 17 }} />}
          </IconButton>
        </Tooltip>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mx: collapsed ? 1 : 2 }} />

      {/* User footer */}
      <Box sx={{ p: collapsed ? 1 : 2, display: 'flex', alignItems: 'center', gap: 1.5, justifyContent: collapsed ? 'center' : 'flex-start' }}>
        <Tooltip title={collapsed ? `${user?.name} · Logout` : ''} placement="right" arrow>
          <Avatar
            sx={{
              width: 32, height: 32, fontSize: '0.75rem', fontWeight: 600,
              bgcolor: '#4f46e5', color: '#fff', flexShrink: 0, cursor: collapsed ? 'pointer' : 'default',
            }}
            onClick={collapsed ? handleLogout : undefined}
          >
            {initials}
          </Avatar>
        </Tooltip>
        {!collapsed && (
          <>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" fontWeight={600} sx={{ color: '#ffffff', display: 'block' }} noWrap>
                {user?.name}
              </Typography>
              <Typography variant="caption" sx={{ color: SIDEBAR_TEXT, fontSize: '0.7rem' }} noWrap>
                {user?.email}
              </Typography>
            </Box>
            <Tooltip title="Logout">
              <IconButton size="small" onClick={handleLogout} sx={{ color: SIDEBAR_TEXT, '&:hover': { color: '#ef4444' } }}>
                <Logout fontSize="small" />
              </IconButton>
            </Tooltip>
          </>
        )}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Mobile AppBar */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          display: { sm: 'none' },
          bgcolor: SIDEBAR_BG,
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={() => setMobileOpen(true)} sx={{ mr: 1 }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" fontWeight={700}>One</Typography>
        </Toolbar>
      </AppBar>

      {/* Sidebar */}
      <Box
        component="nav"
        sx={{
          width: { sm: drawerWidth },
          flexShrink: { sm: 0 },
          transition: 'width 0.2s ease',
        }}
      >
        {/* Mobile drawer */}
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { width: EXPANDED_WIDTH, bgcolor: SIDEBAR_BG },
          }}
        >
          {drawerContent}
        </Drawer>
        {/* Desktop drawer */}
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': {
              width: drawerWidth,
              bgcolor: SIDEBAR_BG,
              border: 0,
              overflow: 'hidden',
              transition: 'width 0.2s ease',
            },
          }}
          open
        >
          {drawerContent}
        </Drawer>
      </Box>

      {/* Main content */}
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3.5 },
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          mt: { xs: 8, sm: 0 },
          minHeight: '100vh',
          transition: 'width 0.2s ease',
        }}
      >
        <Container maxWidth="xl" disableGutters>
          <Outlet />
        </Container>
      </Box>
    </Box>
  );
}
