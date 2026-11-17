"use client";

// ⚠️ MIRROR PAGE: This pricing page is mirrored with components/auth/PlanSelectionModal.tsx
// Any changes to plan display, free-trial logic, or quota rendering MUST be applied to both files.

import { useState, useEffect, useRef } from "react";
import { Check, Building2, Users, Zap } from "lucide-react";
import { BillingToggle } from "@/components/marketing/BillingToggle";
import { display, DISPLAY } from "@/components/marketing/fonts";
import { Cta } from "@/components/marketing/Cta";
import { MarketingFaq } from "@/components/marketing/MarketingFaq";
import { MotionNoScript, PageTitle, PRE, RevealGroup, RevealHeading } from "@/components/marketing/motion";
import { PLAN_RAIL } from "@/components/marketing/PlanCard";
import { PlanGroups } from "@/components/marketing/pricing/PlanGroups";
import { PricingHeroStack } from "@/components/marketing/pricing/PricingHeroStack";
import type { MarketingPlan } from "@/components/marketing/plans";
import {
  PlanEssentialsSection,
  pricingFaqItems,
  UnitsSection,
} from "@/components/marketing/pricing/PricingExplainers";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// Module-level cache to prevent duplicate API calls across component remounts
let cachedData: {
  plans: any[] | null;
  addons: any[] | null;
  freeTrial: any | null;
  planSettings: any | null;
  fetchedAt: number | null;
} = {
  plans: null,
  addons: null,
  freeTrial: null,
  planSettings: null,
  fetchedAt: null,
};

// Cache TTL: 5 minutes
const CACHE_TTL = 5 * 60 * 1000;

const isCacheValid = () => {
  return cachedData.fetchedAt && (Date.now() - cachedData.fetchedAt) < CACHE_TTL;
};

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
  AS?: number;           // Assessment Sessions
  RS?: number;           // Resume Scores
  RU?: number;           // Resume Uploads
  AIU?: number;          // AI Interview Units
  // Long names (alternative API format)
  assessments?: number;
  resume_scoring?: number;
  resume_uploads?: number;
  resume_storage?: number;
  ai_interviews?: number;
  ai_interview?: number;
  // Other quotas
  max_jobs?: number | string;
  max_seats?: number | string;
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
  // Annual plans carry a discount percentage; read below as
  // `(groupedPlan as any).discount_percentage ?? annual?.discount_percentage`, where the
  // second read needed this declaration. Optional - monthly plans omit it.
  discount_percentage?: number;
}

interface DisplayPlan {
  id: string;
  name: string;
  description: string;
  basePrice: number | null;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  yearlyFullPrice: number | null;
  billingPeriod: string;
  currency: string;
  icon: typeof Users | typeof Building2 | typeof Zap;
  gradient: string;
  popular: boolean;
  features: string[];
  trialDays: number;
  quotas?: PlanQuotas;
  // Separate quotas for monthly and annual - from API directly
  monthlyQuotas?: PlanQuotas;
  annualQuotas?: PlanQuotas;
  // Discount percentage from API
  discountPercentage?: number;
  // New fields for monthly/annual plan variants
  monthlyPlanId?: number;
  annualPlanId?: number;
  planSlug: string;
  // Tier from API for badge display
  planTier?: string;
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
  min_quantity?: number;
  max_quantity?: number;
  is_active?: boolean;
  is_public?: boolean;
  display_order?: number;
  created_at?: string;
  updated_at?: string;
}

interface FreeTrialFeature {
  feature_key: string;
  feature_name: string;
  feature_category: string;
  icon_name?: string;
  quota_key: string | null;
  quota_limit: number | null;
}

interface FreeTrialData {
  id?: number;
  trial_days: number;
  plan_name?: string;
  features: FreeTrialFeature[];
  quotas: {
    MAX_SEATS?: number | string;
    MAX_JOBS?: number | string;
    STORAGE_GB?: number;
    API_RATE_LIMIT?: number;
  };
}

interface PlanSettingsData {
  yearlyDiscountPercentage: number;
  databasePerTenantMonthlyPrice: number;
  updatedAt?: string;
  updatedBy?: string | null;
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
  if (name.includes('freelancer') || name.includes('starter') || name.includes('basic') || tierLower === 'starter') return "from-gray-600 to-gray-700";
  return "from-gray-600 to-gray-700";
};

// Format currency based on currency code
const formatCurrency = (amount: number | undefined | null, currency: string): string => {
  if (amount === undefined || amount === null) {
    return 'Contact us';
  }
  const currencySymbols: Record<string, string> = {
    'USD': '$',
    'INR': '₹',
    'EUR': '€',
    'GBP': '£',
  };
  const symbol = currencySymbols[currency] || currency + ' ';
  return symbol + amount.toLocaleString();
};


export default function PricingPage() {
  const [isYearly, setIsYearly] = useState(true); // Default to yearly (base price)
  const [plans, setPlans] = useState<DisplayPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [addonsLoading, setAddonsLoading] = useState(true);
  const [addonsError, setAddonsError] = useState<string | null>(null);
  const [freeTrial, setFreeTrial] = useState<FreeTrialData | null>(null);
  const [planSettings, setPlanSettings] = useState<PlanSettingsData | null>(null);

  // Get discount percentage (default to 10 if not loaded)
  const yearlyDiscountPercent = planSettings?.yearlyDiscountPercentage ?? 10;

  // Use ref to track if data has been fetched to prevent duplicate calls
  const hasFetchedRef = useRef(false);

  useEffect(() => {
    // Prevent duplicate calls on re-renders or React Strict Mode
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    // Check if we have valid cached data - use it immediately
    if (isCacheValid() && cachedData.plans) {
      console.log('[Pricing] Using cached data');
      if (cachedData.planSettings) setPlanSettings(cachedData.planSettings);
      if (cachedData.plans) setPlans(cachedData.plans);
      if (cachedData.addons) setAddons(cachedData.addons);
      if (cachedData.freeTrial) setFreeTrial(cachedData.freeTrial);
      setIsLoading(false);
      setAddonsLoading(false);
      return;
    }

    let isCancelled = false;
    const abortController = new AbortController();

    const fetchPlanSettings = async (): Promise<number> => {
      try {
        const response = await fetch(API_URL + "/addons/plan-settings", {
          signal: abortController.signal
        });

        if (response.ok && !isCancelled) {
          const result = await response.json();
          const settingsData = result?.data || result;
          if (settingsData) {
            setPlanSettings(settingsData);
            cachedData.planSettings = settingsData;
            return settingsData.yearlyDiscountPercentage ?? 10;
          }
        }
      } catch (err: any) {
        if (!isCancelled && err.name !== 'AbortError') {
          console.error('Error fetching plan settings:', err);
        }
      }
      return 10;
    };

    const fetchPlans = async (discountPercent: number) => {
      try {
        if (isCancelled) return;
        setIsLoading(true);
        setError(null);

        const response = await fetch(API_URL + "/subscription/public/plans", {
          signal: abortController.signal
        });

        if (!response.ok) {
          throw new Error("Failed to fetch plans: " + response.status);
        }

        const result = await response.json();
        if (isCancelled) return;

        // Handle new API structure: { data: { plans: [...] } } with billing_options
        const data = result.data || result;
        const plansArray = data?.plans || (Array.isArray(data) ? data : []);

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

            // Use actual prices from API - no calculations
            const monthlyPrice = monthly?.base_price ?? null;
            const yearlyPrice = annual?.base_price ?? null;

            return {
              id: String(basePlan.id),
              name: groupedPlan.plan_name,
              description: groupedPlan.description,
              basePrice: monthlyPrice,
              monthlyPrice,
              yearlyPrice,
              yearlyFullPrice: null, // Not used - we use actual API prices only
              billingPeriod: basePlan.billing_period || 'MONTHLY',
              currency: basePlan.currency || 'INR',
              icon: getIconForPlan(groupedPlan.plan_name, groupedPlan.plan_tier),
              gradient: getGradientForPlan(groupedPlan.plan_name, groupedPlan.plan_tier),
              popular: basePlan.is_featured || false,
              features: featureNames,
              trialDays: groupedPlan.trial_period_days || basePlan.trial_period_days || 0,
              quotas: basePlan.quotas,
              // Store separate quotas for monthly and annual from API
              monthlyQuotas: monthly?.quotas,
              annualQuotas: annual?.quotas,
              // Discount percentage from API
              discountPercentage: (groupedPlan as any).discount_percentage ?? annual?.discount_percentage,
              // New fields for monthly/annual variants
              monthlyPlanId: monthly?.id,
              annualPlanId: annual?.id,
              planSlug: groupedPlan.plan_slug,
              // Tier from API for badge
              planTier: groupedPlan.plan_tier,
            };
          })
          .filter((plan): plan is NonNullable<typeof plan> => plan !== null)
          .sort((a, b) => {
            const tierOrder: Record<string, number> = { STARTER: 0, PROFESSIONAL: 1, ENTERPRISE: 2 };
            const orderA = tierOrder[(a.planTier || '').toUpperCase()] ?? 99;
            const orderB = tierOrder[(b.planTier || '').toUpperCase()] ?? 99;
            return orderA - orderB;
          });

        setPlans(transformedPlans);
        cachedData.plans = transformedPlans;
      } catch (err: any) {
        if (!isCancelled && err.name !== 'AbortError') {
          console.error('Error fetching plans:', err);
          setError(err instanceof Error ? err.message : 'Failed to load plans');
        }
      } finally {
        if (!isCancelled) setIsLoading(false);
      }
    };

    const fetchAddons = async () => {
      try {
        if (isCancelled) return;
        setAddonsLoading(true);
        setAddonsError(null);

        const response = await fetch(API_URL + "/addons?active_only=false&public_only=false", {
          signal: abortController.signal
        });

        if (!response.ok) {
          throw new Error("Failed to fetch addons: " + response.status);
        }

        const result = await response.json();
        if (isCancelled) return;

        const data: Addon[] = result.data || result;
        const sortedAddons = Array.isArray(data)
          ? data.sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
          : [];

        setAddons(sortedAddons);
        cachedData.addons = sortedAddons;
      } catch (err: any) {
        if (!isCancelled && err.name !== 'AbortError') {
          console.error('Error fetching addons:', err);
          setAddonsError(err instanceof Error ? err.message : 'Failed to load addons');
        }
      } finally {
        if (!isCancelled) setAddonsLoading(false);
      }
    };

    const fetchFreeTrial = async () => {
      try {
        const response = await fetch(API_URL + "/addons/free-trial", {
          signal: abortController.signal
        });

        if (response.ok && !isCancelled) {
          const result = await response.json();
          const trialData = result?.data || result;

          if (trialData && trialData.trial_days) {
            setFreeTrial(trialData);
            cachedData.freeTrial = trialData;
          }
        }
      } catch (err: any) {
        if (!isCancelled && err.name !== 'AbortError') {
          console.error('Error fetching free trial settings:', err);
        }
      }
    };

    // Fetch all data
    const loadData = async () => {
      console.log('[Pricing] Fetching fresh data...');
      const discountPercent = await fetchPlanSettings();
      if (!isCancelled) {
        await fetchPlans(discountPercent);
      }
      // Mark cache as valid after plans are loaded
      cachedData.fetchedAt = Date.now();
    };

    loadData();
    fetchAddons();
    fetchFreeTrial();

    // Cleanup function - prevents state updates after unmount and aborts ongoing requests
    return () => {
      isCancelled = true;
      abortController.abort();
    };
  }, []);

  /* ── Plan list: the same assembly as before, now rendered by the shared
     PlanCard so the landing and pricing pages draw plans identically. ── */

  // Free-trial card, built from the trial configuration.
  const buildTrialQuotas = (trial: FreeTrialData): PlanQuotas => {
    const q = trial.quotas || {};
    const result: PlanQuotas = {
      max_seats: q.MAX_SEATS,
      max_jobs: q.MAX_JOBS,
      total_resume_storage: typeof q.STORAGE_GB === 'number' ? q.STORAGE_GB : undefined,
    };
    for (const feature of Array.isArray(trial.features) ? trial.features : []) {
      if (feature.quota_key && feature.quota_limit !== null) {
        switch (feature.quota_key) {
          case 'RU': result.RU = feature.quota_limit ?? undefined; break;
          case 'RS': result.RS = feature.quota_limit ?? undefined; break;
          case 'AS': result.AS = feature.quota_limit ?? undefined; break;
          case 'AIU': result.AIU = feature.quota_limit ?? undefined; break;
        }
      }
    }
    return result;
  };

  const trialCard: MarketingPlan | null = freeTrial
    ? {
        id: 'free-trial',
        name: 'Free Trial',
        description:
          freeTrial.trial_days + (freeTrial.trial_days === 1 ? ' day' : ' days') + ' free • No credit card required',
        isTrial: true,
        trialDays: freeTrial.trial_days,
        currency: 'INR',
        monthlyPrice: 0,
        yearlyPrice: 0,
        featured: false,
        features: (Array.isArray(freeTrial.features) ? freeTrial.features : []).map(f => f.feature_name),
        quotas: buildTrialQuotas(freeTrial),
      }
    : null;

  // Paid plans in tier order: STARTER > PROFESSIONAL > ENTERPRISE.
  const tierOrder: Record<string, number> = { STARTER: 0, PROFESSIONAL: 1, ENTERPRISE: 2 };
  const paidPlans: MarketingPlan[] = [...plans]
    .sort(
      (a, b) =>
        (tierOrder[(a.planTier || '').toUpperCase()] ?? 99) -
        (tierOrder[(b.planTier || '').toUpperCase()] ?? 99)
    )
    .map(plan => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      tier: plan.planTier,
      isTrial: false,
      trialDays: plan.trialDays,
      currency: plan.currency,
      monthlyPrice: plan.monthlyPrice,
      yearlyPrice: plan.yearlyPrice,
      monthlyPlanId: plan.monthlyPlanId === undefined ? undefined : String(plan.monthlyPlanId),
      annualPlanId: plan.annualPlanId === undefined ? undefined : String(plan.annualPlanId),
      discountPercentage: plan.discountPercentage,
      featured: plan.popular,
      features: plan.features,
      quotas: plan.quotas,
      monthlyQuotas: plan.monthlyQuotas,
      annualQuotas: plan.annualQuotas,
    }));

  const gridPlans = trialCard ? [trialCard, ...paidPlans] : paidPlans;

  // Custom plan: every paid-plan feature, minus quota duplicates and
  // trial-only phrases.
  const quotaFeatureNames = new Set([
    'resume storage', 'resume scoring', 'skill assessments',
    'assessments', 'ai interview', 'ai interviews',
  ]);
  const trialOnlyPhrases = ['free access', 'no credit card', 'cancel anytime', 'free trial'];
  const customFeatures = Array.from(new Set(paidPlans.flatMap(p => p.features))).filter(f => {
    const lower = f.toLowerCase();
    if (quotaFeatureNames.has(lower)) return false;
    return !trialOnlyPhrases.some(phrase => lower.includes(phrase));
  });

  // Billing switch is only meaningful when both periods are on sale somewhere.
  const hasAnyMonthly = plans.some(plan => plan.monthlyPlanId || plan.monthlyPrice);
  const hasAnyAnnual = plans.some(plan => plan.annualPlanId || plan.yearlyPrice);
  const toggleDisabled = !hasAnyMonthly || !hasAnyAnnual;
  const bestSaving = plans.reduce((best, plan) => Math.max(best, Math.round(plan.discountPercentage ?? 0)), 0);

  const SHELL = 'mx-auto w-full max-w-[1200px] xl:max-w-[1320px] 2xl:max-w-[1480px] px-4 sm:px-6 lg:px-8';
  const H2 = `${DISPLAY} text-[clamp(1.5rem,3.4vw,2.5rem)] font-bold leading-[1.1] tracking-[-0.03em] text-mkt-ink`;

  return (
    <div className={`${display.variable} overflow-x-clip bg-mkt-canvas text-mkt-ink`}>
      <MotionNoScript />
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 -top-48 h-[560px] w-[560px] rounded-full bg-[radial-gradient(closest-side,rgba(7,156,196,0.12),transparent)] dark:bg-[radial-gradient(closest-side,rgba(76,123,232,0.16),transparent)]"
        />
        <div className={`${SHELL} relative grid grid-cols-1 items-center gap-2 pb-4 pt-8 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-8 lg:pb-8`}>
          <div className="max-w-2xl">
            <PageTitle
              lines={['Start small.', "Grow when you're ready."]}
              className={`${DISPLAY} text-[clamp(1.95rem,5.6vw,4.25rem)] font-extrabold leading-[1] tracking-[-0.045em]`}
            />
            <RevealGroup immediate delay={0.5}>
              <p
                data-reveal
                data-pre
                className={`${PRE} mt-3.5 max-w-xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-300 sm:mt-6 sm:text-lg`}
              >
                Simple plans plus usage units, so you only pay for what you use.{' '}
                {freeTrial
                  ? `Start with a ${freeTrial.trial_days}-day free trial.`
                  : 'Start with a free trial.'}
              </p>
            </RevealGroup>
            {!isLoading && plans.length > 0 && (
              <RevealGroup immediate delay={0.6} className="mt-6 sm:mt-8">
                <div data-reveal>
                  <BillingToggle
                    isYearly={isYearly}
                    onChange={setIsYearly}
                    savePercent={toggleDisabled ? 0 : bestSaving}
                    disabled={toggleDisabled}
                  />
                </div>
              </RevealGroup>
            )}
          </div>
          {/* 3D cost flow: plan → usage units → what you pay, from live plan data. */}
          <div className="order-first min-w-0 overflow-hidden lg:order-none lg:overflow-visible">
            <PricingHeroStack plans={gridPlans} isYearly={isYearly} />
          </div>
        </div>
      </section>

      {/* Plans */}
      <section aria-label="Plans" className="pb-12 sm:pb-24 lg:pb-28">
        <div className={SHELL}>
          {isLoading ? (
            <div className={`${PLAN_RAIL} sm:grid-cols-2 xl:grid-cols-4`} aria-busy="true" aria-label="Loading plans">
              {[0, 1, 2, 3].map(i => (
                <div
                  key={i}
                  className="h-[460px] w-[84%] shrink-0 animate-pulse sm:h-[520px] sm:w-auto rounded-[20px] border border-slate-900/[0.06] bg-mkt-surface dark:border-white/[0.08]"
                />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-[20px] border border-slate-900/[0.08] bg-mkt-surface p-8 dark:border-white/10 sm:p-10">
              <p className={`${DISPLAY} text-xl font-bold`}>Plans couldn&apos;t load</p>
              <p className="mt-2 text-[15px] text-slate-600 dark:text-slate-400">
                Refresh the page to try again, or contact us for a quote. ({error})
              </p>
              <Cta href="/contact" size="sm" className="mt-6">
                Contact us
              </Cta>
            </div>
          ) : gridPlans.length === 0 ? (
            <p className="rounded-[20px] border border-slate-900/[0.08] bg-mkt-surface p-8 text-[15px] text-slate-600 dark:border-white/10 dark:text-slate-400">
              No plans are on sale right now. Contact us and we&apos;ll set you up directly.
            </p>
          ) : (
            <PlanGroups plans={gridPlans} isYearly={isYearly} />
          )}

          {/* Custom plan — a band rather than another card: it has no price,
              and its job is to start a conversation. */}
          {!isLoading && !error && (
            <RevealGroup y={40}>
            <div data-reveal className="relative mt-4 grid grid-cols-1 gap-6 overflow-hidden rounded-[20px] bg-mkt-navy p-5 text-white sm:gap-8 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-14">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-32 -top-32 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgba(7,156,196,0.28),transparent)]"
              />
              <div className="relative">
                <h2 className={`${DISPLAY} text-xl font-bold tracking-[-0.025em] sm:text-3xl`}>Custom</h2>
                <p className="mt-2 max-w-md text-sm sm:mt-3 sm:text-[15px] leading-relaxed text-white/70">
                  A plan sized to your team. Tell us how you hire and we&apos;ll put together
                  the right mix of users and usage units.
                </p>
                <Cta href="/contact" variant="light" size="sm" magnetic className="mt-5 h-10 px-5 sm:mt-7 sm:h-11 sm:px-6">
                  Talk to Sales
                </Cta>
              </div>
              {customFeatures.length > 0 && (
                <ul className="relative grid content-start gap-x-8 gap-y-2 sm:grid-cols-2 sm:gap-y-3">
                  {customFeatures.map(feature => (
                    <li key={feature} className="flex items-start gap-2 text-[13px] text-white/80 sm:gap-2.5 sm:text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-mkt-cyan" strokeWidth={2.5} />
                      {feature}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            </RevealGroup>
          )}
        </div>
      </section>

      {/* Add-ons */}
      <section className="border-y border-slate-900/[0.07] bg-mkt-surface py-12 dark:border-white/[0.08] sm:py-24 lg:py-28">
        <div className={`${SHELL} grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] lg:gap-16`}>
          <div>
            <RevealHeading text="Top up with add-ons" className={H2} />
            <RevealGroup>
              <p data-reveal className="mt-3 max-w-sm text-[15px] sm:mt-4 sm:text-base leading-relaxed text-slate-600 dark:text-slate-400">
                Top up anytime with add-on unit packs. No plan change needed.
              </p>
            </RevealGroup>
          </div>

          <div>
            {addonsLoading ? (
              <div className="space-y-px" aria-busy="true" aria-label="Loading add-ons">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-900/[0.04] dark:bg-white/[0.05]" />
                ))}
              </div>
            ) : addonsError ? (
              <p className="text-[15px] text-slate-600 dark:text-slate-400">
                Add-ons couldn&apos;t load. Refresh the page to try again.
              </p>
            ) : addons.length === 0 ? (
              <p className="text-[15px] text-slate-600 dark:text-slate-400">No add-ons are on sale right now.</p>
            ) : (
              <RevealGroup stagger={0.06} y={16}>
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-900/[0.1] text-sm text-slate-500 dark:border-white/10 dark:text-slate-400">
                    <th scope="col" className="pb-3 font-medium">Add-on</th>
                    <th scope="col" className="pb-3 text-right font-medium">Units</th>
                    <th scope="col" className="pb-3 text-right font-medium">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {addons.map(addon => (
                    <tr
                      key={addon.id}
                      data-reveal
                      className="border-b border-slate-900/[0.07] transition-colors duration-300 hover:bg-mkt-canvas dark:border-white/[0.08]"
                    >
                      <td className="py-4 pr-3 text-sm font-semibold text-mkt-ink sm:pr-4 sm:text-[15px]">
                        {addon.name || addon.addon_name || 'Unnamed add-on'}
                      </td>
                      <td className={`${DISPLAY} py-4 text-right text-base font-bold tabular-nums text-mkt-ink sm:text-lg`}>
                        {(addon.credit_amount ?? addon.min_quantity ?? 0).toLocaleString()}
                      </td>
                      <td className={`${DISPLAY} py-4 pl-3 text-right text-base font-bold tabular-nums text-mkt-ink sm:pl-4 sm:text-lg`}>
                        ₹{(addon.price ?? addon.unit_price ?? 0).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </RevealGroup>
            )}
          </div>
        </div>
      </section>

      {/* Explainers: how usage units work, then plans and billing at a glance. */}
      <UnitsSection />
      <PlanEssentialsSection />

      {/* FAQ */}
      <section className="py-12 sm:py-24 lg:py-28">
        <div className={SHELL}>
          <MarketingFaq items={pricingFaqItems(freeTrial?.trial_days ?? null)} />
        </div>
      </section>
    </div>
  );
}
