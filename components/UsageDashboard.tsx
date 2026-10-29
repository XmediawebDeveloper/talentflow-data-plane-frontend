'use client';

import PageBreadcrumb from '@/components/PageBreadcrumb';
import { TrendingUp, Zap, Calendar, Clock, DollarSign, X, AlertCircle, CheckCircle2, Loader2, AlertTriangle, ArrowUpRight, Plus, Minus, Send, Sparkles, ShoppingCart, RefreshCw, BarChart3, Package, CreditCard, Info, Lock, FileText, Target, Users, Briefcase, PieChart, ShieldCheck, Check, type LucideIcon } from 'lucide-react';
import { useState, useEffect, useMemo, useRef } from 'react';
// QuotaDisplay was an earlier inline widget that has since been folded into the
// Quota Overview cards rendered below. The import is intentionally not
// reinstated because the component is no longer in the tree.
import { useQuota } from '@/contexts/QuotaContext';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRazorpay } from '@/lib/hooks/useRazorpay';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';
import { PlanFeatureKey, PLAN_LOCKED_MESSAGE } from '@/lib/types/planFeatures';
import { formatISTDate } from '@/lib/utils/dateUtils';
import api from '@/lib/services/api';
import { useScrollRestoration } from '@/lib/hooks/useListViewPersistence';
import { Skeleton } from '@/components/ui/skeleton';
import FilterSelect from '@/components/ui/filter-select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import PermissionLockedOverlay from '@/components/shared/PermissionLockedOverlay';

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
  // Seat purchases carry credit_type ("max_seats") - see routers/addons.py, where it
  // is an alternative to addon_id. Forwarded below as addon_credit_type.
  credit_type?: string;
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
  // Set when embedded in the Current Plan page, which already shows the
  // shared "Your Current Plan" card above the tabs.
  hideSubscriptionSummary?: boolean;
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

// Per-module icon, colour and one-line add-on blurb for the quota and add-on cards.
const QUOTA_THEME: Record<string, { icon: LucideIcon; tile: string; bar: string; text: string; blurb: string }> = {
  RU: { icon: FileText, tile: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300', bar: 'bg-blue-600', text: 'text-blue-600 dark:text-blue-400', blurb: 'Upload and process resumes' },
  RS: { icon: BarChart3, tile: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300', bar: 'bg-indigo-600', text: 'text-indigo-600 dark:text-indigo-400', blurb: 'Score candidate resumes' },
  AS: { icon: Target, tile: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300', bar: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', blurb: 'Create and run assessments' },
  AIU: { icon: Sparkles, tile: 'bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-300', bar: 'bg-fuchsia-600', text: 'text-fuchsia-600 dark:text-fuchsia-400', blurb: 'Conduct AI Interviews' },
  max_seats: { icon: Users, tile: 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300', bar: 'bg-orange-500', text: 'text-orange-600 dark:text-orange-400', blurb: 'Add more team seats' },
  max_jobs: { icon: Briefcase, tile: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300', bar: 'bg-sky-500', text: 'text-sky-600 dark:text-sky-400', blurb: 'Post more job openings' },
  default: { icon: Package, tile: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300', bar: 'bg-brand-blue', text: 'text-brand-blue', blurb: 'Extend your quota' },
};

// Maps an add-on's display name to a QUOTA_THEME key.
function addonThemeKey(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('resume') && n.includes('upload')) return 'RU';
  if (n.includes('resume') && n.includes('storage')) return 'RU';
  if (n.includes('resume') && n.includes('scor')) return 'RS';
  if (n.includes('assessment')) return 'AS';
  if (n.includes('ai') && n.includes('interview')) return 'AIU';
  if (n.includes('job')) return 'max_jobs';
  if (n.includes('seat') || n.includes('user')) return 'max_seats';
  return 'default';
}

export default function UsageDashboard({ onBack, hideSubscriptionSummary = false }: UsageDashboardProps) {
  // Use shared QuotaContext instead of making duplicate API calls
  const { quotaData: contextQuotaData, loading: quotaLoading, error: quotaError, hasPermission, refetch: refetchQuota } = useQuota();
  // Get user from AuthContext (already fetched during login)
  const { user, hasPermission: authHasPermission } = useAuth();
  const canUpgradePlan = authHasPermission('canUpgradePlan');
  const canExportUsage = authHasPermission('canExportUsage');
  const canPurchaseAddons = canUpgradePlan;
  const { openCheckout, isProcessing: razorpayProcessing } = useRazorpay();
  const { loading: planFeaturesLoading } = usePlanFeatures();

  // "Is this feature in the PLAN at all?" — read from the raw is_enabled flags,
  // NOT hasPlanFeature(), which also turns false when the feature's quota is
  // EXCEEDED. Those two must not be confused here: an exhausted feature still
  // needs its quota card (showing "Exceeded") and its add-on (to top up).
  // Not-in-plan items stay visible but muted/disabled with PLAN_LOCKED_MESSAGE.
  const PLAN_KEY_ALIASES: Record<string, string> = { assessments: 'assessment', ai_interviews: 'ai_interview' };
  const isNotInPlan = (key: PlanFeatureKey): boolean => {
    if (planFeaturesLoading || !contextQuotaData?.features) return false;
    return !contextQuotaData.features.some(
      (f) => f.is_enabled && (PLAN_KEY_ALIASES[f.feature_key] ?? f.feature_key) === key,
    );
  };
  const addonFeatureKey = (addon: any): PlanFeatureKey | null => {
    const name = (addon.name || addon.addon_name || '').toLowerCase();
    if ((name.includes('resume') && name.includes('upload')) || name.includes('resume storage')) return 'resume_upload';
    if ((name.includes('resume') && name.includes('scor')) || name.includes('resume scoring')) return 'resume_scoring';
    if (name.includes('assessment')) return 'assessment';
    if (name.includes('ai') || name.includes('interview')) return 'ai_interview';
    return null; // seats, jobs and other generic addons
  };

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
  // Pack count chosen on each add-on card; pre-fills the purchase modal.
  const [cardQuantities, setCardQuantities] = useState<Record<string, number>>({});
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

  // While the add-on modal is open, lock the dashboard scroll container(s)
  // behind it so no background scrollbar shows next to the dialog.
  const addonModalRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showAddonModal) return;
    const locked: { el: HTMLElement; overflow: string }[] = [];
    let el = addonModalRef.current?.parentElement || null;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') {
        locked.push({ el, overflow: el.style.overflowY });
        el.style.overflowY = 'hidden';
      }
      el = el.parentElement;
    }
    return () => locked.forEach(({ el, overflow }) => { el.style.overflowY = overflow; });
  }, [showAddonModal]);

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
      <main className="flex-1 bg-white dark:bg-slate-950">
        <div className="mx-auto w-full max-w-[1400px]">
          <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
            {/* Breadcrumb */}
            <div className="mb-4 md:mb-6 flex items-center gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-3" />
              <Skeleton className="h-3 w-28" />
            </div>

            <div className="space-y-6">
              {/* Subscription Summary Card */}
              <div className="rounded-xl border border-gray-100 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900 overflow-hidden">
                <div className="px-4 sm:px-6 pt-4 sm:pt-6">
                  <Skeleton className="h-4 w-40" />
                </div>
                <div className="p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-6">
                    <div className="flex items-start gap-3 sm:gap-5">
                      <Skeleton className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl flex-shrink-0" />
                      <div className="space-y-2">
                        <Skeleton className="h-6 sm:h-7 w-40" />
                        <Skeleton className="h-5 w-24 rounded-full" />
                        <Skeleton className="h-4 w-56" />
                      </div>
                    </div>
                    <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-3 sm:p-4 sm:min-w-[200px] w-full sm:w-auto space-y-2">
                      <Skeleton className="h-7 w-28" />
                      <Skeleton className="h-3 w-40" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Quota Overview */}
              <div className="rounded-xl border border-gray-100 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900 overflow-hidden">
                <div className="px-4 sm:px-6 pt-4 sm:pt-6">
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="w-8 h-8 rounded-lg" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-44" />
                    </div>
                  </div>
                </div>
                <div className="p-4 sm:p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex flex-col rounded-xl bg-gray-50 dark:bg-slate-800/50 p-3 sm:p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                          <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
                          <Skeleton className="h-3.5 w-20 flex-1" />
                          <Skeleton className="h-4 w-12 rounded-full" />
                        </div>
                        <div className="flex items-baseline justify-between gap-2 mb-2">
                          <Skeleton className="h-5 w-16" />
                          <Skeleton className="h-3 w-10" />
                        </div>
                        <Skeleton className="h-1.5 w-full rounded-full mb-2" />
                        <Skeleton className="h-3 w-24 mb-2" />
                        <div className="mt-auto pt-2 border-t border-gray-100 dark:border-slate-700/60 grid grid-cols-2 gap-2">
                          <Skeleton className="h-3 w-full" />
                          <Skeleton className="h-3 w-full" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Add-ons */}
              <div className="rounded-xl border border-gray-100 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900 overflow-hidden">
                <div className="px-4 sm:px-6 pt-4 sm:pt-6">
                  <div className="flex items-center gap-2.5">
                    <Skeleton className="w-8 h-8 rounded-lg" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                </div>
                <div className="p-3 sm:p-4 md:p-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex flex-col rounded-xl bg-gray-50 dark:bg-slate-800/50 p-3 sm:p-4 shadow-sm">
                        <div className="flex items-center gap-2 mb-2">
                          <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
                          <Skeleton className="h-3.5 w-24 flex-1" />
                        </div>
                        <div className="flex items-baseline justify-between gap-2 mb-3">
                          <Skeleton className="h-4 w-16" />
                          <Skeleton className="h-4 w-14" />
                        </div>
                        <Skeleton className="mt-auto h-8 w-full rounded-lg" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
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

  // Which quota an add-on tops up. Same name rules the backend uses to pick the
  // credit type (routers/addons.py), so the warning matches what gets credited.
  const getAddonQuotaType = (addon: Addon): string | null => {
    if (addon.credit_type) return addon.credit_type;
    if (addon.quota_type) return addon.quota_type;
    const n = (addon.name || addon.addon_name || '').toLowerCase();
    if (n.includes('resume upload')) return 'RU';
    if (n.includes('resume scoring')) return 'RS';
    if (n.includes('assessment')) return 'AS';
    if (n.includes('ai interview')) return 'AIU';
    if (n.includes('seat') || n.includes('user')) return 'max_seats';
    return null;
  };

  // Add-on units first pay off any usage already over the plan + add-on limit
  // (Control Plane unified pool). Without this notice a tenant that is over can
  // buy a pack and still see 0 remaining, as happened to sarathi on 2026-10-07.
  const selectedAddonOverage = (() => {
    if (!selectedAddon) return null;
    const qt = getAddonQuotaType(selectedAddon);
    const quota = qt ? quotaSummary?.quotas?.find((q: QuotaInfo) => q.quota_type === qt) : undefined;
    if (!quota || !quota.is_exceeded || quota.exceeded_by <= 0) return null;
    const newUnits = (selectedAddon.credit_amount || 0) * addonQuantity;
    return {
      name: quota.name,
      overBy: quota.exceeded_by,
      newUnits,
      usableAfter: Math.max(0, newUnits - quota.exceeded_by),
    };
  })();

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
          toast.error(friendlyErrorMessage(checkoutErr, "Payment failed. Please try again."));
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

        <div className="space-y-5">
        {/* Subscription Summary Card */}
        {subscriptionSummary && !hideSubscriptionSummary && (
          <div className="flex flex-col gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900 sm:p-6">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              <CreditCard className="h-4 w-4" />
              <span>Current Subscription</span>
            </div>

            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-start gap-3 sm:items-center sm:gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-blue text-white shadow-sm shadow-brand-blue/25 sm:h-14 sm:w-14">
                  <Zap className="h-6 w-6 fill-current sm:h-7 sm:w-7" />
                </div>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-slate-50 sm:text-[22px]">
                      {subscriptionSummary.plan?.name || 'No Plan'}
                    </h2>
                    {(() => {
                      const s = (subscriptionSummary.status || '').toLowerCase();
                      const variant =
                        s === 'active' ? 'success'
                        : (s === 'trialing' || s === 'trial') ? 'warning'
                        : (s === 'cancelled' || s === 'canceled' || s === 'suspended' || s === 'expired' || s === 'past_due') ? 'destructive'
                        : 'muted';
                      return (
                        <Badge variant={variant} className="capitalize">
                          <span className="size-1.5 shrink-0 rounded-full bg-current" />
                          {subscriptionSummary.status || 'Unknown'}
                        </Badge>
                      );
                    })()}
                    {subscriptionSummary.isolation_type && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-slate-800 dark:text-slate-400">
                        <Package className="h-3 w-3" />
                        {subscriptionSummary.isolation_type === 'DEDICATED' ? 'Dedicated Server' :
                         subscriptionSummary.isolation_type === 'DATABASE' ? 'Dedicated Database' :
                         subscriptionSummary.isolation_type === 'SCHEMA' ? 'Schema Isolation' :
                         subscriptionSummary.isolation_type}
                      </span>
                    )}
                    {subscriptionSummary.is_trial && (
                      (() => {
                        const remaining = calculateRemainingTime(subscriptionSummary.subscription?.current_period_end);
                        return (
                          <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-[11px] font-bold text-gray-700 animate-pulse dark:bg-slate-800 dark:text-slate-300">
                            TRIAL {!remaining.isExpired ? `• ${remaining.displayText}` : '• Expired'}
                          </span>
                        );
                      })()
                    )}
                  </div>
                  {subscriptionSummary.plan?.description && (
                    <p className="text-sm text-gray-500 dark:text-slate-400">{subscriptionSummary.plan.description}</p>
                  )}
                </div>
              </div>

              <div className="flex flex-col rounded-lg bg-gray-50 p-3 dark:bg-slate-800/50 lg:items-end lg:bg-transparent lg:p-0 lg:text-right dark:lg:bg-transparent">
                {subscriptionSummary.is_trial ? (
                  /* Free Trial - show expiry with proper time calculation */
                  (() => {
                    const remaining = calculateRemainingTime(subscriptionSummary.subscription?.current_period_end);
                    return (
                      <>
                        {!remaining.isExpired ? (
                          <div className="text-2xl font-bold tracking-tight text-gray-900 dark:text-slate-50">
                            {remaining.displayText}
                          </div>
                        ) : (
                          <div className="text-xl font-bold text-gray-700 dark:text-slate-300">
                            Trial Expired
                          </div>
                        )}
                        <p className="mt-1.5 text-xs text-gray-500 dark:text-slate-500">
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
                        <div className="flex items-baseline gap-1">
                          <span className="text-[28px] font-bold leading-none tracking-tight text-gray-900 dark:text-slate-50 sm:text-3xl">
                            ₹{(subscriptionSummary.subscription.price ?? subscriptionSummary.plan?.price ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                          <span className="text-sm font-medium text-gray-500 dark:text-slate-500">
                            /{subscriptionSummary.subscription.billing_interval === 'monthly' ? 'month' : subscriptionSummary.subscription.billing_interval === 'yearly' ? 'year' : (subscriptionSummary.subscription.billing_interval || 'mo')}
                          </span>
                        </div>
                        {!remaining.isExpired && (
                          <p className="mt-1.5 flex items-center gap-1 text-xs text-gray-500 dark:text-slate-500 lg:justify-end">
                            <Calendar className="h-3.5 w-3.5" />
                            Renews in {remaining.displayText}
                          </p>
                        )}
                        {remaining.isExpired && (
                          <p className="mt-1.5 flex items-center gap-1 text-xs text-destructive lg:justify-end">
                            <AlertTriangle className="h-3.5 w-3.5" />
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
              <div className="flex flex-wrap items-center gap-1.5 border-t border-gray-100 pt-4 dark:border-slate-700/60">
                <h4 className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">Plan Features:</h4>
                {Object.entries(subscriptionSummary.plan.features).map(([key, value]) => (
                  <span
                    key={key}
                    className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {key.replace(/_/g, ' ')}: {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Usage & Quotas header — title, billing period and how units add up */}
        <div className="flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900 sm:p-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue">
                <PieChart className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-slate-50">Usage &amp; Quotas</h2>
                <p className="text-xs text-gray-500 dark:text-slate-400 sm:text-sm">Track your plan units and add-on units usage.</p>
              </div>
            </div>
            {quotaSummary?.billing_period && (
              <div className="inline-flex items-center gap-2 self-start rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 dark:border-slate-700 dark:text-slate-300 sm:self-auto sm:text-sm">
                <Calendar className="h-4 w-4 flex-shrink-0 text-gray-500 dark:text-slate-400" />
                <span className="truncate">{formatISTDate(quotaSummary.billing_period.start)} – {formatISTDate(quotaSummary.billing_period.end)}</span>
              </div>
            )}
          </div>
          <div className="flex items-start gap-3 rounded-lg bg-brand-blue/[0.04] px-3 py-2.5 ring-1 ring-brand-blue/10 dark:bg-slate-800/50 dark:ring-slate-700">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
            <div className="min-w-0 text-xs text-gray-600 dark:text-slate-400 sm:text-[13px]">
              <p>
                <span className="font-semibold text-gray-900 dark:text-slate-100">Plan units and Add-on units are shown separately.</span>{' '}
                Total available units = Plan units + Add-on units.
              </p>
              <p className="mt-0.5 text-gray-500 dark:text-slate-500">Usage will be deducted from the combined units.</p>
            </div>
          </div>
          {/* Low Quota Warning — hide for expired/inactive plans */}
          {quotaSummary?.has_low_quotas && !['expired', 'inactive', 'suspended'].includes(subscriptionSummary?.status?.toLowerCase() || '') && (
            <div className="rounded-xl bg-brand-orange/[0.08] p-3 dark:bg-brand-orange/10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-orange/20 text-brand-orange-deep">
                    <AlertTriangle className="h-[18px] w-[18px]" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-50">Quota Running Low</h3>
                    <p className="mt-0.5 text-xs text-gray-600 dark:text-slate-400 sm:text-sm">Some quotas are below 20%. Purchase add-on units to continue without interruption.</p>
                  </div>
                </div>
                  {/* Show each low quota with its own Add Credits button */}
                  <div className="flex flex-wrap gap-2 sm:shrink-0 sm:justify-end">
                    {quotaSummary.quotas
                      ?.filter((q: QuotaInfo) => {
                        if (!(q.is_low || q.is_exhausted || q.is_exceeded)) return false;
                        // No low-quota warning for features not in the plan (the
                        // quota card already says so). Uses isNotInPlan, not
                        // hasPlanFeature — the latter is false for EXCEEDED quotas,
                        // which are exactly the ones this banner must list.
                        const featureKey = quotaFeatureMap[q.quota_type];
                        if (featureKey && isNotInPlan(featureKey)) return false;
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
                              if (!canPurchaseAddons) return;
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
                            aria-disabled={!canPurchaseAddons}
                            title={!canPurchaseAddons ? 'You do not have permission to purchase add-ons' : isAddonPurchaseBlocked ? addonBlockedMessage : ""}
                            className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 ring-1 ${
                              !canPurchaseAddons
                                ? 'bg-gray-200 text-gray-500 ring-gray-300 cursor-not-allowed'
                                : isAddonPurchaseBlocked
                                ? 'bg-gray-200 text-gray-500 ring-gray-300 cursor-not-allowed'
                                : quota.is_exceeded_critical
                                  ? 'bg-destructive text-white ring-destructive-line hover:bg-destructive'
                                  : quota.is_exceeded
                                    ? 'bg-brand-orange text-white ring-brand-orange-deep hover:bg-brand-orange-deep'
                                    : quota.is_exhausted
                                    ? 'bg-brand-blue text-white ring-white/10 shadow-sm shadow-brand-blue/25'
                                    : 'bg-white text-gray-800 ring-gray-200 shadow-sm hover:bg-brand-blue/5 hover:text-brand-blue hover:ring-brand-blue/30'
                            }`}
                          >
                            <Plus className="w-3 h-3" />
                            {canPurchaseAddons ? `Add ${quota.name}` : `${quota.name} Read Only`}
                            {quota.is_exceeded && canPurchaseAddons && !isAddonPurchaseBlocked && (
                              <span className="text-2xs bg-white/20 px-1.5 py-0.5 rounded-full">+{formatNum(quota.exceeded_by)} over</span>
                            )}
                            {quota.is_exhausted && canPurchaseAddons && !isAddonPurchaseBlocked && (
                              <span className="text-2xs bg-white/20 px-1.5 py-0.5 rounded-full">Exhausted</span>
                            )}
                          </button>
                        );
                      })}
                  </div>
              </div>
            </div>
          )}
        </div>

        {/* Quota Summary Cards */}
        {/* id anchors the header plan-arrow deep link (?focus=quota-overview);
            scroll-mt keeps the card clear of the sticky breadcrumb band. */}
        {quotaSummary && (
          <div id="quota-overview" className="scroll-mt-24 flex flex-col gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900 sm:p-5">
            {/* Section Header + legend */}
            <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue">
                  <BarChart3 className="h-[18px] w-[18px]" />
                </div>
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-gray-900 dark:text-slate-50">Quota Overview</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400 sm:text-sm">Current usage, plan units, add-on units and remaining units for each module.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-600 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-500" />Plan units</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Add-on units</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand-blue" />Used</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-gray-200 dark:bg-slate-600" />Remaining</span>
              </div>
            </div>

            {/* Quota Cards Grid - Dynamic */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {quotaSummary.quotas?.filter((quota: QuotaInfo) => {
                if (quota.quota_type === 'storage_gb') return false;
                // Every quota card is shown; one whose feature is not in the plan
                // renders muted with the plan-locked hover (see notInPlan below).
                return true;
              }).map((quota: QuotaInfo) => {
                const isUnlimited = quota.limit === -1 || quota.remaining === -1;
                // Expired/inactive plans keep the normal card (historical usage view).
                const isExpiredOrInactive = ['expired', 'inactive', 'suspended'].includes(
                  subscriptionSummary?.status?.toLowerCase() || ''
                );
                const quotaFeatureKey = quotaFeatureMap[quota.quota_type];
                const notInPlan = !isExpiredOrInactive && !!quotaFeatureKey && isNotInPlan(quotaFeatureKey);
                const theme = QUOTA_THEME[quota.quota_type] || QUOTA_THEME.default;

                // Status chip — exactly one wins per card
                const statusPill = isUnlimited
                  ? { label: '∞ Unlimited', cls: 'bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-400' }
                  : quota.is_exceeded_critical
                  ? { label: 'Exceeded', cls: 'bg-destructive-subtle text-destructive' }
                  : quota.is_exceeded
                  ? { label: 'Exceeded', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' }
                  : quota.is_exhausted
                  ? { label: 'Exhausted', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' }
                  : quota.is_low
                  ? { label: 'Low', cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300' }
                  : null;

                if (notInPlan) {
                  return (
                    <div
                      key={quota.quota_type}
                      aria-disabled="true"
                      title={PLAN_LOCKED_MESSAGE}
                      className="flex cursor-not-allowed flex-col rounded-xl border border-gray-200 bg-gray-50 p-3 opacity-70 dark:border-slate-700 dark:bg-slate-800/40"
                    >
                      <div className="mb-2 flex items-center gap-2.5">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-400 dark:text-slate-500">{quota.name}</span>
                        <span className="whitespace-nowrap rounded-full bg-gray-100 px-1.5 py-0.5 text-2xs font-semibold text-gray-500 dark:bg-slate-800 dark:text-slate-400">
                          Not in plan
                        </span>
                      </div>
                      <p className="text-2xs font-medium text-gray-400 dark:text-slate-500">{PLAN_LOCKED_MESSAGE}</p>
                    </div>
                  );
                }

                const warn = !isUnlimited && (quota.is_low || quota.is_exhausted || quota.is_exceeded) && !quota.is_exceeded_critical;
                const accentText = quota.is_exceeded_critical ? 'text-destructive' : warn ? 'text-orange-600 dark:text-orange-400' : theme.text;
                const accentBar = isUnlimited ? 'bg-brand-cyan' : quota.is_exceeded_critical ? 'bg-destructive' : warn ? 'bg-orange-500' : theme.bar;

                return (
                  <div
                    key={quota.quota_type}
                    className={`flex flex-col rounded-xl border p-3 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md ${
                      quota.is_exceeded_critical
                        ? 'border-destructive-line bg-destructive-subtle/40'
                        : warn
                          ? 'border-orange-200 bg-orange-50/60 dark:border-orange-500/30 dark:bg-orange-500/[0.06]'
                          : 'border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900'
                    }`}
                  >
                    {/* Header: name + status chip */}
                    <div className="flex min-h-[22px] items-center gap-2.5">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900 dark:text-slate-100" title={quota.name}>{quota.name}</span>
                      {statusPill && (
                        <span className={`whitespace-nowrap rounded-md px-1.5 py-0.5 text-2xs font-semibold ${statusPill.cls}`}>
                          {statusPill.label}
                        </span>
                      )}
                    </div>

                    {/* Used / total + % used */}
                    <div className="mt-3 flex items-baseline justify-between gap-2">
                      <div className="flex min-w-0 items-baseline gap-1">
                        <span className={`text-xl font-bold tabular-nums tracking-tight ${quota.is_exceeded_critical ? 'text-destructive' : 'text-gray-900 dark:text-slate-50'}`}>
                          {isUnlimited ? '∞' : formatNum(quota.used)}
                        </span>
                        <span className="text-sm font-medium tabular-nums text-gray-500 dark:text-slate-400">
                          / {isUnlimited ? '∞' : formatNum(quota.limit)}
                        </span>
                      </div>
                      {!isUnlimited && (
                        <span className={`whitespace-nowrap text-[11px] font-semibold tabular-nums ${accentText}`}>
                          {quota.limit <= 0 ? '0' : quota.percentage_used.toFixed(2).replace(/\.?0+$/, '')}% used
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${accentBar}`}
                        style={{ width: isUnlimited ? '100%' : `${Math.max(Math.min(quota.percentage_used, 100), quota.used > 0 ? 2 : 0)}%` }}
                      />
                    </div>

                    {/* Plan / add-on / total breakdown */}
                    {!isUnlimited && (
                      <div className="mt-3 rounded-lg bg-gray-50 px-2.5 py-2 text-xs dark:bg-slate-800/60">
                        <div className="flex items-center justify-between gap-2 py-0.5">
                          <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-slate-400"><span className="h-2 w-2 rounded-sm bg-blue-500" />Plan units</span>
                          <span className="font-medium tabular-nums text-gray-900 dark:text-slate-100">{formatNum(quota.subscription_limit)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-2 py-0.5">
                          <span className="inline-flex items-center gap-1.5 text-gray-600 dark:text-slate-400"><span className="h-2 w-2 rounded-sm bg-emerald-500" />Add-on units</span>
                          <span className="font-medium tabular-nums text-gray-900 dark:text-slate-100">{formatNum(quota.addon_purchased)}</span>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 border-t border-gray-200 pt-1.5 dark:border-slate-700">
                          <span className="font-medium text-gray-700 dark:text-slate-300">Total available</span>
                          <span className="font-semibold tabular-nums text-gray-900 dark:text-slate-50">{formatNum(quota.limit)}</span>
                        </div>
                      </div>
                    )}

                    {/* Remaining footer */}
                    <p className={`mt-2.5 text-xs font-medium ${quota.is_exceeded_critical ? 'text-destructive' : warn ? 'text-orange-600 dark:text-orange-400' : 'text-gray-600 dark:text-slate-400'}`}>
                      {isUnlimited ? 'Unlimited usage' : `${formatNum(quota.remaining)} remaining`}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Add-ons Section */}
        {/* Never hidden for missing permission — greyed with a hover tooltip. */}
        <PermissionLockedOverlay locked={!canPurchaseAddons} message="You do not have permission to purchase add-ons">
        <div className="flex flex-col gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-900 sm:p-5" data-section="addons">
          {/* Section Header */}
          <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue">
                <ShoppingCart className="h-[18px] w-[18px]" />
              </div>
              <div>
                <h2 className="text-base font-semibold tracking-tight text-gray-900 dark:text-slate-50">Add-on Units</h2>
                <p className="text-xs text-gray-500 dark:text-slate-400 sm:text-sm">Purchase additional units to extend your quota limits.</p>
              </div>
            </div>
            <div className="flex items-start gap-2 self-start rounded-lg bg-brand-blue/[0.04] px-3 py-2 text-xs text-gray-600 ring-1 ring-brand-blue/10 dark:bg-slate-800/50 dark:text-slate-400 dark:ring-slate-700 lg:self-auto">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-blue" />
              <span>Purchased add-on units will be added to your <strong className="font-semibold text-gray-900 dark:text-slate-100">total available units</strong> shown above.</span>
            </div>
          </div>

          {/* Trial banner */}
          {isAddonPurchaseBlocked && subscriptionSummary?.is_trial && (
            <div className="flex items-start gap-3 rounded-xl border border-warning-line bg-warning-subtle px-4 py-3.5">
              <AlertTriangle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-warning-strong">Add-on Units — Not Available on Free Trial</p>
                <p className="text-sm text-warning mt-0.5">
                  Purchasing add-on units is only available for paid subscriptions. Upgrade your plan to unlock this feature.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={handleUpgradeClick}
                className="flex-shrink-0"
              >
                Upgrade <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          {/* Expired plan banner */}
          {isAddonPurchaseBlocked && !subscriptionSummary?.is_trial && (subscriptionSummary?.status?.toLowerCase() === 'expired' || subscriptionSummary?.status?.toLowerCase() === 'inactive') && (
            <div className="flex items-start gap-3 rounded-xl border border-destructive-line bg-destructive-subtle px-4 py-3.5">
              <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-destructive-strong">Add-on Purchase Unavailable — Plan Expired</p>
                <p className="text-sm text-destructive mt-0.5">
                  Renew your subscription to purchase add-on units.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                onClick={handleUpgradeClick}
                className="flex-shrink-0"
              >
                Renew Plan <ArrowUpRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          <div>
            {addonsLoading && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex flex-col rounded-xl border border-gray-200 p-3 dark:border-slate-700">
                    <div className="mb-3 flex items-center gap-2.5">
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                    <Skeleton className="mb-3 ml-auto h-5 w-14" />
                    <div className="mb-3 space-y-1.5">
                      <Skeleton className="h-3 w-full" />
                      <Skeleton className="h-3 w-4/5" />
                      <Skeleton className="h-3 w-3/5" />
                    </div>
                    <Skeleton className="mb-2 h-8 w-full rounded-lg" />
                    <Skeleton className="h-9 w-full rounded-lg" />
                  </div>
                ))}
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                {/* Reorder addons: Extra Max Jobs before Extra Max Seats, filter by plan features */}
                {/* Add-ons for features not in the plan stay listed but disabled
                    (addonNotInPlan below) instead of being dropped. */}
                {[...addons]
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

                  const addonKey = addonFeatureKey(addon);
                  const addonNotInPlan = !!addonKey && isNotInPlan(addonKey);
                  const disabled = isAddonPurchaseBlocked || addonNotInPlan;
                  const themeKey = addonThemeKey(displayName);
                  const theme = QUOTA_THEME[themeKey] || QUOTA_THEME.default;
                  const packUnits = addon.credit_amount || addon.min_quantity || 0;
                  const qty = cardQuantities[String(addon.id)] || 1;
                  const setQty = (next: number) =>
                    setCardQuantities(prev => ({ ...prev, [String(addon.id)]: Math.min(100, Math.max(1, next)) }));

                  return (
                    <div
                      key={addon.id}
                      title={addonNotInPlan ? PLAN_LOCKED_MESSAGE : undefined}
                      className={`flex flex-col rounded-xl border p-3 transition-all duration-300 ${
                        addonNotInPlan
                          ? 'border-gray-200 bg-gray-50 opacity-70 dark:border-slate-700 dark:bg-slate-800/40'
                          : 'border-gray-200 bg-white hover:-translate-y-0.5 hover:shadow-md hover:shadow-brand-blue/10 dark:border-slate-700 dark:bg-slate-900'
                      }`}
                    >
                      {/* Header: name + pack size */}
                      <div className="flex items-start gap-2.5">
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-slate-50" title={displayName}>{displayName}</h3>
                          <p className="text-xs text-gray-500 dark:text-slate-400">{packUnits} units per pack</p>
                        </div>
                      </div>

                      {/* Price */}
                      <div className="mt-2 text-right">
                        <span className="text-lg font-bold tabular-nums text-gray-900 dark:text-slate-50">
                          ₹{(addon.price || addon.unit_price || 0).toLocaleString()}
                        </span>
                        <span className="block text-[11px] leading-none text-gray-500 dark:text-slate-400">per pack</span>
                      </div>

                      {/* What you get */}
                      <ul className="mt-2 space-y-1 text-xs text-gray-600 dark:text-slate-400">
                        {[theme.blurb, 'Instant activation', 'Valid till plan expiry'].map(line => (
                          <li key={line} className="flex items-start gap-1.5">
                            <Check className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${addonNotInPlan ? 'text-gray-300' : 'text-emerald-500'}`} strokeWidth={3} />
                            <span>{line}</span>
                          </li>
                        ))}
                      </ul>

                      <div className="flex-grow" />

                      {/* Pack count — pre-fills the purchase modal */}
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className={`flex items-center rounded-lg border border-gray-200 dark:border-slate-700 ${disabled ? 'opacity-50' : ''}`}>
                          <button
                            type="button"
                            onClick={() => setQty(qty - 1)}
                            disabled={disabled || qty <= 1}
                            aria-label={`Decrease ${displayName} packs`}
                            className="flex h-8 w-8 items-center justify-center rounded-l-lg text-brand-blue transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300 dark:hover:bg-slate-800"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <span className="w-9 text-center text-sm font-semibold tabular-nums text-gray-900 dark:text-slate-50">{qty}</span>
                          <button
                            type="button"
                            onClick={() => setQty(qty + 1)}
                            disabled={disabled || qty >= 100}
                            aria-label={`Increase ${displayName} packs`}
                            className="flex h-8 w-8 items-center justify-center rounded-r-lg text-brand-blue transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300 dark:hover:bg-slate-800"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <span className="text-xs tabular-nums text-gray-500 dark:text-slate-400">{(packUnits * qty).toLocaleString()} units</span>
                      </div>

                      {/* Purchase button */}
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => { handleBuyAddon(addon); setAddonQuantity(qty); }}
                        disabled={disabled}
                        title={addonNotInPlan ? PLAN_LOCKED_MESSAGE : isAddonPurchaseBlocked ? addonBlockedMessage : ""}
                        className="mt-2 w-full"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        {addonNotInPlan
                          ? 'Not in plan'
                          : isAddonPurchaseBlocked
                          ? (subscriptionSummary?.status?.toLowerCase() === 'expired' ? 'Renew Plan' : 'Upgrade Plan')
                          : 'Purchase Now'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Info */}
          {!addonsLoading && addons.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-gray-100 pt-3 text-xs font-medium text-gray-600 dark:border-slate-700/60 dark:text-slate-400">
              <span className="flex items-center gap-1.5">
                <Zap className="h-4 w-4 text-brand-blue" />
                Instant activation
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                Secure payment powered by Razorpay
              </span>
            </div>
          )}
        </div>
        </PermissionLockedOverlay>
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
                  <div className="w-10 h-10 bg-success-subtle rounded-lg flex items-center justify-center">
                    <Plus className="w-5 h-5 text-success" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50">Record Usage</h2>
                    <p className="text-sm text-gray-600 dark:text-slate-400">Track quota consumption</p>
                  </div>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setShowRecordModal(false);
                    setRecordError(null);
                    setRecordSuccess(null);
                  }}
                  aria-label="Close"
                  className="px-2"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </div>

            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
              {/* Success Message */}
              {recordSuccess && (
                <div className="p-3 bg-success-subtle border border-success-line rounded-lg flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0" />
                  <p className="text-sm text-success">{recordSuccess}</p>
                </div>
              )}

              {/* Error Message */}
              {recordError && (
                <div className="p-3 bg-destructive-subtle border border-destructive-line rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                  <p className="text-sm text-destructive">{recordError}</p>
                </div>
              )}

              {/* Quota Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Quota Type *
                </label>
                <FilterSelect
                  value={recordForm.quota_type}
                  onChange={(v) => setRecordForm({ ...recordForm, quota_type: v as RecordUsageRequest['quota_type'] })}
                  ariaLabel="Quota Type"
                  options={[
                    { value: 'RU', label: 'Resume Storage (RU)' },
                    { value: 'RS', label: 'Resume Scoring (RS)' },
                    { value: 'AS', label: 'Assessment (AS)' },
                    { value: 'AIU', label: 'AI Interview Unit (AIU)' },
                    // { value: 'storage_gb', label: 'Storage (GB)' },
                  ]}
                  className="w-full sm:w-full px-4 sm:px-4 py-3 sm:py-3 rounded-xl sm:rounded-xl border-gray-300 text-base sm:text-base"
                />
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
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-success-line focus:border-success-line transition-colors"
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
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-success-line focus:border-success-line transition-colors"
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
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-success-line focus:border-success-line transition-colors"
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
                <Button
                  variant="primary"
                  onClick={handleRecordUsage}
                  disabled={recordingUsage}
                  className="flex-1"
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
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Addon Purchase Modal — bottom sheet on mobile, centred dialog on desktop */}
      {showAddonModal && selectedAddon && (() => {
        const addonName = (selectedAddon.name || selectedAddon.addon_name || 'Credit Pack').replace(/\s*-?\s*Pro$/i, '').trim();
        const packPrice = selectedAddon.price || selectedAddon.unit_price || 0;
        const packUnits = selectedAddon.credit_amount || 0;
        const closeAddonModal = () => {
          setShowAddonModal(false);
          setAddonPurchaseError(null);
          setAddonPurchaseSuccess(null);
        };
        return (
        <div ref={addonModalRef} className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 backdrop-blur-sm sm:items-center sm:p-6">
          <div className="flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-300 dark:border-slate-700 dark:bg-slate-900 sm:max-h-[calc(100dvh-3rem)] sm:max-w-xl sm:rounded-2xl">

            {/* Modal Header */}
            <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-slate-700/60 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue">
                  <ShoppingCart className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold tracking-tight text-gray-900 dark:text-slate-50">Purchase Add-on</h2>
                    <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-blue">Instant</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Add units to your quota immediately</p>
                </div>
              </div>
              <button
                onClick={closeAddonModal}
                className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-gray-100 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X className="h-5 w-5 text-gray-500 dark:text-slate-400" />
              </button>
            </div>

            {/* Body — scrolls only on short screens, scrollbar hidden */}
            <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="space-y-3 px-4 py-3 sm:px-5 sm:py-4">

                {/* Success Message */}
                {addonPurchaseSuccess && (
                  <div className="flex items-start gap-3 rounded-xl border border-success-line bg-success-subtle p-3 animate-in slide-in-from-top duration-200">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-success" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-success-strong">Purchase Successful!</p>
                      <p className="mt-0.5 text-xs text-success">{addonPurchaseSuccess}</p>
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {addonPurchaseError && (
                  <div className="flex items-start gap-3 rounded-xl border border-destructive-line bg-destructive-subtle p-3 animate-in slide-in-from-top duration-200">
                    <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-destructive-strong">
                        {paymentCaptured ? 'Activation Failed — Payment Was Captured' : 'Purchase Failed'}
                      </p>
                      <p className="mt-0.5 text-xs text-destructive">{addonPurchaseError}</p>
                      {paymentCaptured && (
                        <p className="mt-1 text-xs font-medium text-destructive">
                          Your payment was received. Please check Billing History to retry activation — you will not be charged again.
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Addon Details Card */}
                <div className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 dark:border-slate-700">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-slate-50" title={addonName}>{addonName}</h3>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">{packUnits} units per pack</p>
                  </div>
                  <div className="flex-shrink-0 border-l border-gray-200 pl-3 text-right dark:border-slate-700 sm:pl-4">
                    <p className="text-[11px] text-gray-500 dark:text-slate-400 sm:text-xs">Per pack</p>
                    <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-slate-50">₹{packPrice}</p>
                  </div>
                </div>

                {/* Quantity Selector */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-sm font-semibold text-gray-900 dark:text-slate-50">Select Quantity</label>
                    <span className="text-xs text-gray-500 dark:text-slate-400">Max 100 packs</span>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
                    <div className="flex items-center justify-between gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-slate-700 dark:bg-slate-800 sm:justify-start">
                      <button
                        onClick={() => setAddonQuantity(Math.max(1, addonQuantity - 1))}
                        aria-label="Decrease quantity"
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-lg font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min="1"
                        max={100}
                        value={addonQuantity}
                        onChange={(e) => setAddonQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                        aria-label="Quantity"
                        className="w-14 border-none bg-transparent text-center text-lg font-bold tabular-nums text-gray-900 outline-none dark:text-slate-50"
                      />
                      <button
                        onClick={() => setAddonQuantity(Math.min(100, addonQuantity + 1))}
                        aria-label="Increase quantity"
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-lg font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 active:scale-95 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        +
                      </button>
                    </div>
                    {/* Units highlight */}
                    <div className="flex flex-1 items-center justify-between rounded-xl bg-brand-blue/[0.06] px-4 py-2 dark:bg-brand-blue/15">
                      <span className="text-sm text-gray-600 dark:text-slate-300">Total units</span>
                      <div className="flex items-center gap-1.5 text-brand-blue dark:text-brand-cyan">
                        <Zap className="h-4 w-4" />
                        <span className="text-lg font-bold tabular-nums">+{packUnits * addonQuantity}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Over-quota notice: new units cover the existing overage first */}
                {selectedAddonOverage && (
                  <div role="alert" className="flex items-start gap-3 rounded-xl border border-warning-line bg-warning-subtle p-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-warning" />
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold text-warning-strong">
                        You are {selectedAddonOverage.overBy.toLocaleString()} {selectedAddonOverage.name} units over your limit
                      </p>
                      <p className="mt-1 text-warning-strong/80">
                        New units first cover the units already used over your limit.{' '}
                        {selectedAddonOverage.usableAfter > 0
                          ? `After this purchase you will have ${selectedAddonOverage.usableAfter.toLocaleString()} of the ${selectedAddonOverage.newUnits.toLocaleString()} units available.`
                          : `This purchase of ${selectedAddonOverage.newUnits.toLocaleString()} units will leave you with 0 units available. You need more than ${selectedAddonOverage.overBy.toLocaleString()} units to get any usable balance.`}
                      </p>
                    </div>
                  </div>
                )}

                {/* Order Summary */}
                <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700">
                  <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-800/50">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-50">Order Summary</h4>
                    <span className="text-xs text-gray-500 dark:text-slate-400">{addonQuantity} pack{addonQuantity > 1 ? 's' : ''}</span>
                  </div>
                  <div className="space-y-1.5 px-4 py-2.5 text-[13px]">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 dark:text-slate-400">Pack size</span>
                      <span className="font-medium text-gray-900 dark:text-slate-100">{packUnits} units</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 dark:text-slate-400">Quantity</span>
                      <span className="font-medium text-gray-900 dark:text-slate-100">×{addonQuantity}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 dark:text-slate-400">Subtotal</span>
                      <span className="font-medium tabular-nums text-gray-900 dark:text-slate-100">₹{(packPrice * addonQuantity).toFixed(2)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500 dark:text-slate-400">GST (18%)</span>
                      <span className="font-medium tabular-nums text-gray-900 dark:text-slate-100">₹{(packPrice * addonQuantity * 0.18).toFixed(2)}</span>
                    </div>
                    {/* Total row */}
                    <div className="mt-1 flex items-center justify-between border-t border-gray-200 pt-2 dark:border-slate-700">
                      <div>
                        <p className="text-sm font-semibold text-gray-900 dark:text-slate-50">Total Amount</p>
                        <p className="text-xs text-gray-500 dark:text-slate-400">Incl. all taxes</p>
                      </div>
                      <p className="text-xl font-bold tabular-nums tracking-tight text-gray-900 dark:text-slate-50 sm:text-2xl">
                        ₹{(packPrice * addonQuantity * 1.18).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex-shrink-0 border-t border-gray-100 bg-white px-4 py-3 dark:border-slate-700/60 dark:bg-slate-900 sm:px-5">
              <Button
                variant="primary"
                onClick={handlePurchaseAddon}
                disabled={purchasingAddon || razorpayProcessing || !!addonPurchaseSuccess || paymentCaptured}
                className="w-full"
              >
                {purchasingAddon || razorpayProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : paymentCaptured && addonPurchaseError ? (
                  <>
                    <span>Payment Captured — Check Billing History</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="h-4 w-4 flex-shrink-0" />
                    <span>Pay ₹{(packPrice * addonQuantity * 1.18).toFixed(2)}</span>
                  </>
                )}
              </Button>
              <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[11px] text-gray-500 dark:text-slate-500">
                <Lock className="h-3 w-3 flex-shrink-0" />
                <span>Secured by Razorpay · 256-bit SSL encryption</span>
              </p>
            </div>

          </div>
        </div>
        );
      })()}
    </main>
  );
}
