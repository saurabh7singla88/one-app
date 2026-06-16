import { Router } from 'express';
import { triggerScan, getScanStatus } from '../services/dataService.js';

const router = Router();

// POST /api/scan — trigger a new scan
router.post('/', async (req, res) => {
  const mode = req.body?.mode || 'bse500';
  const validModes = ['sensex30', 'bse500', 'full'];
  if (!validModes.includes(mode)) {
    return res.status(400).json({ error: `mode must be one of: ${validModes.join(', ')}` });
  }

  try {
    const result = await triggerScan(mode);
    res.json(result);
  } catch (err) {
    console.error('[scanRoute] triggerScan failed:', err.message);
    res.status(502).json({ error: 'Failed to start scan. Is the data service running?' });
  }
});

// GET /api/scan/status/:jobId — poll scan progress
router.get('/status/:jobId', async (req, res) => {
  const { jobId } = req.params;
  try {
    const status = await getScanStatus(jobId);
    res.json(status);
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ error: 'Job not found' });
    }
    console.error('[scanRoute] getScanStatus failed:', err.message);
    res.status(502).json({ error: 'Failed to fetch scan status' });
  }
});

export default router;
