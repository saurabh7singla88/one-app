import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import scanRouter from './routes/scan.js';
import stocksRouter from './routes/stocks.js';
import stockRouter from './routes/stock.js';
import { healthCheck } from './services/dataService.js';
import { generateMarketSummary } from './services/geminiService.js';
import { fetchBatchNews } from './services/newsService.js';
import { getStocks } from './services/dataService.js';

const PORT = process.env.PORT || 3001;

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());

// ── Health ─────────────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  try {
    const dataHealth = await healthCheck();
    res.json({ status: 'ok', services: { backend: 'ok', data_service: dataHealth.status } });
  } catch {
    res.json({ status: 'degraded', services: { backend: 'ok', data_service: 'unreachable' } });
  }
});

// ── Market summary (top-level dashboard enrichment) ────────────────────────────
app.get('/api/summary', async (_req, res) => {
  try {
    const { results: stocks } = await getStocks({ page_size: 10, sort_by: 'score', sort_dir: 'desc' });

    if (!stocks || stocks.length === 0) {
      return res.json({ summary: '' });
    }

    let summary = '';
    if (process.env.GEMINI_API_KEY) {
      summary = await generateMarketSummary(stocks);
    }

    res.json({ summary });
  } catch (err) {
    console.error('[summary] Failed:', err.message);
    res.json({ summary: '' });
  }
});

// ── Top stocks with news (batch enrichment for dashboard) ─────────────────────
app.get('/api/top-stocks', async (req, res) => {
  const { limit = 20 } = req.query;
  try {
    const { results: stocks, ...meta } = await getStocks({
      page_size: Number(limit),
      sort_by: 'score',
      sort_dir: 'desc',
    });

    if (!stocks || stocks.length === 0) {
      return res.json({ results: [], ...meta });
    }

    // Fetch news for all top stocks concurrently
    const newsMap = await fetchBatchNews(
      stocks.map((s) => ({ ticker: s.ticker, company_name: s.company_name })),
      3,
    );

    const enriched = stocks.map((s) => ({
      ...s,
      news: newsMap.get(s.ticker) || [],
    }));

    res.json({ results: enriched, ...meta });
  } catch (err) {
    console.error('[top-stocks] Failed:', err.message);
    res.status(502).json({ error: 'Failed to fetch top stocks' });
  }
});

// ── Routers ────────────────────────────────────────────────────────────────────
app.use('/api/scan', scanRouter);
app.use('/api/stocks', stocksRouter);
app.use('/api/stock', stockRouter);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('[unhandled]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`BSE Scanner backend running on http://localhost:${PORT}`);
});
