'use client';

import { type StockFilters } from '@/lib/api';

interface Props {
  filters: StockFilters;
  onChange: (f: Partial<StockFilters>) => void;
}

const SIGNALS = [
  { value: '', label: 'All Signals' },
  { value: 'NEAR_52W_LOW',  label: '📉 Near 52W Low' },
  { value: 'NEAR_52W_HIGH', label: '📈 Near 52W High' },
  { value: 'OVERSOLD',      label: '🔴 Oversold (RSI<35)' },
  { value: 'OVERBOUGHT',    label: '🟢 Overbought (RSI>65)' },
  { value: 'VOLUME_SURGE',  label: '⚡ Volume Surge' },
  { value: 'GOLDEN_CROSS',  label: '✨ Golden Cross' },
  { value: 'DEATH_CROSS',   label: '💀 Death Cross' },
];

const MARKET_CAPS = [
  { value: '',           label: 'All Cap Sizes' },
  { value: 'large_cap',  label: 'Large Cap (>₹20K Cr)' },
  { value: 'mid_cap',    label: 'Mid Cap (₹5K–20K Cr)' },
  { value: 'small_cap',  label: 'Small Cap (<₹5K Cr)' },
];

const SORT_BY_OPTIONS = [
  { value: 'score',             label: 'Score' },
  { value: 'rsi',               label: 'RSI' },
  { value: 'volume_surge_pct',  label: 'Volume Surge' },
  { value: 'pct_from_low',      label: '% From 52W Low' },
  { value: 'pct_from_high',     label: '% From 52W High' },
  { value: 'return_1m',         label: '1M Return' },
];

export default function FilterPanel({ filters, onChange }: Props) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
      <div className="flex flex-wrap gap-3 items-end">
        {/* Signal filter */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Signal</label>
          <select
            value={filters.signal || ''}
            onChange={(e) => onChange({ signal: e.target.value || undefined, page: 1 })}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            {SIGNALS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        {/* Market cap filter */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Market Cap</label>
          <select
            value={filters.market_cap || ''}
            onChange={(e) => onChange({ market_cap: e.target.value || undefined, page: 1 })}
            className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
          >
            {MARKET_CAPS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Min score */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Min Score: <span className="text-blue-600 font-semibold">{filters.min_score ?? 0}</span>
          </label>
          <input
            type="range"
            min={0}
            max={90}
            step={5}
            value={filters.min_score ?? 0}
            onChange={(e) => onChange({ min_score: Number(e.target.value), page: 1 })}
            className="w-32 accent-blue-600"
          />
        </div>

        {/* Sort by */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Sort By</label>
          <div className="flex gap-1">
            <select
              value={filters.sort_by || 'score'}
              onChange={(e) => onChange({ sort_by: e.target.value, page: 1 })}
              className="text-sm border border-gray-200 rounded-l-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
            >
              {SORT_BY_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <button
              onClick={() =>
                onChange({ sort_dir: filters.sort_dir === 'asc' ? 'desc' : 'asc', page: 1 })
              }
              className="px-3 py-2 border border-l-0 border-gray-200 rounded-r-lg bg-white hover:bg-gray-50 text-sm"
              title="Toggle sort direction"
            >
              {filters.sort_dir === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>

        {/* Clear */}
        <button
          onClick={() => onChange({ signal: undefined, market_cap: undefined, min_score: 0, sort_by: 'score', sort_dir: 'desc', page: 1 })}
          className="text-xs text-gray-400 hover:text-gray-600 underline pb-2"
        >
          Clear filters
        </button>
      </div>
    </div>
  );
}
