'use client';

import { useState, useEffect, useRef } from 'react';
import { triggerScan, getScanStatus, type ScanJob } from '@/lib/api';

type Mode = 'sensex30' | 'bse500' | 'full';

const MODE_LABELS: Record<Mode, { label: string; desc: string; time: string }> = {
  sensex30: { label: 'Sensex 50', desc: '~50 large-cap stocks', time: '~2 min' },
  bse500:   { label: 'BSE 500',   desc: '~600 stocks',         time: '~15 min' },
  full:     { label: 'All BSE',   desc: '~5000+ stocks',       time: '~45 min' },
};

interface Props {
  onComplete: (jobId: string) => void;
}

export default function ScanButton({ onComplete }: Props) {
  const [mode, setMode] = useState<Mode>('bse500');
  const [job, setJob] = useState<ScanJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRunning = job?.status === 'running';

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    return stopPolling;
  }, []);

  const startScan = async () => {
    setError(null);
    try {
      const { job_id } = await triggerScan(mode);
      const initial: ScanJob = {
        job_id,
        status: 'running',
        progress: 0,
        total: 0,
        mode,
        started_at: new Date().toISOString(),
        finished_at: null,
        candidate_count: 0,
      };
      setJob(initial);

      pollRef.current = setInterval(async () => {
        try {
          const updated = await getScanStatus(job_id);
          setJob(updated);
          if (updated.status !== 'running') {
            stopPolling();
            if (updated.status === 'completed') {
              onComplete(job_id);
            }
          }
        } catch {
          // keep polling
        }
      }, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scan failed to start');
    }
  };

  const pct = job && job.total > 0 ? Math.round((job.progress / job.total) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        {/* Mode selector */}
        <div className="flex-1">
          <label className="block text-sm font-medium text-gray-600 mb-2">Scan Universe</label>
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(MODE_LABELS) as Mode[]).map((m) => (
              <button
                key={m}
                disabled={isRunning}
                onClick={() => setMode(m)}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  mode === m
                    ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                    : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <span>{MODE_LABELS[m].label}</span>
                <span className="ml-1.5 text-xs opacity-70">({MODE_LABELS[m].time})</span>
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-1.5">{MODE_LABELS[mode].desc}</p>
        </div>

        {/* Scan button */}
        <button
          onClick={startScan}
          disabled={isRunning}
          className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold rounded-xl transition-colors shadow-sm disabled:cursor-not-allowed"
        >
          {isRunning ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Scanning…
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Start Scan
            </>
          )}
        </button>
      </div>

      {/* Progress bar */}
      {job && (
        <div className="mt-5">
          <div className="flex justify-between text-xs text-gray-500 mb-1.5">
            <span>
              {job.status === 'running' && `Scanning… ${job.progress} / ${job.total || '?'} stocks`}
              {job.status === 'completed' && `✓ Complete — ${job.candidate_count} candidates found`}
              {job.status === 'failed' && '✕ Scan failed'}
            </span>
            {job.status === 'running' && <span>{pct}%</span>}
          </div>
          <div className="w-full bg-gray-100 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-500 ${
                job.status === 'failed' ? 'bg-red-500' :
                job.status === 'completed' ? 'bg-emerald-500' : 'bg-blue-500'
              }`}
              style={{ width: job.status === 'completed' ? '100%' : `${pct}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
      )}
    </div>
  );
}
