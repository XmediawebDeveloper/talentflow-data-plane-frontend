import api from './api';

/**
 * Admin-Assigned Plan Service
 *
 * Surfaces plans pre-assigned to the tenant by a CP super-admin, and
 * handles completing payment for them via the dedicated DP endpoint
 * that routes activation to CP's idempotent /tenants/{id}/activate-plan
 * (instead of /plan-queue/upgrade, which CP now rejects for this flow).
 */

export interface AdminAssignedCurrentPlanInfo {
  has_active_paid_plan: boolean;
  current_plan_id: number | null;
  current_plan_name: string | null;
  plan_end_date: string | null;
}

export interface AdminAssignedPlan {
  // CP shapes the response off ScheduledPlanChange / pending Subscription,
  // so field names mirror the queue/pending payload. Treat everything as
  // optional except plan_id — the modal renders best-effort.
  source: 'admin_assigned';
  status?: string;
  new_plan_id?: number;
  plan_id?: number;
  new_plan_name?: string;
  plan_name?: string;
  plan_tier?: string;
  plan_description?: string;
  billing_interval?: string;
  payment_amount?: number;
  payment_currency?: string;
  invoice_number?: string;
  notes?: string;
  plan_quotas?: Record<string, unknown>;
  plan_features?: Record<string, unknown> | unknown[];
  created_at?: string;
  // Added by DP backend so the modal can offer "apply on expiry" only when
  // there's an active paid plan to queue behind.
  current_plan?: AdminAssignedCurrentPlanInfo;
}

export type ApplyMode = 'immediate' | 'on_expiry';

export interface CompletePaymentRequest {
  plan_id: number;
  billing_interval: string;
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
  schema_per_tenant?: boolean;
  database_per_tenant?: boolean;
  apply_mode: ApplyMode;
}

export interface CompletePaymentResponse {
  status: 'success';
  data: {
    apply_mode: ApplyMode;
    plan_id: number;
    plan_name?: string;
    plan_start_date?: string;
    plan_end_date?: string;
    scheduled_apply_date?: string;
    billing_interval: string;
    invoice_number?: string;
    message: string;
  };
}

export interface CreateOrderResponse {
  order_id: string;
  amount: number;
  currency: string;
  key_id: string;
  plan_name?: string;
  plan_id: number;
  base_amount: number;
  db_isolation_fee: number;
  subtotal: number;
  gst_amount: number;
  total_amount: number;
  gst_rate: number;
}

export const adminAssignedPlanService = {
  async getPendingPlan(): Promise<AdminAssignedPlan | null> {
    // Background poller — bound the wait so a hung connection surfaces as a
    // retryable timeout instead of an XHR that never settles.
    const response = await api.get('/subscription/admin-assigned-plan', { timeout: 15000 });
    return (response.data?.data as AdminAssignedPlan | null) ?? null;
  },

  async createOrder(): Promise<CreateOrderResponse> {
    // Admin-assigned plans aren't in /public/plans, so we use the dedicated
    // DP endpoint that reads price + plan from CP's /plan-queue/pending data.
    const response = await api.post('/subscription/admin-assigned-plan/create-order');
    return response.data;
  },

  async completePayment(payload: CompletePaymentRequest): Promise<CompletePaymentResponse> {
    const response = await api.post('/subscription/admin-assigned-plan/complete-payment', payload);
    return response.data;
  },
};

export default adminAssignedPlanService;
