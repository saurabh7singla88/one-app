'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { getStockDetail, type StockSignal } from '@/lib/api';
import NewsCard from '@/components/NewsCard';
import AIRecommendation from '@/components/AIRecommendation';

function MetricRow({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`flex justify-between py-2.5 border-b border-gray-50 last:border-0 ${highlight ? 'bg-yellow-50 -mx-4 px-4' : ''}`}>
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value ?? '—'}</span>
    </div>
  );
}

const SIGNAL_COLORS: Record<string, string> = {
  NEAR_52W_LOW:  'bg-red-100 text-red-700 border-red-200',
  NEAR_52W_HIGH: 'bg-green-100 text-green-700 border-green-200',
  OVERSOLD:      'bg-orange-100 text-orange-700 border-orange-200',
  OVERBOUGHT:    'bg-blue-100 text-blue-700 border-blue-200',
  VOLUME_SURGE:  'bg-purple-100 text-purple-700 border-purple-200',
  GOLDEN_CROSS:  'bg-yellow-100 text-yellow-700 border-yellow-200',
  DEATH_CROSS:   'bg-gray-100 text-gray-600 border-gray-200',
};

const SIGNAL_LABELS: Record<string, string> = {
  NEAR_52W_LOW:  '📉 Near 52W Low',
  NEAR_52W_HIGH: '📈 Near 52W High',
  OVERSOLD:      '🔴 Oversold',
  OVERBOUGHT:    '🟢 Overbought',
  VOLUME_SURGE:  '⚡ Volume Surge',
  GOLDEN_CROSS:  '✨ Golden Cross',
  DEATH_CROSS:   '💀 Death Cross',
};

function ScoreRing({ score }: { score: number }) {
  const color =
    score >= 75 ? '#10b981' :
    score >= 60 ? '#3b82f6' :
    score >= 45 ? '#f59e0b' :
    '#9ca3af';
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#f3f4f6" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 48 48)"
        />
        <text x="48" y="48" textAnchor="middle" dominantBaseline="central"
          fontSize="20" fontWeight="bold" fill={color}>
          {score}
        </text>
      </svg>
      <span className="text-xs text-gray-500 font-medium">Composite Score</span>
    </div>
  );
}

export default function StockDetailPage() {
  const { symbol } = useParams<{ symbol: string }>();
  const decoded = decodeURIComponent(symbol);

  const [stock, setStock] = useState<StockSignal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!decoded) return;
    setLoading(true);
    getStockDetail(decoded)
      .then(setStock)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [decoded]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="flex flex-col items-center gap-4 text-gray-400">
          <div className="w-10 h-10 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          <p className="text-sm">Loading {decoded}…</p>
        </div>
      </div>
    );
  }

  if (error || !stock) {
    return (
      <div className="text-center py-24">
        <p className="text-xl font-semibold text-gray-700">Stock not found</p>
        <p className="text-sm text-gray-400 mt-2">{error || 'Run a scan first.'}</p>
        <Link href="/" className="mt-6 inline-block text-blue-600 hover:underline text-sm">
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  const fund = stock.fundamentals || {};

  const formatINR = (n?: number | null) =>
    n != null ? `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—';

  const formatPct = (n?: number | null, showPlus = false) =>
    n != null ? `${showPlus && n > 0 ? '+' : ''}${n.toFixed(2)}%` : '—';

  const formatCr = (n?: number | null) => {
    if (n == null) return '—';
    const cr = n / 1e7;
    if (cr >= 1_00_000) return `₹${(cr / 1_00_000).toFixed(2)} Lakh Cr`;
    if (cr >= 1_000) return `₹${(cr / 1_000).toFixed(2)}K Cr`;
    return `₹${cr.toFixed(0)} Cr`;
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <Link href="/" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">
        ← Back to Scanner
      </Link>

      {/* Header card */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {stock.company_name || decoded.replace('.BO', '')}
            </h1>
            <div className="flex flex-wrap gap-2 mt-1.5 text-sm text-gray-500">
              <span className="bg-gray-100 px-2 py-0.5 rounded">{stock.ticker}</span>
              {stock.sector && <span>{stock.sector}</span>}
              {stock.industry && <span>· {stock.industry}</span>}
              {stock.market_cap_category && (
                <span className="capitalize bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs">
                  {stock.market_cap_category.replace('_', ' ')}
                </span>
              )}
            </div>
            {/* Signals */}
            <div className="flex flex-wrap gap-2 mt-3">
              {stock.signals.map((sig) => (
                <span
                  key={sig}
                  className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                    SIGNAL_COLORS[sig] || 'bg-gray-100 text-gray-600 border-gray-200'
                  }`}
                >
                  {SIGNAL_LABELS[sig] || sig}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="text-3xl font-bold text-gray-900">{formatINR(stock.current_price)}</p>
              <p className={`text-sm mt-0.5 ${(stock.return_1m ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {formatPct(stock.return_1m, true)} (1M)
              </p>
            </div>
            <ScoreRing score={stock.score} />
          </div>
        </div>
      </div>

      {/* Three column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Column 1: Technical metrics */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-800 mb-3">Technical Indicators</h2>
          <MetricRow label="Current Price" value={formatINR(stock.current_price)} />
          <MetricRow label="52W High" value={formatINR(stock.high_52w)} />
          <MetricRow label="52W Low" value={formatINR(stock.low_52w)} />
          <MetricRow label="% from 52W High" value={<span className="text-red-500">{formatPct(stock.pct_from_high)}</span>} />
          <MetricRow label="% from 52W Low" value={<span className="text-emerald-600">{formatPct(stock.pct_from_low, true)}</span>} />
          <MetricRow label="RSI (14)" value={
            <span className={stock.rsi != null && stock.rsi < 35 ? 'text-orange-600 font-bold' : stock.rsi != null && stock.rsi > 65 ? 'text-blue-600 font-bold' : ''}>
              {stock.rsi?.toFixed(1) ?? '—'}
            </span>
          } />
          <MetricRow label="SMA 50" value={formatINR(stock.sma50)} />
          <MetricRow label="SMA 200" value={formatINR(stock.sma200)} />
          <MetricRow label="EMA 20" value={formatINR(stock.ema20)} />
          <MetricRow label="Volume Surge" value={
            <span className={stock.volume_surge_pct > 100 ? 'text-purple-600 font-bold' : ''}>
              {stock.volume_surge_pct > 0 ? `+${stock.volume_surge_pct.toFixed(1)}%` : '—'}
            </span>
          } />
          <MetricRow label="1M Return" value={<span className={(stock.return_1m ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}>{formatPct(stock.return_1m, true)}</span>} />
          <MetricRow label="3M Return" value={<span className={(stock.return_3m ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}>{formatPct(stock.return_3m, true)}</span>} />
          <MetricRow label="Golden Cross" value={stock.golden_cross ? '✅ Yes' : '—'} />
          <MetricRow label="Death Cross" value={stock.death_cross ? '⚠️ Yes' : '—'} />
          <MetricRow label="Above EMA20" value={stock.above_ema20 ? '✅ Yes' : '❌ No'} />
        </div>

        {/* Column 2: Fundamentals + AI */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-800 mb-3">Fundamentals</h2>
            <MetricRow label="Market Cap" value={formatCr(fund.market_cap)} />
            <MetricRow label="P/E Ratio (TTM)" value={fund.pe_ratio?.toFixed(2)} />
            <MetricRow label="Forward P/E" value={fund.forward_pe?.toFixed(2)} />
            <MetricRow label="EPS (TTM)" value={formatINR(fund.eps)} />
            <MetricRow label="Earnings Growth" value={fund.earnings_growth != null ? `${(fund.earnings_growth * 100).toFixed(1)}%` : undefined} />
            <MetricRow label="Revenue Growth" value={fund.revenue_growth != null ? `${(fund.revenue_growth * 100).toFixed(1)}%` : undefined} />
            <MetricRow label="Profit Margin" value={fund.profit_margin != null ? `${(fund.profit_margin * 100).toFixed(1)}%` : undefined} />
            <MetricRow label="Beta" value={fund.beta?.toFixed(2)} />
            <MetricRow label="Dividend Yield" value={fund.dividend_yield != null ? `${(fund.dividend_yield * 100).toFixed(2)}%` : undefined} />
            <MetricRow label="Analyst Target" value={formatINR(fund.analyst_target)} />
          </div>

          {/* AI Recommendation */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-800 mb-3">AI Recommendation</h2>
            <AIRecommendation analysis={stock.ai_analysis ?? null} />
          </div>
        </div>

        {/* Column 3: News */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h2 className="font-semibold text-gray-800 mb-3">
            Recent News
            <span className="ml-2 text-xs text-gray-400 font-normal">via Google News</span>
          </h2>
          <NewsCard items={stock.news || []} />
        </div>
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-gray-400 text-center">
        Data sourced from Yahoo Finance. Prices may be delayed. This is not financial advice.
      </p>
    </div>
  );
}
