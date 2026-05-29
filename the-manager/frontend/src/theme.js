import { createTheme, alpha } from '@mui/material/styles';

export function createAppTheme(mode) {
  const isDark = mode === 'dark';
  const borderColor = isDark ? '#334155' : '#e2e8f0';
  const borderHover = isDark ? '#64748b' : '#94a3b8';

  return createTheme({
  palette: {
    mode,
    primary: {
      main: '#6366f1',
      light: '#818cf8',
      dark: '#4f46e5',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#f59e0b',
      light: '#fbbf24',
      dark: '#d97706',
    },
    success: {
      main: '#10b981',
      light: '#34d399',
      dark: '#059669',
    },
    warning: {
      main: '#f59e0b',
      light: '#fbbf24',
      dark: '#d97706',
    },
    error: {
      main: '#ef4444',
      light: '#f87171',
      dark: '#dc2626',
    },
    info: {
      main: '#3b82f6',
      light: '#60a5fa',
      dark: '#2563eb',
    },
    background: {
      default: isDark ? '#0f172a' : '#f8fafc',
      paper: isDark ? '#1e293b' : '#ffffff',
    },
    text: {
      primary: isDark ? '#f1f5f9' : '#0f172a',
      secondary: isDark ? '#94a3b8' : '#64748b',
      disabled: isDark ? '#64748b' : '#94a3b8',
    },
    divider: borderColor,
  },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontWeightLight: 300,
    fontWeightRegular: 400,
    fontWeightMedium: 500,
    fontWeightBold: 600,
    h1: { fontSize: '2.25rem', fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.025em' },
    h2: { fontSize: '1.875rem', fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.025em' },
    h3: { fontSize: '1.5rem', fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.015em' },
    h4: { fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.4, letterSpacing: '-0.01em' },
    h5: { fontSize: '1.125rem', fontWeight: 600, lineHeight: 1.4 },
    h6: { fontSize: '1rem', fontWeight: 600, lineHeight: 1.5 },
    body1: { fontSize: '0.9375rem', lineHeight: 1.6 },
    body2: { fontSize: '0.875rem', lineHeight: 1.6 },
    caption: { fontSize: '0.75rem', lineHeight: 1.5 },
    button: { fontSize: '0.875rem', fontWeight: 500, letterSpacing: '0.01em' },
  },
  shape: { borderRadius: 10 },
  shadows: [
    'none',
    '0px 1px 2px rgba(15,23,42,0.06)',
    '0px 1px 4px rgba(15,23,42,0.08)',
    '0px 2px 8px rgba(15,23,42,0.08)',
    '0px 4px 12px rgba(15,23,42,0.08)',
    '0px 4px 16px rgba(15,23,42,0.10)',
    '0px 8px 20px rgba(15,23,42,0.10)',
    '0px 8px 24px rgba(15,23,42,0.12)',
    '0px 12px 28px rgba(15,23,42,0.12)',
    '0px 12px 32px rgba(15,23,42,0.14)',
    '0px 16px 36px rgba(15,23,42,0.14)',
    '0px 16px 40px rgba(15,23,42,0.16)',
    '0px 20px 44px rgba(15,23,42,0.16)',
    '0px 20px 48px rgba(15,23,42,0.18)',
    '0px 24px 52px rgba(15,23,42,0.18)',
    '0px 24px 56px rgba(15,23,42,0.20)',
    '0px 28px 60px rgba(15,23,42,0.20)',
    '0px 28px 64px rgba(15,23,42,0.22)',
    '0px 32px 68px rgba(15,23,42,0.22)',
    '0px 32px 72px rgba(15,23,42,0.24)',
    '0px 36px 76px rgba(15,23,42,0.24)',
    '0px 36px 80px rgba(15,23,42,0.26)',
    '0px 40px 84px rgba(15,23,42,0.26)',
    '0px 40px 88px rgba(15,23,42,0.28)',
    '0px 44px 92px rgba(15,23,42,0.28)',
  ],
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        '*': { boxSizing: 'border-box' },
        html: { WebkitFontSmoothing: 'antialiased', MozOsxFontSmoothing: 'grayscale' },
        '::-webkit-scrollbar': { width: 6, height: 6 },
        '::-webkit-scrollbar-track': { background: 'transparent' },
        '::-webkit-scrollbar-thumb': { background: isDark ? '#475569' : '#cbd5e1', borderRadius: 4 },
        '::-webkit-scrollbar-thumb:hover': { background: isDark ? '#64748b' : '#94a3b8' },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          borderRadius: 8,
          fontWeight: 500,
          boxShadow: 'none',
          '&:hover': { boxShadow: 'none' },
        },
        contained: {
          '&:hover': { boxShadow: '0 4px 12px rgba(99,102,241,0.3)' },
        },
        sizeSmall: { fontSize: '0.8125rem', padding: '4px 12px' },
        sizeMedium: { padding: '7px 18px' },
        sizeLarge: { fontSize: '0.9375rem', padding: '10px 24px' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          border: `1px solid ${borderColor}`,
          boxShadow: isDark ? '0 1px 4px rgba(0,0,0,0.3)' : '0 1px 4px rgba(15,23,42,0.06)',
          transition: 'box-shadow 0.2s ease, transform 0.2s ease',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '& fieldset': { borderColor },
          '&:hover fieldset': { borderColor: borderHover },
          '&.Mui-focused fieldset': { borderColor: '#6366f1' },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: { '&.Mui-focused': { color: '#6366f1' } },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 6, fontWeight: 500, fontSize: '0.75rem' },
        sizeSmall: { height: 22 },
      },
    },
    MuiSelect: {
      styleOverrides: { root: { borderRadius: 8 } },
    },
    MuiLinearProgress: {
      styleOverrides: { root: { borderRadius: 4, backgroundColor: borderColor } },
    },
    MuiAlert: {
      styleOverrides: { root: { borderRadius: 8 } },
    },
    MuiDialogTitle: {
      styleOverrides: { root: { fontSize: '1.125rem', fontWeight: 600 } },
    },
    MuiDialogContent: {
      styleOverrides: { root: { paddingTop: '12px !important' } },
    },
    MuiDrawer: {
      styleOverrides: { paper: { borderRight: 0 } },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          margin: '1px 8px',
          width: 'calc(100% - 16px)',
          '&.Mui-selected': {
            backgroundColor: alpha('#6366f1', 0.12),
            color: '#6366f1',
            '& .MuiListItemIcon-root': { color: '#6366f1' },
            '&:hover': { backgroundColor: alpha('#6366f1', 0.16) },
          },
          '&:hover': { backgroundColor: alpha('#6366f1', 0.06) },
        },
      },
    },
    MuiListItemIcon: {
      styleOverrides: { root: { minWidth: 36 } },
    },
    MuiDivider: {
      styleOverrides: { root: { borderColor } },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#0f172a',
          borderRadius: 6,
          fontSize: '0.75rem',
          padding: '6px 10px',
        },
      },
    },
  },
  });
}
