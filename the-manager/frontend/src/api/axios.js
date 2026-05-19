import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:47421/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add auth token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Track consecutive network failures to detect a dead backend
let _networkFailures = 0;
let _reloadScheduled = false;

// Handle auth errors
api.interceptors.response.use(
  (response) => {
    _networkFailures = 0; // reset on any success
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Don't reload on auth-endpoint failures (login/register) — let the
      // page display the error message instead of refreshing it away.
      const url = error.config?.url || '';
      if (url.includes('/auth/login') || url.includes('/auth/register') || url.includes('/auth/forgot-password') || url.includes('/auth/reset-password')) {
        return Promise.reject(error);
      }
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      // Reload the page so Redux re-initialises from empty localStorage.
      // Simply setting window.location.hash = '/login' won't work because
      // the in-memory Redux state still has isAuthenticated:true, causing an
      // immediate redirect back to '/' before the login page can render.
      window.location.reload();
      return Promise.reject(error);
    }

    // Network error (ECONNREFUSED / backend crashed / still starting up)
    if (!error.response && !_reloadScheduled) {
      _networkFailures++;
      if (_networkFailures >= 3) {
        // Backend is down — reload the renderer once it comes back
        _reloadScheduled = true;
        const checkInterval = setInterval(async () => {
          try {
            await fetch('http://localhost:47421/api/health', { signal: AbortSignal.timeout(2000) });
            // Backend is back — reload to restore full app state
            clearInterval(checkInterval);
            window.location.reload();
          } catch {
            // still down, keep polling
          }
        }, 2000);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
