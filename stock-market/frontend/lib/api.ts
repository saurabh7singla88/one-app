const API_BASE = process.env.NEXT_PUBLIC_API_URL
  ? `${process.env.NEXT_PUBLIC_API_URL}/api`
  : '/api';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface StockSignal {
  ticker: string;
  company_name: string;
  sector: string;
  industry: string;
  market_cap_category: 'large_cap' | 'mid_cap' | 'small_cap' | 'unknown';
  current_price: number;
  high_52w: number;
  low_52w: number;
  pct_from_high: number;
  pct_from_low: number;
  rsi: number | null;
  sma50: number | null;
  sma200: number | null;
  ema20: number | null;
  volume_surge_pct: number;
  golden_cross: boolean;
  death_cross: boolean;
  above_ema20: boolean;
  return_1m: number | null;
  return_3m: number | null;
  signals: string[];
  score: number;
  fundamentals?: Fundamentals;
  news?: NewsItem[];
  ai_analysis?: AiAnalysis | null;
}

export interface Fundamentals {
  market_cap?: number;
  pe_ratio?: number;
  forward_pe?: number;
  eps?: number;
  earnings_growth?: number;
  revenue_growth?: number;
  profit_margin?: number;
  beta?: number;
  dividend_yield?: number;
  sector?: string;
  industry?: string;
  company_name?: string;
  currency?: string;
  analyst_target?: number;
}

export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  snippet: string;
}

export interface AiAnalysis {
  recommendation: 'BUY' | 'HOLD' | 'SELL' | 'WATCH';
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  summary: string;
  keyFactors: string[];
  risks: string[];
}

export interface StocksResponse {
  results: StockSignal[];
  total: number;
  page: number;
  page_size: number;
  job_id: string | null;
  scan_finished_at: string | null;
}

export interface ScanJob {
  job_id: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  total: number;
  mode: string;
  started_at: string;
  finished_at: string | null;
  candidate_count: number;
}

export interface StockFilters {
  job_id?: string;
  page?: number;
  page_size?: number;
  signal?: string;
  sector?: string;
  market_cap?: string;
  min_score?: number;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
}

// ── API calls ──────────────────────────────────────────────────────────────────

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function triggerScan(mode: 'sensex30' | 'bse500' | 'full' = 'bse500') {
  return fetchJSON<{ job_id: string; mode: string; status: string }>('/scan', {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
}

export async function getScanStatus(jobId: string) {
  return fetchJSON<ScanJob>(`/scan/status/${jobId}`);
}

export async function getStocks(filters: StockFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  });
  const qs = params.toString();
  return fetchJSON<StocksResponse>(`/stocks${qs ? `?${qs}` : ''}`);
}

export async function getTopStocks(limit = 20) {
  return fetchJSON<StocksResponse>(`/top-stocks?limit=${limit}`);
}

export async function getStockDetail(ticker: string) {
  return fetchJSON<StockSignal>(`/stock/${encodeURIComponent(ticker)}`);
}

export async function getMarketSummary() {
  return fetchJSON<{ summary: string }>('/summary');
}
