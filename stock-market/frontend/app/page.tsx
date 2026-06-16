'use client';

import { useState, useEffect, useCallback } from 'react';
import ScanButton from '@/components/ScanButton';
import FilterPanel from '@/components/FilterPanel';
import StockTable from '@/components/StockTable';
import { getStocks, getMarketSummary, type StocksResponse, type StockFilters } from '@/lib/api';

const DEFAULT_FILTERS: StockFilters = {
  page: 1,
  page_size: 50,
  sort_by: 'score',
  sort_dir: 'desc',
  min_score: 0,
};

export default function DashboardPage() {
  const [filters, setFilters] = useState<StockFilters>(DEFAULT_FILTERS);
  const [data, setData] = useState<StocksResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [jobId, setJobId] = useState<string | null>(null);

  const fetchStocks = useCallback(async (f: StockFilters) => {
    setLoading(true);
    try {
      const result = await getStocks(f);
      setData(result);
    } catch (err) {
      console.error('Failed to fetch stocks', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load — try to show previously stored scan results
  useEffect(() => {
    fetchStocks(DEFAULT_FILTERS);
    getMarketSummary().then((s) => setSummary(s.summary)).catch(() => {});
  }, [fetchStocks]);

  // Re-fetch when filters change
  useEffect(() => {
    fetchStocks({ ...filters, job_id: jobId ?? undefined });
  }, [filters, jobId, fetchStocks]);

  const handleFilterChange = (partial: Partial<StockFilters>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
  };

  const handleScanComplete = (id: string) => {
    setJobId(id);
    setFilters(DEFAULT_FILTERS);
    // Refresh market summary
    getMarketSummary().then((s) => setSummary(s.summary)).catch(() => {});
  };

  const statsRow = data ? [
    { label: 'Total Candidates', value: data.total },
    { label: 'Near 52W Low', value: '—' },
    { label: 'Oversold (RSI<35)', value: '—' },
    { label: 'Volume Surge', value: '—' },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">BSE Stock Scanner</h1>
        <p className="text-gray-500 text-sm mt-1">
          Scan BSE-listed Indian stocks for technical signals, fundamental value, and AI-powered recommendations.
        </p>
      </div>

      {/* AI Market Summary */}
      {summary && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🤖</span>
            <div>
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">
                Gemini Market Commentary
              </p>
              <p className="text-sm text-gray-700 leading-relaxed">{summary}</p>
            </div>
          </div>
        </div>
      )}

      {/* Scan control */}
      <ScanButton onComplete={handleScanComplete} />

      {/* Stats row */}
      {data && data.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Candidates', value: data.total, color: 'text-gray-900' },
            {
              label: 'Near 52W Low',
              value: data.results.filter((s) => s.signals.includes('NEAR_52W_LOW')).length,
              color: 'text-red-600',
            },
            {
              label: 'Oversold',
              value: data.results.filter((s) => s.signals.includes('OVERSOLD')).length,
              color: 'text-orange-600',
            },
            {
              label: 'Volume Surge',
              value: data.results.filter((s) => s.signals.includes('VOLUME_SURGE')).length,
              color: 'text-purple-600',
            },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <FilterPanel filters={filters} onChange={handleFilterChange} />

      {/* Stock table */}
      <StockTable
        data={data}
        loading={loading}
        filters={filters}
        onPageChange={(page) => handleFilterChange({ page })}
      />
    </div>
  );
}
