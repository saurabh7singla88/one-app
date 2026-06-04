import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:47421/api';

const adminAxios = axios.create({ baseURL: `${API_URL}/admin` });

adminAxios.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('adminToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export async function adminLogin(username, password) {
  const { data } = await adminAxios.post('/auth', { username, password });
  sessionStorage.setItem('adminToken', data.token);
  return data;
}

export function adminLogout() {
  sessionStorage.removeItem('adminToken');
}

export function isAdminLoggedIn() {
  return !!sessionStorage.getItem('adminToken');
}

export async function getAdminAISettings() {
  const { data } = await adminAxios.get('/ai/settings');
  return data;
}

export async function putAdminAISettings(settings) {
  const { data } = await adminAxios.put('/ai/settings', settings);
  return data;
}
