'use client';

import { useState, useEffect } from 'react';
import ListToolbar from '@/components/ui/list-toolbar';
import ListCountBadge from '@/components/ui/list-count-badge';
import ListEmptyState from '@/components/ui/list-empty-state';
import { useListSearch } from '@/lib/hooks/useListSearch';
import {
  Eye, Download, X, BarChart3,
  CheckCircle2, XCircle, AlertCircle, Loader2, Clock,
  Target, Video, ClipboardCheck, FileText, TrendingUp, TrendingDown,
  Layers, Minus, RefreshCw
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
        return <Target className="w-4 h-4" />;
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

  // Export data
  const handleExport = async () => {
    try {
      const exportData = await unitPoolService.getUsageTransparency({
        unit_type: selectedUnitType || undefined,
        deduction_category: selectedCategory || undefined,
        include_non_deductions: includeNonDeductions,
        include_partial_deductions: includePartialDeductions,
        limit: 10000,
        offset: 0,
      });

      // Convert to CSV
      const headers = [
        'Date', 'Time', 'Unit Type', 'Units', 'Category', 'Status',
        'User', 'Entity Type', 'Entity Name', 'Team', 'Score'
      ];

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

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `usage-transparency-${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    } catch (err: any) {
      setError('Failed to export data');
    }
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/30 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-gray-700" />
          <span className="text-lg text-gray-600">Loading usage transparency data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/30">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center shadow-lg">
                <Eye className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl text-gray-900">Usage Transparency Dashboard</h1>
                <p className="text-sm text-gray-600 mt-0.5">
                  Detailed visibility of unit deductions: Full, Partial, and Non-Deductions
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchData}
                className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
              <button
                onClick={handleExport}
                className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
              {onBack && (
                <button
                  onClick={onBack}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
                >
                  Back
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto" aria-label="Close">
              <X className="w-4 h-4 text-red-500 hover:text-red-700" />
            </button>
          </div>
        )}

        {/* Summary Cards */}
        {summary && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Layers className="w-5 h-5" />
              Deduction Summary ({summary.period.days} Days)
            </h2>

            {/* Category Summary Cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {/* Full Deductions */}
              <div className="bg-white border-2 border-green-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-green-700">Full Deductions</span>
                  <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-green-800">
                  {summary.summary.by_category?.FULL || 0}
                </div>
                <p className="text-xs text-green-600 mt-1">1.0 unit per action</p>
              </div>

              {/* Partial Deductions */}
              <div className="bg-white border-2 border-amber-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-amber-700">Partial Deductions</span>
                  <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                    <Minus className="w-4 h-4 text-amber-600" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-amber-800">
                  {summary.summary.by_category?.PARTIAL || 0}
                </div>
                <p className="text-xs text-amber-600 mt-1">0.5 unit per action</p>
              </div>

              {/* Non-Deductions */}
              <div className="bg-white border-2 border-gray-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">Non-Deductions</span>
                  <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                    <XCircle className="w-4 h-4 text-gray-600" />
                  </div>
                </div>
                <div className="text-3xl font-bold text-gray-800">
                  {summary.summary.by_category?.NON_DEDUCTION || 0}
                </div>
                <p className="text-xs text-gray-600 mt-1">0 units (failed/abandoned)</p>
              </div>
            </div>

            {/* Unit Type Breakdown */}
            <div className="grid grid-cols-3 gap-4">
              {(['RS', 'AS', 'AIU'] as UnitType[]).map(unitType => {
                const typeData = summary.summary.by_unit_type?.[unitType];
                return (
                  <div key={unitType} className="bg-white border border-gray-200 rounded-xl p-4">
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
                      <div className="flex justify-between text-green-600">
                        <span>Full</span>
                        <span>{typeData?.full_deductions || 0}</span>
                      </div>
                      <div className="flex justify-between text-amber-600">
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
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6 mb-6">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-5">
              {/* Unit Type Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Unit Type</label>
                <select
                  value={selectedUnitType}
                  onChange={(e) => search.setFilter('unitType', e.target.value as UnitType | '')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 bg-white"
                >
                  <option value="">All Types</option>
                  <option value="RS">Resume Scoring</option>
                  <option value="AS">Assessment</option>
                  <option value="AIU">AI Interview</option>
                </select>
              </div>

              {/* Category Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Deduction Category</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => search.setFilter('category', e.target.value as DeductionCategory | '')}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 bg-white"
                >
                  <option value="">All Categories</option>
                  <option value="FULL">Full Deduction (1.0)</option>
                  <option value="PARTIAL">Partial Deduction (0.5)</option>
                  <option value="NON_DEDUCTION">Non-Deduction (0)</option>
                </select>
              </div>

              {/* Time Period */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Time Period</label>
                <select
                  value={days}
                  onChange={(e) => search.setFilter('days', parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-500 bg-white"
                >
                  <option value={7}>Last 7 Days</option>
                  <option value={30}>Last 30 Days</option>
                  <option value={90}>Last 90 Days</option>
                  <option value={180}>Last 6 Months</option>
                  <option value={365}>Last Year</option>
                </select>
              </div>

              {/* Checkboxes */}
              <div className="col-span-2 lg:col-span-4 flex gap-6 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includePartialDeductions}
                    onChange={(e) => search.setFilter('includePartialDeductions', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-gray-700 focus:ring-gray-500"
                  />
                  <span className="text-sm text-gray-700">Include Partial Deductions</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeNonDeductions}
                    onChange={(e) => search.setFilter('includeNonDeductions', e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-gray-700 focus:ring-gray-500"
                  />
                  <span className="text-sm text-gray-700">Include Non-Deductions (Failed/Abandoned)</span>
                </label>
              </div>
            </div>

            {/* Panel footer: "Done" applies the selection and reveals the
                toolbar Clear - same flow as job-openings. */}
            <div className="mt-4 pt-3 border-t border-brand-blue/10 flex items-center justify-end gap-2">
              <button
                // The controls above commit as they change, so Done just closes.
                onClick={() => setShowFilters(false)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-brand-blue transition-colors hover:bg-brand-blue-2 shadow-sm shadow-brand-blue/25"
              >
                Done
              </button>
            </div>
            </div>
          )}
        </div>

        {/* Data Table */}
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
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
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Timestamp</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Unit Type</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Units</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Category</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">User</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Entity</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Score</th>
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
                    <td className="py-4 px-4">
                      <div className="text-sm text-gray-900">
                        {formatISTDate(entry.created_at)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatISTTime(entry.created_at)}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                        {getUnitTypeIcon(entry.unit_type)}
                        {UNIT_TYPE_NAMES[entry.unit_type] || entry.unit_type}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className={`inline-flex items-center justify-center min-w-[3rem] px-2 py-1 rounded-lg text-sm font-bold ${
                        entry.units_consumed === 0
                          ? 'bg-gray-100 text-gray-500'
                          : entry.units_consumed < 1
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-green-100 text-green-700'
                      }`}>
                        {formatUnitsConsumed(entry.units_consumed)}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${getDeductionCategoryColor(entry.deduction_category)}`}>
                        {getDeductionIcon(entry.deduction_category)}
                        {getDeductionCategoryName(entry.deduction_category)}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${getConsumptionStatusColor(entry.status)}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="text-sm text-gray-900 truncate max-w-[150px]" title={entry.user_email || undefined}>
                        {entry.user_name || entry.user_email || '-'}
                      </div>
                      {entry.team_name && (
                        <div className="text-xs text-gray-500">{entry.team_name}</div>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <div className="text-sm text-gray-700 truncate max-w-[200px]" title={entry.entity_name || undefined}>
                        {entry.entity_name || '-'}
                      </div>
                      {entry.entity_type && (
                        <div className="text-xs text-gray-500">{entry.entity_type}</div>
                      )}
                    </td>
                    <td className="py-4 px-4 text-right">
                      {entry.overall_score !== null ? (
                        <span className={`inline-flex items-center px-2 py-1 rounded-lg text-sm font-semibold ${
                          entry.overall_score >= 70
                            ? 'bg-green-100 text-green-700'
                            : entry.overall_score >= 40
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-red-100 text-red-700'
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
            <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                Showing {page * limit + 1} - {Math.min((page + 1) * limit, data.total)} of {data.total}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(0, page - 1))}
                  disabled={page === 0}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="px-4 py-2 text-sm text-gray-600">
                  Page {page + 1} of {Math.ceil(data.total / limit)}
                </span>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={(page + 1) * limit >= data.total}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Deduction Categories Explained</h4>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Full Deduction (1.0)</p>
                <p className="text-xs text-gray-500 mt-1">
                  Completed action: Resume scored, Assessment sent, AI Interview conducted
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Minus className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">Partial Deduction (0.5)</p>
                <p className="text-xs text-gray-500 mt-1">
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
                <p className="text-xs text-gray-500 mt-1">
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
