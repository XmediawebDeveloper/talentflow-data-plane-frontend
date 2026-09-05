'use client';

import { Eye, Loader2 } from 'lucide-react';
import { AIMatchSessionResponse } from '@/lib/services/aiMatchService';
import { formatIST } from '@/lib/utils/dateUtils';
/* The app's shared status vocabulary. `getDisplayStatus` is what turns a
   published JD with a publish counter above 1 into "Republished", and
   `getStatusConfig` gives that label the same colours every other list uses. */
import { getDisplayStatus, getStatusConfig } from '@/lib/utils/jobOpeningDisplay';

export interface AIMatchSessionVersion {
  /**
   * The most recent run for this JD version — what View opens, and what the
   * status and match count are read from, since it is the current picture.
   */
  session: AIMatchSessionResponse;
  versionNumber: number;
  /** When this JD version was matched for the FIRST time. */
  firstMatchedAt: string;
  /** When it was matched most recently. Equal to `firstMatchedAt` after a
   *  single run. */
  lastMatchedAt: string;
  /** How many times this version has been matched. */
  runCount: number;
}

/**
 * One row per JD VERSION, not per match run.
 *
 * There is no version field on a match session, so versions are identified by
 * the JD record a run was made against (`jd_id`) — a republish forks the JD
 * into a new row, so a new id is a new version. Runs against the same version
 * collapse into one row carrying the first and most recent match dates.
 *
 * This used to be one row per RUN, with version numbers assigned by
 * chronological order. Matching the same JD three times therefore produced
 * "v1, v2, v3" — three versions that did not exist — and left the first and
 * last match dates identical on every row, because each row was a single
 * moment in time.
 *
 * Version numbers are still ordinals over the groups (oldest = v1) rather than
 * the JD's own publish counter: the counter is not on the session record, and
 * for the ordinary one-run-per-version case the two agree anyway. Newest first,
 * like every other version list in this app.
 */
export function buildAIMatchVersions(sessions: AIMatchSessionResponse[]): AIMatchSessionVersion[] {
  const byVersion = new Map<string, AIMatchSessionResponse[]>();
  for (const session of sessions) {
    // No `jd_id` (older records) means the run cannot be attributed to a
    // version — it stays its own row rather than being merged into someone
    // else's.
    const key = session.jd_id || session.id;
    const runs = byVersion.get(key);
    if (runs) runs.push(session);
    else byVersion.set(key, [session]);
  }

  const asTime = (value: string) => new Date(value).getTime();

  return Array.from(byVersion.values())
    .map((runs) => {
      const chronological = [...runs].sort((a, b) => asTime(a.created_at) - asTime(b.created_at));
      const latest = chronological[chronological.length - 1];
      return {
        session: latest,
        firstMatchedAt: chronological[0].created_at,
        lastMatchedAt: latest.created_at,
        runCount: chronological.length,
      };
    })
    .sort((a, b) => asTime(a.firstMatchedAt) - asTime(b.firstMatchedAt))
    .map((version, index) => ({ ...version, versionNumber: index + 1 }))
    .reverse();
}

interface AIMatchVersionHistoryTableProps {
  loading: boolean;
  failed: boolean;
  versions: AIMatchSessionVersion[] | null;
  /**
   * The JD behind one session, for the Status column.
   *
   * A match session carries its own `status` — that is the state of the MATCH
   * RUN ('completed'), not of the job description, and the column showed
   * neither: it read "Latest" or "Previous", derived from the row's position.
   * The JD's real status lives on the job record, which only the host has, and
   * each session may belong to a different row in the job's lineage — so the
   * host resolves it per session rather than passing one status for the table.
   */
  resolveJob?: (session: AIMatchSessionResponse) => { status?: string; currentVersion?: number } | undefined;
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
  resolveJob,
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
            <th className="py-2 px-3 font-medium">Last Match Date</th>
            <th className="py-2 px-3 font-medium">Total Matches</th>
            <th className="py-2 px-3 font-medium text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {versions.map(({ session, versionNumber, firstMatchedAt, lastMatchedAt, runCount }) => {
            const isLatest = versionNumber === latestVersionNumber;
            return (
              <tr key={session.id} className="border-t border-gray-100 dark:border-slate-800">
                {/* Latest lives HERE now, beside the version number, exactly as
                    it does on the Resume Scoring version table. It answers
                    "which version is this", which is this column's question —
                    the Status column beside it is now free to answer its own. */}
                <td className="py-2 px-3 font-medium text-gray-900 dark:text-slate-100 whitespace-nowrap">
                  <span className="inline-flex items-center gap-1.5">
                    v{versionNumber}
                    {isLatest && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-brand-blue text-white text-[10px] font-semibold tracking-wide">
                        LATEST
                      </span>
                    )}
                  </span>
                </td>
                <td className="py-2 px-3">
                  {(() => {
                    const job = resolveJob?.(session);
                    /* No job resolved means the lineage row is not in the
                       host's list (an archived version it filters out, say).
                       A dash is honest; guessing "Published" would not be. */
                    if (!job?.status) {
                      return <span className="text-gray-400 dark:text-slate-600">—</span>;
                    }
                    const label = getDisplayStatus(job.status, job.currentVersion);
                    const cfg = getStatusConfig(label);
                    return (
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium border whitespace-nowrap ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        {label}
                      </span>
                    );
                  })()}
                </td>
                {/* First ever match against this JD version. */}
                <td className="py-2 px-3 text-gray-600 dark:text-slate-400 whitespace-nowrap">
                  {formatIST(firstMatchedAt)}
                </td>
                {/* Most recent match against it. Identical to the column before
                    it until the version has been matched more than once, so the
                    run count is shown beside it to explain why. */}
                <td className="py-2 px-3 text-gray-600 dark:text-slate-400 whitespace-nowrap">
                  {formatIST(lastMatchedAt)}
                  {runCount > 1 && (
                    <span className="ml-1.5 text-gray-400 dark:text-slate-600">({runCount} runs)</span>
                  )}
                </td>
                <td className="py-2 px-3 text-gray-900 dark:text-slate-100">{session.total_matches}</td>
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
