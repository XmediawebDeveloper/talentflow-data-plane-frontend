'use client';

import { TrendingUp, TrendingDown, Zap, Target, Video, ClipboardCheck, Calendar, Clock, DollarSign, ChevronDown, Download, Filter, Search, X, BarChart3, PieChart, AlertCircle, CheckCircle2, Loader2, AlertTriangle, ArrowUpRight, Plus, Send } from 'lucide-react';
import { useState, useEffect } from 'react';
import QuotaDisplay from './QuotaDisplay';

export interface UsageRecord {
  id: string;
  module: 'Resume Upload' | 'Resume Scoring' | 'AI Interview' | 'Assessment';
  operation: string;
  unitsConsumed: number;
  timestamp: Date;
  details: string;
  status: 'completed' | 'failed';
  jobTitle?: string;
  candidateCount?: number;
}

interface QuotaInfo {
  quota_type: string;
  name: string;
  limit: number;
  used: number;
  remaining: number;
  percentage_used: number;
  is_low: boolean;
  is_exhausted: boolean;
}

interface RecordUsageRequest {
  quota_type: 'RU' | 'RS' | 'AS' | 'AIU' | 'storage_gb';
  amount?: number;
  operation_type?: string;
  resource_id?: string;
  metadata?: Record<string, any>;
}

interface UsageDashboardProps {
  onBack?: () => void;
}

export default function UsageDashboard({ onBack }: UsageDashboardProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month' | 'all'>('month');
  const [selectedModule, setSelectedModule] = useState<'all' | 'Resume Upload' | 'Resume Scoring' | 'AI Interview' | 'Assessment'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [loading, setLoading] = useState(true);
  const [usageData, setUsageData] = useState<any>(null);
  const [quotaData, setQuotaData] = useState<any>(null);
  const [quotaSummary, setQuotaSummary] = useState<any>(null);
  const [usageHistory, setUsageHistory] = useState<any[]>([]);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [recordingUsage, setRecordingUsage] = useState(false);
  const [recordSuccess, setRecordSuccess] = useState<string | null>(null);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [recordForm, setRecordForm] = useState<RecordUsageRequest>({
    quota_type: 'RU',
    amount: 1,
    operation_type: '',
    resource_id: '',
  });

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://talentflowdata.api.mo.vc/api/v1';
  const USAGE_API_BASE = process.env.NEXT_PUBLIC_USAGE_API_URL || 'https://talentflowapi.mo.vc/api/v1';

  useEffect(() => {
    fetchUsageData();
  }, []);

  // Get API Key for usage tracking
  const getApiKey = (): string => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('tenantApiKey') || localStorage.getItem('apiKey') || '';
  };

  const getAuthHeaders = () => {
    const token = localStorage.getItem('accessToken');
    const apiKey = getApiKey();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      headers['X-API-Key'] = apiKey;
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  // Record usage via POST /api/v1/external/usage/record
  const recordUsage = async (request: RecordUsageRequest): Promise<boolean> => {
    const apiKey = getApiKey();
    if (!apiKey) {
      setRecordError('API Key not found. Please configure your API key in settings.');
      return false;
    }

    try {
      const response = await fetch(`${USAGE_API_BASE}/external/usage/record`, {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      const data = await response.json();

      if (response.ok) {
        // Add to local history for immediate feedback
        const newRecord = {
          id: `local-${Date.now()}`,
          quota_type: request.quota_type,
          amount: request.amount || 1,
          operation_type: request.operation_type || quotaTypeToModule[request.quota_type],
          resource_id: request.resource_id,
          created_at: new Date().toISOString(),
        };
        setUsageHistory(prev => [newRecord, ...prev]);
        return true;
      } else {
        setRecordError(data.detail || data.message || 'Failed to record usage');
        return false;
      }
    } catch (error) {
      console.error('Error recording usage:', error);
      setRecordError('Network error. Please check your connection.');
      return false;
    }
  };

  const handleRecordUsage = async () => {
    setRecordingUsage(true);
    setRecordError(null);
    setRecordSuccess(null);

    const success = await recordUsage(recordForm);

    if (success) {
      setRecordSuccess(`Successfully recorded ${recordForm.amount || 1} unit(s) of ${quotaTypeToModule[recordForm.quota_type]}`);
      setRecordForm({ quota_type: 'RU', amount: 1, operation_type: '', resource_id: '' });
      setTimeout(() => {
        setShowRecordModal(false);
        setRecordSuccess(null);
      }, 2000);
    }

    setRecordingUsage(false);
  };

  const fetchUsageData = async () => {
    setLoading(true);
    try {
      // Get tenant_id from /auth/me
      const token = localStorage.getItem('accessToken');
      if (!token) {
        console.warn('[UsageDashboard] No access token found');
        setLoading(false);
        return;
      }

      // First get tenant_id from auth/me
      let tenantId = localStorage.getItem('tenantApiKey');

      if (!tenantId) {
        const meResponse = await fetch(`${API_BASE}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (meResponse.ok) {
          const meData = await meResponse.json();
          tenantId = meData.tenant_id;
          if (tenantId) {
            localStorage.setItem('tenantApiKey', tenantId);
          }
        }
      }

      if (!tenantId) {
        console.warn('[UsageDashboard] Could not get tenant_id');
        setLoading(false);
        return;
      }

      console.log('[UsageDashboard] Fetching usage summary for tenant:', tenantId);

      // Call usage summary API: GET /api/v1/external/usage/summary?tenant_id=xxx
      const summaryResponse = await fetch(`${USAGE_API_BASE}/external/usage/summary?tenant_id=${tenantId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json();
        console.log('[UsageDashboard] Usage summary data:', summaryData);

        // Set the data from API response
        if (summaryData.data) {
          setUsageData(summaryData.data);
          setQuotaData(summaryData.data);
          setQuotaSummary(summaryData.data);

          // Extract usage history if available
          if (summaryData.data.history || summaryData.data.records) {
            setUsageHistory(summaryData.data.history || summaryData.data.records || []);
          }
        } else {
          // Direct response format
          setUsageData(summaryData);
          setQuotaData(summaryData);
          setQuotaSummary(summaryData);
        }
      } else {
        console.error('[UsageDashboard] Failed to fetch usage summary:', summaryResponse.status);
        // Set placeholder data on error
        setQuotaSummary({
          has_low_quotas: false,
          quotas: [
            { quota_type: 'RU', name: 'Resume Upload', limit: 1000, used: 0, remaining: 1000, percentage_used: 0, is_low: false, is_exhausted: false },
            { quota_type: 'RS', name: 'Resume Scoring', limit: 500, used: 0, remaining: 500, percentage_used: 0, is_low: false, is_exhausted: false },
            { quota_type: 'AS', name: 'Assessment', limit: 200, used: 0, remaining: 200, percentage_used: 0, is_low: false, is_exhausted: false },
            { quota_type: 'AIU', name: 'AI Interview', limit: 100, used: 0, remaining: 100, percentage_used: 0, is_low: false, is_exhausted: false },
          ],
        });
      }
    } catch (error) {
      console.error('[UsageDashboard] Error fetching usage data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Map quota_type to display names
  const quotaTypeToModule: Record<string, string> = {
    'RU': 'Resume Upload',
    'RS': 'Resume Scoring',
    'AS': 'Assessment',
    'AIU': 'AI Interview',
    'storage_gb': 'Storage',
  };

  // Calculate statistics - use API data
  const getQuotaValue = (type: string, field: 'used' | 'limit' | 'remaining') => {
    if (quotaData?.quotas) {
      const quota = quotaData.quotas.find((q: any) => q.quota_type === type);
      if (quota) return quota[field] || 0;
    }
    return 0;
  };

  const totalUnitsConsumed = usageData?.total_units || 0;
  const resumeUploadUnits = usageData?.breakdown?.resume_upload?.units || 0;
  const resumeScoringUnits = usageData?.breakdown?.resume_scoring?.units || 0;
  const aiInterviewUnits = usageData?.breakdown?.ai_interview?.units || 0;
  const assessmentUnits = usageData?.breakdown?.assessment?.units || 0;

  // Monthly quota - use API data (sum of all quotas)
  const monthlyQuota = quotaData?.quotas?.reduce((sum: number, q: any) => {
    // Don't count unlimited quotas (-1)
    return sum + (q.limit > 0 ? q.limit : 0);
  }, 0) || 0;
  const usagePercentage = monthlyQuota > 0 ? (totalUnitsConsumed / monthlyQuota) * 100 : 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="text-lg text-gray-600">Loading usage data...</span>
        </div>
      </div>
    );
  }

  const moduleToQuotaType: Record<string, string> = {
    'Resume Upload': 'RU',
    'Resume Scoring': 'RS',
    'Assessment': 'AS',
    'AI Interview': 'AIU',
  };

  // Transform API history to display format
  const transformedHistory = usageHistory.map((record: any) => ({
    id: record.id,
    module: quotaTypeToModule[record.quota_type] || record.quota_type,
    operation: record.operation_type || quotaTypeToModule[record.quota_type] || 'Usage',
    unitsConsumed: record.amount || 1,
    timestamp: new Date(record.created_at),
    details: record.resource_id ? `Resource: ${record.resource_id}` : 'Usage recorded',
    status: 'completed' as const,
  }));

  // Filter records - use real API data
  const filteredRecords = transformedHistory.filter((record: any) => {
    const matchesModule = selectedModule === 'all' || record.module === selectedModule;
    const matchesSearch = searchQuery === '' ||
      record.operation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      record.details.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesModule && matchesSearch;
  });

  const getModuleIcon = (module: string) => {
    switch (module) {
      case 'Resume Upload':
        return <Zap className="w-4 h-4" />;
      case 'Resume Scoring':
        return <Target className="w-4 h-4" />;
      case 'AI Interview':
        return <Video className="w-4 h-4" />;
      case 'Assessment':
        return <ClipboardCheck className="w-4 h-4" />;
      default:
        return <Zap className="w-4 h-4" />;
    }
  };

  const getModuleColor = (module: string) => {
    switch (module) {
      case 'Resume Upload':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Resume Scoring':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'AI Interview':
        return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'Assessment':
        return 'bg-green-100 text-green-700 border-green-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const handleUpgradeClick = () => {
    window.location.href = '/subscription/plans';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl text-gray-900">Usage & Quotas Dashboard</h1>
                <p className="text-sm text-gray-600 mt-0.5">
                  Track your quota consumption across Resume Uploads, Scoring, Assessments, and AI Interviews
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowRecordModal(true)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Record Usage
              </button>
              <button
                onClick={handleUpgradeClick}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-colors font-medium flex items-center gap-2"
              >
                <TrendingUp className="w-4 h-4" />
                Upgrade Plan
              </button>
              <button className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center gap-2">
                <Download className="w-4 h-4" />
                Export Report
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
        {/* Quota Summary Cards */}
        {quotaSummary && (
          <div className="mb-8">
            {/* Low Quota Warning */}
            {quotaSummary.has_low_quotas && (
              <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-xl p-4 mb-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                      <AlertTriangle className="w-5 h-5 text-yellow-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-yellow-900">Quota Running Low!</h3>
                      <p className="text-sm text-yellow-700">
                        {quotaSummary.upgrade_message || `You are running low on ${quotaSummary.low_quota_types?.join(', ')}.`}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleUpgradeClick}
                    className="px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-lg hover:bg-yellow-700 transition-colors flex items-center gap-2"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                    Upgrade Now
                  </button>
                </div>
              </div>
            )}

            {/* Quota Cards Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {quotaSummary.quotas?.map((quota: QuotaInfo) => {
                const colors: Record<string, { bg: string; text: string; border: string }> = {
                  'RU': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
                  'RS': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
                  'AS': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
                  'AIU': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
                };
                const c = colors[quota.quota_type] || colors['RU'];

                return (
                  <div
                    key={quota.quota_type}
                    className={`${c.bg} ${c.border} border-2 rounded-xl p-4 transition-all hover:shadow-md ${
                      quota.is_exhausted ? 'ring-2 ring-red-400' : quota.is_low ? 'ring-2 ring-yellow-400' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">{quota.name}</span>
                      {quota.is_exhausted && (
                        <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                          EXHAUSTED
                        </span>
                      )}
                      {quota.is_low && !quota.is_exhausted && (
                        <span className="text-xs font-bold text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-full">
                          LOW
                        </span>
                      )}
                    </div>
                    <div className={`text-3xl font-bold ${c.text}`}>
                      {quota.remaining}
                      <span className="text-sm font-normal text-gray-500">/{quota.limit}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mt-2">
                      <div
                        className={`h-full rounded-full transition-all ${
                          quota.is_exhausted ? 'bg-red-500' : quota.is_low ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(quota.percentage_used, 100)}%` }}
                      />
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {quota.used} used ({quota.percentage_used?.toFixed(1)}%)
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Monthly Quota Overview */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl shadow-xl p-8 mb-8 text-white">
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-xl mb-2">Monthly Usage Overview</h2>
              <p className="text-blue-100 text-sm">December 2024 • Resets in 23 days</p>
            </div>
            <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 border border-white/30">
              <div className="text-xs text-blue-100 mb-1">Monthly Quota</div>
              <div className="text-2xl font-bold">{monthlyQuota.toLocaleString()}</div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2 text-sm">
              <span>Units Consumed</span>
              <span className="font-bold">{totalUnitsConsumed.toLocaleString()} / {monthlyQuota.toLocaleString()} ({usagePercentage.toFixed(1)}%)</span>
            </div>
            <div className="w-full h-4 bg-white/20 rounded-full overflow-hidden backdrop-blur-sm">
              <div 
                className={`h-full rounded-full transition-all ${
                  usagePercentage >= 90 ? 'bg-red-400' : 
                  usagePercentage >= 75 ? 'bg-yellow-400' : 
                  'bg-green-400'
                }`}
                style={{ width: `${Math.min(usagePercentage, 100)}%` }}
              />
            </div>
          </div>

          {/* Usage Warning/Info */}
          {usagePercentage >= 90 && (
            <div className="bg-red-500/20 border border-red-300/30 rounded-lg px-4 py-3 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-200" />
              <div className="text-sm">
                <span className="font-medium">High Usage Alert:</span> You've used {usagePercentage.toFixed(1)}% of your monthly quota. Consider upgrading your plan.
              </div>
            </div>
          )}
          {usagePercentage < 90 && usagePercentage >= 75 && (
            <div className="bg-yellow-500/20 border border-yellow-300/30 rounded-lg px-4 py-3 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-200" />
              <div className="text-sm">
                <span className="font-medium">Moderate Usage:</span> You've used {usagePercentage.toFixed(1)}% of your monthly quota.
              </div>
            </div>
          )}
          {usagePercentage < 75 && (
            <div className="bg-green-500/20 border border-green-300/30 rounded-lg px-4 py-3 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-green-200" />
              <div className="text-sm">
                <span className="font-medium">Healthy Usage:</span> You're on track with {usagePercentage.toFixed(1)}% of your monthly quota used.
              </div>
            </div>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          {/* Total Units */}
          <div className="bg-white rounded-xl shadow-md border-2 border-gray-200 p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">
              {totalUnitsConsumed.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Total Units</div>
            <div className="text-xs text-gray-500 mt-1">Last 30 days</div>
          </div>

          {/* Resume Upload */}
          <div className="bg-white rounded-xl shadow-md border-2 border-blue-200 p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="text-2xl font-bold text-blue-700 mb-1">
              {resumeUploadUnits.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Resume Upload</div>
            <div className="text-xs text-gray-500 mt-1">
              {totalUnitsConsumed > 0 ? `${((resumeUploadUnits / totalUnitsConsumed) * 100).toFixed(0)}% of total` : 'No usage yet'}
            </div>
          </div>

          {/* Resume Scoring */}
          <div className="bg-white rounded-xl shadow-md border-2 border-purple-200 p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Target className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="text-2xl font-bold text-purple-700 mb-1">
              {resumeScoringUnits.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Resume Scoring</div>
            <div className="text-xs text-gray-500 mt-1">
              {totalUnitsConsumed > 0 ? `${((resumeScoringUnits / totalUnitsConsumed) * 100).toFixed(0)}% of total` : 'No usage yet'}
            </div>
          </div>

          {/* AI Interview */}
          <div className="bg-white rounded-xl shadow-md border-2 border-orange-200 p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center">
                <Video className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="text-2xl font-bold text-orange-700 mb-1">
              {aiInterviewUnits.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">AI Interview</div>
            <div className="text-xs text-gray-500 mt-1">
              {totalUnitsConsumed > 0 ? `${((aiInterviewUnits / totalUnitsConsumed) * 100).toFixed(0)}% of total` : 'No usage yet'}
            </div>
          </div>

          {/* Assessment */}
          <div className="bg-white rounded-xl shadow-md border-2 border-green-200 p-5 hover:shadow-lg transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
                <ClipboardCheck className="w-5 h-5 text-white" />
              </div>
            </div>
            <div className="text-2xl font-bold text-green-700 mb-1">
              {assessmentUnits.toLocaleString()}
            </div>
            <div className="text-sm text-gray-600">Assessment</div>
            <div className="text-xs text-gray-500 mt-1">
              {totalUnitsConsumed > 0 ? `${((assessmentUnits / totalUnitsConsumed) * 100).toFixed(0)}% of total` : 'No usage yet'}
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Usage Breakdown Pie Chart */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <PieChart className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg text-gray-900 font-medium">Usage by Module</h3>
              </div>
            </div>
            <div className="space-y-4">
              {totalUnitsConsumed === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Zap className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>No usage recorded yet</p>
                  <p className="text-sm">Start using features to see breakdown</p>
                </div>
              ) : (
                <>
                  {/* Resume Upload */}
                  <div>
                    <div className="flex items-center justify-between mb-2 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                        <span className="text-gray-700">Resume Upload</span>
                      </div>
                      <span className="font-medium text-gray-900">{resumeUploadUnits} units ({((resumeUploadUnits / totalUnitsConsumed) * 100).toFixed(1)}%)</span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full transition-all"
                        style={{ width: `${(resumeUploadUnits / totalUnitsConsumed) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Resume Scoring */}
                  <div>
                    <div className="flex items-center justify-between mb-2 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-purple-600 rounded-full"></div>
                        <span className="text-gray-700">Resume Scoring</span>
                      </div>
                      <span className="font-medium text-gray-900">{resumeScoringUnits} units ({((resumeScoringUnits / totalUnitsConsumed) * 100).toFixed(1)}%)</span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-600 rounded-full transition-all"
                        style={{ width: `${(resumeScoringUnits / totalUnitsConsumed) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* AI Interview */}
                  <div>
                    <div className="flex items-center justify-between mb-2 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-orange-600 rounded-full"></div>
                        <span className="text-gray-700">AI Interview</span>
                      </div>
                      <span className="font-medium text-gray-900">{aiInterviewUnits} units ({((aiInterviewUnits / totalUnitsConsumed) * 100).toFixed(1)}%)</span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-orange-600 rounded-full transition-all"
                        style={{ width: `${(aiInterviewUnits / totalUnitsConsumed) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Assessment */}
                  <div>
                    <div className="flex items-center justify-between mb-2 text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-600 rounded-full"></div>
                        <span className="text-gray-700">Assessment</span>
                      </div>
                      <span className="font-medium text-gray-900">{assessmentUnits} units ({((assessmentUnits / totalUnitsConsumed) * 100).toFixed(1)}%)</span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-600 rounded-full transition-all"
                        style={{ width: `${(assessmentUnits / totalUnitsConsumed) * 100}%` }}
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Cost Analysis */}
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <DollarSign className="w-5 h-5 text-green-600" />
                <h3 className="text-lg text-gray-900 font-medium">Cost Breakdown</h3>
              </div>
            </div>
            <div className="space-y-4">
              {/* Unit costs (example pricing) */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-3">Cost per Unit</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">Resume Scoring</span>
                    <span className="font-medium text-gray-900">$0.03 / unit</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">AI Interview</span>
                    <span className="font-medium text-gray-900">$0.05 / unit</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">Assessment</span>
                    <span className="font-medium text-gray-900">$0.04 / unit</span>
                  </div>
                </div>
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-3">Estimated Costs This Month</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">Resume Scoring</span>
                    <span className="font-medium text-gray-900">${(resumeScoringUnits * 0.03).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">AI Interview</span>
                    <span className="font-medium text-gray-900">${(aiInterviewUnits * 0.05).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">Assessment</span>
                    <span className="font-medium text-gray-900">${(assessmentUnits * 0.04).toFixed(2)}</span>
                  </div>
                  <div className="border-t border-blue-200 pt-2 mt-2 flex items-center justify-between">
                    <span className="font-medium text-gray-900">Total</span>
                    <span className="text-xl font-bold text-blue-700">
                      ${((resumeScoringUnits * 0.03) + (aiInterviewUnits * 0.05) + (assessmentUnits * 0.04)).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Activity Log */}
        <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg text-gray-900 font-medium">Recent Activity</h3>
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium flex items-center gap-2 text-sm"
            >
              <Filter className="w-4 h-4" />
              Filters
              <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Filters */}
          {showFilters && (
            <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Search Activity
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search by job, candidate, operation..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                      >
                        <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Filter by Module
                  </label>
                  <select
                    value={selectedModule}
                    onChange={(e) => setSelectedModule(e.target.value as any)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600 bg-white"
                  >
                    <option value="all">All Modules</option>
                    <option value="Resume Upload">Resume Upload</option>
                    <option value="Resume Scoring">Resume Scoring</option>
                    <option value="AI Interview">AI Interview</option>
                    <option value="Assessment">Assessment</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Activity Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Timestamp</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Module</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Operation</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Details</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Units Used</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((record, index) => (
                  <tr 
                    key={record.id}
                    className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    }`}
                  >
                    <td className="py-4 px-4">
                      <div className="text-sm text-gray-900">
                        {record.timestamp.toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })}
                      </div>
                      <div className="text-xs text-gray-500">
                        {record.timestamp.toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${getModuleColor(record.module)}`}>
                        {getModuleIcon(record.module)}
                        {record.module}
                      </span>
                    </td>
                    <td className="py-4 px-4">
                      <div className="text-sm font-medium text-gray-900">{record.operation}</div>
                      {record.jobTitle && (
                        <div className="text-xs text-gray-500 mt-0.5">{record.jobTitle}</div>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      <div className="text-sm text-gray-700 max-w-md">{record.details}</div>
                    </td>
                    <td className="py-4 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-50 border border-blue-200 rounded-lg">
                        <Zap className="w-3.5 h-3.5 text-blue-600" />
                        <span className="text-sm font-bold text-blue-700">{record.unitsConsumed}</span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-center">
                      {record.status === 'completed' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700 border border-green-200">
                          <CheckCircle2 className="w-3 h-3" />
                          Completed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                          <X className="w-3 h-3" />
                          Failed
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredRecords.length === 0 && (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
                  <BarChart3 className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg text-gray-900 mb-2">No Activity Found</h3>
                <p className="text-gray-600">
                  {searchQuery || selectedModule !== 'all'
                    ? 'No activity matches your current filters.'
                    : 'No usage activity recorded yet. Click "Record Usage" to track usage.'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Record Usage Modal */}
      {showRecordModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Plus className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Record Usage</h2>
                    <p className="text-sm text-gray-600">Track quota consumption</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowRecordModal(false);
                    setRecordError(null);
                    setRecordSuccess(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Success Message */}
              {recordSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <p className="text-sm text-green-700">{recordSuccess}</p>
                </div>
              )}

              {/* Error Message */}
              {recordError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700">{recordError}</p>
                </div>
              )}

              {/* Quota Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quota Type *
                </label>
                <select
                  value={recordForm.quota_type}
                  onChange={(e) => setRecordForm({ ...recordForm, quota_type: e.target.value as RecordUsageRequest['quota_type'] })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                >
                  <option value="RU">Resume Upload (RU)</option>
                  <option value="RS">Resume Scoring (RS)</option>
                  <option value="AS">Assessment (AS)</option>
                  <option value="AIU">AI Interview Unit (AIU)</option>
                  <option value="storage_gb">Storage (GB)</option>
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Amount (units)
                </label>
                <input
                  type="number"
                  min="1"
                  value={recordForm.amount || 1}
                  onChange={(e) => setRecordForm({ ...recordForm, amount: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                />
              </div>

              {/* Operation Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Operation Type (optional)
                </label>
                <input
                  type="text"
                  value={recordForm.operation_type || ''}
                  onChange={(e) => setRecordForm({ ...recordForm, operation_type: e.target.value })}
                  placeholder="e.g., resume_upload, bulk_score"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                />
              </div>

              {/* Resource ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Resource ID (optional)
                </label>
                <input
                  type="text"
                  value={recordForm.resource_id || ''}
                  onChange={(e) => setRecordForm({ ...recordForm, resource_id: e.target.value })}
                  placeholder="e.g., resume-abc123"
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                />
              </div>

              {/* API Info */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-xs text-blue-700">
                  <strong>API:</strong> POST /api/v1/external/usage/record<br />
                  <strong>Auth:</strong> X-API-Key header required
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowRecordModal(false);
                    setRecordError(null);
                    setRecordSuccess(null);
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRecordUsage}
                  disabled={recordingUsage}
                  className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {recordingUsage ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Recording...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Record Usage
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
