import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();
router.use(authenticate);

// ── Metadata fetch ──────────────────────────────────────────────────────────
// POST /api/bookmarks/fetch-meta  { url }
// Fetches page HTML, extracts og:title / title / description / og:image.
// Returns favicon via Google's public favicon service (no external auth needed).
router.post('/fetch-meta', async (req, res) => {
  const { url } = req.body;
  if (!url?.trim()) return res.status(400).json({ error: 'URL required' });

  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  const favicon = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OneApp/1.0)' },
    });
    clearTimeout(timer);

    const html = await response.text();

    const og = (prop) => {
      const m = html.match(new RegExp(`<meta[^>]+property=["']og:${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
             || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${prop}["']`, 'i'));
      return m?.[1]?.trim() || '';
    };
    const meta = (name) => {
      const m = html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))
             || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i'));
      return m?.[1]?.trim() || '';
    };
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);

    const title = (og('title') || titleMatch?.[1]?.trim() || hostname).slice(0, 200);
    const description = (og('description') || meta('description')).slice(0, 500);
    const image = og('image') || null;

    res.json({ title, description, favicon, image });
  } catch {
    res.json({ title: hostname, description: '', favicon, image: null });
  }
});

// ── Folders ──────────────────────────────────────────────────────────────────
router.get('/folders', async (req, res) => {
  try {
    const folders = await prisma.bookmarkFolder.findMany({
      where: { userId: req.user.id },
      include: { _count: { select: { bookmarks: true, children: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    res.json(folders);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch folders' });
  }
});

router.post('/folders', async (req, res) => {
  const { name, parentId, color, icon } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  try {
    const folder = await prisma.bookmarkFolder.create({
      data: {
        name: name.trim(),
        parentId: parentId || null,
        color: color || '#6366f1',
        icon: icon || '📁',
        userId: req.user.id,
      },
      include: { _count: { select: { bookmarks: true, children: true } } },
    });
    res.status(201).json(folder);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

router.put('/folders/:id', async (req, res) => {
  const { name, color, icon, sortOrder } = req.body;
  try {
    const folder = await prisma.bookmarkFolder.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    const updated = await prisma.bookmarkFolder.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(color !== undefined && { color }),
        ...(icon !== undefined && { icon }),
        ...(sortOrder !== undefined && { sortOrder }),
        updatedAt: new Date(),
      },
      include: { _count: { select: { bookmarks: true, children: true } } },
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

router.delete('/folders/:id', async (req, res) => {
  try {
    const folder = await prisma.bookmarkFolder.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!folder) return res.status(404).json({ error: 'Folder not found' });
    await prisma.bookmarkFolder.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// ── Bookmarks ────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { folderId, search } = req.query;
  const where = { userId: req.user.id };
  if (folderId === 'unsorted') where.folderId = null;
  else if (folderId) where.folderId = folderId;

  try {
    let items = await prisma.bookmark.findMany({
      where,
      include: { folder: { select: { id: true, name: true, color: true } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    if (search) {
      const q = search.toLowerCase();
      items = items.filter(b =>
        b.title.toLowerCase().includes(q) ||
        b.url.toLowerCase().includes(q) ||
        (b.description || '').toLowerCase().includes(q) ||
        (b.tags || '').includes(q)
      );
    }

    // tags is already parsed by prisma.js extension
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch bookmarks' });
  }
});

router.post('/', async (req, res) => {
  const { url, title, description, favicon, image, folderId, tags } = req.body;
  if (!url?.trim()) return res.status(400).json({ error: 'URL required' });
  if (!title?.trim()) return res.status(400).json({ error: 'Title required' });

  if (folderId) {
    const folder = await prisma.bookmarkFolder.findFirst({ where: { id: folderId, userId: req.user.id } });
    if (!folder) return res.status(400).json({ error: 'Invalid folder' });
  }

  try {
    const bookmark = await prisma.bookmark.create({
      data: {
        url: url.trim(),
        title: title.trim(),
        description: description?.trim() || null,
        favicon: favicon || null,
        image: image || null,
        tags: Array.isArray(tags) ? tags : [],
        folderId: folderId || null,
        userId: req.user.id,
        updatedAt: new Date(),
      },
      include: { folder: { select: { id: true, name: true, color: true } } },
    });
    res.status(201).json(bookmark);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create bookmark' });
  }
});

router.put('/:id', async (req, res) => {
  const { url, title, description, favicon, image, folderId, tags } = req.body;
  try {
    const bookmark = await prisma.bookmark.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!bookmark) return res.status(404).json({ error: 'Bookmark not found' });

    if (folderId) {
      const folder = await prisma.bookmarkFolder.findFirst({ where: { id: folderId, userId: req.user.id } });
      if (!folder) return res.status(400).json({ error: 'Invalid folder' });
    }

    const updated = await prisma.bookmark.update({
      where: { id: req.params.id },
      data: {
        ...(url !== undefined && { url: url.trim() }),
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(favicon !== undefined && { favicon }),
        ...(image !== undefined && { image }),
        ...(tags !== undefined && { tags: Array.isArray(tags) ? tags : [] }),
        ...(folderId !== undefined && { folderId: folderId || null }),
        updatedAt: new Date(),
      },
      include: { folder: { select: { id: true, name: true, color: true } } },
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update bookmark' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const bookmark = await prisma.bookmark.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!bookmark) return res.status(404).json({ error: 'Bookmark not found' });
    await prisma.bookmark.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete bookmark' });
  }
});

export default router;
