'use client';

import { Eye, Loader2 } from 'lucide-react';
import { AIMatchSessionResponse } from '@/lib/services/aiMatchService';
import { formatIST } from '@/lib/utils/dateUtils';
/* The app's shared status vocabulary. `getDisplayStatus` is what turns a
   published JD with a publish counter above 1 into "Republished", and
   `getStatusConfig` gives that label the same colours every other list uses. */
import { getDisplayStatus, getStatusConfig, formatEmploymentType, formatIndustryType } from '@/lib/utils/jobOpeningDisplay';

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
   * The JD behind one session, for the Status / Experience / Industry /
   * Location / Work Mode columns.
   *
   * A match session carries its own `status` — that is the state of the MATCH
   * RUN ('completed'), not of the job description, and none of these columns'
   * facts live on the session at all. The JD record they come from lives on
   * the host's job list, which only has the CURRENT version of each job — an
   * older version further back in the lineage resolves to undefined here and
   * those cells fall back to a dash, the same degrade the Status column
   * already had. Resolved per session, not per card, since each row may
   * belong to a different JD record than the one the card above it shows.
   */
  resolveJob?: (session: AIMatchSessionResponse) => {
    status?: string;
    currentVersion?: number;
    experience?: string;
    industryType?: string;
    location?: string;
    employmentType?: string;
    remoteType?: string;
  } | undefined;
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
    <>
    {/* Border/ring/shadow and header shading match JobVersionHistoryPanel's
        (Resume Scoring / Job Openings) version table exactly — same
        brand-blue-tinted "this is the active version table" treatment,
        applied here since this table renders its own rows instead of
        sharing that component (match sessions have no version field to hang
        off its Job-shaped row model). */}
    <div className="hidden md:block overflow-x-auto rounded-lg border border-brand-blue/50 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10 dark:border-brand-blue/40 dark:ring-brand-blue/25 dark:shadow-black/20">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left">
            <th className="py-2.5 px-3 font-bold text-gray-900 bg-brand-sky dark:bg-slate-800 dark:text-slate-100">Version</th>
            <th className="py-2.5 px-3 font-bold text-gray-900 bg-brand-sky dark:bg-slate-800 dark:text-slate-100">Status</th>
            <th className="py-2.5 px-3 font-bold text-gray-900 bg-brand-sky dark:bg-slate-800 dark:text-slate-100">Experience / Industry</th>
            <th className="py-2.5 px-3 font-bold text-gray-900 bg-brand-sky dark:bg-slate-800 dark:text-slate-100">Location</th>
            <th className="py-2.5 px-3 font-bold text-gray-900 bg-brand-sky dark:bg-slate-800 dark:text-slate-100">Work Mode / Type</th>
            <th className="py-2.5 px-3 font-bold text-gray-900 bg-brand-sky dark:bg-slate-800 dark:text-slate-100">Last Match Date</th>
            <th className="py-2.5 px-3 font-bold text-gray-900 bg-brand-sky dark:bg-slate-800 dark:text-slate-100">Number of Runs</th>
            <th className="py-2.5 px-3 font-bold text-gray-900 bg-brand-sky dark:bg-slate-800 dark:text-slate-100">Total Matches</th>
            <th className="py-2.5 px-3 font-bold text-gray-900 bg-brand-sky dark:bg-slate-800 dark:text-slate-100 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {versions.map(({ session, versionNumber, lastMatchedAt, runCount }, rowIndex) => {
            const isLatest = versionNumber === latestVersionNumber;
            /* An inset box-shadow rather than `divide-y`/`border-b`: this
               table's `border-collapse: collapse` (Tailwind's table
               preflight) resolves a <tr>'s own border against its <td>s'
               and silently drops it, so every row but the last read with no
               separator at all. A shadow paints on the cell itself and
               isn't subject to that resolution — same trick the sticky
               Select/Action columns elsewhere in the app already use for
               exactly this reason. */
            const isLastRow = rowIndex === versions.length - 1;
            const rowDivider = isLastRow ? '' : 'shadow-[inset_0_-1px_0_#e5e7eb] dark:shadow-[inset_0_-1px_0_#334155]';
            // Resolved once per row and shared by every cell that needs it
            // (Status, Experience/Industry, Location, Work Mode/Type) rather
            // than re-resolved per cell.
            const job = resolveJob?.(session);
            return (
              <tr
                key={session.id}
                /* Same faint brand tint the latest row carries on the Resume
                   Scoring / Job Openings version tables, so "which row is
                   live" reads identically everywhere it's asked. */
                className={`transition-colors duration-200 ease-out ${
                  isLatest
                    ? 'bg-brand-blue/[0.025] hover:bg-brand-blue/[0.05] dark:bg-brand-blue/[0.06] dark:hover:bg-brand-blue/[0.1]'
                    : 'hover:bg-brand-blue/[0.03] dark:hover:bg-brand-blue/[0.08]'
                }`}
              >
                {/* Latest lives HERE now, beside the version number, exactly as
                    it does on the Resume Scoring version table. It answers
                    "which version is this", which is this column's question —
                    the Status column beside it is now free to answer its own. */}
                <td className={`py-2.5 px-3 whitespace-nowrap ${rowDivider}`}>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="px-2 py-0.5 rounded-md font-semibold text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/35">
                      v{versionNumber}
                    </span>
                    {isLatest && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-brand-blue text-white text-[10px] font-semibold tracking-wide">
                        LATEST
                      </span>
                    )}
                  </span>
                </td>
                <td className={`py-2.5 px-3 ${rowDivider}`}>
                  {(() => {
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
                {/* Experience / Industry — one column, stacked, same
                    space-saving treatment Resume Scoring's own version table
                    uses. Experience arrives pre-formatted ("3-6 years") off
                    the host's job list; industry runs through the shared
                    formatter so it never shows the raw snake_case value. */}
                <td className={`py-2.5 px-3 whitespace-nowrap ${rowDivider}`}>
                  <div className="text-gray-700 dark:text-slate-300">{job?.experience || '—'}</div>
                  <div
                    className="text-gray-500 dark:text-slate-500 max-w-[140px] truncate"
                    title={job?.industryType ? formatIndustryType(job.industryType) : ''}
                  >
                    {job?.industryType ? formatIndustryType(job.industryType) : '—'}
                  </div>
                </td>
                <td
                  className={`py-2.5 px-3 whitespace-nowrap max-w-[140px] truncate ${rowDivider}`}
                  title={job?.location || ''}
                >
                  {job?.location || '—'}
                </td>
                {/* Work Mode / Type — stacked: employment type over remote
                    mode. A missing half simply drops out; nothing invented. */}
                <td className={`py-2.5 px-3 whitespace-nowrap ${rowDivider}`}>
                  <div className="text-gray-700 dark:text-slate-300">
                    {job?.employmentType ? formatEmploymentType(job.employmentType) : '—'}
                  </div>
                  {job?.remoteType && (
                    <div className="text-gray-500 dark:text-slate-500">{formatEmploymentType(job.remoteType)}</div>
                  )}
                </td>
                {/* Most recent match against this JD version. */}
                <td className={`py-2.5 px-3 text-gray-600 dark:text-slate-400 whitespace-nowrap ${rowDivider}`}>
                  {formatIST(lastMatchedAt)}
                </td>
                <td className={`py-2.5 px-3 text-gray-900 dark:text-slate-100 ${rowDivider}`}>{runCount}</td>
                <td className={`py-2.5 px-3 text-gray-900 dark:text-slate-100 ${rowDivider}`}>{session.total_matches}</td>
                <td className={`py-2.5 px-3 text-right ${rowDivider}`}>
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

    {/* Mobile cards — the table is too wide below md */}
    <div className="md:hidden space-y-2">
      {versions.map(({ session, versionNumber, lastMatchedAt, runCount }) => {
        const isLatest = versionNumber === latestVersionNumber;
        const job = resolveJob?.(session);
        const label = job?.status ? getDisplayStatus(job.status, job.currentVersion) : undefined;
        const cfg = label ? getStatusConfig(label) : undefined;
        return (
          <div
            key={session.id}
            className={`rounded-lg border p-3 text-xs ${
              isLatest
                ? 'border-brand-blue/30 bg-brand-blue/[0.025] dark:border-brand-blue/40 dark:bg-brand-blue/[0.06]'
                : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5">
                <span className="px-2 py-0.5 rounded-md font-semibold text-brand-blue bg-brand-blue/10 ring-1 ring-brand-blue/20 dark:bg-brand-blue/20 dark:text-blue-300 dark:ring-brand-blue/35">
                  v{versionNumber}
                </span>
                {isLatest && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-brand-blue text-white text-[10px] font-semibold tracking-wide">
                    LATEST
                  </span>
                )}
              </span>
              {cfg && label ? (
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium border whitespace-nowrap ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                  {label}
                </span>
              ) : (
                <span className="text-gray-400 dark:text-slate-600">—</span>
              )}
            </div>
            <div className="flex flex-col gap-1 text-gray-600 dark:text-slate-400 mb-2">
              {(job?.experience || job?.industryType) && (
                <span>
                  {job.experience || '—'}
                  {job.industryType && ` · ${formatIndustryType(job.industryType)}`}
                </span>
              )}
              {job?.location && <span>{job.location}</span>}
              {(job?.employmentType || job?.remoteType) && (
                <span>
                  {job.employmentType ? formatEmploymentType(job.employmentType) : '—'}
                  {job.remoteType && ` · ${formatEmploymentType(job.remoteType)}`}
                </span>
              )}
              <span>Last Match Date: {formatIST(lastMatchedAt)}</span>
              <span>Number of Runs: {runCount}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-gray-900 dark:text-slate-100 font-medium">{session.total_matches} total matches</span>
              <button
                type="button"
                onClick={() => onViewSession(session)}
                className="inline-flex items-center gap-1 rounded-md border border-gray-200 dark:border-slate-700 px-2.5 py-2 font-medium text-gray-700 dark:text-slate-200 hover:border-brand-blue/40 hover:bg-brand-blue/5 hover:text-brand-blue transition-colors"
              >
                <Eye className="w-3 h-3" />
                View
              </button>
            </div>
          </div>
        );
      })}
    </div>
    </>
  );
}
