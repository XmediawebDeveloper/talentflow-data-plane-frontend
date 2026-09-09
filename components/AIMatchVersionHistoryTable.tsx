'use client';

import { Eye, Loader2 } from 'lucide-react';
import { AIMatchSessionResponse } from '@/lib/services/aiMatchService';
import { formatIST } from '@/lib/utils/dateUtils';

export interface AIMatchSessionVersion {
  session: AIMatchSessionResponse;
  versionNumber: number;
  topScore: number;
  avgScore: number;
}

/** Same score a session's candidates are ranked by elsewhere: final_score (0-100) or similarity (0-1) as a fallback. */
const scoreOf = (result: { final_score?: number; similarity_score: number }): number =>
  result.final_score != null ? Math.round(result.final_score) : Math.round((result.similarity_score || 0) * 100);

/**
 * Every AI match run for a job is its own immutable session — there is no
 * version field on the backend record. Version numbers here are assigned by
 * chronological order (oldest = v1), then the list is shown newest-first so
 * it reads the same as every other version list in this app.
 */
export function buildAIMatchVersions(sessions: AIMatchSessionResponse[]): AIMatchSessionVersion[] {
  const chronological = [...sessions].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  return chronological
    .map((session, index) => {
      const scores = session.results.map(scoreOf);
      return {
        session,
        versionNumber: index + 1,
        topScore: scores.length ? Math.max(...scores) : 0,
        avgScore: scores.length ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length) : 0,
      };
    })
    .reverse();
}

interface AIMatchVersionHistoryTableProps {
  loading: boolean;
  failed: boolean;
  versions: AIMatchSessionVersion[] | null;
  onRetry: () => void;
  onViewSession: (session: AIMatchSessionResponse) => void;
}

/**
 * The version table itself — no fetching, no button, no overlay. Meant to be
 * dropped inline below a job card (same idea as JDVersionHistory on the Job
 * Openings list), with the card above already showing the job's own identity
 * so this only needs to describe the runs.
 */
export default function AIMatchVersionHistoryTable({
  loading,
  failed,
  versions,
  onRetry,
  onViewSession,
}: AIMatchVersionHistoryTableProps) {
  if (loading && !versions) {
    return (
      <div className="flex items-center gap-2 py-3 px-1 text-xs text-gray-500 dark:text-slate-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        Loading version history...
      </div>
    );
  }

  if (failed) {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="py-3 px-1 text-xs text-brand-blue hover:underline"
      >
        Couldn&apos;t load version history — retry
      </button>
    );
  }

  if (!versions || versions.length === 0) {
    return (
      <p className="py-3 px-1 text-xs text-gray-500 dark:text-slate-500">
        No other match runs for this job.
      </p>
    );
  }

  const latestVersionNumber = versions[0]?.versionNumber;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 dark:bg-slate-800/60">
          <tr className="text-left text-gray-500 dark:text-slate-500">
            <th className="py-2 px-3 font-medium">Version</th>
            <th className="py-2 px-3 font-medium">Status</th>
            <th className="py-2 px-3 font-medium">Match Date</th>
            <th className="py-2 px-3 font-medium">Total Matches</th>
            <th className="py-2 px-3 font-medium">Top Score</th>
            <th className="py-2 px-3 font-medium">Avg Score</th>
            <th className="py-2 px-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {versions.map(({ session, versionNumber, topScore, avgScore }) => {
            const isLatest = versionNumber === latestVersionNumber;
            return (
              <tr key={session.id} className="border-t border-gray-100 dark:border-slate-800">
                <td className="py-2 px-3 font-medium text-gray-900 dark:text-slate-100 whitespace-nowrap">
                  v{versionNumber}
                </td>
                <td className="py-2 px-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full font-medium border whitespace-nowrap ${
                      isLatest
                        ? 'bg-green-50 text-green-700 border-green-200'
                        : 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                    }`}
                  >
                    {isLatest ? 'Latest' : 'Previous'}
                  </span>
                </td>
                <td className="py-2 px-3 text-gray-600 dark:text-slate-400 whitespace-nowrap">
                  {formatIST(session.created_at)}
                </td>
                <td className="py-2 px-3 text-gray-900 dark:text-slate-100">{session.total_matches}</td>
                <td className="py-2 px-3 font-medium text-green-700 dark:text-green-400">{topScore}%</td>
                <td className="py-2 px-3 text-gray-700 dark:text-slate-300">{avgScore}%</td>
                <td className="py-2 px-3 text-right">
                  <button
                    type="button"
                    onClick={() => onViewSession(session)}
                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-slate-700 px-2 py-1 font-medium text-gray-700 dark:text-slate-200 hover:border-brand-blue/40 hover:bg-brand-blue/5 hover:text-brand-blue transition-colors whitespace-nowrap"
                  >
                    <Eye className="w-3 h-3" />
                    View
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
