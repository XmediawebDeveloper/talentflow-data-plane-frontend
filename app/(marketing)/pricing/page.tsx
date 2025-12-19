"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Check, Sparkles, Building2, Users, Zap, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'https://talentflowapi.mo.vc/api/v1';

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
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  currency: string;
  icon: typeof Users | typeof Building2 | typeof Zap;
  gradient: string;
  popular: boolean;
  features: string[];
  trialDays: number;
  quotas?: PlanQuotas;
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
  if (name.includes('enterprise') || name.includes('premium') || tierLower === 'enterprise') return "from-orange-500 to-red-500";
  if (name.includes('business') || name.includes('professional') || name.includes('pro') || tierLower === 'professional') return "from-purple-500 to-pink-500";
  if (name.includes('freelancer') || name.includes('starter') || name.includes('basic') || tierLower === 'starter') return "from-blue-500 to-cyan-500";
  return "from-blue-500 to-cyan-500";
};

// Format currency based on currency code
const formatCurrency = (amount: number, currency: string): string => {
  const currencySymbols: Record<string, string> = {
    'USD': '$',
    'INR': '₹',
    'EUR': '€',
    'GBP': '£',
  };
  const symbol = currencySymbols[currency] || currency + ' ';
  return `${symbol}${amount.toLocaleString()}`;
};

export default function PricingPage() {
  const [isYearly, setIsYearly] = useState(false);
  const [plans, setPlans] = useState<DisplayPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`${ADMIN_API_URL}/public/plans`);

        if (!response.ok) {
          throw new Error(`Failed to fetch plans: ${response.status}`);
        }

        const result = await response.json();
        const data: ApiPlan[] = result.data || result;

        // Debug: log API response
        console.log('API Plans Response:', data);

        const transformedPlans: DisplayPlan[] = data
          .filter(plan => plan.is_active && plan.is_public)
          .sort((a, b) => {
            // Sort by display_order first, then by price
            if (a.display_order !== b.display_order) {
              return (a.display_order || 0) - (b.display_order || 0);
            }
            return a.base_price - b.base_price;
          })
          .map((plan) => {
            // Only use features from API if they exist, otherwise empty array
            const featureNames = plan.features
              ?.filter(f => f.is_enabled)
              ?.map(f => f.feature_name) || [];

            return {
              id: String(plan.id),
              name: plan.plan_name,
              description: plan.description,
              monthlyPrice: plan.monthly_price > 0 ? plan.monthly_price : (plan.base_price > 0 ? plan.base_price : null),
              yearlyPrice: plan.monthly_price > 0 ? Math.round(plan.monthly_price * 10) : null, // Yearly = monthly * 12 * 0.8 (20% off)
              currency: plan.currency || 'INR',
              icon: getIconForPlan(plan.plan_name, plan.plan_tier),
              gradient: getGradientForPlan(plan.plan_name, plan.plan_tier),
              popular: plan.is_featured || false,
              features: featureNames,
              trialDays: plan.trial_period_days || 0,
              quotas: plan.quotas,
            };
          });

        setPlans(transformedPlans);
      } catch (err) {
        console.error('Error fetching plans:', err);
        setError(err instanceof Error ? err.message : 'Failed to load plans');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlans();
  }, []);

  if (isLoading) {
    return (
      <div className="py-20">
        <div className="container mx-auto max-w-[1400px] px-6">
          <div className="text-center mb-16">
            <Badge className="mb-4 px-4 py-2 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-0">
              <Sparkles className="w-4 h-4 mr-2" />
              Simple Pricing
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-4">
              Choose the right plan for your team
            </h1>
          </div>
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-purple-500 animate-spin" />
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
          <Badge className="mb-4 px-4 py-2 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-0">
            <Sparkles className="w-4 h-4 mr-2" />
            Simple Pricing
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold text-gray-900 dark:text-white mb-4">
            Choose the right plan for your team
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            Start with a free trial. No credit card required.
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4 mt-8">
            <span className={`text-lg ${!isYearly ? "text-gray-900 dark:text-white font-medium" : "text-gray-500"}`}>
              Monthly
            </span>
            <Switch checked={isYearly} onCheckedChange={setIsYearly} />
            <span className={`text-lg ${isYearly ? "text-gray-900 dark:text-white font-medium" : "text-gray-500"}`}>
              Yearly
            </span>
            {isYearly && (
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                Save 20%
              </Badge>
            )}
          </div>
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

        {/* Pricing Cards */}
        <div className={`grid gap-8 max-w-6xl mx-auto ${
          plans.length === 1 ? 'md:grid-cols-1 max-w-md' :
          plans.length === 2 ? 'md:grid-cols-2 max-w-3xl' :
          plans.length <= 3 ? 'md:grid-cols-3' :
          'md:grid-cols-2 lg:grid-cols-3'
        }`}>
          {plans.map((plan) => {
            const Icon = plan.icon;
            const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
            return (
              <Card
                key={plan.id}
                className={`relative p-8 ${
                  plan.popular
                    ? "border-2 border-purple-500 shadow-xl scale-105"
                    : "border border-gray-200 dark:border-gray-700"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-1">
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
                  {price ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-bold text-gray-900 dark:text-white">
                        {formatCurrency(price, plan.currency)}
                      </span>
                      <span className="text-gray-600 dark:text-gray-400">
                        /{isYearly ? 'year' : 'month'}
                      </span>
                    </div>
                  ) : (
                    <div className="text-4xl font-bold text-gray-900 dark:text-white">
                      Custom
                    </div>
                  )}
                  {isYearly && price && (
                    <p className="text-sm text-green-600 mt-1">
                      Save 20% with annual billing
                    </p>
                  )}
                </div>

                {/* Quotas Section - Show values >= 1 */}
                {plan.quotas && (
                  <div className="mb-6">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {plan.quotas.max_seats !== undefined && plan.quotas.max_seats >= 1 && (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 dark:text-white">{plan.quotas.max_seats}</span>
                          <span className="text-gray-600 dark:text-gray-400">Team Members</span>
                        </div>
                      )}
                      {plan.quotas.max_jobs !== undefined && plan.quotas.max_jobs >= 1 && (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 dark:text-white">{plan.quotas.max_jobs}</span>
                          <span className="text-gray-600 dark:text-gray-400">Job Postings</span>
                        </div>
                      )}
                      {plan.quotas.RU !== undefined && plan.quotas.RU >= 1 && (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 dark:text-white">{plan.quotas.RU.toLocaleString()}</span>
                          <span className="text-gray-600 dark:text-gray-400">Resume Uploads</span>
                        </div>
                      )}
                      {plan.quotas.RS !== undefined && plan.quotas.RS >= 1 && (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 dark:text-white">{plan.quotas.RS.toLocaleString()}</span>
                          <span className="text-gray-600 dark:text-gray-400">Resume Searches</span>
                        </div>
                      )}
                      {plan.quotas.AS !== undefined && plan.quotas.AS >= 1 && (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 dark:text-white">{plan.quotas.AS.toLocaleString()}</span>
                          <span className="text-gray-600 dark:text-gray-400">Assessments</span>
                        </div>
                      )}
                      {plan.quotas.AIU !== undefined && plan.quotas.AIU >= 1 && (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 dark:text-white">{plan.quotas.AIU.toLocaleString()}</span>
                          <span className="text-gray-600 dark:text-gray-400">AI Interviews</span>
                        </div>
                      )}
                      {plan.quotas.storage_gb !== undefined && plan.quotas.storage_gb >= 1 && (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 dark:text-white">{plan.quotas.storage_gb}GB</span>
                          <span className="text-gray-600 dark:text-gray-400">Storage</span>
                        </div>
                      )}
                      {plan.quotas.total_resume_storage !== undefined && plan.quotas.total_resume_storage >= 1 && (
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 dark:text-white">{plan.quotas.total_resume_storage.toLocaleString()}</span>
                          <span className="text-gray-600 dark:text-gray-400">Resume Storage</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Features Section */}
                {plan.features.length > 0 && (
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <Check className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <span className="text-gray-700 dark:text-gray-300 text-sm">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Empty state spacer when no features */}
                {plan.features.length === 0 && (
                  <div className="mb-8" />
                )}

                <Link
                  href={price ? "/signup" : "/contact"}
                  className={`block w-full h-12 rounded-lg font-medium text-center leading-[48px] transition-all ${
                    plan.popular
                      ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90"
                      : "border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  {price ? (plan.trialDays > 0 ? `Start ${plan.trialDays}-Day Trial` : "Get Started") : "Contact Sales"}
                </Link>
              </Card>
            );
          })}
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
