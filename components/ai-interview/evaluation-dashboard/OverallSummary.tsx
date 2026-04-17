import { CircularProgress } from './CircularProgress';
import { TrendingUp } from 'lucide-react';

interface OverallSummaryProps {
  finalScore: number;     // 0-100
  mustHaveScore: number;  // 0-10
  niceToHaveScore: number;
  hrScore: number;
}

export function OverallSummary({ finalScore, mustHaveScore, niceToHaveScore, hrScore }: OverallSummaryProps) {
  const strong = mustHaveScore >= 7;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h2 className="text-3xl font-bold mb-2">Evaluation Summary</h2>
          <p className="text-gray-500 mb-8">Comprehensive assessment of candidate performance</p>

          <div className="grid grid-cols-3 gap-6 mb-8">
            <div className="p-5 rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200">
              <div className="text-xs text-emerald-700 uppercase tracking-wider mb-2 font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>
                Must-Have Skills
              </div>
              <div className="text-3xl text-emerald-900 font-bold" style={{ fontFamily: 'var(--font-mono)' }}>
                {Math.round(mustHaveScore)}
              </div>
              <div className="text-xs text-emerald-600 mt-1">out of 10.00</div>
            </div>

            <div className="p-5 rounded-xl bg-gradient-to-br from-amber-50 to-amber-100/50 border border-amber-200">
              <div className="text-xs text-amber-700 uppercase tracking-wider mb-2 font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>
                Nice-to-Have Skills
              </div>
              <div className="text-3xl text-amber-900 font-bold" style={{ fontFamily: 'var(--font-mono)' }}>
                {Math.round(niceToHaveScore)}
              </div>
              <div className="text-xs text-amber-600 mt-1">out of 10.00</div>
            </div>

            <div className="p-5 rounded-xl bg-gradient-to-br from-blue-50 to-blue-100/50 border border-blue-200">
              <div className="text-xs text-blue-700 uppercase tracking-wider mb-2 font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>
                HR Assessment
              </div>
              <div className="text-3xl text-blue-900 font-bold" style={{ fontFamily: 'var(--font-mono)' }}>
                {Math.round(hrScore)}
              </div>
              <div className="text-xs text-blue-600 mt-1">out of 10.00</div>
            </div>
          </div>

          <div className={`p-5 rounded-xl flex items-center gap-3 ${strong ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200' : 'bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200'}`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${strong ? 'bg-emerald-500' : 'bg-amber-500'}`}>
              <TrendingUp size={20} className="text-white" />
            </div>
            <div>
              <p className={`text-sm font-medium ${strong ? 'text-emerald-900' : 'text-amber-900'}`}>
                {strong ? 'Strong performance on must-have skills' : 'Must-have skills need improvement'}
              </p>
              <p className={`text-xs mt-1 ${strong ? 'text-emerald-700' : 'text-amber-700'}`}>
                {strong
                  ? 'Candidate demonstrates solid technical depth in critical competencies.'
                  : 'Candidate shows gaps in highest-priority skill areas.'}
              </p>
            </div>
          </div>
        </div>

        <div className="ml-12 flex flex-col items-center">
          <CircularProgress value={finalScore} max={100} size={220} strokeWidth={14} />
          <p className="text-xs text-gray-500 mt-4 text-center max-w-[220px]">
            Weighted average across all evaluation criteria
          </p>
        </div>
      </div>
    </div>
  );
}
