'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  FileCheck,
  RefreshCw,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Monitor,
  Globe,
  User,
  Shield,
  CheckCircle,
  XCircle,
  ExternalLink,
  Download,
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
import consentService, { ConsentLog, ConsentAuditLog } from '@/lib/services/consentService';
import { formatIST } from '@/lib/utils/dateUtils';

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
  'w-full px-3 py-2 text-sm border border-gray-200 dark:border-slate-700 rounded-lg ' +
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
  const [limit] = useState(20);

  /* `emailFilter` joins the dependency list. It has been in this component's
     state since it was written and was passed to the API, but no control ever
     set it — the filter row had a Search BUTTON and no search box, so the
     candidate filter the backend supports could not be reached. The toolbar's
     search box writes it now, debounced, exactly like every other tab's. */
  useEffect(() => {
    loadLogs();
  }, [page, featureFilter, statusFilter, emailFilter, startDate, endDate]);

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

  const totalPages = Math.ceil(total / limit);

  // 1-based text for the Go-to-page input — page itself stays 0-based.
  const [goToPage, setGoToPage] = useState(String(page + 1));
  useEffect(() => {
    setGoToPage(String(page + 1));
  }, [page]);

  const commitGoToPage = () => {
    const target = Math.round(Number(goToPage));
    if (Number.isFinite(target) && target >= 1 && target <= totalPages) {
      setPage(target - 1);
    } else {
      setGoToPage(String(page + 1));
    }
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
            className="p-1.5 sm:p-2 shrink-0 self-start text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
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
                <input
                  id="consent-from"
                  type="date"
                  value={startDate}
                  max={endDate || undefined}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setPage(0);
                  }}
                  className={FILTER_FIELD}
                />
              </div>

              <div>
                <label htmlFor="consent-to" className="block text-xs font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                  Consented to
                </label>
                <input
                  id="consent-to"
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setPage(0);
                  }}
                  className={FILTER_FIELD}
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
        <div className="overflow-x-auto tf-table-shell">
          <table className="w-full min-w-[640px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Assessment
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Candidate
                </th>
                <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-2xs sm:text-xs font-medium text-gray-500 uppercase">
                  Feature
                </th>
                <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-2xs sm:text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-2xs sm:text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                  Device
                </th>
                <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-2xs sm:text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                  IP Address
                </th>
                <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-2xs sm:text-xs font-medium text-gray-500 uppercase">
                  Date
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div>
                      {log.assessment_sequence_number && (
                        <p className="text-xs font-medium text-gray-500">
                          AS-{String(log.assessment_sequence_number).padStart(3, '0')}
                        </p>
                      )}
                      <p className="text-sm text-gray-900">
                        {log.assessment_title || '—'}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {log.candidate_name || 'Unknown'}
                        </p>
                        <p className="text-2xs sm:text-xs text-gray-500 truncate">{log.candidate_email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                    <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-2xs sm:text-xs font-medium ${
                      log.feature_name === 'ASSESSMENT'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-purple-100 text-purple-700'
                    }`}>
                      {log.feature_name === 'ASSESSMENT' ? 'Assessment' : 'AI Interview'}
                    </span>
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                    <div className="flex items-center gap-1">
                      {log.consent_status ? (
                        <>
                          <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-success" />
                          <span className="text-xs sm:text-sm text-success">Accepted</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-destructive" />
                          <span className="text-xs sm:text-sm text-destructive">Declined</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 sm:py-3 hidden md:table-cell">
                    <div className="flex items-center gap-1.5">
                      <Monitor className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-xs sm:text-sm text-gray-600 truncate">
                        {log.device_type || 'Unknown'} / {log.browser_name || 'Unknown'}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 sm:py-3 hidden md:table-cell">
                    <div className="flex items-center gap-1.5">
                      <Globe className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-xs sm:text-sm text-gray-600">{log.ip_address}</span>
                    </div>
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 flex-shrink-0" />
                      <span className="text-2xs sm:text-sm text-gray-600 whitespace-nowrap">
                        {new Date(log.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-3 sm:px-6 py-3 sm:py-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-0">
          <p className="text-xs sm:text-sm text-gray-500">
            Showing {page * limit + 1} to {Math.min((page + 1) * limit, total)} of {total}
          </p>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">Go to</span>
              <input
                type="number"
                min={1}
                max={totalPages}
                value={goToPage}
                onChange={(e) => setGoToPage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur();
                    commitGoToPage();
                  }
                }}
                onBlur={commitGoToPage}
                aria-label="Go to page"
                className="w-14 h-8 sm:h-9 px-2 text-sm text-center border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue bg-white text-gray-900"
              />
            </div>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors"
              aria-label="Previous page" title="Previous page"
            >
              <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
            <span className="text-sm font-medium text-gray-700 px-1 whitespace-nowrap">
              <span className="text-brand-blue font-semibold">{page + 1}</span> / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors"
              aria-label="Next page" title="Next page"
            >
              <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedLog && showAuditTrail && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-2 sm:p-4">
            <div
              className="fixed inset-0 bg-gray-500 bg-opacity-75"
              onClick={() => {
                setSelectedLog(null);
                setShowAuditTrail(false);
              }}
            />
            <div className="relative bg-white rounded-lg shadow-xl max-w-[95vw] sm:max-w-2xl w-full max-h-[85dvh] flex flex-col overflow-hidden mx-2 sm:mx-0">
              <div className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200">
                <h3 className="text-sm sm:text-lg font-semibold text-gray-900">Consent Log Details</h3>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-3 sm:py-4 space-y-3 sm:space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
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
                    <p className="text-sm sm:text-base font-medium text-gray-900">{selectedLog.ip_address}</p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-gray-500">Device</p>
                    <p className="text-sm sm:text-base font-medium text-gray-900">
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
              <div className="flex-shrink-0 px-4 sm:px-6 py-3 sm:py-4 border-t border-gray-200 flex justify-end">
                <button
                  onClick={() => {
                    setSelectedLog(null);
                    setShowAuditTrail(false);
                  }}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
