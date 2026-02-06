'use client';

/**
 * MyConsumptionHistory Component
 * Standard User view: Shows only own consumption history
 */

import React, { useState, useEffect } from 'react';
import {
  Loader2,
  Target,
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
import { useAuth } from '@/lib/hooks/useAuth';
import {
  unitPoolService,
  UnitType,
  ConsumptionLogEntry,
  getUnitTypeName,
} from '@/lib/services/unitPoolService';

const UNIT_TYPE_ICONS: Record<UnitType, React.ElementType> = {
  RS: Target,
  AS: ClipboardCheck,
  AIU: Video,
};

const UNIT_TYPE_COLORS: Record<UnitType, { bg: string; text: string }> = {
  RS: { bg: 'bg-blue-50', text: 'text-blue-700' },
  AS: { bg: 'bg-purple-50', text: 'text-purple-700' },
  AIU: { bg: 'bg-green-50', text: 'text-green-700' },
};

export default function MyConsumptionHistory() {
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [history, setHistory] = useState<ConsumptionLogEntry[]>([]);
  const [filteredHistory, setFilteredHistory] = useState<ConsumptionLogEntry[]>([]);

  // Filters
  const [selectedType, setSelectedType] = useState<UnitType | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [dateRange, setDateRange] = useState<number>(30); // days

  useEffect(() => {
    loadHistory();
  }, [dateRange]);

  useEffect(() => {
    applyFilters();
  }, [history, selectedType, selectedStatus]);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - dateRange);

      const data = await unitPoolService.getConsumptionHistory({
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
        limit: 100,
      });
      setHistory(data.items);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load consumption history');
    } finally {
      setIsLoading(false);
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

  const handleExport = async () => {
    try {
      const blob = await unitPoolService.exportConsumptionHistory({
        format: 'csv',
        unit_type: selectedType !== 'all' ? selectedType : undefined,
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
      });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `my-consumption-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Export completed');
    } catch (error: any) {
      toast.error(error.message || 'Failed to export data');
    }
  };

  // Calculate summary stats
  const summary = {
    total: filteredHistory.reduce((sum, item) => sum + (item.units_consumed || 0), 0),
    byType: {
      RS: filteredHistory.filter(item => item.unit_type === 'RS').reduce((sum, item) => sum + (item.units_consumed || 0), 0),
      AS: filteredHistory.filter(item => item.unit_type === 'AS').reduce((sum, item) => sum + (item.units_consumed || 0), 0),
      AIU: filteredHistory.filter(item => item.unit_type === 'AIU').reduce((sum, item) => sum + (item.units_consumed || 0), 0),
    },
    successCount: filteredHistory.filter(item => item.status === 'SUCCESS').length,
    failedCount: filteredHistory.filter(item => item.status === 'FAILED').length,
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-500">Loading your consumption history...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <User className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">My Consumption History</h2>
              <p className="text-sm text-gray-500">View your personal unit usage across all features</p>
            </div>
          </div>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>

        {/* Summary Stats */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-600">Total Consumed</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{summary.total.toFixed(1)}</p>
            <p className="text-xs text-gray-500 mt-1">Last {dateRange} days</p>
          </div>
          {(['RS', 'AS', 'AIU'] as UnitType[]).map(type => {
            const Icon = UNIT_TYPE_ICONS[type];
            const colors = UNIT_TYPE_COLORS[type];
            return (
              <div key={type} className={`p-4 ${colors.bg} rounded-lg`}>
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${colors.text}`} />
                  <p className={`text-sm font-medium ${colors.text}`}>{getUnitTypeName(type)}</p>
                </div>
                <p className={`text-2xl font-bold ${colors.text} mt-1`}>{summary.byType[type].toFixed(1)}</p>
                <p className="text-xs text-gray-600 mt-1">{type} units</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Filters:</span>
          </div>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as UnitType | 'all')}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Types</option>
            <option value="RS">Resume Scoring</option>
            <option value="AS">Assessment</option>
            <option value="AIU">AI Interview</option>
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">All Status</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILED">Failed</option>
          </select>

          <select
            value={dateRange}
            onChange={(e) => setDateRange(Number(e.target.value))}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={60}>Last 60 days</option>
            <option value={90}>Last 90 days</option>
          </select>

          <div className="ml-auto text-sm text-gray-600">
            {filteredHistory.length} records
          </div>
        </div>
      </div>

      {/* Consumption History Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date & Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Units</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                    No consumption history found for the selected filters.
                  </td>
                </tr>
              ) : (
                filteredHistory.map((item) => {
                  const Icon = UNIT_TYPE_ICONS[item.unit_type];
                  const colors = UNIT_TYPE_COLORS[item.unit_type];

                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-900">
                        <div className="flex items-center gap-2">
                          <Clock className="w-4 h-4 text-gray-400" />
                          {new Date(item.created_at).toLocaleString()}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className={`inline-flex items-center gap-1.5 px-2 py-1 ${colors.bg} rounded-md`}>
                          <Icon className={`w-3.5 h-3.5 ${colors.text}`} />
                          <span className={`text-xs font-medium ${colors.text}`}>
                            {getUnitTypeName(item.unit_type)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {item.entity_type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-gray-900">
                          {item.units_consumed?.toFixed(1) || '0.0'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
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

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <User className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-900">Standard User Access</p>
            <p className="text-sm text-blue-700 mt-1">
              You can view your own consumption history and team summaries. For tenant-wide unit pool details and billing information, contact your Tenant Administrator.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
