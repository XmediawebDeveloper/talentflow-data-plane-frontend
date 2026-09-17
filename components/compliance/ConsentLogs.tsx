'use client';

import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  FileCheck,
  Search,
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
  Filter,
} from 'lucide-react';
import ListEmptyState from '@/components/ui/list-empty-state';
import consentService, { ConsentLog, ConsentAuditLog } from '@/lib/services/consentService';
import { formatIST } from '@/lib/utils/dateUtils';

interface ConsentLogsProps {
  compact?: boolean;
  defaultFeature?: string;
}

/* Every control in the filter row wears this: one height, one border, one focus
   ring. Written once rather than repeated per field because the alignment IS
   the sameness — the previous row set its padding three different ways
   (`py-1.5 sm:py-2`, `px-1.5 sm:px-3`, `px-2 sm:px-3`) and no two controls
   ended up the same height. A literal string, not a template, so Tailwind's
   scanner can still see the class names. */
const FILTER_FIELD =
  'h-9 min-w-0 px-3 bg-white border border-gray-300 rounded-lg text-sm text-black ' +
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

  // Pagination
  const [page, setPage] = useState(0);
  const [limit] = useState(20);

  useEffect(() => {
    loadLogs();
  }, [page, featureFilter, statusFilter, startDate, endDate]);

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
    } catch (error: any) {
      toast.error(error.message || 'Failed to load consent logs');
    } finally {
      setIsLoading(false);
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

  const handleSearch = () => {
    setPage(0);
    loadLogs();
  };

  const clearFilters = () => {
    setFeatureFilter('');
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

  if (isLoading && logs.length === 0) {
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="p-1.5 sm:p-2 bg-purple-100 rounded-lg">
              <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-sm sm:text-lg font-semibold text-gray-900">Candidate Consent Logs</h2>
              <p className="text-xs sm:text-sm text-gray-500">
                {total} consent records
              </p>
            </div>
          </div>
          <button
            onClick={loadLogs}
            disabled={isLoading}
            className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filters — one row.

          It was four stacked rows, and not by design: the children still carry
          `col-span-2` / `sm:col-span-1` from a grid that is no longer their
          parent (it is `flex flex-col` now), so those classes resolve to
          nothing and every control took a line of its own. The date inputs were
          `flex-1` inside that full-width column, which is what stretched them
          the width of the card.

          Now one wrapping flex row: filters left, actions right on `ml-auto`,
          and every control on the same `h-9` so the select, both dates and both
          buttons share a baseline instead of each sizing itself from its own
          padding. `flex-wrap` is what keeps that honest on a narrow screen —
          one line wherever it fits, a clean second line where it cannot, rather
          than a row that overflows.

          The dates are `w-[150px]`: a native date input needs about 135px to
          show `mm/dd/yyyy` without clipping, so this is the narrowest they go
          while still reading as date fields rather than truncated boxes.

          Colour is the app's rather than purple. `focus:ring-brand-blue/40` +
          `focus:border-brand-blue/40` is the ring every input in `ListToolbar`
          wears, the Filter glyph takes the `text-brand-blue/60` that toolbar's
          search icon uses, and Search is `bg-brand-blue` / `hover:bg-brand-blue-2`,
          the house primary. The purple this replaces (`purple-500` rings,
          `purple-600` button) was never a TalentFlow colour — it appears in no
          `--brand-*` token in globals.css. */}
      {!compact && (
        <div className="px-3 sm:px-6 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Filter className="w-4 h-4 text-brand-blue/60" />
              <span className="text-sm font-medium text-gray-700">Filters</span>
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by consent status"
              className={FILTER_FIELD}
            >
              <option value="">All Status</option>
              <option value="accepted">Accepted</option>
              <option value="declined">Declined</option>
            </select>

            {/* The two dates are one control, so they travel together when the
                row wraps — hence their own flex box rather than three loose
                children with a stray "to" that could wrap onto its own line. */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                aria-label="From date"
                className={`${FILTER_FIELD} w-[150px]`}
              />
              <span className="text-xs text-gray-400 flex-shrink-0">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                aria-label="To date"
                className={`${FILTER_FIELD} w-[150px]`}
              />
            </div>

            {/* `sm:ml-auto` rather than `ml-auto`: on a phone the group has
                already wrapped to its own line, and pushing it right there
                would strand two buttons against the far edge with the fields
                left-aligned above them. */}
            <div className="flex items-center gap-2 sm:ml-auto flex-shrink-0">
              <button
                onClick={handleSearch}
                className="h-9 px-3.5 inline-flex items-center gap-1.5 bg-brand-blue text-white rounded-lg text-sm font-medium hover:bg-brand-blue-2 transition-colors"
              >
                <Search className="w-4 h-4" />
                <span>Search</span>
              </button>

              <button
                onClick={clearFilters}
                className="h-9 px-3 rounded-lg text-sm text-gray-600 hover:text-brand-blue hover:bg-brand-blue/5 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Nothing to list: the shared ListEmptyState, INSTEAD of the table —
          the message used to sit under a live table header drawn over zero
          rows, which is exactly the drift these shared states exist to stop.
          It picks its own wording: a filter that matched nothing gets "No
          consent logs match …" and a Reset, an empty log gets the plain line.

          The filter bar above stays either way; it is what a narrowed zero
          needs, and `clearFilters` here is the same handler its own Clear
          button calls. */}
      {logs.length === 0 && !isLoading ? (
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
                <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase">
                  Feature
                </th>
                <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase">
                  Status
                </th>
                <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                  Device
                </th>
                <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                  IP Address
                </th>
                <th className="px-3 sm:px-4 py-2.5 sm:py-3 text-left text-[10px] sm:text-xs font-medium text-gray-500 uppercase">
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
                        <p className="text-[10px] sm:text-xs text-gray-500 truncate">{log.candidate_email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 sm:px-4 py-2.5 sm:py-3">
                    <span className={`px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-medium ${
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
                          <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-500" />
                          <span className="text-xs sm:text-sm text-green-700">Accepted</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500" />
                          <span className="text-xs sm:text-sm text-red-700">Declined</span>
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
                      <span className="text-[10px] sm:text-sm text-gray-600 whitespace-nowrap">
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
                    <p className={`text-sm sm:text-base font-medium ${selectedLog.consent_status ? 'text-green-600' : 'text-red-600'}`}>
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
                          <span className="text-gray-500 text-[10px] sm:text-xs">
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
