import { type AiAnalysis } from '@/lib/api';

interface Props {
  analysis: AiAnalysis | null;
  loading?: boolean;
}

const REC_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  BUY:   { bg: 'bg-emerald-50',  text: 'text-emerald-700', border: 'border-emerald-200' },
  HOLD:  { bg: 'bg-yellow-50',   text: 'text-yellow-700',  border: 'border-yellow-200' },
  SELL:  { bg: 'bg-red-50',      text: 'text-red-700',     border: 'border-red-200' },
  WATCH: { bg: 'bg-blue-50',     text: 'text-blue-700',    border: 'border-blue-200' },
};

const CONF_LABELS: Record<string, string> = {
  HIGH:   '● High confidence',
  MEDIUM: '◐ Medium confidence',
  LOW:    '○ Low confidence',
};

export default function AIRecommendation({ analysis, loading }: Props) {
  if (loading) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-5 animate-pulse space-y-3">
        <div className="h-4 bg-gray-200 rounded w-1/3" />
        <div className="h-3 bg-gray-200 rounded w-full" />
        <div className="h-3 bg-gray-200 rounded w-5/6" />
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-5 text-center text-sm text-gray-400">
        AI analysis unavailable. Check your GEMINI_API_KEY.
      </div>
    );
  }

  const style = REC_STYLES[analysis.recommendation] || REC_STYLES.HOLD;

  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} p-5 space-y-4`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`text-2xl font-bold ${style.text}`}>{analysis.recommendation}</span>
          <span className="text-xs text-gray-500">{CONF_LABELS[analysis.confidence]}</span>
        </div>
        <span className="text-xs text-gray-400 bg-white/60 px-2 py-1 rounded-lg border border-gray-200">
          Gemini AI
        </span>
      </div>

      {/* Summary */}
      <p className="text-sm text-gray-700 leading-relaxed">{analysis.summary}</p>

      {/* Key factors */}
      {analysis.keyFactors.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Key Factors
          </p>
          <ul className="space-y-1">
            {analysis.keyFactors.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700">
                <span className="text-emerald-500 mt-0.5">✓</span>
                {f}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Risks */}
      {analysis.risks.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Risks
          </p>
          <ul className="space-y-1">
            {analysis.risks.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm text-gray-700">
                <span className="text-red-400 mt-0.5">⚠</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-gray-400 border-t border-gray-200 pt-3">
        ⚠ AI analysis is for informational purposes only. Not financial advice.
      </p>
    </div>
  );
}
