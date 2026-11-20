'use client';

/**
 * MyConsumptionHistory Component
 * Own consumption history (any signed-in user)
 */

import React, { useState, useEffect, useRef } from 'react';
import type { IconComponent } from '@/lib/types/icon';
import {
  ClipboardList,
  ClipboardCheck,
  Video,
  Calendar,
  Filter,
  Download,
  ExternalLink,
  CheckCircle,
  XCircle,
  Clock,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import { showErrorToast } from '@/lib/utils/errorToast';
import { useAuth } from '@/lib/hooks/useAuth';
import { formatIST } from '@/lib/utils/dateUtils';
import {
  unitPoolService,
  UnitType,
  ConsumptionLogEntry,
  getUnitTypeName,
} from '@/lib/services/unitPoolService';
import { useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { Skeleton } from '@/components/ui/skeleton';
import FilterSelect from '@/components/ui/filter-select';
import FilterChips, { type FilterChip } from '@/components/ui/filter-chips';
import { TABLE_EMPTY_PANEL_CLASS } from '@/lib/constants/tableEmptyPanel';
import { MobileRecordList, MobileRecordCard, MobileStatChip, DESKTOP_TABLE_ONLY } from '@/components/ui/mobile-record-card';
import ExportFormatModal from '@/components/ExportFormatModal';
import type { ExportFileFormat } from '@/lib/utils/exportUtils';

const UNIT_TYPE_ICONS: Record<UnitType, IconComponent> = {
  RS: ClipboardList,
  AS: ClipboardCheck,
  AIU: Video,
};

const UNIT_TYPE_COLORS: Record<UnitType, { bg: string; text: string }> = {
  RS: { bg: 'bg-blue-50', text: 'text-blue-700' },
  AS: { bg: 'bg-purple-50', text: 'text-purple-700' },
  AIU: { bg: 'bg-green-50', text: 'text-green-700' },
};

// Page size for walking the whole period in loadHistory (the old fixed limit).
const HISTORY_PAGE_SIZE = 100;

export default function MyConsumptionHistory() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [history, setHistory] = useState<ConsumptionLogEntry[]>([]);
  const [filteredHistory, setFilteredHistory] = useState<ConsumptionLogEntry[]>([]);

  // Filters
  const [selectedType, setSelectedType] = useState<UnitType | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [dateRange, setDateRange] = useState<number>(30); // days
  const [showExportModal, setShowExportModal] = useState(false);

  // Drill-in: cards-first overview. Clicking a card opens the filtered table.
  // Total card → all types; RS / AS / AIU cards → filter the table by that type.
  const [pageView, setPageView] = useState<'cards' | 'list'>('cards');
  const openListView = (type: UnitType | 'all') => {
    setSelectedType(type);
    setPageView('list');
  };

  // Persist the view state (scroll is handled by the parent Usage page, which is
  // the actual scroll container). Second key under the page's 'org-usage'.
  useListStatePersistence(
    'org-usage-consumption',
    { pageView, selectedType, selectedStatus, dateRange },
    (s) => {
      if (s.pageView === 'cards' || s.pageView === 'list') setPageView(s.pageView);
      if (s.selectedType === 'all' || s.selectedType === 'RS' || s.selectedType === 'AS' || s.selectedType === 'AIU') {
        setSelectedType(s.selectedType as UnitType | 'all');
      }
      if (typeof s.selectedStatus === 'string') setSelectedStatus(s.selectedStatus);
      if (typeof s.dateRange === 'number') setDateRange(s.dateRange);
    },
  );

  /* Bumped by every loadHistory run, so only the latest period's rows apply —
     the mount load (default period) and the one after the saved period is
     restored used to race. */
  const loadSeqRef = useRef(0);

  useEffect(() => {
    loadHistory();
  }, [dateRange]);

  useEffect(() => {
    applyFilters();
  }, [history, selectedType, selectedStatus]);

  const loadHistory = async () => {
    const seq = ++loadSeqRef.current;
    const isStale = () => seq !== loadSeqRef.current;
    setIsLoading(true);
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - dateRange);

      /* Page through the whole period. Only the first 100 entries used to
         load, so the summary cards — sums over this list — silently stopped
         counting at 100. The server's `total`, a short page, or a page with
         nothing new (an ignored `offset`) ends the walk. */
      const items: ConsumptionLogEntry[] = [];
      const seen = new Set<string>();
      for (let offset = 0; ; offset += HISTORY_PAGE_SIZE) {
        const data = await unitPoolService.getConsumptionHistory({
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          limit: HISTORY_PAGE_SIZE,
          offset,
        });
        if (isStale()) return;
        const fresh = data.items.filter((item) => !seen.has(item.id));
        fresh.forEach((item) => { seen.add(item.id); items.push(item); });
        if (data.items.length < HISTORY_PAGE_SIZE || fresh.length === 0 || items.length >= data.total) break;
      }
      setHistory(items);
    } catch (error: any) {
      if (isStale()) return;
      showErrorToast(error, "Couldn't load consumption history", { id: 'my-consumption-history-load', retry: loadHistory });
    } finally {
      if (!isStale()) setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...history];

    if (selectedType !== 'all') {
      filtered = filtered.filter(item => item.unit_type === selectedType);
    }

    if (selectedStatus !== 'all') {
      filtered = filtered.filter(item => item.status === selectedStatus);
    }

    setFilteredHistory(filtered);
  };

  // The backend builds the file in either format ('excel' → .xlsx). Errors
  // propagate so the format picker toasts and stays open for a retry.
  const handleExport = async (format: ExportFileFormat) => {
    const blob = await unitPoolService.exportConsumptionHistory({
      format: format === 'xlsx' ? 'excel' : 'csv',
      unit_type: selectedType !== 'all' ? selectedType : undefined,
      status: selectedStatus !== 'all' ? selectedStatus : undefined,
    });

    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `my-consumption-${new Date().toISOString().split('T')[0]}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);

    toast.success('Export completed');
  };

  // Summary cards: standing totals for the period — the Type / Status filters
  // narrow the table below, never these cards (the period is in each card's label).
  const summary = {
    total: history.reduce((sum, item) => sum + (item.units_consumed || 0), 0),
    byType: {
      RS: history.filter(item => item.unit_type === 'RS').reduce((sum, item) => sum + (item.units_consumed || 0), 0),
      AS: history.filter(item => item.unit_type === 'AS').reduce((sum, item) => sum + (item.units_consumed || 0), 0),
      AIU: history.filter(item => item.unit_type === 'AIU').reduce((sum, item) => sum + (item.units_consumed || 0), 0),
    },
    successCount: history.filter(item => item.status === 'SUCCESS').length,
    failedCount: history.filter(item => item.status === 'FAILED').length,
  };

  // Active filter tags: Type, Status and a non-default date range (30 days is
  // the default). Values are the dropdowns' option labels.
  const TYPE_CHIP_LABELS: Record<string, string> = { RS: 'Resume Scoring', AS: 'Assessment', AIU: 'AI Interview' };
  const STATUS_CHIP_LABELS: Record<string, string> = { SUCCESS: 'Success', FAILED: 'Failed' };
  const activeFilterChips: FilterChip[] = [
    selectedType !== 'all' && {
      key: 'type',
      label: 'Type',
      value: TYPE_CHIP_LABELS[selectedType] ?? selectedType,
      onRemove: () => setSelectedType('all'),
    },
    selectedStatus !== 'all' && {
      key: 'status',
      label: 'Status',
      value: STATUS_CHIP_LABELS[selectedStatus] ?? selectedStatus,
      onRemove: () => setSelectedStatus('all'),
    },
    dateRange !== 30 && {
      key: 'date',
      label: 'Date',
      value: `Last ${dateRange} days`,
      onRemove: () => setDateRange(30),
    },
  ].filter(Boolean) as FilterChip[];

  if (isLoading) {
    return (
      <div className="space-y-6">
        {/* Header + summary stat cards */}
        <div className="tf-card-soft p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="w-10 h-10 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-56" />
                <Skeleton className="h-4 w-72" />
              </div>
            </div>
            <Skeleton className="h-9 w-24 rounded-lg" />
          </div>

          <div className="tf-grid-4 mt-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="p-4 bg-gray-50 rounded-lg">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-16 mt-2" />
                <Skeleton className="h-3 w-20 mt-2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="tf-card-soft p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <User className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="tf-section-title">My Consumption History</h2>
              <p className="tf-body-muted">View your personal unit usage across all features</p>
            </div>
          </div>
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 px-4 py-2 tf-label bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <ExportFormatModal
            open={showExportModal}
            onClose={() => setShowExportModal(false)}
            title="Export My Consumption History"
            onExport={handleExport}
          />
        </div>

        {/* Summary Stats — clicking a card drills into the consumption table filtered by that type */}
        <div className="tf-grid-4 mt-6">
          <button
            type="button"
            onClick={() => openListView('all')}
            className={`text-left w-full p-4 bg-gray-50 rounded-lg hover:shadow-md transition-all ${pageView === 'list' && selectedType === 'all' ? 'ring-2 ring-brand-blue' : ''}`}
          >
            <p className="tf-body-secondary">Total Consumed</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{summary.total.toFixed(1)}</p>
            <p className="tf-meta mt-1">Last {dateRange} days</p>
          </button>
          {(['RS', 'AS', 'AIU'] as UnitType[]).map(type => {
            const Icon = UNIT_TYPE_ICONS[type];
            const colors = UNIT_TYPE_COLORS[type];
            return (
              <button
                key={type}
                type="button"
                onClick={() => openListView(type)}
                className={`text-left w-full p-4 ${colors.bg} rounded-lg hover:shadow-md transition-all ${pageView === 'list' && selectedType === type ? 'ring-2 ring-brand-blue' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${colors.text}`} />
                  <p className={`text-sm font-medium ${colors.text}`}>{getUnitTypeName(type)}</p>
                </div>
                <p className={`text-2xl font-bold ${colors.text} mt-1`}>{summary.byType[type].toFixed(1)}</p>
                <p className="tf-meta mt-1">{type} units</p>
              </button>
            );
          })}
        </div>
      </div>

      {pageView === 'list' && (
      <>
      {/* justify-end, not justify-between: the Back to overview button that
          used to hold the left slot is gone, and the tally belongs on the
          right. */}
      <div className="flex items-center justify-end gap-2">
        <span className="tf-meta">
          {filteredHistory.length} {filteredHistory.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {/* Filters */}
      <div className="tf-card-soft p-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="tf-label">Filters:</span>
          </div>

          <FilterSelect
            value={selectedType}
            onChange={(v) => setSelectedType(v as UnitType | 'all')}
            ariaLabel="Unit type"
            options={[
              { value: 'all', label: 'All Types' },
              { value: 'RS', label: 'Resume Scoring' },
              { value: 'AS', label: 'Assessment' },
              { value: 'AIU', label: 'AI Interview' },
            ]}
            className="px-3 sm:px-3 py-1.5 sm:py-1.5 rounded-lg sm:rounded-lg border-gray-300"
          />

          <FilterSelect
            value={selectedStatus}
            onChange={(v) => setSelectedStatus(v)}
            ariaLabel="Status"
            options={[
              { value: 'all', label: 'All Status' },
              { value: 'SUCCESS', label: 'Success' },
              { value: 'FAILED', label: 'Failed' },
            ]}
            className="px-3 sm:px-3 py-1.5 sm:py-1.5 rounded-lg sm:rounded-lg border-gray-300"
          />

          <FilterSelect
            value={String(dateRange)}
            onChange={(v) => setDateRange(Number(v))}
            ariaLabel="Date range"
            options={[
              { value: '7', label: 'Last 7 days' },
              { value: '30', label: 'Last 30 days' },
              { value: '60', label: 'Last 60 days' },
              { value: '90', label: 'Last 90 days' },
            ]}
            className="px-3 sm:px-3 py-1.5 sm:py-1.5 rounded-lg sm:rounded-lg border-gray-300"
          />

          <div className="ml-auto tf-body-secondary">
            {filteredHistory.length} records
          </div>
        </div>
        {activeFilterChips.length > 0 && <FilterChips className="mt-3" chips={activeFilterChips} />}
      </div>

      {/* Consumption History Table */}
      <div className={`tf-card-soft overflow-hidden ${DESKTOP_TABLE_ONLY}`}>
        <div className="overflow-x-auto tf-table-shell">
          <table className="w-full">
            <thead className="bg-white border-b border-gray-200">
              <tr>
                <th className="tf-th-cell text-left tf-th">Date & Time</th>
                <th className="tf-th-cell text-left tf-th">Type</th>
                <th className="tf-th-cell text-left tf-th">Action</th>
                <th className="tf-th-cell text-left tf-th">Units</th>
                <th className="tf-th-cell text-left tf-th">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-0">
                    {/* The shared empty-state panel — see `TABLE_EMPTY_PANEL_CLASS`. */}
                    <div className={`${TABLE_EMPTY_PANEL_CLASS} text-gray-500`}>
                      No consumption history found for the selected filters.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item) => {
                  const Icon = UNIT_TYPE_ICONS[item.unit_type];
                  const colors = UNIT_TYPE_COLORS[item.unit_type];

                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="tf-td tf-body">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-500" />
                          {formatIST(item.created_at)}
                        </div>
                      </td>
                      <td className="tf-td">
                        <div className={`inline-flex items-center gap-1.5 px-2 py-1 ${colors.bg} rounded-md`}>
                          <Icon className={`w-3.5 h-3.5 ${colors.text}`} />
                          <span className={`text-xs font-medium ${colors.text}`}>
                            {getUnitTypeName(item.unit_type)}
                          </span>
                        </div>
                      </td>
                      <td className="tf-td tf-body-secondary">
                        {item.entity_type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </td>
                      <td className="tf-td">
                        <span className="tf-row-name">
                          {item.units_consumed?.toFixed(1) || '0.0'}
                        </span>
                      </td>
                      <td className="tf-td">
                        {item.status === 'SUCCESS' ? (
                          <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-50 rounded-md">
                            <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                            <span className="text-xs font-medium text-green-700">Success</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-red-50 rounded-md">
                            <XCircle className="w-3.5 h-3.5 text-red-600" />
                            <span className="text-xs font-medium text-red-700">Failed</span>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <MobileRecordList
        empty={
          <div className={`${TABLE_EMPTY_PANEL_CLASS} text-gray-500`}>
            No consumption history found for the selected filters.
          </div>
        }
      >
        {filteredHistory.map((item) => {
          const Icon = UNIT_TYPE_ICONS[item.unit_type];
          const colors = UNIT_TYPE_COLORS[item.unit_type];
          return (
            <MobileRecordCard
              key={item.id}
              badges={
                <>
                  <div className={`inline-flex items-center gap-1.5 px-2 py-1 ${colors.bg} rounded-md`}>
                    <Icon className={`w-3.5 h-3.5 ${colors.text}`} />
                    <span className={`text-xs font-medium ${colors.text}`}>
                      {getUnitTypeName(item.unit_type)}
                    </span>
                  </div>
                  {item.status === 'SUCCESS' ? (
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-green-50 rounded-md">
                      <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                      <span className="text-xs font-medium text-green-700">Success</span>
                    </div>
                  ) : (
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-red-50 rounded-md">
                      <XCircle className="w-3.5 h-3.5 text-red-600" />
                      <span className="text-xs font-medium text-red-700">Failed</span>
                    </div>
                  )}
                </>
              }
              title={item.entity_type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
              meta={[{ icon: <Clock className="w-3.5 h-3.5" />, label: formatIST(item.created_at) }]}
              footer={<MobileStatChip tone="info">{item.units_consumed?.toFixed(1) || '0.0'} units</MobileStatChip>}
            />
          );
        })}
      </MobileRecordList>
      </>
      )}

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <User className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-900">Your Access</p>
            <p className="text-sm text-blue-700 mt-1">
              You can view your own consumption history and team summaries. For tenant-wide unit pool details and billing information, contact your Tenant Administrator.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
