import { Router } from 'express';
import { getStockDetail } from '../services/dataService.js';
import { fetchStockNews } from '../services/newsService.js';
import { analyzeStock } from '../services/geminiService.js';

const router = Router();

// GET /api/stock/:ticker — full detail with news + AI analysis
router.get('/:ticker', async (req, res) => {
  const { ticker } = req.params;
  const { ai = 'true' } = req.query;

  try {
    // Fetch stock data and news in parallel
    const [stock, news] = await Promise.all([
      getStockDetail(ticker),
      fetchStockNews(ticker, null, 5),
    ]);

    const result = { ...stock, news };

    // AI analysis (can be skipped with ?ai=false)
    if (ai !== 'false' && process.env.GEMINI_API_KEY) {
      try {
        const aiAnalysis = await analyzeStock(stock, news);
        result.ai_analysis = aiAnalysis;
      } catch (aiErr) {
        console.error(`[stockRoute] AI analysis failed for ${ticker}:`, aiErr.message);
        result.ai_analysis = null;
      }
    } else {
      result.ai_analysis = null;
    }

    res.json(result);
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ error: `Stock ${ticker} not found in latest scan` });
    }
    console.error('[stockRoute] getStockDetail failed:', err.message);
    res.status(502).json({ error: 'Failed to fetch stock detail' });
  }
});

export default router;
