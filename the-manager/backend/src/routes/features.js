import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// Known feature flags and their defaults
const FEATURES = {
  feature_team_board:    'false',
  feature_ai_newsletter: 'false',
  feature_meeting_notes: 'true',
};

// These features are hidden unless ENABLE_HIDDEN_FEATURES=true is set at runtime.
const HIDDEN_FEATURE_KEYS = ['feature_team_board', 'feature_ai_newsletter'];

function hiddenFeaturesEnabled() {
  return process.env.ENABLE_HIDDEN_FEATURES === 'true';
}

// GET /api/features — return all feature flags
router.get('/', async (req, res, next) => {
  try {
    const rows = await prisma.appSetting.findMany({
      where: { key: { in: Object.keys(FEATURES) } },
    });
    const map = { ...FEATURES };
    for (const row of rows) map[row.key] = row.value;

    // Force hidden features to false when ENABLE_HIDDEN_FEATURES is not set
    if (!hiddenFeaturesEnabled()) {
      for (const key of HIDDEN_FEATURE_KEYS) map[key] = 'false';
    }

    // Return as booleans + expose the flag so the UI can hide the toggles
    res.json({
      ...Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v === 'true'])),
      hidden_features_enabled: hiddenFeaturesEnabled(),
    });
  } catch (err) { next(err); }
});

// PUT /api/features — update one or more feature flags
router.put('/', async (req, res, next) => {
  try {
    const updates = {};
    for (const key of Object.keys(FEATURES)) {
      if (key in req.body) {
        // Silently ignore writes to hidden features when the flag is not set
        if (HIDDEN_FEATURE_KEYS.includes(key) && !hiddenFeaturesEnabled()) continue;
        updates[key] = req.body[key] ? 'true' : 'false';
      }
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
