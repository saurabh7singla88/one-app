import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { encrypt, decrypt } from '../middleware/cipher.js';
import { authenticateAdmin, issueAdminToken } from '../middleware/adminAuth.js';

const router = Router();

const ENCRYPTED_KEYS = new Set([
  'ai_openai_api_key', 'ai_gemini_api_key',
  'ai_bedrock_api_key',
]);

function safeEncrypt(value) {
  if (!value) return value;
  return (process.env.TOKEN_ENCRYPTION_KEY?.length === 64) ? encrypt(value) : value;
}

// ─── POST /api/admin/auth ─── public, validates env credentials ───────────────
router.post('/auth', (req, res) => {
  const { username, password } = req.body || {};
  const expectedUser = process.env.ADMIN_USERNAME;
  const expectedPass = process.env.ADMIN_PASSWORD;
  if (!expectedUser || !expectedPass) {
    return res.status(503).json({ error: 'Admin credentials not configured on server.' });
  }
  if (username !== expectedUser || password !== expectedPass) {
    return res.status(401).json({ error: 'Invalid admin credentials.' });
  }
  res.json({ token: issueAdminToken() });
});

// All routes below require admin JWT
router.use(authenticateAdmin);

// ─── GET /api/admin/ai/settings ───────────────────────────────────────────────
router.get('/ai/settings', async (req, res, next) => {
  try {
    const rows = await prisma.appSetting.findMany({ where: { key: { startsWith: 'ai_' } } });
    const s = {};
    for (const row of rows) {
      s[row.key] = ENCRYPTED_KEYS.has(row.key) ? decrypt(row.value) : row.value;
    }
    const mask = (v) => v ? `${'•'.repeat(Math.max(0, v.length - 4))}${v.slice(-4)}` : '';
    res.json({
      provider:              s.ai_provider || '',
      ollamaBaseUrl:         s.ai_ollama_base_url || '',
      ollamaModel:           s.ai_ollama_model || '',
      openaiBaseUrl:         s.ai_openai_base_url || '',
      openaiModel:           s.ai_openai_model || '',
      openaiApiKey:          mask(s.ai_openai_api_key),
      openaiApiKeySet:       !!s.ai_openai_api_key,
      geminiModel:           s.ai_gemini_model || '',
      geminiApiKey:          mask(s.ai_gemini_api_key),
      geminiApiKeySet:       !!s.ai_gemini_api_key,
      bedrockRegion:         s.ai_bedrock_region || '',
      bedrockModel:          s.ai_bedrock_model || '',
      bedrockApiKey:         mask(s.ai_bedrock_api_key),
      bedrockApiKeySet:      !!s.ai_bedrock_api_key,
    });
  } catch (err) { next(err); }
});

// ─── PUT /api/admin/ai/settings ───────────────────────────────────────────────
router.put('/ai/settings', async (req, res, next) => {
  try {
    const {
      provider, ollamaBaseUrl, ollamaModel,
      openaiBaseUrl, openaiModel, openaiApiKey,
      geminiModel, geminiApiKey,
      bedrockRegion, bedrockModel, bedrockApiKey,
    } = req.body;
    const updates = {};
    if (provider != null)       updates.ai_provider = provider;
    if (ollamaBaseUrl != null)  updates.ai_ollama_base_url = ollamaBaseUrl;
    if (ollamaModel != null)    updates.ai_ollama_model = ollamaModel;
    if (openaiBaseUrl != null)  updates.ai_openai_base_url = openaiBaseUrl;
    if (openaiModel != null)    updates.ai_openai_model = openaiModel;
    if (openaiApiKey != null && openaiApiKey !== '' && !openaiApiKey.startsWith('•'))
      updates.ai_openai_api_key = safeEncrypt(openaiApiKey);
    if (geminiModel != null)    updates.ai_gemini_model = geminiModel;
    if (geminiApiKey != null && geminiApiKey !== '' && !geminiApiKey.startsWith('•'))
      updates.ai_gemini_api_key = safeEncrypt(geminiApiKey);
    if (bedrockRegion != null)  updates.ai_bedrock_region = bedrockRegion;
    if (bedrockModel != null)   updates.ai_bedrock_model = bedrockModel;
    if (bedrockApiKey != null && bedrockApiKey !== '' && !bedrockApiKey.startsWith('•'))
      updates.ai_bedrock_api_key = safeEncrypt(bedrockApiKey);

    await Promise.all(
      Object.entries(updates).map(([key, value]) =>
        prisma.appSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
      )
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

export default router;
