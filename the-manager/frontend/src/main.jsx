import React, { useState, useMemo } from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter, BrowserRouter } from 'react-router-dom'

// Use HashRouter when running in Electron (file:// protocol doesn't support BrowserRouter)
const Router = window.electronAPI?.isElectron ? HashRouter : BrowserRouter;
import { CssBaseline, ThemeProvider } from '@mui/material'
import { Provider } from 'react-redux'
import { store } from './store'
import App from './App'
import { createAppTheme } from './theme'
import { ColorModeContext } from './colorModeContext'
import './index.css'

function Root() {
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem('color_mode') || 'light'; } catch { return 'light'; }
  });

  const colorMode = useMemo(() => ({
    mode,
    toggleColorMode: () => setMode(prev => {
      const next = prev === 'light' ? 'dark' : 'light';
      try { localStorage.setItem('color_mode', next); } catch {}
      return next;
    }),
  }), [mode]);

  const theme = useMemo(() => createAppTheme(mode), [mode]);

  return (
    <ColorModeContext.Provider value={colorMode}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <App />
      </ThemeProvider>
    </ColorModeContext.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Provider store={store}>
      <Router>
        <Root />
      </Router>
    </Provider>
  </React.StrictMode>,
)
