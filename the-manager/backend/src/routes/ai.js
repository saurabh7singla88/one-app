import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { encrypt, decrypt } from '../middleware/cipher.js';
import logger from '../lib/logger.js';

const router = Router();
router.use(authenticate);

const LLM_TIMEOUT = 30_000;        // ms — OpenAI / Gemini
const OLLAMA_TIMEOUT = 120_000;    // ms — local models can be slow

// ─── Default fallback settings (env vars still honoured if no DB entry exists)
const DEFAULTS = {
  ai_provider: process.env.AI_PROVIDER || 'ollama',
  ai_ollama_base_url: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ai_ollama_model: process.env.OLLAMA_MODEL || 'llama3.1:latest',
  ai_openai_base_url: 'https://api.openai.com',
  ai_openai_model: 'gpt-4o-mini',
  ai_openai_api_key: '',
  ai_gemini_model: 'gemini-1.5-flash',
  ai_gemini_api_key: '',
};

// ─── Load AI settings from DB (falls back to env/defaults for missing keys) ───
async function loadAISettings(userId) {
  const rows = await prisma.userSetting.findMany({ where: { userId, key: { startsWith: 'ai_' } } });
  const map = { ...DEFAULTS };
  for (const row of rows) {
    map[row.key] = (row.key === 'ai_openai_api_key' || row.key === 'ai_gemini_api_key')
      ? decrypt(row.value)
      : row.value;
  }
  return map;
}

// ─── Encrypt a value only when TOKEN_ENCRYPTION_KEY is configured ───────────
function safeEncrypt(value) {
  if (!value) return value;
  return (process.env.TOKEN_ENCRYPTION_KEY?.length === 64) ? encrypt(value) : value;
}

// ─── Provider: Ollama ─────────────────────────────────────────────────────────
async function callOllama(settings, systemPrompt, userPrompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);
  // Note: `format: 'json'` is intentionally omitted — Gemma models (and some others)
  // do not support Ollama's grammar-based JSON mode and will error or hang.
  // JSON output is enforced via prompt instructions instead.
  //
  // In Docker, `localhost` refers to the container, not the host.
  // Replace it with `host.docker.internal` so Ollama (running on the host) is reachable.
  let ollamaBaseUrl = settings.ai_ollama_base_url || 'http://localhost:11434';
  if (!process.env.ELECTRON) {
    ollamaBaseUrl = ollamaBaseUrl.replace(/localhost/g, 'host.docker.internal');
  }
  try {
    const res = await fetch(`${ollamaBaseUrl}/api/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
      body: JSON.stringify({
        model: settings.ai_ollama_model, stream: false,
        options: { temperature: 0.1, num_predict: 2048 },
        messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      }),
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const errBody = await res.json(); detail = errBody.error || detail; } catch {}
      logger.error(`Ollama non-OK response`, { status: res.status, model: settings.ai_ollama_model, detail });
      return null;
    }
    const data = await res.json();
    return (data.message?.content || data.response || '').trim();
  } catch (e) {
    logger.error('Ollama call failed', { error: e.message, model: settings.ai_ollama_model });
    return null;
  } finally { clearTimeout(timer); }
}

// ─── Provider: OpenAI / OpenAI-compatible (LM Studio, Together AI, etc.) ──────
// Returns { text: string|null, error: string|null }.
// Set jsonMode=false for free-text (non-JSON) responses (e.g. rephrase, summaries).
async function callOpenAI(settings, systemPrompt, userPrompt, jsonMode = true) {
  if (!settings.ai_openai_api_key) return { text: null, error: 'OpenAI API key not configured. Add it in Setup → AI Settings.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT);
  try {
    const base = (settings.ai_openai_base_url || 'https://api.openai.com').replace(/\/$/, '');
    const bodyObj = {
      model: settings.ai_openai_model, temperature: 0.1,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
    };
    if (jsonMode) bodyObj.response_format = { type: 'json_object' };
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.ai_openai_api_key}` },
      signal: controller.signal,
      body: JSON.stringify(bodyObj),
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const errBody = await res.json(); detail = errBody.error?.message || errBody.error || detail; } catch {}
      logger.error('OpenAI non-OK response', { status: res.status, detail, model: settings.ai_openai_model, base: settings.ai_openai_base_url });
      return { text: null, error: `OpenAI error: ${detail}` };
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || null;
    return { text, error: text ? null : 'OpenAI returned an empty response.' };
  } catch (e) {
    logger.error('OpenAI call failed', e);
    const msg = e.name === 'AbortError' ? 'OpenAI request timed out.' : `OpenAI call failed: ${e.message}`;
    return { text: null, error: msg };
  } finally { clearTimeout(timer); }
}

// ─── Provider: Google Gemini ──────────────────────────────────────────────────
// Returns { text: string } on success, or { error: string } on failure.
// Pass schemaOverride=false for free-text (non-JSON) responses.
// Retries up to GEMINI_MAX_RETRIES times on 429/503 with exponential back-off.
const GEMINI_MAX_RETRIES = 3;
const GEMINI_RETRY_BASE_MS = 2000; // 2 s → 4 s → 8 s

async function callGemini(settings, systemPrompt, userPrompt, schemaOverride = null, timeoutMs = LLM_TIMEOUT) {
  if (!settings.ai_gemini_api_key) return { error: 'Gemini API key not configured. Add it in Setup → AI Settings.' };

  const defaultSchema = {
    type: 'OBJECT',
    properties: {
      results: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            id:      { type: 'STRING' },
            urgency: { type: 'NUMBER' },
            reason:  { type: 'STRING' },
          },
          required: ['id', 'urgency', 'reason'],
        },
      },
    },
    required: ['results'],
  };
  // schemaOverride=false → plain text response (no JSON schema enforcement)
  const useSchema = schemaOverride !== false;
  const schema = useSchema ? (schemaOverride || defaultSchema) : null;

  const model = settings.ai_gemini_model || 'gemini-1.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.ai_gemini_api_key}`;
  const generationConfig = useSchema
    ? { responseMimeType: 'application/json', responseSchema: schema, temperature: 0.1, maxOutputTokens: 4096 }
    : { temperature: 0.2, maxOutputTokens: 4096 };
  const body = JSON.stringify({
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig,
  });

  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
        body,
      });

      const data = await res.json();

      // Retryable: 429 rate-limit or 503 overload
      if ((res.status === 429 || res.status === 503) && attempt < GEMINI_MAX_RETRIES) {
        const delay = GEMINI_RETRY_BASE_MS * Math.pow(2, attempt);
        logger.warn(`Gemini ${res.status} on attempt ${attempt + 1}, retrying in ${delay}ms`, { model });
        clearTimeout(timer);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      if (!res.ok) {
        const msg = data?.error?.message || `HTTP ${res.status}`;
        logger.error('Gemini API error', { status: res.status, model, error: data?.error });
        return { error: `Gemini error: ${msg}` };
      }

      const candidate = data.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text?.trim();
      if (!text) {
        const reason = candidate?.finishReason || 'unknown';
        logger.warn('Gemini returned no text', { finishReason: reason, promptFeedback: data?.promptFeedback });
        return { error: `Gemini returned no content (finishReason: ${reason})` };
      }
      return { text };
    } catch (e) {
      if (e.name === 'AbortError') {
        if (attempt < GEMINI_MAX_RETRIES) {
          const delay = GEMINI_RETRY_BASE_MS * Math.pow(2, attempt);
          logger.warn(`Gemini timed out on attempt ${attempt + 1}, retrying in ${delay}ms`, { model });
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        return { error: 'Gemini request timed out after retries' };
      }
      logger.error('Gemini call failed', e);
      return { error: e.message };
    } finally { clearTimeout(timer); }
  }
  return { error: 'Gemini did not respond after retries. It may be experiencing high demand — please try again shortly.' };
}

// ─── LLM urgency analyser (provider-agnostic) ─────────────────────────────────
async function analyseWithLLM(items, settings) {
  const provider = settings.ai_provider || 'ollama';
  if (provider === 'disabled') return { map: {}, provider: 'disabled' };

  const toAnalyse = items.filter(i => (i.description || '').trim().length > 10);
  if (toAnalyse.length === 0) return { map: {}, provider };

  const payload = toAnalyse.map(i => ({
    id: i.id, title: i.title, description: (i.description || '').slice(0, 600),
  }));

  const systemPrompt = `You are an expert product manager assistant that evaluates work item urgency.
Your job is to read the title and description of each initiative and judge how urgent it sounds
based purely on the LANGUAGE and INTENT expressed in the text.

Look for signals like: urgency/must-do language, blocking/critical language, business risk,
customer impact, scaling/performance concerns, executive visibility, imminent deadlines mentioned
in the text, words or phrases like "must", "critical", "ASAP", "scaling", "at risk", "urgent",
"must do", "important", "cannot wait", "needs attention" etc.

Return ONLY a valid JSON object with a "results" key containing an array. Format:
{
  "results": [
    { "id": "<the item id>", "urgency": <0-100>, "reason": "<6-word reason>" }
  ]
}

Be generous: if ANY urgency is implied or suggested, score it above 30.`;

  const userPrompt = `Rate the urgency expressed in these initiative descriptions:\n${JSON.stringify(payload, null, 2)}`;

  let rawText = null;
  if (provider === 'ollama') rawText = await callOllama(settings, systemPrompt, userPrompt);
  else if (provider === 'openai' || provider === 'openai_compatible') {
    const r = await callOpenAI(settings, systemPrompt, userPrompt, true);
    rawText = r.text || null;
    if (r.error) logger.warn('OpenAI urgency analysis failed', { error: r.error });
  } else if (provider === 'gemini') {
    const r = await callGemini(settings, systemPrompt, userPrompt, null);
    rawText = r.text || null;
    if (r.error) logger.warn('Gemini urgency analysis failed', { error: r.error });
  }

  if (!rawText) {
    logger.warn(`LLM urgency analysis returned no response`, { provider });
    return { map: {}, provider };
  }

  try {
    const clean = rawText.replace(/^```(?:json)?|```$/gm, '').trim();
    const parsed = JSON.parse(clean);
    let arr;
    if (Array.isArray(parsed)) arr = parsed;
    else if (Array.isArray(parsed.results)) arr = parsed.results;
    else if (Array.isArray(parsed.items)) arr = parsed.items;
    else if (parsed.id && typeof parsed.urgency === 'number') arr = [parsed];
    else arr = Object.values(parsed).filter(v => v && typeof v === 'object' && v.id && typeof v.urgency === 'number');

    const map = {};
    for (const entry of arr) {
      if (!entry.id || typeof entry.urgency !== 'number') continue;
      const urgency = Math.max(0, Math.min(100, Math.round(entry.urgency)));
      if (urgency < 10) continue;
      map[entry.id] = {
        score: Math.round(urgency * 0.55),
        reason: (entry.reason || 'Urgency detected in description').slice(0, 80),
      };
    }
    return { map, provider };
  } catch (e) {
    logger.warn('Failed to parse LLM urgency response', { provider, error: e.message });
    return { map: {}, provider };
  }
}

// ─────────────────────────────────────────────
// Scoring constants
// ─────────────────────────────────────────────
const PRIORITY_SCORE = { CRITICAL: 40, HIGH: 28, MEDIUM: 14, LOW: 5 };
const STATUS_SCORE = { BLOCKED: 38, IN_PROGRESS: 18, ON_HOLD: 12, OPEN: 6, COMPLETED: -999, CANCELLED: -999 };

function daysAgo(date) { return Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000); }
function daysUntil(date) { return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000); }

// ─────────────────────────────────────────────
// Score a single initiative
// llmMap: id → { score, reason } from Ollama
// Returns { score, reasons[] }
// ─────────────────────────────────────────────
function scoreItem(item, childrenMap, llmMap) {
  const reasons = [];
  let score = 0;

  // Skip completed / cancelled entirely
  const base = STATUS_SCORE[item.status] ?? 0;
  if (base === -999) return null;

  // 1. Priority
  const pScore = PRIORITY_SCORE[item.priority] ?? 0;
  score += pScore;
  if (item.priority === 'CRITICAL') reasons.push({ label: 'Critical priority', weight: pScore, icon: '🔴' });
  else if (item.priority === 'HIGH') reasons.push({ label: 'High priority', weight: pScore, icon: '🟠' });

  // 2. Status
  score += base;
  if (item.status === 'BLOCKED') reasons.push({ label: 'Currently blocked', weight: base, icon: '🚫' });
  else if (item.status === 'ON_HOLD') reasons.push({ label: 'Sitting on hold', weight: base, icon: '⏸️' });

  // 3. Due date
  if (item.dueDate) {
    const days = daysUntil(item.dueDate);
    let dueDateScore = 0;
    let dueLabel = '';
    if (days < 0) {
      dueDateScore = 50;
      dueLabel = `Overdue by ${Math.abs(days)} day${Math.abs(days) !== 1 ? 's' : ''}`;
    } else if (days === 0) {
      dueDateScore = 42;
      dueLabel = 'Due today';
    } else if (days === 1) {
      dueDateScore = 35;
      dueLabel = 'Due tomorrow';
    } else if (days <= 3) {
      dueDateScore = 28;
      dueLabel = `Due in ${days} days`;
    } else if (days <= 7) {
      dueDateScore = 18;
      dueLabel = `Due in ${days} days`;
    } else if (days <= 14) {
      dueDateScore = 8;
      dueLabel = `Due in ${days} days`;
    }
    if (dueDateScore > 0) {
      score += dueDateScore;
      reasons.push({ label: dueLabel, weight: dueDateScore, icon: days < 0 ? '🔥' : '📅' });
    }
  }

  // 4. Stale score (no updates for a long time)
  const stalenessDays = daysAgo(item.updatedAt || item.createdAt);
  if (stalenessDays >= 7 && item.status !== 'ON_HOLD') {
    const staleScore = Math.min(Math.floor(stalenessDays * 0.6), 22);
    score += staleScore;
    reasons.push({
      label: `No updates for ${stalenessDays} day${stalenessDays !== 1 ? 's' : ''}`,
      weight: staleScore,
      icon: '💤',
    });
  }

  // 5. Blocked children
  const children = childrenMap[item.id] || [];
  const blockedChildren = children.filter(c => c.status === 'BLOCKED').length;
  if (blockedChildren > 0) {
    const blockedScore = Math.min(blockedChildren * 10, 30);
    score += blockedScore;
    reasons.push({
      label: `${blockedChildren} blocked sub-item${blockedChildren !== 1 ? 's' : ''}`,
      weight: blockedScore,
      icon: '⛔',
    });
  }

  // 6. High depth of open/unstarted children (initiative sprawl)
  const openChildren = children.filter(c => c.status === 'OPEN').length;
  if (openChildren >= 3 && item.status === 'IN_PROGRESS') {
    const sprawlScore = Math.min(openChildren * 3, 15);
    score += sprawlScore;
    reasons.push({
      label: `${openChildren} sub-items still open`,
      weight: sprawlScore,
      icon: '📋',
    });
  }

  // 7. LLM description analysis
  const llm = llmMap?.[item.id];
  if (llm) {
    score += llm.score;
    reasons.push({ label: llm.reason, weight: llm.score, icon: '🧠' });
  }

  reasons.sort((a, b) => b.weight - a.weight);
  return { score, reasons };
}

// ─────────────────────────────────────────────
// GET /api/ai/settings
// ─────────────────────────────────────────────
router.get('/settings', async (req, res, next) => {
  try {
    const s = await loadAISettings(req.user.id);
    const mask = (k) => k ? `${'•'.repeat(Math.max(0, k.length - 4))}${k.slice(-4)}` : '';
    res.json({
      provider: s.ai_provider,
      ollamaBaseUrl: s.ai_ollama_base_url,
      ollamaModel: s.ai_ollama_model,
      openaiBaseUrl: s.ai_openai_base_url,
      openaiModel: s.ai_openai_model,
      openaiApiKey: mask(s.ai_openai_api_key),
      openaiApiKeySet: !!s.ai_openai_api_key,
      geminiModel: s.ai_gemini_model,
      geminiApiKey: mask(s.ai_gemini_api_key),
      geminiApiKeySet: !!s.ai_gemini_api_key,
    });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// PUT /api/ai/settings
// ─────────────────────────────────────────────
router.put('/settings', async (req, res, next) => {
  try {
    const { provider, ollamaBaseUrl, ollamaModel, openaiBaseUrl, openaiModel, openaiApiKey, geminiModel, geminiApiKey } = req.body;
    const userId = req.user.id;
    const updates = {};
    if (provider != null) updates.ai_provider = provider;
    if (ollamaBaseUrl != null) updates.ai_ollama_base_url = ollamaBaseUrl;
    if (ollamaModel != null) updates.ai_ollama_model = ollamaModel;
    if (openaiBaseUrl != null) updates.ai_openai_base_url = openaiBaseUrl;
    if (openaiModel != null) updates.ai_openai_model = openaiModel;
    if (openaiApiKey != null && openaiApiKey !== '' && !openaiApiKey.startsWith('•'))
      updates.ai_openai_api_key = safeEncrypt(openaiApiKey);
    if (geminiModel != null) updates.ai_gemini_model = geminiModel;
    if (geminiApiKey != null && geminiApiKey !== '' && !geminiApiKey.startsWith('•'))
      updates.ai_gemini_api_key = safeEncrypt(geminiApiKey);

    await Promise.all(
      Object.entries(updates).map(([key, value]) =>
        prisma.userSetting.upsert({ where: { userId_key: { userId, key } }, update: { value }, create: { userId, key, value } })
      )
    );
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─────────────────────────────────────────────
// GET /api/ai/suggestions
// ─────────────────────────────────────────────
router.get('/suggestions', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit) || 8;
    const canvasId = req.query.canvasId; // optional canvas filter
    const mode = req.query.mode || 'initiatives'; // 'initiatives' | 'tasks'

    // Fetch all non-completed initiatives for the user's data (created by or assigned to)
    const where = {
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    };
    if (canvasId && canvasId !== 'all') where.canvasId = canvasId;

    // Mode filter
    if (mode === 'tasks') {
      where.isStandaloneTask = true;
    } else {
      // Include all initiatives and sub-initiatives, but exclude standalone tasks
      where.isStandaloneTask = false;
    }

    const initiatives = await prisma.initiative.findMany({
      where,
      include: {
        children: {
          select: { id: true, status: true, title: true },
        },
      },
      orderBy: { updatedAt: 'asc' },
    });

    if (initiatives.length === 0) {
      return res.json({ suggestions: [], analysedCount: 0 });
    }

    const childrenMap = {};
    for (const item of initiatives) childrenMap[item.id] = item.children || [];

    const settings = await loadAISettings(req.user.id);
    const { map: llmMap, provider: llmProvider } = await analyseWithLLM(initiatives, settings);
    const llmUsed = Object.keys(llmMap).length > 0;

    // Score every initiative
    const scored = [];
    for (const item of initiatives) {
      const result = scoreItem(item, childrenMap, llmMap);
      if (result && result.score > 0 && result.reasons.length > 0) {
        scored.push({
          id: item.id,
          title: item.title,
          description: item.description || null,
          status: item.status,
          priority: item.priority,
          dueDate: item.dueDate,
          parentId: item.parentId,
          score: result.score,
          reasons: result.reasons.slice(0, 3), // top 3 reasons
        });
      }
    }

    // Sort by score descending, take top N
    scored.sort((a, b) => b.score - a.score);
    const suggestions = scored.slice(0, limit);

    return res.json({
      suggestions,
      analysedCount: initiatives.length,
      llmUsed,
      llmProvider: llmUsed ? llmProvider : null,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

// ─── Action items extractor ──────────────────────────────────────────────────
const ACTION_ITEMS_GEMINI_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          text:     { type: 'STRING' },
          assignee: { type: 'STRING' },
          isForMe:  { type: 'BOOLEAN' },
        },
        required: ['text', 'isForMe'],
      },
    },
  },
  required: ['items'],
};

async function extractActionItems(emailText, subject, userName, settings) {
  const provider = settings.ai_provider || 'ollama';
  if (provider === 'disabled') return { items: [], provider: 'disabled', llmCalled: false };

  const body = (emailText || '').slice(0, 6000);

  if (!body.trim()) {
    logger.warn('action-items: email body is empty, skipping LLM call');
    return { items: [], provider, llmCalled: false, emptyBody: true };
  }
  const systemPrompt = `You are a meeting notes assistant. Extract all action items from the email below.
For each action item:
- Write the task clearly and concisely
- Set "assignee" to the person's name if mentioned, or "" if unclear
- Set "isForMe" to true if the item is assigned to or most likely the responsibility of "${userName}", otherwise false

Return ONLY a valid JSON object with key "items" containing an array.
Format: { "items": [ { "text": "...", "assignee": "...", "isForMe": true/false } ] }`;

  const userPrompt = `Subject: ${subject || '(no subject)'}

${body}`;

  let rawText = null;
  let llmError = null;
  if (provider === 'ollama')            rawText = await callOllama(settings, systemPrompt, userPrompt);
  else if (provider === 'openai' || provider === 'openai_compatible') {
    const r = await callOpenAI(settings, systemPrompt, userPrompt, true);
    if (r.error) llmError = r.error;
    else rawText = r.text;
  } else if (provider === 'gemini') {
    const result = await callGemini(settings, systemPrompt, userPrompt, ACTION_ITEMS_GEMINI_SCHEMA);
    if (result.error) llmError = result.error;
    else rawText = result.text;
  }

  if (!rawText) {
    logger.warn('LLM action-items extraction returned no response', { provider, llmError });
    return { items: [], provider, llmCalled: true, llmFailed: true, llmError };
  }

  try {
    const clean = rawText.replace(/^```(?:json)?|```$/gm, '').trim();
    const parsed = JSON.parse(clean);
    const arr = Array.isArray(parsed) ? parsed
      : Array.isArray(parsed.items) ? parsed.items
      : Array.isArray(parsed.results) ? parsed.results
      : [];
    return {
      items: arr.map(a => ({
        text:     (a.text || a.action || a.task || '').trim(),
        assignee: (a.assignee || a.owner || '').trim(),
        isForMe:  Boolean(a.isForMe ?? a.is_for_me ?? false),
      })).filter(a => a.text.length > 0),
      provider,
      llmCalled: true,
    };
  } catch (e) {
    logger.warn('Failed to parse LLM action-items response', { provider, error: e.message });
    return { items: [], provider, llmCalled: true, llmFailed: true };
  }
}

// POST /api/ai/summarize-meetings
// Body: { initiativeTitle, notes, type? }  — type='newsletter' uses a newsletter-specific prompt
router.post('/summarize-meetings', async (req, res, next) => {
  try {
    const { initiativeTitle, notes, type = 'meeting' } = req.body;
    if (!Array.isArray(notes) || notes.length === 0)
      return res.status(400).json({ error: 'notes array required' });

    const settings = await loadAISettings(req.user.id);
    const provider = settings.ai_provider || 'ollama';
    if (provider === 'disabled') return res.json({ summary: null, provider: 'disabled' });

    const isNewsletter = type === 'newsletter';

    const notesText = notes.map((n, i) => {
      const header = [
        n.date ? `Date: ${new Date(n.date).toDateString()}` : null,
        n.subject ? `Subject: ${n.subject}` : null,
        n.fromEmail ? `From: ${n.fromEmail}` : null,
      ].filter(Boolean).join(' | ');
      const label = isNewsletter ? `Newsletter ${i + 1}` : `Meeting ${i + 1}`;
      return `--- ${label} ---\n${header}\n${(n.body || '').slice(0, 2000).trim()}`;
    }).join('\n\n');

    const systemPrompt = isNewsletter
      ? `You are an expert technology newsletter analyst. Given one or more AI/tech newsletter editions, produce a concise, insightful summary.
Structure your response as:
**Top Stories & Highlights**
- bullet points of the most important news or announcements

**Key Trends & Themes**
- bullet points identifying recurring themes or important trends

**Notable Tools / Models / Releases**
- bullet points listing any new tools, models, products, or research papers mentioned

**Key Takeaways**
2-3 sentence narrative summarising what matters most.

Be concise and specific. Use technical language where appropriate. Omit sections that have no relevant content.`
      : `You are an expert meeting summarizer. Given a set of meeting notes all related to the same initiative, produce a concise consolidated summary.
Structure your response as:
**Key Decisions**
- bullet points

**Action Items**
- bullet points

**Open Questions / Risks**
- bullet points

**Overall Summary**
2-3 sentence narrative.

Be concise and factual. Omit sections that have no relevant content.`;

    const userPrompt = isNewsletter
      ? `Summarize the following newsletter(s):\n\n${notesText}`
      : `Initiative: ${initiativeTitle || 'Untitled'}\n\n${notesText}`;

    let rawText = null;
    let llmError = null;
    if (provider === 'ollama') rawText = await callOllama(settings, systemPrompt, userPrompt);
    else if (provider === 'openai' || provider === 'openai_compatible') {
      const r = await callOpenAI(settings, systemPrompt, userPrompt, false);
      if (r.error) llmError = r.error;
      else rawText = r.text;
    } else if (provider === 'gemini') {
      const r = await callGemini(settings, systemPrompt, userPrompt, false);
      if (r.error) llmError = r.error;
      else rawText = r.text;
    }

    if (!rawText)
      return res.status(502).json({ error: llmError || 'AI provider did not respond. Check AI settings.' });

    return res.json({ summary: rawText.trim(), provider });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/rephrase
// Body: { text: string, style: 'professional'|'elaborate'|'concise'|'simplify' }
router.post('/rephrase', async (req, res, next) => {
  try {
    const { text, style = 'professional' } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'text is required' });

    const settings = await loadAISettings(req.user.id);
    const provider = settings.ai_provider || 'ollama';
    if (provider === 'disabled') return res.status(503).json({ error: 'AI provider is disabled.' });

    const styleInstructions = {
      professional: 'Rewrite the following text to be professional, clear, and business-appropriate. Use formal language, remove casual or vague phrasing, and ensure it is concise yet complete.',
      elaborate:    'Expand and elaborate on the following text. Add relevant detail, context, and explanation to make it more comprehensive and informative while staying on topic.',
      concise:      'Make the following text shorter and more concise. Remove repetition, filler words, and unnecessary detail. Keep only the essential information.',
      simplify:     'Rewrite the following text using simple, plain language. Avoid jargon and complex sentence structures. Make it easy to understand for anyone.',
    };

    const instruction = styleInstructions[style] || styleInstructions.professional;
    const systemPrompt = `You are an expert writing assistant. ${instruction}\n\nReturn ONLY the rewritten text with no explanations, introductions, or meta-commentary. Do not add quotes around the output.`;
    const userPrompt = text.trim();

    let rawText = null;
    let llmError = null;

    if (provider === 'ollama') rawText = await callOllama(settings, systemPrompt, userPrompt);
    else if (provider === 'openai' || provider === 'openai_compatible') {
      const r = await callOpenAI(settings, systemPrompt, userPrompt, false);
      if (r.error) llmError = r.error;
      else rawText = r.text;
    } else if (provider === 'gemini') {
      // Give rephrase calls a longer per-attempt timeout (60 s) so retries have room to succeed
      const r = await callGemini(settings, systemPrompt, userPrompt, false, 60_000);
      if (r.error) llmError = r.error;
      else rawText = r.text;
    }

    if (!rawText)
      return res.status(502).json({ error: llmError || 'AI provider did not respond. Check AI settings in Setup.' });

    return res.json({ rephrased: rawText.trim(), provider });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/status-report
// Body: { canvasId?, period, startDate, endDate, userName? }
//   period: 'week' | 'month' | 'last_month' | 'custom'
router.post('/status-report', async (req, res, next) => {
  try {
    const { canvasId, period = 'week', startDate, endDate, userName = 'the team' } = req.body;

    // ── Resolve date range ──────────────────────────────────────────────────
    const now = new Date();
    let from, to;
    if (period === 'week') {
      to = new Date(now);
      from = new Date(now); from.setDate(from.getDate() - 7);
    } else if (period === 'month') {
      to = new Date(now);
      from = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'last_month') {
      from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      to   = new Date(now.getFullYear(), now.getMonth(), 0);
    } else {
      from = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
      to   = endDate   ? new Date(endDate)   : now;
    }
    to.setHours(23, 59, 59, 999);

    // ── Fetch data ───────────────────────────────────────────────────────────
    // Root-level initiatives (canvas-scoped when canvasId is given)
    const rootWhere = { parentId: null };
    if (canvasId) rootWhere.canvasId = canvasId;

    const rootItems = await prisma.initiative.findMany({
      where: rootWhere,
      include: {
        assignees: { select: { name: true } },
        children: {
          include: {
            assignees: { select: { name: true } },
            children: { select: { id: true, title: true, status: true, priority: true } },
          },
        },
      },
      orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }],
    });

    if (rootItems.length === 0)
      return res.status(400).json({ error: 'No initiatives found for the selected canvas/period.' });

    // ── Classify ─────────────────────────────────────────────────────────────
    const completedThisPeriod = rootItems.filter(i =>
      i.status === 'COMPLETED' && i.updatedAt >= from && i.updatedAt <= to
    );
    const inProgress = rootItems.filter(i => i.status === 'IN_PROGRESS');
    const blocked    = rootItems.filter(i => i.status === 'BLOCKED');
    const onHold     = rootItems.filter(i => i.status === 'ON_HOLD');
    const open       = rootItems.filter(i => i.status === 'OPEN');
    const allCompleted = rootItems.filter(i => i.status === 'COMPLETED');
    const critical   = rootItems.filter(i => i.priority === 'CRITICAL' && i.status !== 'COMPLETED');

    // ── Build context for LLM ────────────────────────────────────────────────
    const periodLabel = period === 'week' ? 'this week'
      : period === 'month'      ? 'this month'
      : period === 'last_month' ? 'last month'
      : `${from.toDateString()} – ${to.toDateString()}`;

    const formatItem = (i) => {
      const assigneeStr = i.assignees?.length ? ` [${i.assignees.map(a => a.name).join(', ')}]` : '';
      const childCount  = i.children?.length  ? ` (${i.children.length} sub-items)` : '';
      const desc        = i.description        ? `\n    Note: ${i.description.slice(0, 120)}` : '';
      return `- ${i.title}${assigneeStr}${childCount} | Priority: ${i.priority}${desc}`;
    };

    const sections = [];
    if (completedThisPeriod.length) sections.push(`COMPLETED THIS PERIOD (${completedThisPeriod.length}):\n${completedThisPeriod.map(formatItem).join('\n')}`);
    if (inProgress.length)          sections.push(`IN PROGRESS (${inProgress.length}):\n${inProgress.map(formatItem).join('\n')}`);
    if (blocked.length)             sections.push(`BLOCKED (${blocked.length}):\n${blocked.map(formatItem).join('\n')}`);
    if (onHold.length)              sections.push(`ON HOLD (${onHold.length}):\n${onHold.map(formatItem).join('\n')}`);
    if (open.length)                sections.push(`OPEN / NOT STARTED (${open.length}):\n${open.map(formatItem).join('\n')}`);

    const metrics = [
      `Total initiatives: ${rootItems.length}`,
      `Completed overall: ${allCompleted.length} (${Math.round(allCompleted.length / rootItems.length * 100)}%)`,
      `In progress: ${inProgress.length}`,
      `Blocked: ${blocked.length}`,
      `Critical priority open items: ${critical.length}`,
    ].join('\n');

    const settings = await loadAISettings(req.user.id);
    const provider = settings.ai_provider || 'ollama';
    if (provider === 'disabled') return res.status(503).json({ error: 'AI provider is disabled.' });

    const systemPrompt = `You are a world-class Chief of Staff writing executive status reports. Your reports are read by C-suite and board members. Be concise, factual, and action-oriented. Use clear headers and bullet points. Avoid fluff.

Write a status report for the period: ${periodLabel}.

Structure your response EXACTLY as:

## Executive Summary
2-3 sentences giving the overall health and highlight.

## ✅ Completed This Period
What was delivered. If nothing, say "Nothing completed in this period."

## 🔄 In Progress
Key initiatives underway with brief status note.

## 🚨 Blocked / At Risk
Items needing immediate attention. Flag critical items.

## 📋 Open / Not Started
Items not yet started, especially critical/high priority ones.

## 📊 Key Metrics
Paste the metrics as-is (they will be provided).

## 💡 Recommended Actions
2-4 specific, actionable recommendations for the VP/Director based on the data.

Keep the total report under 600 words. Be direct — don't say "The team has been working on..." just say what happened.`;

    const userPrompt = `Author: ${userName}
Period: ${periodLabel}
Date Generated: ${now.toDateString()}

INITIATIVE DATA:
${sections.join('\n\n')}

METRICS:
${metrics}`;

    let rawText = null, llmError = null;
    if (provider === 'ollama') rawText = await callOllama(settings, systemPrompt, userPrompt);
    else if (provider === 'openai' || provider === 'openai_compatible') {
      const r = await callOpenAI(settings, systemPrompt, userPrompt, false);
      if (r.error) llmError = r.error;
      else rawText = r.text;
    } else if (provider === 'gemini') {
      const r = await callGemini(settings, systemPrompt, userPrompt, false);
      if (r.error) llmError = r.error;
      else rawText = r.text;
    }

    if (!rawText)
      return res.status(502).json({ error: llmError || 'AI provider did not respond. Check AI settings.' });

    return res.json({
      report: rawText.trim(),
      provider,
      period: periodLabel,
      from: from.toISOString(),
      to: to.toISOString(),
      metrics: {
        total: rootItems.length,
        completed: allCompleted.length,
        completedThisPeriod: completedThisPeriod.length,
        inProgress: inProgress.length,
        blocked: blocked.length,
        critical: critical.length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/action-items
router.post('/action-items', async (req, res, next) => {
  try {
    const { subject, text, userName } = req.body;
    if (!text && !subject) return res.status(400).json({ error: 'text or subject required' });

    const settings = await loadAISettings(req.user.id);
    const result = await extractActionItems(
      text, subject, userName || req.user?.name || 'me', settings,
    );

    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// ─── AI action system-prompt builders ────────────────────────────────────────────
function buildSystemPrompt(type, action) {
  const isJira = type === 'JIRA';
  const subj = isJira
    ? 'a JIRA ticket and its child tickets (if any)'
    : 'a Confluence page and its child pages (if any)';

  const prompts = {
    summarize: isJira
      ? `You are an expert engineering lead analysing a JIRA ticket.
Given ${subj}, produce a concise structured summary.

**Summary** — 1-2 sentences on what this ticket is about.
**Current Status** — State of parent and child tickets.
**Open Work & Blockers** — Unresolved items or risks.
**Assignee & Ownership** — Who owns what.
**Recommended Next Steps** — 2-3 action items.

Be concise. Only include sections with relevant content.`
      : `You are an expert documentation assistant analysing a Confluence page.
Given ${subj}, produce a concise structured summary.

**Page Overview** — What this page is about.
**Key Content Areas** — Main topics (infer from excerpt and child titles).
**Child Pages** — What each child covers (if present).
**Relevance to Initiative** — How this relates to the initiative.

Be concise. Only include sections with relevant content.`,

    implementation_plan:
      `You are a senior engineering lead creating an implementation plan.
Given ${subj}, write a step-by-step plan.

**Overview** — Brief description of the work.
**Prerequisites** — Dependencies or setup needed before starting.
**Implementation Steps** — Numbered concrete engineering steps.
**Testing & Verification** — How to verify the implementation.
**Estimated Effort** — Rough complexity estimate (if inferable).

Be specific, technical, and actionable.`,

    risk_assessment:
      `You are a senior engineering lead performing a risk assessment.
Given ${subj}, identify risks and mitigation strategies.

**Risk Overview** — Overall risk level (Low / Medium / High).
**Technical Risks** — Specific technical challenges or unknowns.
**Dependency Risks** — External dependencies or integration points.
**Schedule Risks** — Factors that could cause delays.
**Mitigation Strategies** — Concrete steps to reduce risks.

Be evidence-based, drawing from the provided content.`,

    acceptance_criteria:
      `You are a product manager defining acceptance criteria (Definition of Done).
Given ${subj}, generate clear acceptance criteria.

**Functional Acceptance Criteria** — Bullet conditions for correctness.
**Non-Functional Requirements** — Performance, security, or reliability expectations.
**Out of Scope** — Things explicitly NOT in this ticket/page.
**Definition of Done** — Checklist that must be true before closing.

Be specific and measurable.`,

    status_report:
      `You are a project manager drafting a stakeholder status update.
Given ${subj}, write a concise status report.

**Executive Summary** — 1-2 sentences on current state.
**Completed Work** — What’s been done.
**In Progress** — Current active work and owner.
**Blocked** — Any impediments.
**Next Steps** — What happens next.

Keep it brief, professional, and free of internal jargon.`,
  };

  return prompts[action] || prompts.summarize;
}

function buildConsolidatedSystemPrompt(action, items) {
  const hasJira = items.some(i => i.type === 'JIRA');
  const hasConf = items.some(i => i.type === 'CONFLUENCE');
  const mix = hasJira && hasConf ? 'JIRA tickets and Confluence pages'
    : hasJira ? 'JIRA tickets'
    : 'Confluence pages';

  const prompts = {
    summarize:
      `You are an expert engineering/product manager assistant.
Given multiple ${mix} linked to a project initiative, produce a consolidated summary.

**Overall Picture** — High-level synthesis across all items.
**Per-Item Summary** — One concise bullet per item.
**Cross-Cutting Themes** — Patterns, blockers, or topics that recur across items.
**Recommended Actions** — 2-4 prioritised next steps.

Be concise and cross-reference items where relevant.`,

    implementation_plan:
      `You are a senior engineering lead.
Given multiple ${mix}, produce a consolidated implementation plan.

**Objective** — What needs to be built/done overall.
**Phase Breakdown** — Group work into logical phases or workstreams.
**Step-by-Step Plan** — Numbered steps spanning all selected items.
**Dependencies & Sequencing** — What must happen before what.
**Estimated Effort** — Overall complexity estimate.

Be specific and actionable.`,

    risk_assessment:
      `You are a senior engineering lead.
Given multiple ${mix}, produce a consolidated risk assessment.

**Overall Risk Level** — Low / Medium / High with brief rationale.
**Risk Register** — Per-item risks: risk, likelihood, impact, mitigation.
**Cross-Item Dependencies** — Risks from interactions between items.
**Top 3 Mitigations** — Highest-impact risk reduction steps.`,

    acceptance_criteria:
      `You are a product manager.
Given multiple ${mix}, generate consolidated acceptance criteria.

**Overall Definition of Done** — What success looks like across all items.
**Per-Item Criteria** — Key conditions for each item.
**Non-Functional Requirements** — Shared quality attributes.
**Sign-off Checklist** — Final checklist before all work is complete.`,

    status_report:
      `You are a project manager drafting a stakeholder update covering multiple ${mix}.

**Executive Summary** — Overall state in 2-3 sentences.
**Progress by Item** — Status for each selected item.
**Blockers & Risks** — What’s impeding progress.
**Next Steps** — What the team is doing next.

Keep it brief, professional, and stakeholder-appropriate.`,
  };

  return prompts[action] || prompts.summarize;
}

// POST /api/ai/summarize-item
// Body: { initiativeTitle, action?, item: {type,key,title,...}, children: [...] }
// action: summarize | implementation_plan | risk_assessment | acceptance_criteria | status_report
router.post('/summarize-item', async (req, res, next) => {
  try {
    const { initiativeTitle, item, children = [], action = 'summarize' } = req.body;
    if (!item?.type) return res.status(400).json({ error: 'item with type is required' });

    const settings = await loadAISettings(req.user.id);
    const provider = settings.ai_provider || 'ollama';
    if (provider === 'disabled') return res.json({ summary: null, provider: 'disabled' });

    let contentText;
    if (item.type === 'JIRA') {
      const lines = [
        `## JIRA Ticket: ${item.key} — ${item.title || '(no summary)'}`,
        `Status: ${item.status || 'Unknown'}  |  Priority: ${item.priority || 'Unknown'}  |  Assignee: ${item.assignee || 'Unassigned'}`,
      ];
      if (item.description) lines.push(`Description: ${(item.description || '').slice(0, 800).trim()}`);
      if (children.length > 0) {
        lines.push(`\nChild tickets (${children.length}):`);
        for (const c of children) {
          lines.push(`  - [${c.key}] ${c.summary || '(no summary)'} · Status: ${c.status || '?'} · Assignee: ${c.assignee || 'Unassigned'}`);
          if (c.description) lines.push(`      ${c.description.slice(0, 200).trim()}`);
        }
      }
      contentText = lines.join('\n');
    } else {
      const lines = [
        `## Confluence Page: ${item.title || item.key}`,
        `Space: ${item.space || 'Unknown'}`,
      ];
      if (item.description) lines.push(`Content excerpt: ${(item.description || '').slice(0, 800).trim()}`);
      if (children.length > 0) {
        lines.push(`\nChild pages (${children.length}):`);
        for (const c of children) {
          lines.push(`  - ${c.title}${c.spaceKey ? ` (${c.spaceKey})` : ''}`);
          if (c.excerpt) lines.push(`      ${c.excerpt.slice(0, 200).trim()}`);
        }
      }
      contentText = lines.join('\n');
    }

    const systemPrompt = buildSystemPrompt(item.type, action);
    const userPrompt = `Initiative: ${initiativeTitle || 'Untitled'}\n\n${contentText}`;

    let rawText = null;
    let llmError = null;
    if (provider === 'ollama') rawText = await callOllama(settings, systemPrompt, userPrompt);
    else if (provider === 'openai' || provider === 'openai_compatible') {
      const r = await callOpenAI(settings, systemPrompt, userPrompt, false);
      if (r.error) llmError = r.error;
      else rawText = r.text;
    } else if (provider === 'gemini') {
      const r = await callGemini(settings, systemPrompt, userPrompt, false);
      if (r.error) llmError = r.error;
      else rawText = r.text;
    }

    if (!rawText)
      return res.status(502).json({ error: llmError || 'AI provider did not respond. Check AI settings.' });

    return res.json({ summary: rawText.trim(), provider });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/summarize-jira
// Body: { initiativeTitle, tickets: [{ key, summary, description, status, priority, assignee, children: [...] }] }
router.post('/summarize-jira', async (req, res, next) => {
  try {
    const { initiativeTitle, tickets } = req.body;
    if (!Array.isArray(tickets) || tickets.length === 0)
      return res.status(400).json({ error: 'tickets array required' });

    const settings = await loadAISettings(req.user.id);
    const provider = settings.ai_provider || 'ollama';
    if (provider === 'disabled') return res.json({ summary: null, provider: 'disabled' });

    // Build a structured text block for all tickets + their children
    const ticketsText = tickets.map((t, i) => {
      const lines = [
        `## Ticket ${i + 1}: ${t.key} — ${t.summary || '(no summary)'}`,
        `Status: ${t.status || 'Unknown'}  |  Priority: ${t.priority || 'Unknown'}  |  Assignee: ${t.assignee || 'Unassigned'}`,
      ];
      if (t.description) lines.push(`Description: ${(t.description || '').slice(0, 800).trim()}`);
      if (Array.isArray(t.children) && t.children.length > 0) {
        lines.push(`Child tickets (${t.children.length}):`);
        for (const c of t.children) {
          lines.push(`  - [${c.key}] ${c.summary || '(no summary)'} · Status: ${c.status || '?'} · Assignee: ${c.assignee || 'Unassigned'}`);
          if (c.description) lines.push(`      ${c.description.slice(0, 200).trim()}`);
        }
      }
      return lines.join('\n');
    }).join('\n\n');

    const systemPrompt = `You are an expert engineering/product manager assistant analysing JIRA tickets linked to a project initiative.
Given one or more JIRA tickets (with optional child/subtask tickets), produce a concise, structured summary.

Structure your response as:

**Overall Status**
1-2 sentences on the overall state of work across all tickets.

**Progress by Ticket**
- For each ticket: one line noting key status, what's done, what's in flight.

**Open Work & Blockers**
- Bullet list of unresolved items, blockers, or risks visible from the tickets.

**Assignee Summary**
- Who is working on what (if assignees are available).

**Recommended Next Steps**
- 2-3 concrete action items.

Be concise and factual. Only include sections with relevant content.`;

    const userPrompt = `Initiative: ${initiativeTitle || 'Untitled'}\n\n${ticketsText}`;

    let rawText = null;
    let llmError = null;
    if (provider === 'ollama') rawText = await callOllama(settings, systemPrompt, userPrompt);
    else if (provider === 'openai' || provider === 'openai_compatible') {
      const r = await callOpenAI(settings, systemPrompt, userPrompt, false);
      if (r.error) llmError = r.error;
      else rawText = r.text;
    } else if (provider === 'gemini') {
      const r = await callGemini(settings, systemPrompt, userPrompt, false);
      if (r.error) llmError = r.error;
      else rawText = r.text;
    }

    if (!rawText)
      return res.status(502).json({ error: llmError || 'AI provider did not respond. Check AI settings.' });

    return res.json({ summary: rawText.trim(), provider });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/action-on-items
// Body: { initiativeTitle, action, items: [{type,key,title,description,status,priority,assignee,space,url,children:[]}] }
router.post('/action-on-items', async (req, res, next) => {
  try {
    const { initiativeTitle, items, action = 'summarize' } = req.body;
    if (!Array.isArray(items) || items.length === 0)
      return res.status(400).json({ error: 'items array required' });

    const settings = await loadAISettings(req.user.id);
    const provider = settings.ai_provider || 'ollama';
    if (provider === 'disabled') return res.json({ summary: null, provider: 'disabled' });

    const contentText = items.map((item, i) => {
      if (item.type === 'JIRA') {
        const lines = [
          `### Item ${i + 1} (JIRA): ${item.key} — ${item.title || '(no summary)'}`,
          `Status: ${item.status || 'Unknown'}  |  Priority: ${item.priority || 'Unknown'}  |  Assignee: ${item.assignee || 'Unassigned'}`,
        ];
        if (item.description) lines.push(`Description: ${(item.description || '').slice(0, 600).trim()}`);
        if (Array.isArray(item.children) && item.children.length > 0) {
          lines.push(`Child tickets (${item.children.length}):`);
          for (const c of item.children)
            lines.push(`  - [${c.key}] ${c.summary || '(no summary)'} · Status: ${c.status || '?'}`);
        }
        return lines.join('\n');
      } else {
        const lines = [
          `### Item ${i + 1} (Confluence): ${item.title || item.key}`,
          `Space: ${item.space || 'Unknown'}`,
        ];
        if (item.description) lines.push(`Content: ${(item.description || '').slice(0, 600).trim()}`);
        if (Array.isArray(item.children) && item.children.length > 0) {
          lines.push(`Child pages (${item.children.length}):`);
          for (const c of item.children)
            lines.push(`  - ${c.title}${c.spaceKey ? ` (${c.spaceKey})` : ''}`);
        }
        return lines.join('\n');
      }
    }).join('\n\n---\n\n');

    const systemPrompt = buildConsolidatedSystemPrompt(action, items);
    const userPrompt = `Initiative: ${initiativeTitle || 'Untitled'}\n\nSelected items (${items.length}):\n\n${contentText}`;

    let rawText = null;
    let llmError = null;
    if (provider === 'ollama') rawText = await callOllama(settings, systemPrompt, userPrompt);
    else if (provider === 'openai' || provider === 'openai_compatible') {
      const r = await callOpenAI(settings, systemPrompt, userPrompt, false);
      if (r.error) llmError = r.error;
      else rawText = r.text;
    } else if (provider === 'gemini') {
      const r = await callGemini(settings, systemPrompt, userPrompt, false);
      if (r.error) llmError = r.error;
      else rawText = r.text;
    }

    if (!rawText)
      return res.status(502).json({ error: llmError || 'AI provider did not respond.' });

    return res.json({ summary: rawText.trim(), provider });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/chat-with-items
// Multi-turn chat scoped to selected JIRA/Confluence documents.
// Body: { initiativeTitle, items, history: [{role,content}], userMessage }
router.post('/chat-with-items', async (req, res, next) => {
  try {
    const { initiativeTitle, items = [], history = [], userMessage } = req.body;
    if (!userMessage?.trim()) return res.status(400).json({ error: 'userMessage is required' });

    const settings = await loadAISettings(req.user.id);
    const provider = settings.ai_provider || 'ollama';
    if (provider === 'disabled') return res.json({ response: null, provider: 'disabled' });

    // Build context block from all passed items (with their children)
    const contextText = items.length > 0
      ? items.map((item) => {
          if (item.type === 'JIRA') {
            const lines = [
              `### [JIRA] ${item.key}: ${item.title || '(no summary)'}`,
              `Status: ${item.status || '?'}  |  Priority: ${item.priority || '?'}  |  Assignee: ${item.assignee || 'Unassigned'}`,
            ];
            if (item.description) lines.push(`Description: ${item.description.slice(0, 600).trim()}`);
            if (item.children?.length)
              lines.push(`Child tickets: ${item.children.map(c => `[${c.key}] ${c.summary || ''} (${c.status || '?'})`).join(' | ')}`);
            return lines.join('\n');
          } else {
            const lines = [
              `### [Confluence] ${item.title || item.key}`,
              `Space: ${item.space || '?'}`,
            ];
            if (item.description) lines.push(`Content excerpt: ${item.description.slice(0, 600).trim()}`);
            if (item.children?.length)
              lines.push(`Child pages: ${item.children.map(c => c.title).join(' | ')}`);
            return lines.join('\n');
          }
        }).join('\n\n---\n\n')
      : 'No specific documents provided — answer based on the initiative context.';

    const systemPrompt = `You are an expert engineering and product management assistant.
You are helping the user understand and work with documents linked to a project initiative.

INITIATIVE: ${initiativeTitle || 'Untitled'}

DOCUMENT CONTEXT:
${contextText}

GUIDELINES:
- Answer specifically about the documents above when relevant
- Reference ticket keys (e.g. PROJ-123) and page names explicitly  
- If asked something not covered by the documents, say so and give your best general answer
- Be concise and use markdown (bold, bullets, code) for clarity
- For multi-step or complex answers use numbered lists`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage.trim() },
    ];

    let rawText = null;
    let llmError = null;

    if (provider === 'ollama') {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT);
      try {
        const r = await fetch(`${settings.ai_ollama_base_url}/api/chat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal,
          body: JSON.stringify({
            model: settings.ai_ollama_model, stream: false,
            options: { temperature: 0.3, num_predict: 2048 },
            messages,
          }),
        });
        if (r.ok) {
          const d = await r.json();
          rawText = (d.message?.content || d.response || '').trim();
        } else { logger.error('Ollama chat non-OK', { status: r.status }); }
      } finally { clearTimeout(timer); }
    } else if (provider === 'openai' || provider === 'openai_compatible') {
      if (settings.ai_openai_api_key) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT);
        try {
          const base = (settings.ai_openai_base_url || 'https://api.openai.com').replace(/\/$/, '');
          const r = await fetch(`${base}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.ai_openai_api_key}` },
            signal: controller.signal,
            body: JSON.stringify({ model: settings.ai_openai_model, temperature: 0.3, messages }),
          });
          if (r.ok) {
            const d = await r.json();
            rawText = d.choices?.[0]?.message?.content?.trim() || null;
          } else {
            let detail = `HTTP ${r.status}`;
            try { const errBody = await r.json(); detail = errBody.error?.message || errBody.error || detail; } catch {}
            logger.error('OpenAI chat non-OK', { status: r.status, detail });
            llmError = `OpenAI error: ${detail}`;
          }
        } finally { clearTimeout(timer); }
      } else { llmError = 'OpenAI API key not configured. Add it in Setup → AI Settings.'; }
    } else if (provider === 'gemini') {
      // Simulate multi-turn by prepending history into the prompt
      const historyBlock = history.length > 0
        ? history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n') + '\n\n'
        : '';
      const geminiPrompt = history.length > 0
        ? `${historyBlock}User: ${userMessage.trim()}`
        : userMessage.trim();
      const r = await callGemini(settings, systemPrompt, geminiPrompt, false);
      if (r.error) llmError = r.error;
      else rawText = r.text;
    }

    if (!rawText)
      return res.status(502).json({ error: llmError || 'AI provider did not respond.' });

    return res.json({ response: rawText.trim(), provider });
  } catch (err) {
    next(err);
  }
});

export default router;
