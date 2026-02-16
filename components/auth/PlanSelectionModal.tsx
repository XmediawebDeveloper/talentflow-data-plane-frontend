'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  X, Check, Sparkles, Building2, Users, Zap, Loader2, AlertCircle, ArrowLeft
} from 'lucide-react';
import { encodePlanId } from '@/lib/utils/planEncoder';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface PlanQuotas {
  // Short names (common in API)
  AS?: number;
  RS?: number;
  RU?: number;
  AIU?: number;
  // Long names (alternative API format)
  assessments?: number;
  resume_scoring?: number;
  resume_uploads?: number;
  resume_storage?: number;
  ai_interviews?: number;
  ai_interview?: number;
  // Other quotas
  max_jobs?: number;
  max_seats?: number;
}

interface DisplayPlan {
  id: string;
  name: string;
  description: string;
  monthlyPrice: number | null;
  yearlyPrice: number | null;
  currency: string;
  features: string[];
  trialDays: number;
  quotas?: PlanQuotas;
  monthlyQuotas?: PlanQuotas;
  annualQuotas?: PlanQuotas;
  discountPercentage?: number;
  monthlyPlanId?: number;
  annualPlanId?: number;
  planSlug: string;
  planTier?: string;
  isFreeTrial?: boolean;
}

interface FreeTrialData {
  trial_days: number;
  features: {
    // Support both uppercase (legacy) and lowercase (API) property names
    MAX_JOBS?: number;
    MAX_SEATS?: number;
    ASSESSMENTS?: number;
    AI_INTERVIEW?: number;
    RESUME_SCORING?: number;
    RESUME_STORAGE?: number;
    max_jobs?: number;
    max_seats?: number;
    assessments?: number;
    ai_interview?: number;
    resume_scoring?: number;
    resume_storage?: number;
  };
  trial_includes: string[];
}

interface PlanSelectionModalProps {
  isOpen: boolean;
  onPlanSelected: (planParam: string, billingInterval?: 'MONTHLY' | 'ANNUAL') => void;
  onClose?: () => void;
}

const formatCurrency = (amount: number | null, currency: string): string => {
  if (amount === null) return 'Contact us';
  const currencySymbols: Record<string, string> = {
    'USD': '$',
    'INR': '₹',
    'EUR': '€',
    'GBP': '£',
  };
  const symbol = currencySymbols[currency] || currency + ' ';
  return `${symbol}${amount.toLocaleString()}`;
};

const getIconForPlan = (planName: string, tier: string) => {
  const name = planName.toLowerCase();
  const tierLower = tier?.toLowerCase() || '';
  if (name.includes('enterprise') || name.includes('premium') || tierLower === 'enterprise') return Zap;
  if (name.includes('business') || name.includes('professional') || name.includes('pro') || tierLower === 'professional') return Building2;
  return Users;
};

export default function PlanSelectionModal({ isOpen, onPlanSelected, onClose }: PlanSelectionModalProps) {
  const router = useRouter();

  // Handle close - redirect to pricing if no close handler provided
  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      router.push('/pricing');
    }
  };

  // Handle overlay click (close modal)
  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only close if clicking on the overlay itself, not the modal content
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };
  const [plans, setPlans] = useState<DisplayPlan[]>([]);
  const [freeTrial, setFreeTrial] = useState<FreeTrialData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isYearly, setIsYearly] = useState(true);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedFeatures, setExpandedFeatures] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch plans and free trial in parallel
        const [plansRes, freeTrialRes] = await Promise.all([
          fetch(`${API_URL}/subscription/public/plans`),
          fetch(`${API_URL}/addons/free-trial`)
        ]);

        // Process plans
        if (plansRes.ok) {
          const result = await plansRes.json();
          const data = result.data || result;
          const plansArray = data?.plans || (Array.isArray(data) ? data : []);

          const transformedPlans: DisplayPlan[] = plansArray
            .map((groupedPlan: any) => {
              const monthly = groupedPlan.billing_options?.monthly;
              const annual = groupedPlan.billing_options?.annual;
              const basePlan = monthly || annual;
              if (!basePlan) return null;
              if (!monthly?.is_active && !annual?.is_active) return null;
              if (!monthly?.is_public && !annual?.is_public) return null;

              const featureNames = (basePlan.features || [])
                .filter((f: any) => f?.is_enabled)
                .map((f: any) => {
                  if (typeof f === 'string') return f;
                  return f?.feature_name || f?.name || '';
                })
                .filter((f: string) => f);

              return {
                id: String(basePlan.id),
                name: groupedPlan.plan_name,
                description: groupedPlan.description,
                monthlyPrice: monthly?.base_price ?? null,
                yearlyPrice: annual?.base_price ?? null,
                currency: basePlan.currency || 'INR',
                features: featureNames,
                trialDays: groupedPlan.trial_period_days || basePlan.trial_period_days || 0,
                quotas: basePlan.quotas,
                monthlyQuotas: monthly?.quotas,
                annualQuotas: annual?.quotas,
                discountPercentage: groupedPlan.discount_percentage ?? annual?.discount_percentage,
                monthlyPlanId: monthly?.id,
                annualPlanId: annual?.id,
                planSlug: groupedPlan.plan_slug,
                planTier: groupedPlan.plan_tier,
                isFreeTrial: false,
              };
            })
            .filter((plan: DisplayPlan | null): plan is DisplayPlan => plan !== null)
            .sort((a: DisplayPlan, b: DisplayPlan) => (a.monthlyPrice || 0) - (b.monthlyPrice || 0));

          setPlans(transformedPlans);
        }

        // Process free trial
        if (freeTrialRes.ok) {
          const result = await freeTrialRes.json();
          const trialData = result?.data || result;
          if (trialData?.trial_days) {
            setFreeTrial(trialData);
          }
        }
      } catch (err) {
        console.error('Error fetching plans:', err);
        setError('Failed to load plans. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [isOpen]);

  const handleSelectPlan = (planId: string) => {
    setSelectedPlanId(planId);
  };

  const handleConfirmSelection = () => {
    if (!selectedPlanId) return;

    setIsProcessing(true);

    if (selectedPlanId === 'free_trial') {
      // User explicitly selected free trial
      onPlanSelected('free_trial');
    } else {
      // Find the selected paid plan
      const selectedPlan = plans.find(p => p.id === selectedPlanId);
      if (selectedPlan) {
        const hasAnnual = !!selectedPlan.annualPlanId;
        const hasMonthly = !!selectedPlan.monthlyPlanId;
        let actualPlanId: string;
        let actualBilling: 'MONTHLY' | 'ANNUAL';

        if (isYearly && hasAnnual) {
          actualPlanId = String(selectedPlan.annualPlanId);
          actualBilling = 'ANNUAL';
        } else if (!isYearly && hasMonthly) {
          actualPlanId = String(selectedPlan.monthlyPlanId);
          actualBilling = 'MONTHLY';
        } else if (hasAnnual) {
          actualPlanId = String(selectedPlan.annualPlanId);
          actualBilling = 'ANNUAL';
        } else if (hasMonthly) {
          actualPlanId = String(selectedPlan.monthlyPlanId);
          actualBilling = 'MONTHLY';
        } else {
          actualPlanId = selectedPlan.id;
          actualBilling = isYearly ? 'ANNUAL' : 'MONTHLY';
        }

        onPlanSelected(encodePlanId(actualPlanId), actualBilling);
      }
    }

    setIsProcessing(false);
  };

  const handleViewPricing = () => {
    router.push('/pricing');
  };

  if (!isOpen) return null;

  // Create free trial plan object for display
  // Handle both uppercase (MAX_JOBS) and lowercase (max_jobs) property names from API
  const trialFeatures = freeTrial?.features || {};
  const freeTrialPlan: DisplayPlan | null = freeTrial ? {
    id: 'free_trial',
    name: 'Free Trial',
    description: `${freeTrial.trial_days} days free to explore all features`,
    monthlyPrice: 0,
    yearlyPrice: 0,
    currency: 'INR',
    // Ensure features are strings
    features: (freeTrial.trial_includes || []).map((f: any) =>
      typeof f === 'string' ? f : (f?.feature_name || f?.name || String(f))
    ),
    trialDays: freeTrial.trial_days,
    quotas: {
      max_jobs: trialFeatures.MAX_JOBS ?? trialFeatures.max_jobs,
      max_seats: trialFeatures.MAX_SEATS ?? trialFeatures.max_seats,
      AS: trialFeatures.ASSESSMENTS ?? trialFeatures.assessments,
      AIU: trialFeatures.AI_INTERVIEW ?? trialFeatures.ai_interview,
      RS: trialFeatures.RESUME_SCORING ?? trialFeatures.resume_scoring,
      RU: trialFeatures.RESUME_STORAGE ?? trialFeatures.resume_storage,
    },
    planSlug: 'free-trial',
    planTier: 'Trial',
    isFreeTrial: true,
  } : null;

  // Combine plans with free trial first
  const allPlans = freeTrialPlan ? [freeTrialPlan, ...plans] : plans;

  return (
    <div
      onClick={handleOverlayClick}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '16px',
        backdropFilter: 'blur(4px)',
        cursor: 'pointer',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          width: '100%',
          maxWidth: '1400px',
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          cursor: 'default',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '24px 32px',
            borderBottom: '1px solid #E5E7EB',
            background: 'linear-gradient(135deg, #F8FAFC 0%, #EEF2FF 100%)',
            position: 'relative',
          }}
        >
          {/* Close Button */}
          <button
            onClick={handleClose}
            style={{
              position: 'absolute',
              top: '16px',
              right: '16px',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              border: 'none',
              backgroundColor: '#F3F4F6',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background-color 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#E5E7EB')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#F3F4F6')}
            title="Close and go to pricing page"
          >
            <X style={{ width: '20px', height: '20px', color: '#6B7280' }} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: '40px' }}>
            <div>
              <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#111827', marginBottom: '8px' }}>
                Choose Your Plan
              </h2>
              <p style={{ fontSize: '14px', color: '#6B7280' }}>
                Please select a plan to continue with your signup. You can upgrade or change your plan anytime.
              </p>
            </div>
            <button
              onClick={handleViewPricing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                fontSize: '14px',
                color: '#2563EB',
                background: 'transparent',
                border: '1px solid #2563EB',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              View Full Pricing
            </button>
          </div>

          {/* Billing Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
            <span style={{ fontSize: '14px', fontWeight: !isYearly ? 600 : 400, color: !isYearly ? '#111827' : '#6B7280' }}>
              Monthly
            </span>
            <button
              onClick={() => setIsYearly(!isYearly)}
              style={{
                position: 'relative',
                width: '48px',
                height: '26px',
                borderRadius: '13px',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: isYearly ? '#2563EB' : '#D1D5DB',
                transition: 'background-color 0.2s',
              }}
            >
              <span
                style={{
                  position: 'absolute',
                  top: '3px',
                  left: isYearly ? '25px' : '3px',
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  backgroundColor: '#ffffff',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                  transition: 'left 0.2s',
                }}
              />
            </button>
            <span style={{ fontSize: '14px', fontWeight: isYearly ? 600 : 400, color: isYearly ? '#111827' : '#6B7280' }}>
              Yearly
            </span>
            <span style={{
              fontSize: '12px',
              fontWeight: 500,
              color: '#059669',
              backgroundColor: '#D1FAE5',
              padding: '2px 8px',
              borderRadius: '12px',
            }}>
              Save up to 20%
            </span>
          </div>
        </div>

        {/* Content */}
        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '24px 32px',
          }}
        >
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
              <Loader2 style={{ width: '40px', height: '40px', color: '#2563EB', animation: 'spin 1s linear infinite' }} />
              <p style={{ marginTop: '16px', color: '#6B7280' }}>Loading plans...</p>
            </div>
          ) : error ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0' }}>
              <AlertCircle style={{ width: '48px', height: '48px', color: '#DC2626' }} />
              <p style={{ marginTop: '16px', color: '#DC2626', fontWeight: 500 }}>{error}</p>
              <button
                onClick={() => window.location.reload()}
                style={{
                  marginTop: '16px',
                  padding: '8px 16px',
                  backgroundColor: '#2563EB',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.min(allPlans.length, 4)}, 1fr)`,
                gap: '20px',
              }}
            >
              {allPlans.map((plan) => {
                const isSelected = selectedPlanId === plan.id;
                const isFreeTrial = plan.id === 'free_trial';
                const IconComponent = isFreeTrial ? Sparkles : getIconForPlan(plan.name, plan.planTier || '');
                const displayPrice = isYearly ? plan.yearlyPrice : plan.monthlyPrice;
                const displayQuotas = isFreeTrial
                  ? plan.quotas
                  : (isYearly ? (plan.annualQuotas || plan.quotas) : (plan.monthlyQuotas || plan.quotas));

                return (
                  <div
                    key={plan.id}
                    onClick={() => handleSelectPlan(plan.id)}
                    style={{
                      position: 'relative',
                      padding: '20px',
                      borderRadius: '16px',
                      border: isSelected ? '2px solid #2563EB' : '2px solid #E5E7EB',
                      backgroundColor: isSelected ? '#EFF6FF' : '#ffffff',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: isSelected ? '0 4px 12px rgba(37, 99, 235, 0.15)' : 'none',
                    }}
                  >
                    {/* Selection indicator */}
                    <div
                      style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        border: isSelected ? 'none' : '2px solid #D1D5DB',
                        backgroundColor: isSelected ? '#2563EB' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {isSelected && <Check style={{ width: '14px', height: '14px', color: '#ffffff' }} />}
                    </div>

                    {/* Plan badge */}
                    <div
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        backgroundColor: isFreeTrial ? '#D1FAE5' : '#F3F4F6',
                        marginBottom: '12px',
                      }}
                    >
                      <IconComponent style={{ width: '14px', height: '14px', color: isFreeTrial ? '#059669' : '#4B5563' }} />
                      <span style={{ fontSize: '12px', fontWeight: 600, color: isFreeTrial ? '#059669' : '#4B5563' }}>
                        {String(plan.planTier || plan.name || '')}
                      </span>
                    </div>

                    {/* Plan name */}
                    <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#111827', marginBottom: '4px' }}>
                      {String(plan.name || '')}
                    </h3>

                    {/* Description */}
                    <p style={{ fontSize: '13px', color: '#6B7280', marginBottom: '12px', minHeight: '36px' }}>
                      {String(plan.description || '')}
                    </p>

                    {/* Price */}
                    <div style={{ marginBottom: '16px' }}>
                      {isFreeTrial ? (
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                          <span style={{ fontSize: '28px', fontWeight: 700, color: '#059669' }}>Free</span>
                          <span style={{ fontSize: '14px', color: '#6B7280' }}>for {plan.trialDays} days</span>
                        </div>
                      ) : displayPrice !== null ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                            <span style={{ fontSize: '28px', fontWeight: 700, color: '#111827' }}>
                              {formatCurrency(displayPrice, plan.currency)}
                            </span>
                            <span style={{ fontSize: '14px', color: '#6B7280' }}>
                              /{isYearly ? 'year' : 'month'}
                            </span>
                          </div>
                          {isYearly && plan.monthlyPrice && plan.yearlyPrice && (plan.monthlyPrice * 12) > plan.yearlyPrice && plan.discountPercentage && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
                              <span style={{ fontSize: '13px', color: '#9CA3AF', textDecoration: 'line-through' }}>
                                {formatCurrency(plan.monthlyPrice * 12, plan.currency)}
                              </span>
                              <span style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                color: '#059669',
                                backgroundColor: '#D1FAE5',
                                padding: '2px 6px',
                                borderRadius: '4px',
                              }}>
                                Save {Math.round(plan.discountPercentage)}%
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontSize: '18px', fontWeight: 600, color: '#111827' }}>Contact Sales</span>
                      )}
                    </div>

                    {/* Key quotas */}
                    {displayQuotas && (() => {
                      // Normalize quota values to handle different API property names
                      const normalizedQuotas = {
                        max_seats: displayQuotas.max_seats,
                        max_jobs: displayQuotas.max_jobs,
                        RS: displayQuotas.RS ?? displayQuotas.resume_scoring,
                        AS: displayQuotas.AS ?? displayQuotas.assessments,
                        AIU: displayQuotas.AIU ?? displayQuotas.ai_interviews ?? displayQuotas.ai_interview,
                        RU: displayQuotas.RU ?? displayQuotas.resume_uploads ?? displayQuotas.resume_storage,
                      };
                      return (
                        <div style={{ borderTop: '1px solid #E5E7EB', paddingTop: '12px', marginBottom: '12px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px' }}>
                            {normalizedQuotas.max_seats !== undefined && typeof normalizedQuotas.max_seats === 'number' && (
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#6B7280' }}>Users</span>
                                <span style={{ fontWeight: 600, color: '#111827' }}>{normalizedQuotas.max_seats}</span>
                              </div>
                            )}
                            {normalizedQuotas.max_jobs !== undefined && typeof normalizedQuotas.max_jobs === 'number' && (
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#6B7280' }}>Jobs</span>
                                <span style={{ fontWeight: 600, color: '#111827' }}>
                                  {isFreeTrial ? normalizedQuotas.max_jobs : 'Unlimited'}
                                </span>
                              </div>
                            )}
                            {normalizedQuotas.RS !== undefined && typeof normalizedQuotas.RS === 'number' && (
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#6B7280' }}>Resume Scores</span>
                                <span style={{ fontWeight: 600, color: '#111827' }}>{normalizedQuotas.RS}</span>
                              </div>
                            )}
                            {normalizedQuotas.AS !== undefined && typeof normalizedQuotas.AS === 'number' && (
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#6B7280' }}>Assessments</span>
                                <span style={{ fontWeight: 600, color: '#111827' }}>{normalizedQuotas.AS}</span>
                              </div>
                            )}
                            {normalizedQuotas.RU !== undefined && typeof normalizedQuotas.RU === 'number' && (
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#6B7280' }}>Resume Storage</span>
                                <span style={{ fontWeight: 600, color: '#111827' }}>{normalizedQuotas.RU}</span>
                              </div>
                            )}
                            {normalizedQuotas.AIU !== undefined && typeof normalizedQuotas.AIU === 'number' && (
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ color: '#6B7280' }}>AI Interviews</span>
                                <span style={{ fontWeight: 600, color: '#111827' }}>{normalizedQuotas.AIU}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Features preview */}
                    {plan.features.length > 0 && (
                      <div>
                        {plan.features.slice(0, expandedFeatures === plan.id ? undefined : 3).map((feature, idx) => (
                          <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <Check style={{ width: '14px', height: '14px', color: '#10B981', flexShrink: 0 }} />
                            <span style={{ fontSize: '12px', color: '#4B5563' }}>
                              {typeof feature === 'string' ? feature : (feature as any)?.feature_name || String(feature)}
                            </span>
                          </div>
                        ))}
                        {plan.features.length > 3 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedFeatures(expandedFeatures === plan.id ? null : plan.id);
                            }}
                            style={{
                              fontSize: '12px',
                              color: '#2563EB',
                              background: 'none',
                              border: 'none',
                              padding: 0,
                              cursor: 'pointer',
                              textDecoration: 'underline',
                            }}
                          >
                            {expandedFeatures === plan.id
                              ? 'Show less'
                              : `+${plan.features.length - 3} more features`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '20px 32px',
            borderTop: '1px solid #E5E7EB',
            backgroundColor: '#F9FAFB',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: '13px', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {selectedPlanId === 'free_trial' ? (
              <>
                <Sparkles style={{ width: '14px', height: '14px', color: '#059669', flexShrink: 0 }} />
                <span>You&apos;re selecting the <strong>Free Trial</strong>. No credit card required.</span>
              </>
            ) : selectedPlanId ? (
              <>
                <Check style={{ width: '14px', height: '14px', color: '#2563EB', flexShrink: 0 }} />
                <span>You&apos;ve selected a paid plan. Payment will be collected after signup.</span>
              </>
            ) : (
              <span>Please select a plan to continue</span>
            )}
          </div>
          <button
            onClick={handleConfirmSelection}
            disabled={!selectedPlanId || isProcessing}
            style={{
              padding: '12px 32px',
              fontSize: '16px',
              fontWeight: 600,
              color: '#ffffff',
              background: selectedPlanId ? 'linear-gradient(to right, #2563EB, #4338CA)' : '#D1D5DB',
              border: 'none',
              borderRadius: '12px',
              cursor: selectedPlanId ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: selectedPlanId ? '0 4px 12px rgba(37, 99, 235, 0.3)' : 'none',
              transition: 'all 0.2s',
            }}
          >
            {isProcessing ? (
              <>
                <Loader2 style={{ width: '18px', height: '18px', animation: 'spin 1s linear infinite' }} />
                Processing...
              </>
            ) : (
              <>
                Continue with {selectedPlanId === 'free_trial' ? 'Free Trial' : 'Selected Plan'}
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
