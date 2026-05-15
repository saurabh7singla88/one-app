import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// Known feature flags and their defaults
const FEATURES = {
  feature_team_board:    'false',
  feature_ai_newsletter: 'false',
};

// GET /api/features — return all feature flags
router.get('/', async (req, res, next) => {
  try {
    const rows = await prisma.appSetting.findMany({
      where: { key: { in: Object.keys(FEATURES) } },
    });
    const map = { ...FEATURES };
    for (const row of rows) map[row.key] = row.value;
    // Return as booleans
    res.json(Object.fromEntries(
      Object.entries(map).map(([k, v]) => [k, v === 'true'])
    ));
  } catch (err) { next(err); }
});

// PUT /api/features — update one or more feature flags
router.put('/', async (req, res, next) => {
  try {
    const updates = {};
    for (const key of Object.keys(FEATURES)) {
      if (key in req.body) updates[key] = req.body[key] ? 'true' : 'false';
    }
    await Promise.all(
      Object.entries(updates).map(([key, value]) =>
        prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
      )
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
