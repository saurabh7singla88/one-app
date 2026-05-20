import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../api/axios';

export const fetchFolders = createAsyncThunk('bookmarks/fetchFolders', async (_, { rejectWithValue }) => {
  try { const { data } = await api.get('/bookmarks/folders'); return data; }
  catch (e) { return rejectWithValue(e.response?.data?.error || 'Failed'); }
});

export const createFolder = createAsyncThunk('bookmarks/createFolder', async (payload, { rejectWithValue }) => {
  try { const { data } = await api.post('/bookmarks/folders', payload); return data; }
  catch (e) { return rejectWithValue(e.response?.data?.error || 'Failed'); }
});

export const updateFolder = createAsyncThunk('bookmarks/updateFolder', async ({ id, ...rest }, { rejectWithValue }) => {
  try { const { data } = await api.put(`/bookmarks/folders/${id}`, rest); return data; }
  catch (e) { return rejectWithValue(e.response?.data?.error || 'Failed'); }
});

export const deleteFolder = createAsyncThunk('bookmarks/deleteFolder', async (id, { rejectWithValue }) => {
  try { await api.delete(`/bookmarks/folders/${id}`); return id; }
  catch (e) { return rejectWithValue(e.response?.data?.error || 'Failed'); }
});

export const fetchBookmarks = createAsyncThunk('bookmarks/fetchBookmarks', async (params, { rejectWithValue }) => {
  try { const { data } = await api.get('/bookmarks', { params }); return data; }
  catch (e) { return rejectWithValue(e.response?.data?.error || 'Failed'); }
});

export const createBookmark = createAsyncThunk('bookmarks/createBookmark', async (payload, { rejectWithValue }) => {
  try { const { data } = await api.post('/bookmarks', payload); return data; }
  catch (e) { return rejectWithValue(e.response?.data?.error || 'Failed'); }
});

export const updateBookmark = createAsyncThunk('bookmarks/updateBookmark', async ({ id, ...rest }, { rejectWithValue }) => {
  try { const { data } = await api.put(`/bookmarks/${id}`, rest); return data; }
  catch (e) { return rejectWithValue(e.response?.data?.error || 'Failed'); }
});

export const deleteBookmark = createAsyncThunk('bookmarks/deleteBookmark', async (id, { rejectWithValue }) => {
  try { await api.delete(`/bookmarks/${id}`); return id; }
  catch (e) { return rejectWithValue(e.response?.data?.error || 'Failed'); }
});

const bookmarksSlice = createSlice({
  name: 'bookmarks',
  initialState: { folders: [], bookmarks: [], loading: false, error: null },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchFolders.fulfilled, (s, a) => { s.folders = a.payload; })
      .addCase(createFolder.fulfilled, (s, a) => { s.folders.push(a.payload); })
      .addCase(updateFolder.fulfilled, (s, a) => {
        const i = s.folders.findIndex(f => f.id === a.payload.id);
        if (i !== -1) s.folders[i] = a.payload;
      })
      .addCase(deleteFolder.fulfilled, (s, a) => {
        // Remove folder and all its descendants
        const toRemove = new Set();
        const q = [a.payload];
        while (q.length) {
          const id = q.shift(); toRemove.add(id);
          s.folders.filter(f => f.parentId === id).forEach(f => q.push(f.id));
        }
        s.folders = s.folders.filter(f => !toRemove.has(f.id));
        // Unset folderId on orphaned bookmarks
        s.bookmarks = s.bookmarks.map(b => toRemove.has(b.folderId) ? { ...b, folderId: null, folder: null } : b);
      })
      .addCase(fetchBookmarks.pending,   (s) => { s.loading = true; s.error = null; })
      .addCase(fetchBookmarks.rejected,  (s, a) => { s.loading = false; s.error = a.payload; })
      .addCase(fetchBookmarks.fulfilled, (s, a) => { s.loading = false; s.bookmarks = a.payload; })
      .addCase(createBookmark.fulfilled, (s, a) => { s.bookmarks.unshift(a.payload); })
      .addCase(updateBookmark.fulfilled, (s, a) => {
        const i = s.bookmarks.findIndex(b => b.id === a.payload.id);
        if (i !== -1) s.bookmarks[i] = a.payload;
      })
      .addCase(deleteBookmark.fulfilled, (s, a) => {
        s.bookmarks = s.bookmarks.filter(b => b.id !== a.payload);
      });
  },
});

export default bookmarksSlice.reducer;
