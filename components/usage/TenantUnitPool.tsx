'use client';

/**
 * TenantUnitPool Component - UN01
 * Displays tenant's shared unit pool status for Resume Scoring, Assessment, and AI Interview
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Loader2,
  Target,
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
} from 'lucide-react';
import { toast } from 'sonner';
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

interface TenantUnitPoolProps {
  compact?: boolean;
  showHistory?: boolean;
}

// Icons for each unit type
const UNIT_TYPE_ICONS: Record<UnitType, React.ElementType> = {
  RS: Target,
  AS: ClipboardCheck,
  AIU: Video,
};

// Colors for each unit type
const UNIT_TYPE_COLORS: Record<UnitType, { bg: string; text: string; bar: string }> = {
  RS: { bg: 'bg-blue-50', text: 'text-blue-700', bar: 'bg-blue-500' },
  AS: { bg: 'bg-purple-50', text: 'text-purple-700', bar: 'bg-purple-500' },
  AIU: { bg: 'bg-green-50', text: 'text-green-700', bar: 'bg-green-500' },
};

export default function TenantUnitPool({ compact = false, showHistory = true }: TenantUnitPoolProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pools, setPools] = useState<AllPoolsResponse | null>(null);
  const [summary, setSummary] = useState<UsageSummaryResponse | null>(null);
  const [history, setHistory] = useState<ConsumptionLogEntry[]>([]);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [selectedType, setSelectedType] = useState<UnitType | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [poolsData, summaryData] = await Promise.all([
        unitPoolService.getPoolStatus(),
        unitPoolService.getUsageSummary(30),
      ]);
      setPools(poolsData);
      setSummary(summaryData);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load unit pool data');
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
      toast.error(error.message || 'Failed to load consumption history');
    }
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
      <div className={`${compact ? 'p-4' : 'p-6'} bg-white rounded-lg border border-gray-200`}>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500">Loading unit pool...</span>
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
      <div className="p-4 bg-white rounded-lg border border-gray-200">
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
    <div className="bg-white rounded-xl shadow-sm border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Unit Pool</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Track and manage your organization's consumption units
          </p>
        </div>
        <div className="flex items-center gap-2">
          {overallStatus !== 'normal' && (
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              overallStatus === 'critical' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
            }`}>
              {overallStatus === 'critical' ? 'Low Units' : 'Running Low'}
            </span>
          )}
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
      <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
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
                    <p className="text-xs text-gray-500">{type}</p>
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
                    {pool.available_units.toLocaleString()}
                  </span>
                  <span className="text-sm text-gray-500">
                    / {pool.total_allocated.toLocaleString()} allocated
                  </span>
                </div>

                <div className="mt-2 h-2 bg-white rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      status === 'critical' ? 'bg-red-500' :
                      status === 'warning' ? 'bg-amber-500' : colors.bar
                    }`}
                    style={{ width: `${Math.min(pool.usage_percentage, 100)}%` }}
                  />
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                  <span>{pool.total_consumed.toLocaleString()} used</span>
                  <span>{pool.usage_percentage.toFixed(1)}% consumed</span>
                </div>

                {summaryData && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <TrendingUp className="w-3 h-3" />
                      <span>Last 30 days: {summaryData.total_consumed || 0} used</span>
                    </div>
                  </div>
                )}

                {pool.last_consumption_at && (
                  <div className="mt-2 flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="w-3 h-3" />
                    <span>Last used: {new Date(pool.last_consumption_at).toLocaleDateString()}</span>
                  </div>
                )}
              </div>

              {showHistory && (
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
              <p className="text-sm text-gray-600">
                Billing Cycle: {pools.pools.RS.billing_cycle_start
                  ? new Date(pools.pools.RS.billing_cycle_start).toLocaleDateString()
                  : 'N/A'} - {new Date(pools.pools.RS.billing_cycle_end).toLocaleDateString()}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
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

                  return (
                    <div
                      key={entry.id}
                      className={`p-3 rounded-lg border ${
                        isSuccess ? 'border-gray-200' : 'border-red-200 bg-red-50'
                      }`}
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
                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                isSuccess ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                              }`}>
                                {entry.status}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500 mt-0.5">
                              {entry.entity_type && entry.entity_name
                                ? `${entry.entity_type}: ${entry.entity_name}`
                                : entry.entity_type || 'General usage'}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-1 text-xs text-gray-400">
                            <User className="w-3 h-3" />
                            {entry.user_name || entry.user_email || 'Unknown'}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {new Date(entry.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
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
    </div>
  );
}
