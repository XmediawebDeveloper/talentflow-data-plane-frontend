/**
 * Local storage cache for EXPIRED plan details ONLY
 *
 * Purpose: When subscription is expired and Control Plane API fails,
 * show the user their previous plan details so they can renew/upgrade.
 *
 * For ACTIVE subscriptions, Control Plane is the ONLY source of truth.
 */

interface ExpiredPlanData {
  plan_name: string;
  plan_id?: number;
  plan_tier?: string;
  subscription_status: 'expired';
  plan_expiry_date?: string;
  plan_start_date?: string;
  quotas?: {
    RS?: number;
    AS?: number;
    AIU?: number;
    RU?: number;
    max_seats?: number;
    max_jobs?: number;
    storage_gb?: number;
  };
  plan_info?: any;
  cached_at: string;
}

const EXPIRED_PLAN_CACHE_KEY = 'talentflow_expired_plan';

/**
 * Cache expired plan details for future display
 * ONLY call this when subscription_status === 'expired'
 */
export function cacheExpiredPlan(planData: any): void {
  // Safety check: Only cache if explicitly expired
  if (planData?.subscription_status !== 'expired') {
    console.warn('[ExpiredPlanCache] Attempted to cache non-expired plan. Ignoring.');
    return;
  }

  try {
    const cacheData: ExpiredPlanData = {
      plan_name: planData.plan_name || planData.current_plan_name || 'Unknown Plan',
      plan_id: planData.plan_id || planData.current_plan_id,
      plan_tier: planData.plan_tier || planData.plan_info?.plan_tier,
      subscription_status: 'expired',
      plan_expiry_date: planData.plan_expiry_date || planData.plan_info?.plan_expiry_date,
      plan_start_date: planData.plan_start_date || planData.plan_info?.plan_start_date,
      quotas: planData.quotas || {
        RS: planData.max_resume_searches,
        AS: planData.max_assessments,
        AIU: planData.max_ai_interviews,
        RU: planData.max_resume_uploads,
        max_seats: planData.max_seats,
        max_jobs: planData.max_jobs,
        storage_gb: planData.storage_limit_gb,
      },
      plan_info: planData.plan_info,
      cached_at: new Date().toISOString(),
    };

    localStorage.setItem(EXPIRED_PLAN_CACHE_KEY, JSON.stringify(cacheData));
    console.log('[ExpiredPlanCache] Cached expired plan details:', cacheData.plan_name);
  } catch (error) {
    console.error('[ExpiredPlanCache] Failed to cache:', error);
  }
}

/**
 * Retrieve cached expired plan details
 * Use this as fallback when Control Plane API fails for expired subscription
 */
export function getCachedExpiredPlan(): ExpiredPlanData | null {
  try {
    const cached = localStorage.getItem(EXPIRED_PLAN_CACHE_KEY);
    if (!cached) return null;

    const data: ExpiredPlanData = JSON.parse(cached);

    // Verify it's actually expired status
    if (data.subscription_status !== 'expired') {
      console.warn('[ExpiredPlanCache] Cached data is not expired status. Clearing.');
      clearExpiredPlanCache();
      return null;
    }

    console.log('[ExpiredPlanCache] Retrieved cached expired plan:', data.plan_name);
    return data;
  } catch (error) {
    console.error('[ExpiredPlanCache] Failed to retrieve cache:', error);
    return null;
  }
}

/**
 * Clear expired plan cache
 * Call this when:
 * - User successfully renews/upgrades (subscription becomes active)
 * - User logs out
 */
export function clearExpiredPlanCache(): void {
  localStorage.removeItem(EXPIRED_PLAN_CACHE_KEY);
  console.log('[ExpiredPlanCache] Cleared');
}

/**
 * Check if expired plan cache exists
 */
export function hasExpiredPlanCache(): boolean {
  return localStorage.getItem(EXPIRED_PLAN_CACHE_KEY) !== null;
}
