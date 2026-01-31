"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Check, Sparkles, Building2, Users, Zap, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { encodePlanId } from "@/lib/utils/planEncoder";

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
  AS?: number;           // Assessment Sessions
  RS?: number;           // Resume Scores
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
  const [hoveredPlan, setHoveredPlan] = useState<string | null>(null);

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
          .filter((plan): plan is DisplayPlan => plan !== null)
          .sort((a, b) => {
            // Sort by price (monthly price as baseline)
            const orderA = a.monthlyPrice || 0;
            const orderB = b.monthlyPrice || 0;
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

        {/* Pricing Cards - Interactive Hover Design */}
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
            gradient: 'from-emerald-500 to-teal-600',
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
            },
            planSlug: 'free-trial',
          } : null;

          // Combine free trial card with other plans
          const allPlans = freeTrialCard ? [...plans, freeTrialCard] : plans;

          // Sort plans: descending order (highest price first, free trial last)
          const sortedPlans = [...allPlans].sort((a, b) => {
            const aIsTrial = a.id === 'free-trial';
            const bIsTrial = b.id === 'free-trial';
            if (aIsTrial) return 1; // Trial goes last
            if (bIsTrial) return -1; // Trial goes last
            // Sort by price descending (highest first)
            const priceA = a.yearlyPrice || a.monthlyPrice || 0;
            const priceB = b.yearlyPrice || b.monthlyPrice || 0;
            return priceB - priceA;
          });

          // Simple gray color scheme for all cards
          const getTierStyle = () => {
            return {
              bg: 'bg-gray-700',
              text: 'text-gray-600',
              button: 'bg-gray-700 hover:bg-gray-800',
            };
          };

          return (
            <div
              className="relative max-w-6xl mx-auto"
              onMouseLeave={() => setHoveredPlan(null)}
            >
              <div className="relative flex flex-col lg:flex-row gap-6 items-stretch justify-center">
                {sortedPlans.map((plan) => {
                  const isTrialPlan = plan.id === 'free-trial';
                  const isHovered = hoveredPlan === plan.id;
                  const hasHoveredPlan = hoveredPlan !== null;
                  const tierStyle = getTierStyle();
                  const badgeText = isTrialPlan ? 'Free Trial' : (plan.planTier || plan.name);

                  return (
                    <div
                      key={plan.id}
                      className="relative flex-1"
                      onMouseEnter={() => setHoveredPlan(plan.id)}
                      style={{
                        minWidth: '280px',
                        maxWidth: '380px',
                        transition: 'all 0.3s ease-out',
                        opacity: hasHoveredPlan && !isHovered ? 0.5 : 1,
                        transform: isHovered ? 'translateY(-8px)' : 'translateY(0)',
                      }}
                    >
                      <Card
                        className={`
                          relative h-full p-8 flex flex-col bg-white dark:bg-gray-900 rounded-2xl
                          border-2 transition-all duration-300 ease-out
                          ${isHovered
                            ? 'border-gray-400 shadow-xl'
                            : 'border-gray-200 dark:border-gray-700 shadow-sm'}
                        `}
                      >
                        {/* Badge */}
                        <div className="absolute -top-3 left-6">
                          <span className={`
                            inline-flex items-center px-3 py-1 rounded-full text-sm font-medium text-white
                            ${tierStyle.bg}
                          `}>
                            {badgeText}
                          </span>
                        </div>

                        {/* Plan Name */}
                        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mt-4 mb-2">
                          {plan.name}
                        </h3>

                        {/* Description */}
                        <p className="text-gray-500 dark:text-gray-400 text-sm mb-5 min-h-[40px]">
                          {plan.description}
                        </p>

                        {/* Price */}
                        <div className="mb-6">
                          {isTrialPlan ? (
                            <div className="flex items-baseline gap-2">
                              <span className="text-3xl font-bold text-gray-900 dark:text-white">Free</span>
                              <span className="text-gray-500 text-sm">for {plan.trialDays} days</span>
                            </div>
                          ) : (plan.monthlyPrice || plan.yearlyPrice) ? (
                            <>
                              <div className="flex items-baseline gap-1">
                                <span className="text-3xl font-bold text-gray-900 dark:text-white">
                                  {formatCurrency(
                                    isYearly ? (plan.yearlyPrice ?? plan.monthlyPrice) : (plan.monthlyPrice ?? plan.yearlyPrice),
                                    plan.currency
                                  )}
                                </span>
                                <span className="text-gray-500 dark:text-gray-400 text-sm">
                                  {isYearly ? (plan.yearlyPrice ? '/year' : '/month') : (plan.monthlyPrice ? '/month' : '/year')}
                                </span>
                              </div>
                              {isYearly && plan.monthlyPrice && plan.yearlyPrice && (plan.monthlyPrice * 12) > plan.yearlyPrice && (
                                <div className="flex items-center gap-2 mt-1.5">
                                  <span className="text-sm text-gray-400 line-through">
                                    {formatCurrency(plan.monthlyPrice * 12, plan.currency)}
                                  </span>
                                  {plan.discountPercentage && plan.discountPercentage > 0 && (
                                    <span className="px-2 py-0.5 text-xs font-medium bg-green-50 text-green-600 rounded">
                                      Save {Math.round(plan.discountPercentage)}%
                                    </span>
                                  )}
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-2xl font-bold text-gray-900 dark:text-white">Contact Sales</div>
                          )}
                        </div>

                        {/* Quotas - Single column layout for clarity */}
                        {(() => {
                          const displayQuotas = isTrialPlan
                            ? plan.quotas
                            : (isYearly ? (plan.annualQuotas || plan.quotas) : (plan.monthlyQuotas || plan.quotas));

                          if (!displayQuotas) return null;

                          return (
                            <div className="mb-6 py-4 border-t border-b border-gray-100 dark:border-gray-800">
                              <div className="space-y-2 text-sm">
                                {displayQuotas.max_seats !== undefined && displayQuotas.max_seats >= 1 && (
                                  <div className="flex justify-between items-center">
                                    <span className="text-gray-500">Max Users</span>
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                      {displayQuotas.max_seats.toLocaleString()}
                                    </span>
                                  </div>
                                )}
                                {displayQuotas.max_jobs !== undefined && displayQuotas.max_jobs >= 1 && (
                                  <div className="flex justify-between items-center">
                                    <span className="text-gray-500">Max Jobs</span>
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                      {isTrialPlan ? displayQuotas.max_jobs.toLocaleString() : 'Unlimited'}
                                    </span>
                                  </div>
                                )}
                                {displayQuotas.RU !== undefined && displayQuotas.RU >= 1 && (
                                  <div className="flex justify-between items-center">
                                    <span className="text-gray-500">Resume Storage</span>
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                      {displayQuotas.RU.toLocaleString()}
                                    </span>
                                  </div>
                                )}
                                {displayQuotas.RS !== undefined && displayQuotas.RS >= 1 && (
                                  <div className="flex justify-between items-center">
                                    <span className="text-gray-500">Resume Scores</span>
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                      {displayQuotas.RS.toLocaleString()}
                                    </span>
                                  </div>
                                )}
                                {displayQuotas.AS !== undefined && displayQuotas.AS >= 1 && (
                                  <div className="flex justify-between items-center">
                                    <span className="text-gray-500">Assessments</span>
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                      {displayQuotas.AS.toLocaleString()}
                                    </span>
                                  </div>
                                )}
                                {displayQuotas.AIU !== undefined && displayQuotas.AIU >= 1 && (
                                  <div className="flex justify-between items-center">
                                    <span className="text-gray-500">AI Interviews</span>
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                      {displayQuotas.AIU.toLocaleString()}
                                    </span>
                                  </div>
                                )}
                                {displayQuotas.total_resume_storage !== undefined && displayQuotas.total_resume_storage >= 1 && (
                                  <div className="flex justify-between items-center">
                                    <span className="text-gray-500">Total Storage</span>
                                    <span className="font-semibold text-gray-900 dark:text-white">
                                      {displayQuotas.total_resume_storage.toLocaleString()}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}

                        {/* Features - Expand on hover to show all */}
                        {plan.features.length > 0 && (
                          <div className="mb-6">
                            <ul className="space-y-2.5">
                              {plan.features.slice(0, isHovered ? undefined : 4).map((feature, idx) => (
                                <li
                                  key={idx}
                                  className="flex items-start gap-2.5"
                                  style={{
                                    opacity: idx >= 4 && isHovered ? 1 : undefined,
                                    transition: 'opacity 0.3s ease-out',
                                  }}
                                >
                                  <Check className={`w-4 h-4 flex-shrink-0 mt-0.5 ${tierStyle.text}`} />
                                  <span className="text-gray-600 dark:text-gray-300 text-sm">{feature}</span>
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

                        {/* Spacer */}
                        <div className="flex-grow" />

                        {/* CTA Button */}
                        <Link
                          href={isTrialPlan
                            ? "/signup"
                            : ((plan.monthlyPrice || plan.yearlyPrice)
                                ? (() => {
                                    const hasAnnual = !!plan.annualPlanId;
                                    const hasMonthly = !!plan.monthlyPlanId;
                                    let actualPlanId: string;
                                    let actualBilling: string;

                                    if (isYearly && hasAnnual) {
                                      actualPlanId = String(plan.annualPlanId);
                                      actualBilling = 'ANNUAL';
                                    } else if (!isYearly && hasMonthly) {
                                      actualPlanId = String(plan.monthlyPlanId);
                                      actualBilling = 'MONTHLY';
                                    } else if (hasAnnual) {
                                      actualPlanId = String(plan.annualPlanId);
                                      actualBilling = 'ANNUAL';
                                    } else if (hasMonthly) {
                                      actualPlanId = String(plan.monthlyPlanId);
                                      actualBilling = 'MONTHLY';
                                    } else {
                                      actualPlanId = plan.id;
                                      actualBilling = isYearly ? 'ANNUAL' : 'MONTHLY';
                                    }
                                    return `/signup?plan=${encodePlanId(actualPlanId)}&billing=${actualBilling}`;
                                  })()
                                : "/contact")}
                          className={`
                            block w-full py-3 rounded-lg font-medium text-center text-white
                            transition-all duration-300 ease-out
                            ${tierStyle.button}
                          `}
                        >
                          {isTrialPlan ? 'Start Free Trial' : (plan.basePrice ? 'Get Started' : 'Contact Sales')}
                        </Link>
                      </Card>
                    </div>
                  );
                })}
              </div>
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

                  {/* Units & Pricing */}
                  <div className="flex items-center gap-8">
                    <div className="text-right">
                      <span className="text-2xl font-bold text-gray-900 dark:text-white">
                        {addon.credit_amount ?? addon.min_quantity ?? 0}
                      </span>
                      <span className="ml-1 text-sm text-gray-500 dark:text-gray-400">Units</span>
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
