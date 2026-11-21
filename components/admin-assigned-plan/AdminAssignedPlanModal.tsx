'use client';

import { useMemo, useState } from 'react';
import { Sparkles, X, CreditCard, Loader2, AlertCircle, CheckCircle2, Zap, CalendarClock, Package } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminAssignedPlan } from '@/components/providers/AdminAssignedPlanProvider';
import { useAuth } from '@/components/providers/AuthProvider';
import { useRazorpay } from '@/lib/hooks/useRazorpay';
import { adminAssignedPlanService, type ApplyMode } from '@/lib/services/adminAssignedPlanService';
import { ModalA11y } from '@/components/ui/modal-a11y';
import { IconButton } from '@/components/ui/icon-button';

const GST_RATE = 0.18;

function formatINR(amount: number): string {
  const trimmed = amount % 1 === 0
    ? amount.toLocaleString('en-IN')
    : amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `₹${trimmed}`;
}

const QUOTA_LABELS: Record<string, string> = {
  RU: 'Resume Storage',
  RS: 'Resume Scoring',
  AS: 'Assessments',
  AIU: 'AI Interviews',
  max_seats: 'Team Seats',
  max_jobs: 'Job Postings',
  storage_gb: 'Storage (GB)',
  api_rate_limit: 'API Rate Limit',
  support_level: 'Support',
};

function formatQuotaValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (value === -1 || value === 'unlimited' || value === 'Unlimited') return 'Unlimited';
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
}

export default function AdminAssignedPlanModal() {
  const { showPaymentModal, closePaymentModal, pendingPlan, clearAfterPayment, refresh } = useAdminAssignedPlan();
  const { user } = useAuth();
  const { openCheckout } = useRazorpay();

  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentStep, setPaymentStep] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [applyMode, setApplyMode] = useState<ApplyMode>('immediate');

  // Queueing only makes sense when there's an active paid plan to queue behind
  const currentPlanInfo = pendingPlan?.current_plan;
  const canQueue = Boolean(currentPlanInfo?.has_active_paid_plan);
  const currentPlanEndDate = currentPlanInfo?.plan_end_date ?? null;

  // When there's no active paid plan, force immediate regardless of state
  const effectiveApplyMode: ApplyMode = canQueue ? applyMode : 'immediate';

  const formattedExpiry = useMemo(() => {
    if (!currentPlanEndDate) return null;
    try {
      return new Date(currentPlanEndDate).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
      });
    } catch {
      return currentPlanEndDate;
    }
  }, [currentPlanEndDate]);

  if (!showPaymentModal || !pendingPlan) return null;

  const planId = pendingPlan.new_plan_id ?? pendingPlan.plan_id;
  const planName = pendingPlan.new_plan_name || pendingPlan.plan_name || 'Your new plan';
  const billingInterval = (pendingPlan.billing_interval || 'MONTHLY').toUpperCase();
  const tierLabel = pendingPlan.plan_tier ? pendingPlan.plan_tier.toUpperCase() : null;

  // CP's payment_amount on the pending record is the tax-inclusive total; reverse
  // out the base + GST for the breakdown. If amount is missing (older CP shape),
  // the order endpoint we hit below will return canonical numbers anyway.
  const previewTotal = Number(pendingPlan.payment_amount ?? 0);
  const previewBase = previewTotal > 0 ? Math.round((previewTotal / (1 + GST_RATE)) * 100) / 100 : 0;
  const previewGst = previewTotal > 0 ? Math.round((previewTotal - previewBase) * 100) / 100 : 0;

  const handlePay = async () => {
    if (!planId || !user?.tenantId) {
      setError('Missing plan or tenant information. Please refresh and try again.');
      return;
    }

    setError('');
    setPaymentProcessing(true);

    try {
      // 1. Create Razorpay order via the admin-assigned-plan-specific endpoint
      //    (it reads price + plan from CP's /plan-queue/pending, since the
      //    plan isn't exposed via /public/plans).
      setPaymentStep('Preparing payment...');
      const order = await adminAssignedPlanService.createOrder();

      // 2. Open Razorpay checkout
      setPaymentStep('Opening payment gateway...');
      const rzpResult = await openCheckout({
        orderId: order.order_id,
        amount: order.amount,
        currency: order.currency,
        planName: order.plan_name || planName,
        userName: user.email?.split('@')[0],
        userEmail: user.email,
      });

      // 3. Verify + activate (or queue) via DP's admin-assigned-payment endpoint
      setPaymentStep(effectiveApplyMode === 'immediate' ? 'Activating your plan...' : 'Queueing your plan...');
      const result = await adminAssignedPlanService.completePayment({
        plan_id: planId,
        billing_interval: billingInterval,
        razorpay_payment_id: rzpResult.razorpay_payment_id,
        razorpay_order_id: rzpResult.razorpay_order_id,
        razorpay_signature: rzpResult.razorpay_signature,
        apply_mode: effectiveApplyMode,
      });

      if (result.data.apply_mode === 'on_expiry') {
        const when = result.data.scheduled_apply_date || formattedExpiry || 'when your current plan expires';
        toast.success('Payment received', {
          description: `${planName} is queued to activate on ${when}.`,
        });
      } else {
        toast.success('Plan activated!', {
          description: `${planName} is now live for your team.`,
        });
      }
      clearAfterPayment();

      // Refresh dependent contexts that read plan/quota state
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('planChanged'));
      }
      // Schedule a refresh to confirm the pending entry has cleared on CP
      setTimeout(() => { refresh().catch(() => {}); }, 1500);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      // An earlier plan payment is still being applied: nothing was charged.
      if (err?.response?.status === 409 && detail?.error === 'PLAN_CHANGE_IN_PROGRESS') {
        setError(detail.message);
        toast.warning('A plan change is already in progress', { description: detail.message, duration: 10000 });
        return;
      }
      const rawMessage = (typeof detail === 'string' ? detail : detail?.message) || err?.message || '';
      const cancelled = typeof rawMessage === 'string' && rawMessage.toLowerCase().includes('cancelled');
      if (cancelled) {
        toast.info('Payment cancelled', { description: 'You can try again anytime.' });
      } else {
        const isTechnical = /sqlalchemy|asyncpg|psycopg|traceback|exception|relation|column|syntax|programming|integrity|stacktrace/i
          .test(String(rawMessage));
        const friendly = isTechnical || !rawMessage
          ? 'Payment processing failed. Please try again or contact support if the issue persists.'
          : String(rawMessage);
        setError(friendly);
        toast.error('Payment failed', { description: friendly });
      }
    } finally {
      setPaymentProcessing(false);
      setPaymentStep('');
    }
  };

  return (
    <ModalA11y><div className="fixed inset-0 z-[88] flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-[95vw] sm:max-w-2xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Plan Assigned by Admin</h2>
              <p className="text-indigo-100 text-sm">Complete payment to activate your new plan</p>
            </div>
          </div>
          <IconButton bare label="Close"
            onClick={closePaymentModal}
            disabled={paymentProcessing}
            className="p-2 rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5 text-white" />
          </IconButton>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive-subtle border border-destructive-line">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-destructive-strong">{error}</p>
            </div>
          )}

          {/* Plan summary */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-5">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xl font-bold text-gray-900">{planName}</span>
                  {tierLabel && (
                    <span className="tf-badge bg-indigo-100 text-indigo-700">
                      {tierLabel}
                    </span>
                  )}
                </div>
                <p className="tf-body-muted">
                  Billing: <span className="font-medium text-gray-700">{billingInterval === 'ANNUAL' ? 'Annual' : 'Monthly'}</span>
                </p>
              </div>
            </div>

            {previewTotal > 0 && (
              <div className="space-y-2 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Plan price</span>
                  <span className="text-gray-900">{formatINR(previewBase)}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">GST (18%)</span>
                  <span className="text-gray-900">{formatINR(previewGst)}</span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                  <span className="tf-section-title">Total</span>
                  <span className="tf-section-title">{formatINR(previewTotal)}</span>
                </div>
              </div>
            )}

            {pendingPlan.plan_description && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="tf-body">{pendingPlan.plan_description}</p>
              </div>
            )}

            {pendingPlan.notes && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="tf-eyebrow tracking-wide mb-1">Admin note</p>
                <p className="tf-body">{pendingPlan.notes}</p>
              </div>
            )}
          </div>

          {/* Quotas — what the tenant gets with this plan */}
          {pendingPlan.plan_quotas && Object.keys(pendingPlan.plan_quotas).length > 0 && (
            <div className="tf-panel p-4">
              <div className="flex items-center gap-2 mb-3">
                <Package className="w-4 h-4 text-indigo-600" />
                <p className="tf-row-title">What&rsquo;s included</p>
              </div>
              <div className="tf-grid-2">
                {Object.entries(pendingPlan.plan_quotas)
                  .filter(([, value]) => value !== null && value !== undefined && value !== '')
                  .map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 last:border-0 sm:border-0"
                    >
                      <span className="text-gray-600">{QUOTA_LABELS[key] || key}</span>
                      <span className="font-medium text-gray-900">{formatQuotaValue(value)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Apply-mode choice — only shown when there's an active paid plan to queue against */}
          {canQueue && (
            <div className="space-y-2">
              <p className="tf-row-title">When should this take effect?</p>

              <label
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  applyMode === 'immediate'
                    ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-200'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="apply-mode"
                  value="immediate"
                  checked={applyMode === 'immediate'}
                  onChange={() => setApplyMode('immediate')}
                  disabled={paymentProcessing}
                  className="mt-1 accent-indigo-600"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-indigo-600" />
                    <span className="tf-row-name">Apply now (override current plan)</span>
                  </div>
                  <p className="tf-meta mt-1">
                    {currentPlanInfo?.current_plan_name ? (
                      <>
                        Replaces <span className="font-medium">{currentPlanInfo.current_plan_name}</span> immediately.
                        Any time remaining on it is forfeited.
                      </>
                    ) : (
                      <>Activates the new plan immediately.</>
                    )}
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  applyMode === 'on_expiry'
                    ? 'border-indigo-500 bg-indigo-50/60 ring-1 ring-indigo-200'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="apply-mode"
                  value="on_expiry"
                  checked={applyMode === 'on_expiry'}
                  onChange={() => setApplyMode('on_expiry')}
                  disabled={paymentProcessing}
                  className="mt-1 accent-indigo-600"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-indigo-600" />
                    <span className="tf-row-name">
                      Apply when current plan expires
                      {formattedExpiry && <> ({formattedExpiry})</>}
                    </span>
                  </div>
                  <p className="tf-meta mt-1">
                    Payment is captured now. The new plan activates automatically on the expiry date so you don&rsquo;t lose any remaining time.
                  </p>
                </div>
              </label>
            </div>
          )}

          {/* Reassurance copy */}
          <div className="flex items-start gap-2 tf-meta">
            <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
            <span>
              {effectiveApplyMode === 'immediate'
                ? 'You will continue on your current plan until payment is confirmed. Activation is instant after a successful payment.'
                : 'Payment is captured now. Your current plan keeps running until it expires, then the new plan activates automatically.'}
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex items-center gap-3 shrink-0">
          <button
            onClick={handlePay}
            disabled={paymentProcessing || !planId}
            className="flex-1 px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg font-medium hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {paymentProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {paymentStep || 'Processing...'}
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4" />
                {effectiveApplyMode === 'immediate' ? 'Pay & Activate Now' : 'Pay & Queue for Activation'}
              </>
            )}
          </button>
          <button
            onClick={closePaymentModal}
            disabled={paymentProcessing}
            className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors border border-gray-300 disabled:opacity-50"
          >
            Later
          </button>
        </div>
      </div>
    </div></ModalA11y>
  );
}
