"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Check, Sparkles, Building2, Users, Zap, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { encodePlanId } from "@/lib/utils/planEncoder";

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
  AS?: number;           // Assessment Sessions
  RS?: number;           // Resume Searches
  RU?: number;           // Resume Uploads
  AIU?: number;          // AI Interview Units
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

interface FreeTrialData {
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
            return settingsData.yearlyDiscountPercentage ?? 10;
          }
        }
      } catch (err) {
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
            };
          })
          .filter((plan): plan is DisplayPlan => plan !== null)
          .sort((a, b) => {
            // Sort by price (monthly price as baseline)
            const orderA = a.monthlyPrice || 0;
            const orderB = b.monthlyPrice || 0;
            return orderA - orderB;
          });

        setPlans(transformedPlans);
      } catch (err) {
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
      } catch (err) {
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
          }
        }
      } catch (err) {
        if (!isCancelled && err.name !== 'AbortError') {
          console.error('Error fetching free trial settings:', err);
        }
      }
    };

    // Fetch all data
    const loadData = async () => {
      const discountPercent = await fetchPlanSettings();
      if (!isCancelled) {
        fetchPlans(discountPercent);
      }
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

  if (isLoading) {
    return (
      <div className="py-20">
        <div className="container mx-auto max-w-[1400px] px-6">
          <div className="text-center mb-16">
            <Badge className="mb-4 px-4 py-2 rounded-full bg-gray-100 dark:bg-purple-900/30 text-gray-900 dark:text-gray-300 border-0">
              <Sparkles className="w-4 h-4 mr-2" />
              Simple Pricing
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-4">
              Choose the right plan for your team
            </h1>
          </div>
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-gray-500 animate-spin" />
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading plans...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-20">
      <div className="container mx-auto max-w-[1400px] px-6">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge className="mb-4 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-0">
            <Sparkles className="w-4 h-4 mr-2" />
            Simple Pricing
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-4">
            Choose the right plan for your team
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            {freeTrial ? (
              <>Start with a {freeTrial.trial_days}-day free trial. No credit card required.</>
            ) : (
              <>Start with a free trial. No credit card required.</>
            )}
          </p>
        </div>

        {error && (
          <div className="text-center mb-8 p-6 bg-red-50 dark:bg-red-900/20 rounded-xl">
            <p className="text-red-600 dark:text-red-400">Failed to load pricing plans</p>
            <p className="text-sm text-gray-500 mt-2">{error}</p>
          </div>
        )}

        {!error && plans.length === 0 && !isLoading && (
          <div className="text-center py-12 text-gray-600 dark:text-gray-400">
            <p>No pricing plans available at the moment.</p>
          </div>
        )}

        {/* Billing Toggle - No common discount, each plan shows its own */}
        <div className="flex items-center justify-center gap-4 mb-16">
          <span className={`text-lg ${!isYearly ? "text-gray-900 dark:text-white font-medium" : "text-gray-500 dark:text-gray-400"}`}>
            Monthly
          </span>
          <button
            onClick={() => setIsYearly(!isYearly)}
            className={`relative w-14 h-8 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 ${
              isYearly
                ? "bg-gray-800"
                : "bg-gray-300 dark:bg-gray-600"
            }`}
            aria-label="Toggle billing period"
          >
            <span
              className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-200 ${
                isYearly ? "translate-x-6" : "translate-x-0"
              }`}
            />
          </button>
          <span className={`text-lg ${isYearly ? "text-gray-900 dark:text-white font-medium" : "text-gray-500 dark:text-gray-400"}`}>
            Yearly
          </span>
        </div>

        {/* Pricing Cards - Including Trial Plans */}
        {(() => {
          // Create a free trial plan card if freeTrial config exists
          const freeTrialCard: DisplayPlan | null = freeTrial ? {
            id: 'free-trial',
            name: 'Free Trial',
            description: freeTrial.trial_days + " days free • No credit card required",
            basePrice: 0,
            monthlyPrice: 0,
            yearlyPrice: 0,
            yearlyFullPrice: 0,
            billingPeriod: 'TRIAL',
            currency: 'INR',
            icon: Sparkles,
            gradient: 'from-gray-600 to-gray-700',
            popular: false,
            features: freeTrial.trial_includes || [],
            trialDays: freeTrial.trial_days,
            quotas: {
              max_jobs: freeTrial.features.MAX_JOBS,
              max_seats: freeTrial.features.MAX_SEATS,
              AS: freeTrial.features.ASSESSMENTS,
              AIU: freeTrial.features.AI_INTERVIEW,
              RS: freeTrial.features.RESUME_SCORING,
              RU: freeTrial.features.RESUME_STORAGE,
            }
          } : null;

          // Combine free trial card with other plans
          const allPlans = freeTrialCard ? [freeTrialCard, ...plans] : plans;

          // Sort plans: trial/free first, then by display order
          const sortedPlans = [...allPlans].sort((a, b) => {
            const aIsTrial = a.id === 'free-trial' || a.name.toLowerCase().includes('trial') || a.name.toLowerCase().includes('free');
            const bIsTrial = b.id === 'free-trial' || b.name.toLowerCase().includes('trial') || b.name.toLowerCase().includes('free');
            if (aIsTrial && !bIsTrial) return -1;
            if (!aIsTrial && bIsTrial) return 1;
            if (a.popular && !b.popular) return -1;
            if (!a.popular && b.popular) return 1;
            return 0;
          });

          return (
            <div className={`grid gap-8 max-w-6xl mx-auto ${
              sortedPlans.length === 1 ? 'md:grid-cols-1 max-w-md' :
              sortedPlans.length === 2 ? 'md:grid-cols-2 max-w-3xl' :
              sortedPlans.length <= 3 ? 'md:grid-cols-3' :
              'md:grid-cols-2 lg:grid-cols-3'
            }`} style={{ gridAutoRows: '1fr' }}>
          {sortedPlans.map((plan) => {
            const Icon = plan.icon;
            const isTrialPlan = plan.id === 'free-trial' || plan.name.toLowerCase().includes('trial') || plan.name.toLowerCase().includes('free');
            return (
              <div key={plan.id} className="flex">
              <Card
                className={`relative p-8 flex flex-col w-full ${
                  plan.popular || isTrialPlan
                    ? "border-2 border-gray-800 shadow-xl"
                    : "border border-gray-200 dark:border-gray-700"
                }`}
              >
                {isTrialPlan && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <Badge className="bg-gray-800 text-white px-4 py-1">
                      Free Trial
                    </Badge>
                  </div>
                )}
                {plan.popular && !isTrialPlan && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <Badge className="bg-gray-800 text-white px-4 py-1">
                      Most Popular
                    </Badge>
                  </div>
                )}

                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center mb-6`}>
                  <Icon className="w-7 h-7 text-white" />
                </div>

                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  {plan.name}
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6 min-h-[48px]">
                  {plan.description}
                </p>

                <div className="mb-6">
                  {isTrialPlan && (!plan.monthlyPrice || plan.monthlyPrice === 0) ? (
                    <div className="text-4xl font-bold text-gray-900 dark:text-white">
                      Free
                    </div>
                  ) : (isYearly ? plan.yearlyPrice : plan.monthlyPrice) ? (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-4xl font-bold text-gray-900 dark:text-white">
                          {formatCurrency(isYearly ? plan.yearlyPrice : plan.monthlyPrice, plan.currency)}
                        </span>
                        <span className="text-gray-500 dark:text-gray-400 text-sm">
                          {isYearly ? '/year' : '/month'}
                        </span>
                      </div>
                      {/* Show strikethrough price and discount badge when viewing yearly */}
                      {isYearly && plan.monthlyPrice && plan.yearlyPrice && (plan.monthlyPrice * 12) > plan.yearlyPrice && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-sm text-gray-400 dark:text-gray-500 line-through">
                            {formatCurrency(plan.monthlyPrice * 12, plan.currency)}
                          </span>
                          {plan.discountPercentage && plan.discountPercentage > 0 && (
                            <span className="inline-block px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full">
                              Save {Math.round(plan.discountPercentage)}%
                            </span>
                          )}
                        </div>
                      )}
                      {/* Show yearly option hint when viewing monthly */}
                      {!isYearly && plan.yearlyPrice && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          or {formatCurrency(plan.yearlyPrice, plan.currency)}/year
                          {plan.discountPercentage && plan.discountPercentage > 0 && (
                            <span className="text-green-600 dark:text-green-400"> (Save {Math.round(plan.discountPercentage)}%)</span>
                          )}
                        </p>
                      )}
                      {/* Show monthly equivalent hint when viewing yearly */}
                      {isYearly && plan.monthlyPrice && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {formatCurrency(plan.monthlyPrice, plan.currency)}/month if billed monthly
                        </p>
                      )}
                    </>
                  ) : (
                    <div className="text-4xl font-bold text-gray-900 dark:text-white">
                      Custom
                    </div>
                  )}
                </div>

                {/* Quotas Section - Use API values directly based on billing toggle */}
                {(() => {
                  // Use correct quotas based on billing toggle - all values from API directly
                  const displayQuotas = isTrialPlan
                    ? plan.quotas
                    : (isYearly ? (plan.annualQuotas || plan.quotas) : (plan.monthlyQuotas || plan.quotas));

                  if (!displayQuotas) return null;

                  return (
                    <div className="mb-6">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {displayQuotas.max_seats !== undefined && displayQuotas.max_seats >= 1 && (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 dark:text-white">
                              {displayQuotas.max_seats.toLocaleString()}
                            </span>
                            <span className="text-gray-600 dark:text-gray-400">Team Members</span>
                          </div>
                        )}
                        {displayQuotas.max_jobs !== undefined && displayQuotas.max_jobs >= 1 && (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 dark:text-white">
                              {displayQuotas.max_jobs.toLocaleString()}
                            </span>
                            <span className="text-gray-600 dark:text-gray-400">Job Postings</span>
                          </div>
                        )}
                        {displayQuotas.RU !== undefined && displayQuotas.RU >= 1 && (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 dark:text-white">
                              {displayQuotas.RU.toLocaleString()}
                            </span>
                            <span className="text-gray-600 dark:text-gray-400">Resume Uploads</span>
                          </div>
                        )}
                        {displayQuotas.RS !== undefined && displayQuotas.RS >= 1 && (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 dark:text-white">
                              {displayQuotas.RS.toLocaleString()}
                            </span>
                            <span className="text-gray-600 dark:text-gray-400">Resume Searches</span>
                          </div>
                        )}
                        {displayQuotas.AS !== undefined && displayQuotas.AS >= 1 && (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 dark:text-white">
                              {displayQuotas.AS.toLocaleString()}
                            </span>
                            <span className="text-gray-600 dark:text-gray-400">Assessments</span>
                          </div>
                        )}
                        {displayQuotas.AIU !== undefined && displayQuotas.AIU >= 1 && (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 dark:text-white">
                              {displayQuotas.AIU.toLocaleString()}
                            </span>
                            <span className="text-gray-600 dark:text-gray-400">AI Interviews</span>
                          </div>
                        )}
                        {displayQuotas.storage_gb !== undefined && displayQuotas.storage_gb >= 1 && (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 dark:text-white">{displayQuotas.storage_gb}GB</span>
                            <span className="text-gray-600 dark:text-gray-400">Storage</span>
                          </div>
                        )}
                        {displayQuotas.total_resume_storage !== undefined && displayQuotas.total_resume_storage >= 1 && (
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900 dark:text-white">
                              {displayQuotas.total_resume_storage.toLocaleString()}
                            </span>
                            <span className="text-gray-600 dark:text-gray-400">Resume Storage</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Features Section */}
                {plan.features.length > 0 && (
                  <ul className="space-y-3 mb-6">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-700 dark:text-gray-300 text-sm">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Spacer to push button to bottom */}
                <div className="flex-grow"></div>

                {/* Button - Fixed at bottom */}
                <Link
                  href={isTrialPlan ? "/signup" : (plan.basePrice ? "/signup?plan=" + encodePlanId(plan.id) : "/contact")}
                  className={`block w-full h-12 rounded-lg font-medium text-center leading-[48px] transition-all ${
                    plan.popular || isTrialPlan
                      ? "bg-gray-800 text-white hover:bg-gray-700"
                      : "border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  {isTrialPlan ? "Start with Trial Plan" : (plan.basePrice ? "Choose Plan" : "Contact Sales")}
                </Link>
              </Card>
              </div>
            );
          })}
            </div>
          );
        })()}

        {/* Addons Section */}
        <div className="mt-24">
          <div className="text-center mb-12">
            <Badge className="mb-4 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-0">
              <Zap className="w-4 h-4 mr-2" />
              Add-ons
            </Badge>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-4">
              Enhance your plan with add-ons
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Need more? Extend your capabilities with our flexible add-ons.
            </p>
          </div>

          {addonsLoading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-gray-500 animate-spin" />
              <p className="mt-4 text-gray-600 dark:text-gray-400">Loading add-ons...</p>
            </div>
          )}

          {addonsError && (
            <div className="text-center mb-8 p-6 bg-red-50 dark:bg-red-900/20 rounded-xl">
              <p className="text-red-600 dark:text-red-400">Failed to load add-ons</p>
              <p className="text-sm text-gray-500 mt-2">{addonsError}</p>
            </div>
          )}

          {!addonsLoading && !addonsError && addons.length === 0 && (
            <div className="text-center py-12 text-gray-600 dark:text-gray-400">
              <p>No add-ons available at the moment.</p>
            </div>
          )}

          {!addonsLoading && !addonsError && addons.length > 0 && (
            <div className="max-w-3xl mx-auto space-y-4">
              {addons.map((addon) => (
                <div
                  key={addon.id}
                  className="flex items-center justify-between p-5 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
                >
                  {/* Feature Name */}
                  <div className="flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-gray-500 flex-shrink-0" />
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {addon.name || addon.addon_name || 'Unnamed Add-on'}
                    </span>
                  </div>

                  {/* Credit & Pricing */}
                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">
                        {addon.credit_amount ?? addon.min_quantity ?? 0}
                      </span>
                      <span className="ml-1 text-sm text-gray-500 dark:text-gray-400">credits</span>
                    </div>
                    <div className="text-right">
                      <span className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                        ₹{addon.price ?? addon.unit_price ?? 0}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FAQ Section */}
        <div className="mt-24 text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            Questions? We&apos;ve got answers.
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-8">
            Can&apos;t find what you&apos;re looking for? Contact our team.
          </p>
          <Link
            href="/contact"
            className="inline-block px-6 py-3 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Contact Us
          </Link>
        </div>
      </div>
    </div>
  );
}
