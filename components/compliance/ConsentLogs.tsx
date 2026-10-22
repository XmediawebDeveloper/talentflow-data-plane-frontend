'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  FileCheck,
  RefreshCw,
  ChevronDown,
  Calendar,
  Monitor,
  Globe,
  Shield,
  CheckCircle,
  XCircle,
  ExternalLink,
  Download,
  X,
} from 'lucide-react';
import ListEmptyState from '@/components/ui/list-empty-state';
import ListToolbar from '@/components/ui/list-toolbar';
import ListFilterPanel from '@/components/ui/list-filter-panel';
import ListCountBadge from '@/components/ui/list-count-badge';
/* Renders the toolbar into the host page's reserved position — on the
   Assessments page, the one row above the tab pills. The AI Interview page
   mounts this `compact`, with no filter row at all, so it is unaffected. */
import { ListToolbarPortal } from '@/components/ui/list-toolbar-slot';
import { Button } from '@/components/ui/button';
import ListPagination from '@/components/ListPagination';
import { DateField } from '@/components/ui/date-field';
import consentService, { ConsentLog, ConsentAuditLog } from '@/lib/services/consentService';
import { assessmentService } from '@/lib/services/assessmentService';
import JobIdBadge from '@/components/jobs/JobIdBadge';
import { VersionPill } from '@/components/assessments/AllAssessmentsTable';
import { formatIST } from '@/lib/utils/dateUtils';
import NameAvatar from '@/components/ui/name-avatar';

interface ConsentLogsProps {
  compact?: boolean;
  defaultFeature?: string;
}

/* Every control in the More Filters panel wears this. It is the field class the
   panels on the Assessments page's other tabs use, verbatim, so a select here
   and a select there are the same object — this row used to set its own height
   and border because it was its own row; inside the shared panel it is not.
   A literal string, not a template, so Tailwind's scanner can still see the
   class names. */
const FILTER_FIELD =
  'w-full min-w-0 h-[38px] px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg ' +
  'bg-white dark:bg-slate-900 text-black dark:text-slate-100 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue/40';

export default function ConsentLogs({ compact = false, defaultFeature = '' }: ConsentLogsProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [logs, setLogs] = useState<ConsentLog[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedLog, setSelectedLog] = useState<ConsentLog | null>(null);
  const [auditTrail, setAuditTrail] = useState<ConsentAuditLog[]>([]);
  const [showAuditTrail, setShowAuditTrail] = useState(false);

  // Filters
  const [featureFilter, setFeatureFilter] = useState<string>(defaultFeature);

  /* JD ID and Assessment Version, for the Assessments page's copy of this
     list. A consent log names its assessment (`feature_context_id`) but
     carries neither field, so each assessment on screen is read once from
     /assessments/{id} — the record Candidate Results takes the same two
     fields from (`jd_short_id`, `version`). Cached by id across pages; a
     failed read stays `null` and its cells show a dash. */
  const showAssessmentColumns = defaultFeature === 'ASSESSMENT';
  const [assessmentMeta, setAssessmentMeta] = useState<Record<string, { jdShortId?: string; jdTitle?: string; version?: number } | null>>({});
  useEffect(() => {
    if (!showAssessmentColumns) return;
    const ids = [...new Set(
      logs
        .filter((log) => log.feature_name === 'ASSESSMENT' && log.feature_context_id)
        .map((log) => log.feature_context_id as string),
    )].filter((id) => !(id in assessmentMeta));
    if (ids.length === 0) return;
    let cancelled = false;
    Promise.allSettled(ids.map((id) => assessmentService.get(id))).then((results) => {
      if (cancelled) return;
      setAssessmentMeta((prev) => {
        const next = { ...prev };
        results.forEach((result, i) => {
          next[ids[i]] = result.status === 'fulfilled'
            ? { jdShortId: result.value.jd_short_id, jdTitle: result.value.jd_title, version: result.value.version }
            : null;
        });
        return next;
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, showAssessmentColumns]);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [emailFilter, setEmailFilter] = useState<string>('');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const [showFilters, setShowFilters] = useState(false);

  /* What the count badge reads as its "before narrowing" figure.

     The list is paged and filtered by the SERVER, so `total` is only ever the
     count for the current query — there is no second number to compare it
     with. This captures one: the total from whichever load ran with nothing
     narrowing it, which the first load always is. Until then the badge simply
     shows the two as equal, which is the truth at that moment. */
  const [baselineTotal, setBaselineTotal] = useState(0);

  /* True once the first request has come back, either way.
     It gates the full-screen spinner below, which used to be `isLoading &&
     logs.length === 0` — a test the search can now satisfy over and over: type
     a query that matches nothing, and the next keystroke has `isLoading` true
     with `logs` empty, so the whole component (the search box with it) is
     replaced by the spinner and the caret is thrown out of the field
     mid-word. That was harmless while the only control here was a Search
     button. Now the first load gets the spinner and every load after it
     refreshes the rows underneath a toolbar that stays put. */
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  // Pagination
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(showAssessmentColumns ? 10 : 20);

  /* `emailFilter` joins the dependency list. It has been in this component's
     state since it was written and was passed to the API, but no control ever
     set it — the filter row had a Search BUTTON and no search box, so the
     candidate filter the backend supports could not be reached. The toolbar's
     search box writes it now, debounced, exactly like every other tab's. */
  useEffect(() => {
    loadLogs();
  }, [page, limit, featureFilter, statusFilter, emailFilter, startDate, endDate]);

  const loadLogs = async () => {
    setIsLoading(true);
    try {
      const params: any = {
        limit,
        offset: page * limit,
      };
      if (featureFilter) params.feature_name = featureFilter;
      if (statusFilter) params.consent_status = statusFilter === 'accepted';
      if (emailFilter) params.candidate_email = emailFilter;
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const result = await consentService.getConsentLogs(params);
      setLogs(result.items);
      setTotal(result.total);
      /* Only an unnarrowed load can set the baseline — see `baselineTotal`.
         `featureFilter` is excluded from that test for the same reason
         `hasNarrowingFilters` excludes it: the host page pins it. */
      if (!statusFilter && !emailFilter.trim() && !startDate && !endDate) {
        setBaselineTotal(result.total);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to load consent logs');
    } finally {
      setIsLoading(false);
      setHasLoadedOnce(true);
    }
  };

  const loadAuditTrail = async (consentLogId: string) => {
    try {
      const result = await consentService.getConsentAuditTrail({
        consent_log_id: consentLogId,
        limit: 50,
      });
      setAuditTrail(result.items);
      setShowAuditTrail(true);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load audit trail');
    }
  };

  const clearFilters = () => {
    /* Back to `defaultFeature`, not to nothing. The host page PINS this one —
       the Assessments tab mounts with 'ASSESSMENT' — so clearing it to '' does
       not un-narrow the list, it widens it past what this tab is for and starts
       showing AI Interview consents under an Assessments heading. It is also
       the value `hasNarrowingFilters` treats as "not narrowed", so the two now
       agree. */
    setFeatureFilter(defaultFeature);
    setStatusFilter('');
    setEmailFilter('');
    setStartDate('');
    setEndDate('');
    setPage(0);
  };

  /* Whether a filter is what emptied the list, which decides which flavour of
     the shared empty state shows. `featureFilter` counts only when the user
     moved it off the value this tab was mounted with — the Assessments page
     pins it to ASSESSMENT and AI Interview to its own feature, so treating that
     as "narrowed" would put a Reset button in front of every empty tab. */
  const hasNarrowingFilters =
    featureFilter !== defaultFeature ||
    statusFilter !== '' ||
    emailFilter.trim() !== '' ||
    startDate !== '' ||
    endDate !== '';

  if (isLoading && !hasLoadedOnce) {
    return (
      <div className="flex items-center justify-center py-12 tf-loader-center">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Header */}
      <div className="px-3 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
        {/* `gap-3` + `min-w-0` + `shrink-0`, which this row did without while
            the subtitle was "340 consent records". It is a full sentence now,
            and a flex item defaults to `min-width: auto` — it refuses to shrink
            below its content — so on a phone the text pushed the Refresh button
            off the right edge instead of wrapping. `min-w-0` lets the text
            column shrink and the sentence wrap; `shrink-0` keeps the icon chip
            and the button at their own size; the gap stops the two ever
            touching. */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="p-1.5 sm:p-2 bg-purple-100 rounded-lg shrink-0">
              <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-lg font-semibold text-gray-900">Candidate Consent Logs</h2>
              {/* The count moved to the toolbar's badge, which also states what
                  the filters narrowed away ("12 of 340"). It stays here in
                  `compact`, where there is no toolbar to carry it. */}
              <p className="text-xs sm:text-sm text-gray-500">
                {compact
                  ? `${total} consent records`
                  : 'Every consent a candidate has given or declined, with the record behind it.'}
              </p>
            </div>
          </div>
          <button
            onClick={loadLogs}
            disabled={isLoading}
            className="h-8 w-8 sm:h-9 sm:w-9 inline-flex items-center justify-center shrink-0 self-start text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Search + filters — the shared toolbar, in the host page's one
          position for it.

          What stood here was a hand-built row: a Filters glyph, a status
          select, two date inputs, a Search button and a Clear link, laid out
          and coloured to its own rules. It was the last list on the
          Assessments page still drawing its own, so the search box jumped
          into this card the moment you opened the Consent Logs tab — and it
          had no search box at all, only a button, so the candidate filter
          this component has always sent to the API was unreachable.

          Now: the same `ListToolbar` as every other tab (search, More
          Filters, Reset, count badge, in that order) over the same
          `ListFilterPanel`. The fields are the ones that were already here,
          and each still commits as it changes — Done only closes the panel.

          `compact` (the AI Interview page) had no filter row before and has
          none now. */}
      {!compact && (
        <ListToolbarPortal>
          <ListToolbar
            searchValue={emailFilter}
            onSearchChange={(value) => {
              setEmailFilter(value);
              setPage(0);
            }}
            searchPlaceholder="Search by candidate email..."
            onToggleFilters={() => setShowFilters(!showFilters)}
            filtersOpen={showFilters}
            activeFilterCount={(statusFilter ? 1 : 0) + (startDate || endDate ? 1 : 0)}
            filtersApplied={!!statusFilter || !!startDate || !!endDate}
            onClearFilters={clearFilters}
            className="mb-0"
            countBadge={
              <ListCountBadge
                filtered={total}
                total={Math.max(baselineTotal, total)}
                noun="consent log"
                nounPlural="consent logs"
              />
            }
          />

          {showFilters && (
            <ListFilterPanel
              footer={
                <Button variant="secondary" size="sm" onClick={() => setShowFilters(false)}>
                  Done
                </Button>
              }
            >
              <div>
                <label htmlFor="consent-status" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                  Status
                </label>
                <select
                  id="consent-status"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(0);
                  }}
                  className={FILTER_FIELD}
                >
                  <option value="">All statuses</option>
                  <option value="accepted">Accepted</option>
                  <option value="declined">Declined</option>
                </select>
              </div>

              <div>
                <label htmlFor="consent-from" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                  Consented from
                </label>
                <DateField
                  id="consent-from"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(v) => {
                    setStartDate(v);
                    setPage(0);
                  }}
                />
              </div>

              <div>
                <label htmlFor="consent-to" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                  Consented to
                </label>
                <DateField
                  id="consent-to"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(v) => {
                    setEndDate(v);
                    setPage(0);
                  }}
                />
              </div>
            </ListFilterPanel>
          )}
        </ListToolbarPortal>
      )}

      {/* Nothing to list: the shared ListEmptyState, INSTEAD of the table —
          the message used to sit under a live table header drawn over zero
          rows, which is exactly the drift these shared states exist to stop.
          It picks its own wording: a filter that matched nothing gets "No
          consent logs match …" and a Reset, an empty log gets the plain line.

          The toolbar above stays either way; it is what a narrowed zero
          needs, and `clearFilters` here is the same handler its Reset calls.

          No `!isLoading` in the test any more. Now that the search box fires
          requests, a refresh over an empty result would otherwise fall through
          to the table and draw a header above no rows for the length of the
          request — the very thing this state replaced. It shows the last
          settled answer instead, and the header's spinner says a newer one is
          on its way. */}
      {logs.length === 0 ? (
        <ListEmptyState
          icon={Shield}
          isNarrowed={hasNarrowingFilters}
          query={emailFilter}
          entityLabel="consent log"
          emptyTitle="No consent logs found"
          emptyDescription="Consent records appear here once candidates accept the terms for an assessment or interview."
          onReset={clearFilters}
        />
      ) : (
        <div className="overflow-x-auto">
          {/* Every column on screen at every width, the table scrolling
              sideways instead. No height cap and no vertical scroller: the
              page's rows show in full and the pagination below reaches the
              rest. */}
          <table className={`w-full table-auto ${showAssessmentColumns ? 'min-w-[1200px]' : 'min-w-[960px]'}`}>
            <thead className="[&_th]:bg-slate-50 dark:[&_th]:bg-slate-800 [&_th]:border-b [&_th]:border-gray-200 dark:[&_th]:border-slate-700">
              <tr>
                {showAssessmentColumns && <th className="text-left px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">JD ID</th>}
                <th className="text-left px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">{showAssessmentColumns ? 'Job Role' : 'Assessment'}</th>
                {showAssessmentColumns && <th className="text-left px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Assessment Version</th>}
                <th className="text-left px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Candidate</th>
                <th className="text-left px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Feature</th>
                <th className="text-left px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Status</th>
                <th className="text-left px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Device</th>
                <th className="text-left px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">IP Address</th>
                <th className="text-left px-3 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold text-gray-600 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap align-middle">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
              {logs.map((log) => {
                const meta = log.feature_context_id ? assessmentMeta[log.feature_context_id] : undefined;
                return (
                <tr key={log.id} className="transition-colors hover:bg-gray-50 dark:hover:bg-slate-800">
                  {showAssessmentColumns && (
                    <td className="px-3 sm:px-4 py-4 align-middle whitespace-nowrap">
                      {meta?.jdShortId ? (
                        <JobIdBadge>{meta.jdShortId}</JobIdBadge>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  )}
                  {/* Job Role on the Assessments page: the job's own title
                      (`jd_title` on the assessment record), not the
                      assessment's "Doctor - Assessment" title. Until that
                      record has loaded, or if it cannot be read, the
                      assessment title up to its first " - ". Elsewhere the
                      assessment title as it was. No AS- number either way. */}
                  {(() => {
                    const label = showAssessmentColumns
                      ? meta?.jdTitle || (log.assessment_title || '').split(' - ')[0].trim()
                      : log.assessment_title;
                    return (
                      <td className="px-3 sm:px-4 py-4 align-middle">
                        <span
                          className="block max-w-[16rem] truncate text-sm font-medium text-gray-900 dark:text-slate-50"
                          title={label || undefined}
                        >
                          {label || '—'}
                        </span>
                      </td>
                    );
                  })()}
                  {showAssessmentColumns && (
                    <td className="px-3 sm:px-4 py-4 align-middle whitespace-nowrap">
                      {meta?.version ? (
                        <VersionPill kind="assessment" version={meta.version} />
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-3 sm:px-4 py-4 align-middle">
                    <div className="flex items-center gap-3">
                      <NameAvatar name={log.candidate_name} fallback={log.candidate_email} size="md" />
                      <div className="min-w-0 max-w-[240px]">
                        <p className="font-medium text-gray-900 dark:text-slate-50 text-sm truncate" title={log.candidate_name || 'Unknown'}>
                          {log.candidate_name || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-slate-500 truncate" title={log.candidate_email}>{log.candidate_email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 sm:px-4 py-4 align-middle whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                      log.feature_name === 'ASSESSMENT'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-purple-100 text-purple-700'
                    }`}>
                      {log.feature_name === 'ASSESSMENT' ? 'Assessment' : 'AI Interview'}
                    </span>
                  </td>
                  <td className="px-3 sm:px-4 py-4 align-middle whitespace-nowrap">
                    {log.consent_status ? (
                      <div className="flex items-center gap-2 text-sm text-success">
                        <CheckCircle className="w-4 h-4 flex-shrink-0" />
                        Accepted
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-destructive">
                        <XCircle className="w-4 h-4 flex-shrink-0" />
                        Declined
                      </div>
                    )}
                  </td>
                  <td className="px-3 sm:px-4 py-4 align-middle whitespace-nowrap">
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                      <Monitor className="w-4 h-4 flex-shrink-0" />
                      {log.device_type || 'Unknown'} / {log.browser_name || 'Unknown'}
                    </div>
                  </td>
                  <td className="px-3 sm:px-4 py-4 align-middle whitespace-nowrap">
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                      <Globe className="w-4 h-4 flex-shrink-0" />
                      {log.ip_address}
                    </div>
                  </td>
                  <td className="px-3 sm:px-4 py-4 align-middle whitespace-nowrap">
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                      <Calendar className="w-4 h-4 flex-shrink-0" />
                      {new Date(log.created_at).toLocaleDateString()}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Candidate Results / Draft / Archived pagination — the shared
          ListPagination, under the table. Hidden while there are no rows,
          as on those tabs. The page stays 0-based here for the API's offset;
          the pager is 1-based. */}
      {logs.length > 0 && (
        <ListPagination
          currentPage={page + 1}
          itemsPerPage={limit}
          totalItems={total}
          onPageChange={(next) => setPage(next - 1)}
          onItemsPerPageChange={(size) => { setLimit(size); setPage(0); }}
          itemLabel="consent logs"
        />
      )}

      {/* Detail Modal */}
      {selectedLog && showAuditTrail && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-3 sm:p-6">
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75"
              onClick={() => {
                setSelectedLog(null);
                setShowAuditTrail(false);
              }}
            />
            <div className="relative bg-white rounded-lg shadow-xl max-w-[95vw] sm:max-w-2xl w-full max-h-[calc(100dvh-1.5rem)] sm:max-h-[85dvh] flex flex-col overflow-hidden">
              <div className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-sm sm:text-lg font-semibold text-gray-900">Consent Log Details</h3>
                <button
                  onClick={() => {
                    setSelectedLog(null);
                    setShowAuditTrail(false);
                  }}
                  className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 [&>div]:min-w-0">
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500">Candidate</p>
                    <p className="text-sm sm:text-base font-medium text-gray-900 break-all">{selectedLog.candidate_email}</p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500">Feature</p>
                    <p className="text-sm sm:text-base font-medium text-gray-900">{selectedLog.feature_name}</p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500">Status</p>
                    <p className={`text-sm sm:text-base font-medium ${selectedLog.consent_status ? 'text-success' : 'text-destructive'}`}>
                      {selectedLog.consent_status ? 'Accepted' : 'Declined'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500">Proctoring Consent</p>
                    <p className="text-sm sm:text-base font-medium text-gray-900">
                      {selectedLog.proctoring_consent ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500">IP Address</p>
                    <p className="text-sm sm:text-base font-medium text-gray-900 [overflow-wrap:anywhere]">{selectedLog.ip_address}</p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500">Device</p>
                    <p className="text-sm sm:text-base font-medium text-gray-900 [overflow-wrap:anywhere]">
                      {selectedLog.device_type} / {selectedLog.browser_name} {selectedLog.browser_version}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500">OS</p>
                    <p className="text-sm sm:text-base font-medium text-gray-900">
                      {selectedLog.os_name} {selectedLog.os_version}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500">Date</p>
                    <p className="text-sm sm:text-base font-medium text-gray-900">
                      {formatIST(selectedLog.created_at)}
                    </p>
                  </div>
                </div>

                {/* Audit Trail */}
                <div className="mt-4 sm:mt-6">
                  <h4 className="text-sm sm:text-base font-medium text-gray-900 mb-2 sm:mb-3">Audit Trail</h4>
                  <div className="space-y-2">
                    {auditTrail.map((audit) => (
                      <div
                        key={audit.id}
                        className="p-2.5 sm:p-3 bg-gray-50 rounded-lg text-xs sm:text-sm"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                          <span className="font-medium text-gray-900">{audit.action}</span>
                          <span className="text-gray-500 text-2xs sm:text-xs">
                            {formatIST(audit.created_at)}
                          </span>
                        </div>
                        <p className="text-gray-600 mt-0.5 sm:mt-1 break-all">
                          By {audit.actor_email || 'System'} ({audit.actor_type})
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
