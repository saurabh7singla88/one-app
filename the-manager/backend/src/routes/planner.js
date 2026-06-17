import express from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import logger from '../lib/logger.js';
import { loadAISettings, callLLM } from '../lib/llm.js';

const router = express.Router();
router.use(authenticate);

const PRIORITY_SCORE = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

const HOURLY_SLOTS = [
  '09:00','10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00',
  '18:00','19:00','20:00','21:00','22:00',
];
const HALF_DAY_SLOTS = ['FIRST_HALF', 'SECOND_HALF'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreTasks(tasks, today) {
  const todayMs = new Date(today).getTime();

  return tasks
    .filter(t => !['COMPLETED', 'CANCELLED'].includes(t.status))
    .map(t => {
      let score = (PRIORITY_SCORE[t.priority] || 1) * 10;
      if (t.dueDate) {
        const dueMs = new Date(t.dueDate).getTime();
        const diffDays = (dueMs - todayMs) / 86_400_000;
        if (diffDays < 0)       score += 40; // overdue
        else if (diffDays === 0) score += 30; // due today
        else if (diffDays <= 3)  score += 20; // due this week
        else if (diffDays <= 7)  score += 10;
      }
      if (t.status === 'IN_PROGRESS') score += 5;
      return { task: t, score };
    })
    .sort((a, b) => b.score - a.score)
    .map(x => x.task);
}

function buildRecommendation(sortedTasks, mode) {
  const slots = mode === 'halfday' ? HALF_DAY_SLOTS : HOURLY_SLOTS;
  const entries = [];
  sortedTasks.forEach((task, idx) => {
    if (idx >= slots.length) return; // only fill available slots
    entries.push({ slot: slots[idx], initiativeId: task.id, customTitle: null, position: 0 });
  });
  return entries;
}

// ─── GET /planner?date=YYYY-MM-DD  ───────────────────────────────────────────
// Returns all entries for a given day (or week if ?week=true)
router.get('/', async (req, res, next) => {
  try {
    const { date, startDate, endDate } = req.query;
    const userId = req.user.id;

    let dateFilter;
    if (startDate && endDate) {
      // For weekly view — client passes startDate + endDate
      const dates = [];
      const cur = new Date(startDate);
      const end = new Date(endDate);
      while (cur <= end) {
        dates.push(cur.toISOString().slice(0, 10));
        cur.setDate(cur.getDate() + 1);
      }
      dateFilter = { in: dates };
    } else if (date) {
      dateFilter = date;
    } else {
      return res.status(400).json({ error: 'date or startDate+endDate required' });
    }

    const entries = await prisma.plannerEntry.findMany({
      where: { userId, date: dateFilter },
      include: {
        initiative: {
          select: {
            id: true, title: true, status: true, priority: true,
            dueDate: true, type: true, isStandaloneTask: true,
          },
        },
      },
      orderBy: [{ date: 'asc' }, { position: 'asc' }],
    });

    res.json(entries);
  } catch (err) {
    next(err);
  }
});

// ─── PUT /planner  ────────────────────────────────────────────────────────────
// Upsert a single entry. Body: { date, slot, initiativeId?, customTitle?, note?, position? }
router.put('/', async (req, res, next) => {
  try {
    const { date, slot, initiativeId, customTitle, note, position, id } = req.body;
    const userId = req.user.id;

    if (!date || !slot) return res.status(400).json({ error: 'date and slot are required' });

    let entry;
    if (id) {
      // Verify ownership before updating
      const existing = await prisma.plannerEntry.findUnique({ where: { id } });
      if (!existing || existing.userId !== userId) return res.status(403).json({ error: 'Forbidden' });
      
      entry = await prisma.plannerEntry.update({
        where: { id },
        data: { date, slot, initiativeId: initiativeId || null, customTitle: customTitle || null, note: note || null, position: position ?? 0, updatedAt: new Date() },
        include: { initiative: { select: { id: true, title: true, status: true, priority: true, dueDate: true, type: true, isStandaloneTask: true } } },
      });
    } else {
      entry = await prisma.plannerEntry.create({
        data: { id: undefined, date, slot, userId, initiativeId: initiativeId || null, customTitle: customTitle || null, note: note || null, position: position ?? 0, updatedAt: new Date() },
        include: { initiative: { select: { id: true, title: true, status: true, priority: true, dueDate: true, type: true, isStandaloneTask: true } } },
      });
    }
    res.json(entry);
  } catch (err) {
    next(err);
  }
});

// ─── DELETE /planner/:id  ─────────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const entry = await prisma.plannerEntry.findUnique({ where: { id } });
    if (!entry || entry.userId !== userId) return res.status(404).json({ error: 'Not found' });
    await prisma.plannerEntry.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// ─── POST /planner/day-note  ──────────────────────────────────────────────────
// Save/update the free-text day note for a given date
router.post('/day-note', async (req, res, next) => {
  try {
    const { date, note } = req.body;
    const userId = req.user.id;
    if (!date) return res.status(400).json({ error: 'date required' });

    const existing = await prisma.plannerEntry.findFirst({
      where: { userId, date, slot: 'DAY_NOTE' },
    });

    let entry;
    if (existing) {
      entry = await prisma.plannerEntry.update({
        where: { id: existing.id },
        data: { note: note || '', updatedAt: new Date() },
      });
    } else {
      entry = await prisma.plannerEntry.create({
        data: { date, slot: 'DAY_NOTE', userId, note: note || '', updatedAt: new Date() },
      });
    }
    res.json(entry);
  } catch (err) {
    next(err);
  }
});

// ─── POST /planner/bulk  ─────────────────────────────────────────────────────
// Replace all entries for a date (used by recommend flows)
// Body: { date, entries: [{ slot, initiativeId?, customTitle?, position }] }
router.post('/bulk', async (req, res, next) => {
  try {
    const { date, entries } = req.body;
    const userId = req.user.id;
    if (!date || !Array.isArray(entries)) return res.status(400).json({ error: 'date and entries array required' });

    // Delete existing (non-DAY_NOTE) entries for this date
    await prisma.plannerEntry.deleteMany({ where: { userId, date, NOT: { slot: 'DAY_NOTE' } } });

    // Re-create
    const created = await Promise.all(
      entries.map((e, idx) =>
        prisma.plannerEntry.create({
          data: {
            date, slot: e.slot, userId,
            initiativeId: e.initiativeId || null,
            customTitle: e.customTitle || null,
            position: e.position ?? idx,
            updatedAt: new Date(),
          },
          include: { initiative: { select: { id: true, title: true, status: true, priority: true, dueDate: true, type: true, isStandaloneTask: true } } },
        })
      )
    );

    res.json(created);
  } catch (err) {
    next(err);
  }
});

// ─── POST /planner/recommend  ────────────────────────────────────────────────
// Rule-based smart recommendation (no AI)
// Body: { date, mode: 'hourly'|'halfday', canvasId? }
router.post('/recommend', async (req, res, next) => {
  try {
    const { date, mode = 'halfday', canvasId } = req.body;
    const userId = req.user.id;
    if (!date) return res.status(400).json({ error: 'date required' });

    const where = {
      createdById: userId,
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    };
    if (canvasId) where.canvasId = canvasId;

    const tasks = await prisma.initiative.findMany({
      where,
      select: { id: true, title: true, priority: true, dueDate: true, status: true, type: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    });

    const sorted = scoreTasks(tasks, date);
    const recommendation = buildRecommendation(sorted, mode);

    // Also return unscheduled tasks (those that didn't fit into slots)
    const scheduledIds = new Set(recommendation.map(r => r.initiativeId));
    const unscheduled = sorted.filter(t => !scheduledIds.has(t.id));

    res.json({ entries: recommendation, unscheduled, mode });
  } catch (err) {
    next(err);
  }
});

// ─── POST /planner/ai-recommend  ─────────────────────────────────────────────
// AI-powered recommendation with reasoning
// Body: { date, mode: 'hourly'|'halfday', canvasId? }
router.post('/ai-recommend', async (req, res, next) => {
  try {
    const { date, mode = 'halfday', canvasId } = req.body;
    const userId = req.user.id;
    if (!date) return res.status(400).json({ error: 'date required' });

    const where = { createdById: userId, status: { notIn: ['COMPLETED', 'CANCELLED'] } };
    if (canvasId) where.canvasId = canvasId;

    const tasks = await prisma.initiative.findMany({
      where,
      select: { id: true, title: true, priority: true, dueDate: true, status: true, type: true, description: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      take: 30,
    });

    if (tasks.length === 0) return res.json({ entries: [], unscheduled: [], reasoning: 'No open tasks found.' });

    const slots = mode === 'halfday' ? HALF_DAY_SLOTS : HOURLY_SLOTS;
    const today = new Date(date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const systemPrompt = `You are a productivity assistant helping plan a workday. 
You will receive a list of open tasks and a set of time slots.
Return a JSON object with this exact shape:
{
  "slots": [
    { "slot": "<slot_key>", "taskIds": ["<task_id>", ...] }
  ],
  "reasoning": "<brief overall rationale>",
  "tips": ["<tip1>", "<tip2>"]
}
Rules:
- Each slot can have 1-3 tasks (2 max for FIRST_HALF/SECOND_HALF, 1-2 for hourly)
- Prioritise CRITICAL and HIGH tasks earlier in the day
- Group related tasks when possible
- Leave at least one slot lighter if there are many CRITICAL items (avoid burnout)
- Only use task IDs from the provided list
- Not all tasks need to be scheduled — put the most important ones first`;

    const userPrompt = `Date: ${today}
Available slots: ${slots.join(', ')}
Tasks:
${tasks.map(t => `- ID: ${t.id} | "${t.title}" | Priority: ${t.priority} | Status: ${t.status} | Due: ${t.dueDate ? new Date(t.dueDate).toLocaleDateString() : 'none'}`).join('\n')}

Please create an optimal daily plan.`;

    const settings = await loadAISettings(req.user.id);
    const { text, error } = await callLLM(settings, systemPrompt, userPrompt);

    if (error || !text) {
      return res.status(502).json({ error: error || 'AI returned no response' });
    }

    let parsed;
    try {
      // Strip markdown code fences if present (```json ... ``` or ``` ... ```)
      const cleaned = text
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '')
        .trim();
      // Extract first JSON object if there's surrounding prose
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
    } catch {
      logger.error('Planner AI-recommend: failed to parse LLM response', { text });
      // Graceful degradation: fall back to smart recommendation
      const sorted = scoreTasks(tasks, date);
      const fallbackEntries = buildRecommendation(sorted, mode);
      const scheduledIds = new Set(fallbackEntries.map(e => e.initiativeId));
      return res.json({
        entries: fallbackEntries,
        unscheduled: tasks.filter(t => !scheduledIds.has(t.id)),
        reasoning: 'AI response could not be parsed — showing smart recommendation instead.',
        tips: [],
        mode,
      });
    }

    // Normalise to flat entry list
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const entries = [];
    const scheduledIds = new Set();

    for (const slotObj of (parsed.slots || [])) {
      const taskIds = slotObj.taskIds || [];
      taskIds.forEach((tid, idx) => {
        if (taskMap.has(tid)) {
          entries.push({ slot: slotObj.slot, initiativeId: tid, customTitle: null, position: idx });
          scheduledIds.add(tid);
        }
      });
    }

    const unscheduled = tasks.filter(t => !scheduledIds.has(t.id));

    res.json({
      entries,
      unscheduled,
      reasoning: parsed.reasoning || '',
      tips: parsed.tips || [],
      mode,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
