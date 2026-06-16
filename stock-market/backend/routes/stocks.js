import { Router } from 'express';
import { getStocks } from '../services/dataService.js';

const router = Router();

// GET /api/stocks — paginated + filtered list
router.get('/', async (req, res) => {
  const {
    job_id,
    page = 1,
    page_size = 50,
    signal,
    sector,
    market_cap,
    min_score = 0,
    sort_by = 'score',
    sort_dir = 'desc',
  } = req.query;

  try {
    const params = { page, page_size, min_score, sort_by, sort_dir };
    if (job_id) params.job_id = job_id;
    if (signal) params.signal = signal;
    if (sector) params.sector = sector;
    if (market_cap) params.market_cap = market_cap;

    const data = await getStocks(params);
    res.json(data);
  } catch (err) {
    console.error('[stocksRoute] getStocks failed:', err.message);
    res.status(502).json({ error: 'Failed to fetch stocks' });
  }
});

export default router;
