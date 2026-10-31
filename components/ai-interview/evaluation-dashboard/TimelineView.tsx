import { MessageSquare, Clock, CheckCircle2 } from 'lucide-react';
import type { DashboardData } from './types';

export function TimelineView({ data }: { data: DashboardData }) {
  const responses = data.interviewResponses;
  if (responses.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 border border-gray-200 dark:border-gray-700 text-center text-gray-500">
        No interview responses recorded.
      </div>
    );
  }

  const allSkills = new Set(responses.flatMap(r => r.skillsCovered));

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-2xl p-8 border-2 border-blue-200 dark:border-blue-800">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">Interview Timeline</h1>
            <p className="text-lg text-gray-600 dark:text-gray-300 mb-4">{data.candidate.name} • {data.candidate.role}</p>
            <div className="flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-2">
                <MessageSquare size={18} className="text-blue-600" />
                <span className="text-sm"><span className="font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>{responses.length}</span> questions</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={18} className="text-purple-600" />
                <span className="text-sm"><span className="font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>{data.interview.duration}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-600" />
                <span className="text-sm"><span className="font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>{allSkills.size}</span> skills covered</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-200 dark:border-gray-700 shadow-sm">
        <h2 className="text-2xl font-bold mb-2">Question & Response Breakdown</h2>
        <p className="tf-body-muted mb-8">Chronological flow with skills assessed at each step</p>

        <div className="space-y-6">
          {responses.map((r, idx) => (
            <div key={r.id} className="relative">
              {idx < responses.length - 1 && (
                <div className="absolute left-6 top-20 bottom-0 w-0.5 bg-gradient-to-b from-gray-900 to-gray-300 dark:from-gray-100 dark:to-gray-600" />
              )}
              <div className="flex gap-6">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm shadow-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>
                    Q{r.id}
                  </div>
                </div>

                <div className="flex-1">
                  <div className="bg-gray-50 dark:bg-gray-900/30 rounded-xl border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Clock size={16} className="text-blue-600" />
                          <span className="text-sm text-blue-600 font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>{r.timestamp}</span>
                        </div>
                        {r.duration !== '—' && (
                          <div className="px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>
                            Duration: {r.duration}
                          </div>
                        )}
                      </div>
                      {r.skillsCovered.length > 0 && (
                        <div className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold" style={{ fontFamily: 'var(--font-mono)' }}>
                          {r.skillsCovered.length} skill{r.skillsCovered.length !== 1 ? 's' : ''}
                        </div>
                      )}
                    </div>

                    <div className="mb-5">
                      <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider flex items-center gap-2 font-semibold">
                        <MessageSquare size={12} /> Question
                      </div>
                      <p className="text-base leading-relaxed">{r.question}</p>
                    </div>

                    <div className="mb-5 p-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                      <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider font-semibold">Candidate Response</div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                        {r.candidateResponse || <span className="italic text-gray-400">No response captured</span>}
                      </p>
                    </div>

                    {r.skillsCovered.length > 0 && (
                      <div>
                        <div className="text-xs text-gray-500 mb-3 uppercase tracking-wider font-semibold">Skills Assessed</div>
                        <div className="flex flex-wrap gap-2">
                          {r.skillsCovered.map((skill, si) => (
                            <span key={si} className="px-3 py-1.5 rounded-full bg-emerald-100 text-emerald-700 text-sm border border-emerald-200" style={{ fontFamily: 'var(--font-mono)' }}>
                              {skill}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {idx < responses.length - 1 && (
                    <div className="ml-6 mt-4 mb-2 flex items-center gap-2 text-xs text-gray-400">
                      <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                      <span style={{ fontFamily: 'var(--font-mono)' }}>{Math.round(((idx + 1) / responses.length) * 100)}% complete</span>
                      <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700"></div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
