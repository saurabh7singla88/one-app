'use client';

import Link from 'next/link';
import { type StockSignal, type StocksResponse, type StockFilters } from '@/lib/api';

interface Props {
  data: StocksResponse | null;
  loading: boolean;
  filters: StockFilters;
  onPageChange: (page: number) => void;
}

const SIGNAL_COLORS: Record<string, string> = {
  NEAR_52W_LOW:  'bg-red-100 text-red-700',
  NEAR_52W_HIGH: 'bg-green-100 text-green-700',
  OVERSOLD:      'bg-orange-100 text-orange-700',
  OVERBOUGHT:    'bg-blue-100 text-blue-700',
  VOLUME_SURGE:  'bg-purple-100 text-purple-700',
  GOLDEN_CROSS:  'bg-yellow-100 text-yellow-700',
  DEATH_CROSS:   'bg-gray-100 text-gray-600',
};

const SIGNAL_ICONS: Record<string, string> = {
  NEAR_52W_LOW:  '📉',
  NEAR_52W_HIGH: '📈',
  OVERSOLD:      '🔴',
  OVERBOUGHT:    '🟢',
  VOLUME_SURGE:  '⚡',
  GOLDEN_CROSS:  '✨',
  DEATH_CROSS:   '💀',
};

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 75 ? 'bg-emerald-500' :
    score >= 60 ? 'bg-blue-500' :
    score >= 45 ? 'bg-yellow-500' :
    'bg-gray-400';
  return (
    <span className={`inline-flex items-center justify-center w-10 h-10 rounded-full text-white text-sm font-bold ${color}`}>
      {score}
    </span>
  );
}

function formatINR(n: number | undefined): string {
  if (n == null) return '—';
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function formatPct(n: number | null | undefined, showPlus = false): string {
  if (n == null) return '—';
  return `${showPlus && n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

export default function StockTable({ data, loading, filters, onPageChange }: Props) {
  const pageSize = filters.page_size || 50;
  const currentPage = filters.page || 1;
  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  if (loading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 flex justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-sm">Loading stocks…</span>
        </div>
      </div>
    );
  }

  if (!data || data.results.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center">
        <p className="text-gray-400 text-sm">
          {data ? 'No stocks match the current filters.' : 'Run a scan to see results.'}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center">
        <span className="text-sm text-gray-500">
          {data.total} stocks found
          {data.scan_finished_at && (
            <span className="ml-2 text-xs text-gray-400">
              · Last scan: {new Date(data.scan_finished_at).toLocaleString('en-IN')}
            </span>
          )}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 text-center w-12">#</th>
              <th className="px-4 py-3 text-left">Company</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3 text-right">52W Low%</th>
              <th className="px-4 py-3 text-right">52W High%</th>
              <th className="px-4 py-3 text-right">RSI</th>
              <th className="px-4 py-3 text-right">Vol Surge</th>
              <th className="px-4 py-3 text-right">1M Ret</th>
              <th className="px-4 py-3 text-left">Signals</th>
              <th className="px-4 py-3 text-center">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.results.map((stock, idx) => (
              <StockRow
                key={stock.ticker}
                stock={stock}
                rank={(currentPage - 1) * pageSize + idx + 1}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-5 py-4 border-t border-gray-100 flex justify-center gap-2">
          <button
            disabled={currentPage <= 1}
            onClick={() => onPageChange(currentPage - 1)}
            className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          <span className="px-3 py-1.5 text-xs text-gray-500">
            Page {currentPage} of {totalPages}
          </span>
          <button
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(currentPage + 1)}
            className="px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}

function StockRow({ stock, rank }: { stock: StockSignal; rank: number }) {
  const rsiColor =
    stock.rsi != null && stock.rsi < 35 ? 'text-orange-600 font-semibold' :
    stock.rsi != null && stock.rsi > 65 ? 'text-blue-600 font-semibold' :
    'text-gray-700';

  const returnColor = (v: number | null) =>
    v == null ? 'text-gray-400' : v > 0 ? 'text-emerald-600' : 'text-red-500';

  return (
    <tr className="hover:bg-blue-50/30 transition-colors">
      <td className="px-4 py-3 text-center text-xs text-gray-400">{rank}</td>
      <td className="px-4 py-3">
        <Link href={`/stock/${encodeURIComponent(stock.ticker)}`} className="group">
          <div className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
            {stock.company_name || stock.ticker.replace('.BO', '')}
          </div>
          <div className="text-xs text-gray-400 mt-0.5">
            {stock.ticker} · {stock.sector || 'Unknown'}
          </div>
        </Link>
      </td>
      <td className="px-4 py-3 text-right font-medium text-gray-900">
        {formatINR(stock.current_price)}
      </td>
      <td className="px-4 py-3 text-right text-emerald-600 font-medium">
        +{stock.pct_from_low.toFixed(1)}%
      </td>
      <td className="px-4 py-3 text-right text-red-500 font-medium">
        {stock.pct_from_high.toFixed(1)}%
      </td>
      <td className={`px-4 py-3 text-right ${rsiColor}`}>
        {stock.rsi != null ? stock.rsi.toFixed(1) : '—'}
      </td>
      <td className="px-4 py-3 text-right">
        <span className={stock.volume_surge_pct > 100 ? 'text-purple-600 font-semibold' : 'text-gray-600'}>
          {stock.volume_surge_pct > 0 ? `+${stock.volume_surge_pct.toFixed(0)}%` : '—'}
        </span>
      </td>
      <td className={`px-4 py-3 text-right ${returnColor(stock.return_1m)}`}>
        {formatPct(stock.return_1m, true)}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1 max-w-[200px]">
          {stock.signals.slice(0, 3).map((sig) => (
            <span
              key={sig}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium ${
                SIGNAL_COLORS[sig] || 'bg-gray-100 text-gray-600'
              }`}
            >
              {SIGNAL_ICONS[sig]} {sig.replace(/_/g, ' ')}
            </span>
          ))}
        </div>
      </td>
      <td className="px-4 py-3 text-center">
        <ScoreBadge score={stock.score} />
      </td>
    </tr>
  );
}
