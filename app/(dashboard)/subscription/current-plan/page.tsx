'use client';

import { CreditCard, Check, Loader2, Users, Building2, Zap, AlertCircle, Lock, Clock, CheckCircle, XCircle, X, Database, Layers, Package, Sparkles, ArrowRight, ArrowLeft, ArrowUpRight, Crown, FileText, Mail, ChevronDown, ChevronUp, Shield, BarChart3, Wallet, Receipt, RefreshCw, AlertTriangle, Briefcase, Gauge, ClipboardCheck, Video } from 'lucide-react';
import { useState, useEffect, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import api, { handleUnauthorized } from '@/lib/services/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip } from '@/components/ui/tooltip';
import PageBreadcrumb from '@/components/PageBreadcrumb';
import { decodePlanId } from '@/lib/utils/planEncoder';
import { toast } from 'sonner';
import { useQuota } from '@/contexts/QuotaContext';
import { useAuth } from '@/components/providers/AuthProvider';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import DowngradeWarningModal from '@/components/subscription/DowngradeWarningModal';
import { getPreviousPlan } from '@/lib/services/subscriptionService';
import { useRazorpay } from '@/lib/hooks/useRazorpay';
import { usePlanChange } from '@/components/providers/PlanChangeProvider';
import { formatISTDate } from '@/lib/utils/dateUtils';
// Sub-section pages — rendered inline below the tabs as additional sections.
import UsageDashboard from '@/components/UsageDashboard';
import PaymentMethodsPage from '@/app/(dashboard)/subscription/payment-methods/page';
import BillingHistoryPage from '@/app/(dashboard)/subscription/billing-history/page';
import RefundHistoryPage from '@/app/(dashboard)/subscription/refund-history/page';
import DisputeHistoryPage from '@/app/(dashboard)/subscription/dispute-history/page';
import UnitDisputesPage from '@/app/(dashboard)/subscription/unit-disputes/page';

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
  tier: string;  // Plan tier: STARTER, PROFESSIONAL, ENTERPRISE
  description: string;
  price: number | null;
  currency: string;
  billingPeriod: string;
  icon: typeof Users | typeof Building2 | typeof Zap;
  gradient: string;
  popular: boolean;
  features: string[];
  // Separate features for monthly and annual billing periods
  monthlyFeatures?: string[];
  annualFeatures?: string[];
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
  razorpay?: {
    payment_id: string;
    order_id: string;
    status: string;
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
  // Pricing breakdown (base plan + optional dedicated-DB fee + GST). The
  // dedicated-DB fee is only present when the tenant chose dedicated database.
  base_amount?: number;
  db_isolation_fee?: number;
  subtotal?: number;
  gst_rate?: number;
  gst_amount?: number;
  breakdown?: PricingBreakdown;
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
  if (name.includes('enterprise') || name.includes('premium') || tierLower === 'enterprise') return "from-brand-blue via-brand-blue-2 to-brand-teal";
  if (name.includes('business') || name.includes('professional') || name.includes('pro') || tierLower === 'professional') return "from-brand-blue to-brand-blue-2";
  return "from-brand-cyan to-brand-teal";
};

/**
 * Compare plan tiers (and billing interval within the same tier) to determine upgrade/downgrade.
 * Returns: 1 if target is higher (upgrade), -1 if lower (downgrade), 0 if identical.
 *
 * Same-tier billing interval rules:
 *   ANNUAL  → MONTHLY  = downgrade (-1)
 *   MONTHLY → ANNUAL   = upgrade   (+1)
 */
const comparePlanTiers = (
  currentTier: string | undefined,
  targetTier: string | undefined,
  currentInterval?: string,
  targetInterval?: string,
): number => {
  if (!currentTier || !targetTier) return 0;

  const tierOrder: Record<string, number> = {
    'starter': 1,
    'professional': 2,
    'enterprise': 3,
  };

  const currentLevel = tierOrder[currentTier.toLowerCase()] || 0;
  const targetLevel = tierOrder[targetTier.toLowerCase()] || 0;

  if (targetLevel > currentLevel) return 1;  // Upgrade
  if (targetLevel < currentLevel) return -1; // Downgrade

  // Same tier — check billing interval
  if (currentInterval && targetInterval) {
    const cur = currentInterval.toUpperCase();
    const tgt = targetInterval.toUpperCase();
    if (cur === 'ANNUAL' && tgt === 'MONTHLY') return -1; // Downgrade
    if (cur === 'MONTHLY' && tgt === 'ANNUAL') return 1;  // Upgrade
  }

  return 0; // Same tier, same interval
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


// Pricing breakdown shared by the queued-upgrade apply/cancel popups + list.
interface PricingBreakdown {
  base_amount?: number;
  db_isolation_fee?: number;
  subtotal?: number;
  gst_rate?: number;
  gst_amount?: number;
  total_amount?: number;
  currency?: string;
}

// Resolve a breakdown from a queued upgrade, tolerating either the nested
// `breakdown` object or flat top-level fields, and falling back to payment_amount.
const resolveBreakdown = (u: QueuedUpgrade): PricingBreakdown => {
  const bd = u.breakdown || {};
  return {
    base_amount: bd.base_amount ?? u.base_amount,
    db_isolation_fee: bd.db_isolation_fee ?? u.db_isolation_fee,
    subtotal: bd.subtotal ?? u.subtotal,
    gst_rate: bd.gst_rate ?? u.gst_rate ?? 18,
    gst_amount: bd.gst_amount ?? u.gst_amount,
    total_amount: bd.total_amount ?? u.payment_amount,
    currency: bd.currency ?? u.payment_currency ?? 'INR',
  };
};

// Renders the full amount breakdown (base + optional dedicated-DB fee + GST +
// total). The dedicated-database row only shows when a fee actually applies.
// Falls back to a single total line for older records with no breakdown.
const QueuedAmountBreakdown = ({ upgrade }: { upgrade: QueuedUpgrade }) => {
  const bd = resolveBreakdown(upgrade);
  const cur = bd.currency || 'INR';
  const hasBreakdown = bd.base_amount != null || bd.gst_amount != null;
  if (!hasBreakdown) {
    return (
      <div className="flex justify-between">
        <span className="text-gray-500 dark:text-slate-500">Amount Paid:</span>
        <span className="font-medium text-gray-900 dark:text-slate-50">
          {formatCurrency(bd.total_amount, cur)}
        </span>
      </div>
    );
  }
  const showDb = (bd.db_isolation_fee ?? 0) > 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <span className="text-gray-500 dark:text-slate-500">Base plan:</span>
        <span className="text-gray-900 dark:text-slate-50">{formatCurrency(bd.base_amount, cur)}</span>
      </div>
      {showDb && (
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-slate-500">Dedicated database:</span>
          <span className="text-gray-900 dark:text-slate-50">{formatCurrency(bd.db_isolation_fee, cur)}</span>
        </div>
      )}
      {showDb && bd.subtotal != null && (
        <div className="flex justify-between">
          <span className="text-gray-500 dark:text-slate-500">Subtotal:</span>
          <span className="text-gray-900 dark:text-slate-50">{formatCurrency(bd.subtotal, cur)}</span>
        </div>
      )}
      <div className="flex justify-between">
        <span className="text-gray-500 dark:text-slate-500">GST ({bd.gst_rate ?? 18}%):</span>
        <span className="text-gray-900 dark:text-slate-50">{formatCurrency(bd.gst_amount, cur)}</span>
      </div>
      <div className="flex justify-between border-t border-gray-200 dark:border-slate-700 pt-1 mt-1">
        <span className="font-semibold text-gray-700 dark:text-slate-300">Total:</span>
        <span className="font-semibold text-gray-900 dark:text-slate-50">{formatCurrency(bd.total_amount, cur)}</span>
      </div>
    </div>
  );
};


type PlanStatusVariant = 'success' | 'info' | 'warning' | 'destructive' | 'muted';
const getStatusBadge = (status?: string, paymentStatus?: string, trialDays?: number): { variant: PlanStatusVariant; label: string; icon: typeof Clock } => {
  if (paymentStatus === 'pending') {
    return { variant: 'warning', label: 'Pending Payment', icon: Clock };
  }

  if (!status) {
    return { variant: 'muted', label: 'Unknown', icon: AlertCircle };
  }

  switch (status.toLowerCase()) {
    case 'active':
      return { variant: 'success', label: 'Active', icon: CheckCircle };
    case 'trial':
      return { variant: 'warning', label: 'Free Trial', icon: Clock };
    case 'pending_payment':
      return { variant: 'warning', label: 'Pending Payment', icon: Clock };
    case 'suspended':
      return { variant: 'destructive', label: 'Suspended', icon: XCircle };
    case 'expired':
      return { variant: 'destructive', label: 'Expired', icon: XCircle };
    case 'locked':
      return { variant: 'destructive', label: 'Account Locked', icon: Lock };
    case 'error':
      return { variant: 'destructive', label: 'Unable to load', icon: AlertCircle };
    case 'loading':
      return { variant: 'muted', label: 'Loading...', icon: Clock };
    default:
      return { variant: 'muted', label: 'Unknown', icon: AlertCircle };
  }
};

const getDaysRemaining = (endDate: string): number => {
  const end = new Date(endDate);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

// Helper function to calculate remaining time from end date
// Returns: { isExpired, days, hours, minutes, displayText }
const calculateRemainingTime = (endDateString: string | undefined): {
  isExpired: boolean;
  days: number;
  hours: number;
  minutes: number;
  displayText: string;
} => {
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
      displayText: `${diffDays} day${diffDays > 1 ? 's' : ''} remaining`
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
      displayText: `${remainingHours}h${minutePart} remaining`
    };
  }

  // Only minutes remaining
  return {
    isExpired: false,
    days: 0,
    hours: 0,
    minutes: remainingMinutes,
    displayText: `${remainingMinutes} minute${remainingMinutes > 1 ? 's' : ''} remaining`
  };
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
    if (value <= 0) return '-';
    if (value >= 999999) return 'Unlimited';
    return value.toLocaleString();
  }
  return String(value);
};

// Neutral-gray skeleton mirroring the Current Plan layout: one shared card
// (summary strip + cycle bar + 6 limit tiles), subscription
// pill tabs, and a plans grid. Shared with loading.tsx.
export function CurrentPlanLoadingSkeleton() {
  return (
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
        <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
          {/* Shared current-plan card: plan summary, cycle bar and limits */}
          <section className="mb-4 flex flex-col gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-4 rounded-lg bg-gray-50 p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
                <div className="space-y-2">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-6 w-56" />
                  <Skeleton className="h-3.5 w-72 max-w-full" />
                </div>
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-8 w-32" />
              </div>
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-80 max-w-full" />
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-lg bg-gray-50 p-3">
                  <Skeleton className="mb-2 h-3 w-20" />
                  <Skeleton className="h-6 w-14" />
                </div>
              ))}
            </div>
          </section>

          {/* Subscription tabs: segmented control below lg, folder tabs from lg */}
          <section className="mb-3 lg:mb-5">
            <Skeleton className="h-9 w-full rounded-lg lg:hidden" />
            <div className="hidden gap-1 border-b border-gray-200 lg:flex">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="mb-1.5 h-8 w-28 shrink-0 rounded-t-lg" />
              ))}
            </div>
          </section>

          <div className="rounded-xl border border-gray-200 bg-slate-100 p-4 sm:p-5 lg:-mt-5 lg:rounded-t-none lg:border-t-0">
            {/* Plans heading + toggle */}
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="space-y-2">
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-4 w-72 max-w-full" />
              </div>
              <Skeleton className="h-9 w-44 rounded-xl" />
            </div>

            {/* Plans — one boxed tier section */}
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex items-center gap-3 border-b border-gray-100 pb-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-56 max-w-full" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 pt-3 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
                  <Skeleton className="mb-2 h-5 w-32" />
                  <Skeleton className="mb-4 h-3.5 w-full" />
                  <Skeleton className="mb-4 h-8 w-28" />
                  <div className="mb-4 space-y-2 rounded-lg bg-gray-50 p-3">
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-5/6" />
                    <Skeleton className="h-3 w-2/3" />
                  </div>
                  <Skeleton className="h-11 w-full rounded-lg" />
                </div>
              ))}
            </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function CurrentPlanContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { logout, user, isBillingManager, isTenantAdmin, hasPermission } = useAuth();
  const canUpgradePlan = hasPermission('canUpgradePlan');
  // RBAC03: a Billing Manager sees the plans but cannot change them — the
  // cards stay visible with every Choose/Upgrade button greyed (never hidden).
  const planChangeLocked = !canUpgradePlan || isBillingManager;

  // Subscription navigation tabs — surfaced on this page instead of the sidebar.
  // `visible: false` = no permission: the tab stays rendered, greyed, with a
  // hover tooltip and a no-op click (never hidden).
  const billingLinks: { id: string; short: string; label: string; icon: typeof BarChart3; href: string; visible: boolean; deniedMessage?: string }[] = [
    { id: 'current-plan', short: 'Plans', label: 'Upgrade Plans', icon: BarChart3, href: '/subscription/current-plan', visible: true },
    { id: 'usage-quotas', short: 'Usage', label: 'Usage & Quotas', icon: BarChart3, href: '/subscription/usage-quotas', visible: isTenantAdmin || hasPermission('canViewUsage'), deniedMessage: 'You do not have permission to view usage & quotas' },
    { id: 'billing-history', short: 'Billing', label: 'Billing History', icon: Receipt, href: '/subscription/billing-history', visible: isTenantAdmin || hasPermission('canViewBillingHistory'), deniedMessage: 'You do not have permission to view billing history' },
    { id: 'refund-history', short: 'Refunds', label: 'Refund History', icon: RefreshCw, href: '/subscription/refund-history', visible: isTenantAdmin || hasPermission('canViewRefundHistory'), deniedMessage: 'You do not have permission to view refund history' },
    { id: 'dispute-history', short: 'Disputes', label: 'Dispute History', icon: AlertTriangle, href: '/subscription/dispute-history', visible: isTenantAdmin || hasPermission('canViewDisputeHistory'), deniedMessage: 'You do not have permission to view dispute history' },
    { id: 'unit-disputes', short: 'Units', label: 'Unit Disputes', icon: Shield, href: '/subscription/unit-disputes', visible: isTenantAdmin || hasPermission('canViewUsage'), deniedMessage: 'You do not have permission to view unit disputes' },
    { id: 'payment-methods', short: 'Payments', label: 'Payment Methods', icon: Wallet, href: '/subscription/payment-methods', visible: isTenantAdmin || hasPermission('canViewPaymentMethods'), deniedMessage: 'You do not have permission to view payment methods' },
  ];

  // Use shared quota context - prevents duplicate API calls
  const { quotaData: sharedQuotaData, loading: quotaLoading, refetch: refetchQuota } = useQuota();
  /* The latest context value, for fetchData. fetchData is a plain function
     re-created each render, so a call made after an await (payment, plan
     change) ran the closure of the render it started in — still holding the
     quota from before the change. */
  const sharedQuotaDataRef = useRef(sharedQuotaData);
  useEffect(() => { sharedQuotaDataRef.current = sharedQuotaData; }, [sharedQuotaData]);

  // Plan change acceptance
  const { hasPendingChanges, daysRemaining, currentChange, openReviewModal } = usePlanChange();

  // Check if user already has dedicated database isolation (cannot be downgraded)
  const hasDedicatedDatabase = sharedQuotaData?.plan_info?.isolation_type?.toUpperCase() === 'DATABASE';

  // Get encoded plan from URL (from login redirect after signup)
  const encodedPlanFromUrl = searchParams.get('plan');

  // Active subscription section — drives the inline tab switcher.
  // Defaults to 'current-plan' so the page loads with the existing plan view.
  // Other sections are appended below the tabs; current-plan content stays visible.
  const [activeSection, setActiveSection] = useState<'current-plan' | 'usage-quotas' | 'payment-methods' | 'billing-history' | 'refund-history' | 'dispute-history' | 'unit-disputes'>('current-plan');

  /* Deep link from the header's plan arrow: ?section=usage-quotas opens that
     tab, and &focus=quota-overview scrolls to the Quota Overview card once it
     exists. The card mounts only after the embedded Usage & Quotas page loads
     its data, so a one-shot scrollIntoView would fire into nothing — poll
     briefly for the element instead, and give up quietly after ~10s. */
  useEffect(() => {
    const section = searchParams.get('section');
    if (section && section !== activeSection && billingLinks.some(link => link.id === section && link.visible)) {
      setActiveSection(section as typeof activeSection);
    }
    if (searchParams.get('focus') !== 'quota-overview') return;
    let tries = 0;
    const timer = setInterval(() => {
      const el = document.getElementById('quota-overview');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        clearInterval(timer);
      } else if (++tries > 40) {
        clearInterval(timer);
      }
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
  const [isDowngradePayment, setIsDowngradePayment] = useState(false);
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

  // Downgrade warning modal state
  const [showDowngradeWarning, setShowDowngradeWarning] = useState(false);
  const [downgradeWarningData, setDowngradeWarningData] = useState<{
    currentPlanName: string;
    targetPlanName: string;
    overages: any[];
    nearLimitQuotas?: any[];
    targetPlan?: DisplayPlan;
  } | null>(null);
  const [formErrors, setFormErrors] = useState<Partial<PaymentFormData>>({});
  const [paymentStep, setPaymentStep] = useState<string>('');
  const { openCheckout, isProcessing: razorpayProcessing } = useRazorpay();

  // Plan settings from admin API (yearly discount, database extra charge)
  const [planSettings, setPlanSettings] = useState<PlanSettings | null>(null);
  const [planSettingsError, setPlanSettingsError] = useState(false);

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
  /* An earlier plan payment was captured but the plan isn't live yet (the
     billing system is retrying, or it needs support). No new purchase until
     it's resolved — the backend refuses the order (409
     PLAN_CHANGE_IN_PROGRESS); this shows why and disables Choose Plan. */
  const [purchaseHold, setPurchaseHold] = useState<{
    message: string;
    needsSupport: boolean;
    planName?: string | null;
    paymentReference?: string | null;
  } | null>(null);
  const [showTCModal, setShowTCModal] = useState(false);
  const [selectedQueuedUpgrade, setSelectedQueuedUpgrade] = useState<QueuedUpgrade | null>(null);
  const [tcAccepted, setTcAccepted] = useState(false);
  const [isApplyingUpgrade, setIsApplyingUpgrade] = useState(false);
  const [isCancellingUpgrade, setIsCancellingUpgrade] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [expandedFeaturesPlan, setExpandedFeaturesPlan] = useState<string | null>(null);
  const [showAllModalFeatures, setShowAllModalFeatures] = useState(false);
  const paymentModalRef = useRef<HTMLDivElement>(null);

  // While the payment modal is open, lock the dashboard's scroll container
  // behind it so no background scrollbar shows next to the dialog.
  useEffect(() => {
    if (!showPaymentModal) return;
    const locked: { el: HTMLElement; overflow: string }[] = [];
    let el = paymentModalRef.current?.parentElement || null;
    while (el) {
      const oy = getComputedStyle(el).overflowY;
      if (oy === 'auto' || oy === 'scroll') {
        locked.push({ el, overflow: el.style.overflowY });
        el.style.overflowY = 'hidden';
      }
      el = el.parentElement;
    }
    return () => locked.forEach(({ el, overflow }) => { el.style.overflowY = overflow; });
  }, [showPaymentModal]);
  const [showAdminMeta, setShowAdminMeta] = useState(false);

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

  // `freshQuota`: what refetchQuota() just returned, after a plan/payment
  // change — newer than any value this render has seen.
  const fetchData = async (freshQuota?: typeof sharedQuotaData) => {
    try {
      setIsLoading(true);
      setError(null);
      setTenantStatus(null);

      // Use shared quota data from context (prevents duplicate API calls)
      // The sharedQuotaData comes from QuotaContext which is fetched once at dashboard layout level
      const quotaData: any = freshQuota ?? sharedQuotaDataRef.current;
      console.log('[CurrentPlan] Using shared quota data from context:', quotaData ? 'available' : 'not yet loaded');
      console.log('[CurrentPlan] quotaData:', quotaData);
      console.log('[CurrentPlan] quotaLoading:', quotaLoading);

      // Check is_trial from quota-status API (handle both boolean and string)
      const isTrial = quotaData?.is_trial === true || quotaData?.is_trial === 'true' || quotaData?.quota_source === 'FREE_TRIAL';

      // Determine if subscription is expired (use local variable, not state)
      let localSubscriptionStatus = 'active';

      // Set subscription status early (even if quotas are missing)
      if (isTrial) {
        localSubscriptionStatus = 'trial';
        setQuotaSubscriptionStatus('trial');
        console.log('[CurrentPlan] Setting subscription_status as trial (is_trial detected)');
      } else if (quotaData) {
        // Not on trial - set to active (or use API status if available)
        const status = quotaData.subscription_status || 'active';
        localSubscriptionStatus = status;
        setQuotaSubscriptionStatus(status);
        console.log('[CurrentPlan] Setting subscription_status as:', status, '(is_trial:', quotaData.is_trial, ')');
      } else {
        // quotaData is null - subscription is expired
        localSubscriptionStatus = 'expired';
      }

      // Check if subscription is expired by date (trial or paid)
      // Backend may return status='trial' even when trial_end_date is in the past
      let isExpiredByDate = false;
      const now = new Date();

      if (quotaData?.trial_end_date) {
        const trialEndDate = new Date(quotaData.trial_end_date);
        if (trialEndDate < now) {
          console.log('[CurrentPlan] Trial has expired by date:', quotaData.trial_end_date);
          isExpiredByDate = true;
        }
      } else if (quotaData?.plan_expiry_date) {
        const planExpiryDate = new Date(quotaData.plan_expiry_date);
        if (planExpiryDate < now) {
          console.log('[CurrentPlan] Plan has expired by date:', quotaData.plan_expiry_date);
          isExpiredByDate = true;
        }
      } else if (quotaData?.billing_period?.end) {
        const billingEndDate = new Date(quotaData.billing_period.end);
        if (billingEndDate < now) {
          console.log('[CurrentPlan] Billing period has expired by date:', quotaData.billing_period.end);
          isExpiredByDate = true;
        }
      }

      // If subscription is expired (by status or by date), fetch previous plan from Control Plane
      // This is the single source of truth for expired users (trial or paid)
      const shouldFetchPreviousPlan = localSubscriptionStatus === 'expired' ||
                                       quotaData?.subscription_status === 'expired' ||
                                       isExpiredByDate;

      // Track if we loaded data from previous-plan API (to skip quota-status overwrite)
      let loadedFromPreviousPlan = false;

      if (shouldFetchPreviousPlan && user?.tenantId) {
        console.log('[CurrentPlan] Subscription expired - fetching previous plan from Control Plane');
        setQuotaSubscriptionStatus('expired');

        try {
          // Single source of truth: Control Plane previous-plan API
          const previousPlanResponse = await getPreviousPlan(user.tenantId);
          const previousPlanData = previousPlanResponse?.data || previousPlanResponse;

          if (previousPlanData) {
            console.log('[CurrentPlan] Got previous plan details from Control Plane:', previousPlanData);

            // Extract expired plan details from Control Plane response
            // Response structure: { expired_plan: { plan_name, credits: {...}, start_date, end_date } }
            const expiredPlan = previousPlanData.expired_plan;
            const previousPaid = previousPlanData.previous_plan; // For paid plans that expired

            // Use expired_plan if available (free trial), otherwise use previous_plan (paid plan)
            const planDetails = expiredPlan || previousPaid;

            if (planDetails) {
              const isFreeTrial = planDetails.plan_type === 'FREE_TRIAL';
              const credits = planDetails.credits || {};

              setCompanySettings({
                current_plan_name: planDetails.plan_name || 'Unknown Plan',
                current_plan_id: planDetails.plan_id || null,
                subscription_status: 'expired',
                status: 'expired',
                // Set both plan dates AND trial dates so UI can display correctly
                // For trials: plan_start/expiry should match trial dates for display
                plan_expiry_date: planDetails.end_date,
                plan_start_date: planDetails.start_date,
                trial_end_date: isFreeTrial ? planDetails.end_date : null,
                trial_start_date: isFreeTrial ? planDetails.start_date : null,
                // Map credits to quota fields
                max_resume_searches: credits.RS || 0,
                max_assessments: credits.AS || 0,
                max_ai_interviews: credits.AIU || 0,
                max_resume_uploads: credits.RU || 0,
                max_seats: credits.max_seats || 0,
                max_jobs: credits.max_jobs || 0,
                storage_limit_gb: credits.storage_gb || 0,
                payment_status: 'expired',
              } as CompanySettings);

              // Mark that we loaded data from previous-plan API
              loadedFromPreviousPlan = true;
            } else {
              // No plan details available - set minimal expired state
              console.warn('[CurrentPlan] No expired plan details available in response');
              setCompanySettings(prev => ({
                ...(prev || {}),
                subscription_status: 'expired',
                status: 'expired',
              } as CompanySettings));
            }
          } else {
            // No previous plan data - set minimal expired state
            console.warn('[CurrentPlan] No previous plan data available');
            setCompanySettings(prev => ({
              ...(prev || {}),
              subscription_status: 'expired',
              status: 'expired',
            } as CompanySettings));
          }
        } catch (previousPlanError) {
          console.error('[CurrentPlan] Failed to fetch previous plan:', previousPlanError);
          // Set minimal expired state on error
          setCompanySettings(prev => ({
            ...(prev || {}),
            subscription_status: 'expired',
            status: 'expired',
          } as CompanySettings));
        }
        // Don't set error - allow user to select a plan to renew
      }

      // Only bind quota-status data if we didn't load from previous-plan API
      // (previous-plan is the source of truth for expired users)
      if (!loadedFromPreviousPlan && (quotaData?.quotas || quotaData)) {
        console.log('[CurrentPlan] Using quota-status data (active subscription)');

        // Update company settings with data from quota-status API
        const quotas = quotaData.quotas || {};

        // For FREE TRIAL: Get dates from root level (backend returns trial_start_date/trial_end_date at root)
        // Use billing_period as fallback when trial_info is missing
        const trialStartDate = quotaData.trial_start_date || quotaData.trial_info?.trial_start_date || quotaData.billing_period?.start || null;
        const trialEndDate = quotaData.trial_end_date || quotaData.trial_info?.trial_end_date || quotaData.billing_period?.end || null;

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
      } else if (loadedFromPreviousPlan) {
        console.log('[CurrentPlan] Skipping quota-status data binding - using previous-plan data as source of truth');
      }

      // Check if subscription is expired to reduce wasteful API calls
      // Use local variable instead of state (state updates are async)
      const isSubscriptionExpired = localSubscriptionStatus === 'expired' ||
                                    quotaData?.subscription_status === 'expired';

      console.log('[CurrentPlan] isExpired check:', isSubscriptionExpired, 'localSubscriptionStatus:', localSubscriptionStatus);

      // Fetch plan settings (yearly discount, database extra charge)
      try {
        const planSettingsResponse = await fetch(`${API_URL}/addons/plan-settings`);
        if (planSettingsResponse.ok) {
          const planSettingsResult = await planSettingsResponse.json();
          const settings = planSettingsResult.data || planSettingsResult;
          if (settings.databasePerTenantMonthlyPrice == null) {
            setPlanSettingsError(true);
          } else {
            setPlanSettings({
              yearlyDiscountPercentage: settings.yearlyDiscountPercentage,
              databasePerTenantMonthlyPrice: settings.databasePerTenantMonthlyPrice,
            });
            console.log('[CurrentPlan] Plan settings:', settings);
          }
        } else {
          setPlanSettingsError(true);
        }
      } catch {
        setPlanSettingsError(true);
      }

      // NOTE: All plan data now comes from /usage/quota-status API (Admin API) or previous-plan API (for expired users)
      // No need to call /settings/company-settings - quota-status is the single source of truth
      console.log('[CurrentPlan] Using quota-status API as single source of truth for plan data');

      // Get tenant_id from AuthContext (already fetched during login)
      if (user?.tenantId) {
        setTenantId(user.tenantId);
        console.log('[CurrentPlan] tenant_id from AuthContext:', user.tenantId);
      }

      // Fetch plans from backend API (which proxies to external API)
      // Always fetch to show renewal options even if expired
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

      const transformedPlans: DisplayPlan[] = ((Array.isArray(plansArray) ? plansArray : [])
        .map((groupedPlan: GroupedPlan) => {
          const monthly = groupedPlan.billing_options?.monthly;
          const annual = groupedPlan.billing_options?.annual;

          // Use monthly plan as base, fallback to annual if no monthly
          const basePlan = monthly || annual;
          if (!basePlan) return null;

          // Skip if neither monthly nor annual is active/public
          if (!monthly?.is_active && !annual?.is_active) return null;
          if (!monthly?.is_public && !annual?.is_public) return null;

          const monthlyFeatureNames = monthly?.features
            ?.filter(f => f.is_enabled)
            ?.map(f => f.feature_name) || [];
          const annualFeatureNames = annual?.features
            ?.filter(f => f.is_enabled)
            ?.map(f => f.feature_name) || [];
          const featureNames = monthlyFeatureNames.length > 0 ? monthlyFeatureNames : annualFeatureNames;

          // Check if monthly or annual plan is the current plan
          // Use quota-status API as single source of truth for plan info
          const currentPlanId = quotaData?.plan_info?.plan_id;
          const currentPlanName = quotaData?.plan_name ?? quotaData?.plan_info?.plan_name;

          const isCurrentMonthly = currentPlanId !== undefined && currentPlanId !== null &&
            Number(currentPlanId) === Number(monthly?.id);
          const isCurrentAnnual = currentPlanId !== undefined && currentPlanId !== null &&
            Number(currentPlanId) === Number(annual?.id);
          const isCurrent = isCurrentMonthly || isCurrentAnnual ||
            !!(currentPlanName && currentPlanName.toLowerCase() === groupedPlan.plan_name.toLowerCase());

          return {
            id: String(basePlan.id),
            numericId: basePlan.id,
            name: groupedPlan.plan_name,
            tier: groupedPlan.plan_tier,  // STARTER, PROFESSIONAL, ENTERPRISE
            description: groupedPlan.description,
            price: monthly?.base_price ?? null,
            currency: basePlan.currency,
            billingPeriod: basePlan.billing_period,
            icon: getIconForPlan(groupedPlan.plan_name, groupedPlan.plan_tier),
            gradient: getGradientForPlan(groupedPlan.plan_name, groupedPlan.plan_tier),
            popular: basePlan.is_featured || false,
            features: featureNames,
            monthlyFeatures: monthlyFeatureNames,
            annualFeatures: annualFeatureNames,
            quotas: basePlan.quotas,
            // Store separate quotas for monthly and annual from API
            monthlyQuotas: monthly?.quotas,
            annualQuotas: annual?.quotas,
            // Discount percentage from API
            discountPercentage: (groupedPlan as any).discount_percentage ?? (annual as any)?.discount_percentage,
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
        .filter((plan) => plan !== null && plan !== undefined) as DisplayPlan[])
        .sort((a, b) => {
          const tierOrder: Record<string, number> = { STARTER: 0, PROFESSIONAL: 1, ENTERPRISE: 2 };
          const orderA = tierOrder[a.tier?.toUpperCase()] ?? 99;
          const orderB = tierOrder[b.tier?.toUpperCase()] ?? 99;
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

  const applyPurchaseStatus = (st: any) => {
    if (st?.in_progress && st?.reason === 'unfulfilled_payment' && st?.hold) {
      setPurchaseHold({
        message: st.message,
        needsSupport: !!st.hold.needs_support,
        planName: st.hold.plan_name,
        paymentReference: st.hold.payment_reference || st.hold.razorpay_order_id,
      });
    } else {
      setPurchaseHold(null);
    }
  };

  // Is an earlier plan payment still waiting to be applied?
  const fetchPurchaseStatus = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const tid = tenantId || user?.tenantId;
      if (!token || !tid) return;
      const response = await fetch(`${API_URL}/subscription/${tid}/purchase-status`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!response.ok) return;
      const body = await response.json();
      applyPurchaseStatus(body?.data);
    } catch (err) {
      console.error('[CurrentPlan] purchase-status failed:', err);
    }
  };

  // Fetch queued upgrades
  const fetchQueuedUpgrades = async () => {
    try {
      // Skip if subscription is expired to reduce wasteful API calls
      // If sharedQuotaData is null, it means quota-status API failed (likely expired)
      const isExpired = !sharedQuotaData ||
                       sharedQuotaData?.subscription_status === 'expired';

      if (isExpired) {
        console.log('[CurrentPlan] Skipping queued-upgrades API call - subscription expired or quota unavailable');
        return;
      }

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
          user_id: user?.id,
          user_email: user?.email,
        }),
      });

      // Handle 401 - logout and redirect
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const data = await response.json();

      // 202: the billing system has not applied the change yet (e.g. a
      // database migration failed and will be retried). The plan was NOT
      // switched, so stay on the current plan - no logout, no success toast.
      if (response.status === 202 && data.status === 'pending_retry') {
        toast.info('Plan change pending', {
          description: data.data?.message || 'Your plan change will be retried automatically. Your current plan stays active until it completes.',
          duration: 8000,
        });
        setShowTCModal(false);
        setSelectedQueuedUpgrade(null);
        setTcAccepted(false);
        window.dispatchEvent(new CustomEvent('notificationTrigger'));
        await fetchQueuedUpgrades();
        return;
      }

      if (response.ok && (data.status === 'success' || data.status === 'partial')) {
        const appliedPlan = plans.find(p => p.name === selectedQueuedUpgrade.new_plan_name);
        const isApplyDowngrade = comparePlanTiers(
          currentPlan?.tier, appliedPlan?.tier,
          currentPlanBillingPeriod,
          selectedQueuedUpgrade.billing_interval || (isYearly ? 'ANNUAL' : 'MONTHLY'),
        ) === -1;
        const applyLabel = isApplyDowngrade ? 'downgrade' : 'upgrade';

        // Check if it was a partial success (local update succeeded but admin API failed)
        if (data.status === 'partial') {
          const adminError = data.data?.admin_error || 'Admin system sync failed';
          toast.warning(`Plan ${applyLabel}d with warnings`, {
            description: `${adminError}. You will be redirected to login.`,
            duration: 3000,
          });
        } else {
          toast.success(`Successfully ${applyLabel}d to ${selectedQueuedUpgrade.new_plan_name}!`, {
            description: 'You will be redirected to login to apply your new plan.',
            duration: 3000,
          });
        }

        setShowTCModal(false);
        setSelectedQueuedUpgrade(null);
        setTcAccepted(false);

        // Refresh notifications before logout so bell updates during toast
        window.dispatchEvent(new CustomEvent('notificationTrigger'));

        // Logout and redirect to login with correct direction param
        setTimeout(() => {
          logout();
          router.push(isApplyDowngrade ? '/login?downgraded=true' : '/login?upgraded=true');
        }, 2000);
        return; // Exit early
      } else {
        // Handle both string and object error formats
        const errorDetail = data.detail;
        let errorMsg = typeof errorDetail === 'string'
          ? errorDetail
          : errorDetail?.message || data.data?.message || 'Failed to apply upgrade';
        // A final failure from the billing system carries the invoice number
        // so the user can quote it to support.
        if (errorDetail && typeof errorDetail === 'object' && errorDetail.invoice_number) {
          errorMsg = `${errorMsg} Reference: invoice ${errorDetail.invoice_number}.`;
        }

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
      const userIdParam = user?.id ? `&user_id=${encodeURIComponent(user.id)}` : '';
      const userEmailParam = user?.email ? `&user_email=${encodeURIComponent(user.email)}` : '';
      const response = await fetch(`${API_URL}/subscription/queued-upgrades/${selectedQueuedUpgrade.id}?reason=${reasonParam}${userIdParam}${userEmailParam}`, {
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
        const cancelledPlan = plans.find(p => p.name === selectedQueuedUpgrade.new_plan_name);
        const isCancellingDowngrade = comparePlanTiers(
          currentPlan?.tier, cancelledPlan?.tier,
          currentPlanBillingPeriod,
          selectedQueuedUpgrade.billing_interval || (isYearly ? 'ANNUAL' : 'MONTHLY'),
        ) === -1;
        setSuccessMessage(`Queued ${isCancellingDowngrade ? 'downgrade' : 'upgrade'} to ${selectedQueuedUpgrade.new_plan_name} has been cancelled.`);
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
    fetchPurchaseStatus();
  }, [sharedQuotaData, quotaLoading]);

  // While a payment is waiting to be applied, re-check whenever the tab
  // regains focus — the billing system finishes it in the background.
  useEffect(() => {
    if (!purchaseHold) return;
    const onFocus = () => { fetchPurchaseStatus(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseHold]);

  // Auto-select plan from URL parameter (from pricing page flow)
  useEffect(() => {
    if (encodedPlanFromUrl && plans.length > 0 && !selectedPlanForPayment) {
      // A Billing Manager (or anyone without canUpgradePlan) cannot change
      // plans: drop the pricing-page plan link instead of starting a purchase.
      if (planChangeLocked) {
        window.history.replaceState({}, '', window.location.pathname);
        return;
      }
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
  }, [encodedPlanFromUrl, plans, selectedPlanForPayment, planChangeLocked]);

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
    if (planChangeLocked) return;

    // Check if plan has any pricing (monthly OR annual)
    if (!plan.monthlyPrice && !plan.annualPrice) {
      setError('Cannot select a plan without a price');
      return;
    }

    // Check if this is a downgrade (tier or billing interval)
    const tierComparison = comparePlanTiers(
      currentPlan?.tier,
      plan.tier,
      currentPlanBillingPeriod,          // current: ANNUAL or MONTHLY
      isYearly ? 'ANNUAL' : 'MONTHLY',   // target: what the user toggled to
    );

    if (tierComparison === -1) {
      // It's a downgrade - check for quota overages
      const overages: any[] = [];
      const nearLimit: any[] = [];

      // Get current usage from quotaData
      const currentUsage = {
        resumes: sharedQuotaData?.quotas?.RU?.subscription?.used || 0,
        seats: sharedQuotaData?.quotas?.max_seats?.subscription?.used || 0,
        assessments: sharedQuotaData?.quotas?.AS?.subscription?.used || 0,
        ai_interviews: sharedQuotaData?.quotas?.AIU?.subscription?.used || 0,
      };

      // Get target plan limits (use monthly or annual quotas based on toggle)
      const targetQuotas = isYearly ? (plan.annualQuotas || plan.quotas) : (plan.monthlyQuotas || plan.quotas);
      const targetLimits = {
        resumes: targetQuotas?.RU || targetQuotas?.resume_uploads || targetQuotas?.resume_storage || 0,
        seats: targetQuotas?.max_seats || 0,
        assessments: targetQuotas?.AS || targetQuotas?.assessments || 0,
        ai_interviews: targetQuotas?.AIU || targetQuotas?.ai_interviews || targetQuotas?.ai_interview || 0,
      };

      // Check Resume Storage
      if (currentUsage.resumes > targetLimits.resumes) {
        overages.push({
          quotaType: 'resume_storage',
          quotaLabel: 'Resume Storage',
          currentUsage: currentUsage.resumes,
          newPlanLimit: targetLimits.resumes,
          overage: currentUsage.resumes - targetLimits.resumes,
          unit: 'resumes',
        });
      } else if (targetLimits.resumes > 0) {
        const percentageUsed = (currentUsage.resumes / targetLimits.resumes) * 100;
        if (percentageUsed >= 75) {
          nearLimit.push({
            quotaType: 'resume_storage',
            quotaLabel: 'Resume Storage',
            currentUsage: currentUsage.resumes,
            newPlanLimit: targetLimits.resumes,
            remaining: targetLimits.resumes - currentUsage.resumes,
            percentageUsed,
            unit: 'resumes',
          });
        }
      }

      // Check Team Seats
      if (currentUsage.seats > targetLimits.seats) {
        overages.push({
          quotaType: 'max_seats',
          quotaLabel: 'Team Seats',
          currentUsage: currentUsage.seats,
          newPlanLimit: targetLimits.seats,
          overage: currentUsage.seats - targetLimits.seats,
          unit: 'users',
        });
      } else if (targetLimits.seats > 0) {
        const percentageUsed = (currentUsage.seats / targetLimits.seats) * 100;
        if (percentageUsed >= 75) {
          nearLimit.push({
            quotaType: 'max_seats',
            quotaLabel: 'Team Seats',
            currentUsage: currentUsage.seats,
            newPlanLimit: targetLimits.seats,
            remaining: targetLimits.seats - currentUsage.seats,
            percentageUsed,
            unit: 'users',
          });
        }
      }

      // Show downgrade warning modal
      setDowngradeWarningData({
        currentPlanName: companySettings?.current_plan_name || currentPlan?.name || 'Current Plan',
        targetPlanName: plan.name,
        overages,
        nearLimitQuotas: nearLimit,
        targetPlan: plan, // Store plan for later use
      });
      setShowDowngradeWarning(true);
      return;
    }

    // It's an upgrade or same tier - proceed normally
    setSelectedPlanForPayment(plan);
    setIsDowngradePayment(false);
    setModalStep('isolation');
    setIsolationType(hasDedicatedDatabase ? 'database' : 'schema');
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

      // Determine plan ID and billing interval
      const hasAnnual = !!selectedPlanForPayment.annualPlanId;
      const hasMonthly = !!selectedPlanForPayment.monthlyPlanId;

      let actualBillingInterval: 'ANNUAL' | 'MONTHLY';
      let planId: number;

      if (isYearly && hasAnnual) {
        actualBillingInterval = 'ANNUAL';
        planId = selectedPlanForPayment.annualPlanId!;
      } else if (!isYearly && hasMonthly) {
        actualBillingInterval = 'MONTHLY';
        planId = selectedPlanForPayment.monthlyPlanId!;
      } else if (hasAnnual) {
        actualBillingInterval = 'ANNUAL';
        planId = selectedPlanForPayment.annualPlanId!;
      } else if (hasMonthly) {
        actualBillingInterval = 'MONTHLY';
        planId = selectedPlanForPayment.monthlyPlanId!;
      } else {
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

      if (!token) {
        setError('Authentication token not found. Please login again.');
        setIsSelectingPlan(false);
        return;
      }

      // Step 1: Create Razorpay order
      setPaymentStep('Creating order...');
      let razorpayFields: { razorpay_payment_id?: string; razorpay_order_id?: string; razorpay_signature?: string } = {};

      // Only create Razorpay order for paid plans (price > 0)
      // Use the billing-period-correct price — selectedPlanForPayment.price is always monthly,
      // so if the user is in yearly mode and the plan has no monthly variant, price is null
      // and Razorpay would be skipped. Use annualPrice/monthlyPrice instead.
      const planPrice = (() => {
        if (isYearly && selectedPlanForPayment.annualPrice != null) return selectedPlanForPayment.annualPrice;
        if (!isYearly && selectedPlanForPayment.monthlyPrice != null) return selectedPlanForPayment.monthlyPrice;
        return selectedPlanForPayment.price || 0;
      })();
      if (planPrice > 0) {
        const orderResponse = await fetch(`${API_URL}/subscription/${tenantId}/create-order`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            plan_id: planId,
            billing_interval: actualBillingInterval,
            schema_per_tenant: isolationType === 'schema',
            database_per_tenant: isolationType === 'database',
          }),
        });

        const orderData = await orderResponse.json();
        // An earlier payment is still being applied (or a plan change is
        // queued): nothing was charged — explain and stop.
        if (orderResponse.status === 409 && orderData?.detail?.error === 'PLAN_CHANGE_IN_PROGRESS') {
          const d = orderData.detail;
          if (d.reason === 'unfulfilled_payment') {
            applyPurchaseStatus({ in_progress: true, reason: d.reason, message: d.message, hold: d.hold });
          } else {
            fetchQueuedUpgrades();
          }
          toast.warning('A plan change is already in progress', { description: d.message, duration: 10000 });
          setShowPaymentModal(false);
          return;
        }
        // Same plan while it is still active: refused before any charge.
        if (orderResponse.status === 409 && orderData?.detail?.error === 'EARLY_RENEWAL_NOT_SUPPORTED') {
          toast.info('Renewal not available yet', { description: orderData.detail.message, duration: 10000 });
          setShowPaymentModal(false);
          return;
        }
        if (!orderResponse.ok) {
          const detail = orderData.detail;
          throw new Error((typeof detail === 'string' ? detail : detail?.message) || 'Failed to create payment order');
        }

        // Step 2: Open Razorpay checkout modal
        setPaymentStep('Opening payment gateway...');
        try {
          const razorpayResult = await openCheckout({
            orderId: orderData.order_id,
            amount: orderData.amount,
            currency: orderData.currency,
            planName: orderData.plan_name || selectedPlanForPayment.name,
            userName: user?.name || user?.email?.split('@')[0],
            userEmail: user?.email,
          });
          razorpayFields = {
            razorpay_payment_id: razorpayResult.razorpay_payment_id,
            razorpay_order_id: razorpayResult.razorpay_order_id,
            razorpay_signature: razorpayResult.razorpay_signature,
          };
        } catch (rzpErr: any) {
          if (rzpErr.message?.includes('cancelled')) {
            toast.info('Payment cancelled', { description: 'You can try again anytime.' });
          } else {
            toast.error('Payment failed', { description: rzpErr.message });
          }
          setIsSelectingPlan(false);
          setPaymentStep('');
          return;
        }
      }

      // Step 3: Call select-plan with Razorpay verification details
      setPaymentStep('Verifying payment...');
      const apiUrl = `${API_URL}/subscription/${tenantId}/select-plan`;
      const requestBody = {
        plan_id: planId,
        schema_per_tenant: isolationType === 'schema',
        database_per_tenant: isolationType === 'database',
        external_transaction_id: transactionId,
        billing_interval: actualBillingInterval,
        payment_method: 'razorpay',
        user_id: user?.id,
        user_email: user?.email,
        ...razorpayFields,
      };

      console.log('Calling API:', apiUrl);
      console.log('Request body:', requestBody);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);

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

      // 202: payment captured, but the billing system has not applied the
      // plan yet (it retries automatically). The plan was NOT switched here.
      if (response.status === 202 && data.status === 'pending_retry') {
        toast.info('Payment received - plan setup pending', {
          description: data.data?.message || 'Your new plan will be applied automatically. Your current plan stays active until then.',
          duration: 10000,
        });
        setShowPaymentModal(false);
        window.dispatchEvent(new CustomEvent('notificationTrigger'));
        fetchPurchaseStatus();
        return;
      }

      // 202: payment captured, but the billing system has not applied the
      // plan yet (it retries automatically). The plan was NOT switched here.
      if (response.status === 202 && data.status === 'pending_retry') {
        toast.info('Payment received - plan setup pending', {
          description: data.data?.message || 'Your new plan will be applied automatically. Your current plan stays active until then.',
          duration: 10000,
        });
        setShowPaymentModal(false);
        window.dispatchEvent(new CustomEvent('notificationTrigger'));
        fetchPurchaseStatus();
        return;
      }

      // 202: payment captured, but the billing system has not applied the
      // plan yet (it retries automatically). The plan was NOT switched here.
      if (response.status === 202 && data.status === 'pending_retry') {
        toast.info('Payment received - plan setup pending', {
          description: data.data?.message || 'Your new plan will be applied automatically. Your current plan stays active until then.',
          duration: 10000,
        });
        setShowPaymentModal(false);
        window.dispatchEvent(new CustomEvent('notificationTrigger'));
        return;
      }

      if (response.ok && (data.status === 'success' || response.status === 200)) {
        console.log('[CurrentPlan] Plan selection successful:', data);

        // Store transaction result and show success modal
        const result = data.data || data;
        setTransactionResult(result);
        setModalStep('result');

        // Queue audit verification for plan activation (non-blocking)
        try {
          const mod = await import('@/lib/services/auditVerificationService');
          mod.auditVerificationService.storePendingVerification({
            action: isDowngradePayment ? (result.queued ? 'plan_downgrade' : 'subscription_downgrade') : (result.queued ? 'plan_upgrade' : 'subscription_upgrade'),
            entity_type: 'subscription',
            entity_id: String(planId),
            user_id: user?.id,
            user_email: user?.email,
            timestamp: new Date().toISOString(),
          });
          console.log('[AuditVerification] Queued plan purchase verification');
        } catch (e) { console.warn('[AuditVerification] Failed to queue:', e); }

        // PS02 Fix: Show toast notification for payment success
        if (result.queued) {
          toast.success(isDowngradePayment ? 'Payment successful! Downgrade queued.' : 'Payment successful! Upgrade queued.', {
            description: isDowngradePayment
              ? `Your downgrade to ${result.plan_name} will be applied automatically on ${result.auto_apply_date ? formatISTDate(result.auto_apply_date) : 'plan expiry'}.`
              : `Your upgrade to ${result.plan_name} will be applied automatically on ${result.auto_apply_date ? formatISTDate(result.auto_apply_date) : 'plan expiry'}.`,
            duration: 6000,
          });
        } else {
          toast.success(isDowngradePayment ? 'Plan downgraded successfully.' : 'Payment successful! Your plan is now active.', {
            description: `You're now on the ${result.plan_name} plan.${isDowngradePayment ? ' Some features may no longer be available.' : ' All resources have been provisioned.'}`,
            duration: 5000,
          });
        }

        // Check if upgrade was queued (has active plan)
        if (result.queued) {
          console.log('[CurrentPlan] Upgrade queued:', result);
          // Refresh queued upgrades list
          await fetchQueuedUpgrades();
        } else {
          // Plan changed successfully - logout and redirect to login
          // This ensures user gets fresh session with new plan data
          toast.success(isDowngradePayment ? 'Plan downgraded successfully!' : 'Plan upgraded successfully!', {
            description: 'You will be redirected to login to apply your new plan.',
            duration: 3000,
          });

          // Refresh notifications before logout so bell updates during toast
          window.dispatchEvent(new CustomEvent('notificationTrigger'));

          // Wait a moment for the toast to show, then logout
          setTimeout(() => {
            logout();
            router.push(isDowngradePayment ? '/login?downgraded=true' : '/login?upgraded=true');
          }, 2000);
          return; // Exit early, no need to update local state
        }

        // Refresh data after queued upgrade — quota first, so the plan reads new.
        await fetchData(await refetchQuota());

        // Notify Header component to refresh quota/plan display and notifications
        window.dispatchEvent(new CustomEvent('planChanged'));
        window.dispatchEvent(new CustomEvent('notificationTrigger'));
      } else {
        // Handle both string and object error formats
        const errorDetail = data.detail;

        // DOWNGRADE_BLOCKED_USER_LIMIT: backend no longer blocks downgrade,
        // but handle gracefully in case it's ever returned.
        if (errorDetail && typeof errorDetail === 'object' && errorDetail.error === 'DOWNGRADE_BLOCKED_USER_LIMIT') {
          const active = errorDetail.active_users || 0;
          const limit = errorDetail.new_plan_max_seats || 0;
          const toDeactivate = errorDetail.users_to_deactivate || 0;
          toast.error('Downgrade requires user reduction', {
            description: `You have ${active} active users but the new plan allows ${limit}. Please deactivate ${toDeactivate} user(s) in User Management, then retry the downgrade.`,
            duration: 8000,
          });
          return;
        }

        let errorMessage = typeof errorDetail === 'string'
          ? errorDetail
          : errorDetail?.message || data.message || 'Failed to upgrade plan';

        // Check for migration/database/async errors and show user-friendly message
        if (errorMessage.toLowerCase().includes('migration failed') ||
            errorMessage.toLowerCase().includes('does not exist') ||
            errorMessage.toLowerCase().includes('relation') ||
            errorMessage.toLowerCase().includes('database error') ||
            errorMessage.toLowerCase().includes('greenlet_spawn') ||
            errorMessage.toLowerCase().includes('await_only')) {
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

      // Check for migration/database/async errors and show user-friendly message
      if (errorMessage.toLowerCase().includes('migration failed') ||
          errorMessage.toLowerCase().includes('does not exist') ||
          errorMessage.toLowerCase().includes('relation') ||
          errorMessage.toLowerCase().includes('database error') ||
          errorMessage.toLowerCase().includes('greenlet_spawn') ||
          errorMessage.toLowerCase().includes('await_only')) {
        errorMessage = 'We encountered an issue while upgrading your plan. Please contact support for assistance.';
      }

      setError(errorMessage);
      toast.error('Plan Selection Failed', {
        description: errorMessage,
        duration: 6000,
      });
    } finally {
      setIsSelectingPlan(false);
      setPaymentStep('');
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
        payment_method: success ? 'razorpay' : null,
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

      // Quota first: the payment may have changed the plan and its limits.
      await fetchData(await refetchQuota());
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
  const isSuspended = quotaSubscriptionStatus.toLowerCase() === 'suspended' ||
                      companySettings?.subscription_status?.toLowerCase() === 'suspended' ||
                      companySettings?.status?.toLowerCase() === 'suspended';

  // Debug logging for suspended status
  console.log('[CurrentPlan] Suspended check:', {
    isSuspended,
    quotaSubscriptionStatus,
    companySettingsSubscriptionStatus: companySettings?.subscription_status,
    companySettingsStatus: companySettings?.status,
    tenantStatus: tenantStatus?.status
  });

  // Use quotaSubscriptionStatus as source of truth for status badge
  // Get trial days remaining from quota-status API (single source of truth)
  const statusBadge = getStatusBadge(quotaSubscriptionStatus, companySettings?.payment_status, sharedQuotaData?.trial_info?.days_remaining);
  const StatusIcon = statusBadge.icon;

  // Get remaining time from end date (single source of truth)
  // For trial users: use trial_end_date
  // For paid users: use plan_expiry_date
  // This calculates actual remaining time including hours/minutes on expiry day
  const endDateForRemaining = isOnTrial
    ? (sharedQuotaData?.trial_info?.trial_end_date || companySettings?.trial_end_date)
    : companySettings?.plan_expiry_date;
  const remainingTime = calculateRemainingTime(endDateForRemaining);
  // Keep trialDaysRemaining for backward compatibility (numeric days)
  const trialDaysRemaining = remainingTime.isExpired ? 0 : remainingTime.days;

  // Calculate prices for payment (using actual API prices)
  const calculatePrices = () => {
    const monthlyPrice = selectedPlanForPayment?.monthlyPrice || 0;
    const yearlyPrice = selectedPlanForPayment?.annualPrice || 0;
    const yearlyFullPrice = monthlyPrice * 12;
    const planPrice = isYearly ? yearlyPrice : monthlyPrice;
    const dbExtraCharge = isolationType === 'database' ? (planSettings?.databasePerTenantMonthlyPrice ?? 0) : 0;
    const dbChargeTotal = isYearly ? dbExtraCharge * 12 : dbExtraCharge;
    const totalAmount = planPrice + dbChargeTotal;
    return { basePrice: monthlyPrice, monthlyPrice, yearlyPrice, yearlyFullPrice, planPrice, dbExtraCharge, dbChargeTotal, totalAmount };
  };

  if (isLoading) {
    return <CurrentPlanLoadingSkeleton />;
  }

  // NOTE: Suspended accounts are now fully blocked by the dashboard layout overlay
  // No need to render SuspendedAccountBlock here - the layout handles it globally

  // Show pending account status (non-blocking banners)
  if (tenantStatus && tenantStatus.status !== 'SUSPENDED') {
    const statusColors = {
      PENDING: { bg: 'bg-warning-subtle', border: 'border-warning-line', text: 'text-warning-strong', icon: 'text-warning' },
      SUSPENDED: { bg: 'bg-destructive-subtle', border: 'border-destructive-line', text: 'text-destructive-strong', icon: 'text-destructive' },
      LOCKED: { bg: 'bg-destructive-subtle', border: 'border-destructive-line', text: 'text-destructive-strong', icon: 'text-destructive' },
    };
    const colors = statusColors[tenantStatus.status as keyof typeof statusColors] || statusColors.PENDING;

    return (
      <main className="flex-1 overflow-x-clip bg-slate-50 p-4 md:p-8">
        <div className="mx-auto w-full max-w-[1400px] bg-white dark:bg-slate-900 rounded-2xl p-4 md:p-8 my-4 md:my-5 shadow-2xl">
          <PageHeader
            icon={<CreditCard className="h-5 w-5" />}
            title="Upgrade Plans"
            description="Manage your subscription and billing"
          />

          {/* Account Status Banner */}
          <div className={`${colors.bg} border ${colors.border} rounded-xl p-4 sm:p-6 lg:p-8 mb-5 ring-1 ${colors.border}`}>
            <div className="flex items-start gap-3 sm:gap-4">
              <div className={`flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-white/70 dark:bg-slate-900/40 ${colors.icon}`}>
                <Clock className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`text-base sm:text-lg lg:text-xl font-semibold ${colors.text} mb-1.5 sm:mb-2`}>
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
                <div className="mt-4 flex flex-col gap-2 sm:mt-6 sm:flex-row sm:gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => fetchData()}
                    icon={<Loader2 className="h-4 w-4" />}
                  >
                    Refresh Status
                  </Button>
                  <a
                    href="mailto:support@talentflow.com"
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-blue/25 transition-all hover:-translate-y-0.5 hover:shadow-lg"
                  >
                    <Mail className="h-4 w-4" />
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

  // Display-only values for the redesigned current-plan summary.
  const planDisplayName = isOnTrial
    ? 'Free Trial'
    : (companySettings?.current_plan_name?.replace(/\s*\([^)]*\)\s*$/, '') || '-');
  const cycleStartDate = isOnTrial ? companySettings?.trial_start_date : companySettings?.plan_start_date;
  const cycleEndDate = isOnTrial ? companySettings?.trial_end_date : companySettings?.plan_expiry_date;
  const cycleProgressPct = (() => {
    if (!cycleStartDate || !cycleEndDate) return null;
    const start = new Date(cycleStartDate).getTime();
    const end = new Date(cycleEndDate).getTime();
    if (isNaN(start) || isNaN(end) || end <= start) return null;
    return Math.min(100, Math.max(0, ((new Date().getTime() - start) / (end - start)) * 100));
  })();

  return (
    <main className="flex-1 overflow-x-clip bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white dark:bg-slate-900 rounded-2xl my-4 md:my-5 shadow-2xl">
        <PageBreadcrumb className="mb-4 md:mb-6" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Upgrade Plans' }]} />

        {/* Shared Current Plan Card (shown on every tab) — mild brand-palette gradient border (1px gradient frame around the white card) */}
        <div className="mb-4 rounded-xl bg-gradient-to-r from-brand-blue/35 via-brand-teal/35 to-brand-cyan/35 p-px shadow-md shadow-brand-blue/10 dark:from-brand-blue/50 dark:via-brand-teal/40 dark:to-brand-cyan/40 dark:shadow-black/30">
        <div className="flex flex-col gap-4 rounded-[11px] bg-white dark:bg-slate-900 p-4 sm:p-5">
          {/* Page title kept for screen readers; the visible header was folded into this card */}
          <h1 className="sr-only">Upgrade Plans</h1>
          {/* Plan summary strip — name, status, tier, cycle and price */}
          <div className="flex flex-col gap-4 rounded-lg bg-brand-blue/[0.04] p-3 ring-1 ring-brand-blue/10 dark:bg-slate-800/50 dark:ring-slate-700 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-blue text-white shadow-sm shadow-brand-blue/25">
                <Crown className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Your Current Plan</h2>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <span className="truncate text-base font-semibold text-gray-900 dark:text-slate-50">{planDisplayName}</span>
                  <Badge variant={statusBadge.variant} className="shrink-0">
                    <StatusIcon />
                    {statusBadge.label}
                  </Badge>
                  {sharedQuotaData?.plan_info?.plan_tier && (
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:bg-slate-800 dark:text-slate-400">
                      Tier: {sharedQuotaData.plan_info.plan_tier}
                    </span>
                  )}
                  {(() => {
                    const isolation = sharedQuotaData?.plan_info?.isolation_type || sharedQuotaData?.isolation_type;
                    if (!isolation) return null;
                    return (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-slate-800 dark:text-slate-400">
                        <Database className="h-3 w-3" />
                        {isolation === 'DEDICATED' ? 'Dedicated Server' :
                         isolation === 'DATABASE' ? 'Dedicated Database' :
                         isolation === 'SCHEMA' ? 'Schema Isolation' :
                         isolation}
                      </span>
                    );
                  })()}
                  {cycleEndDate && !isExpiredSubscription && !isLocked && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-teal/10 px-2.5 py-0.5 text-[11px] font-semibold text-brand-teal">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-teal" />
                      {isOnTrial ? 'Trial ends' : 'Valid till'}: {formatISTDate(cycleEndDate)}
                    </span>
                  )}
                  {selectedPlan && (
                    <span className="inline-flex items-center rounded-full bg-warning-subtle px-2.5 py-0.5 text-[11px] font-semibold text-warning-strong">
                      Selected plan: {selectedPlan.name}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs sm:text-sm text-gray-600 dark:text-slate-400">
                {isLocked
                  ? 'Your account is locked. Please select a plan and complete payment.'
                  : isOnTrial
                    ? `You are on a Free Trial${!remainingTime.isExpired ? ` - ${remainingTime.displayText}` : ' - Expired'}`
                    : isActive
                      ? `You are on the ${(companySettings?.current_plan_name || currentPlan?.name || '').replace(/\s*\([^)]*\)\s*$/, '')} plan${!remainingTime.isExpired ? ` - ${remainingTime.displayText}` : ''}`
                      : isPendingPayment
                        ? 'Complete payment to activate your selected plan'
                        : isExpiredSubscription
                          ? `Your ${(companySettings?.current_plan_name || currentPlan?.name || 'subscription').replace(/\s*\([^)]*\)\s*$/, '')} plan has expired. Please renew to continue using all features.`
                          : companySettings?.current_plan_name ? `You are on the ${companySettings.current_plan_name.replace(/\s*\([^)]*\)\s*$/, '')} plan` : ''
                }
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col lg:text-right">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">Price</span>
              <div className="flex items-baseline gap-1 lg:justify-end">
                {isOnTrial ? (
                  <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-slate-50 sm:text-2xl">Free</span>
                ) : currentPlanPrice !== null && currentPlanPrice > 0 ? (
                  <>
                    <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-slate-50 sm:text-2xl">{formatCurrency(currentPlanPrice, currentPlanCurrency)}</span>
                    <span className="text-sm text-gray-500 dark:text-slate-500">{getBillingPeriodLabel(currentPlanBillingPeriod)}</span>
                  </>
                ) : currentPlan?.price ? (
                  <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-slate-50 sm:text-2xl">{formatCurrency(currentPlan.price, currentPlan.currency)}</span>
                ) : (
                  <span className="text-xl font-bold tracking-tight text-gray-900 dark:text-slate-50 sm:text-2xl">-</span>
                )}
              </div>
              {cycleEndDate && !remainingTime.isExpired && (
                <p className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-brand-blue lg:justify-end">
                  <Clock className="h-3.5 w-3.5" />
                  {isOnTrial ? 'Trial ends in' : 'Renews in'} {remainingTime.displayText.replace(/\s*remaining$/, '')}
                </p>
              )}
            </div>
          </div>

          {/* Billing cycle — start / end dates with elapsed-cycle progress */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-600 dark:text-slate-400">
                <span>
                  {isOnTrial ? 'Trial Started' : 'Plan Start'}:{' '}
                  <strong className="font-semibold text-gray-900 dark:text-slate-50">{cycleStartDate ? formatISTDate(cycleStartDate) : '-'}</strong>
                </span>
                <span>
                  {isOnTrial ? 'Trial Ends' : 'Plan Expires'}:{' '}
                  <strong className="font-semibold text-gray-900 dark:text-slate-50">{cycleEndDate ? formatISTDate(cycleEndDate) : '-'}</strong>
                </span>
              </div>
            </div>
            {cycleProgressPct !== null && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full ${isExpiredSubscription || cycleProgressPct >= 100 ? 'bg-destructive' : 'bg-brand-blue'}`}
                  style={{ width: `${cycleProgressPct}%` }}
                />
              </div>
            )}
          </div>

          {/* PS03 Fix: Renew Plan Button for Expired/Expiring Subscriptions */}
          {!isOnTrial && !isPendingPayment && !isLocked && (companySettings?.plan_expiry_date || isExpiredSubscription) && (
            (() => {
              const planName = currentPlan?.name || companySettings?.current_plan_name?.replace(/\s*\([^)]*\)\s*$/, '') || 'Your';

              // If no expiry date but status is expired, show expired banner directly
              if (!companySettings?.plan_expiry_date && isExpiredSubscription) {
                return (
                  <div className="p-3 sm:p-4 rounded-lg border bg-destructive-subtle border-destructive-line">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-start sm:items-center gap-2 sm:gap-3">
                        <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6 text-destructive flex-shrink-0" />
                        <div>
                          <h4 className="font-medium text-destructive-strong text-sm sm:text-base">Plan Expired</h4>
                          <p className="text-sm text-destructive">
                            Your {planName} plan has expired. Please renew to continue using all features.
                          </p>
                        </div>
                      </div>
                      {currentPlan && (
                        <Button
                          variant="destructive"
                          className="w-full sm:w-auto flex-shrink-0"
                          onClick={() => {
                            setSelectedPlanForPayment(currentPlan);
                            setModalStep('isolation');
                            setIsolationType(hasDedicatedDatabase ? 'database' : 'schema');
                            setIsNewTenant(false);
                            setIsYearly(currentPlanBillingPeriod?.toUpperCase() === 'ANNUAL');
                            setTransactionResult(null);
                            setError(null);
                            setShowPaymentModal(true);
                          }}
                          icon={<ArrowRight className="w-4 h-4" />}
                        >
                          Renew Current Plan
                        </Button>
                      )}
                    </div>
                  </div>
                );
              }

              const expiryDate = new Date(companySettings!.plan_expiry_date!);
              const now = new Date();
              const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
              const daysSinceExpiry = Math.floor((now.getTime() - expiryDate.getTime()) / (1000 * 60 * 60 * 24));
              const isExpired = daysUntilExpiry <= 0 || isExpiredSubscription;
              const isExpiringSoon = !isExpired && daysUntilExpiry >= 0 && daysUntilExpiry <= 7;

              if (isExpired || isExpiringSoon) {
                return (
                  <div className={`p-3 sm:p-4 rounded-lg border ${
                    isExpired
                      ? 'bg-destructive-subtle border-destructive-line'
                      : 'bg-warning-subtle border-warning-line'
                  }`}>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div className="flex items-start sm:items-center gap-2 sm:gap-3">
                        <AlertCircle className={`w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0 ${
                          isExpired ? 'text-destructive' : 'text-warning'
                        }`} />
                        <div>
                          <h4 className={`font-medium text-sm sm:text-base ${
                            isExpired ? 'text-destructive-strong' : 'text-warning-strong'
                          }`}>
                            {isExpired ? 'Plan Expired' : 'Plan Expiring Soon'}
                          </h4>
                          <p className={`text-sm ${
                            isExpired ? 'text-destructive' : 'text-warning'
                          }`}>
                            {isExpired
                              ? daysSinceExpiry === 0
                                ? `Your ${planName} plan expired today. Please renew to continue using all features.`
                                : `Your ${planName} plan expired ${daysSinceExpiry} day${daysSinceExpiry !== 1 ? 's' : ''} ago. Please renew to continue using all features.`
                              : `Your ${planName} plan expires in ${daysUntilExpiry} day${daysUntilExpiry !== 1 ? 's' : ''}. You can renew it once it expires.`
                            }
                          </p>
                        </div>
                      </div>
                      {/* Renew only once expired: an early same-plan renewal is
                          queued, and the Control Plane's queue rejects same-plan
                          changes, so the payment could never be applied
                          (tenant abc paid 3x, 2026-10-30). create-order also
                          refuses it with EARLY_RENEWAL_NOT_SUPPORTED. */}
                      {currentPlan && isExpired && (
                        <button
                          onClick={() => {
                            setSelectedPlanForPayment(currentPlan);
                            setModalStep('isolation');
                            setIsolationType(hasDedicatedDatabase ? 'database' : 'schema');
                            setIsNewTenant(false);
                            setIsYearly(currentPlanBillingPeriod?.toUpperCase() === 'ANNUAL');
                            setTransactionResult(null);
                            setError(null);
                            setShowPaymentModal(true);
                          }}
                          className={`px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2 text-sm w-full sm:w-auto justify-center flex-shrink-0 ${
                            isExpired
                              ? 'bg-destructive hover:bg-destructive text-white'
                              : 'bg-warning hover:opacity-90 text-white'
                          }`}
                        >
                          <ArrowRight className="w-4 h-4" />
                          Renew Current Plan
                        </button>
                      )}
                    </div>
                  </div>
                );
              }
              return null;
            })()
          )}

          {/* Quotas - Using data from quota-status API via companySettings */}
          {companySettings && (
            <div>
              <h3 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">Your Plan Limits</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3">
                {[
                  { label: 'Team Seats', icon: Users, value: companySettings.max_seats },
                  { label: 'Job Postings', icon: Briefcase, value: companySettings.max_jobs },
                  { label: 'Resume Storage', icon: FileText, value: companySettings.max_resume_uploads },
                  { label: 'Resume Scores', icon: Gauge, value: companySettings.max_resume_searches },
                  { label: 'Assessments', icon: ClipboardCheck, value: companySettings.max_assessments },
                  { label: 'AI Interviews', icon: Video, value: companySettings.max_ai_interviews },
                ].map(({ label, icon: LimitIcon, value }) => {
                  const formatted = formatQuotaValue(value);
                  return (
                    <div key={label} className="flex min-w-0 flex-col justify-between rounded-lg bg-gray-50 p-3 dark:bg-slate-800/50">
                      <div className="flex items-center justify-between gap-2 text-gray-500 dark:text-slate-400">
                        <span className="truncate text-xs font-medium">{label}</span>
                        <LimitIcon className="h-4 w-4 shrink-0" />
                      </div>
                      <p className={`mt-1.5 truncate font-bold tabular-nums tracking-tight ${
                        formatted === 'Unlimited'
                          ? 'text-base sm:text-lg text-brand-teal'
                          : 'text-lg sm:text-xl text-gray-900 dark:text-slate-50'
                      }`}>
                        {formatted}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Plan Features - non-quota features only (Teams, API Access, SSO, etc.) */}
          {(() => {
            const QUOTA_FEATURE_KEYS = new Set([
              'resume_upload', 'resume_storage', 'resume_scoring',
              'assessment', 'assessments', 'ai_interview', 'ai_interviews',
              'seats', 'storage', 'jobs',
            ]);
            // Also filter by feature_category if available (category 'quota' or 'metered')
            const QUOTA_CATEGORIES = new Set(['quota', 'metered', 'usage']);
            const seen = new Set<string>();
            const nonQuotaFeatures = (sharedQuotaData?.features ?? []).filter(f => {
              if (QUOTA_FEATURE_KEYS.has(f.feature_key)) return false;
              if (f.feature_category && QUOTA_CATEGORIES.has(f.feature_category.toLowerCase())) return false;
              // deduplicate by feature_key
              if (seen.has(f.feature_key)) return false;
              seen.add(f.feature_key);
              return true;
            });
            if (nonQuotaFeatures.length === 0) return null;
            return (
              <div className="border-t border-gray-100 pt-4 dark:border-slate-700/60">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h3 className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">Plan Features:</h3>
                  {nonQuotaFeatures.map(f => (
                    <span
                      key={f.feature_key}
                      className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
                        f.is_enabled
                          ? 'bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-100'
                          : 'bg-gray-50 text-gray-400 dark:bg-slate-800/50 dark:text-slate-500'
                      }`}
                    >
                      {f.is_enabled ? (
                        <Check className="h-3.5 w-3.5 shrink-0 text-brand-teal" strokeWidth={3} />
                      ) : (
                        <X className="h-3.5 w-3.5 shrink-0 text-gray-300 dark:text-slate-600" />
                      )}
                      {f.feature_name}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}

        </div>
        </div>

        {/* Subscription navigation — same pattern as OrganizationTabs (User
            Management): a sliding segmented control below lg, folder tabs that
            merge into the panel below from lg up. */}
        {billingLinks.length > 0 && (
          <section className="mb-3 lg:mb-5">
            {/* Mobile + tablet (< lg): one segmented control. Equal cells on a
                light brand-blue track; the white tile glides to the active tab.
                Short labels so all seven fit on a phone (full name on hover). */}
            {(() => {
              const activeIndex = billingLinks.findIndex((l) => l.id === activeSection);
              const cols = billingLinks.length;
              const cell = 'relative z-10 inline-flex min-w-0 items-center justify-center rounded-md px-0.5 text-[11px] font-medium transition-colors duration-300 sm:px-1 sm:text-sm';
              return (
                <nav
                  aria-label="Subscription sections"
                  style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
                  className="relative grid h-9 rounded-lg bg-brand-blue/5 p-1 ring-1 ring-brand-blue/10 lg:hidden"
                >
                  {activeIndex >= 0 && (
                    <span
                      aria-hidden
                      style={{ width: `calc((100% - 0.5rem) / ${cols})`, transform: `translateX(${activeIndex * 100}%)` }}
                      className="absolute bottom-1 left-1 top-1 rounded-md bg-white shadow-sm shadow-brand-blue/15 ring-1 ring-brand-blue/10 transition-transform duration-300 ease-out motion-reduce:transition-none dark:bg-slate-800"
                    />
                  )}
                  {billingLinks.map((link) => {
                    const isActive = link.id === activeSection;
                    const locked = !link.visible;
                    return (
                      <button
                        key={link.id}
                        type="button"
                        onClick={() => { if (!locked) setActiveSection(link.id as typeof activeSection); }}
                        aria-current={isActive ? 'page' : undefined}
                        aria-disabled={locked}
                        title={locked ? link.deniedMessage : link.label}
                        className={`${cell} ${
                          locked
                            ? 'cursor-not-allowed text-gray-400 opacity-60 dark:text-slate-600'
                            : isActive
                            ? 'text-brand-blue'
                            : 'text-gray-600 hover:text-brand-blue dark:text-slate-400'
                        }`}
                      >
                        <span className="truncate">{link.short}</span>
                      </button>
                    );
                  })}
                </nav>
              );
            })()}

            {/* Desktop (lg+): folder tabs that merge into the panel below */}
            <nav
              aria-label="Subscription tabs"
              className="hidden max-w-full flex-wrap gap-1 border-b border-gray-200 dark:border-slate-700 lg:flex"
            >
              {billingLinks.map((link) => {
                const isActive = link.id === activeSection;
                const locked = !link.visible;
                const base = '-mb-px whitespace-nowrap rounded-t-lg border px-4 py-2.5 text-sm font-medium transition-colors';
                return (
                  <button
                    key={link.id}
                    type="button"
                    onClick={() => { if (!locked) setActiveSection(link.id as typeof activeSection); }}
                    aria-current={isActive ? 'page' : undefined}
                    aria-disabled={locked}
                    title={locked ? link.deniedMessage : undefined}
                    className={`${base} ${
                      locked
                        ? 'border-transparent text-gray-400 dark:text-slate-600 cursor-not-allowed opacity-60'
                        : isActive
                        ? 'border-gray-200 dark:border-slate-700 border-b-slate-100 dark:border-b-slate-800 bg-slate-100 dark:bg-slate-800/50 text-brand-blue'
                        : 'border-transparent text-gray-600 dark:text-slate-400 hover:text-brand-blue hover:bg-gray-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    {link.label}
                  </button>
                );
              })}
            </nav>
          </section>
        )}

        {/* Active sub-section panel — joins the tab bar's baseline on desktop
            (-mt-5 cancels the tab bar's mb-5), as on User Management. */}
        <div className="rounded-xl border border-gray-200 bg-slate-100 p-4 sm:p-5 lg:-mt-5 lg:rounded-t-none lg:border-t-0 dark:border-slate-700 dark:bg-slate-800/50">
        {/* Inline sub-section — strips the embedded page's own breadcrumb,
            outer left/right padding, and card wrapper so the content lines up
            seamlessly with the current-plan body. Selectors target the
            embedded <main> → <div mx-auto max-w-*> → <div bg-white rounded-2xl …>
            scaffolding that every sub-page uses. */}
        {activeSection !== 'current-plan' && (
          <section
            className="mb-5
              [&_[data-slot=breadcrumb]]:hidden
              [&>main]:flex-none
              [&>main]:overflow-visible
              [&>main]:bg-transparent
              [&>main>div:not(.fixed)]:max-w-none
              [&>main>div:not(.fixed)]:!px-0
              [&>main>div:not(.fixed)]:!mx-0
              [&>main>div:not(.fixed)>div]:!bg-transparent
              [&>main>div:not(.fixed)>div]:!rounded-none
              [&>main>div:not(.fixed)>div]:!shadow-none
              [&>main>div:not(.fixed)>div]:!ring-0
              [&>main>div:not(.fixed)>div]:!border-0
              [&>main>div:not(.fixed)>div]:!p-0
              [&>main>div:not(.fixed)>div]:!my-0"
          >
            {activeSection === 'usage-quotas' && <UsageDashboard hideSubscriptionSummary />}
            {activeSection === 'payment-methods' && <PaymentMethodsPage />}
            {activeSection === 'billing-history' && <BillingHistoryPage />}
            {activeSection === 'refund-history' && <RefundHistoryPage />}
            {activeSection === 'dispute-history' && <DisputeHistoryPage />}
            {activeSection === 'unit-disputes' && <UnitDisputesPage />}
          </section>
        )}

        {error && (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-destructive-line bg-destructive-subtle/80 p-4 ring-1 ring-destructive-line">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive-subtle text-destructive">
              <AlertCircle className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-destructive">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="mb-5 flex items-center gap-3 rounded-xl border border-brand-teal/20 bg-brand-teal/[0.06] p-4 ring-1 ring-brand-teal/10">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-teal/15 text-brand-teal">
              <CheckCircle className="h-5 w-5" />
            </span>
            <p className="text-sm font-medium text-brand-teal">{successMessage}</p>
          </div>
        )}

        {hasPendingChanges && currentChange && (
          <div className="mb-5 flex flex-col gap-3 rounded-xl border border-brand-orange/20 bg-brand-orange/[0.06] p-4 ring-1 ring-brand-orange/10 sm:flex-row sm:items-center">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-orange/15 text-brand-orange-deep">
              <AlertCircle className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold text-brand-orange-deep">Plan Changes Pending</p>
              <p className="mt-0.5 text-sm text-gray-600 dark:text-slate-400">
                {daysRemaining !== null && (
                  <>{daysRemaining} day{daysRemaining !== 1 ? 's' : ''} remaining to review. </>
                )}
                Deadline: {formatISTDate(currentChange.deadline)}
              </p>
            </div>
            <button
              onClick={openReviewModal}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-orange px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-orange/25 transition-all hover:-translate-y-0.5 hover:shadow-lg"
            >
              Review Changes
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {activeSection === 'current-plan' && (
        <>
        {/* Account Locked Warning */}
        {isLocked && (
          <div className="mb-5 flex items-start gap-3 rounded-xl border border-destructive-line bg-destructive-subtle/80 p-4 sm:p-5 ring-1 ring-destructive-line">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive-subtle text-destructive">
              <Lock className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-semibold text-destructive-strong">Account Locked</h3>
              <p className="mt-0.5 text-sm text-destructive">Your trial has ended and payment was not completed. Please select a plan and complete payment to continue.</p>
            </div>
          </div>
        )}

        {/* Pending Payment Card */}
        {isPendingPayment && selectedPlan && (
          <div className="mb-5 rounded-xl border border-warning-line bg-warning-subtle/80 p-4 sm:p-5 ring-1 ring-warning-line">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning-subtle text-warning">
                <Clock className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-semibold text-warning-strong">Payment Pending</h3>
                <p className="mt-0.5 text-sm text-warning">
                  Complete payment for <strong>{selectedPlan.name}</strong> - {formatCurrency(selectedPlan.price || 0, selectedPlan.currency)}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
              <button
                onClick={() => handleSimulatePayment(true)}
                disabled={isProcessingPayment}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-success px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-success disabled:opacity-50"
              >
                {isProcessingPayment ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4" />
                )}
                Confirm Payment Success
              </button>
              <button
                onClick={() => handleSimulatePayment(false)}
                disabled={isProcessingPayment}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-destructive px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-destructive disabled:opacity-50"
              >
                {isProcessingPayment ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <XCircle className="h-4 w-4" />
                )}
                Payment Failed
              </button>
            </div>
          </div>
        )}

        {/* Earlier payment not applied yet — why Choose Plan is disabled. */}
        {purchaseHold && (
          <div
            role="status"
            className={`mb-5 flex items-start gap-3 rounded-xl border p-4 sm:p-5 ring-1 ${purchaseHold.needsSupport ? 'border-destructive-line bg-destructive-subtle/80 ring-destructive-line' : 'border-warning-line bg-warning-subtle/80 ring-warning-line'}`}
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${purchaseHold.needsSupport ? 'bg-destructive-subtle text-destructive' : 'bg-warning-subtle text-warning'}`}>
              {purchaseHold.needsSupport ? (
                <AlertTriangle className="h-5 w-5" />
              ) : (
                <Loader2 className="h-5 w-5 animate-spin" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className={`text-sm sm:text-base font-semibold ${purchaseHold.needsSupport ? 'text-destructive-strong' : 'text-warning-strong'}`}>
                {purchaseHold.needsSupport ? 'Plan activation needs attention' : 'Your new plan is being set up'}
              </h3>
              <p className={`text-sm mt-1 ${purchaseHold.needsSupport ? 'text-destructive' : 'text-warning'}`}>
                {purchaseHold.message}
              </p>
              {purchaseHold.paymentReference && (
                <p className="text-xs text-gray-600 dark:text-slate-400 mt-2">
                  Payment reference: <span className="font-mono">{purchaseHold.paymentReference}</span>
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => fetchPurchaseStatus()}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 hover:text-brand-blue flex-shrink-0"
              title="Check again"
            >
              <RefreshCw className="w-4 h-4" />
              Check again
            </button>
          </div>
        )}

        {/* Queued Upgrades Section */}
        {queuedUpgrades.length > 0 && (
          <div className="mb-5 rounded-xl border border-warning-line bg-warning-subtle/80 p-4 sm:p-5 ring-1 ring-warning-line">
            <div className="mb-4 flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning-subtle text-warning">
                <Clock className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-semibold text-warning-strong">Pending Plan Changes</h3>
                <p className="mt-0.5 text-sm text-warning">
                  You have {queuedUpgrades.length} queued plan change{queuedUpgrades.length > 1 ? 's' : ''} waiting to be applied
                </p>
              </div>
            </div>

            <div className="space-y-3 sm:space-y-4">
              {queuedUpgrades.map((upgrade) => (
                <div key={upgrade.id} className="rounded-xl border border-warning-line bg-white p-4 shadow-sm dark:bg-slate-900">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 mb-2 flex-wrap">
                        <Package className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-slate-400" />
                        <span className="font-semibold text-gray-900 dark:text-slate-50">
                          {upgrade.new_plan_name}
                          {upgrade.billing_interval && <span className="font-normal text-gray-500 dark:text-slate-500"> ({upgrade.billing_interval.charAt(0).toUpperCase() + upgrade.billing_interval.slice(1).toLowerCase()})</span>}
                        </span>
                        <Badge className="bg-warning-subtle text-warning text-xs">
                          {upgrade.status === 'SCHEDULED' ? 'Scheduled' : 'Queued'}
                        </Badge>
                        {upgrade.days_until_activation !== undefined && upgrade.days_until_activation > 0 && (
                          <span className="text-xs text-warning">
                            ({upgrade.days_until_activation} day{upgrade.days_until_activation !== 1 ? 's' : ''} until activation)
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 text-sm">
                        {upgrade.payment_amount !== undefined && (
                          <div>
                            <span className="text-gray-500 dark:text-slate-500">Amount Paid:</span>
                            <span className="ml-1 font-medium text-gray-900 dark:text-slate-50">
                              {formatCurrency(upgrade.payment_amount, upgrade.payment_currency || 'INR')}
                            </span>
                          </div>
                        )}
                        {upgrade.billing_interval && (
                          <div>
                            <span className="text-gray-500 dark:text-slate-500">Billing:</span>
                            <span className="ml-1 font-medium text-gray-900 dark:text-slate-50">{upgrade.billing_interval}</span>
                          </div>
                        )}
                        <div>
                          <span className="text-gray-500 dark:text-slate-500">Auto-applies:</span>
                          <span className="ml-1 font-medium text-gray-900 dark:text-slate-50">
                            {upgrade.auto_apply_date ? formatISTDate(upgrade.auto_apply_date) : 'On plan expiry'}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500 dark:text-slate-500">Queued on:</span>
                          <span className="ml-1 font-medium text-gray-900 dark:text-slate-50">
                            {upgrade.created_at ? formatISTDate(upgrade.created_at) : '-'}
                          </span>
                        </div>
                      </div>
                      {upgrade.reason && (() => {
                        const upgradePlan = plans.find(p => p.name === upgrade.new_plan_name);
                        const isQueuedDowngrade = comparePlanTiers(
                          currentPlan?.tier, upgradePlan?.tier,
                          currentPlanBillingPeriod,
                          upgrade.billing_interval || (isYearly ? 'ANNUAL' : 'MONTHLY'),
                        ) === -1;
                        const direction = isQueuedDowngrade ? 'downgrade' : 'upgrade';
                        const fromPlan = upgrade.current_plan_name || currentPlan?.name || '';
                        const fromPeriod = currentPlanBillingPeriod ? currentPlanBillingPeriod.charAt(0).toUpperCase() + currentPlanBillingPeriod.slice(1).toLowerCase() : '';
                        const toPeriod = upgrade.billing_interval ? upgrade.billing_interval.charAt(0).toUpperCase() + upgrade.billing_interval.slice(1).toLowerCase() : '';
                        const correctedReason = fromPlan
                          ? `User ${direction} from ${fromPlan}${fromPeriod ? ` (${fromPeriod})` : ''} to ${upgrade.new_plan_name}${toPeriod ? ` (${toPeriod})` : ''}`
                          : upgrade.reason.replace(/\b(upgrade|downgrade)\b/gi, (m: string) => m[0] === m[0].toUpperCase() ? (isQueuedDowngrade ? 'Downgrade' : 'Upgrade') : direction);
                        return <p className="text-xs text-gray-500 dark:text-slate-500 mt-2">Reason: {correctedReason}</p>;
                      })()}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedQueuedUpgrade(upgrade);
                          setTcAccepted(false);
                          setShowTCModal(true);
                        }}
                        className="flex items-center gap-1.5 rounded-lg bg-success px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-success"
                      >
                        <Zap className="h-4 w-4" />
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
                          className="flex items-center gap-1.5 rounded-lg border border-destructive-line bg-destructive-subtle px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive-subtle disabled:opacity-50"
                        >
                          <XCircle className="h-4 w-4" />
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <p className="text-xs text-warning mt-4">
              Queued plan changes will automatically apply when your current plan expires.
              Click "Apply Now" to apply immediately (remaining credits will be forfeited).
            </p>
          </div>
        )}

        {/* Available Plans - shown to everyone; plan buttons greyed when locked (RBAC03) */}
        {plans.length > 0 && (
          <>
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="min-w-0">
                <h2 className="text-base font-semibold text-gray-900 dark:text-slate-50">
                  {isOnTrial || isLocked ? 'Choose a Plan' : 'Upgrade Plans'}
                </h2>
                <p className="mt-0.5 text-xs sm:text-sm text-gray-500 dark:text-slate-400">
                  Pick the plan that fits your team. Switch between monthly and yearly billing.
                </p>
                {queuedUpgrades.length > 0 && !isOnTrial && !isLocked && (
                  <p className="mt-1.5 text-sm text-warning">
                    You have a pending plan change queued. {queuedUpgrades.some(u => u.can_cancel !== false)
                      ? 'Cancel it above or apply it now to select a different plan.'
                      : 'Apply it now to select a different plan.'}
                  </p>
                )}
              </div>

              {/* Billing Period Toggle - No common discount, each plan shows its own */}
              <div role="group" aria-label="Toggle billing period" className="relative inline-flex shrink-0 items-center self-start rounded-xl bg-gray-100 p-1 dark:bg-slate-800 md:self-auto">
                {/* Sliding pill — moves under the selected option */}
                <span
                  aria-hidden="true"
                  className={`pointer-events-none absolute left-1 top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-white shadow-sm ring-1 ring-black/[0.04] transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none dark:bg-slate-900 dark:ring-white/[0.06] ${
                    isYearly ? 'translate-x-full' : 'translate-x-0'
                  }`}
                />
                {[
                  { label: 'Monthly', yearly: false },
                  { label: 'Yearly', yearly: true },
                ].map(({ label, yearly }) => {
                  const selected = isYearly === yearly;
                  return (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setIsYearly(yearly)}
                      className={`relative z-10 w-24 rounded-lg py-1.5 text-center text-sm font-semibold transition-colors duration-300 ${
                        selected
                          ? 'text-gray-900 dark:text-slate-50'
                          : 'text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-100'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Plans grouped into one boxed section per tier */}
            <div className="space-y-4">
              {(() => {
                const tierOrder: Record<string, number> = { STARTER: 0, PROFESSIONAL: 1, ENTERPRISE: 2 };
                const TIER_SECTIONS: Record<string, { label: string; description: string; icon: typeof Users }> = {
                  STARTER: { label: 'Starter Plans', description: 'For individuals and small teams getting started.', icon: Users },
                  PROFESSIONAL: { label: 'Professional Plans', description: 'For growing teams that need more capacity.', icon: Building2 },
                  ENTERPRISE: { label: 'Enterprise Plans', description: 'For large organisations with advanced hiring needs.', icon: Zap },
                };
                const groups: { tier: string; plans: DisplayPlan[] }[] = [];
                [...plans].sort((a, b) => {
                  const priceA = tierOrder[a.tier?.toUpperCase()] ?? 99;
                  const priceB = tierOrder[b.tier?.toUpperCase()] ?? 99;
                  return priceA - priceB;
                }).forEach((plan) => {
                  const tierKey = plan.tier?.toUpperCase() || 'OTHER';
                  const group = groups.find(g => g.tier === tierKey);
                  if (group) group.plans.push(plan);
                  else groups.push({ tier: tierKey, plans: [plan] });
                });

                const maxPlansPerTier = Math.max(...groups.map(g => g.plans.length));

                const renderPlanCard = (plan: DisplayPlan) => {
                const isSelectedPending = isPendingPayment && companySettings?.selected_plan_id === plan.numericId;
                // Show "Current Plan" only when viewing the matching billing period
                // e.g., if user has Annual plan, show "Current Plan" only when toggle is on Annual
                const isCurrentForToggle = (plan.isCurrentMonthly && !isYearly) || (plan.isCurrentAnnual && isYearly);

                return (
                  <div
                    key={plan.id}
                    className={`relative flex flex-col rounded-xl p-4 sm:p-5 transition-all duration-300 ease-out ${
                      isSelectedPending
                        ? 'border-2 border-warning-line bg-white shadow-lg shadow-warning/20 hover:shadow-xl hover:shadow-warning/30 dark:bg-slate-900'
                        : isCurrentForToggle
                          ? 'border-2 border-success bg-gradient-to-b from-success/[0.06] to-white shadow-lg shadow-success/20 hover:shadow-xl hover:shadow-success/30 dark:from-success/15 dark:to-slate-900 dark:shadow-success/10'
                          : plan.popular
                            ? 'border-2 border-brand-blue bg-white shadow-lg shadow-brand-blue/20 hover:-translate-y-1 hover:shadow-2xl hover:shadow-brand-blue/30 dark:bg-slate-900 dark:shadow-brand-blue/20'
                            : 'border border-gray-200 bg-white shadow-md shadow-slate-200/70 hover:-translate-y-1 hover:shadow-xl hover:shadow-slate-300/60 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30 dark:hover:shadow-black/50'
                    }`}
                  >
                    {isSelectedPending && (
                      <span className="absolute -top-3 right-4 inline-flex items-center gap-1 rounded-full bg-warning px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-sm">
                        <Clock className="h-3.5 w-3.5" />
                        Selected - Pending Payment
                      </span>
                    )}
                    {isCurrentForToggle && !isSelectedPending && (
                      <span className="absolute -top-3 right-4 inline-flex items-center gap-1 rounded-full bg-success px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-sm shadow-success/25">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Current Plan
                      </span>
                    )}
                    {plan.popular && !isCurrentForToggle && !isSelectedPending && (
                      <span className="absolute -top-3 right-4 inline-flex items-center gap-1 rounded-full bg-brand-blue px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-sm shadow-brand-blue/25">
                        <Sparkles className="h-3.5 w-3.5" />
                        Most Popular
                      </span>
                    )}

                    <h3 className="pt-1 text-base font-bold text-gray-900 dark:text-slate-50">{plan.name}</h3>
                    <p className="mt-0.5 min-h-[32px] text-xs sm:text-sm text-gray-600 dark:text-slate-400">{plan.description}</p>

                    <div className="my-4">
                      {(plan.monthlyPrice || plan.annualPrice) ? (
                        <div>
                          <div className="flex items-baseline gap-1">
                            <span className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-slate-50">
                              {formatCurrency(
                                isYearly
                                  ? (plan.annualPrice ?? plan.monthlyPrice ?? 0)
                                  : (plan.monthlyPrice ?? plan.annualPrice ?? 0),
                                plan.currency
                              )}
                            </span>
                            <span className="text-gray-500 dark:text-slate-500 text-sm">
                              {/* Show correct billing period based on what's available */}
                              {isYearly
                                ? (plan.annualPrice ? '/year' : '/month')
                                : (plan.monthlyPrice ? '/month' : '/year')}
                            </span>
                          </div>
                          {/* Show strikethrough price and discount badge when viewing yearly and both prices exist */}
                          {isYearly && plan.monthlyPrice && plan.annualPrice && (plan.monthlyPrice * 12) > plan.annualPrice && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-400 dark:text-slate-500 line-through">
                                {formatCurrency(plan.monthlyPrice * 12, plan.currency)}
                              </span>
                              {plan.discountPercentage && plan.discountPercentage > 0 && (
                                <span className="text-xs font-bold text-brand-teal">
                                  Save {Math.round(plan.discountPercentage)}%
                                </span>
                              )}
                            </div>
                          )}
                          {/* Show note when yearly is selected but only monthly is available */}
                          {isYearly && !plan.annualPrice && plan.monthlyPrice && (
                            <p className="text-xs text-warning mt-1">
                              Billed monthly (yearly not available)
                            </p>
                          )}
                          {/* Show note when monthly is selected but only yearly is available */}
                          {!isYearly && !plan.monthlyPrice && plan.annualPrice && (
                            <p className="text-xs text-warning mt-1">
                              Billed annually (monthly not available)
                            </p>
                          )}
                          {/* Show monthly equivalent hint when viewing yearly and both exist */}
                          {isYearly && plan.monthlyPrice && plan.annualPrice && (
                            <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                              {formatCurrency(plan.monthlyPrice, plan.currency)}/month if billed monthly
                            </p>
                          )}
                          {/* Show yearly option hint when viewing monthly and both exist */}
                          {!isYearly && plan.annualPrice && plan.monthlyPrice && (
                            <p className="text-xs text-gray-500 dark:text-slate-500 mt-1">
                              or {formatCurrency(plan.annualPrice, plan.currency)}/year
                              {plan.discountPercentage && plan.discountPercentage > 0 && (
                                <span className="text-brand-teal font-semibold"> (Save {Math.round(plan.discountPercentage)}%)</span>
                              )}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900 dark:text-slate-50">Custom</div>
                      )}
                    </div>

                    {/* Quotas Section - tinted single-column box */}
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

                      const quotaRows = [
                        { label: 'Max Users', value: displayQuotas.max_seats },
                        { label: 'Max Jobs', value: displayQuotas.max_jobs },
                        { label: 'Resume Storage', value: displayQuotas.RU },
                        { label: 'Resume Scores', value: displayQuotas.RS },
                        { label: 'Assessments', value: displayQuotas.AS },
                        { label: 'AI Interviews', value: displayQuotas.AIU },
                      ].filter(row => row.value != null && formatQuotaValue(row.value) !== '-');

                      if (quotaRows.length === 0) return null;

                      return (
                        <div className={`mb-4 space-y-2 rounded-lg px-3 py-2.5 text-sm ${
                          isCurrentForToggle ? 'bg-brand-blue/[0.06] dark:bg-slate-800/70' : 'bg-gray-50 dark:bg-slate-800/50'
                        }`}>
                          {quotaRows.map(row => {
                            const formatted = formatQuotaValue(row.value);
                            return (
                              <div key={row.label} className="flex items-center justify-between gap-2">
                                <span className="text-gray-500 dark:text-slate-400">{row.label}</span>
                                <span className={`font-semibold ${formatted === 'Unlimited' ? 'text-brand-teal' : 'text-gray-900 dark:text-slate-50'}`}>{formatted}</span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* Features Section - first 4, expandable */}
                    {(() => {
                      const displayFeatures = isYearly
                        ? (plan.annualFeatures?.length ? plan.annualFeatures : plan.features)
                        : (plan.monthlyFeatures?.length ? plan.monthlyFeatures : plan.features);
                      return displayFeatures.length > 0 && (
                        <div className="mb-5">
                          <ul className="space-y-1.5">
                            {displayFeatures.slice(0, expandedFeaturesPlan === plan.id ? undefined : 4).map((feature, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-brand-teal" />
                                <span className="text-sm font-medium text-gray-700 dark:text-slate-300">{feature}</span>
                              </li>
                            ))}
                          </ul>
                          {displayFeatures.length > 4 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedFeaturesPlan(expandedFeaturesPlan === plan.id ? null : plan.id);
                              }}
                              className="mt-2 pl-6 text-left text-sm font-medium text-brand-blue hover:underline"
                            >
                              {expandedFeaturesPlan === plan.id
                                ? 'Show less'
                                : `+${displayFeatures.length - 4} more features`}
                            </button>
                          )}
                        </div>
                      );
                    })()}

                    {/* Spacer to push button to bottom */}
                    <div className="flex-grow" />

                    {/* Native-disabled button: the permission tooltip sits on a wrapper. */}
                    <span
                      className="mt-auto block w-full"
                      title={planChangeLocked && !isCurrentForToggle ? 'You do not have permission to change the subscription plan' : undefined}
                    >
                    <button
                      onClick={() => { if (!planChangeLocked) handleChoosePlan(plan); }}
                      disabled={
                        planChangeLocked ||
                        isCurrentForToggle ||
                        isSelectingPlan ||
                        isSelectedPending ||
                        (!plan.monthlyPrice && !plan.annualPrice) ||
                        queuedUpgrades.length > 0 ||
                        !!purchaseHold ||
                        // Disable if viewing yearly but only monthly available
                        (isYearly && !plan.annualPrice && !!plan.monthlyPrice) ||
                        // Disable if viewing monthly but only yearly available
                        (!isYearly && !plan.monthlyPrice && !!plan.annualPrice)
                      }
                      className={`mt-auto flex h-11 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors ${
                        planChangeLocked && !isCurrentForToggle
                          ? "bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 cursor-not-allowed"
                          : isCurrentForToggle || isSelectedPending
                          ? "bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-400 cursor-not-allowed"
                          : purchaseHold || queuedUpgrades.length > 0
                            ? "bg-warning-subtle text-warning cursor-not-allowed"
                            : (!plan.monthlyPrice && !plan.annualPrice)
                              ? "bg-gray-100 dark:bg-slate-800 text-gray-500 dark:text-slate-500 cursor-not-allowed"
                              : // Also gray out when billing cycle not available
                                (isYearly && !plan.annualPrice && plan.monthlyPrice) || (!isYearly && !plan.monthlyPrice && plan.annualPrice)
                                ? "bg-gray-100 dark:bg-slate-800 text-gray-400 dark:text-slate-500 cursor-not-allowed"
                              : plan.popular
                                ? "bg-brand-blue text-white shadow-sm shadow-brand-blue/25 hover:bg-brand-blue-2"
                                : "bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-slate-200 hover:bg-brand-blue hover:text-white"
                      }`}
                    >
                      {isCurrentForToggle ? (
                        'Current Plan'
                      ) : planChangeLocked ? (
                        'No Permission'
                      ) : isSelectedPending ? (
                        'Pending Payment'
                      ) : purchaseHold ? (
                        purchaseHold.needsSupport ? 'Contact Support' : 'Activation Pending'
                      ) : queuedUpgrades.length > 0 ? (
                        (() => {
                          const queuedPlan = plans.find(p => p.name === queuedUpgrades[0]?.new_plan_name);
                          const queuedDirection = comparePlanTiers(
                            currentPlan?.tier, queuedPlan?.tier,
                            currentPlanBillingPeriod,
                            queuedUpgrades[0]?.billing_interval || (isYearly ? 'ANNUAL' : 'MONTHLY'),
                          );
                          return queuedDirection === -1 ? 'Downgrade Queued' : 'Upgrade Queued';
                        })()
                      ) : (!plan.monthlyPrice && !plan.annualPrice) ? (
                        'Contact Sales'
                      ) : (isYearly && !plan.annualPrice && plan.monthlyPrice) ? (
                        'Yearly Not Available'
                      ) : (!isYearly && !plan.monthlyPrice && plan.annualPrice) ? (
                        'Monthly Not Available'
                      ) : isOnTrial || isLocked || isExpiredSubscription ? (
                        'Choose Plan'
                      ) : (() => {
                        // Compare tiers AND billing interval to show Upgrade or Downgrade
                        const tierComparison = comparePlanTiers(
                          currentPlan?.tier,
                          plan.tier,
                          currentPlanBillingPeriod,
                          isYearly ? 'ANNUAL' : 'MONTHLY',
                        );
                        return tierComparison === -1 ? 'Downgrade' : 'Upgrade';
                      })()}
                    </button>
                    </span>
                  </div>
                );
                };

                return groups.map((group) => {
                  const section = TIER_SECTIONS[group.tier] || { label: `${group.tier.charAt(0)}${group.tier.slice(1).toLowerCase()} Plans`, description: 'Additional plans available for your workspace.', icon: Layers };
                  const SectionIcon = section.icon;
                  const hasCurrentPlan = group.plans.some(p => (p.isCurrentMonthly && !isYearly) || (p.isCurrentAnnual && isYearly));
                  const count = group.plans.length;
                  return (
                    <section
                      key={group.tier}
                      aria-label={section.label}
                      className={`rounded-xl border bg-white p-4 shadow-sm dark:bg-slate-900 sm:p-5 ${
                        hasCurrentPlan ? 'border-brand-blue/25 dark:border-brand-blue/40' : 'border-gray-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3 dark:border-slate-700/60">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue">
                            <SectionIcon className="h-[18px] w-[18px]" />
                          </span>
                          <div className="min-w-0">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-50 sm:text-base">{section.label}</h3>
                            <p className="text-xs text-gray-500 dark:text-slate-400">{section.description}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {hasCurrentPlan && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-brand-blue/10 px-2.5 py-0.5 text-[11px] font-semibold text-brand-blue">
                              <CheckCircle className="h-3.5 w-3.5" />
                              Your tier
                            </span>
                          )}
                          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-slate-800 dark:text-slate-400">
                            {count} plan{count !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>
                      {/* Same column count in every tier box so cards share one width */}
                      <div
                        className={`grid gap-4 pt-3 ${
                          maxPlansPerTier === 1 ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3' :
                          maxPlansPerTier === 2 ? 'grid-cols-1 md:grid-cols-2' :
                          maxPlansPerTier === 3 ? 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3' :
                          'grid-cols-1 md:grid-cols-2 xl:grid-cols-4'
                        }`}
                      >
                        {group.plans.map(renderPlanCard)}
                      </div>
                    </section>
                  );
                });
              })()}
            </div>
          </>
        )}

        {plans.length === 0 && !error && (
          <div className="text-center py-12 text-gray-600 dark:text-slate-400">
            <p>No plans available at the moment.</p>
          </div>
        )}
        </>
        )}
        </div>
      </div>
      </div>

      {/* Plan Selection Modal — bottom sheet on mobile, centred two-column dialog on desktop.
          Body scrolls only when the viewport is too short, with the scrollbar hidden. */}
      {showPaymentModal && selectedPlanForPayment && (
        <div ref={paymentModalRef} className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
          <div className={`flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl ${
            modalStep === 'result' ? 'sm:max-w-4xl' : 'sm:max-w-5xl'
          }`}>
            {/* Modal Header */}
            {(() => {
              const PlanIcon = selectedPlanForPayment.icon;
              const billedYearly = (isYearly && !!selectedPlanForPayment.annualPrice) || (!selectedPlanForPayment.monthlyPrice && !!selectedPlanForPayment.annualPrice);
              return (
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-slate-700/60 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue sm:flex">
                      <PlanIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold tracking-tight text-gray-900 dark:text-slate-50">
                        {modalStep === 'result'
                          ? (isDowngradePayment ? 'Downgrade Confirmed!' : 'Upgrade Complete!')
                          : (isDowngradePayment ? 'Downgrade Plan' : 'Upgrade Plan')}
                      </h2>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2">
                        <span className="text-[13px] text-gray-600 dark:text-slate-400">{selectedPlanForPayment.name}</span>
                        {modalStep !== 'result' && (
                          <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-[11px] font-semibold text-brand-blue">
                            {billedYearly ? 'Yearly Plan' : 'Monthly Plan'}
                          </span>
                        )}
                      </div>
                      {modalStep !== 'result' && selectedPlanForPayment.description && (
                        <p className="mt-0.5 line-clamp-1 text-xs text-gray-500 dark:text-slate-500">{selectedPlanForPayment.description}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => { setShowPaymentModal(false); setModalStep('isolation'); setIsDowngradePayment(false); setShowAllModalFeatures(false); }}
                    className="shrink-0 rounded-lg p-2 transition-colors hover:bg-gray-100 dark:hover:bg-slate-700"
                    aria-label="Close"
                  >
                    <X className="h-5 w-5 text-gray-500 dark:text-slate-500" />
                  </button>
                </div>
              );
            })()}

            {/* Single Page Payment Summary */}
            {modalStep !== 'result' && (() => {
              const plan = selectedPlanForPayment;
              const cur = plan.currency || 'INR';
              const dbMonthly = planSettings?.databasePerTenantMonthlyPrice ?? 0;
              const showsAnnualLabel = isYearly ? !!plan.annualPrice : !plan.monthlyPrice;
              const listPrice = isYearly && plan.monthlyPrice && plan.annualPrice
                // Show full undiscounted price (monthly × 12) so savings row is meaningful
                ? plan.monthlyPrice * 12
                : isYearly
                  ? (plan.annualPrice ?? plan.monthlyPrice ?? 0)
                  : (plan.monthlyPrice ?? plan.annualPrice ?? 0);
              const savings = isYearly && plan.monthlyPrice && plan.annualPrice && (plan.monthlyPrice * 12) > plan.annualPrice
                ? (plan.monthlyPrice * 12) - plan.annualPrice
                : null;
              const savingsPct = savings && plan.monthlyPrice ? Math.round((savings / (plan.monthlyPrice * 12)) * 100) : null;
              const basePrice = isYearly
                ? (plan.annualPrice ?? plan.monthlyPrice ?? 0)
                : (plan.monthlyPrice ?? plan.annualPrice ?? 0);
              const subtotal = basePrice + (isolationType === 'database' ? dbMonthly * (isYearly && plan.annualPrice ? 12 : 1) : 0);
              const gst = subtotal * 0.18;
              // Determine actual billing period based on availability
              const actuallyYearly = isYearly && plan.annualPrice;
              const actuallyMonthly = !isYearly && plan.monthlyPrice;
              const useYearlyPrice = actuallyYearly || (!actuallyMonthly && plan.annualPrice);
              const totalSubtotal = (useYearlyPrice ? (plan.annualPrice ?? 0) : (plan.monthlyPrice ?? 0))
                + (isolationType === 'database' ? dbMonthly * (useYearlyPrice ? 12 : 1) : 0);
              const total = totalSubtotal + totalSubtotal * 0.18;
              const paySubtotal = isYearly
                ? (plan.annualPrice || 0) + (isolationType === 'database' ? dbMonthly * 12 : 0)
                : (plan.monthlyPrice || 0) + (isolationType === 'database' ? dbMonthly : 0);
              const payAmount = paySubtotal + paySubtotal * 0.18;

              const rawQuotas = isYearly ? (plan.annualQuotas || plan.quotas) : (plan.monthlyQuotas || plan.quotas);
              const includedRows = rawQuotas ? [
                { label: 'Max Users', icon: Users, value: rawQuotas.max_seats },
                { label: 'Max Jobs', icon: Briefcase, value: rawQuotas.max_jobs },
                { label: 'Resume Storage', icon: FileText, value: rawQuotas.RU ?? rawQuotas.resume_uploads ?? rawQuotas.resume_storage },
                { label: 'Resume Scores', icon: BarChart3, value: rawQuotas.RS ?? rawQuotas.resume_scoring },
                { label: 'Assessments', icon: ClipboardCheck, value: rawQuotas.AS ?? rawQuotas.assessments },
                { label: 'AI Interviews', icon: Video, value: rawQuotas.AIU ?? rawQuotas.ai_interviews ?? rawQuotas.ai_interview },
              ].filter(row => row.value != null && formatQuotaValue(row.value) !== '-') : [];
              const features = isYearly
                ? (plan.annualFeatures?.length ? plan.annualFeatures : plan.features)
                : (plan.monthlyFeatures?.length ? plan.monthlyFeatures : plan.features);
              const visibleFeatures = showAllModalFeatures ? features : features.slice(0, 6);

              return (
                <>
                  <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <div className="grid gap-3 p-3 sm:p-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:gap-4">
                      {/* Left: billing summary + add-on */}
                      <div className="flex min-w-0 flex-col gap-3">
                        <div className="rounded-xl border border-gray-200 p-3 dark:border-slate-700 sm:p-4">
                          <h3 className="mb-1 text-sm font-semibold text-gray-900 dark:text-slate-50">Billing Summary</h3>
                          <div className="divide-y divide-gray-100 text-[13px] dark:divide-slate-700/60">
                            <div className="flex items-center justify-between gap-3 py-1.5">
                              <span className="text-gray-600 dark:text-slate-400">Plan</span>
                              <span className="truncate text-right font-medium text-gray-900 dark:text-slate-50">{plan.name}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 py-1.5">
                              <span className="text-gray-600 dark:text-slate-400">{showsAnnualLabel ? 'Annual Price' : 'Monthly Price'}</span>
                              <span className="font-medium tabular-nums text-gray-900 dark:text-slate-50">{formatCurrency(listPrice, cur)}</span>
                            </div>
                            {/* Show note when billing period doesn't match available pricing */}
                            {isYearly && !plan.annualPrice && plan.monthlyPrice && (
                              <div className="py-1.5 text-[11px] text-warning">Yearly billing not available for this plan. Will be billed monthly.</div>
                            )}
                            {!isYearly && !plan.monthlyPrice && plan.annualPrice && (
                              <div className="py-1.5 text-[11px] text-warning">Monthly billing not available for this plan. Will be billed annually.</div>
                            )}
                            {isolationType === 'database' && (
                              <div className="flex items-center justify-between gap-3 py-1.5 text-warning">
                                <span>Database Isolation Fee{isYearly ? ' (12 months)' : ''}</span>
                                <span className="font-medium tabular-nums">+{formatCurrency(isYearly ? dbMonthly * 12 : dbMonthly, cur)}</span>
                              </div>
                            )}
                            {savings !== null && (
                              <div className="py-1">
                                <div className="flex items-center justify-between gap-3 rounded-lg bg-success-subtle px-2.5 py-1.5 text-success">
                                  <span className="flex items-center gap-1.5 font-medium">
                                    <Crown className="h-4 w-4" />
                                    Annual Savings{savingsPct ? ` (${savingsPct}%)` : ''}
                                  </span>
                                  <span className="font-semibold tabular-nums">-{formatCurrency(savings, cur)}</span>
                                </div>
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-3 py-1.5">
                              <span className="text-gray-600 dark:text-slate-400">Subtotal</span>
                              <span className="font-medium tabular-nums text-gray-900 dark:text-slate-50">{formatCurrency(subtotal, cur)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 py-1.5">
                              <span className="text-gray-600 dark:text-slate-400">GST (18%)</span>
                              <span className="font-medium tabular-nums text-gray-900 dark:text-slate-50">{formatCurrency(gst, cur)}</span>
                            </div>
                          </div>

                          {/* Total */}
                          <div className="mt-2 flex flex-col gap-1.5 rounded-xl bg-brand-blue/[0.05] px-3 py-2.5 ring-1 ring-brand-blue/10 dark:bg-slate-800/60 dark:ring-slate-700 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <p className="text-sm font-semibold text-gray-900 dark:text-slate-50">Total (incl. GST)</p>
                              <p className="text-[11px] text-gray-500 dark:text-slate-400">
                                {(isYearly && plan.annualPrice) || (!plan.monthlyPrice && plan.annualPrice)
                                  ? 'Billed annually (12× quotas)'
                                  : 'Billed monthly'}
                              </p>
                            </div>
                            <div className="flex flex-col sm:items-end">
                              <span className="text-xl font-bold tracking-tight tabular-nums text-gray-900 dark:text-slate-50 sm:text-2xl">{formatCurrency(total, cur)}</span>
                              {savings !== null && (
                                <span className="mt-0.5 inline-flex items-center gap-1 self-start rounded-md bg-success-subtle px-1.5 py-0.5 text-[11px] font-semibold text-success sm:self-auto">
                                  <CheckCircle className="h-3.5 w-3.5" />
                                  You save {formatCurrency(savings, cur)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Dedicated Database add-on - Available for both Monthly and Annual */}
                        <label className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${
                          hasDedicatedDatabase || planSettingsError
                            ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60 dark:border-slate-700 dark:bg-slate-800/50'
                            : isolationType === 'database'
                              ? 'cursor-pointer border-brand-blue/40 bg-brand-blue/[0.04] ring-1 ring-brand-blue/20'
                              : 'cursor-pointer border-gray-200 hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-800'
                        }`}>
                          <input
                            type="checkbox"
                            checked={isolationType === 'database'}
                            onChange={(e) => {
                              if (!hasDedicatedDatabase && !planSettingsError) {
                                setIsolationType(e.target.checked ? 'database' : 'schema');
                              }
                            }}
                            disabled={hasDedicatedDatabase || planSettingsError}
                            className="mt-1.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-blue focus:ring-brand-blue/30 disabled:cursor-not-allowed"
                          />
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue">
                            <Database className="h-4 w-4" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-gray-900 dark:text-slate-50">Dedicated Database</span>
                                <span className="rounded-full bg-brand-blue/10 px-2 py-0.5 text-[11px] font-semibold text-brand-blue">Add-on</span>
                                {hasDedicatedDatabase && (
                                  <span className="rounded-full bg-warning-subtle px-2 py-0.5 text-[11px] font-semibold text-warning">Active</span>
                                )}
                              </div>
                              {!planSettingsError && (
                                <span className="text-[13px] font-semibold tabular-nums text-gray-900 dark:text-slate-50">
                                  +{formatCurrency(isYearly ? dbMonthly * 12 : dbMonthly, cur)}{isYearly ? '/year' : '/month'}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
                              {hasDedicatedDatabase
                                ? 'Your organization already uses a dedicated database. This cannot be changed.'
                                : 'Get your own dedicated database for enhanced isolation and performance'}
                            </p>
                            {planSettingsError && (
                              <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-destructive">
                                <AlertCircle className="h-4 w-4" />
                                Pricing unavailable — unable to load from server
                              </p>
                            )}
                          </div>
                        </label>

                        {/* Error Display in Modal */}
                        {error && (
                          <div className="flex items-start gap-2.5 rounded-xl border border-destructive-line bg-destructive-subtle p-3">
                            <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
                            <div>
                              <p className="text-sm font-medium text-destructive">Plan Selection Failed</p>
                              <p className="mt-1 text-sm text-destructive">{error}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Right: what's included */}
                      <div className="flex min-w-0 flex-col rounded-xl bg-gray-50 p-3 dark:bg-slate-800/50 sm:p-4">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-50">What&apos;s included</h3>
                        <p className="text-[11px] text-gray-500 dark:text-slate-400">Everything you need to scale your hiring.</p>

                        {includedRows.length > 0 && (
                          <ul className="mt-2.5 space-y-1.5 text-[13px]">
                            {includedRows.map(({ label, icon: RowIcon, value }) => {
                              const formatted = formatQuotaValue(value);
                              return (
                                <li key={label} className="flex items-center gap-3">
                                  <RowIcon className="h-4 w-4 shrink-0 text-brand-blue" />
                                  <span className="flex-1 text-gray-700 dark:text-slate-300">{label}</span>
                                  <span className={`font-semibold tabular-nums ${formatted === 'Unlimited' ? 'text-brand-teal' : 'text-gray-900 dark:text-slate-50'}`}>{formatted}</span>
                                </li>
                              );
                            })}
                          </ul>
                        )}

                        {features.length > 0 && (
                          <div className={includedRows.length > 0 ? 'mt-3 border-t border-gray-200 pt-3 dark:border-slate-700' : 'mt-3'}>
                            <h4 className="mb-1.5 text-[13px] font-semibold text-gray-900 dark:text-slate-50">Key Features</h4>
                            <ul className="grid grid-cols-1 gap-x-3 gap-y-1.5 min-[400px]:grid-cols-2">
                              {visibleFeatures.map((feature, idx) => (
                                <li key={idx} className="flex min-w-0 items-start gap-2 text-[13px] text-gray-700 dark:text-slate-300">
                                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-blue text-white">
                                    <Check className="h-3 w-3" strokeWidth={3} />
                                  </span>
                                  {feature}
                                </li>
                              ))}
                            </ul>
                            {features.length > 6 && (
                              <button
                                type="button"
                                onClick={() => setShowAllModalFeatures(v => !v)}
                                className="mt-1.5 text-xs font-medium text-brand-blue hover:underline"
                              >
                                {showAllModalFeatures ? 'Show less' : `+ ${features.length - 6} more features`}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Footer — security note + pay button */}
                  <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-gray-100 px-4 py-2.5 dark:border-slate-700/60 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="flex items-center justify-center gap-2 text-[11px] text-gray-500 dark:text-slate-500 sm:justify-start sm:text-xs">
                      <Lock className="h-3.5 w-3.5 shrink-0" />
                      <span>Secure payment powered by Razorpay · 256-bit SSL encryption. Your payment details are protected.</span>
                    </div>
                    <button
                      onClick={handlePaymentSubmit}
                      disabled={isSelectingPlan}
                      className="flex w-full shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-blue px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand-blue/25 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:opacity-60 sm:w-auto sm:min-w-[220px]"
                    >
                      {isSelectingPlan ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <CreditCard className="h-4 w-4" />
                          Pay {formatCurrency(payAmount, cur)}
                          <ArrowRight className="h-4 w-4" />
                        </>
                      )}
                    </button>
                  </div>
                </>
              );
            })()}

            {/* Result */}
            {modalStep === 'result' && transactionResult && (
              <div className="flex-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="p-6 space-y-4">
                {transactionResult.queued ? (
                  /* Queued Upgrade Result */
                  <>
                    <div className="text-center">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning-subtle ring-4 ring-warning-subtle/40">
                        <Clock className="h-9 w-9 text-warning" />
                      </div>
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-2">{isDowngradePayment ? 'Downgrade Queued!' : 'Upgrade Queued!'}</h3>
                      <p className="text-gray-600 dark:text-slate-400">Your payment was successful. The {isDowngradePayment ? 'downgrade' : 'upgrade'} will apply automatically.</p>
                    </div>

                    <div className="bg-warning-subtle border border-warning-line rounded-xl p-4 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-slate-400">Current Plan:</span>
                        <span className="font-medium text-gray-900 dark:text-slate-50">
                          {companySettings?.current_plan_name || 'Your current plan'}
                          {currentPlanBillingPeriod && <span className="text-gray-500 dark:text-slate-500 font-normal"> ({currentPlanBillingPeriod.charAt(0).toUpperCase() + currentPlanBillingPeriod.slice(1).toLowerCase()})</span>}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-slate-400">New Plan:</span>
                        <span className="font-medium text-warning">
                          {transactionResult.plan_name}
                          {transactionResult.billing_interval && <span className="text-warning font-normal"> ({transactionResult.billing_interval.charAt(0).toUpperCase() + transactionResult.billing_interval.slice(1).toLowerCase()})</span>}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-slate-400">Auto-applies on:</span>
                        <span className="font-medium text-gray-900 dark:text-slate-50">
                          {transactionResult.auto_apply_date
                            ? formatISTDate(transactionResult.auto_apply_date)
                            : 'When current plan expires'}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-slate-400">Amount Paid:</span>
                        <span className="font-medium text-success">
                          {formatCurrency(transactionResult.total_amount, transactionResult.currency || 'INR')}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-slate-400">Invoice:</span>
                        <span className="font-medium text-gray-900 dark:text-slate-50">{transactionResult.invoice_number}</span>
                      </div>
                    </div>

                    <div className="bg-brand-blue/[0.06] border border-brand-blue/20 rounded-xl p-3 text-sm text-brand-blue">
                      <p>{transactionResult.message
                        ? transactionResult.message.replace(/\b(upgrade|downgrade)\b/gi, (m: string) =>
                            isDowngradePayment ? (m.toLowerCase() === 'upgrade' ? 'downgrade' : 'Downgrade') : m
                          )
                        : `Your ${isDowngradePayment ? 'downgrade' : 'upgrade'} to ${transactionResult.plan_name} has been queued. It will automatically apply when your current plan expires.`
                      }</p>
                    </div>

                    <Button
                      variant="primary"
                      className="w-full"
                      onClick={async () => {
                        setShowPaymentModal(false);
                        setModalStep('isolation');
                        await fetchData(await refetchQuota());
                        await fetchQueuedUpgrades();
                      }}
                    >
                      Got it
                    </Button>
                  </>
                ) : (
                  /* Immediate Upgrade Result */
                  <>
                    <div className="text-center">
                      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-subtle ring-4 ring-success-subtle/40">
                        <CheckCircle className="h-9 w-9 text-success" />
                      </div>
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-slate-50 mb-2">
                        {companySettings?.status?.toLowerCase() === 'expired' || companySettings?.status?.toLowerCase() === 'suspended'
                          ? 'Account Reactivated!'
                          : isDowngradePayment ? 'Plan Downgrade Successful!' : 'Plan Upgrade Successful!'}
                      </h3>
                      <p className="text-gray-600 dark:text-slate-400">
                        {companySettings?.status?.toLowerCase() === 'expired' || companySettings?.status?.toLowerCase() === 'suspended'
                          ? 'Your account has been reactivated and all features are now available.'
                          : 'Your subscription has been updated successfully.'}
                      </p>
                    </div>

                    {/* PS03 Fix: Reactivation Confirmation Banner */}
                    {(companySettings?.status?.toLowerCase() === 'expired' || companySettings?.status?.toLowerCase() === 'suspended') && (
                      <div className="bg-success-subtle border border-success-line rounded-xl p-3 flex items-start gap-2">
                        <CheckCircle className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-medium text-success-strong">Welcome back!</p>
                          <p className="text-sm text-success mt-0.5">
                            Your account is now active. You have full access to all features and resources.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* PS02 Fix: Email Confirmation Message */}
                    <div className="bg-brand-blue/[0.06] border border-brand-blue/20 rounded-xl p-3 flex items-start gap-2">
                      <Mail className="w-5 h-5 text-brand-blue flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-brand-blue">
                        A confirmation email has been sent to your registered email address.
                      </p>
                    </div>

                    {/* Payment Details */}
                    <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-slate-400">Plan:</span>
                        <span className="font-medium text-gray-900 dark:text-slate-50">{transactionResult.plan_name}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-slate-400">Billing:</span>
                        <span className="font-medium text-gray-900 dark:text-slate-50">{transactionResult.billing_interval}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-slate-400">Invoice:</span>
                        <span className="font-medium text-gray-900 dark:text-slate-50">{transactionResult.invoice_number}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-slate-400">Amount Paid:</span>
                        <span className="font-medium text-success">
                          {formatCurrency(transactionResult.total_amount, transactionResult.currency || 'INR')}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-slate-400">Payment ID:</span>
                        <span className="font-medium text-gray-500 dark:text-slate-500 text-xs">{transactionResult.razorpay?.payment_id || transactionResult.external_transaction_id}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600 dark:text-slate-400">Status:</span>
                        <Badge className="bg-success-subtle text-success">{transactionResult.subscription_status}</Badge>
                      </div>
                    </div>

                    {/* PS02 Fix: Resource Allocation Details */}
                    <div className="bg-success-subtle border border-success-line rounded-xl p-4">
                      <h4 className="font-medium text-success-strong mb-3 flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        Resources Provisioned
                      </h4>
                      <div className="space-y-2">
                        {selectedPlanForPayment?.quotas?.max_seats && (
                          <div className="flex justify-between text-sm">
                            <span className="text-success flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5" />
                              User Seats:
                            </span>
                            <span className="font-medium text-success-strong">{selectedPlanForPayment.quotas.max_seats} seats</span>
                          </div>
                        )}
                        {selectedPlanForPayment?.quotas?.RS && (
                          <div className="flex justify-between text-sm">
                            <span className="text-success flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5" />
                              Resume Scoring (RS):
                            </span>
                            <span className="font-medium text-success-strong">{selectedPlanForPayment.quotas.RS} units</span>
                          </div>
                        )}
                        {selectedPlanForPayment?.quotas?.AS && (
                          <div className="flex justify-between text-sm">
                            <span className="text-success flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5" />
                              Assessments (AS):
                            </span>
                            <span className="font-medium text-success-strong">{selectedPlanForPayment.quotas.AS} units</span>
                          </div>
                        )}
                        {selectedPlanForPayment?.quotas?.AIU && (
                          <div className="flex justify-between text-sm">
                            <span className="text-success flex items-center gap-1.5">
                              <Zap className="w-3.5 h-3.5" />
                              AI Interviews (AIU):
                            </span>
                            <span className="font-medium text-success-strong">{selectedPlanForPayment.quotas.AIU} units</span>
                          </div>
                        )}
                        {selectedPlanForPayment?.quotas?.RU && (
                          <div className="flex justify-between text-sm">
                            <span className="text-success flex items-center gap-1.5">
                              <ArrowUpRight className="w-3.5 h-3.5" />
                              Resume Storage (RU):
                            </span>
                            <span className="font-medium text-success-strong">{selectedPlanForPayment.quotas.RU} units</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <Button
                      variant="primary"
                      className="w-full"
                      onClick={async () => {
                        setShowPaymentModal(false);
                        setModalStep('isolation');
                        // Refresh data to show updated plan (quota first)
                        await fetchData(await refetchQuota());
                      }}
                    >
                      Done
                    </Button>
                  </>
                )}
              </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Terms & Conditions Modal for Applying Queued Upgrade */}
      {showTCModal && selectedQueuedUpgrade && (() => {
        const queuedNewPlan = plans.find(p => p.name === selectedQueuedUpgrade.new_plan_name);
        const isQueuedDowngrade = comparePlanTiers(
          currentPlan?.tier, queuedNewPlan?.tier,
          currentPlanBillingPeriod,
          selectedQueuedUpgrade.billing_interval || (isYearly ? 'ANNUAL' : 'MONTHLY'),
        ) === -1;
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-[95vw] sm:max-w-4xl w-full max-h-[90dvh] overflow-y-auto">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50">
                    {isQueuedDowngrade ? 'Apply Downgrade Now' : 'Apply Upgrade Now'}
                  </h2>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
                    {isQueuedDowngrade ? 'Downgrade' : 'Upgrade'} to {selectedQueuedUpgrade.new_plan_name}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowTCModal(false);
                    setSelectedQueuedUpgrade(null);
                    setTcAccepted(false);
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                 aria-label="Close">
                  <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-5">
              {/* Warning */}
              <div className="bg-warning-subtle border border-warning-line rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-warning flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-warning-strong mb-1">Important Notice</h4>
                    <p className="text-sm text-warning">
                      By applying this {isQueuedDowngrade ? 'downgrade' : 'upgrade'} immediately, any remaining credits and unused quota
                      on your current plan ({companySettings?.current_plan_name || 'your active plan'}) will be
                      <strong> forfeited</strong>. Your new plan will start today.
                    </p>
                  </div>
                </div>
              </div>

              {/* Plan Change Details */}
              <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3">
                <h4 className="font-medium text-gray-900 dark:text-slate-50">{isQueuedDowngrade ? 'Downgrade Details' : 'Upgrade Details'}</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500 dark:text-slate-500">From:</span>
                    <span className="ml-1 font-medium text-gray-900 dark:text-slate-50">
                      {selectedQueuedUpgrade.current_plan_name || companySettings?.current_plan_name || 'Current Plan'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-slate-500">To:</span>
                    <span className="ml-1 font-medium text-success">{selectedQueuedUpgrade.new_plan_name}</span>
                  </div>
                  <div className="col-span-2">
                    <QueuedAmountBreakdown upgrade={selectedQueuedUpgrade} />
                  </div>
                  <div>
                    <span className="text-gray-500 dark:text-slate-500">Billing:</span>
                    <span className="ml-1 font-medium text-gray-900 dark:text-slate-50">{selectedQueuedUpgrade.billing_interval}</span>
                  </div>
                </div>
              </div>

              {/* Terms & Conditions */}
              <div className="border border-gray-200 dark:border-slate-700 rounded-xl p-4">
                <h4 className="font-medium text-gray-900 dark:text-slate-50 mb-3">Terms & Conditions</h4>
                <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-3 text-sm text-gray-600 dark:text-slate-400 space-y-2 max-h-40 overflow-y-auto">
                  <p>1. Any unused credits, quotas, or features from your current subscription will be immediately terminated and cannot be recovered.</p>
                  <p>2. Your new plan will start immediately upon confirmation and will be valid for the billing period you selected ({selectedQueuedUpgrade.billing_interval}).</p>
                  <p>3. No prorated refunds will be issued for the remaining period of your current plan.</p>
                  <p>4. This action cannot be undone once confirmed.</p>
                  <p>5. Your billing cycle will reset based on today's date.</p>
                </div>
              </div>

              {/* Accept Checkbox */}
              <label className={`flex items-start gap-3 p-4 border-2 rounded-xl cursor-pointer transition-colors ${
                tcAccepted ? 'border-success-line bg-success-subtle' : 'border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800'
              }`}>
                <input
                  type="checkbox"
                  checked={tcAccepted}
                  onChange={(e) => setTcAccepted(e.target.checked)}
                  className="mt-1 w-5 h-5 text-success border-gray-300 rounded focus:ring-success-line"
                />
                <div className="flex-1">
                  <span className="font-medium text-gray-900 dark:text-slate-50">I accept the terms and conditions</span>
                  <p className="text-sm text-gray-500 dark:text-slate-500 mt-1">
                    I understand that remaining credits on my current plan will be forfeited and my new plan will start immediately.
                  </p>
                </div>
              </label>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={handleApplyUpgrade}
                  disabled={!tcAccepted || isApplyingUpgrade}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-teal px-4 py-2.5 font-medium text-white shadow-md shadow-brand-teal/25 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isApplyingUpgrade ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5" />
                      {isQueuedDowngrade ? 'Apply Downgrade Now' : 'Apply Upgrade Now'}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Cancel Queued Upgrade Modal */}
      {showCancelModal && selectedQueuedUpgrade && (() => {
        const cancelQueuedPlan = plans.find(p => p.name === selectedQueuedUpgrade.new_plan_name);
        const isCancelDowngrade = comparePlanTiers(
          currentPlan?.tier,
          cancelQueuedPlan?.tier,
          currentPlanBillingPeriod,
          selectedQueuedUpgrade.billing_interval || (isYearly ? 'ANNUAL' : 'MONTHLY'),
        ) === -1;
        const changeLabel = isCancelDowngrade ? 'Downgrade' : 'Upgrade';
        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-[95vw] sm:max-w-md w-full max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="flex-shrink-0 p-6 border-b border-gray-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-destructive-subtle rounded-full flex items-center justify-center">
                    <XCircle className="w-6 h-6 text-destructive" />
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-50">Cancel {changeLabel}</h2>
                    <p className="text-sm text-gray-600 dark:text-slate-400">Cancel queued plan {changeLabel.toLowerCase()}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowCancelModal(false);
                    setSelectedQueuedUpgrade(null);
                    setCancelReason('');
                  }}
                  className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                 aria-label="Close">
                  <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
              {/* Warning */}
              <div className="bg-destructive-subtle border border-destructive-line rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-6 h-6 text-destructive flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-semibold text-destructive-strong mb-1">Are you sure?</h4>
                    <p className="text-sm text-destructive">
                      You are about to cancel the queued {changeLabel.toLowerCase()} to <strong>{selectedQueuedUpgrade.new_plan_name}</strong>.
                      If you paid for this {changeLabel.toLowerCase()}, you may need to request a refund separately.
                    </p>
                  </div>
                </div>
              </div>

              {/* Plan Change Details */}
              <div className="bg-gray-50 dark:bg-slate-800/50 rounded-xl p-4 space-y-3">
                <h4 className="font-medium text-gray-900 dark:text-slate-50 text-sm">{changeLabel} Details</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-slate-500">New Plan:</span>
                    <span className="font-medium text-gray-900 dark:text-slate-50">{selectedQueuedUpgrade.new_plan_name}</span>
                  </div>
                  {(selectedQueuedUpgrade.payment_amount !== undefined || selectedQueuedUpgrade.breakdown) && (
                    <QueuedAmountBreakdown upgrade={selectedQueuedUpgrade} />
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-slate-500">Scheduled for:</span>
                    <span className="font-medium text-gray-900 dark:text-slate-50">
                      {selectedQueuedUpgrade.auto_apply_date ? formatISTDate(selectedQueuedUpgrade.auto_apply_date) : 'On plan expiry'}
                    </span>
                  </div>
                  {selectedQueuedUpgrade.days_until_activation !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-slate-500">Days until activation:</span>
                      <span className="font-medium text-gray-900 dark:text-slate-50">
                        {selectedQueuedUpgrade.days_until_activation} day{selectedQueuedUpgrade.days_until_activation !== 1 ? 's' : ''}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500 dark:text-slate-500">Queued on:</span>
                    <span className="font-medium text-gray-900 dark:text-slate-50">
                      {selectedQueuedUpgrade.created_at ? formatISTDate(selectedQueuedUpgrade.created_at) : '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Cancellation Reason */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Reason for cancellation (optional)
                </label>
                <textarea
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Please let us know why you're cancelling..."
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-destructive-line focus:border-destructive-line resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setShowCancelModal(false);
                    setSelectedQueuedUpgrade(null);
                    setCancelReason('');
                  }}
                >
                  Keep {changeLabel}
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleCancelUpgrade}
                  disabled={isCancellingUpgrade}
                  icon={isCancellingUpgrade ? <Loader2 className="w-5 h-5 animate-spin" /> : <XCircle className="w-5 h-5" />}
                >
                  {isCancellingUpgrade ? 'Cancelling...' : `Cancel ${changeLabel}`}
                </Button>
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* Downgrade Warning Modal */}
      {showDowngradeWarning && downgradeWarningData && (
        <DowngradeWarningModal
          isOpen={showDowngradeWarning}
          onClose={() => {
            setShowDowngradeWarning(false);
            setDowngradeWarningData(null);
          }}
          onConfirm={() => {
            // User confirmed downgrade - open payment modal
            if (downgradeWarningData.targetPlan) {
              setSelectedPlanForPayment(downgradeWarningData.targetPlan);
              setIsDowngradePayment(true);
              setModalStep('isolation');
              setIsolationType(hasDedicatedDatabase ? 'database' : 'schema');
              setIsNewTenant(false);
              setTransactionResult(null);
              setError(null);
              setShowPaymentModal(true);
            }
            // Close downgrade warning modal
            setShowDowngradeWarning(false);
            setDowngradeWarningData(null);
          }}
          currentPlanName={downgradeWarningData.currentPlanName}
          targetPlanName={downgradeWarningData.targetPlanName}
          overages={downgradeWarningData.overages}
          nearLimitQuotas={downgradeWarningData.nearLimitQuotas}
          isDowngrading={false}
        />
      )}
    </main>
  );
}

export default function CurrentPlanPage() {
  return (
    <Suspense fallback={<CurrentPlanLoadingSkeleton />}>
      <CurrentPlanContent />
    </Suspense>
  );
}
