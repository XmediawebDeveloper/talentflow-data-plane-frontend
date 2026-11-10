'use client';

import { useState, useEffect } from 'react';
import ListToolbar from '@/components/ui/list-toolbar';
import ListCountBadge from '@/components/ui/list-count-badge';
import ListEmptyState from '@/components/ui/list-empty-state';
import { useListSearch } from '@/lib/hooks/useListSearch';
import { Button } from '@/components/ui/button';
import { ArrowLeft,
  Eye, Download, X, BarChart3,
  CheckCircle2, XCircle, AlertCircle, Clock,
  ClipboardList, Video, ClipboardCheck, FileText, TrendingUp, TrendingDown,
  Layers, Minus, RefreshCw, ChevronLeft, ChevronRight
} from 'lucide-react';
import {
  unitPoolService,
  UnitType,
  DeductionCategory,
  UsageTransparencyEntry,
  UsageTransparencyResponse,
  UsageTransparencySummaryResponse,
  getDeductionCategoryName,
  getDeductionCategoryColor,
  getConsumptionStatusColor,
  formatUnitsConsumed,
  UNIT_TYPE_NAMES,
} from '@/lib/services/unitPoolService';
import { formatIST, formatISTDate, formatISTTime } from '@/lib/utils/dateUtils';
import { Skeleton } from '@/components/ui/skeleton';
import FilterSelect from '@/components/ui/filter-select';
import ExportFormatModal from '@/components/ExportFormatModal';
import { exportRows, type ExportFileFormat } from '@/lib/utils/exportUtils';

const EXPORT_HEADERS = [
  'Date', 'Time', 'Unit Type', 'Units', 'Category', 'Status',
  'User', 'Entity Type', 'Entity Name', 'Team', 'Score'
];

interface UsageTransparencyDashboardProps {
  onBack?: () => void;
}

export default function UsageTransparencyDashboard({ onBack }: UsageTransparencyDashboardProps) {
  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<UsageTransparencyResponse | null>(null);
  const [summary, setSummary] = useState<UsageTransparencySummaryResponse | null>(null);

  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Pagination — declared before the hook so `onChange` can reset it.
  const [page, setPage] = useState(0);

  // Shared search/filter state. The controls commit as you pick, so this uses
  // `setFilter`. Defaults: 30 days, both deduction toggles on — anything else
  // counts as a filter.
  const search = useListSearch({
    initialFilters: {
      unitType: '' as UnitType | '',
      category: '' as DeductionCategory | '',
      days: 30,
      includePartialDeductions: true,
      includeNonDeductions: true,
    },
    onChange: () => setPage(0),
  });
  const searchQuery = search.appliedQuery;
  const {
    unitType: selectedUnitType,
    category: selectedCategory,
    days,
    includePartialDeductions,
    includeNonDeductions,
  } = search.filters;
  const [limit] = useState(50);

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));

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

  // Fetch data
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [transparencyData, summaryData] = await Promise.all([
        unitPoolService.getUsageTransparency({
          unit_type: selectedUnitType || undefined,
          deduction_category: selectedCategory || undefined,
          include_non_deductions: includeNonDeductions,
          include_partial_deductions: includePartialDeductions,
          limit,
          offset: page * limit,
        }),
        unitPoolService.getUsageTransparencySummary(days),
      ]);
      setData(transparencyData);
      setSummary(summaryData);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch usage transparency data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedUnitType, selectedCategory, includeNonDeductions, includePartialDeductions, page, days]);

  // Filter entries by search query
  const filteredEntries = data?.items.filter(entry => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      entry.entity_name?.toLowerCase().includes(query) ||
      entry.user_email?.toLowerCase().includes(query) ||
      entry.user_name?.toLowerCase().includes(query) ||
      entry.entity_type?.toLowerCase().includes(query)
    );
  }) || [];

  // Get icon for unit type
  const getUnitTypeIcon = (unitType: UnitType) => {
    switch (unitType) {
      case 'RS':
        return <ClipboardList className="w-4 h-4" />;
      case 'AS':
        return <ClipboardCheck className="w-4 h-4" />;
      case 'AIU':
        return <Video className="w-4 h-4" />;
      default:
        return <FileText className="w-4 h-4" />;
    }
  };

  // Get icon for deduction category
  const getDeductionIcon = (category: DeductionCategory) => {
    switch (category) {
      case 'FULL':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'PARTIAL':
        return <Minus className="w-4 h-4" />;
      case 'NON_DEDUCTION':
        return <XCircle className="w-4 h-4" />;
      default:
        return <AlertCircle className="w-4 h-4" />;
    }
  };

  // Export data — runs from the format picker, which toasts and stays open
  // if the fetch fails.
  const handleExport = async (format: ExportFileFormat) => {
    const exportData = await unitPoolService.getUsageTransparency({
      unit_type: selectedUnitType || undefined,
      deduction_category: selectedCategory || undefined,
      include_non_deductions: includeNonDeductions,
      include_partial_deductions: includePartialDeductions,
      limit: 10000,
      offset: 0,
    });

    const rows = exportData.items.map(entry => [
      formatISTDate(entry.created_at),
      formatISTTime(entry.created_at),
      entry.unit_type,
      formatUnitsConsumed(entry.units_consumed),
      getDeductionCategoryName(entry.deduction_category),
      entry.status,
      entry.user_email || entry.user_name || '',
      entry.entity_type || '',
      entry.entity_name || '',
      entry.team_name || '',
      entry.overall_score?.toString() || '',
    ]);

    await exportRows(format, EXPORT_HEADERS, rows, `usage-transparency-${new Date().toISOString().split('T')[0]}`, {
      sheetName: 'Usage Transparency',
    });
  };

  if (loading && !data) {
    return (
      <div className="min-h-[100dvh] bg-gradient-to-br from-gray-50 to-gray-100/30">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Skeleton className="w-12 h-12 rounded-xl" />
                <div className="space-y-2">
                  <Skeleton className="h-6 w-72" />
                  <Skeleton className="h-3.5 w-96 max-w-full" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-28 rounded-lg" />
                <Skeleton className="h-10 w-32 rounded-lg" />
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Summary */}
          <div className="mb-8">
            <Skeleton className="h-6 w-64 mb-4" />
            {/* Category Summary Cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="bg-white border-2 border-gray-200 rounded-xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="w-8 h-8 rounded-lg" />
                  </div>
                  <Skeleton className="h-8 w-16 mb-1" />
                  <Skeleton className="h-3 w-32" />
                </div>
              ))}
            </div>
            {/* Unit Type Breakdown */}
            <div className="grid grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="tf-panel p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Skeleton className="w-8 h-8 rounded-lg" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <div key={j} className="flex justify-between">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-3.5 w-10" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Filters Section */}
          <div className="tf-card-soft p-6 mb-6">
            <div className="flex items-center justify-between gap-4">
              <Skeleton className="h-10 w-64 rounded-lg" />
              <Skeleton className="h-10 w-28 rounded-lg" />
            </div>
          </div>

          {/* Data Table */}
          <div className="tf-card-soft p-6">
            <div className="flex items-center gap-3 mb-6">
              <Skeleton className="w-5 h-5 rounded" />
              <Skeleton className="h-5 w-48" />
            </div>
            <div className="overflow-x-auto tf-table-shell">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <th key={i} className="tf-th-cell text-left tf-th">
                        <Skeleton className="h-3 w-20" />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 7 }).map((_, r) => (
                    <tr key={r} className="border-b border-gray-100">
                      {Array.from({ length: 8 }).map((_, c) => (
                        <td key={c} className="tf-td">
                          <Skeleton className="h-4 w-16" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-gray-50 to-gray-100/30">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center shadow-lg">
                <Eye className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="tf-page-title">Usage Transparency Dashboard</h1>
                <p className="tf-body-secondary mt-0.5">
                  Detailed visibility of unit deductions: Full, Partial, and Non-Deductions
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                onClick={fetchData}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="primary"
                onClick={() => setShowExportModal(true)}
                icon={<Download className="w-4 h-4" />}
              >
                Export
              </Button>
              <ExportFormatModal
                open={showExportModal}
                onClose={() => setShowExportModal(false)}
                title="Export Usage Transparency"
                recordCount={data?.total}
                columns={EXPORT_HEADERS}
                onExport={handleExport}
              />
              {onBack && (
                <Button
                  variant="secondary"
                  onClick={onBack}
                  icon={<ArrowLeft className="w-4 h-4" />}
                >
                  Back
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-destructive-subtle border border-destructive-line rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
            <p className="text-sm text-destructive">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto" aria-label="Close">
              <X className="w-4 h-4 text-destructive hover:text-destructive" />
            </button>
          </div>
        )}

        {/* Summary Cards */}
        {summary && (
          <div className="mb-8">
            <h2 className="tf-section-title mb-4 flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Deduction Summary ({summary.period.days} Days)
            </h2>

            {/* Category Summary Cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {/* Full Deductions */}
              <div className="bg-white border-2 border-success-line rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-success">Full Deductions</span>
                  <div className="w-8 h-8 bg-success-subtle rounded-lg flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-success" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-success-strong">
                  {summary.summary.by_category?.FULL || 0}
                </div>
                <p className="text-xs text-success mt-1">1.0 unit per action</p>
              </div>

              {/* Partial Deductions */}
              <div className="bg-white border-2 border-warning-line rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-warning">Partial Deductions</span>
                  <div className="w-8 h-8 bg-warning-subtle rounded-lg flex items-center justify-center">
                    <Minus className="w-4 h-4 text-warning" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-warning-strong">
                  {summary.summary.by_category?.PARTIAL || 0}
                </div>
                <p className="text-xs text-warning mt-1">0.5 unit per action</p>
              </div>

              {/* Non-Deductions */}
              <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="tf-label">Non-Deductions</span>
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                    <XCircle className="w-4 h-4 text-gray-600" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-gray-800">
                  {summary.summary.by_category?.NON_DEDUCTION || 0}
                </div>
                <p className="tf-meta mt-1">0 units (failed/abandoned)</p>
              </div>
            </div>

            {/* Unit Type Breakdown */}
            <div className="grid grid-cols-3 gap-4">
              {(['RS', 'AS', 'AIU'] as UnitType[]).map(unitType => {
                const typeData = summary.summary.by_unit_type?.[unitType];
                return (
                  <div key={unitType} className="tf-panel p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                        {getUnitTypeIcon(unitType)}
                      </div>
                      <span className="font-medium text-gray-900">{UNIT_TYPE_NAMES[unitType]}</span>
                    </div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-500">Total Records</span>
                        <span className="font-semibold">{typeData?.total_records || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500">Total Units</span>
                        <span className="font-semibold">{typeData?.total_units?.toFixed(1) || '0.0'}</span>
                      </div>
                      <div className="flex justify-between text-success">
                        <span>Full</span>
                        <span>{typeData?.full_deductions || 0}</span>
                      </div>
                      <div className="flex justify-between text-warning">
                        <span>Partial</span>
                        <span>{typeData?.partial_deductions || 0}</span>
                      </div>
                      <div className="flex justify-between text-gray-500">
                        <span>Non-Deduction</span>
                        <span>{typeData?.non_deductions || 0}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filters Section */}
        <div className="tf-card-soft p-6 mb-6">
          <ListToolbar
            searchValue={search.query}
            onSearchChange={search.setQuery}
            // The hook debounces into `appliedQuery`, so keystrokes pass through.
            searchDebounceMs={0}
            searchPlaceholder="Search usage records..."
            onToggleFilters={() => setShowFilters(!showFilters)}
            filtersOpen={showFilters}
            activeFilterCount={search.activeFilterCount}
            filtersApplied={search.filtersApplied}
            onClearFilters={search.reset}
            className="mb-0"
            /* Counts what this page of results holds — the list is server
               paginated, so `data.items` is the page, not the whole history. */
            countBadge={
              <ListCountBadge
                filtered={filteredEntries.length}
                total={data?.items.length ?? 0}
                noun="record"
              />
            }
          />

          {showFilters && (
            <div className="mt-4 sm:mt-5 pt-4 sm:pt-5 border-t border-brand-blue/10">
            <div className="tf-grid-4">
              {/* Unit Type Filter */}
              <div>
                <label className="block tf-label mb-2">Unit Type</label>
                <FilterSelect
                  value={selectedUnitType}
                  onChange={(v) => search.setFilter('unitType', v as UnitType | '')}
                  ariaLabel="Unit Type"
                  options={[
                    { value: '', label: 'All Types' },
                    { value: 'RS', label: 'Resume Scoring' },
                    { value: 'AS', label: 'Assessment' },
                    { value: 'AIU', label: 'AI Interview' },
                  ]}
                  className="w-full sm:w-full px-4 sm:px-4 py-2 sm:py-2 rounded-lg sm:rounded-lg border-gray-300 text-base sm:text-base"
                />
              </div>

              {/* Category Filter */}
              <div>
                <label className="block tf-label mb-2">Deduction Category</label>
                <FilterSelect
                  value={selectedCategory}
                  onChange={(v) => search.setFilter('category', v as DeductionCategory | '')}
                  ariaLabel="Deduction Category"
                  options={[
                    { value: '', label: 'All Categories' },
                    { value: 'FULL', label: 'Full Deduction (1.0)' },
                    { value: 'PARTIAL', label: 'Partial Deduction (0.5)' },
                    { value: 'NON_DEDUCTION', label: 'Non-Deduction (0)' },
                  ]}
                  className="w-full sm:w-full px-4 sm:px-4 py-2 sm:py-2 rounded-lg sm:rounded-lg border-gray-300 text-base sm:text-base"
                />
              </div>

              {/* Time Period */}
              <div>
                <label className="block tf-label mb-2">Time Period</label>
                <FilterSelect
                  value={String(days)}
                  onChange={(v) => search.setFilter('days', parseInt(v))}
                  ariaLabel="Time Period"
                  options={[
                    { value: '7', label: 'Last 7 Days' },
                    { value: '30', label: 'Last 30 Days' },
                    { value: '90', label: 'Last 90 Days' },
                    { value: '180', label: 'Last 6 Months' },
                    { value: '365', label: 'Last Year' },
                  ]}
                  className="w-full sm:w-full px-4 sm:px-4 py-2 sm:py-2 rounded-lg sm:rounded-lg border-gray-300 text-base sm:text-base"
                />
              </div>

              {/* Checkboxes */}
              <div className="col-span-2 lg:col-span-4 flex gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includePartialDeductions}
                    onChange={(e) => search.setFilter('includePartialDeductions', e.target.checked)}
                    className="tf-checkbox focus:ring-gray-500"
                  />
                  <span className="tf-body">Include Partial Deductions</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeNonDeductions}
                    onChange={(e) => search.setFilter('includeNonDeductions', e.target.checked)}
                    className="tf-checkbox focus:ring-gray-500"
                  />
                  <span className="tf-body">Include Non-Deductions (Failed/Abandoned)</span>
                </label>
              </div>
            </div>

            {/* Panel footer: "Done" applies the selection and reveals the
                toolbar Clear - same flow as job-openings. */}
            <div className="mt-4 pt-3 border-t border-brand-blue/10 flex items-center justify-end gap-2">
              {/* The controls above commit as they change, so Done just closes. */}
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowFilters(false)}
              >
                Done
              </Button>
            </div>
            </div>
          )}
        </div>

        {/* Data Table */}
        <div className="tf-card-soft p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-gray-700" />
              <h3 className="text-lg text-gray-900 font-medium">
                Usage Details
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({data?.total || 0} total records)
                </span>
              </h3>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto tf-table-shell">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="tf-th-cell text-left tf-th">Timestamp</th>
                  <th className="tf-th-cell text-left tf-th">Unit Type</th>
                  <th className="tf-th-cell text-center tf-th">Units</th>
                  <th className="tf-th-cell text-left tf-th">Category</th>
                  <th className="tf-th-cell text-left tf-th">Status</th>
                  <th className="tf-th-cell text-left tf-th">User</th>
                  <th className="tf-th-cell text-left tf-th">Entity</th>
                  <th className="tf-th-cell text-right tf-th">Score</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry, index) => (
                  <tr
                    key={entry.id}
                    className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                    }`}
                  >
                    <td className="tf-td">
                      <div className="tf-body">
                        {formatISTDate(entry.created_at)}
                      </div>
                      <div className="tf-meta">
                        {formatISTTime(entry.created_at)}
                      </div>
                    </td>
                    <td className="tf-td">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md tf-caption bg-gray-100 border border-gray-200">
                        {getUnitTypeIcon(entry.unit_type)}
                        {UNIT_TYPE_NAMES[entry.unit_type] || entry.unit_type}
                      </span>
                    </td>
                    <td className="tf-td text-center">
                      <span className={`inline-flex items-center justify-center min-w-[3rem] px-2 py-1 rounded-lg text-sm font-bold ${
                        entry.units_consumed === 0
                          ? 'bg-gray-100 text-gray-500'
                          : entry.units_consumed < 1
                            ? 'bg-warning-subtle text-warning'
                            : 'bg-success-subtle text-success'
                      }`}>
                        {formatUnitsConsumed(entry.units_consumed)}
                      </span>
                    </td>
                    <td className="tf-td">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${getDeductionCategoryColor(entry.deduction_category)}`}>
                        {getDeductionIcon(entry.deduction_category)}
                        {getDeductionCategoryName(entry.deduction_category)}
                      </span>
                    </td>
                    <td className="tf-td">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${getConsumptionStatusColor(entry.status)}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="tf-td">
                      <div className="tf-body truncate max-w-[150px]" title={entry.user_email || undefined}>
                        {entry.user_name || entry.user_email || '-'}
                      </div>
                      {entry.team_name && (
                        <div className="tf-meta">{entry.team_name}</div>
                      )}
                    </td>
                    <td className="tf-td">
                      <div className="tf-body truncate max-w-[200px]" title={entry.entity_name || undefined}>
                        {entry.entity_name || '-'}
                      </div>
                      {entry.entity_type && (
                        <div className="tf-meta">{entry.entity_type}</div>
                      )}
                    </td>
                    <td className="tf-td text-right">
                      {entry.overall_score !== null ? (
                        <span className={`inline-flex items-center px-2 py-1 rounded-lg text-sm font-semibold ${
                          entry.overall_score >= 70
                            ? 'bg-success-subtle text-success'
                            : entry.overall_score >= 40
                              ? 'bg-warning-subtle text-warning'
                              : 'bg-destructive-subtle text-destructive'
                        }`}>
                          {entry.overall_score}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredEntries.length === 0 && (
              <ListEmptyState
                icon={Eye}
                isNarrowed={search.isNarrowed}
                query={search.appliedQuery}
                entityLabel="usage record"
                emptyTitle="No usage recorded yet"
                emptyDescription="Records appear here as features consume units."
                onReset={search.reset}
              />
            )}
          </div>

          {/* Pagination */}
          {data && data.total > limit && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200 max-sm:flex-col max-sm:justify-center max-sm:gap-2">
              <div className="tf-body-secondary max-sm:text-center">
                Showing {page * limit + 1} - {Math.min((page + 1) * limit, data.total)} of {data.total}
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="tf-body-secondary whitespace-nowrap">Go to</span>
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
                    className="tf-input w-14 h-8 sm:h-9 px-2 text-center"
                  />
                </div>
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="tf-btn tf-btn-secondary w-8 h-8 sm:w-9 sm:h-9 border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors whitespace-normal gap-0 font-normal"
                  aria-label="Previous page" title="Previous page"
                >
                  <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
                <span className="tf-label px-1 whitespace-nowrap">
                  <span className="text-brand-blue font-semibold">{page + 1}</span> / {totalPages}
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={(page + 1) * limit >= data.total}
                  className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors"
                  aria-label="Next page" title="Next page"
                >
                  <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="tf-card-soft mt-6 p-6">
          <h4 className="tf-row-title mb-4">Deduction Categories Explained</h4>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-success-subtle rounded-lg flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-4 h-4 text-success" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Full Deduction (1.0)</p>
                <p className="tf-meta mt-1">
                  Completed action: Resume scored, Assessment sent, AI Interview conducted
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-warning-subtle rounded-lg flex items-center justify-center flex-shrink-0">
                <Minus className="w-4 h-4 text-warning" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Partial Deduction (0.5)</p>
                <p className="tf-meta mt-1">
                  Partial completion: Session cutoff, incomplete assessment submission
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <XCircle className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Non-Deduction (0)</p>
                <p className="tf-meta mt-1">
                  No units charged: Failed operation, user abandoned, insufficient units
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
