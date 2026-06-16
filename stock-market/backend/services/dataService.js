import axios from 'axios';

const DATA_SERVICE_URL = process.env.PYTHON_SERVICE_URL || 'http://localhost:8000';

const client = axios.create({
  baseURL: DATA_SERVICE_URL,
  timeout: 30_000,
});

export async function triggerScan(mode = 'bse500') {
  const { data } = await client.post('/scan', { mode });
  return data;
}

export async function getScanStatus(jobId) {
  const { data } = await client.get(`/status/${jobId}`);
  return data;
}

export async function getStocks(params = {}) {
  const { data } = await client.get('/stocks', { params });
  return data;
}

export async function getStockDetail(ticker) {
  const { data } = await client.get(`/stock/${encodeURIComponent(ticker)}`);
  return data;
}

export async function healthCheck() {
  const { data } = await client.get('/health');
  return data;
}
