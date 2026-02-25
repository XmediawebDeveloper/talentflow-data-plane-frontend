'use client';

import { TrendingUp, Zap, Calendar, Clock, DollarSign, X, AlertCircle, CheckCircle2, Loader2, AlertTriangle, ArrowUpRight, Plus, Send, Sparkles, ShoppingCart, RefreshCw, ChevronRight, BarChart3, Package, CreditCard, Info } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import QuotaDisplay from './QuotaDisplay';
import { useQuota } from '@/contexts/QuotaContext';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRazorpay } from '@/lib/hooks/useRazorpay';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';
import { PlanFeatureKey } from '@/lib/types/planFeatures';

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
  'RU': 'Resume Storage',
  'RS': 'Resume Scoring',
  'AS': 'Assessment',
  'AIU': 'AI Interview',
  'storage_gb': 'Storage',
  'max_seats': 'Max Users',
};

// Helper function to calculate remaining time from end date
// Returns: { isExpired, days, hours, minutes, displayText }
function calculateRemainingTime(endDateString: string | undefined): {
  isExpired: boolean;
  days: number;
  hours: number;
  minutes: number;
  displayText: string;
} {
  if (!endDateString) {
    return { isExpired: true, days: 0, hours: 0, minutes: 0, displayText: 'Expired' };
  }

  const now = new Date();
  const endDate = new Date(endDateString);
  const diffMs = endDate.getTime() - now.getTime();

  // If difference is negative or zero, it's expired
  if (diffMs <= 0) {
    return { isExpired: true, days: 0, hours: 0, minutes: 0, displayText: 'Expired' };
  }

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // More than 1 day remaining
  if (diffDays > 0) {
    return {
      isExpired: false,
      days: diffDays,
      hours: diffHours % 24,
      minutes: diffMinutes % 60,
      displayText: `${diffDays} day${diffDays > 1 ? 's' : ''} left`
    };
  }

  // Less than a day but hours remaining
  const remainingHours = diffHours;
  const remainingMinutes = diffMinutes % 60;

  if (remainingHours > 0) {
    const minutePart = remainingMinutes > 0 ? ` ${remainingMinutes}m` : '';
    return {
      isExpired: false,
      days: 0,
      hours: remainingHours,
      minutes: remainingMinutes,
      displayText: `${remainingHours}h${minutePart} left`
    };
  }

  // Only minutes remaining
  return {
    isExpired: false,
    days: 0,
    hours: 0,
    minutes: remainingMinutes,
    displayText: `${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''} left`
  };
}

export default function UsageDashboard({ onBack }: UsageDashboardProps) {
  // Use shared QuotaContext instead of making duplicate API calls
  const { quotaData: contextQuotaData, loading: quotaLoading, error: quotaError, hasPermission, refetch: refetchQuota } = useQuota();
  // Get user from AuthContext (already fetched during login)
  const { user } = useAuth();
  const { openCheckout, isProcessing: razorpayProcessing } = useRazorpay();
  const { hasPlanFeature } = usePlanFeatures();

  // Map quota types to plan features for gating
  const quotaFeatureMap: Record<string, PlanFeatureKey> = {
    'RU': 'resume_upload',
    'RS': 'resume_scoring',
    'AS': 'assessment',
    'AIU': 'ai_interview',
  };

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
        const addonPurchased = addon.total_purchased || 0;
        const baseLimit = isUnlimited ? -1 : (typeof sub.limit === 'number' ? sub.limit : 0);
        const limit = isUnlimited ? -1 : (baseLimit + addonPurchased);
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
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100/50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-gray-700 to-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-gray-300/50 animate-pulse">
            <BarChart3 className="w-10 h-10 text-white" />
          </div>
          <div className="flex items-center justify-center gap-3 mb-2">
            <Loader2 className="w-5 h-5 animate-spin text-gray-600" />
            <span className="text-lg font-semibold text-gray-700">Loading Usage Data</span>
          </div>
          <p className="text-sm text-gray-500">Fetching your quota information...</p>
        </div>
      </div>
    );
  }

  const handleUpgradeClick = () => {
    window.location.href = '/subscription/current-plan';
  };

  // Check if addon purchases should be blocked (trial or expired subscription)
  const isAddonPurchaseBlocked = !subscriptionSummary ||
    subscriptionSummary.is_trial ||
    subscriptionSummary.status?.toLowerCase() === 'expired' ||
    subscriptionSummary.status?.toLowerCase() === 'suspended' ||
    subscriptionSummary.status?.toLowerCase() === 'inactive';

  const addonBlockedMessage = subscriptionSummary?.is_trial
    ? 'Upgrade to a paid plan to purchase addons'
    : subscriptionSummary?.status?.toLowerCase() === 'expired'
      ? 'Renew your subscription to purchase addons'
      : subscriptionSummary?.status?.toLowerCase() === 'suspended'
        ? 'Account suspended - contact support'
        : 'Upgrade to a paid plan to purchase addons';

  // Handle addon buy click
  const handleBuyAddon = (addon: Addon) => {
    setSelectedAddon(addon);
    setAddonQuantity(1);
    setAddonPurchaseSuccess(null);
    setAddonPurchaseError(null);
    setShowAddonModal(true);
  };

  // Handle addon purchase — 3-step Razorpay flow
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

      const tenantId = user?.tenantId;
      if (!tenantId) {
        setAddonPurchaseError('User session not found. Please log in again.');
        setPurchasingAddon(false);
        return;
      }

      // Step 1: Create Razorpay order
      const orderRes = await fetch(`${API_BASE}/addons/create-order`, {
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

      if (!orderRes.ok) {
        const errData = await orderRes.json().catch(() => ({}));
        throw new Error(errData.detail || `Failed to create order: ${orderRes.status}`);
      }

      const orderData = await orderRes.json();
      console.log('[UsageDashboard] Razorpay order created:', orderData);

      // Step 2: Open Razorpay checkout modal
      const cleanName = (selectedAddon.name || 'Addon').replace(/\s*-?\s*Pro$/i, '').trim();
      let paymentResponse;
      try {
        paymentResponse = await openCheckout({
          orderId: orderData.order_id,
          amount: orderData.amount,
          currency: orderData.currency,
          planName: cleanName,
          userName: user?.name || '',
          userEmail: user?.email || '',
        });
      } catch (checkoutErr: any) {
        setPurchasingAddon(false);
        if (checkoutErr?.message?.includes('cancelled')) {
          const { toast } = await import('sonner');
          toast.info('Payment cancelled');
        } else {
          const { toast } = await import('sonner');
          toast.error(checkoutErr?.message || 'Payment failed');
        }
        return;
      }

      // Step 3: Complete purchase with Razorpay payment credentials
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
          razorpay_payment_id: paymentResponse.razorpay_payment_id,
          razorpay_order_id: paymentResponse.razorpay_order_id,
          razorpay_signature: paymentResponse.razorpay_signature,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Purchase verification failed: ${response.status}`);
      }

      const result = await response.json();
      const totalCredits = (selectedAddon.credit_amount || 0) * addonQuantity;
      console.log('[UsageDashboard] Addon purchase result:', result);
      setAddonPurchaseSuccess(`Successfully added ${totalCredits} Units to your ${cleanName}!`);

      // Queue audit verification for addon purchase (non-blocking)
      try {
        const mod = await import('@/lib/services/auditVerificationService');
        mod.auditVerificationService.storePendingVerification({
          action: 'addon_purchase',
          entity_type: 'addon',
          entity_id: String(selectedAddon.id),
          user_id: user?.id,
          user_email: user?.email,
          timestamp: new Date().toISOString(),
        });
        console.log('[AuditVerification] Queued addon purchase verification');
      } catch (e) { console.warn('[AuditVerification] Failed to queue:', e); }

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
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100/50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200/80 shadow-sm sticky top-0 z-10 backdrop-blur-sm bg-white/95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3 sm:gap-5">
              <div className="w-10 h-10 sm:w-14 sm:h-14 bg-gradient-to-br from-gray-700 to-gray-900 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-gray-300/50 ring-2 sm:ring-4 ring-gray-100">
                <BarChart3 className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">Usage & Quotas</h1>
                <p className="text-sm text-gray-500 mt-1 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Real-time tracking
                  </span>
                  <span className="hidden sm:inline text-gray-300">•</span>
                  <span className="hidden sm:inline">Resume Storage, Scoring, Assessments & AI Interviews</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => refetchQuota()}
                className="p-2.5 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 transition-all hover:scale-105"
                title="Refresh data"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
              <button
                onClick={handleUpgradeClick}
                className="px-5 py-2.5 bg-gradient-to-r from-gray-800 to-gray-900 text-white rounded-xl hover:from-gray-700 hover:to-gray-800 transition-all font-medium flex items-center gap-2 shadow-lg shadow-gray-300/30 hover:shadow-xl hover:shadow-gray-300/40 hover:-translate-y-0.5"
              >
                <TrendingUp className="w-4 h-4" />
                Upgrade Plan
                <ChevronRight className="w-4 h-4" />
              </button>
              {onBack && (
                <button
                  onClick={onBack}
                  className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-all font-medium"
                >
                  Back
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8">
        {/* Subscription Summary Card */}
        {subscriptionSummary && (
          <div className="mb-6 sm:mb-8 bg-white rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100 overflow-hidden">
            {/* Card Header with gradient */}
            <div className="bg-gradient-to-r from-gray-50 to-gray-100/50 px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-100">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <CreditCard className="w-4 h-4" />
                <span>Current Subscription</span>
              </div>
            </div>

            <div className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-6">
                <div className="flex items-start gap-3 sm:gap-5">
                  <div className="w-10 h-10 sm:w-14 sm:h-14 bg-gradient-to-br from-gray-700 to-gray-900 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-gray-300/50 flex-shrink-0">
                    <Zap className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
                      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
                        {subscriptionSummary.plan?.name || 'No Plan'}
                      </h2>
                      {subscriptionSummary.is_trial && (
                        (() => {
                          const remaining = calculateRemainingTime(subscriptionSummary.subscription?.current_period_end);
                          return (
                            <span className="px-3 py-1.5 text-xs font-bold text-gray-700 bg-gray-200 rounded-full animate-pulse">
                              TRIAL {!remaining.isExpired ? `• ${remaining.displayText}` : '• Expired'}
                            </span>
                          );
                        })()
                      )}
                    </div>
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`px-3 py-1 text-xs font-bold rounded-full inline-flex items-center gap-1.5 ${
                        subscriptionSummary.status === 'active'
                          ? 'text-gray-700 bg-gray-200'
                          : subscriptionSummary.status === 'trialing'
                          ? 'text-gray-600 bg-gray-100'
                          : 'text-gray-600 bg-gray-100'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${subscriptionSummary.status === 'active' ? 'bg-gray-600' : 'bg-gray-400'}`}></span>
                        {subscriptionSummary.status?.toUpperCase() || 'UNKNOWN'}
                      </span>
                      {subscriptionSummary.isolation_type && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-full">
                          <Package className="w-3 h-3" />
                          {subscriptionSummary.isolation_type === 'DEDICATED' ? 'Dedicated Server' :
                           subscriptionSummary.isolation_type === 'DATABASE' ? 'Dedicated Database' :
                           subscriptionSummary.isolation_type === 'SCHEMA' ? 'Schema Isolation' :
                           subscriptionSummary.isolation_type}
                        </span>
                      )}
                    </div>
                    {subscriptionSummary.plan?.description && (
                      <p className="text-sm text-gray-500">{subscriptionSummary.plan.description}</p>
                    )}
                  </div>
                </div>

                <div className="text-left sm:text-right bg-gray-50 rounded-xl p-3 sm:p-4 sm:min-w-[200px] w-full sm:w-auto">
                  {subscriptionSummary.is_trial ? (
                    /* Free Trial - show expiry with proper time calculation */
                    (() => {
                      const remaining = calculateRemainingTime(subscriptionSummary.subscription?.current_period_end);
                      return (
                        <>
                          {!remaining.isExpired ? (
                            <div className="text-2xl font-bold text-gray-800">
                              {remaining.displayText}
                            </div>
                          ) : (
                            <div className="text-xl font-bold text-gray-700">
                              Trial Expired
                            </div>
                          )}
                          <p className="text-xs text-gray-500 mt-2">
                            Upgrade to continue using all features
                          </p>
                        </>
                      );
                    })()
                  ) : subscriptionSummary.subscription ? (
                    /* Paid Plan - show price and renewal with proper time calculation */
                    (() => {
                      const remaining = calculateRemainingTime(subscriptionSummary.subscription?.current_period_end);
                      return (
                        <>
                          <div className="text-3xl font-bold text-gray-900">
                            ₹{subscriptionSummary.subscription.price?.toFixed(0) || subscriptionSummary.plan?.price?.toFixed(0) || '0'}
                            <span className="text-sm font-normal text-gray-500">
                              /{subscriptionSummary.subscription.billing_interval || 'mo'}
                            </span>
                          </div>
                          {!remaining.isExpired && (
                            <p className="text-xs text-gray-500 mt-2 flex items-center sm:justify-end gap-1">
                              <Calendar className="w-3 h-3" />
                              Renews in {remaining.displayText}
                            </p>
                          )}
                          {remaining.isExpired && (
                            <p className="text-xs text-red-500 mt-2 flex items-center sm:justify-end gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Plan Expired
                            </p>
                          )}
                        </>
                      );
                    })()
                  ) : null}
                </div>
              </div>

              {/* Plan Features */}
              {subscriptionSummary.plan?.features && Object.keys(subscriptionSummary.plan.features).length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Plan Features</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(subscriptionSummary.plan.features).map(([key, value]) => (
                      <span
                        key={key}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        {key.replace(/_/g, ' ')}: {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quota Summary Cards */}
        {quotaSummary && (
          <div className="mb-8">
            {/* Section Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 sm:w-10 sm:h-10 bg-gray-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-semibold text-gray-900">Quota Overview</h2>
                  <p className="text-xs sm:text-sm text-gray-500">Monitor your resource consumption</p>
                </div>
              </div>
              {quotaSummary.billing_period && (
                <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-500 bg-gray-50 px-3 sm:px-4 py-2 rounded-lg border border-gray-200 self-start sm:self-auto">
                  <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
                  <span className="truncate">{new Date(quotaSummary.billing_period.start).toLocaleDateString()} - {new Date(quotaSummary.billing_period.end).toLocaleDateString()}</span>
                </div>
              )}
            </div>

            {/* Low Quota Warning */}
            {quotaSummary.has_low_quotas && (
              <div className="bg-gradient-to-r from-gray-100 to-gray-50 border-2 border-gray-300 rounded-xl sm:rounded-2xl p-3 sm:p-5 mb-4 sm:mb-6 shadow-sm">
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-200 rounded-xl flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 text-base sm:text-lg">Quota Running Low!</h3>
                    <p className="text-sm text-gray-600 mt-1">Some quotas are below 20%. Purchase add-on units to continue using these features without interruption.</p>
                    {/* Show each low quota with its own Add Credits button */}
                    <div className="flex flex-wrap gap-2 mt-4">
                      {quotaSummary.quotas
                        ?.filter((q: QuotaInfo) => {
                          if (!(q.is_low || q.is_exhausted)) return false;
                          // Hide low quota warnings for features not in the plan
                          const featureKey = quotaFeatureMap[q.quota_type];
                          if (featureKey && !hasPlanFeature(featureKey)) return false;
                          return true;
                        })
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
                                if (isAddonPurchaseBlocked) {
                                  setAddonPurchaseError(
                                    subscriptionSummary?.is_trial
                                      ? 'Addon purchases are only available for paid plans. Please upgrade from your free trial.'
                                      : 'Addon purchases are not available. Please renew your subscription first.'
                                  );
                                  return;
                                }
                                if (matchingAddon) {
                                  handleBuyAddon(matchingAddon);
                                } else {
                                  const addonsSection = document.querySelector('[data-section="addons"]');
                                  if (addonsSection) {
                                    addonsSection.scrollIntoView({ behavior: 'smooth' });
                                  }
                                }
                              }}
                              title={isAddonPurchaseBlocked ? addonBlockedMessage : ""}
                              className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all flex items-center gap-2 shadow-sm hover:shadow-md hover:-translate-y-0.5 ${
                                isAddonPurchaseBlocked
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : quota.is_exhausted
                                    ? 'bg-gray-900 text-white hover:bg-gray-800'
                                    : 'bg-gray-700 text-white hover:bg-gray-600'
                              }`}
                            >
                              <Plus className="w-4 h-4" />
                              Add {quota.name}
                              {quota.is_exhausted && !isAddonPurchaseBlocked && (
                                <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">Exhausted</span>
                              )}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Quota Cards Grid - Dynamic */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-5 mb-6">
              {quotaSummary.quotas?.filter((quota: QuotaInfo) => {
                if (quota.quota_type === 'storage_gb') return false;
                // Gate quota cards by plan feature
                const featureKey = quotaFeatureMap[quota.quota_type];
                if (featureKey && !hasPlanFeature(featureKey)) return false;
                return true;
              }).map((quota: QuotaInfo) => {
                const isUnlimited = quota.limit === -1 || quota.remaining === -1;

                // Icon mapping for quota types
                const quotaIcons: Record<string, React.ReactNode> = {
                  'RU': <Package className="w-5 h-5" />,
                  'RS': <BarChart3 className="w-5 h-5" />,
                  'AS': <CheckCircle2 className="w-5 h-5" />,
                  'AIU': <Sparkles className="w-5 h-5" />,
                  'max_seats': <Zap className="w-5 h-5" />,
                };

                return (
                  <div
                    key={quota.quota_type}
                    className={`bg-white border-2 rounded-2xl p-5 transition-all hover:shadow-lg hover:-translate-y-1 group ${
                      quota.is_exhausted
                        ? 'border-gray-400 shadow-md'
                        : quota.is_low
                          ? 'border-gray-300 shadow-sm'
                          : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {/* Card Header */}
                    <div className="mb-4">
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${
                          quota.is_exhausted
                            ? 'bg-gray-800 text-white'
                            : quota.is_low
                              ? 'bg-gray-200 text-gray-700'
                              : 'bg-gray-100 text-gray-600 group-hover:bg-gray-200'
                        }`}>
                          {quotaIcons[quota.quota_type] || <Zap className="w-5 h-5" />}
                        </div>
                        <span className="text-sm font-semibold text-gray-700 truncate">{quota.name}</span>
                      </div>
                      {isUnlimited && (
                        <span className="inline-block text-[10px] font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">
                          ∞ UNLIMITED
                        </span>
                      )}
                      {!isUnlimited && quota.is_exhausted && (
                        <span className="inline-block text-[10px] font-bold text-white bg-gray-800 px-2 py-0.5 rounded-full animate-pulse">
                          EXHAUSTED
                        </span>
                      )}
                      {!isUnlimited && quota.is_low && !quota.is_exhausted && (
                        <span className="inline-block text-[10px] font-bold text-gray-700 bg-gray-200 px-2 py-0.5 rounded-full">
                          LOW
                        </span>
                      )}
                    </div>

                    {/* Usage Numbers */}
                    <div className="mb-4">
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl sm:text-4xl font-bold text-gray-900 tracking-tight">
                          {isUnlimited ? '∞' : quota.used}
                        </span>
                        <span className="text-sm sm:text-lg text-gray-400 font-medium">
                          / {isUnlimited ? '∞' : quota.limit}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">units used</p>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden mb-3">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isUnlimited
                            ? 'bg-gradient-to-r from-gray-400 to-gray-500'
                            : quota.is_exhausted
                              ? 'bg-gradient-to-r from-gray-700 to-gray-900'
                              : quota.is_low
                                ? 'bg-gradient-to-r from-gray-500 to-gray-600'
                                : 'bg-gradient-to-r from-gray-400 to-gray-500'
                        }`}
                        style={{ width: isUnlimited ? '100%' : `${Math.min(quota.percentage_used, 100)}%` }}
                      />
                    </div>

                    {/* Footer Stats */}
                    <div className="flex items-center justify-between text-xs">
                      <span className={`font-medium ${quota.is_exhausted ? 'text-gray-800' : 'text-gray-600'}`}>
                        {isUnlimited ? 'Unlimited usage' : `${quota.remaining} remaining`}
                      </span>
                      {!isUnlimited && (
                        <span className={`font-semibold px-2 py-0.5 rounded-full ${
                          quota.is_exhausted
                            ? 'bg-gray-800 text-white'
                            : quota.is_low
                              ? 'bg-gray-200 text-gray-700'
                              : 'bg-gray-100 text-gray-600'
                        }`}>
                          {quota.limit <= 0 ? '0' : Math.max(0, 100 - quota.percentage_used).toFixed(0)}% left
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Add-ons Section */}
      <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 pb-8 sm:pb-12" data-section="addons">
        <div className="bg-white rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100 overflow-hidden">
          {/* Section Header */}
          <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-gray-700 to-gray-900 rounded-xl flex items-center justify-center shadow-lg shadow-gray-300/30 flex-shrink-0">
                  <Sparkles className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900">Add-on Units</h2>
                  <p className="text-xs sm:text-sm text-gray-500 mt-0.5">Purchase additional units to extend your quota limits</p>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-full flex-shrink-0">
                <Info className="w-3.5 h-3.5" />
                <span>Valid until plan expiry</span>
              </div>
            </div>
          </div>

          <div className="p-3 sm:p-4 md:p-6">
            {addonsLoading && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mb-4">
                  <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                </div>
                <p className="text-gray-500 font-medium">Loading add-ons...</p>
              </div>
            )}

            {!addonsLoading && addons.length === 0 && (
              <div className="text-center py-12">
                <div className="w-20 h-20 mx-auto mb-4 bg-gray-100 rounded-2xl flex items-center justify-center">
                  <Sparkles className="w-10 h-10 text-gray-300" />
                </div>
                <p className="text-gray-500 font-medium">No add-ons available at the moment.</p>
                <p className="text-sm text-gray-400 mt-1">Check back later for new offerings</p>
              </div>
            )}

            {!addonsLoading && addons.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Reorder addons: Extra Max Jobs before Extra Max Seats, filter by plan features */}
                {[...addons]
                  .filter((addon) => {
                    // Hide addons for features not in the current plan
                    const name = (addon.name || addon.addon_name || '').toLowerCase();
                    if ((name.includes('resume') && name.includes('upload')) || name.includes('resume storage')) return hasPlanFeature('resume_upload');
                    if ((name.includes('resume') && name.includes('scor')) || name.includes('resume scoring')) return hasPlanFeature('resume_scoring');
                    if (name.includes('assessment')) return hasPlanFeature('assessment');
                    if (name.includes('ai') || name.includes('interview')) return hasPlanFeature('ai_interview');
                    return true; // Always show seats, jobs, and other generic addons
                  })
                  .sort((a, b) => {
                    const nameA = (a.name || a.addon_name || '').toLowerCase();
                    const nameB = (b.name || b.addon_name || '').toLowerCase();
                    if (nameA.includes('max jobs') && nameB.includes('max seats')) return -1;
                    if (nameA.includes('max seats') && nameB.includes('max jobs')) return 1;
                    return 0;
                  })
                  .map((addon) => {
                  // Clean addon name: remove "Pro" suffix
                  const displayName = (addon.name || addon.addon_name || 'Credit Pack')
                    .replace(/\s*-?\s*Pro$/i, '')
                    .trim();

                  // Icon mapping for addon types
                  const getAddonIcon = (name: string) => {
                    const lowerName = name.toLowerCase();
                    if (lowerName.includes('resume') && lowerName.includes('upload')) return <Package className="w-6 h-6" />;
                    if (lowerName.includes('resume') && lowerName.includes('scor')) return <BarChart3 className="w-6 h-6" />;
                    if (lowerName.includes('assessment')) return <CheckCircle2 className="w-6 h-6" />;
                    if (lowerName.includes('ai') || lowerName.includes('interview')) return <Sparkles className="w-6 h-6" />;
                    if (lowerName.includes('seat')) return <Zap className="w-6 h-6" />;
                    return <Zap className="w-6 h-6" />;
                  };

                  return (
                    <div
                      key={addon.id}
                      className="group bg-gradient-to-br from-gray-50 to-white rounded-xl sm:rounded-2xl border-2 border-gray-200 p-4 sm:p-5 transition-all hover:border-gray-300 hover:shadow-lg hover:-translate-y-1"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="flex items-start gap-3 sm:gap-4">
                          <div className="w-10 h-10 sm:w-14 sm:h-14 bg-gray-100 rounded-xl flex items-center justify-center text-gray-600 group-hover:bg-gray-200 transition-colors flex-shrink-0">
                            {getAddonIcon(displayName)}
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900 text-base sm:text-lg">
                              {displayName}
                            </h3>
                            <div className="flex items-center gap-3 mt-2">
                              <div className="flex items-center gap-1.5 bg-gray-100 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg">
                                <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-600" />
                                <span className="text-base sm:text-lg font-bold text-gray-900">{addon.credit_amount || addon.min_quantity || 0}</span>
                                <span className="text-xs text-gray-500">units</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="text-left sm:text-right">
                          <div className="text-xl sm:text-2xl font-bold text-gray-900">
                            ₹{(addon.price || addon.unit_price || 0).toLocaleString()}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">one-time purchase</p>
                        </div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <button
                          onClick={() => handleBuyAddon(addon)}
                          disabled={isAddonPurchaseBlocked}
                          title={isAddonPurchaseBlocked ? addonBlockedMessage : ""}
                          className={`w-full px-4 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${
                            isAddonPurchaseBlocked
                              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                              : 'bg-gradient-to-r from-gray-800 to-gray-900 text-white hover:from-gray-700 hover:to-gray-800 shadow-lg shadow-gray-300/30 hover:shadow-xl hover:shadow-gray-300/40'
                          }`}
                        >
                          <ShoppingCart className="w-5 h-5" />
                          {isAddonPurchaseBlocked
                            ? (subscriptionSummary?.status?.toLowerCase() === 'expired' ? 'Renew Plan to Purchase' : 'Upgrade Plan to Purchase')
                            : 'Purchase Now'}
                          {!isAddonPurchaseBlocked && <ChevronRight className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Info */}
          {!addonsLoading && addons.length > 0 && (
            <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 border-t border-gray-100">
              <div className="flex items-center justify-center gap-4 sm:gap-6 text-xs text-gray-500">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-gray-400" />
                  Instant activation
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-gray-400" />
                  Secure payment
                </span>
              </div>
            </div>
          )}
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
                  <option value="RU">Resume Storage (RU)</option>
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-3xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-200 max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="relative px-4 sm:px-6 py-4 sm:py-5 bg-gradient-to-r from-gray-800 to-gray-900">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center flex-shrink-0">
                  <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-white">Purchase Add-on</h2>
                  <p className="text-xs sm:text-sm text-gray-300">Add units to your quota instantly</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowAddonModal(false);
                  setAddonPurchaseError(null);
                  setAddonPurchaseSuccess(null);
                }}
                className="absolute top-3 sm:top-4 right-3 sm:right-4 p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
              {/* Success Message */}
              {addonPurchaseSuccess && (
                <div className="p-3 sm:p-4 bg-gray-100 border-2 border-gray-300 rounded-xl flex items-start gap-2.5 sm:gap-3 animate-in slide-in-from-top duration-200">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gray-800 rounded-full flex items-center justify-center flex-shrink-0">
                    <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm sm:text-base">Purchase Successful!</p>
                    <p className="text-xs sm:text-sm text-gray-600 mt-0.5">{addonPurchaseSuccess}</p>
                  </div>
                </div>
              )}

              {/* Error Message */}
              {addonPurchaseError && (
                <div className="p-3 sm:p-4 bg-gray-100 border-2 border-gray-300 rounded-xl flex items-start gap-2.5 sm:gap-3">
                  <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gray-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 text-sm sm:text-base">Purchase Failed</p>
                    <p className="text-xs sm:text-sm text-gray-600 mt-0.5">{addonPurchaseError}</p>
                  </div>
                </div>
              )}

              {/* Addon Details Card */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 border-2 border-gray-200 rounded-2xl p-3.5 sm:p-5">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-11 h-11 sm:w-14 sm:h-14 bg-white rounded-xl flex items-center justify-center shadow-sm border border-gray-200 flex-shrink-0">
                    <Zap className="w-5 h-5 sm:w-7 sm:h-7 text-gray-700" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-bold text-gray-900 text-base sm:text-lg truncate">
                      {(selectedAddon.name || selectedAddon.addon_name || 'Credit Pack').replace(/\s*-?\s*Pro$/i, '').trim()}
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
                      {selectedAddon.credit_amount || 0} units per pack
                    </p>
                  </div>
                </div>
              </div>

              {/* Quantity Selector */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Select Quantity
                </label>
                <div className="flex items-center gap-2 sm:gap-4">
                  <button
                    onClick={() => setAddonQuantity(Math.max(1, addonQuantity - 1))}
                    className="w-10 h-10 sm:w-12 sm:h-12 border-2 border-gray-300 rounded-xl flex items-center justify-center hover:bg-gray-100 hover:border-gray-400 transition-all font-bold text-xl text-gray-600 flex-shrink-0"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min="1"
                    max={100}
                    value={addonQuantity}
                    onChange={(e) => setAddonQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 sm:w-24 text-center px-2 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-300 rounded-xl focus:ring-2 focus:ring-gray-500 focus:border-gray-500 font-bold text-xl sm:text-2xl text-black"
                  />
                  <button
                    onClick={() => setAddonQuantity(Math.min(100, addonQuantity + 1))}
                    className="w-10 h-10 sm:w-12 sm:h-12 border-2 border-gray-300 rounded-xl flex items-center justify-center hover:bg-gray-100 hover:border-gray-400 transition-all font-bold text-xl text-gray-600 flex-shrink-0"
                  >
                    +
                  </button>
                  <div className="flex-1 text-right min-w-0">
                    <span className="text-xs text-gray-500">Price per pack</span>
                    <p className="font-bold text-gray-900">₹{selectedAddon.price || selectedAddon.unit_price || 0}</p>
                  </div>
                </div>
              </div>

              {/* Order Summary */}
              <div className="bg-gray-50 border-2 border-gray-200 rounded-2xl overflow-hidden">
                <div className="px-4 sm:px-5 py-2.5 sm:py-3 border-b border-gray-200 bg-gray-100">
                  <h4 className="font-semibold text-gray-700 text-xs sm:text-sm">Order Summary</h4>
                </div>
                <div className="p-3.5 sm:p-5 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Pack size</span>
                    <span className="font-medium text-gray-900">{selectedAddon.credit_amount || 0} units</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Quantity</span>
                    <span className="font-medium text-gray-900">×{addonQuantity}</span>
                  </div>
                  <div className="h-px bg-gray-200 my-3"></div>
                  <div className="flex justify-between items-center bg-gray-800 text-white p-3 sm:p-4 rounded-xl -mx-1">
                    <div>
                      <span className="text-xs sm:text-sm text-gray-300">Units to be added</span>
                      <p className="text-2xl sm:text-3xl font-bold">+{(selectedAddon.credit_amount || 0) * addonQuantity}</p>
                    </div>
                    <Zap className="w-8 h-8 sm:w-10 sm:h-10 text-gray-400" />
                  </div>
                  <div className="h-px bg-gray-200 my-3"></div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-600">Subtotal</span>
                    <span className="font-medium text-gray-900">
                      ₹{((selectedAddon.price || selectedAddon.unit_price || 0) * addonQuantity).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-sm mt-1">
                    <span className="text-gray-600">GST (18%)</span>
                    <span className="font-medium text-gray-900">
                      ₹{Math.round((selectedAddon.price || selectedAddon.unit_price || 0) * addonQuantity * 0.18).toLocaleString()}
                    </span>
                  </div>
                  <div className="h-px bg-gray-200 my-3"></div>
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-900">Total Amount</span>
                    <span className="text-2xl sm:text-3xl font-bold text-gray-900">
                      ₹{((selectedAddon.price || selectedAddon.unit_price || 0) * addonQuantity + Math.round((selectedAddon.price || selectedAddon.unit_price || 0) * addonQuantity * 0.18)).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-6 border-t border-gray-200 bg-gray-50">
              <div className="flex gap-2.5 sm:gap-3">
                <button
                  onClick={() => {
                    setShowAddonModal(false);
                    setAddonPurchaseError(null);
                    setAddonPurchaseSuccess(null);
                  }}
                  className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 border-2 border-gray-300 rounded-xl text-gray-700 font-semibold text-sm sm:text-base hover:bg-gray-100 hover:border-gray-400 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePurchaseAddon}
                  disabled={purchasingAddon || razorpayProcessing || !!addonPurchaseSuccess}
                  className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 bg-gradient-to-r from-gray-800 to-gray-900 text-white rounded-xl font-semibold text-sm sm:text-base hover:from-gray-700 hover:to-gray-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 sm:gap-2 shadow-lg shadow-gray-300/30"
                >
                  {purchasingAddon || razorpayProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                      <span className="truncate">Processing...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
                      <span className="truncate">Pay & Purchase</span>
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
