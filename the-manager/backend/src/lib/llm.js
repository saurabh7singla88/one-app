// ─── Shared AI/LLM helpers ───────────────────────────────────────────────────
// Single source of truth for all AI provider calls and settings loading.
// Import { loadAISettings, callLLM } (or individual callXxx helpers) into any route.

import { prisma } from './prisma.js';
import { decrypt } from '../middleware/cipher.js';
import logger from './logger.js';

export const LLM_TIMEOUT   = 30_000;   // ms — cloud providers
export const OLLAMA_TIMEOUT = 120_000;  // ms — local models can be slow

// ─── Default fallback settings (env vars still honoured if no DB entry exists)
export const DEFAULTS = {
  ai_provider:        process.env.AI_PROVIDER   || 'ollama',
  ai_ollama_base_url: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
  ai_ollama_model:    process.env.OLLAMA_MODEL    || 'llama3.1:latest',
  ai_openai_base_url: 'https://api.openai.com',
  ai_openai_model:    'gpt-4o-mini',
  ai_openai_api_key:  '',
  ai_gemini_model:    'gemini-1.5-flash',
  ai_gemini_api_key:  '',
  ai_bedrock_region:  'us-east-1',
  ai_bedrock_model:   'anthropic.claude-3-5-sonnet-20241022-v2:0',
  ai_bedrock_api_key: '',
};

// ─── Keys that are stored encrypted in the DB ─────────────────────────────────
export const ENCRYPTED_SETTING_KEYS = new Set([
  'ai_openai_api_key', 'ai_gemini_api_key', 'ai_bedrock_api_key',
]);

// ─── Load AI settings: env defaults → app-level (AppSetting) → user overrides ─
// This is the canonical 3-layer loader. All routes must use this, not inline loaders.
export async function loadAISettings(userId) {
  const map = { ...DEFAULTS };
  // Layer 2: app-level defaults configured by admin (AppSetting table)
  const appRows = await prisma.appSetting.findMany({ where: { key: { startsWith: 'ai_' } } });
  for (const row of appRows) {
    map[row.key] = ENCRYPTED_SETTING_KEYS.has(row.key) ? decrypt(row.value) : row.value;
  }
  // Layer 3: per-user overrides (always win — UserSetting table)
  const userRows = await prisma.userSetting.findMany({ where: { userId, key: { startsWith: 'ai_' } } });
  for (const row of userRows) {
    map[row.key] = ENCRYPTED_SETTING_KEYS.has(row.key) ? decrypt(row.value) : row.value;
  }
  return map;
}

// ─── Derive the model name for the active provider ────────────────────────────
export function getActiveModel(settings) {
  const p = settings.ai_provider || 'ollama';
  if (p === 'openai')  return settings.ai_openai_model;
  if (p === 'gemini')  return settings.ai_gemini_model;
  if (p === 'bedrock') return settings.ai_bedrock_model;
  return settings.ai_ollama_model;
}

// ─── Provider: Ollama ─────────────────────────────────────────────────────────
export async function callOllama(settings, systemPrompt, userPrompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT);
  // In Docker, `localhost` refers to the container, not the host.
  // Replace with `host.docker.internal` so Ollama (running on the host) is reachable.
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
      logger.error('Ollama non-OK response', { status: res.status, model: settings.ai_ollama_model, detail });
      return { text: null, error: `Ollama error: ${detail}` };
    }
    const data = await res.json();
    const text = (data.message?.content || data.response || '').trim();
    if (text) logger.info('AI call succeeded', { provider: 'ollama', model: settings.ai_ollama_model });
    return { text: text || null, error: text ? null : 'Ollama returned an empty response.' };
  } catch (e) {
    logger.error('Ollama call failed', { error: e.message, model: settings.ai_ollama_model });
    const msg = e.name === 'AbortError'
      ? `Ollama request timed out. Make sure Ollama is running at ${ollamaBaseUrl}.`
      : `Ollama call failed: ${e.message}`;
    return { text: null, error: msg };
  } finally { clearTimeout(timer); }
}

// ─── Provider: OpenAI / OpenAI-compatible (LM Studio, Together AI, etc.) ──────
// Set jsonMode=false for free-text (non-JSON) responses (e.g. rephrase, summaries).
export async function callOpenAI(settings, systemPrompt, userPrompt, jsonMode = true) {
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
      logger.error('OpenAI non-OK response', { status: res.status, detail, model: settings.ai_openai_model });
      return { text: null, error: `OpenAI error: ${detail}` };
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim() || null;
    if (text) logger.info('AI call succeeded', { provider: 'openai', model: settings.ai_openai_model });
    return { text, error: text ? null : 'OpenAI returned an empty response.' };
  } catch (e) {
    logger.error('OpenAI call failed', e);
    const msg = e.name === 'AbortError' ? 'OpenAI request timed out.' : `OpenAI call failed: ${e.message}`;
    return { text: null, error: msg };
  } finally { clearTimeout(timer); }
}

// ─── Provider: Google Gemini ──────────────────────────────────────────────────
// Pass schemaOverride=false for free-text (non-JSON) responses.
// Retries up to GEMINI_MAX_RETRIES times on 429/503 with exponential back-off.
const GEMINI_MAX_RETRIES  = 3;
const GEMINI_RETRY_BASE_MS = 2000; // 2 s → 4 s → 8 s

export async function callGemini(settings, systemPrompt, userPrompt, schemaOverride = null, timeoutMs = LLM_TIMEOUT) {
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
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body,
      });
      const data = await res.json();
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
      logger.info('AI call succeeded', { provider: 'gemini', model });
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

// ─── Provider: AWS Bedrock (Converse API via Bearer API Key) ─────────────────
// Uses Bedrock API keys (Bearer token) — no SigV4 signing required.
// userPromptOrMessages: string (single-turn) or [{role,content}] array (multi-turn).
export async function callBedrock(settings, systemPrompt, userPromptOrMessages) {
  if (!settings.ai_bedrock_api_key) {
    return { text: null, error: 'AWS Bedrock API key not configured. Add it in Admin → AI Settings.' };
  }
  const region  = settings.ai_bedrock_region || 'us-east-1';
  const modelId = settings.ai_bedrock_model  || 'anthropic.claude-3-5-sonnet-20241022-v2:0';
  const url = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;
  const messages = Array.isArray(userPromptOrMessages)
    ? userPromptOrMessages
    : [{ role: 'user', content: [{ text: userPromptOrMessages }] }];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${settings.ai_bedrock_api_key}` },
      signal: controller.signal,
      body: JSON.stringify({
        system: [{ text: systemPrompt }],
        messages,
        inferenceConfig: { maxTokens: 4096, temperature: 0.1 },
      }),
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try { const e = await res.json(); detail = e?.message || e?.error?.message || detail; } catch {}
      if (res.status === 401 || res.status === 403) detail = `API key invalid or lacks bedrock:InvokeModel permission (${res.status})`;
      else if (res.status === 404) detail = `Model "${modelId}" not found in region ${region}`;
      else if (res.status === 429) detail = 'Rate limit exceeded — try again shortly';
      logger.error('Bedrock non-OK response', { status: res.status, model: modelId, region });
      return { text: null, error: `Bedrock error: ${detail}` };
    }
    const data = await res.json();
    const text = data.output?.message?.content?.[0]?.text?.trim() ?? null;
    if (text) logger.info('AI call succeeded', { provider: 'bedrock', model: modelId });
    return { text, error: text ? null : 'Bedrock returned an empty response.' };
  } catch (e) {
    logger.error('Bedrock call failed', { error: e.message, model: modelId });
    const msg = e.name === 'AbortError' ? 'Bedrock request timed out.' : `Bedrock call failed: ${e.message}`;
    return { text: null, error: msg };
  } finally { clearTimeout(timer); }
}

// ─── Generic dispatcher — routes should prefer this over calling providers directly ─
// Returns { text: string|null, error: string|null }
// options.jsonMode   — for OpenAI: enforce JSON response format (default true)
// options.schema     — for Gemini: responseSchema override (null = default, false = plain text)
// options.timeoutMs  — for Gemini: per-attempt timeout override
export async function callLLM(settings, systemPrompt, userPrompt, options = {}) {
  const { jsonMode = true, schema = null, timeoutMs = LLM_TIMEOUT } = options;
  const provider = settings.ai_provider || 'ollama';
  if (provider === 'disabled') return { text: null, error: 'AI provider is disabled.' };
  if (provider === 'ollama')   return callOllama(settings, systemPrompt, userPrompt);
  if (provider === 'openai')   return callOpenAI(settings, systemPrompt, userPrompt, jsonMode);
  if (provider === 'gemini')   return callGemini(settings, systemPrompt, userPrompt, schema, timeoutMs);
  if (provider === 'bedrock')  return callBedrock(settings, systemPrompt, userPrompt);
  return { text: null, error: `Unknown AI provider: ${provider}` };
}
