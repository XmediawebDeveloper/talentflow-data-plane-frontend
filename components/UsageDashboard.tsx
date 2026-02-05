'use client';

import { TrendingUp, Zap, Calendar, Clock, DollarSign, X, AlertCircle, CheckCircle2, Loader2, AlertTriangle, ArrowUpRight, Plus, Send, Sparkles, ShoppingCart } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import QuotaDisplay from './QuotaDisplay';
import { useQuota } from '@/contexts/QuotaContext';
import { useAuth } from '@/components/providers/AuthProvider';

// Addon interface
interface Addon {
  id: number;
  name: string;
  addon_name?: string;
  addon_slug?: string;
  addon_type?: string;
  description?: string;
  unit_price?: number;
  price?: number;
  currency?: string;
  billing_unit?: string;
  credit_amount?: number;
  quota_type?: string;
  min_quantity?: number;
  max_quantity?: number;
  is_active?: boolean;
  is_public?: boolean;
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
  isolation_type: 'SCHEMA' | 'DATABASE' | 'DEDICATED' | string | null;
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

// Map quota_type to display names - defined at module level for use in processing
const quotaTypeToModuleMap: Record<string, string> = {
  'RU': 'Resume Upload',
  'RS': 'Resume Scoring',
  'AS': 'Assessment',
  'AIU': 'AI Interview',
  'storage_gb': 'Storage',
  'max_seats': 'Max Users',
};

export default function UsageDashboard({ onBack }: UsageDashboardProps) {
  // Use shared QuotaContext instead of making duplicate API calls
  const { quotaData: contextQuotaData, loading: quotaLoading, error: quotaError, hasPermission, refetch: refetchQuota } = useQuota();
  // Get user from AuthContext (already fetched during login)
  const { user } = useAuth();

  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month' | 'all'>('month');
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

  // Addon states
  const [addons, setAddons] = useState<Addon[]>([]);
  const [addonsLoading, setAddonsLoading] = useState(false);
  const [showAddonModal, setShowAddonModal] = useState(false);
  const [selectedAddon, setSelectedAddon] = useState<Addon | null>(null);
  const [addonQuantity, setAddonQuantity] = useState(1);
  const [purchasingAddon, setPurchasingAddon] = useState(false);
  const [addonPurchaseSuccess, setAddonPurchaseSuccess] = useState<string | null>(null);
  const [addonPurchaseError, setAddonPurchaseError] = useState<string | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

  // Fetch addons on mount
  useEffect(() => {
    fetchAddons();
  }, []);

  // Fetch available addons
  const fetchAddons = async () => {
    setAddonsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/addons?active_only=true&public_only=true`);
      if (response.ok) {
        const result = await response.json();
        const data: Addon[] = result.data || result || [];
        setAddons(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.error('[UsageDashboard] Error fetching addons:', error);
    } finally {
      setAddonsLoading(false);
    }
  };

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
      setRecordSuccess(`Successfully recorded ${recordForm.amount || 1} unit(s) of ${quotaTypeToModuleMap[recordForm.quota_type]}`);
      setRecordForm({ quota_type: 'RU', amount: 1, operation_type: '', resource_id: '' });
      setTimeout(() => {
        setShowRecordModal(false);
        setRecordSuccess(null);
      }, 2000);
    }

    setRecordingUsage(false);
  };

  // Derive quotaSummary from context data
  const quotaSummary = useMemo(() => {
    if (!contextQuotaData) return null;

    const quotasMap = contextQuotaData.quotas || {};
    const quotasList: QuotaInfo[] = [];

    // Preferred order for display
    const preferredOrder = ['RU', 'RS', 'AS', 'AIU', 'storage_gb', 'max_seats'];
    const excludedQuotaTypes = ['max_jobs'];
    const allQuotaTypes = Object.keys(quotasMap).filter(qt => !excludedQuotaTypes.includes(qt));

    const sortedQuotaTypes = [
      ...preferredOrder.filter(qt => allQuotaTypes.includes(qt)),
      ...allQuotaTypes.filter(qt => !preferredOrder.includes(qt))
    ];

    for (const quotaType of sortedQuotaTypes) {
      const q = quotasMap[quotaType as keyof typeof quotasMap];
      if (q) {
        const sub = q.subscription || {};
        const addon = q.addon || {};
        const isUnlimited = sub.limit === 'unlimited' || sub.limit === -1;
        const addonRemaining = addon.remaining || 0;
        const baseLimit = isUnlimited ? -1 : (typeof sub.limit === 'number' ? sub.limit : 0);
        const limit = isUnlimited ? -1 : (baseLimit + addonRemaining);
        const used = sub.used || 0;
        const remaining = isUnlimited ? -1 : (q.total_remaining !== undefined ? (typeof q.total_remaining === 'number' ? q.total_remaining : 0) : (typeof sub.remaining === 'number' ? sub.remaining : 0));
        const usagePercentage = isUnlimited ? 0 : (limit > 0 ? (used / limit) * 100 : 0);

        const hasQuota = limit > 0;
        // Calculate exhausted/low based on total_remaining (includes addon credits), not just subscription status
        // A quota is only exhausted when total_remaining <= 0 (no subscription OR addon credits left)
        const isExhausted = hasQuota && !isUnlimited && remaining <= 0;
        // A quota is low when usage >= 80% of total limit (subscription + addon)
        const isLow = hasQuota && !isUnlimited && !isExhausted && usagePercentage >= 80;

        quotasList.push({
          quota_type: quotaType,
          name: quotaTypeToModuleMap[quotaType] || quotaType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          limit: limit,
          used: used,
          remaining: remaining,
          percentage_used: usagePercentage,
          is_low: isLow,
          is_exhausted: isExhausted,
        });
      }
    }

    const hasLowQuotas = quotasList.some(q => q.is_low || q.is_exhausted);
    const lowQuotaTypes = quotasList.filter(q => q.is_low || q.is_exhausted).map(q => q.name);

    // Debug: log quota status
    console.log('[UsageDashboard] Quota summary:', quotasList.map(q => ({
      name: q.name,
      used: q.used,
      limit: q.limit,
      remaining: q.remaining,
      percentage: q.percentage_used.toFixed(1) + '%',
      is_low: q.is_low,
      is_exhausted: q.is_exhausted,
    })));
    console.log('[UsageDashboard] Has low quotas:', hasLowQuotas, 'Low types:', lowQuotaTypes);

    return {
      has_low_quotas: hasLowQuotas,
      low_quota_types: lowQuotaTypes,
      upgrade_message: hasLowQuotas ? `Some quotas are running low: ${lowQuotaTypes.join(', ')}` : '',
      quotas: quotasList,
      billing_period: contextQuotaData.billing_period,
    };
  }, [contextQuotaData]);

  // Derive subscriptionSummary from context data
  const subscriptionSummary = useMemo((): SubscriptionSummary | null => {
    if (!contextQuotaData) return null;

    const isTrial = contextQuotaData.is_trial || false;
    const basePrice = isTrial ? 0 : (contextQuotaData.plan_info?.subscribed_price ?? 0);
    const billingInterval = contextQuotaData.plan_info?.billing_period?.toLowerCase() || contextQuotaData.plan_info?.billing_interval?.toLowerCase() || 'month';

    // For trial: use trial_info.trial_end_date and trial_info.days_remaining from Admin API
    // For paid: use billing_period.end from Admin API
    let daysRemaining: number | null = null;
    let endDate: string | undefined;

    if (isTrial) {
      // Use trial_info from Admin API (source of truth for trial)
      daysRemaining = contextQuotaData.trial_info?.days_remaining ?? null;
      endDate = contextQuotaData.trial_info?.trial_end_date;
    } else {
      // Use billing_period for paid plans
      endDate = contextQuotaData.billing_period?.end;
      daysRemaining = endDate
        ? Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;
    }

    return {
      tenant_id: contextQuotaData.tenant_id || '',
      tenant_name: contextQuotaData.tenant_id || '',
      status: contextQuotaData.subscription_status || 'active',
      is_trial: isTrial,
      trial_days_remaining: isTrial ? daysRemaining : undefined,
      plan: {
        id: contextQuotaData.plan_info?.plan_id || 0,
        name: contextQuotaData.plan_name || 'Professional',
        price: basePrice,
        billing_interval: billingInterval,
      },
      subscription: {
        id: 0,
        status: isTrial ? 'trialing' : 'active',
        billing_interval: billingInterval,
        start_date: isTrial ? (contextQuotaData.trial_info?.trial_start_date || '') : (contextQuotaData.billing_period?.start || ''),
        current_period_start: contextQuotaData.billing_period?.start || '',
        current_period_end: endDate || '',
        days_until_renewal: daysRemaining ?? 0,
        price: basePrice,
      },
      isolation_type: contextQuotaData.isolation_type || null,
    };
  }, [contextQuotaData]);

  // Derive usageData from context
  const usageData = useMemo(() => {
    if (!contextQuotaData?.quotas) return null;
    const quotasMap = contextQuotaData.quotas;
    const totalUsed = (quotasMap.RU?.subscription?.used || 0) +
                      (quotasMap.RS?.subscription?.used || 0) +
                      (quotasMap.AS?.subscription?.used || 0) +
                      (quotasMap.AIU?.subscription?.used || 0);
    return {
      total_units: totalUsed,
      breakdown: {
        resume_upload: { units: quotasMap.RU?.subscription?.used || 0 },
        resume_scoring: { units: quotasMap.RS?.subscription?.used || 0 },
        ai_interview: { units: quotasMap.AIU?.subscription?.used || 0 },
        assessment: { units: quotasMap.AS?.subscription?.used || 0 },
      }
    };
  }, [contextQuotaData]);

  // Derive quotaData from quotaSummary
  const quotaData = useMemo(() => {
    if (!quotaSummary) return null;
    return { quotas: quotaSummary.quotas };
  }, [quotaSummary]);

  // Combined loading state - show loading if quota data hasn't arrived yet
  const loading = !contextQuotaData && !quotaError;

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

  // Hide the entire dashboard if user doesn't have permission
  if (!hasPermission) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/30 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-gray-700" />
          <span className="text-lg text-gray-600">Loading usage data...</span>
        </div>
      </div>
    );
  }

  const handleUpgradeClick = () => {
    window.location.href = '/subscription/current-plan';
  };

  // Handle addon buy click
  const handleBuyAddon = (addon: Addon) => {
    setSelectedAddon(addon);
    setAddonQuantity(1);
    setAddonPurchaseSuccess(null);
    setAddonPurchaseError(null);
    setShowAddonModal(true);
  };

  // Handle addon purchase
  const handlePurchaseAddon = async () => {
    if (!selectedAddon) return;

    setPurchasingAddon(true);
    setAddonPurchaseError(null);

    try {
      const token = localStorage.getItem('accessToken');
      if (!token) {
        setAddonPurchaseError('Not authenticated. Please log in again.');
        setPurchasingAddon(false);
        return;
      }

      // Get tenant ID from AuthContext (already fetched during login)
      const tenantId = user?.tenantId;
      if (!tenantId) {
        setAddonPurchaseError('User session not found. Please log in again.');
        setPurchasingAddon(false);
        return;
      }

      // Purchase addon via API
      const response = await fetch(`${API_BASE}/addons/purchase`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          addon_id: selectedAddon.id,
          quantity: addonQuantity,
          tenant_id: tenantId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Purchase failed: ${response.status}`);
      }

      const result = await response.json();
      const totalCredits = (selectedAddon.credit_amount || 0) * addonQuantity;
      const cleanName = (selectedAddon.name || 'quota').replace(/\s*-?\s*Pro$/i, '').trim();
      console.log('[UsageDashboard] Addon purchase result:', result);
      setAddonPurchaseSuccess(`Successfully added ${totalCredits} Units to your ${cleanName}!`);

      // Refresh quota data to show updated credits after a short delay
      setTimeout(async () => {
        console.log('[UsageDashboard] Refreshing quota data after addon purchase...');
        await refetchQuota();
        setShowAddonModal(false);
        setAddonPurchaseSuccess(null);
      }, 1500);

    } catch (error) {
      console.error('[UsageDashboard] Addon purchase error:', error);
      setAddonPurchaseError(error instanceof Error ? error.message : 'Purchase failed');
    } finally {
      setPurchasingAddon(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100/30">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center shadow-lg">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl text-gray-900">Usage & Quotas Dashboard</h1>
                <p className="text-sm text-gray-600 mt-0.5">
                  Track your quota consumption across Resume Storage, Scoring, Assessments, and AI Interviews
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleUpgradeClick}
                className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium flex items-center gap-2"
              >
                <TrendingUp className="w-4 h-4" />
                Upgrade Plan
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
                <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center shadow-lg">
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
                  </div>
                  <div className="mb-2">
                    <span className={`px-2 py-1 text-xs font-bold rounded-full ${
                      subscriptionSummary.status === 'active'
                        ? 'text-green-600 bg-green-100'
                        : subscriptionSummary.status === 'trialing'
                        ? 'text-gray-600 bg-gray-100'
                        : 'text-gray-600 bg-gray-100'
                    }`}>
                      {subscriptionSummary.status?.toUpperCase() || 'UNKNOWN'}
                    </span>
                  </div>
                  {subscriptionSummary.plan?.description && (
                    <p className="text-sm text-gray-500">{subscriptionSummary.plan.description}</p>
                  )}
                </div>
              </div>

              <div className="text-right">
                {subscriptionSummary.is_trial ? (
                  /* Free Trial - show expiry, no price */
                  <>
                    {subscriptionSummary.subscription?.days_until_renewal !== undefined && subscriptionSummary.subscription.days_until_renewal > 0 ? (
                      <div className="text-xl font-bold text-orange-600">
                        Expires in {subscriptionSummary.subscription.days_until_renewal} days
                      </div>
                    ) : (
                      <div className="text-xl font-bold text-red-600">
                        Trial Expired
                      </div>
                    )}
                    <p className="text-sm text-gray-500 mt-1">
                      Upgrade to continue using all features
                    </p>
                  </>
                ) : subscriptionSummary.subscription ? (
                  /* Paid Plan - show price and renewal */
                  <>
                    <div className="text-2xl font-bold text-gray-900">
                      ₹{subscriptionSummary.subscription.price?.toFixed(2) || subscriptionSummary.plan?.price?.toFixed(2) || '0.00'}
                      <span className="text-sm font-normal text-gray-500">
                        /{subscriptionSummary.subscription.billing_interval || 'month'}
                      </span>
                    </div>
                    {subscriptionSummary.subscription.days_until_renewal !== undefined && subscriptionSummary.subscription.days_until_renewal > 0 && (
                      <p className="text-sm text-gray-500 mt-1">
                        Renews in {subscriptionSummary.subscription.days_until_renewal} days
                      </p>
                    )}
                  </>
                ) : null}
                {subscriptionSummary.isolation_type && (
                  <span className="inline-flex items-center gap-1 mt-2 px-2 py-1 text-xs font-medium text-gray-800 bg-gray-100 rounded-full">
                    {subscriptionSummary.isolation_type === 'DEDICATED' ? 'Dedicated Server' :
                     subscriptionSummary.isolation_type === 'DATABASE' ? 'Dedicated Database' :
                     subscriptionSummary.isolation_type === 'SCHEMA' ? 'Schema Isolation' :
                     subscriptionSummary.isolation_type}
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
                      className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-full"
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
              <div className="bg-gray-100 border-2 border-gray-300 rounded-xl p-4 mb-6 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Quota Running Low!</h3>
                    <p className="text-sm text-gray-600">Purchase add-on Units to continue using these features.</p>
                  </div>
                </div>
                {/* Show each low quota with its own Add Credits button */}
                <div className="flex flex-wrap gap-2 ml-[52px]">
                  {quotaSummary.quotas
                    ?.filter((q: QuotaInfo) => q.is_low || q.is_exhausted)
                    .map((quota: QuotaInfo) => {
                      // Map quota_type to addon name pattern for matching
                      const quotaToAddonMap: Record<string, string> = {
                        'RU': 'resume upload',
                        'RS': 'resume scoring',
                        'AS': 'assessment',
                        'AIU': 'ai interview',
                        'max_seats': 'max seats',
                      };
                      const addonPattern = quotaToAddonMap[quota.quota_type] || '';

                      // Find matching addon
                      const matchingAddon = addons.find(addon =>
                        (addon.name || addon.addon_name || '').toLowerCase().includes(addonPattern)
                      );

                      return (
                        <button
                          key={quota.quota_type}
                          onClick={() => {
                            if (subscriptionSummary?.is_trial) {
                              // Show upgrade message for trial users
                              setAddonPurchaseError('Addon purchases are only available for paid plans. Please upgrade from your free trial.');
                              return;
                            }
                            if (matchingAddon) {
                              handleBuyAddon(matchingAddon);
                            } else {
                              // Scroll to addons section if no matching addon found
                              const addonsSection = document.querySelector('[data-section="addons"]');
                              if (addonsSection) {
                                addonsSection.scrollIntoView({ behavior: 'smooth' });
                              }
                            }
                          }}
                          title={subscriptionSummary?.is_trial ? "Upgrade to a paid plan to purchase addons" : ""}
                          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                            subscriptionSummary?.is_trial
                              ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                              : quota.is_exhausted
                                ? 'bg-gray-900 text-white hover:bg-gray-800'
                                : 'bg-gray-700 text-white hover:bg-gray-600'
                          }`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {quota.name}
                          {quota.is_exhausted && !subscriptionSummary?.is_trial && <span className="text-xs opacity-80">(Exhausted)</span>}
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Quota Cards Grid - Dynamic */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-6">
              {quotaSummary.quotas?.filter((quota: QuotaInfo) => quota.quota_type !== 'storage_gb').map((quota: QuotaInfo) => {
                // Grey theme for all quota types
                const c = { bg: 'bg-gray-50', text: 'text-gray-900', border: 'border-gray-200' };
                const isUnlimited = quota.limit === -1 || quota.remaining === -1;

                return (
                  <div
                    key={quota.quota_type}
                    className={`${c.bg} ${c.border} border-2 rounded-xl p-4 transition-all hover:shadow-md ${
                      quota.is_exhausted ? 'ring-2 ring-gray-400' : quota.is_low ? 'ring-2 ring-gray-400' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-gray-600">{quota.name}</span>
                      {isUnlimited && (
                        <span className="text-xs font-bold text-gray-600 bg-gray-200 px-2 py-0.5 rounded-full">
                          UNLIMITED
                        </span>
                      )}
                      {!isUnlimited && quota.is_exhausted && (
                        <span className="text-xs font-bold text-gray-100 bg-gray-800 px-2 py-0.5 rounded-full">
                          EXHAUSTED
                        </span>
                      )}
                      {!isUnlimited && quota.is_low && !quota.is_exhausted && (
                        <span className="text-xs font-bold text-gray-700 bg-gray-300 px-2 py-0.5 rounded-full">
                          LOW
                        </span>
                      )}
                    </div>
                    <div className={`text-3xl font-bold ${c.text}`}>
                      {isUnlimited ? '∞' : quota.used}
                      <span className="text-sm font-normal text-gray-500">
                        /{isUnlimited ? '∞' : quota.limit}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mt-2">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isUnlimited ? 'bg-gray-500' : quota.is_exhausted ? 'bg-gray-800' : quota.is_low ? 'bg-gray-600' : 'bg-gray-500'
                        }`}
                        style={{ width: isUnlimited ? '100%' : `${Math.min(quota.percentage_used, 100)}%` }}
                      />
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {quota.remaining} remaining {isUnlimited ? '' : `(${(100 - quota.percentage_used).toFixed(1)}% left)`}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Add-ons Section */}
      <div className="max-w-7xl mx-auto px-6 py-8" data-section="addons">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-gray-600" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Add-on Units</h2>
                <p className="text-sm text-gray-600">Purchase additional Units to extend your quota limits</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            {addonsLoading && (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                <p className="mt-3 text-gray-500">Loading add-ons...</p>
              </div>
            )}

            {!addonsLoading && addons.length === 0 && (
              <div className="text-center py-8">
                <div className="w-14 h-14 mx-auto mb-3 bg-gray-100 rounded-full flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-gray-400" />
                </div>
                <p className="text-gray-500">No add-ons available at the moment.</p>
              </div>
            )}

            {!addonsLoading && addons.length > 0 && (
              <div className="space-y-3">
                {/* Reorder addons: Extra Max Jobs before Extra Max Seats */}
                {[...addons]
                  .sort((a, b) => {
                    const nameA = (a.name || a.addon_name || '').toLowerCase();
                    const nameB = (b.name || b.addon_name || '').toLowerCase();
                    // Extra Max Jobs should come before Extra Max Seats
                    if (nameA.includes('max jobs') && nameB.includes('max seats')) return -1;
                    if (nameA.includes('max seats') && nameB.includes('max jobs')) return 1;
                    return 0;
                  })
                  .map((addon) => {
                  // Clean addon name: remove "Pro" suffix
                  const displayName = (addon.name || addon.addon_name || 'Credit Pack')
                    .replace(/\s*-?\s*Pro$/i, '')
                    .trim();
                  return (
                  <div
                    key={addon.id}
                    className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 hover:border-gray-400 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                        <Zap className="w-5 h-5 text-gray-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {displayName}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-xl font-bold text-gray-900">
                          {addon.credit_amount || addon.min_quantity || 0}
                        </div>
                        <div className="text-xs text-gray-500">Units</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-gray-700">
                          ₹{addon.price || addon.unit_price || 0}
                        </div>
                      </div>
                      <button
                        onClick={() => handleBuyAddon(addon)}
                        disabled={!subscriptionSummary || subscriptionSummary.is_trial}
                        title={subscriptionSummary?.is_trial ? "Upgrade to a paid plan to purchase addons" : ""}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                          !subscriptionSummary || subscriptionSummary.is_trial
                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : 'bg-gray-800 text-white hover:bg-gray-700'
                        }`}
                      >
                        <ShoppingCart className="w-4 h-4" />
                        {!subscriptionSummary || subscriptionSummary.is_trial ? 'Upgrade First' : 'Buy'}
                      </button>
                    </div>
                  </div>
                );
                })}
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
                  {/* <option value="storage_gb">Storage (GB)</option> */}
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
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <p className="text-xs text-gray-900">
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

      {/* Addon Purchase Modal */}
      {showAddonModal && selectedAddon && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-lg flex items-center justify-center">
                    <ShoppingCart className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Purchase Add-on</h2>
                    <p className="text-sm text-gray-600">Add Units to your quota</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowAddonModal(false);
                    setAddonPurchaseError(null);
                    setAddonPurchaseSuccess(null);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Success Message */}
              {addonPurchaseSuccess && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <p className="text-sm text-green-700">{addonPurchaseSuccess}</p>
                </div>
              )}

              {/* Error Message */}
              {addonPurchaseError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                  <p className="text-sm text-red-700">{addonPurchaseError}</p>
                </div>
              )}

              {/* Addon Details */}
              <div className="bg-gray-100 border border-gray-300 rounded-xl p-4">
                <h3 className="font-semibold text-gray-900">
                  {(selectedAddon.name || selectedAddon.addon_name || 'Credit Pack').replace(/\s*-?\s*Pro$/i, '').trim()}
                </h3>
              </div>

              {/* Quantity Selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quantity
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  {selectedAddon.credit_amount || 0} Units for ₹{selectedAddon.price || selectedAddon.unit_price || 0}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setAddonQuantity(Math.max(1, addonQuantity - 1))}
                    className="w-10 h-10 border border-gray-300 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors font-medium"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min="1"
                    max={100}
                    value={addonQuantity}
                    onChange={(e) => setAddonQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-20 text-center px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-500 font-semibold"
                  />
                  <button
                    onClick={() => setAddonQuantity(Math.min(100, addonQuantity + 1))}
                    className="w-10 h-10 border border-gray-300 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors font-medium"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Base unit</span>
                  <span className="font-medium">{selectedAddon.credit_amount || 0} Units = ₹{selectedAddon.price || selectedAddon.unit_price || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Quantity</span>
                  <span className="font-medium">x{addonQuantity}</span>
                </div>
                <hr className="border-gray-200" />
                <div className="flex justify-between items-center bg-gray-200 p-2 rounded-lg -mx-2">
                  <span className="text-gray-800 font-medium">Units to be added</span>
                  <span className="text-2xl font-bold text-gray-900">
                    +{(selectedAddon.credit_amount || 0) * addonQuantity}
                  </span>
                </div>
                <hr className="border-gray-200" />
                <div className="flex justify-between">
                  <span className="font-medium text-gray-900">Total Price</span>
                  <span className="text-xl font-bold text-gray-900">
                    ₹{((selectedAddon.price || selectedAddon.unit_price || 0) * addonQuantity).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowAddonModal(false);
                    setAddonPurchaseError(null);
                    setAddonPurchaseSuccess(null);
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePurchaseAddon}
                  disabled={purchasingAddon || !!addonPurchaseSuccess}
                  className="flex-1 px-4 py-2.5 bg-gray-800 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {purchasingAddon ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-4 h-4" />
                      Purchase Now
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
