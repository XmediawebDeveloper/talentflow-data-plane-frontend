'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CreditCard, AlertCircle, Loader2, CheckCircle, ShieldCheck, ArrowLeft, Check
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

interface PlanDetails {
  id: number;
  plan_name: string;
  plan_tier: string;
  description: string;
  base_price: number;
  currency: string;
  billing_period: string;
  features?: { feature_name: string; is_enabled: boolean }[];
}

function CompletePaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tenantId = searchParams.get('tenant_id');
  const planId = searchParams.get('plan_id');
  const billingIntervalParam = searchParams.get('billing');

  const [billingInterval, setBillingInterval] = useState<'MONTHLY' | 'ANNUAL'>(
    billingIntervalParam === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY'
  );
  const [planDetails, setPlanDetails] = useState<PlanDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [paymentProcessing, setPaymentProcessing] = useState(false);

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
          for (const groupedPlan of plansArray) {
            const monthly = groupedPlan.billing_options?.monthly;
            const annual = groupedPlan.billing_options?.annual;

            if (monthly?.id === parseInt(planId) || annual?.id === parseInt(planId)) {
              const planVariant = billingInterval === 'ANNUAL' ? (annual || monthly) : (monthly || annual);
              if (planVariant) {
                setPlanDetails({
                  id: planVariant.id,
                  plan_name: groupedPlan.plan_name,
                  plan_tier: groupedPlan.plan_tier,
                  description: groupedPlan.description,
                  base_price: planVariant.base_price,
                  currency: planVariant.currency,
                  billing_period: planVariant.billing_period,
                  features: planVariant.features,
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
  }, [planId, billingInterval]);

  // Handle payment submission
  const handlePaymentSubmit = async () => {
    if (!tenantId || !planDetails) {
      setError('Missing tenant or plan information');
      return;
    }

    setPaymentProcessing(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/signup/process-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          plan_id: planDetails.id,
          billing_interval: billingInterval,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Payment processing failed');
      }

      // Payment successful
      toast.success('Payment successful!', { description: 'Your plan is now active.' });

      // Redirect to login
      setTimeout(() => {
        router.push('/login');
      }, 2000);

    } catch (err: any) {
      console.error('Payment error:', err);
      const message = err.message || 'Payment failed. Please try again.';
      setError(message);
      toast.error('Payment failed', { description: message });
    } finally {
      setPaymentProcessing(false);
    }
  };

  // Skip payment and use free trial
  const handleSkipPayment = () => {
    toast.info('Starting with free trial', { description: 'You can upgrade anytime from your dashboard.' });
    router.push('/login');
  };

  // Format currency
  const formatCurrency = (amount: number, currency: string): string => {
    const currencySymbols: Record<string, string> = {
      'USD': '$',
      'INR': '\u20B9',
      'EUR': '\u20AC',
      'GBP': '\u00A3',
    };
    const symbol = currencySymbols[currency] || currency + ' ';
    return `${symbol}${amount.toLocaleString()}`;
  };

  // Styles
  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #F8FAFC 0%, #EEF2FF 50%, #E0E7FF 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    position: 'relative',
    overflow: 'hidden',
  };

  const formCardStyle: React.CSSProperties = {
    backgroundColor: '#ffffff',
    borderRadius: '24px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
    padding: '40px',
    border: '1px solid #F3F4F6',
    maxWidth: 520,
    width: '100%',
    margin: '0 auto',
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#6B7280' }}>
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
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#111827', marginBottom: 8 }}>
              {error || 'Invalid Payment Link'}
            </h2>
            <p style={{ color: '#6B7280', marginBottom: 24 }}>
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

      <div style={formCardStyle}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <div style={{ width: 48, height: 48, background: 'linear-gradient(135deg, #2563EB, #4338CA)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CreditCard style={{ width: 24, height: 24, color: '#ffffff' }} />
          </div>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 700, color: '#111827', marginBottom: 4 }}>Complete Your Payment</h2>
            <p style={{ color: '#6B7280', fontSize: 14 }}>Finish setting up your account by completing payment.</p>
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: 24, padding: 16, backgroundColor: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <AlertCircle style={{ width: 20, height: 20, color: '#DC2626', flexShrink: 0 }} />
            <span style={{ fontSize: 14, color: '#991B1B' }}>{error}</span>
          </div>
        )}

        {/* Plan Summary Card */}
        <div style={{ backgroundColor: '#F9FAFB', borderRadius: 16, padding: 24, marginBottom: 24, border: '1px solid #E5E7EB' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 600, color: '#111827' }}>{planDetails.plan_name}</span>
                <span style={{ backgroundColor: '#DBEAFE', color: '#1D4ED8', fontSize: 12, fontWeight: 500, padding: '2px 8px', borderRadius: 12 }}>
                  {planDetails.plan_tier}
                </span>
              </div>
              <p style={{ color: '#6B7280', fontSize: 14 }}>{planDetails.description}</p>
            </div>
          </div>

          {/* Billing Period */}
          <div style={{ marginBottom: 16, padding: 12, backgroundColor: '#ffffff', borderRadius: 8, border: '1px solid #E5E7EB' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 14, color: '#374151' }}>Billing Period:</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#111827' }}>
                {billingInterval === 'ANNUAL' ? 'Annual' : 'Monthly'}
              </span>
            </div>
          </div>

          {/* Price Display */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTop: '1px solid #E5E7EB' }}>
            <span style={{ fontSize: 16, color: '#374151' }}>Total Amount</span>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 28, fontWeight: 700, color: '#111827' }}>
                {formatCurrency(planDetails.base_price, planDetails.currency)}
              </span>
              <span style={{ fontSize: 14, color: '#6B7280', marginLeft: 4 }}>
                /{billingInterval === 'ANNUAL' ? 'year' : 'month'}
              </span>
            </div>
          </div>
        </div>

        {/* Features List */}
        {planDetails.features && planDetails.features.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, color: '#374151', marginBottom: 12 }}>Included Features:</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {planDetails.features
                .filter(f => f.is_enabled)
                .slice(0, 6)
                .map((feature, index) => (
                  <div key={index} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Check style={{ width: 16, height: 16, color: '#10B981' }} />
                    <span style={{ fontSize: 13, color: '#4B5563' }}>{feature.feature_name}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Complete Purchase Button */}
        <button
          onClick={handlePaymentSubmit}
          disabled={paymentProcessing}
          style={{
            ...submitButtonStyle,
            opacity: paymentProcessing ? 0.7 : 1,
            cursor: paymentProcessing ? 'not-allowed' : 'pointer',
          }}
        >
          {paymentProcessing ? (
            <>
              <Loader2 style={{ width: 20, height: 20, animation: 'spin 1s linear infinite' }} />
              Processing Payment...
            </>
          ) : (
            <>
              <CreditCard style={{ width: 20, height: 20 }} />
              Complete Purchase - {formatCurrency(planDetails.base_price, planDetails.currency)}
            </>
          )}
        </button>

        {/* Security Notice */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 16, color: '#6B7280', fontSize: 13 }}>
          <ShieldCheck style={{ width: 16, height: 16 }} />
          <span>Secure payment processing</span>
        </div>

        {/* Skip Payment Option */}
        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid #E5E7EB', textAlign: 'center' }}>
          <button
            type="button"
            onClick={handleSkipPayment}
            disabled={paymentProcessing}
            style={{ color: '#6B7280', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Skip and start with Free Trial instead
          </button>
        </div>

        {/* Back to Login */}
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button
            type="button"
            onClick={() => router.push('/login')}
            style={{ color: '#2563EB', fontSize: 14, background: 'none', border: 'none', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <ArrowLeft style={{ width: 16, height: 16 }} />
            Back to Login
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// Loading fallback for Suspense
function LoadingFallback() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #F8FAFC 0%, #EEF2FF 50%, #E0E7FF 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        backgroundColor: '#ffffff',
        borderRadius: '24px',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
        padding: '40px',
        border: '1px solid #F3F4F6',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: '#6B7280' }}>
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
