import { encodePlanId } from "@/lib/utils/planEncoder";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

/** Quota payloads arrive under several names depending on the endpoint. */
interface RawQuotas {
  max_seats?: number | string;
  max_jobs?: number | string;
  RU?: number;
  RS?: number;
  AS?: number;
  AIU?: number;
  resume_uploads?: number;
  resume_storage?: number;
  resume_scoring?: number;
  assessments?: number;
  ai_interviews?: number;
  ai_interview?: number;
  total_resume_storage?: number;
  storage_gb?: number;
}

interface ApiBillingOption {
  id?: string | number;
  base_price?: number | null;
  currency?: string;
  is_active?: boolean;
  is_public?: boolean;
  is_featured?: boolean;
  discount_percentage?: number;
  trial_period_days?: number;
  quotas?: RawQuotas;
  features?: Array<{ feature_name: string; is_enabled?: boolean }>;
}

interface ApiPlan {
  plan_name: string;
  plan_slug?: string;
  plan_tier?: string;
  description?: string;
  trial_period_days?: number;
  discount_percentage?: number;
  billing_options?: { monthly?: ApiBillingOption; annual?: ApiBillingOption };
}

interface FreeTrialData {
  trial_days: number;
  quotas?: { MAX_SEATS?: number; MAX_JOBS?: number; STORAGE_GB?: number };
  features?: Array<{ feature_name: string; quota_key?: string; quota_limit?: number | null }>;
}

export interface MarketingPlan {
  id: string;
  name: string;
  description: string;
  tier?: string;
  isTrial: boolean;
  trialDays: number;
  currency: string;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  monthlyPlanId?: string;
  annualPlanId?: string;
  discountPercentage?: number;
  featured: boolean;
  features: string[];
  quotas?: RawQuotas;
  monthlyQuotas?: RawQuotas;
  annualQuotas?: RawQuotas;
}

const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", INR: "₹", EUR: "€", GBP: "£" };

export function formatCurrency(amount: number | null | undefined, currency: string): string {
  if (amount === null || amount === undefined) return "Contact sales";
  const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `;
  return `${symbol}${amount.toLocaleString()}`;
}

const TIER_ORDER: Record<string, number> = { STARTER: 0, PROFESSIONAL: 1, ENTERPRISE: 2 };

function buildTrialQuotas(trial: FreeTrialData): RawQuotas {
  const q = trial.quotas || {};
  const quotas: RawQuotas = {
    max_seats: q.MAX_SEATS,
    max_jobs: q.MAX_JOBS,
    total_resume_storage: typeof q.STORAGE_GB === "number" ? q.STORAGE_GB : undefined,
  };
  for (const feature of trial.features || []) {
    if (!feature.quota_key || feature.quota_limit === null) continue;
    if (feature.quota_key === "RU") quotas.RU = feature.quota_limit ?? undefined;
    if (feature.quota_key === "RS") quotas.RS = feature.quota_limit ?? undefined;
    if (feature.quota_key === "AS") quotas.AS = feature.quota_limit ?? undefined;
    if (feature.quota_key === "AIU") quotas.AIU = feature.quota_limit ?? undefined;
  }
  return quotas;
}

/**
 * The public plans plus the free-trial card, shaped and ordered exactly as the
 * pricing page shows them so the two pages can never disagree.
 */
export async function fetchMarketingPlans(
  signal?: AbortSignal
): Promise<{ plans: MarketingPlan[]; trialDays: number | null }> {
  const [plansResponse, trialResponse] = await Promise.all([
    fetch(`${API_URL}/subscription/public/plans`, { signal }),
    fetch(`${API_URL}/addons/free-trial`, { signal }).catch(() => null),
  ]);

  if (!plansResponse.ok) throw new Error(`Failed to fetch plans: ${plansResponse.status}`);

  const result = await plansResponse.json();
  const data = result.data || result;
  const list: ApiPlan[] = data?.plans || (Array.isArray(data) ? data : []);

  const paid = list
    .map((plan): MarketingPlan | null => {
      const monthly = plan.billing_options?.monthly;
      const annual = plan.billing_options?.annual;
      const base = monthly || annual;
      if (!base) return null;
      if (!monthly?.is_active && !annual?.is_active) return null;
      if (!monthly?.is_public && !annual?.is_public) return null;

      return {
        id: String(base.id ?? plan.plan_slug ?? plan.plan_name),
        name: plan.plan_name,
        description: plan.description || "",
        tier: plan.plan_tier,
        isTrial: false,
        trialDays: plan.trial_period_days || base.trial_period_days || 0,
        currency: base.currency || "INR",
        monthlyPrice: monthly?.base_price ?? null,
        yearlyPrice: annual?.base_price ?? null,
        monthlyPlanId: monthly?.id === undefined ? undefined : String(monthly.id),
        annualPlanId: annual?.id === undefined ? undefined : String(annual.id),
        discountPercentage: plan.discount_percentage ?? annual?.discount_percentage,
        featured: base.is_featured || false,
        features: (base.features || []).filter((f) => f.is_enabled).map((f) => f.feature_name),
        quotas: base.quotas,
        monthlyQuotas: monthly?.quotas,
        annualQuotas: annual?.quotas,
      };
    })
    .filter((plan): plan is MarketingPlan => plan !== null)
    .sort(
      (a, b) =>
        (TIER_ORDER[(a.tier || "").toUpperCase()] ?? 99) -
        (TIER_ORDER[(b.tier || "").toUpperCase()] ?? 99)
    );

  let trial: FreeTrialData | null = null;
  if (trialResponse && trialResponse.ok) {
    const trialResult = await trialResponse.json();
    const trialData = trialResult?.data || trialResult;
    if (trialData?.trial_days) trial = trialData as FreeTrialData;
  }

  const trialCard: MarketingPlan | null = trial
    ? {
        id: "free-trial",
        name: "Free Trial",
        description: `${trial.trial_days} ${trial.trial_days === 1 ? "day" : "days"} free • No credit card required`,
        isTrial: true,
        trialDays: trial.trial_days,
        currency: "INR",
        monthlyPrice: 0,
        yearlyPrice: 0,
        featured: false,
        features: (trial.features || []).map((f) => f.feature_name),
        quotas: buildTrialQuotas(trial),
      }
    : null;

  return {
    plans: trialCard ? [trialCard, ...paid] : paid,
    trialDays: trial?.trial_days ?? null,
  };
}

/** Which billing periods this plan actually sells. */
export function planAvailability(plan: MarketingPlan) {
  return {
    hasMonthly: !!plan.monthlyPlanId || plan.monthlyPrice !== null,
    hasAnnual: !!plan.annualPlanId || plan.yearlyPrice !== null,
  };
}

export interface PlanPrice {
  amount: string;
  period: string | null;
  wasAmount: string | null;
  savePercent: number | null;
  unavailableNote: string | null;
  contactSales: boolean;
}

export function planPrice(plan: MarketingPlan, isYearly: boolean): PlanPrice {
  const { hasMonthly, hasAnnual } = planAvailability(plan);

  if (plan.isTrial) {
    return {
      amount: "Free",
      period: `for ${plan.trialDays} ${plan.trialDays === 1 ? "day" : "days"}`,
      wasAmount: null,
      savePercent: null,
      unavailableNote: null,
      contactSales: false,
    };
  }

  if (plan.monthlyPrice === null && plan.yearlyPrice === null) {
    return {
      amount: "Contact sales",
      period: null,
      wasAmount: null,
      savePercent: null,
      unavailableNote: null,
      contactSales: true,
    };
  }

  const amount = isYearly
    ? plan.yearlyPrice ?? plan.monthlyPrice
    : plan.monthlyPrice ?? plan.yearlyPrice;
  const period = isYearly
    ? plan.yearlyPrice !== null
      ? "/year"
      : "/month"
    : plan.monthlyPrice !== null
      ? "/month"
      : "/year";

  const showsSaving =
    isYearly &&
    plan.monthlyPrice !== null &&
    plan.yearlyPrice !== null &&
    plan.monthlyPrice * 12 > plan.yearlyPrice;

  return {
    amount: formatCurrency(amount, plan.currency),
    period,
    wasAmount: showsSaving ? formatCurrency((plan.monthlyPrice as number) * 12, plan.currency) : null,
    savePercent:
      showsSaving && plan.discountPercentage && plan.discountPercentage > 0
        ? Math.round(plan.discountPercentage)
        : null,
    unavailableNote:
      isYearly && !hasAnnual
        ? "Yearly plan not available"
        : !isYearly && !hasMonthly
          ? "Monthly plan not available"
          : null,
    contactSales: false,
  };
}

/** Quota lines, using the same labels and cut-offs as the pricing page. */
export function planQuotaRows(
  plan: MarketingPlan,
  isYearly: boolean
): Array<{ label: string; value: string }> {
  const raw = plan.isTrial
    ? plan.quotas
    : (isYearly ? plan.annualQuotas : plan.monthlyQuotas) || plan.quotas;
  if (!raw) return [];

  const seats = raw.max_seats;
  const jobs = raw.max_jobs;
  const rows: Array<{ label: string; value: string }> = [];

  const countable = (value: number | string | undefined) =>
    value !== undefined &&
    value !== 0 &&
    (String(value).toLowerCase() === "unlimited" || Number(value) >= 1 || Number(value) === -1);

  const readable = (value: number | string) =>
    String(value).toLowerCase() === "unlimited" || Number(value) === -1
      ? "Unlimited"
      : Number(value).toLocaleString();

  if (countable(seats)) rows.push({ label: "Max users", value: readable(seats as number | string) });
  if (countable(jobs)) rows.push({ label: "Max jobs", value: readable(jobs as number | string) });

  const storage = raw.RU ?? raw.resume_uploads ?? raw.resume_storage;
  const scores = raw.RS ?? raw.resume_scoring;
  const assessments = raw.AS ?? raw.assessments;
  const interviews = raw.AIU ?? raw.ai_interviews ?? raw.ai_interview;

  if (storage !== undefined && storage >= 1)
    rows.push({ label: "Resume storage", value: storage.toLocaleString() });
  if (scores !== undefined && scores >= 1)
    rows.push({ label: "Resume scores", value: scores.toLocaleString() });
  if (assessments !== undefined && assessments >= 1)
    rows.push({ label: "Assessments", value: assessments.toLocaleString() });
  if (interviews !== undefined && interviews >= 1)
    rows.push({ label: "AI interviews", value: interviews.toLocaleString() });

  return rows;
}

/** Signup link for the selected billing period, matching the pricing page. */
export function planCheckoutHref(plan: MarketingPlan, isYearly: boolean): string {
  if (plan.isTrial) return "/signup?plan=free_trial";

  const { hasMonthly, hasAnnual } = planAvailability(plan);
  let planId = plan.id;
  let billing = isYearly ? "ANNUAL" : "MONTHLY";

  if (isYearly && hasAnnual && plan.annualPlanId) {
    planId = plan.annualPlanId;
    billing = "ANNUAL";
  } else if (!isYearly && hasMonthly && plan.monthlyPlanId) {
    planId = plan.monthlyPlanId;
    billing = "MONTHLY";
  } else if (hasAnnual && plan.annualPlanId) {
    planId = plan.annualPlanId;
    billing = "ANNUAL";
  } else if (hasMonthly && plan.monthlyPlanId) {
    planId = plan.monthlyPlanId;
    billing = "MONTHLY";
  }

  return `/signup?plan=${encodePlanId(planId)}&billing=${billing}`;
}
