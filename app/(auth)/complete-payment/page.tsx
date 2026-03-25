'use client';

// MIRROR PAGE: This file and components/auth/SignUp.tsx share the same
// plan display logic (quota rendering, feature list, formatQuotaValue, etc.).
// Any changes made here must also be applied to SignUp.tsx and vice versa.

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CreditCard, AlertCircle, Loader2, CheckCircle, ShieldCheck, ArrowLeft, Check, Shield
} from 'lucide-react';
import { toast } from 'sonner';
import Cookies from 'js-cookie';
import { decodeParam, decodePlanId } from '@/lib/utils/planEncoder';
import { useRazorpay } from '@/lib/hooks/useRazorpay';
import { useTheme } from 'next-themes';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

interface PlanDetails {
  id: number;
  plan_name: string;
  plan_tier: string;
  description: string;
  base_price: number;
  monthly_price: number;
  currency: string;
  billing_period: string;
  included_seats: number;
  discount_percentage?: number;
  features?: { feature_name: string; is_enabled: boolean }[];
  quotas?: {
    max_seats?: number;
    max_jobs?: number;
    RS?: number;
    RU?: number;
    AS?: number;
    AIU?: number;
    api_rate_limit?: number;
  };
}

function CompletePaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Support both encoded (t, p) and legacy (tenant_id, plan_id) params
  const rawT = searchParams.get('t');
  const rawP = searchParams.get('p');
  const legacyTenantId = searchParams.get('tenant_id');
  const legacyPlanId = searchParams.get('plan_id');

  const tenantId = rawT ? decodeParam(rawT) : legacyTenantId;
  const planId = rawP ? decodePlanId(rawP) : legacyPlanId;
  const billingIntervalParam = searchParams.get('billing');

  // Get user info for audit logging (from localStorage if user was previously logged in)
  const getUserInfo = (): { user_id?: string; user_email?: string } => {
    try {
      const stored = localStorage.getItem('talentflow_user');
      if (stored) {
        const user = JSON.parse(stored);
        return { user_id: user.id, user_email: user.email };
      }
    } catch {
      // Ignore parse errors
    }
    return {};
  };

  const [billingInterval, setBillingInterval] = useState<'MONTHLY' | 'ANNUAL'>(
    billingIntervalParam === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY'
  );
  const [planDetails, setPlanDetails] = useState<PlanDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [paymentStep, setPaymentStep] = useState<string>('');
  const { openCheckout, isProcessing: razorpayProcessing } = useRazorpay();

  // Fetch plan details
  useEffect(() => {
    const fetchPlanDetails = async () => {
      if (!planId) {
        setError('No plan specified');
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/subscription/public/plans`);
        if (response.ok) {
          const result = await response.json();
          const plansArray = result.data?.plans || result.plans || [];

          // Find the plan with matching ID
          const parsedPlanId = parseInt(planId);
          for (const groupedPlan of plansArray) {
            const monthly = groupedPlan.billing_options?.monthly;
            const annual = groupedPlan.billing_options?.annual;

            if (monthly?.id === parsedPlanId || annual?.id === parsedPlanId) {
              // Detect billing interval from which variant matches the plan_id
              const isAnnualPlan = annual?.id === parsedPlanId;
              const detectedInterval = isAnnualPlan ? 'ANNUAL' : 'MONTHLY';

              // Update billing interval to match the actual plan
              if (detectedInterval !== billingInterval) {
                setBillingInterval(detectedInterval);
              }

              // Use the variant that matches the plan_id directly
              const planVariant = isAnnualPlan ? annual : monthly;
              if (planVariant) {
                setPlanDetails({
                  id: planVariant.id,
                  plan_name: groupedPlan.plan_name,
                  plan_tier: groupedPlan.plan_tier,
                  description: groupedPlan.description,
                  base_price: planVariant.base_price,
                  monthly_price: planVariant.monthly_price,
                  currency: planVariant.currency,
                  billing_period: planVariant.billing_period,
                  included_seats: planVariant.included_seats,
                  discount_percentage: (groupedPlan as any).discount_percentage ?? planVariant.discount_percentage,
                  features: planVariant.features,
                  quotas: planVariant.quotas,
                });
              }
              break;
            }
          }
        }
      } catch (err) {
        console.error('Error fetching plan details:', err);
        setError('Failed to load plan details');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlanDetails();
  }, [planId]);

  // Handle payment submission via Razorpay
  const handlePaymentSubmit = async () => {
    if (!tenantId || !planDetails) {
      setError('Missing tenant or plan information');
      return;
    }

    setPaymentProcessing(true);
    setError('');

    try {
      // Step 1: Create Razorpay order
      setPaymentStep('Creating order...');
      const orderResponse = await fetch(`${API_URL}/signup/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          plan_id: planDetails.id,
          billing_interval: billingInterval,
        }),
      });

      const orderData = await orderResponse.json();
      if (!orderResponse.ok) {
        throw new Error(orderData.detail || 'Failed to create payment order');
      }

      // Step 2: Open Razorpay checkout modal
      setPaymentStep('Opening payment gateway...');
      const userInfo = getUserInfo();
      let razorpayResult: RazorpayResponse;
      try {
        razorpayResult = await openCheckout({
          orderId: orderData.order_id,
          amount: orderData.amount,
          currency: orderData.currency,
          planName: orderData.plan_name || planDetails.plan_name,
          userName: userInfo.user_email?.split('@')[0],
          userEmail: userInfo.user_email,
        });
      } catch (rzpErr: any) {
        // User cancelled or payment failed in modal
        if (rzpErr.message?.includes('cancelled')) {
          toast.info('Payment cancelled', { description: 'You can try again anytime.' });
        } else {
          toast.error('Payment failed', { description: rzpErr.message });
        }
        setPaymentProcessing(false);
        setPaymentStep('');
        return;
      }

      // Step 3: Verify payment with backend
      setPaymentStep('Verifying payment...');
      const response = await fetch(`${API_URL}/signup/process-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: tenantId,
          plan_id: planDetails.id,
          billing_interval: billingInterval,
          payment_method: 'razorpay',
          razorpay_payment_id: razorpayResult.razorpay_payment_id,
          razorpay_order_id: razorpayResult.razorpay_order_id,
          razorpay_signature: razorpayResult.razorpay_signature,
          ...userInfo,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.detail || 'Payment verification failed');
      }

      // Payment successful
      toast.success('Payment successful!', { description: 'Your plan is now active.' });

      // Queue audit verification (non-blocking)
      try {
        const mod = await import('@/lib/services/auditVerificationService');
        mod.auditVerificationService.storePendingVerification({
          action: 'subscription_upgrade',
          entity_type: 'subscription',
          entity_id: String(planDetails.id),
          user_id: userInfo.user_id,
          user_email: userInfo.user_email,
          timestamp: new Date().toISOString(),
        });
      } catch (e) { console.warn('[AuditVerification] Failed to queue:', e); }

      // Redirect to login
      setTimeout(() => {
        router.push('/login');
      }, 2000);

    } catch (err: any) {
      console.error('Payment error:', err);
      const rawMessage = err.message || '';
      // Strip technical/internal error details — only show user-friendly messages
      const isTechnical = /sqlalchemy|asyncpg|psycopg|traceback|exception|relation|column|syntax|sql:|programming|integrity|undefined|stacktrace/i.test(rawMessage);
      const message = isTechnical || !rawMessage
        ? 'Payment processing failed. Please try again or contact support if the issue persists.'
        : rawMessage;
      setError(message);
      toast.error('Payment failed', { description: message });
    } finally {
      setPaymentProcessing(false);
      setPaymentStep('');
    }
  };

  const GST_RATE = 0.18;

  // Format currency with up to 2 decimal places (trims trailing zeros)
  const formatCurrency = (amount: number, currency: string): string => {
    const currencySymbols: Record<string, string> = {
      'USD': '$',
      'INR': '\u20B9',
      'EUR': '\u20AC',
      'GBP': '\u00A3',
    };
    const symbol = currencySymbols[currency] || currency + ' ';
    const formatted = amount % 1 === 0
      ? amount.toLocaleString()
      : amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return `${symbol}${formatted}`;
  };

  // Helper to get quota label
  const getQuotaLabel = (key: string): string => {
    const labels: Record<string, string> = {
      max_seats: 'Max Users',
      max_jobs: 'Max Jobs',
      RS: 'Resume Scores',
      RU: 'Resume Storage',
      AS: 'Assessments',
      AIU: 'AI Interviews',
      api_rate_limit: 'API Rate Limit',
    };
    return labels[key] || key;
  };

  // Helper to format quota value
  const formatQuotaValue = (key: string, value: number | string | undefined): string => {
    if (value === undefined || value === null) return 'Unlimited';
    if (value === -1) return 'Unlimited';
    if (typeof value === 'string' && value.toLowerCase() === 'unlimited') return 'Unlimited';
    return Number(value).toLocaleString();
  };

  // --- Styles (matching SignUp.tsx payment step) ---
  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: isDark
      ? 'linear-gradient(135deg, #111827 0%, #1F2937 50%, #1E1B4B 100%)'
      : 'linear-gradient(135deg, #F8FAFC 0%, #EEF2FF 50%, #E0E7FF 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    position: 'relative',
    overflow: 'hidden',
  };

  const formCardStyle: React.CSSProperties = {
    backgroundColor: isDark ? '#1F2937' : '#ffffff',
    borderRadius: '24px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
    padding: '40px',
    border: `1px solid ${isDark ? '#374151' : '#F3F4F6'}`,
  };

  const submitButtonStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 24px',
    background: 'linear-gradient(to right, #2563EB, #4338CA)',
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: 500,
    borderRadius: '12px',
    border: 'none',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    boxShadow: '0 10px 40px rgba(37, 99, 235, 0.3)',
    transition: 'all 0.2s',
  };

  // Loading state
  if (isLoading) {
    return (
      <div style={containerStyle}>
        <div style={formCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: isDark ? '#9CA3AF' : '#6B7280' }}>
            <Loader2 style={{ width: 24, height: 24, animation: 'spin 1s linear infinite' }} />
            <span>Loading plan details...</span>
          </div>
        </div>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Error state - no tenant or plan
  if (!tenantId || !planDetails) {
    return (
      <div style={containerStyle}>
        <div style={formCardStyle}>
          <div style={{ textAlign: 'center' }}>
            <AlertCircle style={{ width: 48, height: 48, color: '#DC2626', margin: '0 auto 16px' }} />
            <h2 style={{ fontSize: 24, fontWeight: 700, color: isDark ? '#F9FAFB' : '#111827', marginBottom: 8 }}>
              {error || 'Invalid Payment Link'}
            </h2>
            <p style={{ color: isDark ? '#9CA3AF' : '#6B7280', marginBottom: 24 }}>
              This payment link is invalid or has expired. Please try signing up again.
            </p>
            <button
              onClick={() => router.push('/signup')}
              style={{
                ...submitButtonStyle,
                background: '#6B7280',
              }}
            >
              <ArrowLeft style={{ width: 20, height: 20 }} />
              Back to Sign Up
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {/* Background Blobs */}
      <div style={{ position: 'absolute', top: 80, left: 40, width: 288, height: 288, backgroundColor: '#93C5FD', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.3 }}></div>
      <div style={{ position: 'absolute', top: 160, right: 40, width: 288, height: 288, backgroundColor: '#C4B5FD', borderRadius: '50%', filter: 'blur(60px)', opacity: 0.3 }}></div>

      <div style={{ ...formCardStyle, maxWidth: 600, margin: '0 auto', position: 'relative', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 48, height: 48, background: 'linear-gradient(135deg, #2563EB, #4338CA)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CreditCard style={{ width: 24, height: 24, color: '#ffffff' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: isDark ? '#F9FAFB' : '#111827', marginBottom: 4 }}>Complete Your Purchase</h2>
            <p style={{ color: isDark ? '#9CA3AF' : '#6B7280', fontSize: 14 }}>Your account is ready. Complete payment to activate your plan.</p>
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: 24, padding: 16, backgroundColor: isDark ? 'rgba(239,68,68,0.15)' : '#FEF2F2', border: `1px solid ${isDark ? 'rgba(239,68,68,0.3)' : '#FECACA'}`, borderRadius: 12, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <AlertCircle style={{ width: 20, height: 20, color: '#DC2626', flexShrink: 0 }} />
            <span style={{ fontSize: 14, color: isDark ? '#FCA5A5' : '#991B1B' }}>{error}</span>
          </div>
        )}

        {/* Plan Summary Card */}
        <div style={{ backgroundColor: isDark ? '#374151' : '#F9FAFB', borderRadius: 16, padding: 24, marginBottom: 24, border: `1px solid ${isDark ? '#374151' : '#E5E7EB'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 600, color: isDark ? '#F9FAFB' : '#111827' }}>{planDetails.plan_name}</span>
                <span style={{ backgroundColor: isDark ? 'rgba(37,99,235,0.15)' : '#DBEAFE', color: isDark ? '#93C5FD' : '#1D4ED8', fontSize: 12, fontWeight: 500, padding: '2px 8px', borderRadius: 12 }}>
                  {planDetails.plan_tier}
                </span>
              </div>
              <p style={{ color: isDark ? '#9CA3AF' : '#6B7280', fontSize: 14 }}>{planDetails.description}</p>
            </div>
          </div>

          {/* Price Display */}
          {(() => {
            const gstAmount = Math.round(planDetails.base_price * GST_RATE * 100) / 100;
            const totalAmount = Math.round((planDetails.base_price + gstAmount) * 100) / 100;
            return (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 0', borderTop: `1px solid ${isDark ? '#374151' : '#E5E7EB'}` }}>
                  <div>
                    <span style={{ fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280' }}>Billing:</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: isDark ? '#F9FAFB' : '#111827', marginLeft: 8 }}>
                      {billingInterval === 'ANNUAL' ? 'Annual' : 'Monthly'}
                    </span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: 32, fontWeight: 700, color: isDark ? '#F9FAFB' : '#111827' }}>
                      {formatCurrency(planDetails.base_price, planDetails.currency)}
                    </span>
                    <span style={{ fontSize: 14, color: isDark ? '#9CA3AF' : '#6B7280', marginLeft: 4 }}>
                      /{billingInterval === 'ANNUAL' ? 'year' : 'month'}
                    </span>
                    {/* Strikethrough price and Save badge for annual plans */}
                    {billingInterval === 'ANNUAL' && planDetails.monthly_price && (planDetails.monthly_price * 12) > planDetails.base_price && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
                        <span style={{ fontSize: 14, color: '#9CA3AF', textDecoration: 'line-through' }}>
                          {formatCurrency(planDetails.monthly_price * 12, planDetails.currency)}
                        </span>
                        {planDetails.discount_percentage && planDetails.discount_percentage > 0 && (
                          <span style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            fontSize: 12,
                            fontWeight: 600,
                            backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : '#DCFCE7',
                            color: '#15803D',
                            borderRadius: 12
                          }}>
                            Save {Math.round(planDetails.discount_percentage)}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* GST & Total Breakdown */}
                <div style={{ padding: '12px 0', borderTop: `1px solid ${isDark ? '#374151' : '#E5E7EB'}`, borderBottom: `1px solid ${isDark ? '#374151' : '#E5E7EB'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: isDark ? '#9CA3AF' : '#6B7280' }}>Subtotal</span>
                    <span style={{ fontSize: 13, color: isDark ? '#D1D5DB' : '#374151' }}>{formatCurrency(planDetails.base_price, planDetails.currency)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, color: isDark ? '#9CA3AF' : '#6B7280' }}>GST (18%)</span>
                    <span style={{ fontSize: 13, color: isDark ? '#D1D5DB' : '#374151' }}>{formatCurrency(gstAmount, planDetails.currency)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: `1px dashed ${isDark ? '#374151' : '#E5E7EB'}` }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: isDark ? '#F9FAFB' : '#111827' }}>Total</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: isDark ? '#F9FAFB' : '#111827' }}>{formatCurrency(totalAmount, planDetails.currency)}</span>
                  </div>
                </div>
              </>
            );
          })()}

          {/* Included Seats */}
          {planDetails.included_seats && (
            <div style={{ marginTop: 12, padding: 12, backgroundColor: isDark ? 'rgba(67,56,202,0.2)' : '#EEF2FF', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, color: '#4338CA', fontWeight: 500 }}>Included Team Seats</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#4338CA' }}>{planDetails.included_seats}</span>
            </div>
          )}
        </div>

        {/* Plan Quotas */}
        {planDetails.quotas && Object.keys(planDetails.quotas).length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, color: isDark ? '#D1D5DB' : '#374151', marginBottom: 12 }}>Plan Quotas:</h4>
            <div style={{ backgroundColor: isDark ? '#374151' : '#F9FAFB', borderRadius: 12, padding: 16, border: `1px solid ${isDark ? '#374151' : '#E5E7EB'}` }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {Object.entries(planDetails.quotas)
                  .filter(([key, value]) => !['storage_gb', 'support_level', 'api_rate_limit'].includes(key) && value !== 0 && value !== null && value !== undefined)
                  .map(([key, value]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', backgroundColor: isDark ? '#1F2937' : '#ffffff', borderRadius: 8, border: `1px solid ${isDark ? '#374151' : '#E5E7EB'}` }}>
                    <span style={{ fontSize: 13, color: isDark ? '#9CA3AF' : '#6B7280' }}>{getQuotaLabel(key)}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: isDark ? '#F9FAFB' : '#111827' }}>{formatQuotaValue(key, value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Features List */}
        {planDetails.features && planDetails.features.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, color: isDark ? '#D1D5DB' : '#374151', marginBottom: 12 }}>Included Features:</h4>
            <div style={{ backgroundColor: isDark ? '#374151' : '#F9FAFB', borderRadius: 12, padding: 16, border: `1px solid ${isDark ? '#374151' : '#E5E7EB'}` }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {planDetails.features
                  .filter(f => f.is_enabled)
                  .map((feature, index) => (
                    <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                      <Check style={{ width: 16, height: 16, color: '#10B981', flexShrink: 0 }} />
                      <span style={{ fontSize: 13, color: isDark ? '#9CA3AF' : '#4B5563' }}>{feature.feature_name}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* Account Status */}
        <div style={{ backgroundColor: isDark ? 'rgba(16,185,129,0.15)' : '#F0FDF4', borderRadius: 12, padding: 16, marginBottom: 24, border: `1px solid ${isDark ? 'rgba(16,185,129,0.3)' : '#BBF7D0'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle style={{ width: 18, height: 18, color: '#16A34A' }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#166534' }}>Account Created — Payment Pending</span>
          </div>
          <p style={{ fontSize: 13, color: '#166534', marginTop: 8 }}>
            Your account has been set up. Complete payment below to activate your plan and start using TalentFlow.
          </p>
        </div>

        {/* Complete Purchase Button */}
        <button
          onClick={handlePaymentSubmit}
          disabled={paymentProcessing || razorpayProcessing}
          style={{
            ...submitButtonStyle,
            opacity: (paymentProcessing || razorpayProcessing) ? 0.7 : 1,
            cursor: (paymentProcessing || razorpayProcessing) ? 'not-allowed' : 'pointer',
          }}
        >
          {paymentProcessing || razorpayProcessing ? (
            <>
              <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite' }} />
              {paymentStep || 'Processing Payment...'}
            </>
          ) : (
            <>
              <CreditCard style={{ width: 20, height: 20 }} />
              Pay {formatCurrency(Math.round((planDetails.base_price * (1 + GST_RATE)) * 100) / 100, planDetails.currency)} - Razorpay
            </>
          )}
        </button>

        {/* Payment Methods Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 12, fontSize: 12, color: '#9CA3AF' }}>
          <span>Card</span>
          <span style={{ color: isDark ? '#374151' : '#D1D5DB' }}>|</span>
          <span>UPI</span>
          <span style={{ color: isDark ? '#374151' : '#D1D5DB' }}>|</span>
          <span>Netbanking</span>
          <span style={{ color: isDark ? '#374151' : '#D1D5DB' }}>|</span>
          <span>Wallets</span>
        </div>

        {/* Security Notice */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, color: isDark ? '#9CA3AF' : '#6B7280', fontSize: 13 }}>
          <Shield style={{ width: 16, height: 16 }} />
          <span>Secure payment via Razorpay</span>
        </div>

        {/* Logout and Back to Login */}
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${isDark ? '#374151' : '#E5E7EB'}`, textAlign: 'center' }}>
          <a
            href="/login"
            onClick={() => {
              localStorage.removeItem('accessToken');
              localStorage.removeItem('refreshToken');
              localStorage.removeItem('token');
              localStorage.removeItem('user');
              localStorage.removeItem('tenant');
              Cookies.remove('accessToken');
              Cookies.remove('refreshToken');
              Cookies.remove('token');
              sessionStorage.clear();
            }}
            style={{ color: '#2563EB', fontSize: 14, textDecoration: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <ArrowLeft style={{ width: 16, height: 16 }} />
            Logout & Back to Login
          </a>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Loading fallback for Suspense
function LoadingFallback() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  return (
    <div style={{
      minHeight: '100vh',
      background: isDark
        ? 'linear-gradient(135deg, #111827 0%, #1F2937 50%, #1E1B4B 100%)'
        : 'linear-gradient(135deg, #F8FAFC 0%, #EEF2FF 50%, #E0E7FF 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        backgroundColor: isDark ? '#1F2937' : '#ffffff',
        borderRadius: '24px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
        padding: '40px',
        border: `1px solid ${isDark ? '#374151' : '#F3F4F6'}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: isDark ? '#9CA3AF' : '#6B7280' }}>
          <Loader2 style={{ width: 24, height: 24, animation: 'spin 1s linear infinite' }} />
          <span>Loading...</span>
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Default export with Suspense wrapper
export default function CompletePaymentPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <CompletePaymentContent />
    </Suspense>
  );
}
