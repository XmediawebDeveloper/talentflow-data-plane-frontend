'use client';

/**
 * TenantUnitPool Component - UN01
 * Displays tenant's shared unit pool status for Resume Scoring, Assessment, and AI Interview
 */

import AppModal from '@/components/ui/app-modal';
import React, { useState, useEffect, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import {
  ClipboardList,
  ClipboardCheck,
  Video,
  AlertTriangle,
  TrendingUp,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  User,
  Calendar,
  Info,
  ExternalLink,
  Download,
  FileSpreadsheet,
  FileText,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { showErrorToast } from '@/lib/utils/errorToast';
import { useAuth } from '@/lib/hooks/useAuth';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import {
  unitPoolService,
  UnitType,
  UnitPoolStatus,
  AllPoolsResponse,
  ConsumptionLogEntry,
  UsageSummaryResponse,
  getUnitTypeName,
  getUsageStatus,
  getStatusColor,
} from '@/lib/services/unitPoolService';
import { Skeleton } from '@/components/ui/skeleton';
import { DateField } from '@/components/ui/date-field';
import FilterSelect from '@/components/ui/filter-select';

interface TenantUnitPoolProps {
  compact?: boolean;
  showHistory?: boolean;
}

// Icons for each unit type
// LucideIcon, not React.ElementType: in React 19's types ElementType is a union wide
// enough that resolving props against it collapses to `never`, so <Icon className=...>
// failed to compile. Every value here is a lucide icon.
const UNIT_TYPE_ICONS: Record<UnitType, LucideIcon> = {
  RS: ClipboardList,
  AS: ClipboardCheck,
  AIU: Video,
};

// Colors for each unit type
const UNIT_TYPE_COLORS: Record<UnitType, { bg: string; text: string; bar: string }> = {
  RS: { bg: 'bg-blue-50', text: 'text-blue-700', bar: 'bg-blue-500' },
  AS: { bg: 'bg-purple-50', text: 'text-purple-700', bar: 'bg-purple-500' },
  AIU: { bg: 'bg-green-50', text: 'text-green-700', bar: 'bg-green-500' },
};

// Feature-Level Unit Deduction Recording: Generate entity link based on type
function getEntityLink(entityType: string | null, entityId: string | null, jobDescriptionId: string | null): string | null {
  if (!entityId) return null;

  switch (entityType) {
    case 'resume_scoring':
    case 'resume_score':
      // Link to the scored resume within the JD context
      if (jobDescriptionId) {
        return `/jobs/${jobDescriptionId}/scored-resumes?scoreId=${entityId}`;
      }
      return `/resumes/${entityId}`;
    case 'resume':
      return `/resumes/${entityId}`;
    case 'assessment_attempt':
    case 'assessment':
      return `/assessments/results/${entityId}`;
    case 'interview_session':
    case 'interview':
      return `/interviews/${entityId}`;
    default:
      return null;
  }
}

// Export format type
type ExportFormat = 'csv' | 'excel';

// Export type
type ExportType = 'consumption' | 'summary';

export default function TenantUnitPool({ compact = false, showHistory = true }: TenantUnitPoolProps) {
  // Role-based access control
  const { user, isTenantAdmin, isBillingManager, isRecruiter } = useAuth();
  const canExport = isTenantAdmin || isRecruiter;

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pools, setPools] = useState<AllPoolsResponse | null>(null);
  const [summary, setSummary] = useState<UsageSummaryResponse | null>(null);
  const [history, setHistory] = useState<ConsumptionLogEntry[]>([]);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [selectedType, setSelectedType] = useState<UnitType | null>(null);

  // Export modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportType, setExportType] = useState<ExportType>('consumption');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('csv');
  const [exportUnitType, setExportUnitType] = useState<UnitType | ''>('');
  const [exportStatus, setExportStatus] = useState<string>('');
  const [exportStartDate, setExportStartDate] = useState<string>('');
  const [exportEndDate, setExportEndDate] = useState<string>('');
  const [exportDays, setExportDays] = useState<number>(30);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Role-based data fetching
      if (isTenantAdmin || isRecruiter) {
        // Tenant Admin & Recruiter: Full access to pool status and summary
        const [poolsData, summaryData] = await Promise.all([
          unitPoolService.getPoolStatus(),
          unitPoolService.getUsageSummary(30),
        ]);
        setPools(poolsData);
        setSummary(summaryData);
      } else if (isBillingManager) {
        // Billing Manager: Only billing summary (filtered by API)
        const [poolsData, summaryData] = await Promise.all([
          unitPoolService.getPoolStatus(),
          unitPoolService.getUsageSummary(30),
        ]);
        setPools(poolsData);
        setSummary(summaryData);
      }
    } catch (error: any) {
      // Handle permission errors gracefully
      if (error?.response?.status === 403) {
        // Permission denied - expected for users without usage access
        console.log('Role-based access restriction applied');
      } else {
        showErrorToast(error, "Couldn't load unit pool data", { id: 'tenant-unit-pool-load', retry: loadData });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadData();
      toast.success('Unit pool data refreshed');
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadHistory = async (unitType?: UnitType) => {
    try {
      const data = await unitPoolService.getConsumptionHistory({
        unit_type: unitType,
        limit: 20,
      });
      setHistory(data.items);
      setShowHistoryPanel(true);
      setSelectedType(unitType || null);
    } catch (error: any) {
      showErrorToast(error, "Couldn't load consumption history", { id: 'tenant-unit-pool-history', retry: () => loadHistory(unitType) });
    }
  };

  // Export handler
  const handleExport = async () => {
    setIsExporting(true);
    try {
      let blob: Blob;
      let filename: string;
      const timestamp = new Date().toISOString().split('T')[0];

      if (exportType === 'consumption') {
        blob = await unitPoolService.exportConsumptionHistory({
          format: exportFormat,
          unit_type: exportUnitType || undefined,
          status: exportStatus || undefined,
          start_date: exportStartDate || undefined,
          end_date: exportEndDate || undefined,
        });
        filename = `consumption-history-${timestamp}.${exportFormat === 'excel' ? 'xlsx' : 'csv'}`;
      } else {
        blob = await unitPoolService.exportUsageSummary({
          format: exportFormat,
          days: exportDays,
        });
        filename = `usage-summary-${exportDays}days-${timestamp}.${exportFormat === 'excel' ? 'xlsx' : 'csv'}`;
      }

      // Download the file
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(`Export completed: ${filename}`);
      setShowExportModal(false);
    } catch (error: any) {
      showErrorToast(error, "Couldn't export usage data", { retry: handleExport });
    } finally {
      setIsExporting(false);
    }
  };

  // Reset export modal state
  const resetExportModal = () => {
    setExportType('consumption');
    setExportFormat('csv');
    setExportUnitType('');
    setExportStatus('');
    setExportStartDate('');
    setExportEndDate('');
    setExportDays(30);
  };

  // Calculate overall usage status
  const overallStatus = useMemo(() => {
    if (!pools) return 'normal';
    const poolArray = Object.values(pools.pools);
    if (poolArray.some(p => p.available_units === 0)) return 'critical';
    if (poolArray.some(p => p.usage_percentage >= 80)) return 'warning';
    return 'normal';
  }, [pools]);

  if (isLoading) {
    return (
      <div className="tf-card-soft">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-64" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-20 rounded-lg" />
            <Skeleton className="w-8 h-8 rounded-lg" />
          </div>
        </div>

        {/* Unit cards grid — 3 columns, each with icon+label, value, progress bar, footer */}
        <div className="tf-grid-3 p-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4 rounded-lg border border-gray-200 bg-gray-50">
              <div className="flex items-center gap-2">
                <Skeleton className="w-9 h-9 rounded-lg" />
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-8" />
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-baseline justify-between">
                  <Skeleton className="h-7 w-16" />
                  <Skeleton className="h-4 w-20" />
                </div>
                {/* progress bar */}
                <Skeleton className="mt-2 h-2 w-full rounded-full" />
                <div className="mt-3 flex items-center justify-between">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="mt-4 h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }


  if (!pools) {
    return (
      <div className={`${compact ? 'p-4' : 'p-6'} bg-white rounded-lg border border-gray-200`}>
        <p className="text-gray-500 text-center py-4">Unable to load unit pool data</p>
      </div>
    );
  }

  const unitTypes: UnitType[] = ['RS', 'AS', 'AIU'];

  if (compact) {
    return (
      <div className="tf-panel p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900">Unit Pool</h3>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="space-y-2">
          {unitTypes.map(type => {
            const pool = pools.pools[type];
            const colors = UNIT_TYPE_COLORS[type];
            const status = getUsageStatus(pool);
            const Icon = UNIT_TYPE_ICONS[type];

            return (
              <div key={type} className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${colors.text}`} />
                <div className="flex-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">{getUnitTypeName(type)}</span>
                    <span className={`font-medium ${
                      status === 'critical' ? 'text-red-600' :
                      status === 'warning' ? 'text-amber-600' : 'text-gray-900'
                    }`}>
                      {pool.available_units}
                    </span>
                  </div>
                  <div className="h-1.5 bg-gray-200 rounded-full mt-1 overflow-hidden">
                    <div
                      className={`h-full transition-all ${
                        status === 'critical' ? 'bg-red-500' :
                        status === 'warning' ? 'bg-amber-500' : colors.bar
                      }`}
                      style={{ width: `${Math.min(pool.usage_percentage, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="tf-card-soft">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="tf-section-title">
            {isBillingManager ? 'Billing Summary' : 'Unit Pool'}
          </h2>
          <p className="tf-body-muted mt-0.5">
            {isBillingManager
              ? 'Aggregated billing and usage overview'
              : 'Track and manage your organization\'s consumption units'
            }
          </p>
          {isBillingManager && (
            <div className="mt-2 inline-flex items-center gap-1.5 px-2 py-1 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
              <Info className="w-3 h-3" />
              <span>Billing role: Some operational details are restricted</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {overallStatus !== 'normal' && (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              overallStatus === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {overallStatus === 'critical' ? 'Low Units' : 'Running Low'}
            </span>
          )}
          {/* Export is for Tenant Admin & Recruiter — others see it greyed
              with a hover tooltip (never hidden). */}
          <button
            onClick={() => {
              if (!canExport) return;
              resetExportModal();
              setShowExportModal(true);
            }}
            aria-disabled={!canExport}
            title={!canExport ? 'You do not have permission to export usage data' : undefined}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-white border border-gray-300 rounded-lg ${
              canExport ? 'text-gray-700 hover:bg-gray-50' : 'text-gray-400 cursor-not-allowed opacity-60'
            }`}
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Unit Cards */}
      <div className="tf-grid-3 p-6">
        {unitTypes.map(type => {
          const pool = pools.pools[type];
          const colors = UNIT_TYPE_COLORS[type];
          const status = getUsageStatus(pool);
          const Icon = UNIT_TYPE_ICONS[type];
          const summaryData = summary?.by_type[type];

          return (
            <div
              key={type}
              className={`p-4 rounded-lg border ${
                status === 'critical' ? 'border-red-200 bg-red-50' :
                status === 'warning' ? 'border-amber-200 bg-amber-50' :
                `border-gray-200 ${colors.bg}`
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${colors.bg}`}>
                    <Icon className={`w-5 h-5 ${colors.text}`} />
                  </div>
                  <div>
                    <h3 className="font-medium text-gray-900">{getUnitTypeName(type)}</h3>
                    <p className="tf-meta">{type}</p>
                  </div>
                </div>
                {status === 'critical' && (
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                )}
              </div>

              <div className="mt-4">
                <div className="flex items-baseline justify-between">
                  <span className={`text-2xl font-bold ${
                    status === 'critical' ? 'text-red-600' :
                    status === 'warning' ? 'text-amber-600' : 'text-gray-900'
                  }`}>
                    {isBillingManager && typeof pool.available_units === 'string' && pool.available_units.includes('RESTRICTED')
                      ? '•••'
                      : pool.available_units.toLocaleString()
                    }
                  </span>
                  <span className="tf-body-muted">
                    / {pool.total_allocated.toLocaleString()} allocated
                  </span>
                </div>
                {isBillingManager && typeof pool.available_units === 'string' && pool.available_units.includes('RESTRICTED') && (
                  <p className="text-xs text-amber-600 mt-1">Available units hidden for billing role</p>
                )}

                <div className="mt-2 h-2 bg-white rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      status === 'critical' ? 'bg-red-500' :
                      status === 'warning' ? 'bg-amber-500' : colors.bar
                    }`}
                    style={{ width: `${Math.min(pool.usage_percentage, 100)}%` }}
                  />
                </div>

                <div className="mt-3 flex items-center justify-between tf-meta">
                  <span>{pool.total_consumed.toLocaleString()} used</span>
                  <span>{pool.usage_percentage.toFixed(1)}% consumed</span>
                </div>

                {summaryData && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="flex items-center gap-1 tf-meta">
                      <TrendingUp className="w-3 h-3" />
                      <span>Last 30 days: {summaryData.total_consumed || 0} used</span>
                    </div>
                  </div>
                )}

                {/* Last consumption hidden for Billing Manager */}
                {!isBillingManager && pool.last_consumption_at && (
                  <div className="mt-2 flex items-center gap-1 tf-hint">
                    <Clock className="w-3 h-3" />
                    <span>Last used: {formatISTDate(pool.last_consumption_at)}</span>
                  </div>
                )}
              </div>

              {/* View History button hidden for Billing Manager */}
              {showHistory && !isBillingManager && (
                <button
                  onClick={() => loadHistory(type)}
                  className={`mt-4 w-full py-2 text-sm font-medium rounded-lg transition-colors ${colors.text} ${colors.bg} hover:opacity-80`}
                >
                  View History
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Warning Banner */}
      {overallStatus === 'critical' && (
        <div className="mx-6 mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-medium text-red-800">Unit Pool Exhausted</h4>
              <p className="text-sm text-red-700 mt-1">
                One or more unit pools are depleted. Contact your administrator to add more units or upgrade your plan.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Billing Cycle Info */}
      {pools.pools.RS.billing_cycle_end && (
        <div className="px-6 pb-6">
          <div className="p-4 bg-gray-50 rounded-lg flex items-center gap-3">
            <Calendar className="w-5 h-5 text-gray-400" />
            <div className="flex-1">
              <p className="tf-body-secondary">
                Billing Cycle: {pools.pools.RS.billing_cycle_start
                  ? formatISTDate(pools.pools.RS.billing_cycle_start)
                  : 'N/A'} - {formatISTDate(pools.pools.RS.billing_cycle_end)}
              </p>
              <p className="tf-meta mt-0.5">
                Units will reset at the start of the next billing cycle
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Consumption History Panel */}
      {showHistoryPanel && (
        <div className="border-t border-gray-200">
          <div className="px-6 py-4 flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5 text-gray-500" />
              <h3 className="font-medium text-gray-900">
                Consumption History
                {selectedType && <span className="text-gray-500 font-normal"> - {getUnitTypeName(selectedType)}</span>}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {selectedType && (
                <button
                  onClick={() => loadHistory()}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Show All
                </button>
              )}
              <button
                onClick={() => setShowHistoryPanel(false)}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Close
              </button>
            </div>
          </div>
          <div className="px-6 pb-6 max-h-96 overflow-y-auto">
            {history.length === 0 ? (
              <p className="text-center py-8 text-gray-500">No consumption history found</p>
            ) : (
              <div className="space-y-3">
                {history.map(entry => {
                  const colors = UNIT_TYPE_COLORS[entry.unit_type];
                  const Icon = UNIT_TYPE_ICONS[entry.unit_type];
                  const isSuccess = entry.status === 'SUCCESS';

                  // Failed & Abandoned Action Logging: Status-based styling
                  const isAbandoned = entry.status === 'ABANDONED';
                  const isInterrupted = entry.status === 'INTERRUPTED';
                  const isFailed = !isSuccess && !isAbandoned && !isInterrupted;

                  // Determine border/background color based on status
                  const getStatusStyle = () => {
                    if (isSuccess) return 'border-gray-200';
                    if (isAbandoned) return 'border-yellow-200 bg-yellow-50';
                    if (isInterrupted) return 'border-orange-200 bg-orange-50';
                    return 'border-red-200 bg-red-50';
                  };

                  // Determine status badge color
                  const getStatusBadgeVariant = (): 'success' | 'warning' | 'destructive' => {
                    if (isSuccess) return 'success';
                    if (isAbandoned) return 'warning';
                    if (isInterrupted) return 'warning';
                    return 'destructive';
                  };

                  return (
                    <div
                      key={entry.id}
                      className={`p-3 rounded-lg border ${getStatusStyle()}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-1.5 rounded ${colors.bg}`}>
                            <Icon className={`w-4 h-4 ${colors.text}`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">
                                {entry.units_consumed} {getUnitTypeName(entry.unit_type)}
                              </span>
                              <Badge variant={getStatusBadgeVariant()} className="px-1.5">
                                {entry.status}
                              </Badge>
                              {/* Resume Scoring Usage Logging: Display overall_score for RS entries */}
                              {entry.unit_type === 'RS' && entry.overall_score != null && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                                  Score: {entry.overall_score}%
                                </span>
                              )}
                            </div>
                            {/* Feature-Level Unit Deduction Recording: Clickable entity link */}
                            {(() => {
                              const entityLink = getEntityLink(entry.entity_type, entry.entity_id, entry.job_description_id);
                              const entityText = entry.entity_type && entry.entity_name
                                ? `${entry.entity_type}: ${entry.entity_name}`
                                : entry.entity_type || 'General usage';

                              if (entityLink) {
                                return (
                                  <Link
                                    href={entityLink}
                                    className="text-sm text-blue-600 hover:text-blue-800 hover:underline mt-0.5 flex items-center gap-1"
                                  >
                                    {entityText}
                                    <ExternalLink className="w-3 h-3" />
                                  </Link>
                                );
                              }
                              return (
                                <p className="tf-body-muted mt-0.5">
                                  {entityText}
                                </p>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-1 tf-hint">
                            <User className="w-3 h-3" />
                            {entry.user_name || entry.user_email || 'Unknown'}
                          </div>
                          <p className="tf-hint mt-0.5">
                            {formatIST(entry.created_at)}
                          </p>
                        </div>
                      </div>
                      {/* Feature-Level Unit Deduction Recording: Display balance before/after */}
                      {(entry.balance_before != null || entry.balance_after != null) && (
                        <div className="mt-2 flex items-center gap-4 tf-meta border-t border-gray-100 pt-2">
                          <span className="flex items-center gap-1">
                            <span className="font-medium">Balance:</span>
                            {entry.balance_before != null && (
                              <span>{entry.balance_before.toLocaleString()}</span>
                            )}
                            {entry.balance_before != null && entry.balance_after != null && (
                              <span className="text-gray-400 mx-1">→</span>
                            )}
                            {entry.balance_after != null && (
                              <span className={entry.balance_after < (entry.balance_before || 0) ? 'text-red-600' : 'text-green-600'}>
                                {entry.balance_after.toLocaleString()}
                              </span>
                            )}
                          </span>
                        </div>
                      )}
                      {entry.failure_reason && (
                        <p className="mt-2 text-xs text-red-600">
                          {entry.failure_reason}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Export Modal */}
      <AppModal
        open={showExportModal}
        onCancel={() => setShowExportModal(false)}
        cancelDisabled={isExporting}
        size="md"
        zIndexClass="z-50"
        icon={<Download />}
        title="Export Usage Data"
        actions={[
          {
            label: isExporting ? 'Exporting...' : 'Export',
            onClick: handleExport,
            disabled: isExporting,
            loading: isExporting,
            icon: <Download className="w-4 h-4" />,
          },
        ]}
      >
                <div className="space-y-4">
                  {/* Export Type Selection */}
                  <div>
                    <label className="block tf-label mb-2">Export Type</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setExportType('consumption')}
                        className={`p-3 rounded-lg border-2 text-left transition-colors ${
                          exportType === 'consumption'
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <Clock className="w-5 h-5 text-blue-600" />
                          <span className="font-medium">Consumption History</span>
                        </div>
                        <p className="tf-meta mt-1">Detailed usage logs</p>
                      </button>
                      <button
                        onClick={() => setExportType('summary')}
                        className={`p-3 rounded-lg border-2 text-left transition-colors ${
                          exportType === 'summary'
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-purple-600" />
                          <span className="font-medium">Usage Summary</span>
                        </div>
                        <p className="tf-meta mt-1">Aggregated statistics</p>
                      </button>
                    </div>
                  </div>

                  {/* Export Format Selection */}
                  <div>
                    <label className="block tf-label mb-2">Format</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setExportFormat('csv')}
                        className={`p-3 rounded-lg border-2 flex items-center gap-2 transition-colors ${
                          exportFormat === 'csv'
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <FileText className="w-5 h-5 text-green-600" />
                        <span className="font-medium">CSV</span>
                      </button>
                      <button
                        onClick={() => setExportFormat('excel')}
                        className={`p-3 rounded-lg border-2 flex items-center gap-2 transition-colors ${
                          exportFormat === 'excel'
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                        <span className="font-medium">Excel</span>
                      </button>
                    </div>
                  </div>

                  {/* Filters for Consumption History */}
                  {exportType === 'consumption' && (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block tf-label mb-1">Unit Type</label>
                          <FilterSelect
                            value={exportUnitType}
                            onChange={(v) => setExportUnitType(v as UnitType | '')}
                            ariaLabel="Unit Type"
                            options={[
                              { value: '', label: 'All Types' },
                              { value: 'RS', label: 'Resume Scoring' },
                              { value: 'AS', label: 'Assessment' },
                              { value: 'AIU', label: 'AI Interview' },
                            ]}
                            className="w-full sm:w-full px-3 sm:px-3 py-2 sm:py-2 rounded-lg sm:rounded-lg border-gray-300"
                          />
                        </div>
                        <div>
                          <label className="block tf-label mb-1">Status</label>
                          <FilterSelect
                            value={exportStatus}
                            onChange={(v) => setExportStatus(v)}
                            ariaLabel="Status"
                            options={[
                              { value: '', label: 'All Statuses' },
                              { value: 'SUCCESS', label: 'Success' },
                              { value: 'FAILED', label: 'Failed' },
                              { value: 'INSUFFICIENT_UNITS', label: 'Insufficient Units' },
                              { value: 'ABANDONED', label: 'Abandoned' },
                              { value: 'INTERRUPTED', label: 'Interrupted' },
                            ]}
                            className="w-full sm:w-full px-3 sm:px-3 py-2 sm:py-2 rounded-lg sm:rounded-lg border-gray-300"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block tf-label mb-1">Start Date</label>
                          <DateField
                            value={exportStartDate}
                            onChange={setExportStartDate}
                          />
                        </div>
                        <div>
                          <label className="block tf-label mb-1">End Date</label>
                          <DateField
                            value={exportEndDate}
                            onChange={setExportEndDate}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {/* Days selection for Summary */}
                  {exportType === 'summary' && (
                    <div>
                      <label className="block tf-label mb-1">Period</label>
                      <FilterSelect
                        value={String(exportDays)}
                        onChange={(v) => setExportDays(Number(v))}
                        ariaLabel="Period"
                        options={[
                          { value: '7', label: 'Last 7 days' },
                          { value: '30', label: 'Last 30 days' },
                          { value: '60', label: 'Last 60 days' },
                          { value: '90', label: 'Last 90 days' },
                          { value: '180', label: 'Last 6 months' },
                          { value: '365', label: 'Last year' },
                        ]}
                        className="w-full sm:w-full px-3 sm:px-3 py-2 sm:py-2 rounded-lg sm:rounded-lg border-gray-300"
                      />
                    </div>
                  )}
                </div>
      </AppModal>
    </div>
  );
}
