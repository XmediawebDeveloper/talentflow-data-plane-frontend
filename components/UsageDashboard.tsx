'use client';

import PageBreadcrumb from '@/components/PageBreadcrumb';
import { TrendingUp, Zap, Calendar, Clock, DollarSign, X, AlertCircle, CheckCircle2, Loader2, AlertTriangle, ArrowUpRight, Plus, Send, Sparkles, ShoppingCart, RefreshCw, ChevronRight, BarChart3, Package, CreditCard, Info } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
// QuotaDisplay was an earlier inline widget that has since been folded into the
// Quota Overview cards rendered below. The import is intentionally not
// reinstated because the component is no longer in the tree.
import { useQuota } from '@/contexts/QuotaContext';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRazorpay } from '@/lib/hooks/useRazorpay';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';
import { PlanFeatureKey } from '@/lib/types/planFeatures';
import { formatISTDate } from '@/lib/utils/dateUtils';
import api from '@/lib/services/api';
import { useScrollRestoration } from '@/lib/hooks/useListViewPersistence';

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
  is_exceeded: boolean;          // sub.used > sub.limit (plan quota exceeded)
  is_exceeded_critical: boolean; // exceeded AND no remaining coverage (addon also exhausted)
  exceeded_by: number;           // sub.used - sub.limit (units over the plan limit)
  // Breakdown: plan vs addon
  subscription_limit: number;
  subscription_used: number;
  subscription_remaining: number;
  addon_purchased: number;
  addon_consumed: number;
  addon_remaining: number;
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

// Format a number without unnecessary trailing decimals (8.5 → "8.5", 10.0 → "10", 6.5 → "6.5")
function formatNum(n: number): string {
  return Number.isInteger(n) ? n.toString() : parseFloat(n.toFixed(2)).toString();
}

export default function UsageDashboard({ onBack }: UsageDashboardProps) {
  // Use shared QuotaContext instead of making duplicate API calls
  const { quotaData: contextQuotaData, loading: quotaLoading, error: quotaError, hasPermission, refetch: refetchQuota } = useQuota();
  // Get user from AuthContext (already fetched during login)
  const { user, hasPermission: authHasPermission } = useAuth();
  const canUpgradePlan = authHasPermission('canUpgradePlan');
  const canExportUsage = authHasPermission('canExportUsage');
  const canPurchaseAddons = canUpgradePlan;
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
  const [paymentCaptured, setPaymentCaptured] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

  // Expired plan credits — fetched when subscription is expired/inactive
  const [expiredPlanCredits, setExpiredPlanCredits] = useState<Record<string, number> | null>(null);
  const [expiredPlanName, setExpiredPlanName] = useState<string | null>(null);

  // Fetch previous-plan data when plan is expired
  useEffect(() => {
    const tenantId = contextQuotaData?.tenant_id;
    const status = (contextQuotaData?.subscription_status || '').toLowerCase();
    const isExpired = ['expired', 'inactive', 'suspended'].includes(status);
    if (!tenantId || !isExpired) return;

    api.get(`/subscription/${tenantId}/previous-plan`)
      .then(res => {
        const data = res.data?.data || res.data;
        const expiredPlan = data?.expired_plan;
        if (expiredPlan) {
          if (expiredPlan.plan_name) setExpiredPlanName(expiredPlan.plan_name.replace(/\s*\(.*?\)\s*/g, '').trim());
          if (expiredPlan.credits) setExpiredPlanCredits(expiredPlan.credits);
          console.log('[UsageDashboard] Loaded expired plan:', expiredPlan.plan_name, expiredPlan.credits);
        }
      })
      .catch(err => console.warn('[UsageDashboard] Could not load previous-plan:', err));
  }, [contextQuotaData?.tenant_id, contextQuotaData?.subscription_status]);

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

    const isExpiredPlan = ['expired', 'inactive', 'suspended'].includes(
      (contextQuotaData.subscription_status || '').toLowerCase()
    );

    for (const quotaType of sortedQuotaTypes) {
      const q = quotasMap[quotaType as keyof typeof quotasMap];
      if (q) {
        // NOT_PROVISIONED means the feature is not available for this tenant — skip entirely
        // EXCEPTION: for expired plans, show quotas that have actual usage (historical view)
        if (q.status === 'NOT_PROVISIONED' && !isExpiredPlan) continue;
        if (q.status === 'NOT_PROVISIONED' && isExpiredPlan && (q.subscription?.used || 0) === 0) continue;

        const sub: { limit?: number | string; used?: number } = q.subscription || {};
        const addon: {
          total_purchased?: number;
          total_consumed?: number;
          status?: string;
          expires_on?: string | null;
          days_until_expiry?: number;
        } = q.addon || {};

        // For expired plans: use original plan credits as the limit if the API returns 0/null
        const creditLimit = isExpiredPlan ? (expiredPlanCredits?.[quotaType] ?? null) : null;
        const effectiveLimit = (creditLimit !== null && (sub.limit === 0 || sub.limit == null || sub.limit === ''))
          ? creditLimit
          : sub.limit;

        const isUnlimited = effectiveLimit === 'unlimited' || effectiveLimit === -1;

        // Subscription breakdown values
        const subLimit = isUnlimited ? -1 : (typeof effectiveLimit === 'number' ? effectiveLimit : 0);
        const subUsed = sub.used || 0;
        // sub.remaining removed from API — derive it
        const subRemaining = isUnlimited ? -1 : Math.max(0, subLimit - subUsed);

        // Addon breakdown values — addon.remaining removed from API, derive from purchased - consumed
        const addonPurchased = typeof addon.total_purchased === 'number' ? addon.total_purchased : 0;
        const addonConsumed = typeof addon.total_consumed === 'number' ? addon.total_consumed : 0;
        const addonRemaining = Math.max(0, addonPurchased - addonConsumed);

        // Combined totals
        const limit = isUnlimited ? -1 : (subLimit + addonPurchased);
        // total_remaining is now the single source of truth from the backend (unified pool)
        const remaining = isUnlimited ? -1 : (
          typeof q.total_remaining === 'number' ? Math.max(0, q.total_remaining) : Math.max(0, subRemaining + addonRemaining)
        );
        // In the unified pool model, sub.used tracks TOTAL consumption (subscription + addon overflow).
        // addon.consumed is a subset — how much of that total came from addon credits. Don't double-count.
        const used = isUnlimited ? 0 : subUsed;
        const usagePercentage = isUnlimited ? 0 : (limit > 0 ? (used / limit) * 100 : 0);

        const hasQuota = limit > 0;
        // Exceeded: API status = EXCEEDED AND used is genuinely over the limit (not just exactly at it)
        const isExceeded = q.status === 'EXCEEDED' && used > limit;
        const exceededBy = isExceeded ? Math.max(0, used - limit) : 0;
        const isExceededCritical = isExceeded;
        // Exhausted: remaining is zero but API hasn't marked EXCEEDED (edge case)
        const isExhausted = hasQuota && !isUnlimited && !isExceeded && remaining <= 0;
        // Low: API signals APPROACHING / WARNING / CRITICAL, or local fallback ≥80%
        const isLow = hasQuota && !isUnlimited && !isExhausted && !isExceeded &&
          (q.status === 'APPROACHING' || q.status === 'WARNING' || q.status === 'CRITICAL' || usagePercentage >= 80);

        quotasList.push({
          quota_type: quotaType,
          name: quotaTypeToModuleMap[quotaType] || quotaType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          limit: limit,
          used: used,
          remaining: remaining,
          percentage_used: usagePercentage,
          is_low: isLow,
          is_exhausted: isExhausted,
          is_exceeded: isExceeded,
          is_exceeded_critical: isExceededCritical,
          exceeded_by: exceededBy,
          subscription_limit: subLimit,
          subscription_used: Math.max(0, subUsed - addonConsumed),
          subscription_remaining: subRemaining,
          addon_purchased: addonPurchased,
          addon_consumed: addonConsumed,
          addon_remaining: addonRemaining,
        });
      }
    }

    const hasLowQuotas = quotasList.some(q => q.is_low || q.is_exhausted || q.is_exceeded);
    const lowQuotaTypes = quotasList.filter(q => q.is_low || q.is_exhausted || q.is_exceeded).map(q => q.name);

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
  }, [contextQuotaData, expiredPlanCredits]);

  // Derive subscriptionSummary from context data
  const subscriptionSummary = useMemo((): SubscriptionSummary | null => {
    void expiredPlanName; // reactive dependency
    if (!contextQuotaData) return null;

    const isTrial = contextQuotaData.is_trial || false;
    const basePrice = isTrial ? 0 : (contextQuotaData.plan_info?.subscribed_price ?? 0);
    const billingInterval = contextQuotaData.plan_info?.billing_period?.toLowerCase() || 'month';

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
        name: expiredPlanName
          || (contextQuotaData.plan_name && contextQuotaData.plan_name.toLowerCase() !== 'no plan' ? contextQuotaData.plan_name : null)
          || contextQuotaData.plan_info?.plan_name
          || (isTrial ? 'Free Trial' : 'Professional'),
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
  }, [contextQuotaData, expiredPlanName]);

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

  // Scroll-only persistence: dashboard has no list filters/pagination to restore.
  const rootRef = useScrollRestoration<HTMLElement>('sub-usage-quotas', !loading);

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
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 animate-pulse items-center justify-center rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal shadow-lg shadow-brand-blue/25 ring-4 ring-brand-blue/10">
            <BarChart3 className="h-10 w-10 text-white" />
          </div>
          <div className="mb-2 flex items-center justify-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-brand-blue" />
            <span className="text-lg font-semibold text-gray-900 dark:text-slate-50">Loading Usage Data</span>
          </div>
          <p className="text-sm text-gray-500 dark:text-slate-500">Fetching your quota information...</p>
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
    setPaymentCaptured(false);

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

      // Payment captured — mark so we can show the right error if backend fails
      setPaymentCaptured(true);

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
          payment_method: 'razorpay',
          razorpay_payment_id: paymentResponse.razorpay_payment_id,
          razorpay_order_id: paymentResponse.razorpay_order_id,
          razorpay_signature: paymentResponse.razorpay_signature,
          // Send addon details so backend skips the second admin API call
          addon_name: selectedAddon.name,
          addon_credit_type: selectedAddon.credit_type,
          addon_credit_amount: selectedAddon.credit_amount,
          addon_price: selectedAddon.price || selectedAddon.unit_price || 0,
        }),
      });

      if (!response.ok) {
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('Service temporarily unavailable. Your payment was not charged. Please try again.');
        }
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Purchase verification failed: ${response.status}`);
      }

      const result = await response.json();
      const totalCredits = (selectedAddon.credit_amount || 0) * addonQuantity;
      console.log('[UsageDashboard] Addon purchase result:', result);

      if (result.status === 'pending') {
        setAddonPurchaseSuccess('Payment received! Your credits are being activated in the background and will appear shortly.');
        return;
      }

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
    <main ref={rootRef} className="flex-1 bg-white dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Current Plan', href: '/subscription/current-plan' }, { label: 'Usage & Quotas' }]} />

        <div className="space-y-6">
        {/* Subscription Summary Card */}
        {subscriptionSummary && (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100 dark:border-slate-700/60 overflow-hidden">
            {/* Card Header with gradient */}
            <div className="border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 sm:px-6 py-3 sm:py-4">
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-400">
                <CreditCard className="h-4 w-4 text-brand-blue" />
                <span className="font-medium">Current Subscription</span>
              </div>
            </div>

            <div className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-6">
                <div className="flex items-start gap-3 sm:gap-5">
                  <div className="w-10 h-10 sm:w-14 sm:h-14 bg-brand-blue rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-brand-blue/20 flex-shrink-0">
                    <Zap className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 sm:gap-3 mb-2 flex-wrap">
                      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-slate-50 tracking-tight">
                        {subscriptionSummary.plan?.name || 'No Plan'}
                      </h2>
                      {subscriptionSummary.is_trial && (
                        (() => {
                          const remaining = calculateRemainingTime(subscriptionSummary.subscription?.current_period_end);
                          return (
                            <span className="px-3 py-1.5 text-xs font-bold text-gray-700 dark:text-slate-300 bg-gray-200 dark:bg-slate-800 rounded-full animate-pulse">
                              TRIAL {!remaining.isExpired ? `• ${remaining.displayText}` : '• Expired'}
                            </span>
                          );
                        })()
                      )}
                    </div>
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`px-3 py-1 text-xs font-bold rounded-full inline-flex items-center gap-1.5 ${
                        subscriptionSummary.status === 'active'
                          ? 'text-gray-700 dark:text-slate-300 bg-gray-200 dark:bg-slate-800'
                          : subscriptionSummary.status === 'trialing'
                          ? 'text-gray-600 dark:text-slate-400 bg-gray-100 dark:bg-slate-800'
                          : 'text-gray-600 dark:text-slate-400 bg-gray-100 dark:bg-slate-800'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${subscriptionSummary.status === 'active' ? 'bg-gray-600' : 'bg-gray-400'}`}></span>
                        {subscriptionSummary.status?.toUpperCase() || 'UNKNOWN'}
                      </span>
                      {subscriptionSummary.isolation_type && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-gray-600 dark:text-slate-400 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-full">
                          <Package className="w-3 h-3" />
                          {subscriptionSummary.isolation_type === 'DEDICATED' ? 'Dedicated Server' :
                           subscriptionSummary.isolation_type === 'DATABASE' ? 'Dedicated Database' :
                           subscriptionSummary.isolation_type === 'SCHEMA' ? 'Schema Isolation' :
                           subscriptionSummary.isolation_type}
                        </span>
                      )}
                    </div>
                    {subscriptionSummary.plan?.description && (
                      <p className="text-sm text-gray-500 dark:text-slate-500">{subscriptionSummary.plan.description}</p>
                    )}
                  </div>
                </div>

                <div className="text-left sm:text-right bg-gray-50 dark:bg-slate-800/50 rounded-xl p-3 sm:p-4 sm:min-w-[200px] w-full sm:w-auto">
                  {subscriptionSummary.is_trial ? (
                    /* Free Trial - show expiry with proper time calculation */
                    (() => {
                      const remaining = calculateRemainingTime(subscriptionSummary.subscription?.current_period_end);
                      return (
                        <>
                          {!remaining.isExpired ? (
                            <div className="text-2xl font-bold text-gray-800 dark:text-slate-100">
                              {remaining.displayText}
                            </div>
                          ) : (
                            <div className="text-xl font-bold text-gray-700 dark:text-slate-300">
                              Trial Expired
                            </div>
                          )}
                          <p className="text-xs text-gray-500 dark:text-slate-500 mt-2">
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
                          <div className="text-3xl font-bold text-gray-900 dark:text-slate-50">
                            ₹{(subscriptionSummary.subscription.price ?? subscriptionSummary.plan?.price ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            <span className="text-sm font-normal text-gray-500 dark:text-slate-500">
                              /{subscriptionSummary.subscription.billing_interval === 'monthly' ? 'month' : subscriptionSummary.subscription.billing_interval === 'yearly' ? 'year' : (subscriptionSummary.subscription.billing_interval || 'mo')}
                            </span>
                          </div>
                          {!remaining.isExpired && (
                            <p className="text-xs text-gray-500 dark:text-slate-500 mt-2 flex items-center sm:justify-end gap-1">
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
                <div className="mt-6 pt-6 border-t border-gray-100 dark:border-slate-700/60">
                  <h4 className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-3">Plan Features</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(subscriptionSummary.plan.features).map(([key, value]) => (
                      <span
                        key={key}
                        className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-slate-400 bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100 dark:border-slate-700/60 overflow-hidden">
            {/* Section Header */}
            <div className="border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 sm:px-6 py-3 sm:py-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Zap className="w-4 h-4 text-brand-blue" />
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50 tracking-tight">Quota Overview</h2>
                    <p className="text-xs text-gray-500 dark:text-slate-500">Monitor your resource consumption</p>
                  </div>
                </div>
                {quotaSummary.billing_period && (
                  <div className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-slate-500 bg-white dark:bg-slate-800 ring-1 ring-gray-200 dark:ring-slate-700 px-2.5 py-1 rounded-full self-start sm:self-auto">
                    <Calendar className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{formatISTDate(quotaSummary.billing_period.start)} – {formatISTDate(quotaSummary.billing_period.end)}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 sm:p-6">
            {/* Low Quota Warning — hide for expired/inactive plans */}
            {quotaSummary.has_low_quotas && !['expired', 'inactive', 'suspended'].includes(subscriptionSummary?.status?.toLowerCase() || '') && (
              <div className="mb-3 rounded-xl border border-brand-orange/20 bg-brand-orange/[0.06] p-3 ring-1 ring-brand-orange/10">
                <div className="flex items-start gap-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-orange/15 text-brand-orange-deep ring-1 ring-brand-orange/15">
                    <AlertTriangle className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-brand-orange-deep">Quota Running Low</h3>
                    <p className="mt-0.5 text-xs text-gray-600 dark:text-slate-400">Some quotas are below 20%. Purchase add-on units to continue without interruption.</p>
                    {/* Show each low quota with its own Add Credits button */}
                    <div className="flex flex-wrap gap-2 mt-4">
                      {quotaSummary.quotas
                        ?.filter((q: QuotaInfo) => {
                          if (!(q.is_low || q.is_exhausted || q.is_exceeded)) return false;
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
                                if (!canPurchaseAddons) {
                                  return;
                                }
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
                              disabled={!canPurchaseAddons}
                              title={!canPurchaseAddons ? 'You do not have permission to purchase add-ons' : isAddonPurchaseBlocked ? addonBlockedMessage : ""}
                              className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 ring-1 ${
                                !canPurchaseAddons
                                  ? 'bg-gray-200 text-gray-500 ring-gray-300 cursor-not-allowed'
                                  : isAddonPurchaseBlocked
                                  ? 'bg-gray-200 text-gray-500 ring-gray-300 cursor-not-allowed'
                                  : quota.is_exceeded_critical
                                    ? 'bg-red-600 text-white ring-red-700 hover:bg-red-700'
                                    : quota.is_exceeded
                                      ? 'bg-brand-orange text-white ring-brand-orange-deep hover:bg-brand-orange-deep'
                                      : quota.is_exhausted
                                      ? 'bg-brand-blue text-white ring-white/10 shadow-sm shadow-brand-blue/25'
                                      : 'bg-white text-gray-700 ring-gray-300 hover:bg-brand-blue/5 hover:text-brand-blue hover:ring-brand-blue/30'
                              }`}
                            >
                              <Plus className="w-3 h-3" />
                              {canPurchaseAddons ? `Add ${quota.name}` : `${quota.name} Read Only`}
                              {quota.is_exceeded && canPurchaseAddons && !isAddonPurchaseBlocked && (
                                <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full">+{formatNum(quota.exceeded_by)} over</span>
                              )}
                              {quota.is_exhausted && canPurchaseAddons && !isAddonPurchaseBlocked && (
                                <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded-full">Exhausted</span>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-3">
              {quotaSummary.quotas?.filter((quota: QuotaInfo) => {
                if (quota.quota_type === 'storage_gb') return false;
                // Gate quota cards by plan feature — but always show for expired/inactive plans (historical usage view)
                const isExpiredOrInactive = ['expired', 'inactive', 'suspended'].includes(
                  subscriptionSummary?.status?.toLowerCase() || ''
                );
                if (!isExpiredOrInactive) {
                  const featureKey = quotaFeatureMap[quota.quota_type];
                  if (featureKey && !hasPlanFeature(featureKey)) return false;
                }
                return true;
              }).map((quota: QuotaInfo) => {
                const isUnlimited = quota.limit === -1 || quota.remaining === -1;

                // Icon mapping for quota types
                const quotaIcons: Record<string, React.ReactNode> = {
                  'RU': <Package className="w-4 h-4" />,
                  'RS': <BarChart3 className="w-4 h-4" />,
                  'AS': <CheckCircle2 className="w-4 h-4" />,
                  'AIU': <Sparkles className="w-4 h-4" />,
                  'max_seats': <Zap className="w-4 h-4" />,
                };

                // Status pill — exactly one wins per card
                const statusPill = isUnlimited
                  ? { label: '∞ Unlimited', cls: 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 ring-gray-200 dark:ring-slate-700' }
                  : quota.is_exceeded_critical
                  ? { label: 'Exceeded', cls: 'bg-red-50 text-red-600 ring-red-200' }
                  : quota.is_exceeded
                  ? { label: 'Exceeded', cls: 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20' }
                  : quota.is_exhausted
                  ? { label: 'Exhausted', cls: 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20' }
                  : quota.is_low
                  ? { label: 'Low', cls: 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400 ring-gray-200 dark:ring-slate-700' }
                  : null;

                return (
                  <div
                    key={quota.quota_type}
                    className={`flex flex-col rounded-xl border bg-white dark:bg-slate-900 p-3 shadow-sm transition-all hover:shadow-md ${
                      quota.is_exceeded_critical
                        ? 'border-red-200 hover:border-red-300'
                        : quota.is_exceeded || quota.is_exhausted
                          ? 'border-brand-orange/30 hover:border-brand-orange/40'
                          : 'border-gray-200 dark:border-slate-700/60 hover:border-brand-blue/30'
                    }`}
                  >
                    {/* Header: icon + name + status chip */}
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ring-1 ${
                        quota.is_exceeded_critical
                          ? 'bg-red-50 text-red-600 ring-red-200'
                          : quota.is_exceeded || quota.is_exhausted
                            ? 'bg-brand-orange/10 text-brand-orange-deep ring-brand-orange/20'
                            : 'bg-brand-blue/10 text-brand-blue ring-brand-blue/15'
                      }`}>
                        {quotaIcons[quota.quota_type] || <Zap className="w-4 h-4" />}
                      </div>
                      <span className="text-xs font-semibold text-gray-700 dark:text-slate-300 truncate flex-1 min-w-0" title={quota.name}>{quota.name}</span>
                      {statusPill && (
                        <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full ring-1 whitespace-nowrap ${statusPill.cls}`}>
                          {statusPill.label}
                        </span>
                      )}
                    </div>

                    {/* Usage numbers + % left chip */}
                    <div className="flex items-baseline justify-between gap-2 mb-2">
                      <div className="flex items-baseline gap-1 min-w-0">
                        <span className={`text-lg sm:text-xl font-semibold tabular-nums tracking-tight ${
                          quota.is_exceeded_critical ? 'text-red-600' : quota.is_exceeded ? 'text-brand-orange-deep' : 'text-gray-900 dark:text-slate-50'
                        }`}>
                          {isUnlimited ? '∞' : formatNum(quota.used)}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-slate-500 font-medium tabular-nums">
                          / {isUnlimited ? '∞' : formatNum(quota.limit)}
                        </span>
                      </div>
                      {!isUnlimited && !quota.is_exceeded && (
                        <span className="text-[10px] font-semibold text-gray-600 dark:text-slate-400 tabular-nums">
                          {quota.limit <= 0 ? '0%' : `${Math.max(0, 100 - quota.percentage_used).toFixed(0)}%`} left
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800 mb-2">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isUnlimited
                            ? 'bg-brand-cyan'
                            : quota.is_exceeded_critical
                              ? 'bg-red-500'
                              : quota.is_exceeded || quota.is_exhausted
                                ? 'bg-brand-orange'
                                : quota.is_low
                                  ? 'bg-brand-orange'
                                  : 'bg-brand-blue'
                        }`}
                        style={{ width: isUnlimited ? '100%' : `${Math.min(quota.percentage_used, 100)}%` }}
                      />
                    </div>

                    {/* Remaining footer */}
                    <p className={`text-[11px] font-medium mb-2 ${
                      quota.is_exceeded_critical ? 'text-red-600' : quota.is_exceeded ? 'text-brand-orange-deep' : 'text-gray-500 dark:text-slate-500'
                    }`}>
                      {isUnlimited ? 'Unlimited usage' : `${formatNum(quota.remaining)} remaining`}
                    </p>

                    {/* Plan vs Add-on breakdown — single condensed row */}
                    {!isUnlimited && (
                      <div className="mt-auto pt-2 border-t border-gray-100 dark:border-slate-700/60 grid grid-cols-2 gap-2 text-[11px]">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500 dark:text-slate-500">Plan</span>
                          <span className="font-semibold text-gray-700 dark:text-slate-300 tabular-nums">{formatNum(quota.subscription_limit)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-500 dark:text-slate-500">Add-on</span>
                          <span className={`font-semibold tabular-nums ${quota.addon_purchased > 0 ? 'text-gray-700 dark:text-slate-300' : 'text-gray-400 dark:text-slate-500'}`}>
                            {quota.addon_purchased > 0 ? formatNum(quota.addon_purchased) : '—'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </div>
          </div>
        )}

        {/* Add-ons Section */}
        {canPurchaseAddons && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-100 dark:border-slate-700/60 overflow-hidden" data-section="addons">
          {/* Section Header */}
          <div className="border-b border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 px-4 sm:px-6 py-3 sm:py-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-brand-blue rounded-lg flex items-center justify-center shadow-sm shadow-brand-blue/20 flex-shrink-0 ring-1 ring-white/10">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-slate-50 tracking-tight">Add-on Units</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-500">Purchase additional units to extend your quota limits</p>
                </div>
              </div>
              <div className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-slate-500 bg-white dark:bg-slate-800 ring-1 ring-gray-200 dark:ring-slate-700 px-2.5 py-1 rounded-full flex-shrink-0">
                <Info className="w-3 h-3" />
                <span>Valid until plan expiry</span>
              </div>
            </div>
          </div>

          {/* Trial banner */}
          {isAddonPurchaseBlocked && subscriptionSummary?.is_trial && (
            <div className="mx-4 sm:mx-6 mt-4 mb-1 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800">Add-on Units — Not Available on Free Trial</p>
                <p className="text-sm text-amber-700 mt-0.5">
                  Purchasing add-on units is only available for paid subscriptions. Upgrade your plan to unlock this feature.
                </p>
              </div>
              <button
                onClick={handleUpgradeClick}
                className="flex-shrink-0 flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                Upgrade <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Expired plan banner */}
          {isAddonPurchaseBlocked && !subscriptionSummary?.is_trial && (subscriptionSummary?.status?.toLowerCase() === 'expired' || subscriptionSummary?.status?.toLowerCase() === 'inactive') && (
            <div className="mx-4 sm:mx-6 mt-4 mb-1 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3.5">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-red-800">Add-on Purchase Unavailable — Plan Expired</p>
                <p className="text-sm text-red-700 mt-0.5">
                  Renew your subscription to purchase add-on units.
                </p>
              </div>
              <button
                onClick={handleUpgradeClick}
                className="flex-shrink-0 flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
              >
                Renew Plan <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="p-3 sm:p-4 md:p-6">
            {addonsLoading && (
              <div className="flex flex-col items-center justify-center py-12 tf-loader-center">
                <div className="w-16 h-16 bg-gray-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mb-4">
                  <Loader2 className="w-8 h-8 text-gray-400 dark:text-slate-500 animate-spin" />
                </div>
                <p className="text-gray-500 dark:text-slate-500 font-medium">Loading add-ons...</p>
              </div>
            )}

            {!addonsLoading && addons.length === 0 && (
              <div className="text-center py-12">
                <div className="w-20 h-20 mx-auto mb-4 bg-gray-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center">
                  <Sparkles className="w-10 h-10 text-gray-300" />
                </div>
                <p className="text-gray-500 dark:text-slate-500 font-medium">No add-ons available at the moment.</p>
                <p className="text-sm text-gray-400 dark:text-slate-500 mt-1">Check back later for new offerings</p>
              </div>
            )}

            {!addonsLoading && addons.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
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
                    if (lowerName.includes('resume') && lowerName.includes('upload')) return <Package className="w-4 h-4" />;
                    if (lowerName.includes('resume') && lowerName.includes('scor')) return <BarChart3 className="w-4 h-4" />;
                    if (lowerName.includes('assessment')) return <CheckCircle2 className="w-4 h-4" />;
                    if (lowerName.includes('ai') || lowerName.includes('interview')) return <Sparkles className="w-4 h-4" />;
                    if (lowerName.includes('seat')) return <Zap className="w-4 h-4" />;
                    return <Zap className="w-4 h-4" />;
                  };

                  return (
                    <div
                      key={addon.id}
                      className="group flex flex-col rounded-xl border border-gray-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-3 shadow-sm transition-all hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10"
                    >
                      {/* Header: icon + name */}
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 bg-brand-blue/10 ring-1 ring-brand-blue/15 rounded-lg flex items-center justify-center text-brand-blue flex-shrink-0">
                          {getAddonIcon(displayName)}
                        </div>
                        <h3 className="font-semibold text-gray-900 dark:text-slate-50 text-sm truncate flex-1 min-w-0" title={displayName}>
                          {displayName}
                        </h3>
                      </div>

                      {/* Units + Price row */}
                      <div className="flex items-baseline justify-between gap-2 mb-3">
                        <div className="inline-flex items-center gap-1 text-xs text-gray-600 dark:text-slate-400">
                          <Zap className="w-3 h-3 text-brand-blue" />
                          <span className="font-semibold text-gray-900 dark:text-slate-50 tabular-nums">{addon.credit_amount || addon.min_quantity || 0}</span>
                          <span>units</span>
                        </div>
                        <div className="text-right">
                          <span className="text-base font-bold text-gray-900 dark:text-slate-50 tabular-nums">
                            ₹{(addon.price || addon.unit_price || 0).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-gray-400 dark:text-slate-500 ml-1">one-time</span>
                        </div>
                      </div>

                      {/* Purchase button */}
                      <button
                        onClick={() => handleBuyAddon(addon)}
                        disabled={isAddonPurchaseBlocked}
                        title={isAddonPurchaseBlocked ? addonBlockedMessage : ""}
                        className={`mt-auto w-full px-3 py-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                          isAddonPurchaseBlocked
                            ? 'bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 cursor-not-allowed'
                            : 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 hover:bg-brand-blue-2'
                        }`}
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        {isAddonPurchaseBlocked
                          ? (subscriptionSummary?.status?.toLowerCase() === 'expired' ? 'Renew Plan' : 'Upgrade Plan')
                          : 'Purchase Now'}
                        {!isAddonPurchaseBlocked && <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Info */}
          {!addonsLoading && addons.length > 0 && (
            <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-100 dark:border-slate-700/60">
              <div className="flex items-center justify-center gap-4 sm:gap-6 text-xs text-gray-500 dark:text-slate-500">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                  Instant activation
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-gray-400 dark:text-slate-500" />
                  Secure payment
                </span>
              </div>
            </div>
          )}
        </div>
        )}
        </div>
      </div>
      </div>

      {/* Record Usage Modal */}
      {showRecordModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 sm:p-6">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 max-w-[95vw] sm:max-w-md w-full max-h-[calc(100dvh-2rem)] flex flex-col">
            <div className="p-6 border-b border-gray-200 dark:border-slate-700 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Plus className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50">Record Usage</h2>
                    <p className="text-sm text-gray-600 dark:text-slate-400">Track quota consumption</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowRecordModal(false);
                    setRecordError(null);
                    setRecordSuccess(null);
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                 aria-label="Close">
                  <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
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
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Quota Type *
                </label>
                <select
                  value={recordForm.quota_type}
                  onChange={(e) => setRecordForm({ ...recordForm, quota_type: e.target.value as RecordUsageRequest['quota_type'] })}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
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
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Amount (units)
                </label>
                <input
                  type="number"
                  min="1"
                  value={recordForm.amount || 1}
                  onChange={(e) => setRecordForm({ ...recordForm, amount: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                />
              </div>

              {/* Operation Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Operation Type (optional)
                </label>
                <input
                  type="text"
                  value={recordForm.operation_type || ''}
                  onChange={(e) => setRecordForm({ ...recordForm, operation_type: e.target.value })}
                  placeholder="e.g., resume_upload, bulk_score"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                />
              </div>

              {/* Resource ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Resource ID (optional)
                </label>
                <input
                  type="text"
                  value={recordForm.resource_id || ''}
                  onChange={(e) => setRecordForm({ ...recordForm, resource_id: e.target.value })}
                  placeholder="e.g., resume-abc123"
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-green-500 transition-colors"
                />
              </div>

              {/* API Info */}
              <div className="bg-gray-50 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700 rounded-xl p-4">
                <p className="text-xs text-gray-900 dark:text-slate-50">
                  <strong>API:</strong> POST /api/v1/usage/record<br />
                  <strong>Auth:</strong> Bearer token (JWT)
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 rounded-b-2xl shrink-0">
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowRecordModal(false);
                    setRecordError(null);
                    setRecordSuccess(null);
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-700 dark:text-slate-300 font-medium hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
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
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-6">
          <div className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-xl shadow-2xl sm:border sm:border-gray-200 dark:sm:border-slate-700 max-w-[95vw] sm:max-w-2xl w-full overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300 max-h-[95dvh] sm:max-h-[calc(100dvh-3rem)] flex flex-col">

            {/* Modal Header */}
            <div className="relative px-5 sm:px-7 py-5 sm:py-6 bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal flex-shrink-0 overflow-hidden">
              {/* Decorative circles */}
              <div className="absolute -top-6 -right-6 w-32 h-32 bg-white/5 rounded-full" />
              <div className="absolute -bottom-8 -left-4 w-24 h-24 bg-white/5 rounded-full" />
              <div className="relative flex items-center gap-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center flex-shrink-0 border border-white/20">
                  <ShoppingCart className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h2 className="text-lg sm:text-xl font-bold text-white">Purchase Add-on</h2>
                    <span className="text-[10px] font-semibold bg-white/20 text-white px-2 py-0.5 rounded-full border border-white/20">INSTANT</span>
                  </div>
                  <p className="text-xs sm:text-sm text-gray-400">Add units to your quota immediately</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowAddonModal(false);
                  setAddonPurchaseError(null);
                  setAddonPurchaseSuccess(null);
                }}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center hover:bg-white/15 rounded-xl transition-colors"
               aria-label="Close">
                <X className="w-5 h-5 text-gray-300" />
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="overflow-y-auto flex-1">
              <div className="p-5 sm:p-7 space-y-5">

                {/* Success Message */}
                {addonPurchaseSuccess && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-2xl flex items-start gap-3 animate-in slide-in-from-top duration-200">
                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-green-800 text-sm">Purchase Successful!</p>
                      <p className="text-xs text-green-600 mt-0.5">{addonPurchaseSuccess}</p>
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {addonPurchaseError && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 animate-in slide-in-from-top duration-200">
                    <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                      <AlertCircle className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-red-800 text-sm">
                        {paymentCaptured ? 'Activation Failed — Payment Was Captured' : 'Purchase Failed'}
                      </p>
                      <p className="text-xs text-red-600 mt-0.5">{addonPurchaseError}</p>
                      {paymentCaptured && (
                        <p className="text-xs text-red-700 mt-1 font-medium">
                          Your payment was received. Please check Billing History to retry activation — you will not be charged again.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Addon Details Card */}
                <div className="relative overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-gradient-to-br from-brand-blue/[0.04] via-white to-brand-cyan/[0.04] p-4 ring-1 ring-black/[0.02] dark:ring-white/[0.02] sm:p-5">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-gray-200/40 rounded-full -translate-y-8 translate-x-8" />
                  <div className="relative flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                      <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white dark:bg-slate-900 rounded-2xl flex items-center justify-center shadow-sm border border-gray-200 dark:border-slate-700 flex-shrink-0">
                        <Zap className="w-6 h-6 sm:w-7 sm:h-7 text-gray-700 dark:text-slate-300" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 dark:text-slate-50 text-base sm:text-lg leading-tight truncate">
                          {(selectedAddon.name || selectedAddon.addon_name || 'Credit Pack').replace(/\s*-?\s*Pro$/i, '').trim()}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">{selectedAddon.credit_amount || 0} units per pack</p>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs text-gray-500 dark:text-slate-500">Per pack</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-slate-50">₹{selectedAddon.price || selectedAddon.unit_price || 0}</p>
                    </div>
                  </div>
                </div>

                {/* Quantity Selector */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-semibold text-gray-700 dark:text-slate-300">Select Quantity</label>
                    <span className="text-xs text-gray-400 dark:text-slate-500">Max 100 packs</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center bg-gray-100 dark:bg-slate-800 rounded-2xl border border-gray-200 dark:border-slate-700 p-1 gap-1">
                      <button
                        onClick={() => setAddonQuantity(Math.max(1, addonQuantity - 1))}
                        className="w-10 h-10 sm:w-11 sm:h-11 bg-white dark:bg-slate-900 rounded-xl flex items-center justify-center hover:bg-gray-50 dark:hover:bg-slate-800 active:scale-95 transition-all font-bold text-lg text-gray-700 dark:text-slate-300 shadow-sm border border-gray-200 dark:border-slate-700"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min="1"
                        max={100}
                        value={addonQuantity}
                        onChange={(e) => setAddonQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-14 sm:w-16 text-center bg-transparent border-none outline-none font-bold text-xl sm:text-2xl text-gray-900 dark:text-slate-50"
                      />
                      <button
                        onClick={() => setAddonQuantity(Math.min(100, addonQuantity + 1))}
                        className="w-10 h-10 sm:w-11 sm:h-11 bg-white dark:bg-slate-900 rounded-xl flex items-center justify-center hover:bg-gray-50 dark:hover:bg-slate-800 active:scale-95 transition-all font-bold text-lg text-gray-700 dark:text-slate-300 shadow-sm border border-gray-200 dark:border-slate-700"
                      >
                        +
                      </button>
                    </div>
                    {/* Units highlight */}
                    <div className="flex flex-1 items-center justify-between rounded-2xl bg-brand-blue px-4 py-2.5 text-white shadow-sm shadow-brand-blue/25">
                      <span className="text-xs text-white/75">Total units</span>
                      <div className="flex items-center gap-1.5">
                        <Zap className="h-4 w-4 text-white/85" />
                        <span className="text-lg font-bold">+{(selectedAddon.credit_amount || 0) * addonQuantity}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Order Summary */}
                <div className="border border-gray-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                  <div className="px-5 py-3 bg-gray-50 dark:bg-slate-800/50 border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
                    <h4 className="font-semibold text-gray-700 dark:text-slate-300 text-sm">Order Summary</h4>
                    <span className="text-xs text-gray-400 dark:text-slate-500">{addonQuantity} pack{addonQuantity > 1 ? 's' : ''}</span>
                  </div>
                  <div className="p-4 sm:p-5 space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500 dark:text-slate-500">Pack size</span>
                      <span className="font-medium text-gray-800 dark:text-slate-100">{selectedAddon.credit_amount || 0} units</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500 dark:text-slate-500">Quantity</span>
                      <span className="font-medium text-gray-800 dark:text-slate-100">×{addonQuantity}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500 dark:text-slate-500">Subtotal</span>
                      <span className="font-medium text-gray-800 dark:text-slate-100">
                        ₹{((selectedAddon.price || selectedAddon.unit_price || 0) * addonQuantity).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500 dark:text-slate-500">GST (18%)</span>
                      <span className="font-medium text-gray-800 dark:text-slate-100">
                        ₹{((selectedAddon.price || selectedAddon.unit_price || 0) * addonQuantity * 0.18).toFixed(2)}
                      </span>
                    </div>
                    {/* Total row */}
                    <div className="mt-1 pt-3 border-t border-gray-200 dark:border-slate-700 flex justify-between items-center">
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-slate-50 text-sm">Total Amount</p>
                        <p className="text-xs text-gray-400 dark:text-slate-500">Incl. all taxes</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-slate-50">
                          ₹{((selectedAddon.price || selectedAddon.unit_price || 0) * addonQuantity * 1.18).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 flex-shrink-0">
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowAddonModal(false);
                    setAddonPurchaseError(null);
                    setAddonPurchaseSuccess(null);
                    setPaymentCaptured(false);
                  }}
                  className="px-5 py-3 border border-gray-200 dark:border-slate-700 rounded-2xl text-gray-600 dark:text-slate-400 font-semibold text-sm hover:bg-gray-50 dark:hover:bg-slate-800 hover:border-gray-300 transition-all"
                >
                  {paymentCaptured && addonPurchaseError ? 'Close' : 'Cancel'}
                </button>
                <button
                  onClick={handlePurchaseAddon}
                  disabled={purchasingAddon || razorpayProcessing || !!addonPurchaseSuccess || paymentCaptured}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-blue py-3 text-sm font-semibold text-white shadow-lg shadow-brand-blue/25 transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {purchasingAddon || razorpayProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : paymentCaptured && addonPurchaseError ? (
                    <>
                      <span>Payment Captured — Check Billing History</span>
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4 flex-shrink-0" />
                      <span>Pay ₹{((selectedAddon.price || selectedAddon.unit_price || 0) * addonQuantity * 1.18).toFixed(2)}</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-center text-[11px] text-gray-400 dark:text-slate-500 mt-3 flex items-center justify-center gap-1">
                <span>🔒</span>
                <span>Secured by Razorpay · 256-bit SSL encryption</span>
              </p>
            </div>

          </div>
        </div>
      )}
    </main>
  );
}
