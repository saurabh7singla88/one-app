import express from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { encrypt, decrypt } from '../middleware/cipher.js';

const router = express.Router();

router.use(authenticate);

const canEncrypt = () => process.env.TOKEN_ENCRYPTION_KEY?.length === 64;

/** Encrypt content only if TOKEN_ENCRYPTION_KEY is configured and note is protected. */
function encryptContent(content) {
  if (!canEncrypt()) return content;
  return encrypt(content);
}

/** Decrypt content — pass-through if not encrypted or key missing. */
function decryptContent(content) {
  if (!content) return content;
  try { return decrypt(content); } catch { return content; }
}

// ── Global password settings ───────────────────────────────
// GET /settings — does the user have a notes password set?
router.get('/settings', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { notesPasswordHash: true },
    });
    res.json({ hasPassword: !!user.notesPasswordHash, encryptionEnabled: canEncrypt() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// POST /unlock — verify global notes password
router.post('/unlock', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { notesPasswordHash: true },
    });
    if (!user.notesPasswordHash) return res.status(400).json({ error: 'No password set' });

    const match = await bcrypt.compare(password, user.notesPasswordHash);
    if (!match) return res.status(401).json({ error: 'Incorrect password' });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to verify password' });
  }
});

// PUT /password — set, change, or remove global notes password
// body: { action: 'set'|'change'|'remove', password?, currentPassword? }
router.put('/password', async (req, res) => {
  try {
    const { action, password, currentPassword } = req.body;

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { notesPasswordHash: true },
    });

    if (action === 'set') {
      if (!password) return res.status(400).json({ error: 'Password required' });
      const hash = await bcrypt.hash(password, 10);
      await prisma.user.update({ where: { id: req.user.id }, data: { notesPasswordHash: hash } });

    } else if (action === 'change' || action === 'remove') {
      if (!user.notesPasswordHash) return res.status(400).json({ error: 'No password set' });
      if (!currentPassword) return res.status(400).json({ error: 'Current password required' });

      const match = await bcrypt.compare(currentPassword, user.notesPasswordHash);
      if (!match) return res.status(401).json({ error: 'Incorrect current password' });

      if (action === 'remove') {
        await prisma.user.update({ where: { id: req.user.id }, data: { notesPasswordHash: null } });
      } else {
        if (!password) return res.status(400).json({ error: 'New password required' });
        const hash = await bcrypt.hash(password, 10);
        await prisma.user.update({ where: { id: req.user.id }, data: { notesPasswordHash: hash } });
      }
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// ── List notes (no content) ───────────────────────────────
// Returns all notes for the user (flat, with parentId).
// Canvas filtering and tree assembly is handled client-side.
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const where = { createdById: req.user.id };
    if (search) where.title = { contains: search };

    const notes = await prisma.note.findMany({
      where,
      select: {
        id: true,
        title: true,
        isProtected: true,
        parentId: true,
        canvasId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    res.json(notes);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// ── Create note ────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { title, content = '', canvasId, parentId } = req.body;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    // Validate parentId belongs to same user
    if (parentId) {
      const parent = await prisma.note.findFirst({ where: { id: parentId, createdById: req.user.id } });
      if (!parent) return res.status(404).json({ error: 'Parent note not found' });
    }

    const note = await prisma.note.create({
      data: {
        title: title.trim(),
        content,
        parentId: parentId || null,
        canvasId: canvasId || null,
        createdById: req.user.id,
      },
      select: { id: true, title: true, parentId: true, canvasId: true, createdAt: true, updatedAt: true },
    });
    res.status(201).json(note);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

// ── Get single note ────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const note = await prisma.note.findFirst({
      where: { id: req.params.id, createdById: req.user.id },
      select: { id: true, title: true, content: true, isProtected: true, parentId: true, canvasId: true, createdAt: true, updatedAt: true },
    });
    if (!note) return res.status(404).json({ error: 'Note not found' });
    // Protected notes: omit content until verified via POST /:id/unlock
    if (note.isProtected) return res.json({ ...note, content: null });
    res.json(note);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch note' });
  }
});

// ── Unlock note — verify login password, return full content ──────────────
router.post('/:id/unlock', async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required' });

    const [note, user] = await Promise.all([
      prisma.note.findFirst({
        where: { id: req.params.id, createdById: req.user.id },
        select: { id: true, title: true, content: true, isProtected: true, parentId: true, canvasId: true, createdAt: true, updatedAt: true },
      }),
      prisma.user.findUnique({ where: { id: req.user.id }, select: { password: true } }),
    ]);
    if (!note) return res.status(404).json({ error: 'Note not found' });
    if (!note.isProtected) return res.json(note);

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Incorrect password' });

    res.json({ ...note, content: decryptContent(note.content) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to unlock note' });
  }
});

// ── Update note ────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { title, content, canvasId, parentId, isProtected } = req.body;
    const note = await prisma.note.findFirst({ where: { id: req.params.id, createdById: req.user.id } });
    if (!note) return res.status(404).json({ error: 'Note not found' });

    const data = {};
    if (title !== undefined) data.title = title.trim();
    if (canvasId !== undefined) data.canvasId = canvasId || null;
    if (parentId !== undefined) data.parentId = parentId || null;
    if (isProtected !== undefined) data.isProtected = isProtected;

    // Determine the protection state the note will have after this update
    const willBeProtected = isProtected !== undefined ? isProtected : note.isProtected;

    if (content !== undefined) {
      // Content explicitly provided — encrypt if the note will be protected
      data.content = willBeProtected ? encryptContent(content) : content;
    } else if (isProtected !== undefined && isProtected !== note.isProtected) {
      // Protection toggled but no new content — re-process existing content
      if (isProtected) {
        // Toggling ON: encrypt current content (skip if already encrypted)
        data.content = note.content?.startsWith('enc:') ? note.content : encryptContent(note.content ?? '');
      } else {
        // Toggling OFF: decrypt current content back to plaintext
        data.content = decryptContent(note.content ?? '');
      }
    }

    const updated = await prisma.note.update({
      where: { id: req.params.id },
      data,
      select: { id: true, title: true, content: true, isProtected: true, parentId: true, canvasId: true, createdAt: true, updatedAt: true },
    });
    // Never expose encrypted content in the response for protected notes
    res.json(updated.isProtected ? { ...updated, content: null } : updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// ── Delete note ────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const note = await prisma.note.findFirst({ where: { id: req.params.id, createdById: req.user.id } });
    if (!note) return res.status(404).json({ error: 'Note not found' });
    await prisma.note.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

export default router;
