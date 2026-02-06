'use client';

import { CreditCard, Check, Loader2, Users, Building2, Zap, AlertCircle, Lock, Clock, CheckCircle, XCircle, X, Database, Layers, Package, Sparkles, ArrowRight, ArrowLeft, ArrowUpRight, Crown, FileText, Mail } from 'lucide-react';
import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import api, { handleUnauthorized } from '@/lib/services/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { decodePlanId } from '@/lib/utils/planEncoder';
import { toast } from 'sonner';
import { useQuota } from '@/contexts/QuotaContext';
import { useAuth } from '@/components/providers/AuthProvider';

// Use backend API - no direct Admin API calls
const BILLING_API_URL = process.env.NEXT_PUBLIC_BILLING_API_URL || 'http://localhost:8001';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

interface PlanFeature {
  id: string;
  feature_key: string;
  feature_name: string;
  description?: string;
  feature_category: string;
  is_enabled: boolean;
}

interface PlanQuotas {
  // Short names (common in API)
  AS?: number;
  RS?: number;
  RU?: number;
  AIU?: number;
  // Long names (alternative API format)
  assessments?: number;
  resume_scoring?: number;
  resume_uploads?: number;
  resume_storage?: number;
  ai_interviews?: number;
  ai_interview?: number;
  // Other quotas
  max_jobs?: number;
  max_seats?: number;
  storage_gb?: number;
  support_level?: number;
  api_rate_limit?: number;
  total_resume_storage?: number;
}

interface ApiPlan {
  id: number;
  plan_name: string;
  plan_slug: string;
  plan_tier: string;
  description: string;
  billing_period: string;
  base_price: number;
  monthly_price: number;
  currency: string;
  is_active: boolean;
  is_public: boolean;
  is_featured: boolean;
  display_order: number;
  trial_period_days: number;
  included_seats: number;
  features: PlanFeature[];
  quotas?: PlanQuotas;
}

const getBillingPeriodLabel = (period: string): string => {
  switch (period?.toUpperCase()) {
    case 'ANNUAL':
    case 'YEARLY':
      return '/year';
    case 'MONTHLY':
      return '/month';
    case 'QUARTERLY':
      return '/quarter';
    default:
      return '/year';
  }
};

interface DisplayPlan {
  id: string;
  numericId: number;
  name: string;
  description: string;
  price: number | null;
  currency: string;
  billingPeriod: string;
  icon: typeof Users | typeof Building2 | typeof Zap;
  gradient: string;
  popular: boolean;
  features: string[];
  quotas?: PlanQuotas;
  // Separate quotas for monthly and annual - from API directly
  monthlyQuotas?: PlanQuotas;
  annualQuotas?: PlanQuotas;
  // Discount percentage from API
  discountPercentage?: number;
  isCurrent: boolean;
  // Track which billing period is current (for button state based on toggle)
  isCurrentMonthly: boolean;
  isCurrentAnnual: boolean;
  // New fields for monthly/annual plan variants
  monthlyPlanId?: number;
  annualPlanId?: number;
  monthlyPrice?: number | null;
  annualPrice?: number | null;
  planSlug: string;
}

interface CompanySettings {
  id?: string;
  tenant_id?: string;
  current_plan_id?: number;
  current_plan_name?: string;
  subscription_status: string;
  plan_start_date?: string;
  plan_expiry_date?: string;
  last_synced_at?: string;
  status: string;
  max_seats: number | string;  // Can be "unlimited"
  max_jobs: number | string;   // Can be "unlimited"
  max_resume_uploads: number | string;  // Can be "unlimited"
  max_resume_searches: number | string; // Can be "unlimited"
  max_assessments: number | string;     // Can be "unlimited"
  max_ai_interviews: number | string;   // Can be "unlimited"
  storage_limit_gb: number | string;    // Can be "unlimited"
  trial_start_date?: string;
  trial_end_date?: string;
  selected_plan_id?: number;
  selected_plan_name?: string;
  selected_plan_price?: number;
  payment_status: string;
  payment_attempted_at?: string;
  payment_reference?: string;
  payment_method?: string;
  created_at?: string;
  updated_at?: string;
}

interface PaymentFormData {
  cardholderName: string;
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  billingAddress: string;
  city: string;
  zipCode: string;
  country: string;
}

interface TransactionResult {
  status: string;
  tenant_id: string;
  old_plan_id: number;
  new_plan_id: number;
  plan_name: string;
  plan_tier: string;
  isolation_type: string;
  schema_per_tenant: boolean;
  database_per_tenant: boolean;
  provisioning: {
    isolation_type: string;
    resource_name: string;
    schema_name?: string;
    database_name?: string;
    status: string;
  };
  subscription_id: number;
  subscription_status: string;
  invoice_id: number;
  invoice_number: string;
  total_amount: number;
  currency?: string;
  transaction_id: number;
  external_transaction_id: string;
  billing_interval: string;
  // Queued upgrade fields
  queued?: boolean;
  queued_upgrade_id?: string;
  auto_apply_date?: string;
  current_plan_expires?: string;
  message?: string;
  stripe?: {
    payment_intent_id: string;
    subscription_id: string;
    status: string;
    payment_method: string;
  };
}

interface QueuedUpgrade {
  id: string;
  current_plan_id: number | null;
  current_plan_name: string | null;
  new_plan_id: number;
  new_plan_name: string;
  payment_amount?: number;
  payment_currency?: string;
  billing_interval?: string;
  isolation_type?: string;
  status: string;
  auto_apply_date: string | null;
  terms_accepted?: boolean;
  terms_accepted_at?: string | null;
  applied_at?: string | null;
  cancelled_at?: string | null;
  cancelled_reason?: string | null;
  plan_quotas?: PlanQuotas;
  extra_data?: Record<string, any>;
  created_at?: string;
  // Admin API fields
  days_until_activation?: number;
  can_cancel?: boolean;
  reason?: string;
  notes?: string;
  billing_invoice_number?: string;
}

interface PlanSettings {
  yearlyDiscountPercentage: number;
  databasePerTenantMonthlyPrice: number;
}

const getIconForPlan = (planName: string, tier: string): typeof Users | typeof Building2 | typeof Zap => {
  const name = planName.toLowerCase();
  const tierLower = tier.toLowerCase();
  if (name.includes('enterprise') || name.includes('premium') || tierLower === 'enterprise') return Zap;
  if (name.includes('business') || name.includes('professional') || name.includes('pro') || tierLower === 'professional') return Building2;
  return Users;
};

const getGradientForPlan = (planName: string, tier: string): string => {
  const name = planName.toLowerCase();
  const tierLower = tier.toLowerCase();
  if (name.includes('enterprise') || name.includes('premium') || tierLower === 'enterprise') return "from-gray-800 to-gray-900";
  if (name.includes('business') || name.includes('professional') || name.includes('pro') || tierLower === 'professional') return "from-gray-700 to-gray-800";
  return "from-gray-600 to-gray-700";
};

const formatCurrency = (amount: number | undefined | null, currency: string): string => {
  if (amount === undefined || amount === null) {
    return '-';
  }
  const currencySymbols: Record<string, string> = {
    'USD': '$',
    'INR': '₹',
    'EUR': '€',
    'GBP': '£',
  };
  const symbol = currencySymbols[currency] || currency + ' ';
  return `${symbol}${amount.toLocaleString()}`;
};

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const getStatusBadge = (status?: string, paymentStatus?: string, trialDays?: number) => {
  if (paymentStatus === 'pending') {
    return { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Pending Payment', icon: Clock };
  }

  if (!status) {
    return { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Unknown', icon: AlertCircle };
  }

  switch (status.toLowerCase()) {
    case 'active':
      return { bg: 'bg-green-100', text: 'text-green-700', label: 'Active', icon: CheckCircle };
    case 'trial':
      return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Free Trial', icon: Clock };
    case 'pending_payment':
      return { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Pending Payment', icon: Clock };
    case 'suspended':
      return { bg: 'bg-red-100', text: 'text-red-700', label: 'Suspended', icon: XCircle };
    case 'expired':
      return { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Expired', icon: XCircle };
    case 'locked':
      return { bg: 'bg-red-100', text: 'text-red-700', label: 'Account Locked', icon: Lock };
    case 'error':
      return { bg: 'bg-red-100', text: 'text-red-700', label: 'Unable to load', icon: AlertCircle };
    case 'loading':
      return { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Loading...', icon: Clock };
    default:
      return { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Unknown', icon: AlertCircle };
  }
};

const getDaysRemaining = (endDate: string): number => {
  const end = new Date(endDate);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

const formatCardNumber = (value: string): string => {
  const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
  const matches = v.match(/\d{4,16}/g);
  const match = (matches && matches[0]) || '';
  const parts = [];
  for (let i = 0, len = match.length; i < len; i += 4) {
    parts.push(match.substring(i, i + 4));
  }
  return parts.length ? parts.join(' ') : value;
};

// Extract numeric quota value from potentially nested objects
// Returns the numeric value or the original value if already primitive
const extractQuotaValue = (value: any): number | string => {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number' || typeof value === 'string') return value;

  // Handle object values (e.g., { subscription: { limit: 10 } } or { limit: 10 })
  if (typeof value === 'object') {
    const numericValue =
      value?.subscription?.limit ??
      value?.limit ??
      value?.total_remaining ??
      value?.value;
    if (numericValue !== undefined) {
      return extractQuotaValue(numericValue); // Recursively extract
    }
  }
  return 0;
};

// Format quota values - handles "unlimited" string, large numbers, and quota objects
const formatQuotaValue = (value: number | string | undefined | null | Record<string, any>): string => {
  if (value === undefined || value === null) return '-';

  // Handle object values (e.g., { subscription: { limit: 10 } } or { limit: 10 })
  if (typeof value === 'object') {
    // Try common paths for quota values
    const numericValue =
      value?.subscription?.limit ??
      value?.limit ??
      value?.total_remaining ??
      value?.value;
    if (numericValue !== undefined) {
      return formatQuotaValue(numericValue); // Recursively format the extracted value
    }
    return '-'; // Object without recognizable structure
  }

  if (value === 'unlimited' || value === 'Unlimited') return 'Unlimited';
  if (typeof value === 'string' && value.toLowerCase() === 'unlimited') return 'Unlimited';
  if (typeof value === 'number') {
    if (value >= 999999) return 'Unlimited';
    return value.toLocaleString();
  }
  return String(value);
};

function CurrentPlanContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { logout, user, isBillingManager } = useAuth();

  // Use shared quota context - prevents duplicate API calls
  const { quotaData: sharedQuotaData, loading: quotaLoading, refetch: refetchQuota } = useQuota();

  // Get encoded plan from URL (from login redirect after signup)
  const encodedPlanFromUrl = searchParams.get('plan');

  const [plans, setPlans] = useState<DisplayPlan[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSelectingPlan, setIsSelectingPlan] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Plan selection flow state
  const [modalStep, setModalStep] = useState<'isolation' | 'tenant' | 'payment' | 'result'>('isolation');
  const [isolationType, setIsolationType] = useState<'schema' | 'database'>('schema');
  const [isNewTenant, setIsNewTenant] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [transactionResult, setTransactionResult] = useState<TransactionResult | null>(null);

  // Payment mode state
  const [paymentMode, setPaymentMode] = useState<'card' | 'upi' | 'netbanking' | 'wallet'>('card');
  const [externalTransactionId, setExternalTransactionId] = useState('');

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPlanForPayment, setSelectedPlanForPayment] = useState<DisplayPlan | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentFormData>({
    cardholderName: '',
    cardNumber: '',
    expiryMonth: '',
    expiryYear: '',
    cvv: '',
    billingAddress: '',
    city: '',
    zipCode: '',
    country: 'India',
  });
  const [formErrors, setFormErrors] = useState<Partial<PaymentFormData>>({});

  // Plan settings from admin API (yearly discount, database extra charge)
  const [planSettings, setPlanSettings] = useState<PlanSettings | null>(null);

  // Billing period toggle
  const [isYearly, setIsYearly] = useState(true);
  // Current plan price from quota-status API
  const [currentPlanPrice, setCurrentPlanPrice] = useState<number | null>(null);
  const [currentPlanCurrency, setCurrentPlanCurrency] = useState<string>('INR');
  const [currentPlanBillingPeriod, setCurrentPlanBillingPeriod] = useState<string>('MONTHLY');
  // Subscription status from quota-status API (source of truth for plan status)
  const [quotaSubscriptionStatus, setQuotaSubscriptionStatus] = useState<string>('loading'); // Will be updated by API response
  const [tenantStatus, setTenantStatus] = useState<{ status: string; message: string } | null>(null);

  // Queued upgrades state
  const [queuedUpgrades, setQueuedUpgrades] = useState<QueuedUpgrade[]>([]);
  const [showTCModal, setShowTCModal] = useState(false);
  const [selectedQueuedUpgrade, setSelectedQueuedUpgrade] = useState<QueuedUpgrade | null>(null);
  const [tcAccepted, setTcAccepted] = useState(false);
  const [isApplyingUpgrade, setIsApplyingUpgrade] = useState(false);
  const [isCancellingUpgrade, setIsCancellingUpgrade] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);

  // Use ref to track if data has been fetched to prevent duplicate calls
  const hasFetchedRef = useRef(false);

  // Get tenant ID from user context or token on mount
  useEffect(() => {
    // First try to get from user context (most reliable for expired subscriptions)
    if (user?.tenantId) {
      setTenantId(user.tenantId);
      console.log('[CurrentPlan] tenant_id set from user context:', user.tenantId);
      return;
    }

    // Fallback: try to parse from JWT token
    const token = localStorage.getItem('accessToken');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setTenantId(payload.tenant_id || null);
        console.log('[CurrentPlan] tenant_id set from token:', payload.tenant_id);
      } catch (e) {
        console.error('Failed to parse token:', e);
      }
    }
  }, [user]);

  // Debug: Log company settings whenever it changes
  useEffect(() => {
    if (companySettings) {
      console.log('[CurrentPlan] Company settings state updated:', {
        plan_name: companySettings.current_plan_name,
        status: companySettings.status,
        trial_start_date: companySettings.trial_start_date,
        trial_end_date: companySettings.trial_end_date,
        plan_start_date: companySettings.plan_start_date,
        plan_expiry_date: companySettings.plan_expiry_date,
      });
    }
  }, [companySettings]);

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      setTenantStatus(null);

      // Use shared quota data from context (prevents duplicate API calls)
      // The sharedQuotaData comes from QuotaContext which is fetched once at dashboard layout level
      const quotaData: any = sharedQuotaData;
      console.log('[CurrentPlan] Using shared quota data from context:', quotaData ? 'available' : 'not yet loaded');

      // Check is_trial from quota-status API (handle both boolean and string)
      const isTrial = quotaData?.is_trial === true || quotaData?.is_trial === 'true' || quotaData?.quota_source === 'FREE_TRIAL';

      // Set subscription status early (even if quotas are missing)
      if (isTrial) {
        setQuotaSubscriptionStatus('trial');
        console.log('[CurrentPlan] Setting subscription_status as trial (is_trial detected)');
      } else if (quotaData) {
        // Not on trial - set to active (or use API status if available)
        const status = quotaData.subscription_status || 'active';
        setQuotaSubscriptionStatus(status);
        console.log('[CurrentPlan] Setting subscription_status as:', status, '(is_trial:', quotaData.is_trial, ')');
      }

      // If quota-status API failed (likely due to expired subscription), set appropriate state
      if (!quotaData) {
        console.log('[CurrentPlan] Quota-status API failed - likely expired subscription, allowing plan selection');
        setQuotaSubscriptionStatus('expired');
        setCompanySettings(prev => ({
          ...(prev || {}),
          current_plan_name: 'Subscription Expired',
          subscription_status: 'expired',
          status: 'expired',
          max_seats: 0,
          max_jobs: 0,
          max_resume_uploads: 0,
          max_resume_searches: 0,
          max_assessments: 0,
          max_ai_interviews: 0,
          storage_limit_gb: 0,
        } as CompanySettings));
        // Don't set error - allow user to select a plan to renew
        // setError('Unable to load subscription data. Please try again later.');
      }

      if (quotaData?.quotas || quotaData) {

        // Update company settings with data from quota-status API
        const quotas = quotaData.quotas || {};

        // For FREE TRIAL: Get dates from root level (backend returns trial_start_date/trial_end_date at root)
        const trialStartDate = quotaData.trial_start_date || quotaData.trial_info?.trial_start_date || null;
        const trialEndDate = quotaData.trial_end_date || quotaData.trial_info?.trial_end_date || null;

        // For PAID PLAN: Get dates from root level (plan_start_date, plan_expiry_date) or billing_period
        const planStartDate = quotaData.plan_start_date || quotaData.billing_period?.start || null;
        const planEndDate = quotaData.plan_expiry_date || quotaData.billing_period?.end || null;

        console.log('[CurrentPlan] is_trial:', isTrial);
        console.log('[CurrentPlan] trial_info:', quotaData.trial_info);
        console.log('[CurrentPlan] plan_info:', quotaData.plan_info);
        console.log('[CurrentPlan] Dates - trial:', { trialStartDate, trialEndDate }, 'plan:', { planStartDate, planEndDate });
        console.log('[CurrentPlan] Setting dates in state - trial_start:', trialStartDate, 'trial_end:', trialEndDate, 'plan_start:', planStartDate, 'plan_expiry:', planEndDate);

        setCompanySettings(prev => ({
          ...(prev || {}),
          // For trial users, always show "Free Trial" as plan name
          current_plan_name: isTrial ? 'Free Trial' : (quotaData.plan_name || prev?.current_plan_name),
          current_plan_id: quotaData.plan_info?.plan_id || prev?.current_plan_id,
          subscription_status: isTrial ? 'trial' : (quotaData.subscription_status || 'active'),
          status: isTrial ? 'trial' : (quotaData.subscription_status || 'active'),
          // Set trial dates if available
          trial_start_date: trialStartDate || prev?.trial_start_date,
          trial_end_date: trialEndDate || prev?.trial_end_date,
          // Set plan dates if available (keep existing if API doesn't return new ones)
          plan_start_date: planStartDate || prev?.plan_start_date,
          plan_expiry_date: planEndDate || prev?.plan_expiry_date,
          // Update quota limits from quota-status API (single source of truth for both trial and paid users)
          // Use extractQuotaValue to handle potential object values from API
          // Handle both short (RU, RS, AS, AIU) and long (resume_uploads, resume_scoring, etc.) property names
          max_seats: extractQuotaValue(quotas?.max_seats || prev?.max_seats || 0),
          max_jobs: extractQuotaValue(quotas?.max_jobs || prev?.max_jobs || 0),
          max_resume_uploads: extractQuotaValue((quotas?.RU ?? quotas?.resume_uploads ?? quotas?.resume_storage) || prev?.max_resume_uploads || 0),
          max_resume_searches: extractQuotaValue((quotas?.RS ?? quotas?.resume_scoring) || prev?.max_resume_searches || 0),
          max_assessments: extractQuotaValue((quotas?.AS ?? quotas?.assessments) || prev?.max_assessments || 0),
          max_ai_interviews: extractQuotaValue((quotas?.AIU ?? quotas?.ai_interviews ?? quotas?.ai_interview) || prev?.max_ai_interviews || 0),
          storage_limit_gb: extractQuotaValue(quotas?.storage_gb || prev?.storage_limit_gb || 0),
        } as CompanySettings));

        console.log('[CurrentPlan] isTrial:', isTrial, 'quotas:', quotas);

        // Extract subscribed_price from plan_info (what user is actually paying)
        if (!isTrial && quotaData.plan_info?.subscribed_price !== undefined) {
          setCurrentPlanPrice(quotaData.plan_info.subscribed_price);
          console.log('[CurrentPlan] Setting price from plan_info.subscribed_price:', quotaData.plan_info.subscribed_price);
        } else if (isTrial) {
          setCurrentPlanPrice(0); // Free trial has no price
        }

        // API returns billing_period (ANNUAL/MONTHLY) - this is the plan type
        // billing_interval might be different (e.g., monthly payments on annual plan)
        if (quotaData.plan_info?.billing_period) {
          setCurrentPlanBillingPeriod(quotaData.plan_info.billing_period);
          console.log('[CurrentPlan] Billing period:', quotaData.plan_info.billing_period, ', billing_interval:', quotaData.plan_info.billing_interval);
        }
      }

      // Fetch plan settings (yearly discount, database extra charge)
      try {
        const planSettingsResponse = await fetch(`${API_URL}/addons/plan-settings`);
        if (planSettingsResponse.ok) {
          const planSettingsResult = await planSettingsResponse.json();
          const settings = planSettingsResult.data || planSettingsResult;
          setPlanSettings({
            yearlyDiscountPercentage: settings.yearlyDiscountPercentage,
            databasePerTenantMonthlyPrice: settings.databasePerTenantMonthlyPrice,
          });
          console.log('[CurrentPlan] Plan settings:', settings);
        }
      } catch (planSettingsError) {
        console.log('Could not fetch plan settings');
      }

      // NOTE: All plan data now comes from /usage/quota-status API (Admin API)
      // No need to call /settings/company-settings - quota-status is the single source of truth
      console.log('[CurrentPlan] Using quota-status API as single source of truth for plan data');

      // Get tenant_id from AuthContext (already fetched during login)
      if (user?.tenantId) {
        setTenantId(user.tenantId);
        console.log('[CurrentPlan] tenant_id from AuthContext:', user.tenantId);
      }

      // Fetch plans from backend API (which proxies to external API)
      const plansResponse = await fetch(`${API_URL}/subscription/public/plans`);
      if (!plansResponse.ok) {
        throw new Error('Failed to fetch plans');
      }
      const plansResult = await plansResponse.json();

      // Handle new API structure: { data: { plans: [...] } } with billing_options
      const plansArray = plansResult.data?.plans || plansResult.plans || [];

      interface GroupedPlan {
        plan_name: string;
        plan_slug: string;
        plan_tier: string;
        description: string;
        trial_period_days?: number;
        billing_options: {
          monthly?: ApiPlan;
          annual?: ApiPlan;
        };
      }

      const transformedPlans: DisplayPlan[] = (Array.isArray(plansArray) ? plansArray : [])
        .map((groupedPlan: GroupedPlan) => {
          const monthly = groupedPlan.billing_options?.monthly;
          const annual = groupedPlan.billing_options?.annual;

          // Use monthly plan as base, fallback to annual if no monthly
          const basePlan = monthly || annual;
          if (!basePlan) return null;

          // Skip if neither monthly nor annual is active/public
          if (!monthly?.is_active && !annual?.is_active) return null;
          if (!monthly?.is_public && !annual?.is_public) return null;

          const featureNames = basePlan.features
            ?.filter(f => f.is_enabled)
            ?.map(f => f.feature_name) || [];

          // Check if monthly or annual plan is the current plan
          // Use quota-status API as single source of truth for plan info
          const currentPlanId = quotaData?.plan_info?.plan_id;
          const currentPlanName = quotaData?.plan_name ?? quotaData?.plan_info?.plan_name;

          const isCurrentMonthly = currentPlanId !== undefined && currentPlanId !== null &&
            Number(currentPlanId) === Number(monthly?.id);
          const isCurrentAnnual = currentPlanId !== undefined && currentPlanId !== null &&
            Number(currentPlanId) === Number(annual?.id);
          const isCurrent = isCurrentMonthly || isCurrentAnnual ||
            (currentPlanName && currentPlanName.toLowerCase() === groupedPlan.plan_name.toLowerCase());

          return {
            id: String(basePlan.id),
            numericId: basePlan.id,
            name: groupedPlan.plan_name,
            description: groupedPlan.description,
            price: monthly?.base_price ?? null,
            currency: basePlan.currency,
            billingPeriod: basePlan.billing_period,
            icon: getIconForPlan(groupedPlan.plan_name, groupedPlan.plan_tier),
            gradient: getGradientForPlan(groupedPlan.plan_name, groupedPlan.plan_tier),
            popular: basePlan.is_featured || false,
            features: featureNames,
            quotas: basePlan.quotas,
            // Store separate quotas for monthly and annual from API
            monthlyQuotas: monthly?.quotas,
            annualQuotas: annual?.quotas,
            // Discount percentage from API
            discountPercentage: (groupedPlan as any).discount_percentage ?? annual?.discount_percentage,
            isCurrent,
            // Track which billing period is current
            isCurrentMonthly,
            isCurrentAnnual,
            // Monthly/annual variants from billing_options
            monthlyPlanId: monthly?.id,
            annualPlanId: annual?.id,
            monthlyPrice: monthly?.base_price ?? null,
            annualPrice: annual?.base_price ?? null,
            planSlug: groupedPlan.plan_slug,
          };
        })
        .filter((plan): plan is DisplayPlan => plan !== null)
        .sort((a, b) => {
          // Sort by price ascending (lowest first)
          const orderA = a.monthlyPrice || 0;
          const orderB = b.monthlyPrice || 0;
          return orderA - orderB;
        });

      setPlans(transformedPlans);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch queued upgrades
  const fetchQueuedUpgrades = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) return;

      const response = await fetch(`${API_URL}/subscription/queued-upgrades`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      // Handle 401 - logout and redirect
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (response.ok) {
        const result = await response.json();
        const upgrades = result.data?.queued_upgrades || [];
        setQueuedUpgrades(upgrades);
        console.log('[CurrentPlan] Queued upgrades:', upgrades);
      }
    } catch (err) {
      console.error('[CurrentPlan] Error fetching queued upgrades:', err);
    }
  };

  // Apply queued upgrade immediately
  const handleApplyUpgrade = async () => {
    if (!selectedQueuedUpgrade || !tcAccepted) return;

    try {
      setIsApplyingUpgrade(true);
      setError(null);

      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_URL}/subscription/queued-upgrades/${selectedQueuedUpgrade.id}/apply`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          queued_upgrade_id: selectedQueuedUpgrade.id,
          terms_accepted: true,
        }),
      });

      // Handle 401 - logout and redirect
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const data = await response.json();

      if (response.ok && (data.status === 'success' || data.status === 'partial')) {
        // Check if it was a partial success (local update succeeded but admin API failed)
        if (data.status === 'partial') {
          // Show warning message for partial success
          const adminError = data.data?.admin_error || 'Admin system sync failed';
          toast.warning('Plan upgraded with warnings', {
            description: `${adminError}. You will be redirected to login.`,
            duration: 3000,
          });
        } else {
          toast.success(`Successfully upgraded to ${selectedQueuedUpgrade.new_plan_name}!`, {
            description: 'You will be redirected to login to apply your new plan.',
            duration: 3000,
          });
        }

        setShowTCModal(false);
        setSelectedQueuedUpgrade(null);
        setTcAccepted(false);

        // Plan upgraded successfully - logout and redirect to login
        // This ensures user gets fresh session with new plan data
        setTimeout(() => {
          logout();
          router.push('/login?upgraded=true');
        }, 2000);
        return; // Exit early
      } else {
        // Handle both string and object error formats
        const errorDetail = data.detail;
        let errorMsg = typeof errorDetail === 'string'
          ? errorDetail
          : errorDetail?.message || data.data?.message || 'Failed to apply upgrade';

        // Check for migration/database errors and show user-friendly message
        if (errorMsg.toLowerCase().includes('migration failed') ||
            errorMsg.toLowerCase().includes('does not exist') ||
            errorMsg.toLowerCase().includes('relation') ||
            errorMsg.toLowerCase().includes('database error')) {
          errorMsg = 'We encountered an issue while applying your upgrade. Please contact support for assistance.';
        }

        setError(errorMsg);
      }
    } catch (err) {
      console.error('[CurrentPlan] Error applying upgrade:', err);
      let errorMsg = err instanceof Error ? err.message : 'Failed to apply upgrade';

      // Check for migration/database errors and show user-friendly message
      if (errorMsg.toLowerCase().includes('migration failed') ||
          errorMsg.toLowerCase().includes('does not exist') ||
          errorMsg.toLowerCase().includes('relation') ||
          errorMsg.toLowerCase().includes('database error')) {
        errorMsg = 'We encountered an issue while applying your upgrade. Please contact support for assistance.';
      }

      setError(errorMsg);
    } finally {
      setIsApplyingUpgrade(false);
    }
  };

  // Cancel queued upgrade (called from Cancel Modal)
  const handleCancelUpgrade = async () => {
    if (!selectedQueuedUpgrade) return;

    try {
      setIsCancellingUpgrade(true);
      setError(null);

      const token = localStorage.getItem('accessToken');
      const reasonParam = encodeURIComponent(cancelReason.trim() || 'Cancelled by user');
      const response = await fetch(`${API_URL}/subscription/queued-upgrades/${selectedQueuedUpgrade.id}?reason=${reasonParam}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      // Handle 401 - logout and redirect
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        setSuccessMessage(`Queued upgrade to ${selectedQueuedUpgrade.new_plan_name} has been cancelled.`);
        setShowCancelModal(false);
        setSelectedQueuedUpgrade(null);
        setCancelReason('');
        await fetchQueuedUpgrades();
      } else {
        // Handle both string and object error formats
        const errorDetail = data.detail;
        const errorMsg = typeof errorDetail === 'string'
          ? errorDetail
          : errorDetail?.message || 'Failed to cancel upgrade';
        setError(errorMsg);
      }
    } catch (err) {
      console.error('[CurrentPlan] Error cancelling upgrade:', err);
      setError(err instanceof Error ? err.message : 'Failed to cancel upgrade');
    } finally {
      setIsCancellingUpgrade(false);
    }
  };

  useEffect(() => {
    // Wait for shared quota data to be loaded before fetching other data
    if (quotaLoading) return;

    // Prevent duplicate calls on re-renders or React Strict Mode
    if (hasFetchedRef.current) return;

    // Fetch data even if sharedQuotaData is null (e.g., when subscription is expired)
    // This allows expired users to see available plans and renew their subscription
    hasFetchedRef.current = true;
    fetchData();
    fetchQueuedUpgrades();
  }, [sharedQuotaData, quotaLoading]);

  // Auto-select plan from URL parameter (from pricing page flow)
  useEffect(() => {
    if (encodedPlanFromUrl && plans.length > 0 && !selectedPlanForPayment) {
      try {
        const decodedPlanId = decodePlanId(encodedPlanFromUrl);
        if (decodedPlanId) {
          const planToSelect = plans.find(p => p.id === decodedPlanId || p.numericId === parseInt(decodedPlanId));
          if (planToSelect && planToSelect.price) {
            console.log('[CurrentPlan] Auto-selecting plan from URL:', planToSelect.name);
            // Auto-trigger the Choose Plan flow
            handleChoosePlan(planToSelect);
            // Remove plan parameter from URL to prevent re-triggering
            const newUrl = window.location.pathname;
            window.history.replaceState({}, '', newUrl);
          }
        }
      } catch (err) {
        console.error('[CurrentPlan] Error auto-selecting plan:', err);
      }
    }
  }, [encodedPlanFromUrl, plans, selectedPlanForPayment]);

  const validatePaymentForm = (): boolean => {
    const errors: Partial<PaymentFormData> = {};

    if (!paymentForm.cardholderName.trim()) {
      errors.cardholderName = 'Cardholder name is required';
    }

    const cardNum = paymentForm.cardNumber.replace(/\s/g, '');
    if (!cardNum || cardNum.length < 13 || cardNum.length > 19) {
      errors.cardNumber = 'Valid card number is required';
    }

    if (!paymentForm.expiryMonth || !paymentForm.expiryYear) {
      errors.expiryMonth = 'Expiry date is required';
    }

    if (!paymentForm.cvv || paymentForm.cvv.length < 3) {
      errors.cvv = 'Valid CVV is required';
    }

    if (!paymentForm.billingAddress.trim()) {
      errors.billingAddress = 'Billing address is required';
    }

    if (!paymentForm.city.trim()) {
      errors.city = 'City is required';
    }

    if (!paymentForm.zipCode.trim()) {
      errors.zipCode = 'ZIP code is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Generate a unique transaction ID for card payments
  const generateTransactionId = (): string => {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `TXN-${timestamp}-${random}`.toUpperCase();
  };

  const handleChoosePlan = (plan: DisplayPlan) => {
    // Check if plan has any pricing (monthly OR annual)
    if (!plan.monthlyPrice && !plan.annualPrice) {
      setError('Cannot select a plan without a price');
      return;
    }
    setSelectedPlanForPayment(plan);
    setModalStep('isolation');
    setIsolationType('schema'); // Default to schema (checkbox unchecked)
    setIsNewTenant(false); // Always use existing
    // Keep the current billing period toggle state (isYearly remains as-is)
    setTransactionResult(null);
    setError(null);
    setShowPaymentModal(true);
  };

  const handlePaymentSubmit = async () => {
    console.log('handlePaymentSubmit called', { selectedPlanForPayment, tenantId });

    if (!selectedPlanForPayment) {
      setError('Please select a plan');
      return;
    }

    if (!tenantId) {
      setError('Tenant ID not found. Please refresh the page and try again.');
      return;
    }

    // Generate transaction ID
    const transactionId = generateTransactionId();

    try {
      setIsSelectingPlan(true);
      setError(null);
      setSuccessMessage(null);

      const token = localStorage.getItem('accessToken');
      const apiUrl = `${API_URL}/subscription/${tenantId}/select-plan`;

      // Request body per API spec - use correct plan_id based on billing period AND availability
      // If user selects yearly but only monthly exists, use monthly plan ID and MONTHLY interval
      // If user selects monthly but only yearly exists, use yearly plan ID and ANNUAL interval
      const hasAnnual = !!selectedPlanForPayment.annualPlanId;
      const hasMonthly = !!selectedPlanForPayment.monthlyPlanId;

      // Determine actual billing interval based on availability
      let actualBillingInterval: 'ANNUAL' | 'MONTHLY';
      let planId: number;

      if (isYearly && hasAnnual) {
        // User wants yearly and it's available
        actualBillingInterval = 'ANNUAL';
        planId = selectedPlanForPayment.annualPlanId!;
      } else if (!isYearly && hasMonthly) {
        // User wants monthly and it's available
        actualBillingInterval = 'MONTHLY';
        planId = selectedPlanForPayment.monthlyPlanId!;
      } else if (hasAnnual) {
        // Only annual available (user wanted monthly but it's not available)
        actualBillingInterval = 'ANNUAL';
        planId = selectedPlanForPayment.annualPlanId!;
      } else if (hasMonthly) {
        // Only monthly available (user wanted yearly but it's not available)
        actualBillingInterval = 'MONTHLY';
        planId = selectedPlanForPayment.monthlyPlanId!;
      } else {
        // Fallback to numericId (shouldn't happen with proper validation)
        actualBillingInterval = isYearly ? 'ANNUAL' : 'MONTHLY';
        planId = selectedPlanForPayment.numericId;
      }

      console.log('[SelectPlan] Plan IDs available:', {
        monthlyPlanId: selectedPlanForPayment.monthlyPlanId,
        annualPlanId: selectedPlanForPayment.annualPlanId,
        numericId: selectedPlanForPayment.numericId,
        isYearly,
        actualBillingInterval,
        selectedPlanId: planId,
      });

      const requestBody = {
        plan_id: planId,
        schema_per_tenant: isolationType === 'schema',
        database_per_tenant: isolationType === 'database',
        external_transaction_id: transactionId,
        billing_interval: actualBillingInterval,
      };

      console.log('Calling API:', apiUrl);
      console.log('Auth - Token exists:', !!token);
      console.log('Request body:', requestBody);

      if (!token) {
        setError('Authentication token not found. Please login again.');
        setIsSelectingPlan(false);
        return;
      }

      // Call billing API with Bearer token and timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 2 minute timeout

      let response;
      let data;
      try {
        response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        data = await response.json();
      } catch (fetchErr: any) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
          throw new Error('Request timed out. Please try again or contact support.');
        }
        throw fetchErr;
      }

      if (response.ok && (data.status === 'success' || response.status === 200)) {
        console.log('[CurrentPlan] Plan selection successful:', data);

        // Store transaction result and show success modal
        const result = data.data || data;
        setTransactionResult(result);
        setModalStep('result');

        // PS02 Fix: Show toast notification for payment success
        if (result.queued) {
          toast.success('Payment successful! Upgrade queued.', {
            description: `Your upgrade to ${result.plan_name} will be applied automatically on ${result.auto_apply_date ? new Date(result.auto_apply_date).toLocaleDateString() : 'plan expiry'}.`,
            duration: 6000,
          });
        } else {
          toast.success('Payment successful! Your plan is now active.', {
            description: `You're now on the ${result.plan_name} plan. All resources have been provisioned.`,
            duration: 5000,
          });
        }

        // Check if upgrade was queued (has active plan)
        if (result.queued) {
          console.log('[CurrentPlan] Upgrade queued:', result);
          // Refresh queued upgrades list
          await fetchQueuedUpgrades();
        } else {
          // Plan upgraded successfully - logout and redirect to login
          // This ensures user gets fresh session with new plan data
          toast.success('Plan upgraded successfully!', {
            description: 'You will be redirected to login to apply your new plan.',
            duration: 3000,
          });

          // Wait a moment for the toast to show, then logout
          setTimeout(() => {
            logout();
            router.push('/login?upgraded=true');
          }, 2000);
          return; // Exit early, no need to update local state
        }

        // Refresh data after queued upgrade
        await fetchData();

        // Notify Header component to refresh quota/plan display
        window.dispatchEvent(new CustomEvent('planChanged'));
      } else {
        // Handle both string and object error formats
        const errorDetail = data.detail;
        let errorMessage = typeof errorDetail === 'string'
          ? errorDetail
          : errorDetail?.message || data.message || 'Failed to upgrade plan';

        // Check for migration/database errors and show user-friendly message
        if (errorMessage.toLowerCase().includes('migration failed') ||
            errorMessage.toLowerCase().includes('does not exist') ||
            errorMessage.toLowerCase().includes('relation') ||
            errorMessage.toLowerCase().includes('database error')) {
          errorMessage = 'We encountered an issue while upgrading your plan. Please contact support for assistance.';
        }

        setError(errorMessage);
        toast.error('Plan Selection Failed', {
          description: errorMessage,
          duration: 6000,
        });
      }
    } catch (err) {
      console.error('Error selecting plan:', err);
      let errorMessage = err instanceof Error ? err.message : 'Failed to select plan';

      // Check for migration/database errors and show user-friendly message
      if (errorMessage.toLowerCase().includes('migration failed') ||
          errorMessage.toLowerCase().includes('does not exist') ||
          errorMessage.toLowerCase().includes('relation') ||
          errorMessage.toLowerCase().includes('database error')) {
        errorMessage = 'We encountered an issue while upgrading your plan. Please contact support for assistance.';
      }

      setError(errorMessage);
      toast.error('Plan Selection Failed', {
        description: errorMessage,
        duration: 6000,
      });
    } finally {
      setIsSelectingPlan(false);
    }
  };

  const handleSimulatePayment = async (success: boolean) => {
    try {
      setIsProcessingPayment(true);
      setError(null);
      setSuccessMessage(null);

      const response = await api.post<CompanySettings>('/settings/payment-status', {
        payment_status: success ? 'success' : 'failed',
        payment_reference: success ? `PAY-${Date.now()}` : null,
        payment_method: success ? 'card' : null,
      });

      setCompanySettings(response.data);

      if (success) {
        setSuccessMessage('Payment successful! Your plan is now active.');
      } else {
        if (response.data.status === 'locked') {
          setError('Payment failed and trial has expired. Your account is now locked.');
        } else {
          setError('Payment failed. Your trial continues.');
        }
      }

      await fetchData();
    } catch (err) {
      console.error('Error processing payment:', err);
      setError(err instanceof Error ? err.message : 'Failed to process payment');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const currentPlan = plans.find(p => p.isCurrent);
  const selectedPlan = plans.find(p => p.numericId === companySettings?.selected_plan_id);
  // Use quota-status API as source of truth for subscription status
  // quotaSubscriptionStatus defaults to 'trial' and is updated by API response
  const isOnTrial = quotaSubscriptionStatus.toLowerCase() === 'trial';
  const isPendingPayment = companySettings?.subscription_status?.toLowerCase() === 'pending_payment' ||
                           companySettings?.payment_status === 'pending';
  const isLocked = companySettings?.status?.toLowerCase() === 'locked';
  const isActive = quotaSubscriptionStatus.toLowerCase() === 'active';
  const isExpiredSubscription = quotaSubscriptionStatus.toLowerCase() === 'expired' ||
                                 companySettings?.status?.toLowerCase() === 'expired';
  // Use quotaSubscriptionStatus as source of truth for status badge
  // Get trial days remaining from quota-status API (single source of truth)
  const statusBadge = getStatusBadge(quotaSubscriptionStatus, companySettings?.payment_status, sharedQuotaData?.trial_info?.days_remaining);
  const StatusIcon = statusBadge.icon;

  // Get remaining days from quota-status API (single source of truth)
  // For trial users: use trial_info.days_remaining from Admin API
  // For paid users: calculate from plan expiry date
  const trialDaysRemaining = isOnTrial
    ? (sharedQuotaData?.trial_info?.days_remaining ?? (companySettings?.trial_end_date ? getDaysRemaining(companySettings.trial_end_date) : undefined))
    : (companySettings?.plan_expiry_date ? getDaysRemaining(companySettings.plan_expiry_date) : undefined);

  // Calculate prices for payment (using actual API prices)
  const calculatePrices = () => {
    const monthlyPrice = selectedPlanForPayment?.monthlyPrice || 0;
    const yearlyPrice = selectedPlanForPayment?.annualPrice || 0;
    const yearlyFullPrice = monthlyPrice * 12;
    const planPrice = isYearly ? yearlyPrice : monthlyPrice;
    const dbExtraCharge = isolationType === 'database' ? (planSettings?.databasePerTenantMonthlyPrice || 0) : 0;
    const dbChargeTotal = isYearly ? dbExtraCharge * 12 : dbExtraCharge;
    const totalAmount = planPrice + dbChargeTotal;
    return { basePrice: monthlyPrice, monthlyPrice, yearlyPrice, yearlyFullPrice, planPrice, dbExtraCharge, dbChargeTotal, totalAmount };
  };

  if (isLoading) {
    return (
      <main className="flex-1 p-8 overflow-y-auto bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-gray-500 animate-spin" />
            <p className="mt-4 text-gray-600">Loading subscription details...</p>
          </div>
        </div>
      </main>
    );
  }

  // Show pending account status
  if (tenantStatus) {
    const statusColors = {
      PENDING: { bg: 'bg-amber-50', border: 'border-amber-300', text: 'text-amber-800', icon: 'text-amber-500' },
      SUSPENDED: { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-800', icon: 'text-red-500' },
      LOCKED: { bg: 'bg-red-50', border: 'border-red-300', text: 'text-red-800', icon: 'text-red-500' },
    };
    const colors = statusColors[tenantStatus.status as keyof typeof statusColors] || statusColors.PENDING;

    return (
      <main className="flex-1 p-8 overflow-y-auto bg-gray-50">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center shadow-lg">
                <CreditCard className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">Current Plan</h1>
                <p className="text-sm text-gray-600">Manage your subscription and billing</p>
              </div>
            </div>
          </div>

          {/* Account Status Banner */}
          <div className={`${colors.bg} border-2 ${colors.border} rounded-xl p-8 mb-8`}>
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 ${colors.bg} rounded-full flex items-center justify-center flex-shrink-0`}>
                <Clock className={`w-6 h-6 ${colors.icon}`} />
              </div>
              <div className="flex-1">
                <h3 className={`text-xl font-semibold ${colors.text} mb-2`}>
                  {tenantStatus.status === 'PENDING' ? 'Account Activation Pending' :
                   tenantStatus.status === 'SUSPENDED' ? 'Account Suspended' :
                   tenantStatus.status === 'LOCKED' ? 'Account Locked' : 'Account Status'}
                </h3>
                <p className={`${colors.text} mb-4`}>
                  {tenantStatus.message}
                </p>
                <div className={`text-sm ${colors.text} space-y-2`}>
                  {tenantStatus.status === 'PENDING' && (
                    <>
                      <p className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4" />
                        Your account has been created successfully
                      </p>
                      <p className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        Activation typically takes a few minutes
                      </p>
                      <p className="flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        You'll receive an email once activated
                      </p>
                    </>
                  )}
                </div>
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => fetchData()}
                    className="px-4 py-2 bg-white border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
                  >
                    <Loader2 className="w-4 h-4" />
                    Refresh Status
                  </button>
                  <a
                    href="mailto:support@talentflow.com"
                    className={`px-4 py-2 ${colors.text} underline flex items-center gap-2`}
                  >
                    <Mail className="w-4 h-4" />
                    Contact Support
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gray-50">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center shadow-lg">
              <CreditCard className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Current Plan</h1>
              <p className="text-sm text-gray-600">Manage your subscription and billing</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-8 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <p className="text-green-700">{successMessage}</p>
          </div>
        )}

        {/* Account Locked Warning */}
        {isLocked && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6 mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Lock className="w-8 h-8 text-red-500" />
              <div>
                <h3 className="text-lg font-semibold text-red-700">Account Locked</h3>
                <p className="text-red-600">Your trial has ended and payment was not completed. Please select a plan and complete payment to continue.</p>
              </div>
            </div>
          </div>
        )}

        {/* Pending Payment Card */}
        {isPendingPayment && selectedPlan && (
          <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Clock className="w-8 h-8 text-orange-500" />
                <div>
                  <h3 className="text-lg font-semibold text-orange-700">Payment Pending</h3>
                  <p className="text-orange-600">
                    Complete payment for <strong>{selectedPlan.name}</strong> - {formatCurrency(selectedPlan.price || 0, selectedPlan.currency)}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => handleSimulatePayment(true)}
                disabled={isProcessingPayment}
                className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessingPayment ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <CheckCircle className="w-5 h-5" />
                )}
                Confirm Payment Success
              </button>
              <button
                onClick={() => handleSimulatePayment(false)}
                disabled={isProcessingPayment}
                className="flex-1 bg-red-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessingPayment ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <XCircle className="w-5 h-5" />
                )}
                Payment Failed
              </button>
            </div>
          </div>
        )}

        {/* Current Plan Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Your Current Plan</h2>
              <p className="text-sm text-gray-600">
                {isLocked
                  ? 'Your account is locked. Please select a plan and complete payment.'
                  : isOnTrial
                    ? `You are on a Free Trial${trialDaysRemaining ? ` - ${trialDaysRemaining} days remaining` : ''}`
                    : isActive
                      ? `You are on the ${(companySettings?.current_plan_name || currentPlan?.name || '').replace(/\s*\([^)]*\)\s*$/, '')} plan`
                      : isPendingPayment
                        ? 'Complete payment to activate your selected plan'
                        : companySettings?.current_plan_name ? `You are on the ${companySettings.current_plan_name.replace(/\s*\([^)]*\)\s*$/, '')} plan` : ''
                }
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusBadge.bg} ${statusBadge.text} flex items-center gap-2`}>
              <StatusIcon className="w-4 h-4" />
              {statusBadge.label}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Plan</p>
              <p className="text-xl font-semibold text-gray-900">
                {isOnTrial ? 'Free Trial' : (companySettings?.current_plan_name?.replace(/\s*\([^)]*\)\s*$/, '') || '-')}
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Price</p>
              <p className="text-xl font-semibold text-gray-900">
                {isOnTrial ? (
                  'Free'
                ) : currentPlanPrice !== null && currentPlanPrice > 0 ? (
                  <>{formatCurrency(currentPlanPrice, currentPlanCurrency)}<span className="text-sm font-normal text-gray-500">{getBillingPeriodLabel(currentPlanBillingPeriod)}</span></>
                ) : currentPlan?.price ? (
                  <>{formatCurrency(currentPlan.price, currentPlan.currency)}</>
                ) : (
                  '-'
                )}
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">
                {isOnTrial ? 'Trial Started' : 'Plan Start'}
              </p>
              <p className="text-xl font-semibold text-gray-900">
                {isOnTrial
                  ? (companySettings?.trial_start_date
                      ? formatDate(companySettings.trial_start_date)
                      : '-')
                  : (companySettings?.plan_start_date
                      ? formatDate(companySettings.plan_start_date)
                      : '-')
                }
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">
                {isOnTrial ? 'Trial Ends' : 'Plan Expires'}
              </p>
              <p className="text-xl font-semibold text-gray-900">
                {isOnTrial
                  ? (companySettings?.trial_end_date
                      ? formatDate(companySettings.trial_end_date)
                      : '-')
                  : (companySettings?.plan_expiry_date
                      ? formatDate(companySettings.plan_expiry_date)
                      : '-')
                }
              </p>
            </div>
          </div>

          {/* PS03 Fix: Renew Plan Button for Expired/Expiring Subscriptions */}
          {!isOnTrial && !isPendingPayment && !isLocked && companySettings?.plan_expiry_date && currentPlan && (
            (() => {
              const expiryDate = new Date(companySettings.plan_expiry_date);
              const now = new Date();
              const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              const isExpired = daysUntilExpiry < 0;
              const isExpiringSoon = daysUntilExpiry >= 0 && daysUntilExpiry <= 7;

              if (isExpired || isExpiringSoon) {
                return (
                  <div className={`mt-6 p-4 rounded-lg border-2 ${
                    isExpired
                      ? 'bg-red-50 border-red-300'
                      : 'bg-amber-50 border-amber-300'
                  }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <AlertCircle className={`w-6 h-6 ${
                          isExpired ? 'text-red-600' : 'text-amber-600'
                        }`} />
                        <div>
                          <h4 className={`font-medium ${
                            isExpired ? 'text-red-800' : 'text-amber-800'
                          }`}>
                            {isExpired ? 'Plan Expired' : 'Plan Expiring Soon'}
                          </h4>
                          <p className={`text-sm ${
                            isExpired ? 'text-red-700' : 'text-amber-700'
                          }`}>
                            {isExpired
                              ? `Your ${currentPlan.name} plan expired ${Math.abs(daysUntilExpiry)} days ago`
                              : `Your ${currentPlan.name} plan expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}`
                            }
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedPlanForPayment(currentPlan);
                          setModalStep('isolation');
                          setIsolationType('schema');
                          setIsNewTenant(false);
                          setIsYearly(currentPlanBillingPeriod?.toUpperCase() === 'ANNUAL');
                          setTransactionResult(null);
                          setError(null);
                          setShowPaymentModal(true);
                        }}
                        className={`px-5 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                          isExpired
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-amber-600 hover:bg-amber-700 text-white'
                        }`}
                      >
                        <ArrowRight className="w-4 h-4" />
                        Renew Current Plan
                      </button>
                    </div>
                  </div>
                );
              }
              return null;
            })()
          )}

          {/* Quotas - Using data from quota-status API via companySettings */}
          {companySettings && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-4">Your Plan Limits</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatQuotaValue(companySettings.max_seats)}
                  </p>
                  <p className="text-xs text-gray-600">Team Seats</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatQuotaValue(companySettings.max_jobs)}
                  </p>
                  <p className="text-xs text-gray-600">Job Postings</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatQuotaValue(companySettings.max_resume_uploads)}
                  </p>
                  <p className="text-xs text-gray-600">Resume Storage</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatQuotaValue(companySettings.max_resume_searches)}
                  </p>
                  <p className="text-xs text-gray-600">Resume Scores</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatQuotaValue(companySettings.max_assessments)}
                  </p>
                  <p className="text-xs text-gray-600">Assessments</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-semibold text-gray-900">
                    {formatQuotaValue(companySettings.max_ai_interviews)}
                  </p>
                  <p className="text-xs text-gray-600">AI Interviews</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Queued Upgrades Section */}
        {queuedUpgrades.length > 0 && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6 mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="w-8 h-8 text-amber-600" />
              <div>
                <h3 className="text-lg font-semibold text-amber-800">Pending Upgrades</h3>
                <p className="text-sm text-amber-700">
                  You have {queuedUpgrades.length} queued upgrade{queuedUpgrades.length > 1 ? 's' : ''} waiting to be applied
                </p>
              </div>
            </div>

            <div className="space-y-4">
              {queuedUpgrades.map((upgrade) => (
                <div key={upgrade.id} className="bg-white rounded-lg p-4 border border-amber-200">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Package className="w-5 h-5 text-gray-600" />
                        <span className="font-semibold text-gray-900">{upgrade.new_plan_name}</span>
                        <Badge className="bg-amber-100 text-amber-700 text-xs">
                          {upgrade.status === 'SCHEDULED' ? 'Scheduled' : 'Queued'}
                        </Badge>
                        {upgrade.days_until_activation !== undefined && upgrade.days_until_activation > 0 && (
                          <span className="text-xs text-amber-600">
                            ({upgrade.days_until_activation} day{upgrade.days_until_activation !== 1 ? 's' : ''} until activation)
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        {upgrade.payment_amount !== undefined && (
                          <div>
                            <span className="text-gray-500">Amount Paid:</span>
                            <span className="ml-1 font-medium text-gray-900">
                              {formatCurrency(upgrade.payment_amount, upgrade.payment_currency || 'INR')}
                            </span>
                          </div>
                        )}
                        {upgrade.billing_interval && (
                          <div>
                            <span className="text-gray-500">Billing:</span>
                            <span className="ml-1 font-medium text-gray-900">{upgrade.billing_interval}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-500">Auto-applies:</span>
                          <span className="ml-1 font-medium text-gray-900">
                            {upgrade.auto_apply_date ? formatDate(upgrade.auto_apply_date) : 'On plan expiry'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Queued on:</span>
                          <span className="ml-1 font-medium text-gray-900">
                            {upgrade.created_at ? formatDate(upgrade.created_at) : '-'}
                          </span>
                        </div>
                      </div>
                      {upgrade.reason && (
                        <p className="text-xs text-gray-500 mt-2">Reason: {upgrade.reason}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => {
                          setSelectedQueuedUpgrade(upgrade);
                          setTcAccepted(false);
                          setShowTCModal(true);
                        }}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors flex items-center gap-2"
                      >
                        <Zap className="w-4 h-4" />
                        Apply Now
                      </button>
                      {upgrade.can_cancel !== false && (
                        <button
                          onClick={() => {
                            setSelectedQueuedUpgrade(upgrade);
                            setCancelReason('');
                            setShowCancelModal(true);
                          }}
                          disabled={isCancellingUpgrade}
                          className="px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors flex items-center gap-2"
                        >
                          <XCircle className="w-4 h-4" />
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-amber-600 mt-4">
              Queued upgrades will automatically apply when your current plan expires.
              Click "Apply Now" to upgrade immediately (remaining credits will be forfeited).
            </p>
          </div>
        )}

        {/* Available Plans - Hidden for Billing Manager (RBAC03) */}
        {!isBillingManager && plans.length > 0 && (
          <>
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 text-center">
                {isOnTrial || isLocked ? 'Choose a Plan' : 'Available Plans'}
              </h2>
              {queuedUpgrades.length > 0 && !isOnTrial && !isLocked && (
                <p className="text-sm text-amber-600 text-center mt-2">
                  You have a pending upgrade queued. Cancel it above or apply it now to select a different plan.
                </p>
              )}

              {/* Billing Period Toggle - No common discount, each plan shows its own */}
              <div className="flex items-center justify-center gap-4 mt-6">
                <span className={`text-lg ${!isYearly ? "text-gray-900 font-medium" : "text-gray-500"}`}>
                  Monthly
                </span>
                <button
                  onClick={() => setIsYearly(!isYearly)}
                  className={`relative w-14 h-8 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 ${
                    isYearly
                      ? "bg-gray-800"
                      : "bg-gray-300"
                  }`}
                  aria-label="Toggle billing period"
                >
                  <span
                    className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
                      isYearly ? "translate-x-6" : "translate-x-0"
                    }`}
                  />
                </button>
                <span className={`text-lg ${isYearly ? "text-gray-900 font-medium" : "text-gray-500"}`}>
                  Yearly
                </span>
              </div>
            </div>
            <div
              className={`grid gap-8 pt-8 max-w-6xl mx-auto ${
                plans.length === 1 ? 'md:grid-cols-1 max-w-md' :
                plans.length === 2 ? 'md:grid-cols-2 max-w-3xl' :
                'md:grid-cols-3'
              }`}
              style={{ gridAutoRows: '1fr' }}
              onMouseLeave={() => setHoveredPlan(null)}
            >
              {[...plans].sort((a, b) => {
                // Sort by price ascending (lowest first)
                const priceA = a.monthlyPrice || a.annualPrice || 0;
                const priceB = b.monthlyPrice || b.annualPrice || 0;
                return priceA - priceB;
              }).map((plan) => {
                const Icon = plan.icon;
                const isSelectedPending = isPendingPayment && companySettings?.selected_plan_id === plan.numericId;
                // Show "Current Plan" only when viewing the matching billing period
                // e.g., if user has Annual plan, show "Current Plan" only when toggle is on Annual
                const isCurrentForToggle = (plan.isCurrentMonthly && !isYearly) || (plan.isCurrentAnnual && isYearly);
                const isHovered = hoveredPlan === plan.id;
                const hasHoveredPlan = hoveredPlan !== null;

                return (
                  <div
                    key={plan.id}
                    className="flex"
                    onMouseEnter={() => setHoveredPlan(plan.id)}
                    style={{
                      transition: 'all 0.3s ease-out',
                      opacity: hasHoveredPlan && !isHovered ? 0.5 : 1,
                      transform: isHovered ? 'translateY(-8px)' : 'translateY(0)',
                    }}
                  >
                  <Card
                    className={`relative p-8 flex flex-col w-full transition-all duration-300 ease-out ${
                      isSelectedPending
                        ? "border-2 border-orange-500 shadow-xl"
                        : isCurrentForToggle
                          ? "border-2 border-gray-600 shadow-xl"
                          : isHovered
                            ? "border-2 border-gray-400 shadow-xl"
                            : plan.popular
                              ? "border-2 border-gray-800 shadow-xl"
                              : "border border-gray-200 shadow-sm"
                    }`}
                  >
                    {isSelectedPending && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                        <Badge className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-1">
                          Selected - Pending Payment
                        </Badge>
                      </div>
                    )}
                    {isCurrentForToggle && !isSelectedPending && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                        <Badge className="bg-gray-700 text-white px-4 py-1">
                          Current Plan
                        </Badge>
                      </div>
                    )}
                    {plan.popular && !isCurrentForToggle && !isSelectedPending && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                        <Badge className="bg-gray-800 text-white px-4 py-1">
                          Most Popular
                        </Badge>
                      </div>
                    )}

                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center mb-6`}>
                      <Icon className="w-7 h-7 text-white" />
                    </div>

                    <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                    <p className="text-gray-600 mb-6 min-h-[48px]">{plan.description}</p>

                    <div className="mb-6">
                      {(plan.monthlyPrice || plan.annualPrice) ? (
                        <div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-4xl font-bold text-gray-900">
                              {formatCurrency(
                                isYearly
                                  ? (plan.annualPrice ?? plan.monthlyPrice ?? 0)
                                  : (plan.monthlyPrice ?? plan.annualPrice ?? 0),
                                plan.currency
                              )}
                            </span>
                            <span className="text-gray-500 text-sm">
                              {/* Show correct billing period based on what's available */}
                              {isYearly
                                ? (plan.annualPrice ? '/year' : '/month')
                                : (plan.monthlyPrice ? '/month' : '/year')}
                            </span>
                          </div>
                          {/* Show strikethrough price and discount badge when viewing yearly and both prices exist */}
                          {isYearly && plan.monthlyPrice && plan.annualPrice && (plan.monthlyPrice * 12) > plan.annualPrice && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-sm text-gray-400 line-through">
                                {formatCurrency(plan.monthlyPrice * 12, plan.currency)}
                              </span>
                              {plan.discountPercentage && plan.discountPercentage > 0 && (
                                <span className="inline-block px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                                  Save {Math.round(plan.discountPercentage)}%
                                </span>
                              )}
                            </div>
                          )}
                          {/* Show note when yearly is selected but only monthly is available */}
                          {isYearly && !plan.annualPrice && plan.monthlyPrice && (
                            <p className="text-xs text-amber-600 mt-1">
                              Billed monthly (yearly not available)
                            </p>
                          )}
                          {/* Show note when monthly is selected but only yearly is available */}
                          {!isYearly && !plan.monthlyPrice && plan.annualPrice && (
                            <p className="text-xs text-amber-600 mt-1">
                              Billed annually (monthly not available)
                            </p>
                          )}
                          {/* Show monthly equivalent hint when viewing yearly and both exist */}
                          {isYearly && plan.monthlyPrice && plan.annualPrice && (
                            <p className="text-xs text-gray-500 mt-1">
                              {formatCurrency(plan.monthlyPrice, plan.currency)}/month if billed monthly
                            </p>
                          )}
                          {/* Show yearly option hint when viewing monthly and both exist */}
                          {!isYearly && plan.annualPrice && plan.monthlyPrice && (
                            <p className="text-xs text-gray-500 mt-1">
                              or {formatCurrency(plan.annualPrice, plan.currency)}/year
                              {plan.discountPercentage && plan.discountPercentage > 0 && (
                                <span className="text-green-600"> (Save {Math.round(plan.discountPercentage)}%)</span>
                              )}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="text-4xl font-bold text-gray-900">Custom</div>
                      )}
                    </div>

                    {/* Quotas Section - Single column layout */}
                    {(() => {
                      // Use correct quotas based on billing toggle - all values from API directly
                      const rawQuotas = isYearly
                        ? (plan.annualQuotas || plan.quotas)
                        : (plan.monthlyQuotas || plan.quotas);

                      if (!rawQuotas) return null;

                      // Normalize quota values to handle different API property names
                      const displayQuotas = {
                        max_seats: rawQuotas.max_seats,
                        max_jobs: rawQuotas.max_jobs,
                        RU: rawQuotas.RU ?? rawQuotas.resume_uploads ?? rawQuotas.resume_storage,
                        RS: rawQuotas.RS ?? rawQuotas.resume_scoring,
                        AS: rawQuotas.AS ?? rawQuotas.assessments,
                        AIU: rawQuotas.AIU ?? rawQuotas.ai_interviews ?? rawQuotas.ai_interview,
                      };

                      return (
                        <div className="mb-6 py-4 border-t border-b border-gray-100">
                          <div className="space-y-2 text-sm">
                            {displayQuotas.max_seats !== undefined && displayQuotas.max_seats >= 1 && (
                              <div className="flex justify-between items-center">
                                <span className="text-gray-500">Max Users</span>
                                <span className="font-semibold text-gray-900">{displayQuotas.max_seats.toLocaleString()}</span>
                              </div>
                            )}
                            {displayQuotas.max_jobs !== undefined && displayQuotas.max_jobs >= 1 && (
                              <div className="flex justify-between items-center">
                                <span className="text-gray-500">Max Jobs</span>
                                <span className="font-semibold text-gray-900">Unlimited</span>
                              </div>
                            )}
                            {displayQuotas.RU !== undefined && displayQuotas.RU >= 1 && (
                              <div className="flex justify-between items-center">
                                <span className="text-gray-500">Resume Storage</span>
                                <span className="font-semibold text-gray-900">{displayQuotas.RU.toLocaleString()}</span>
                              </div>
                            )}
                            {displayQuotas.RS !== undefined && displayQuotas.RS >= 1 && (
                              <div className="flex justify-between items-center">
                                <span className="text-gray-500">Resume Scores</span>
                                <span className="font-semibold text-gray-900">{displayQuotas.RS.toLocaleString()}</span>
                              </div>
                            )}
                            {displayQuotas.AS !== undefined && displayQuotas.AS >= 1 && (
                              <div className="flex justify-between items-center">
                                <span className="text-gray-500">Assessments</span>
                                <span className="font-semibold text-gray-900">{displayQuotas.AS.toLocaleString()}</span>
                              </div>
                            )}
                            {displayQuotas.AIU !== undefined && displayQuotas.AIU >= 1 && (
                              <div className="flex justify-between items-center">
                                <span className="text-gray-500">AI Interviews</span>
                                <span className="font-semibold text-gray-900">{displayQuotas.AIU.toLocaleString()}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Features Section - Expand on hover */}
                    {plan.features.length > 0 && (
                      <div className="mb-6">
                        <ul className="space-y-2.5">
                          {plan.features.slice(0, isHovered ? undefined : 4).map((feature, idx) => (
                            <li key={idx} className="flex items-start gap-2.5">
                              <Check className="w-4 h-4 text-gray-600 flex-shrink-0 mt-0.5" />
                              <span className="text-gray-700 text-sm">{feature}</span>
                            </li>
                          ))}
                        </ul>
                        {!isHovered && plan.features.length > 4 && (
                          <p className="text-gray-400 text-sm mt-2 pl-6">
                            +{plan.features.length - 4} more features
                          </p>
                        )}
                      </div>
                    )}

                    {/* Spacer to push button to bottom */}
                    <div className="flex-grow" />

                    <button
                      onClick={() => handleChoosePlan(plan)}
                      disabled={isCurrentForToggle || isSelectingPlan || isSelectedPending || (!plan.monthlyPrice && !plan.annualPrice) || queuedUpgrades.length > 0}
                      className={`block w-full h-12 rounded-lg font-medium text-center transition-all flex items-center justify-center gap-2 mt-auto ${
                        isCurrentForToggle || isSelectedPending
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : queuedUpgrades.length > 0
                            ? "bg-amber-100 text-amber-600 cursor-not-allowed"
                            : (!plan.monthlyPrice && !plan.annualPrice)
                              ? "bg-gray-100 text-gray-500 cursor-not-allowed"
                              : plan.popular
                                ? "bg-gray-800 text-white hover:bg-gray-700"
                                : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {isCurrentForToggle ? (
                        'Current Plan'
                      ) : isSelectedPending ? (
                        'Pending Payment'
                      ) : queuedUpgrades.length > 0 ? (
                        'Upgrade Queued'
                      ) : (!plan.monthlyPrice && !plan.annualPrice) ? (
                        'Contact Sales'
                      ) : isOnTrial || isLocked || isExpiredSubscription ? (
                        'Choose Plan'
                      ) : (
                        'Upgrade'
                      )}
                    </button>
                  </Card>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {plans.length === 0 && !error && (
          <div className="text-center py-12 text-gray-600">
            <p>No plans available at the moment.</p>
          </div>
        )}
      </div>

      {/* Plan Selection Modal */}
      {showPaymentModal && selectedPlanForPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    {modalStep === 'result' ? 'Upgrade Complete!' : 'Upgrade Plan'}
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {selectedPlanForPayment.name} - {formatCurrency(selectedPlanForPayment.price || 0, selectedPlanForPayment.currency)}/month
                  </p>
                </div>
                <button
                  onClick={() => { setShowPaymentModal(false); setModalStep('isolation'); }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            {/* Single Page Payment Summary */}
            {modalStep !== 'result' && (
              <div className="p-6 space-y-5">
                {/* Payment Details */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                  <h4 className="font-semibold text-gray-900 mb-4">Payment Details</h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Plan:</span>
                      <span className="font-medium text-gray-900">{selectedPlanForPayment?.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">
                        {/* Show correct billing label based on what's available */}
                        {isYearly
                          ? (selectedPlanForPayment?.annualPrice ? 'Annual Price:' : 'Monthly Price:')
                          : (selectedPlanForPayment?.monthlyPrice ? 'Monthly Price:' : 'Annual Price:')}
                      </span>
                      <span className="font-medium text-gray-900">
                        {formatCurrency(
                          isYearly
                            ? (selectedPlanForPayment?.annualPrice ?? selectedPlanForPayment?.monthlyPrice ?? 0)
                            : (selectedPlanForPayment?.monthlyPrice ?? selectedPlanForPayment?.annualPrice ?? 0),
                          selectedPlanForPayment?.currency || 'INR'
                        )}
                      </span>
                    </div>
                    {/* Show note when billing period doesn't match available pricing */}
                    {isYearly && !selectedPlanForPayment?.annualPrice && selectedPlanForPayment?.monthlyPrice && (
                      <div className="text-xs text-amber-600">
                        Yearly billing not available for this plan. Will be billed monthly.
                      </div>
                    )}
                    {!isYearly && !selectedPlanForPayment?.monthlyPrice && selectedPlanForPayment?.annualPrice && (
                      <div className="text-xs text-amber-600">
                        Monthly billing not available for this plan. Will be billed annually.
                      </div>
                    )}
                    {isolationType === 'database' && (
                      <div className="flex justify-between text-amber-700">
                        <span>Database Isolation Fee{isYearly ? ' (12 months)' : ''}:</span>
                        <span className="font-medium">
                          +{formatCurrency(
                            isYearly
                              ? (planSettings?.databasePerTenantMonthlyPrice || 5000) * 12
                              : (planSettings?.databasePerTenantMonthlyPrice || 5000),
                            selectedPlanForPayment?.currency || 'INR'
                          )}
                        </span>
                      </div>
                    )}
                    {isYearly && selectedPlanForPayment?.monthlyPrice && selectedPlanForPayment?.annualPrice &&
                     (selectedPlanForPayment.monthlyPrice * 12) > selectedPlanForPayment.annualPrice && (
                      <div className="flex justify-between pt-2 border-t border-gray-200 text-green-700">
                        <span className="flex items-center gap-1">
                          <Crown className="w-4 h-4" />
                          Annual Savings:
                        </span>
                        <span className="font-medium">
                          {formatCurrency(
                            (selectedPlanForPayment.monthlyPrice * 12) - selectedPlanForPayment.annualPrice,
                            selectedPlanForPayment?.currency || 'INR'
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Total Summary - Above checkboxes */}
                <div className="bg-gray-800 text-white rounded-xl p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-semibold">Total</span>
                      <p className="text-xs text-gray-300">
                        {/* Show actual billing period based on availability */}
                        {(isYearly && selectedPlanForPayment?.annualPrice) || (!selectedPlanForPayment?.monthlyPrice && selectedPlanForPayment?.annualPrice)
                          ? 'Billed annually (12× quotas)'
                          : 'Billed monthly'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-2xl">
                        {formatCurrency(
                          (() => {
                            // Determine actual billing period based on availability
                            const actuallyYearly = isYearly && selectedPlanForPayment?.annualPrice;
                            const actuallyMonthly = !isYearly && selectedPlanForPayment?.monthlyPrice;
                            const useYearlyPrice = actuallyYearly || (!actuallyMonthly && selectedPlanForPayment?.annualPrice);
                            const basePrice = useYearlyPrice
                              ? (selectedPlanForPayment?.annualPrice ?? 0)
                              : (selectedPlanForPayment?.monthlyPrice ?? 0);
                            const dbFee = isolationType === 'database'
                              ? (planSettings?.databasePerTenantMonthlyPrice || 5000) * (useYearlyPrice ? 12 : 1)
                              : 0;
                            return basePrice + dbFee;
                          })(),
                          selectedPlanForPayment?.currency || 'INR'
                        )}
                      </span>
                      {isYearly && selectedPlanForPayment?.monthlyPrice && selectedPlanForPayment?.annualPrice &&
                       (selectedPlanForPayment.monthlyPrice * 12) > selectedPlanForPayment.annualPrice && (
                        <p className="text-xs text-green-400">
                          You save {formatCurrency(
                            (selectedPlanForPayment.monthlyPrice * 12) - selectedPlanForPayment.annualPrice,
                            selectedPlanForPayment?.currency || 'INR'
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Annual Plan Offer Checkbox - Uses API prices directly */}
                {selectedPlanForPayment?.annualPrice && (
                  <label className={`flex items-start gap-3 p-4 border-2 rounded-xl cursor-pointer transition-colors ${
                    isYearly ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}>
                    <input
                      type="checkbox"
                      checked={isYearly}
                      onChange={(e) => setIsYearly(e.target.checked)}
                      className="mt-1 w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Crown className="w-5 h-5 text-green-600" />
                        <span className="font-medium text-gray-900">Annual Plan</span>
                      </div>
                      <p className="text-sm text-gray-500 mt-1">
                        {formatCurrency(selectedPlanForPayment.annualPrice, selectedPlanForPayment.currency)}/year
                      </p>
                    </div>
                  </label>
                )}

                {/* Dedicated Database Checkbox - Available for both Monthly and Annual */}
                <label className={`flex items-start gap-3 p-4 border-2 rounded-xl cursor-pointer transition-colors ${
                  isolationType === 'database' ? 'border-amber-500 bg-amber-50' : 'border-gray-200 hover:bg-gray-50'
                }`}>
                  <input
                    type="checkbox"
                    checked={isolationType === 'database'}
                    onChange={(e) => setIsolationType(e.target.checked ? 'database' : 'schema')}
                    className="mt-1 w-5 h-5 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Database className="w-5 h-5 text-amber-600" />
                      <span className="font-medium text-gray-900">Dedicated Database</span>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Get your own dedicated database for enhanced isolation and performance
                    </p>
                    <p className="text-sm text-amber-600 font-medium mt-1">
                      +{formatCurrency(planSettings?.databasePerTenantMonthlyPrice || 5000, selectedPlanForPayment?.currency || 'INR')}/month
                      {isYearly && ` (${formatCurrency((planSettings?.databasePerTenantMonthlyPrice || 5000) * 12, selectedPlanForPayment?.currency || 'INR')}/year)`}
                    </p>
                  </div>
                </label>

                {/* Error Display in Modal */}
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-red-700 text-sm font-medium">Plan Selection Failed</p>
                      <p className="text-red-600 text-sm mt-1">{error}</p>
                    </div>
                  </div>
                )}

                {/* Pay Button */}
                <button
                  onClick={handlePaymentSubmit}
                  disabled={isSelectingPlan}
                  className="w-full py-3 bg-gray-800 text-white rounded-xl font-medium hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSelectingPlan ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      Pay {formatCurrency(
                        isYearly
                          ? (selectedPlanForPayment?.annualPrice || 0) +
                            (isolationType === 'database' ? (planSettings?.databasePerTenantMonthlyPrice || 5000) * 12 : 0)
                          : (selectedPlanForPayment?.monthlyPrice || 0) +
                            (isolationType === 'database' ? (planSettings?.databasePerTenantMonthlyPrice || 5000) : 0),
                        selectedPlanForPayment?.currency || 'INR'
                      )}
                    </>
                  )}
                </button>
                <p className="text-xs text-gray-500 text-center">
                  Secure payment processing. Your data is protected.
                </p>
              </div>
            )}

            {/* Result */}
            {modalStep === 'result' && transactionResult && (
              <div className="p-6 space-y-4">
                {transactionResult.queued ? (
                  /* Queued Upgrade Result */
                  <>
                    <div className="text-center">
                      <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Clock className="w-10 h-10 text-amber-600" />
                      </div>
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">Upgrade Queued!</h3>
                      <p className="text-gray-600">Your payment was successful. The upgrade will apply automatically.</p>
                    </div>

                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Current Plan:</span>
                        <span className="font-medium text-gray-900">{transactionResult.current_plan_name || 'Your current plan'}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">New Plan:</span>
                        <span className="font-medium text-amber-700">{transactionResult.plan_name}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Auto-applies on:</span>
                        <span className="font-medium text-gray-900">
                          {transactionResult.auto_apply_date
                            ? formatDate(transactionResult.auto_apply_date)
                            : 'When current plan expires'}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Amount Paid:</span>
                        <span className="font-medium text-green-600">
                          {formatCurrency(transactionResult.total_amount, transactionResult.currency || 'INR')}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Invoice:</span>
                        <span className="font-medium text-gray-900">{transactionResult.invoice_number}</span>
                      </div>
                    </div>

                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                      <p>{transactionResult.message}</p>
                    </div>

                    <button
                      onClick={async () => {
                        setShowPaymentModal(false);
                        setModalStep('isolation');
                        await fetchData();
                        await fetchQueuedUpgrades();
                      }}
                      className="w-full px-4 py-2.5 bg-gray-800 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
                    >
                      Got it
                    </button>
                  </>
                ) : (
                  /* Immediate Upgrade Result */
                  <>
                    <div className="text-center">
                      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle className="w-10 h-10 text-green-600" />
                      </div>
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">
                        {companySettings?.status?.toLowerCase() === 'expired' || companySettings?.status?.toLowerCase() === 'suspended'
                          ? 'Account Reactivated!'
                          : 'Plan Upgrade Successful!'}
                      </h3>
                      <p className="text-gray-600">
                        {companySettings?.status?.toLowerCase() === 'expired' || companySettings?.status?.toLowerCase() === 'suspended'
                          ? 'Your account has been reactivated and all features are now available.'
                          : 'Your subscription has been updated successfully.'}
                      </p>
                    </div>

                    {/* PS03 Fix: Reactivation Confirmation Banner */}
                    {(companySettings?.status?.toLowerCase() === 'expired' || companySettings?.status?.toLowerCase() === 'suspended') && (
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-green-800">Welcome back!</p>
                          <p className="text-sm text-green-700 mt-0.5">
                            Your account is now active. You have full access to all features and resources.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* PS02 Fix: Email Confirmation Message */}
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
                      <Mail className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-blue-800">
                        A confirmation email has been sent to your registered email address.
                      </p>
                    </div>

                    {/* Payment Details */}
                    <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Plan:</span>
                        <span className="font-medium text-gray-900">{transactionResult.plan_name}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Billing:</span>
                        <span className="font-medium text-gray-900">{transactionResult.billing_interval}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Invoice:</span>
                        <span className="font-medium text-gray-900">{transactionResult.invoice_number}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Amount Paid:</span>
                        <span className="font-medium text-green-600">
                          {formatCurrency(transactionResult.total_amount, transactionResult.currency || 'INR')}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Payment ID:</span>
                        <span className="font-medium text-gray-500 text-xs">{transactionResult.stripe?.payment_intent_id}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Status:</span>
                        <Badge className="bg-green-100 text-green-700">{transactionResult.subscription_status}</Badge>
                      </div>
                    </div>

                    {/* PS02 Fix: Resource Allocation Details */}
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <h4 className="font-medium text-green-900 mb-3 flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        Resources Provisioned
                      </h4>
                      <div className="space-y-2">
                        {selectedPlanForPayment?.quotas?.max_seats && (
                          <div className="flex justify-between text-sm">
                            <span className="text-green-700 flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5" />
                              User Seats:
                            </span>
                            <span className="font-medium text-green-900">{selectedPlanForPayment.quotas.max_seats} seats</span>
                          </div>
                        )}
                        {selectedPlanForPayment?.quotas?.RS && (
                          <div className="flex justify-between text-sm">
                            <span className="text-green-700 flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5" />
                              Resume Scoring (RS):
                            </span>
                            <span className="font-medium text-green-900">{selectedPlanForPayment.quotas.RS} units</span>
                          </div>
                        )}
                        {selectedPlanForPayment?.quotas?.AS && (
                          <div className="flex justify-between text-sm">
                            <span className="text-green-700 flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5" />
                              Assessments (AS):
                            </span>
                            <span className="font-medium text-green-900">{selectedPlanForPayment.quotas.AS} units</span>
                          </div>
                        )}
                        {selectedPlanForPayment?.quotas?.AIU && (
                          <div className="flex justify-between text-sm">
                            <span className="text-green-700 flex items-center gap-1.5">
                              <Zap className="w-3.5 h-3.5" />
                              AI Interviews (AIU):
                            </span>
                            <span className="font-medium text-green-900">{selectedPlanForPayment.quotas.AIU} units</span>
                          </div>
                        )}
                        {selectedPlanForPayment?.quotas?.RU && (
                          <div className="flex justify-between text-sm">
                            <span className="text-green-700 flex items-center gap-1.5">
                              <ArrowUpRight className="w-3.5 h-3.5" />
                              Resume Storage (RU):
                            </span>
                            <span className="font-medium text-green-900">{selectedPlanForPayment.quotas.RU} units</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={async () => {
                        setShowPaymentModal(false);
                        setModalStep('isolation');
                        // Refresh data to show updated plan
                        await fetchData();
                      }}
                      className="w-full px-4 py-2.5 bg-gray-800 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
                    >
                      Done
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Terms & Conditions Modal for Applying Queued Upgrade */}
      {showTCModal && selectedQueuedUpgrade && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">Apply Upgrade Now</h2>
                  <p className="text-sm text-gray-600 mt-1">
                    Upgrade to {selectedQueuedUpgrade.new_plan_name}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowTCModal(false);
                    setSelectedQueuedUpgrade(null);
                    setTcAccepted(false);
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Warning */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-amber-800 mb-1">Important Notice</h4>
                    <p className="text-sm text-amber-700">
                      By applying this upgrade immediately, any remaining credits and unused quota
                      on your current plan ({companySettings?.current_plan_name || 'your active plan'}) will be
                      <strong> forfeited</strong>. Your new plan will start today.
                    </p>
                  </div>
                </div>
              </div>

              {/* Upgrade Details */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <h4 className="font-medium text-gray-900">Upgrade Details</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">From:</span>
                    <span className="ml-1 font-medium text-gray-900">
                      {selectedQueuedUpgrade.current_plan_name || companySettings?.current_plan_name || 'Current Plan'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">To:</span>
                    <span className="ml-1 font-medium text-green-600">{selectedQueuedUpgrade.new_plan_name}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Amount Paid:</span>
                    <span className="ml-1 font-medium text-gray-900">
                      {formatCurrency(selectedQueuedUpgrade.payment_amount, selectedQueuedUpgrade.payment_currency)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Billing:</span>
                    <span className="ml-1 font-medium text-gray-900">{selectedQueuedUpgrade.billing_interval}</span>
                  </div>
                </div>
              </div>

              {/* Terms & Conditions */}
              <div className="border border-gray-200 rounded-xl p-4">
                <h4 className="font-medium text-gray-900 mb-3">Terms & Conditions</h4>
                <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600 space-y-2 max-h-40 overflow-y-auto">
                  <p>1. Any unused credits, quotas, or features from your current subscription will be immediately terminated and cannot be recovered.</p>
                  <p>2. Your new plan will start immediately upon confirmation and will be valid for the billing period you selected ({selectedQueuedUpgrade.billing_interval}).</p>
                  <p>3. No prorated refunds will be issued for the remaining period of your current plan.</p>
                  <p>4. This action cannot be undone once confirmed.</p>
                  <p>5. Your billing cycle will reset based on today's date.</p>
                </div>
              </div>

              {/* Accept Checkbox */}
              <label className={`flex items-start gap-3 p-4 border-2 rounded-xl cursor-pointer transition-colors ${
                tcAccepted ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:bg-gray-50'
              }`}>
                <input
                  type="checkbox"
                  checked={tcAccepted}
                  onChange={(e) => setTcAccepted(e.target.checked)}
                  className="mt-1 w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                />
                <div className="flex-1">
                  <span className="font-medium text-gray-900">I accept the terms and conditions</span>
                  <p className="text-sm text-gray-500 mt-1">
                    I understand that remaining credits on my current plan will be forfeited and my new plan will start immediately.
                  </p>
                </div>
              </label>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowTCModal(false);
                    setSelectedQueuedUpgrade(null);
                    setTcAccepted(false);
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleApplyUpgrade}
                  disabled={!tcAccepted || isApplyingUpgrade}
                  className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isApplyingUpgrade ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      Apply Now
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Queued Upgrade Modal */}
      {showCancelModal && selectedQueuedUpgrade && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                    <XCircle className="w-6 h-6 text-red-600" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">Cancel Upgrade</h2>
                    <p className="text-sm text-gray-600">Cancel queued plan upgrade</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowCancelModal(false);
                    setSelectedQueuedUpgrade(null);
                    setCancelReason('');
                  }}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Warning */}
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-red-800 mb-1">Are you sure?</h4>
                    <p className="text-sm text-red-700">
                      You are about to cancel the queued upgrade to <strong>{selectedQueuedUpgrade.new_plan_name}</strong>.
                      If you paid for this upgrade, you may need to request a refund separately.
                    </p>
                  </div>
                </div>
              </div>

              {/* Upgrade Details */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <h4 className="font-medium text-gray-900 text-sm">Upgrade Details</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">New Plan:</span>
                    <span className="font-medium text-gray-900">{selectedQueuedUpgrade.new_plan_name}</span>
                  </div>
                  {selectedQueuedUpgrade.payment_amount !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Amount Paid:</span>
                      <span className="font-medium text-gray-900">
                        {formatCurrency(selectedQueuedUpgrade.payment_amount, selectedQueuedUpgrade.payment_currency || 'INR')}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Scheduled for:</span>
                    <span className="font-medium text-gray-900">
                      {selectedQueuedUpgrade.auto_apply_date ? formatDate(selectedQueuedUpgrade.auto_apply_date) : 'On plan expiry'}
                    </span>
                  </div>
                  {selectedQueuedUpgrade.days_until_activation !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">Days until activation:</span>
                      <span className="font-medium text-gray-900">
                        {selectedQueuedUpgrade.days_until_activation} day{selectedQueuedUpgrade.days_until_activation !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">Queued on:</span>
                    <span className="font-medium text-gray-900">
                      {selectedQueuedUpgrade.created_at ? formatDate(selectedQueuedUpgrade.created_at) : '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Cancellation Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for cancellation (optional)
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Please let us know why you're cancelling..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowCancelModal(false);
                    setSelectedQueuedUpgrade(null);
                    setCancelReason('');
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Keep Upgrade
                </button>
                <button
                  onClick={handleCancelUpgrade}
                  disabled={isCancellingUpgrade}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isCancellingUpgrade ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Cancelling...
                    </>
                  ) : (
                    <>
                      <XCircle className="w-5 h-5" />
                      Cancel Upgrade
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function CurrentPlanPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-gray-600" />
      </div>
    }>
      <CurrentPlanContent />
    </Suspense>
  );
}
