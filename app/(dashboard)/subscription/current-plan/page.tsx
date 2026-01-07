'use client';

import { CreditCard, Check, Loader2, Users, Building2, Zap, AlertCircle, Lock, Clock, CheckCircle, XCircle, X, Database, Layers, Package, Sparkles, ArrowRight, ArrowLeft, Crown, FileText } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/services/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:8001/api/v1';
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
  AS?: number;
  RS?: number;
  RU?: number;
  AIU?: number;
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
  isCurrent: boolean;
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
  max_seats: number;
  max_jobs: number;
  max_resume_uploads: number;
  max_resume_searches: number;
  max_assessments: number;
  max_ai_interviews: number;
  storage_limit_gb: number;
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

interface FreeTrialSettings {
  id?: number;
  trial_days: number;
  features: {
    MAX_JOBS: number;
    MAX_SEATS: number;
    ASSESSMENTS: number;
    AI_INTERVIEW: number;
    RESUME_SCORING: number;
    RESUME_STORAGE: number;
  };
  trial_includes: string[];
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

const getStatusBadge = (status: string, paymentStatus?: string, trialDays: number = 14) => {
  if (paymentStatus === 'pending') {
    return { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Pending Payment', icon: Clock };
  }

  switch (status.toLowerCase()) {
    case 'active':
      return { bg: 'bg-green-100', text: 'text-green-700', label: 'Active', icon: CheckCircle };
    case 'trial':
      return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: `Free Trial (${trialDays} days)`, icon: Clock };
    case 'pending_payment':
      return { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Pending Payment', icon: Clock };
    case 'suspended':
      return { bg: 'bg-red-100', text: 'text-red-700', label: 'Suspended', icon: XCircle };
    case 'expired':
      return { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Expired', icon: XCircle };
    case 'locked':
      return { bg: 'bg-red-100', text: 'text-red-700', label: 'Account Locked', icon: Lock };
    default:
      return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Free Trial', icon: Clock };
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

export default function CurrentPlanPage() {
  const router = useRouter();
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

  // Free trial settings from admin API
  const [freeTrialSettings, setFreeTrialSettings] = useState<FreeTrialSettings | null>(null);

  // Plan settings from admin API (yearly discount, database extra charge)
  const [planSettings, setPlanSettings] = useState<PlanSettings | null>(null);

  // Billing period toggle
  const [isYearly, setIsYearly] = useState(true);
  // Current plan price from quota-status API
  const [currentPlanPrice, setCurrentPlanPrice] = useState<number | null>(null);
  const [currentPlanCurrency, setCurrentPlanCurrency] = useState<string>('INR');
  const [currentPlanBillingPeriod, setCurrentPlanBillingPeriod] = useState<string>('MONTHLY');
  // Subscription status from quota-status API (source of truth for plan status)
  const [quotaSubscriptionStatus, setQuotaSubscriptionStatus] = useState<string | null>(null);

  // Queued upgrades state
  const [queuedUpgrades, setQueuedUpgrades] = useState<QueuedUpgrade[]>([]);
  const [showTCModal, setShowTCModal] = useState(false);
  const [selectedQueuedUpgrade, setSelectedQueuedUpgrade] = useState<QueuedUpgrade | null>(null);
  const [tcAccepted, setTcAccepted] = useState(false);
  const [isApplyingUpgrade, setIsApplyingUpgrade] = useState(false);
  const [isCancellingUpgrade, setIsCancellingUpgrade] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  // Use ref to track if data has been fetched to prevent duplicate calls
  const hasFetchedRef = useRef(false);

  // Get tenant ID from token on mount
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setTenantId(payload.tenant_id || null);
      } catch (e) {
        console.error('Failed to parse token:', e);
      }
    }
  }, []);

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

      // Fetch quota status from backend API (calls external admin API)
      let quotaData: any = null;
      try {
        const token = localStorage.getItem('accessToken');
        if (token) {
          const quotaResponse = await fetch(`${API_URL}/usage/quota-status`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });
          if (quotaResponse.ok) {
            const quotaResult = await quotaResponse.json();
            quotaData = quotaResult.data || quotaResult;
            console.log('[CurrentPlan] Quota status:', quotaData);
          }
        }
      } catch (quotaError) {
        console.log('Could not fetch quota status');
      }

      // Fetch free trial settings from API
      let trialSettings: FreeTrialSettings | null = null;
      try {
        const freeTrialResponse = await fetch(`${API_URL}/addons/free-trial`);
        if (freeTrialResponse.ok) {
          const freeTrialResult = await freeTrialResponse.json();
          const ftData = freeTrialResult.data || freeTrialResult;
          console.log('[CurrentPlan] Free trial API response:', ftData);

          // Use API data for trial settings (use ?? to preserve 0 values)
          trialSettings = {
            id: ftData.id,
            trial_days: ftData.trial_days ?? 14,
            features: {
              MAX_JOBS: ftData.features?.MAX_JOBS ?? 5,
              MAX_SEATS: ftData.features?.MAX_SEATS ?? 2,
              ASSESSMENTS: ftData.features?.ASSESSMENTS ?? 10,
              AI_INTERVIEW: ftData.features?.AI_INTERVIEW ?? 10,
              RESUME_SCORING: ftData.features?.RESUME_SCORING ?? 100,
              RESUME_STORAGE: ftData.features?.RESUME_STORAGE ?? 100,
            },
            trial_includes: ftData.trial_includes || ['Resume Storage', 'Resume Scoring', 'Assessments', 'AI Interviews'],
          };
          setFreeTrialSettings(trialSettings);
        }
      } catch (ftError) {
        console.log('[CurrentPlan] Could not fetch free trial settings:', ftError);
      }

      // Fallback: Build trial settings from quota data if API failed
      if (!trialSettings && quotaData?.quotas) {
        const q = quotaData.quotas;
        // Get trial days remaining from API response
        const trialDaysRemaining = quotaData.trial_info?.days_remaining ?? 14;
        trialSettings = {
          trial_days: trialDaysRemaining,
          features: {
            MAX_JOBS: q.max_jobs?.subscription?.limit === 'unlimited' ? 999 : (q.max_jobs?.subscription?.limit || 10),
            MAX_SEATS: q.max_seats?.subscription?.limit === 'unlimited' ? 999 : (q.max_seats?.subscription?.limit || 5),
            ASSESSMENTS: q.AS?.subscription?.limit === 'unlimited' ? 999 : (q.AS?.subscription?.limit || 50),
            AI_INTERVIEW: q.AIU?.subscription?.limit === 'unlimited' ? 999 : (q.AIU?.subscription?.limit || 25),
            RESUME_SCORING: q.RS?.subscription?.limit === 'unlimited' ? 999 : (q.RS?.subscription?.limit || 100),
            RESUME_STORAGE: q.RU?.subscription?.limit === 'unlimited' ? 999 : (q.RU?.subscription?.limit || 100),
          },
          trial_includes: ['Resume Storage', 'Resume Scoring', 'Assessments', 'AI Interviews'],
        };
        setFreeTrialSettings(trialSettings);
      }

      if (quotaData?.quotas) {

        // Update company settings with data from quota-status API
        const quotas = quotaData.quotas;
        const isTrial = quotaData.is_trial === true;

        // For FREE TRIAL: Get dates from trial_info
        const trialStartDate = quotaData.trial_info?.trial_start_date || null;
        const trialEndDate = quotaData.trial_info?.trial_end_date || null;

        // For PAID PLAN: Get dates from root level (plan_start_date, plan_expiry_date) or billing_period
        const planStartDate = quotaData.plan_start_date || quotaData.billing_period?.start || null;
        const planEndDate = quotaData.plan_expiry_date || quotaData.billing_period?.end || null;

        console.log('[CurrentPlan] is_trial:', isTrial);
        console.log('[CurrentPlan] trial_info:', quotaData.trial_info);
        console.log('[CurrentPlan] plan_info:', quotaData.plan_info);
        console.log('[CurrentPlan] Dates - trial:', { trialStartDate, trialEndDate }, 'plan:', { planStartDate, planEndDate });
        console.log('[CurrentPlan] Setting dates in state - trial_start:', trialStartDate, 'trial_end:', trialEndDate, 'plan_start:', planStartDate, 'plan_expiry:', planEndDate);

        setCompanySettings(prev => ({
          ...prev!,
          current_plan_name: quotaData.plan_name || prev?.current_plan_name,
          current_plan_id: quotaData.plan_info?.plan_id || prev?.current_plan_id,
          subscription_status: isTrial ? 'trial' : (quotaData.subscription_status || 'active'),
          status: isTrial ? 'trial' : (quotaData.subscription_status || 'active'),
          // Set trial dates if available
          trial_start_date: trialStartDate || prev?.trial_start_date,
          trial_end_date: trialEndDate || prev?.trial_end_date,
          // Set plan dates if available (keep existing if API doesn't return new ones)
          plan_start_date: planStartDate || prev?.plan_start_date,
          plan_expiry_date: planEndDate || prev?.plan_expiry_date,
          // Update quota limits - use free trial API data for trial users, otherwise use quota-status
          max_seats: isTrial && trialSettings ? trialSettings.features.MAX_SEATS : (quotas?.max_seats?.subscription?.limit || prev?.max_seats || 5),
          max_jobs: isTrial && trialSettings ? trialSettings.features.MAX_JOBS : (quotas?.max_jobs?.subscription?.limit || prev?.max_jobs || 10),
          max_resume_uploads: isTrial && trialSettings ? trialSettings.features.RESUME_STORAGE : (quotas?.RU?.subscription?.limit || prev?.max_resume_uploads || 100),
          max_resume_searches: isTrial && trialSettings ? trialSettings.features.RESUME_SCORING : (quotas?.RS?.subscription?.limit || prev?.max_resume_searches || 100),
          max_assessments: isTrial && trialSettings ? trialSettings.features.ASSESSMENTS : (quotas?.AS?.subscription?.limit || prev?.max_assessments || 50),
          max_ai_interviews: isTrial && trialSettings ? trialSettings.features.AI_INTERVIEW : (quotas?.AIU?.subscription?.limit || prev?.max_ai_interviews || 25),
          storage_limit_gb: quotas?.storage_gb?.subscription?.limit || prev?.storage_limit_gb || 10,
        }));

        console.log('[CurrentPlan] isTrial:', isTrial, 'trialSettings:', trialSettings?.features);

        // Extract base_price from plan_info if available (only for paid plans)
        if (!isTrial && quotaData.plan_info?.base_price !== undefined) {
          setCurrentPlanPrice(quotaData.plan_info.base_price);
          console.log('[CurrentPlan] Setting price from plan_info:', quotaData.plan_info.base_price);
        } else if (isTrial) {
          setCurrentPlanPrice(0); // Free trial has no price
        }

        if (quotaData.plan_info?.billing_period) {
          setCurrentPlanBillingPeriod(quotaData.plan_info.billing_period);
        }

        // Store subscription status from quota-status API (source of truth)
        // is_trial is the definitive way to know if user is on trial
        if (isTrial) {
          setQuotaSubscriptionStatus('trial');
          console.log('[CurrentPlan] Setting subscription_status as trial (is_trial=true)');
        } else if (quotaData.subscription_status) {
          setQuotaSubscriptionStatus(quotaData.subscription_status);
          console.log('[CurrentPlan] Setting subscription_status from quota:', quotaData.subscription_status);
        } else {
          // Paid plan without explicit status - assume active
          setQuotaSubscriptionStatus('active');
          console.log('[CurrentPlan] Setting subscription_status as active (paid plan)');
        }
      }

      // Fetch plan settings (yearly discount, database extra charge)
      try {
        const planSettingsResponse = await fetch(`${API_URL}/addons/plan-settings`);
        if (planSettingsResponse.ok) {
          const planSettingsResult = await planSettingsResponse.json();
          const settings = planSettingsResult.data || planSettingsResult;
          setPlanSettings({
            yearlyDiscountPercentage: settings.yearlyDiscountPercentage || 0,
            databasePerTenantMonthlyPrice: settings.databasePerTenantMonthlyPrice || 0,
          });
          console.log('[CurrentPlan] Plan settings:', settings);
        }
      } catch (planSettingsError) {
        console.log('Could not fetch plan settings');
      }

      let settings: CompanySettings | null = null;
      try {
        const settingsResponse = await api.get<CompanySettings>('/settings/company-settings');
        settings = settingsResponse.data;
        // Merge company-settings with quota data (quota data takes priority)
        setCompanySettings(prev => {
          if (!prev) return settings!;

          // Quota-status data takes priority, fall back to company-settings only if quota data is missing
          return {
            ...settings!,
            // Prioritize quota-status data over company-settings
            current_plan_name: prev.current_plan_name || settings?.current_plan_name,
            current_plan_id: prev.current_plan_id || settings?.current_plan_id,
            trial_start_date: prev.trial_start_date || settings?.trial_start_date,
            trial_end_date: prev.trial_end_date || settings?.trial_end_date,
            plan_start_date: prev.plan_start_date || settings?.plan_start_date,
            plan_expiry_date: prev.plan_expiry_date || settings?.plan_expiry_date,
            subscription_status: prev.subscription_status || settings?.subscription_status,
            status: prev.status || settings?.status,
            max_seats: prev.max_seats || settings?.max_seats,
            max_jobs: prev.max_jobs || settings?.max_jobs,
            max_resume_uploads: prev.max_resume_uploads || settings?.max_resume_uploads,
            max_resume_searches: prev.max_resume_searches || settings?.max_resume_searches,
            max_assessments: prev.max_assessments || settings?.max_assessments,
            max_ai_interviews: prev.max_ai_interviews || settings?.max_ai_interviews,
            storage_limit_gb: prev.storage_limit_gb || settings?.storage_limit_gb,
          };
        });
        console.log('[CurrentPlan] Merged company settings with quota data');
      } catch (settingsError) {
        console.log('Could not fetch company settings, using quota data only');
        // Company settings API failed - quota data already set, no need to overwrite
      }

      // Fetch tenant_id from /auth/me (using data-plane API)
      try {
        const token = localStorage.getItem('accessToken');
        console.log('[CurrentPlan] Fetching tenant_id, token exists:', !!token);
        const meResponse = await fetch(`${API_URL}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        console.log('[CurrentPlan] /auth/me response status:', meResponse.status);
        if (meResponse.ok) {
          const meData = await meResponse.json();
          console.log('[CurrentPlan] /auth/me data:', meData);
          if (meData.tenant_id) {
            setTenantId(meData.tenant_id);
            console.log('[CurrentPlan] tenant_id set:', meData.tenant_id);
          }
        } else {
          console.log('[CurrentPlan] /auth/me failed:', meResponse.status, await meResponse.text());
        }
      } catch (err) {
        console.error('[CurrentPlan] Error fetching tenant_id:', err);
      }

      // Fetch plans from backend API (which proxies to external API)
      const plansResponse = await fetch(`${API_URL}/subscription/public/plans`);
      if (!plansResponse.ok) {
        throw new Error('Failed to fetch plans');
      }
      const plansResult = await plansResponse.json();
      const plansData: ApiPlan[] = plansResult.data || plansResult;

      const transformedPlans: DisplayPlan[] = plansData
        .filter(plan => plan.is_active && plan.is_public)
        .sort((a, b) => {
          if (a.display_order !== b.display_order) {
            return (a.display_order || 0) - (b.display_order || 0);
          }
          return a.base_price - b.base_price;
        })
        .map((plan) => {
          const featureNames = plan.features
            ?.filter(f => f.is_enabled)
            ?.map(f => f.feature_name) || [];

          const isCurrent =
            (settings?.current_plan_id !== undefined && Number(settings.current_plan_id) === Number(plan.id)) ||
            (settings?.current_plan_name?.toLowerCase() === plan.plan_name.toLowerCase());

          return {
            id: String(plan.id),
            numericId: plan.id,
            name: plan.plan_name,
            description: plan.description,
            price: plan.base_price > 0 ? plan.base_price : null,
            currency: plan.currency || 'INR',
            billingPeriod: plan.billing_period || 'ANNUAL',
            icon: getIconForPlan(plan.plan_name, plan.plan_tier),
            gradient: getGradientForPlan(plan.plan_name, plan.plan_tier),
            popular: plan.is_featured || false,
            features: featureNames,
            quotas: plan.quotas,
            isCurrent,
          };
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

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        setSuccessMessage(`Successfully upgraded to ${selectedQueuedUpgrade.new_plan_name}!`);
        setShowTCModal(false);
        setSelectedQueuedUpgrade(null);
        setTcAccepted(false);
        // Refresh data
        await fetchData();
        await fetchQueuedUpgrades();
      } else {
        setError(data.detail || 'Failed to apply upgrade');
      }
    } catch (err) {
      console.error('[CurrentPlan] Error applying upgrade:', err);
      setError(err instanceof Error ? err.message : 'Failed to apply upgrade');
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

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        setSuccessMessage(`Queued upgrade to ${selectedQueuedUpgrade.new_plan_name} has been cancelled.`);
        setShowCancelModal(false);
        setSelectedQueuedUpgrade(null);
        setCancelReason('');
        await fetchQueuedUpgrades();
      } else {
        setError(data.detail || 'Failed to cancel upgrade');
      }
    } catch (err) {
      console.error('[CurrentPlan] Error cancelling upgrade:', err);
      setError(err instanceof Error ? err.message : 'Failed to cancel upgrade');
    } finally {
      setIsCancellingUpgrade(false);
    }
  };

  useEffect(() => {
    // Prevent duplicate calls on re-renders or React Strict Mode
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    fetchData();
    fetchQueuedUpgrades();
  }, []);

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
    if (!plan.price) {
      setError('Cannot select a plan without a price');
      return;
    }
    setSelectedPlanForPayment(plan);
    setModalStep('isolation');
    setIsolationType('schema'); // Default to schema (checkbox unchecked)
    setIsNewTenant(false); // Always use existing
    setIsYearly(true); // Always yearly in popup
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

      // Request body per API spec
      const requestBody = {
        plan_id: selectedPlanForPayment.numericId,
        schema_per_tenant: isolationType === 'schema',
        database_per_tenant: isolationType === 'database',
        external_transaction_id: transactionId,
        billing_interval: isYearly ? 'ANNUAL' : 'MONTHLY',
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

        // Check if upgrade was queued (has active plan)
        if (result.queued) {
          console.log('[CurrentPlan] Upgrade queued:', result);
          // Refresh queued upgrades list
          await fetchQueuedUpgrades();
        } else {
          // The /subscription/{tenant_id}/select-plan endpoint already updates:
          // 1. tenants table in landlord DB
          // 2. company_settings in tenant DB
          // 3. POSTs to external admin API
          // So no additional API calls needed here

          // Update local state with the new plan and quotas
          if (selectedPlanForPayment) {
            setCompanySettings(prev => ({
              ...prev!,
              selected_plan_id: selectedPlanForPayment.numericId,
              current_plan_id: selectedPlanForPayment.numericId,
              current_plan_name: selectedPlanForPayment.name,
              subscription_status: 'active',
              status: 'active',
              payment_status: 'success',
              // Update quotas from the selected plan
              max_seats: selectedPlanForPayment.quotas?.max_seats || prev?.max_seats || 5,
              max_jobs: selectedPlanForPayment.quotas?.max_jobs || prev?.max_jobs || 5,
              max_resume_uploads: selectedPlanForPayment.quotas?.RU || prev?.max_resume_uploads || 100,
              max_resume_searches: selectedPlanForPayment.quotas?.RS || prev?.max_resume_searches || 100,
              max_assessments: selectedPlanForPayment.quotas?.AS || prev?.max_assessments || 10,
              max_ai_interviews: selectedPlanForPayment.quotas?.AIU || prev?.max_ai_interviews || 10,
              storage_limit_gb: selectedPlanForPayment.quotas?.storage_gb || prev?.storage_limit_gb || 5,
            }));

            // Update the plans to mark the new one as current
            setPlans(prevPlans => prevPlans.map(p => ({
              ...p,
              isCurrent: p.numericId === selectedPlanForPayment.numericId,
            })));
          }
        }

        // Refresh data after upgrade
        await fetchData();
      } else {
        setError(data.detail || data.message || 'Failed to upgrade plan');
      }
    } catch (err) {
      console.error('Error selecting plan:', err);
      setError(err instanceof Error ? err.message : 'Failed to select plan');
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
  const isOnTrial = quotaSubscriptionStatus
    ? quotaSubscriptionStatus.toLowerCase() === 'trial'
    : (companySettings?.status?.toLowerCase() === 'trial' ||
       companySettings?.subscription_status?.toLowerCase() === 'trial');
  const isPendingPayment = companySettings?.subscription_status?.toLowerCase() === 'pending_payment' ||
                           companySettings?.payment_status === 'pending';
  const isLocked = companySettings?.status?.toLowerCase() === 'locked';
  const isActive = companySettings?.status?.toLowerCase() === 'active';
  const statusBadge = getStatusBadge(companySettings?.status || 'trial', companySettings?.payment_status, freeTrialSettings?.trial_days || 14);
  const StatusIcon = statusBadge.icon;

  // For trial users, use days_remaining from API (via freeTrialSettings)
  // For paid users, calculate from plan expiry date
  const trialDaysRemaining = isOnTrial
    ? (freeTrialSettings?.trial_days ?? (companySettings?.trial_end_date ? getDaysRemaining(companySettings.trial_end_date) : 14))
    : (companySettings?.plan_expiry_date ? getDaysRemaining(companySettings.plan_expiry_date) : 0);

  // Calculate prices for payment
  const calculatePrices = () => {
    const basePrice = selectedPlanForPayment?.price || 0;
    const discountPercent = planSettings?.yearlyDiscountPercentage || 20;
    const monthlyPrice = basePrice;
    const yearlyPrice = Math.round(basePrice * 12 * (1 - discountPercent / 100));
    const yearlyFullPrice = basePrice * 12;
    const planPrice = isYearly ? yearlyPrice : monthlyPrice;
    const dbExtraCharge = isolationType === 'database' ? (planSettings?.databasePerTenantMonthlyPrice || 0) : 0;
    const dbChargeTotal = isYearly ? dbExtraCharge * 12 : dbExtraCharge;
    const totalAmount = planPrice + dbChargeTotal;
    return { basePrice, monthlyPrice, yearlyPrice, yearlyFullPrice, planPrice, dbExtraCharge, dbChargeTotal, totalAmount };
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
                    ? `You are on a Free Trial - ${trialDaysRemaining} days remaining`
                    : isActive
                      ? `You are on the ${(companySettings?.current_plan_name || currentPlan?.name || 'Unknown').replace(/\s*\([^)]*\)\s*$/, '')} plan`
                      : isPendingPayment
                        ? 'Complete payment to activate your selected plan'
                        : `You are on the ${(companySettings?.current_plan_name || 'Unknown').replace(/\s*\([^)]*\)\s*$/, '')} plan`
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
                {(companySettings?.current_plan_name || (isOnTrial ? 'Free Trial' : 'No Plan')).replace(/\s*\([^)]*\)\s*$/, '')}
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
                  'Custom'
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

          {/* Quotas - Using data from quota-status API via companySettings */}
          {companySettings && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-4">Your Plan Limits</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-semibold text-gray-900">
                    {companySettings.max_seats || '-'}
                  </p>
                  <p className="text-xs text-gray-600">Team Seats</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-semibold text-gray-900">
                    {companySettings.max_jobs || '-'}
                  </p>
                  <p className="text-xs text-gray-600">Job Postings</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-semibold text-gray-900">
                    {companySettings.max_resume_uploads || '-'}
                  </p>
                  <p className="text-xs text-gray-600">Resume Uploads</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-semibold text-gray-900">
                    {companySettings.max_resume_searches || '-'}
                  </p>
                  <p className="text-xs text-gray-600">Resume Searches</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-semibold text-gray-900">
                    {companySettings.max_assessments || '-'}
                  </p>
                  <p className="text-xs text-gray-600">Assessments</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-semibold text-gray-900">
                    {companySettings.max_ai_interviews || '-'}
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

        {/* Available Plans */}
        {plans.length > 0 && (
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
            </div>
            <div className={`grid gap-8 pt-8 ${
              plans.length === 1 ? 'md:grid-cols-1 max-w-md' :
              plans.length === 2 ? 'md:grid-cols-2 max-w-3xl' :
              'md:grid-cols-3'
            }`}>
              {plans.map((plan) => {
                const Icon = plan.icon;
                const isSelectedPending = isPendingPayment && companySettings?.selected_plan_id === plan.numericId;

                return (
                  <Card
                    key={plan.id}
                    className={`relative p-8 flex flex-col h-full ${
                      isSelectedPending
                        ? "border-2 border-orange-500 shadow-xl"
                        : plan.isCurrent
                          ? "border-2 border-gray-600 shadow-xl"
                          : plan.popular
                            ? "border-2 border-gray-800 shadow-xl scale-105"
                            : "border border-gray-200"
                    }`}
                  >
                    {isSelectedPending && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                        <Badge className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-1">
                          Selected - Pending Payment
                        </Badge>
                      </div>
                    )}
                    {plan.isCurrent && !isSelectedPending && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                        <Badge className="bg-gray-700 text-white px-4 py-1">
                          Current Plan
                        </Badge>
                      </div>
                    )}
                    {plan.popular && !plan.isCurrent && !isSelectedPending && (
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
                      {plan.price ? (
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-bold text-gray-900">
                            {formatCurrency(plan.price, plan.currency)}
                          </span>
                          <span className="text-gray-500 text-sm">/month</span>
                        </div>
                      ) : (
                        <div className="text-4xl font-bold text-gray-900">Custom</div>
                      )}
                    </div>

                    {/* Quotas Section */}
                    {plan.quotas && (
                      <div className="mb-6">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {plan.quotas.max_seats !== undefined && plan.quotas.max_seats >= 1 && (
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{plan.quotas.max_seats}</span>
                              <span className="text-gray-600">Team Members</span>
                            </div>
                          )}
                          {plan.quotas.max_jobs !== undefined && plan.quotas.max_jobs >= 1 && (
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{plan.quotas.max_jobs}</span>
                              <span className="text-gray-600">Job Postings</span>
                            </div>
                          )}
                          {plan.quotas.RU !== undefined && plan.quotas.RU >= 1 && (
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{plan.quotas.RU.toLocaleString()}</span>
                              <span className="text-gray-600">Resume Uploads</span>
                            </div>
                          )}
                          {plan.quotas.RS !== undefined && plan.quotas.RS >= 1 && (
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{plan.quotas.RS.toLocaleString()}</span>
                              <span className="text-gray-600">Resume Searches</span>
                            </div>
                          )}
                          {plan.quotas.AS !== undefined && plan.quotas.AS >= 1 && (
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{plan.quotas.AS.toLocaleString()}</span>
                              <span className="text-gray-600">Assessments</span>
                            </div>
                          )}
                          {plan.quotas.AIU !== undefined && plan.quotas.AIU >= 1 && (
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{plan.quotas.AIU.toLocaleString()}</span>
                              <span className="text-gray-600">AI Interviews</span>
                            </div>
                          )}
                          {plan.quotas.storage_gb !== undefined && plan.quotas.storage_gb >= 1 && (
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{plan.quotas.storage_gb}GB</span>
                              <span className="text-gray-600">Storage</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Features Section */}
                    {plan.features.length > 0 && (
                      <ul className="space-y-3">
                        {plan.features.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-3">
                            <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                            <span className="text-gray-700 text-sm">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* Spacer to push button to bottom */}
                    <div className="flex-grow" />

                    <button
                      onClick={() => handleChoosePlan(plan)}
                      disabled={plan.isCurrent || isSelectingPlan || isSelectedPending || !plan.price || queuedUpgrades.length > 0}
                      className={`block w-full h-12 rounded-lg font-medium text-center transition-all flex items-center justify-center gap-2 mt-auto ${
                        plan.isCurrent || isSelectedPending
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : queuedUpgrades.length > 0
                            ? "bg-amber-100 text-amber-600 cursor-not-allowed"
                            : !plan.price
                              ? "bg-gray-100 text-gray-500 cursor-not-allowed"
                              : plan.popular
                                ? "bg-gray-800 text-white hover:bg-gray-700"
                                : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {plan.isCurrent ? (
                        'Current Plan'
                      ) : isSelectedPending ? (
                        'Pending Payment'
                      ) : queuedUpgrades.length > 0 ? (
                        'Upgrade Queued'
                      ) : !plan.price ? (
                        'Contact Sales'
                      ) : isOnTrial || isLocked ? (
                        'Choose Plan'
                      ) : (
                        'Upgrade'
                      )}
                    </button>
                  </Card>
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
                      <span className="text-gray-600">Monthly Price:</span>
                      <span className="font-medium text-gray-900">
                        {formatCurrency(selectedPlanForPayment?.price || 0, selectedPlanForPayment?.currency || 'INR')}
                      </span>
                    </div>
                    {isolationType === 'database' && !isYearly && (
                      <div className="flex justify-between text-amber-700">
                        <span>Database Isolation Fee:</span>
                        <span className="font-medium">
                          +{formatCurrency(planSettings?.databasePerTenantMonthlyPrice || 5000, selectedPlanForPayment?.currency || 'INR')}/month
                        </span>
                      </div>
                    )}
                    {isYearly && (
                      <>
                        <div className="flex justify-between pt-2 border-t border-gray-200 text-green-700">
                          <span className="flex items-center gap-1">
                            <Crown className="w-4 h-4" />
                            Annual Plan ({planSettings?.yearlyDiscountPercentage || 20}% off):
                          </span>
                          <span className="font-medium">
                            {formatCurrency(
                              Math.round((selectedPlanForPayment?.price || 0) * 12 * (1 - (planSettings?.yearlyDiscountPercentage || 20) / 100)),
                              selectedPlanForPayment?.currency || 'INR'
                            )}
                          </span>
                        </div>
                        {isolationType === 'database' && (
                          <div className="flex justify-between text-amber-700">
                            <span>Database Isolation Fee (12 months):</span>
                            <span className="font-medium">
                              +{formatCurrency((planSettings?.databasePerTenantMonthlyPrice || 5000) * 12, selectedPlanForPayment?.currency || 'INR')}
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Total Summary - Above checkboxes */}
                <div className="bg-gray-800 text-white rounded-xl p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-semibold">Total</span>
                      <p className="text-xs text-gray-300">
                        {isYearly ? 'Billed annually (12× quotas)' : 'Billed monthly'}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-2xl">
                        {formatCurrency(
                          isYearly
                            ? Math.round((selectedPlanForPayment?.price || 0) * 12 * (1 - (planSettings?.yearlyDiscountPercentage || 10) / 100)) +
                              (isolationType === 'database' ? (planSettings?.databasePerTenantMonthlyPrice || 5000) * 12 : 0)
                            : (selectedPlanForPayment?.price || 0) + (isolationType === 'database' ? (planSettings?.databasePerTenantMonthlyPrice || 5000) : 0),
                          selectedPlanForPayment?.currency || 'INR'
                        )}
                      </span>
                      {isYearly && (
                        <p className="text-xs text-green-400">
                          You save {formatCurrency(
                            ((selectedPlanForPayment?.price || 0) * 12) -
                            Math.round((selectedPlanForPayment?.price || 0) * 12 * (1 - (planSettings?.yearlyDiscountPercentage || 10) / 100)),
                            selectedPlanForPayment?.currency || 'INR'
                          )}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Annual Plan Offer Checkbox */}
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
                      <Badge className="bg-green-100 text-green-700 text-xs">
                        Save {planSettings?.yearlyDiscountPercentage || 20}%
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">
                      Pay for 12 months, get {planSettings?.yearlyDiscountPercentage || 20}% discount + 12× quotas
                    </p>
                  </div>
                </label>

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
                          ? Math.round((selectedPlanForPayment?.price || 0) * 12 * (1 - (planSettings?.yearlyDiscountPercentage || 10) / 100)) +
                            (isolationType === 'database' ? (planSettings?.databasePerTenantMonthlyPrice || 5000) * 12 : 0)
                          : (selectedPlanForPayment?.price || 0) + (isolationType === 'database' ? (planSettings?.databasePerTenantMonthlyPrice || 5000) : 0),
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
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">Plan Upgrade Successful!</h3>
                      <p className="text-gray-600">Your subscription has been updated successfully.</p>
                    </div>

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
