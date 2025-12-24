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

// API response types for /subscriptions/{tenant_id}/summary
interface PlanInfo {
  id: number;
  name: string;
  description?: string;
  price: number;
  billing_interval: string;
  features?: Record<string, any>;
  quotas?: Record<string, number>;
}

interface SubscriptionInfo {
  id: number;
  status: string;
  billing_interval: string;
  start_date: string;
  current_period_start: string;
  current_period_end: string;
  days_until_renewal: number;
  price: number;
}

interface SubscriptionSummary {
  tenant_id: string;
  tenant_name: string;
  status: string;
  is_trial: boolean;
  trial_days_remaining?: number;
  plan: PlanInfo | null;
  subscription: SubscriptionInfo | null;
  isolation_type: string;
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
  const [subscriptionSummary, setSubscriptionSummary] = useState<SubscriptionSummary | null>(null);
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

  // Record usage via backend API (which proxies to admin API)
  const recordUsage = async (request: RecordUsageRequest): Promise<boolean> => {
    const token = localStorage.getItem('accessToken');
    if (!token) {
      setRecordError('Not authenticated. Please log in again.');
      return false;
    }

    try {
      // Call backend endpoint which proxies to admin API
      const response = await fetch(`${API_BASE}/usage/record`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
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
      const token = localStorage.getItem('accessToken');
      if (!token) {
        console.warn('[UsageDashboard] No access token found');
        setLoading(false);
        return;
      }

      // Get tenant_id and plan_id from auth/me
      let tenantId = localStorage.getItem('tenantApiKey');
      let planId: number | null = null;
      let isTrial = false;

      const meResponse = await fetch(`${API_BASE}/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (meResponse.ok) {
        const meData = await meResponse.json();
        tenantId = meData.tenant_id;
        planId = meData.plan_id;
        isTrial = meData.plan_id === 1 || meData.is_trial === true;
        if (tenantId) {
          localStorage.setItem('tenantApiKey', tenantId);
        }
      }

      if (!tenantId) {
        console.warn('[UsageDashboard] Could not get tenant_id');
        setLoading(false);
        return;
      }

      console.log('[UsageDashboard] Fetching quota status for tenant:', tenantId, 'planId:', planId, 'isTrial:', isTrial);

      let quotaStatusData: any = null;

      // If free trial (plan_id = 1), call free-trial endpoint first
      if (isTrial || planId === 1) {
        console.log('[UsageDashboard] User on free trial, fetching trial quotas');
        try {
          const freeTrialResponse = await fetch(`${API_BASE}/subscription/public/free-trial`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });

          if (freeTrialResponse.ok) {
            const trialData = await freeTrialResponse.json();
            console.log('[UsageDashboard] Free trial data:', trialData);
            quotaStatusData = { status: 'success', data: trialData.data || trialData };
          }
        } catch (trialErr) {
          console.warn('[UsageDashboard] Free trial API failed, falling back to quota-status:', trialErr);
        }
      }

      // If not trial or trial API failed, call regular quota-status
      if (!quotaStatusData) {
        const quotaStatusResponse = await fetch(`${API_BASE}/usage/quota-status`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (quotaStatusResponse.ok) {
          quotaStatusData = await quotaStatusResponse.json();
        }
      }

      if (quotaStatusData) {
        console.log('[UsageDashboard] Quota status data:', quotaStatusData);

        // New response format from /usage/quota-status:
        // { status, data: { tenant_id, plan_name, billing_period, quotas: { RU: { subscription: {...}, addon: {...}, total_remaining, status }, ... }, alerts }, meta }
        const data = quotaStatusData.data || quotaStatusData;
        const quotasMap = data.quotas || {};

        // Convert external API quota format to our QuotaInfo format - DYNAMIC
        const quotasList: QuotaInfo[] = [];

        // Preferred order for display (any extras will be added at the end)
        const preferredOrder = ['RU', 'RS', 'AS', 'AIU', 'storage_gb', 'max_jobs', 'max_seats'];

        // Get all quota types from API response
        const allQuotaTypes = Object.keys(quotasMap);

        // Sort: preferred order first, then any remaining
        const sortedQuotaTypes = [
          ...preferredOrder.filter(qt => allQuotaTypes.includes(qt)),
          ...allQuotaTypes.filter(qt => !preferredOrder.includes(qt))
        ];

        for (const quotaType of sortedQuotaTypes) {
          const q = quotasMap[quotaType];
          if (q) {
            // New format: q.subscription contains { limit, used, remaining, percentage }
            const sub = q.subscription || {};
            // Handle "unlimited" values
            const isUnlimited = sub.limit === 'unlimited' || sub.limit === -1;
            const limit = isUnlimited ? -1 : (sub.limit || 0);
            const used = sub.used || 0;
            const remaining = isUnlimited ? -1 : (q.total_remaining !== undefined ? q.total_remaining : (sub.remaining || 0));
            const usagePercentage = isUnlimited ? 0 : (sub.percentage || (limit > 0 ? (used / limit) * 100 : 0));

            // Status: OK, WARNING, CRITICAL, EXCEEDED
            const status = q.status || 'OK';
            const isLow = status === 'WARNING' || status === 'CRITICAL' || usagePercentage >= 80;
            const isExhausted = status === 'EXCEEDED' || (remaining <= 0 && !isUnlimited);

            quotasList.push({
              quota_type: quotaType,
              name: quotaTypeToModule[quotaType] || quotaType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
              limit: limit,
              used: used,
              remaining: remaining,
              percentage_used: usagePercentage,
              is_low: isLow,
              is_exhausted: isExhausted,
            });
          }
        }

        // Check if any quotas are low or critical
        const hasLowQuotas = quotasList.some(q => q.is_low || q.is_exhausted);
        const lowQuotaTypes = quotasList.filter(q => q.is_low || q.is_exhausted).map(q => q.name);

        // Handle alerts - can be array of strings or objects
        let alertMessage = '';
        if (data.alerts && Array.isArray(data.alerts)) {
          alertMessage = data.alerts.map((alert: any) => {
            if (typeof alert === 'string') return alert;
            if (typeof alert === 'object') return alert.message || alert.text || JSON.stringify(alert);
            return String(alert);
          }).join(' ');
        }

        setQuotaSummary({
          has_low_quotas: hasLowQuotas,
          low_quota_types: lowQuotaTypes,
          upgrade_message: alertMessage || (hasLowQuotas ? `Some quotas are running low: ${lowQuotaTypes.join(', ')}` : ''),
          quotas: quotasList,
          billing_period: data.billing_period,
        });
        setQuotaData({ quotas: quotasList });

        // Calculate total usage stats from new format
        const totalUsed = quotasList.reduce((sum, q) => sum + (q.used || 0), 0);
        setUsageData({
          total_units: totalUsed,
          breakdown: {
            resume_upload: { units: quotasMap.RU?.subscription?.used || 0 },
            resume_scoring: { units: quotasMap.RS?.subscription?.used || 0 },
            ai_interview: { units: quotasMap.AIU?.subscription?.used || 0 },
            assessment: { units: quotasMap.AS?.subscription?.used || 0 },
          }
        });

        // Set subscription summary from new format
        if (data.tenant_id) {
          setSubscriptionSummary({
            tenant_id: data.tenant_id,
            tenant_name: data.tenant_id,
            status: 'active',
            is_trial: false,
            plan: {
              id: 0,
              name: data.plan_name || 'Professional',
              price: 0,
              billing_interval: 'month',
            },
            subscription: data.billing_period ? {
              id: 0,
              status: 'active',
              billing_interval: 'month',
              start_date: data.billing_period.start,
              current_period_start: data.billing_period.start,
              current_period_end: data.billing_period.end,
              days_until_renewal: data.billing_period.end ? Math.ceil((new Date(data.billing_period.end).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 30,
              price: 0,
            } : null,
            isolation_type: 'database',
          });
        }

      } else {
        console.error('[UsageDashboard] Failed to fetch quota status');
        // Set default quotas on error
        setQuotaSummary({
          has_low_quotas: false,
          quotas: [
            { quota_type: 'RU', name: 'Resume Upload', limit: 0, used: 0, remaining: 0, percentage_used: 0, is_low: false, is_exhausted: false },
            { quota_type: 'RS', name: 'Resume Scoring', limit: 0, used: 0, remaining: 0, percentage_used: 0, is_low: false, is_exhausted: false },
            { quota_type: 'AS', name: 'Assessment', limit: 0, used: 0, remaining: 0, percentage_used: 0, is_low: false, is_exhausted: false },
            { quota_type: 'AIU', name: 'AI Interview', limit: 0, used: 0, remaining: 0, percentage_used: 0, is_low: false, is_exhausted: false },
          ],
        });
      }

      // Subscription summary endpoint commented out - using quota-status data only
      // try {
      //   const summaryResponse = await fetch(`${USAGE_API_BASE}/subscriptions/${tenantId}/summary`, {
      //     method: 'GET',
      //     headers: {
      //       'Authorization': `Bearer ${token}`,
      //       'Content-Type': 'application/json',
      //     },
      //   });
      //
      //   if (summaryResponse.ok) {
      //     const summaryData = await summaryResponse.json();
      //     console.log('[UsageDashboard] Subscription summary data:', summaryData);
      //     const subData = summaryData.data || summaryData;
      //     setSubscriptionSummary(subData);
      //   }
      // } catch (subError) {
      //   console.warn('[UsageDashboard] Could not fetch subscription summary:', subError);
      // }

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
    'max_jobs': 'Max Jobs',
    'max_seats': 'Max Users',
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
        {/* Subscription Summary Card */}
        {subscriptionSummary && (
          <div className="mb-8 bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                  <Zap className="w-6 h-6 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-xl font-semibold text-gray-900">
                      {subscriptionSummary.plan?.name || 'No Plan'}
                    </h2>
                    {subscriptionSummary.is_trial && (
                      <span className="px-2 py-1 text-xs font-bold text-orange-600 bg-orange-100 rounded-full">
                        TRIAL {subscriptionSummary.trial_days_remaining ? `(${subscriptionSummary.trial_days_remaining} days left)` : ''}
                      </span>
                    )}
                    <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                      subscriptionSummary.status === 'active'
                        ? 'text-green-600 bg-green-100'
                        : subscriptionSummary.status === 'trialing'
                        ? 'text-blue-600 bg-blue-100'
                        : 'text-gray-600 bg-gray-100'
                    }`}>
                      {subscriptionSummary.status?.toUpperCase() || 'UNKNOWN'}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">
                    Tenant: {subscriptionSummary.tenant_name || subscriptionSummary.tenant_id}
                  </p>
                  {subscriptionSummary.plan?.description && (
                    <p className="text-sm text-gray-500">{subscriptionSummary.plan.description}</p>
                  )}
                </div>
              </div>

              <div className="text-right">
                {subscriptionSummary.subscription && (
                  <>
                    <div className="text-2xl font-bold text-gray-900">
                      ₹{subscriptionSummary.subscription.price?.toFixed(2) || subscriptionSummary.plan?.price?.toFixed(2) || '0.00'}
                      <span className="text-sm font-normal text-gray-500">
                        /{subscriptionSummary.subscription.billing_interval || 'month'}
                      </span>
                    </div>
                    {subscriptionSummary.subscription.days_until_renewal !== undefined && (
                      <p className="text-sm text-gray-500 mt-1">
                        Renews in {subscriptionSummary.subscription.days_until_renewal} days
                      </p>
                    )}
                  </>
                )}
                {subscriptionSummary.isolation_type && (
                  <span className="inline-flex items-center gap-1 mt-2 px-2 py-1 text-xs font-medium text-purple-600 bg-purple-100 rounded-full">
                    {subscriptionSummary.isolation_type === 'database' ? 'Database Isolation' : 'Schema Isolation'}
                  </span>
                )}
              </div>
            </div>

            {/* Plan Features */}
            {subscriptionSummary.plan?.features && Object.keys(subscriptionSummary.plan.features).length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <h4 className="text-sm font-medium text-gray-700 mb-2">Plan Features</h4>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(subscriptionSummary.plan.features).map(([key, value]) => (
                    <span
                      key={key}
                      className="px-3 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-full"
                    >
                      {key.replace(/_/g, ' ')}: {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

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

            {/* Quota Cards Grid - Dynamic */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4 mb-6">
              {quotaSummary.quotas?.map((quota: QuotaInfo) => {
                const colors: Record<string, { bg: string; text: string; border: string }> = {
                  'RU': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
                  'RS': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
                  'AS': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
                  'AIU': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
                  'storage_gb': { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
                  'max_jobs': { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
                  'max_seats': { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
                };
                const defaultColor = { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
                const c = colors[quota.quota_type] || defaultColor;
                const isUnlimited = quota.limit === -1 || quota.remaining === -1;

                return (
                  <div
                    key={quota.quota_type}
                    className={`${c.bg} ${c.border} border-2 rounded-xl p-4 transition-all hover:shadow-md ${
                      quota.is_exhausted ? 'ring-2 ring-red-400' : quota.is_low ? 'ring-2 ring-yellow-400' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">{quota.name}</span>
                      {isUnlimited && (
                        <span className="text-xs font-bold text-cyan-600 bg-cyan-100 px-2 py-0.5 rounded-full">
                          UNLIMITED
                        </span>
                      )}
                      {!isUnlimited && quota.is_exhausted && (
                        <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                          EXHAUSTED
                        </span>
                      )}
                      {!isUnlimited && quota.is_low && !quota.is_exhausted && (
                        <span className="text-xs font-bold text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-full">
                          LOW
                        </span>
                      )}
                    </div>
                    <div className={`text-3xl font-bold ${c.text}`}>
                      {isUnlimited ? '∞' : quota.remaining}
                      <span className="text-sm font-normal text-gray-500">
                        /{isUnlimited ? '∞' : quota.limit}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mt-2">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isUnlimited ? 'bg-cyan-500' : quota.is_exhausted ? 'bg-red-500' : quota.is_low ? 'bg-yellow-500' : 'bg-green-500'
                        }`}
                        style={{ width: isUnlimited ? '100%' : `${Math.min(quota.percentage_used, 100)}%` }}
                      />
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {quota.used} used {isUnlimited ? '' : `(${quota.percentage_used?.toFixed(1)}%)`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Activity Section */}
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
                  <strong>API:</strong> POST /api/v1/usage/record<br />
                  <strong>Auth:</strong> Bearer token (JWT)
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
