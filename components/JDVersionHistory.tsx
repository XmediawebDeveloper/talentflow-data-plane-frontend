'use client';

import { useState } from 'react';
import { GitBranch, RefreshCw } from 'lucide-react';
import { jdService, JDLineageVersion } from '@/lib/services/jdService';
import { formatISTDate } from '@/lib/utils/dateUtils';

/**
 * "View Versions" for a job description card, with its history expanding in
 * place underneath.
 *
 * One implementation for every JD picker in the app — Resume Scoring, AI Talent
 * Match, Assessments and AI Interviews all show the same list of published JDs,
 * and four hand-rolled copies of a connector tree is how they would drift apart.
 * The Job Openings list keeps its own copy of this markup only because its
 * button and its tree sit in different parts of the row (actions column vs.
 * below the card) and so cannot be one element.
 *
 * Renders nothing at all for a job with no history: on a v1 job the tree would
 * open onto a single entry repeating the card above it.
 */

interface JDVersionHistoryProps {
  /** JD row id — the lineage is fetched for this id. */
  jdId: string;
  /**
   * The version this card is showing, i.e. the number in its vN chip. Used only
   * to decide whether the control appears; the history itself comes from the
   * server. Anything at or below 1 means there is nothing to show.
   */
  version?: number;
  className?: string;
}

/* Status wording and colour follow the chips already on these cards. Kept local
   rather than imported from a list component so this file has no dependency on
   any one page's helpers. */
const STATUS_STYLES: Record<string, string> = {
  published: 'bg-success-subtle text-success ring-success-line',
  draft: 'bg-gray-100 text-gray-700 ring-gray-200',
  disabled: 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20',
  archived: 'bg-gray-100 text-gray-500 ring-gray-200',
};

const statusLabel = (status: string) =>
  status ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase() : 'Unknown';

export default function JDVersionHistory({ jdId, version, className = '' }: JDVersionHistoryProps) {
  const [expanded, setExpanded] = useState(false);
  const [lineage, setLineage] = useState<JDLineageVersion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // Nothing to expand into — no control, no empty state, no row noise.
  if ((version ?? 1) <= 1) return null;

  const load = async () => {
    if (loading) return;
    setLoading(true);
    setFailed(false);
    try {
      setLineage((await jdService.getLineageVersions(jdId)) || []);
    } catch {
      /* `lineage` stays null so opening again — or the retry link — refetches.
         Caching [] here would have made one dropped request look like "this job
         has no history" permanently, with no way back short of a reload. */
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  /* Separate from `load` so the retry link can refetch without also collapsing
     the panel it is sitting in. */
  const toggle = () => {
    const opening = !expanded;
    setExpanded(opening);
    if (opening && !lineage) void load();
  };

  return (
    /* Clicks are contained here: these cards select a JD, and opening the
       history must not also pick the job. */
    <div className={className} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        title={expanded ? 'Hide version history' : 'View version history'}
        className={`h-7 px-2 inline-flex items-center gap-1 whitespace-nowrap border rounded-md text-xs transition-all ${
          expanded
            ? 'bg-brand-blue/10 text-brand-blue border-brand-blue/30'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        }`}
      >
        <GitBranch className="w-3.5 h-3.5" />
        {expanded ? 'Hide Versions' : 'View Versions'}
      </button>

      {expanded && (
        <div className="mt-2">
          <p className="tf-caption mb-1">Version history</p>
          {loading && !lineage ? (
            <div className="flex items-center gap-2 py-2 tf-meta">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              Loading versions...
            </div>
          ) : failed ? (
            <button
              type="button"
              onClick={load}
              className="py-2 text-xs text-brand-blue hover:underline"
            >
              Couldn&apos;t load versions — retry
            </button>
          ) : !lineage || lineage.length === 0 ? (
            <p className="py-2 tf-meta">No other versions of this job.</p>
          ) : (
            <ul>
              {lineage.map((entry, index) => {
                const isLast = index === lineage.length - 1;
                const label = statusLabel(entry.status);
                const tone = STATUS_STYLES[(entry.status || '').toLowerCase()] ?? STATUS_STYLES.draft;
                return (
                  <li key={entry.id} className="relative pl-8 py-1.5">
                    {/* Connector, drawn per row rather than as one spine: a
                        segment down to this row's centre, a stub across, and the
                        segment below only while rows remain — which is what makes
                        the run close off at the last version instead of trailing
                        past it. */}
                    <span aria-hidden="true" className="absolute left-2 top-0 h-1/2 w-px bg-gray-200" />
                    {!isLast && (
                      <span aria-hidden="true" className="absolute left-2 top-1/2 bottom-0 w-px bg-gray-200" />
                    )}
                    <span aria-hidden="true" className="absolute left-2 top-1/2 w-4 h-px bg-gray-200" />

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="tf-badge bg-gray-50 text-gray-700 ring-1 ring-gray-200 flex">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                        v{entry.version_number ?? 1}
                      </span>
                      {entry.is_latest_version && (
                        <span className="tf-badge bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/20">
                          Latest
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-xs ring-1 flex items-center gap-1 ${tone}`}>
                        {label}
                      </span>
                      {(entry.published_at || entry.created_at) && (
                        <span className="tf-meta">
                          {formatISTDate(entry.published_at || entry.created_at)}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
