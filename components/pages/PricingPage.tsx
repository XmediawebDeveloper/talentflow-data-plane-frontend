import { useState, useEffect } from "react";
import { useTheme } from 'next-themes';
import { Check, Sparkles, Building2, Users, Zap, ArrowRight, Loader2 } from "lucide-react";

interface PricingPageProps {
  onNavigate: (page: string) => void;
}

interface PlanFeature {
  id: string;
  feature_key: string;
  feature_name: string;
  description?: string;
  feature_category: string;
  is_enabled: boolean;
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
  quotas?: {
    max_jobs?: number;
    max_seats?: number;
    storage_gb?: number;
  };
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
  quotas?: {
    max_jobs?: number;
    max_seats?: number;
    storage_gb?: number;
  };
}

// Use backend proxy instead of direct Admin API calls
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

// Icon mapping based on plan name
const getIconForPlan = (planName: string): typeof Users | typeof Building2 | typeof Zap => {
  const name = planName.toLowerCase();
  if (name.includes('enterprise') || name.includes('premium')) return Zap;
  if (name.includes('business') || name.includes('professional') || name.includes('pro')) return Building2;
  return Users;
};

// Gradient mapping based on plan name
const getGradientForPlan = (planName: string, index: number): string => {
  const name = planName.toLowerCase();
  if (name.includes('enterprise') || name.includes('premium')) return "linear-gradient(135deg, #F97316, #EF4444)";
  if (name.includes('business') || name.includes('professional') || name.includes('pro')) return "linear-gradient(135deg, #8B5CF6, #EC4899)";
  if (name.includes('freelancer') || name.includes('starter') || name.includes('basic')) return "linear-gradient(135deg, #3B82F6, #06B6D4)";

  // Fallback gradients based on index
  const gradients = [
    "linear-gradient(135deg, #3B82F6, #06B6D4)",
    "linear-gradient(135deg, #8B5CF6, #EC4899)",
    "linear-gradient(135deg, #F97316, #EF4444)",
  ];
  return gradients[index % gradients.length];
};

export default function PricingPage({ onNavigate }: PricingPageProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [isYearly, setIsYearly] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [plans, setPlans] = useState<DisplayPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trialDays, setTrialDays] = useState<number>(14);
  const [freeTrialQuotas, setFreeTrialQuotas] = useState<{ max_jobs?: number | string; max_seats?: number | string } | null>(null);

  // Fetch trial days and quotas — /addons/free-trial proxies admin API (no auth required)
  useEffect(() => {
    const fetchTrialData = async () => {
      try {
        const response = await fetch(`${API_URL}/addons/free-trial`);
        if (response.ok) {
          const result = await response.json();
          const data = result?.data || result;
          setTrialDays(data?.trial_days || 14);
          // features keys may be uppercase (MAX_JOBS) or lowercase (max_jobs)
          const features = data?.features || {};
          const maxJobs = features.MAX_JOBS ?? features.max_jobs;
          const maxSeats = features.MAX_SEATS ?? features.max_seats;
          if (maxJobs !== undefined || maxSeats !== undefined) {
            setFreeTrialQuotas({ max_jobs: maxJobs, max_seats: maxSeats });
          }
        }
      } catch (err) {
        console.error('Error fetching trial data:', err);
      }
    };
    fetchTrialData();
  }, []);

  // Fetch plans from backend proxy (which calls Admin API)
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Use backend proxy endpoint for public plans
        const response = await fetch(`${API_URL}/subscription/public/plans`);

        if (!response.ok) {
          throw new Error(`Failed to fetch plans: ${response.status}`);
        }

        const result = await response.json();
        // API returns { status, data, meta } structure
        const data: ApiPlan[] = result.data || result;

        // Transform API data to display format
        const transformedPlans: DisplayPlan[] = data
          .filter(plan => plan.is_active && plan.is_public)
          .sort((a, b) => {
            // Sort trial/free plans first
            const aIsTrial = a.plan_name.toLowerCase().includes('trial') || a.plan_name.toLowerCase().includes('free');
            const bIsTrial = b.plan_name.toLowerCase().includes('trial') || b.plan_name.toLowerCase().includes('free');

            if (aIsTrial && !bIsTrial) return -1;
            if (!aIsTrial && bIsTrial) return 1;

            // Then sort by display_order and price
            return (a.display_order || 0) - (b.display_order || 0) || a.base_price - b.base_price;
          })
          .map((plan, index) => {
            // Extract feature names from features array
            const featureNames = plan.features
              ?.filter(f => f.is_enabled)
              ?.map(f => f.feature_name) || [];

            // Add default features based on plan limits/quotas if no features provided
            if (featureNames.length === 0) {
              if (plan.included_seats) featureNames.push(`${plan.included_seats} team members`);
              if (plan.quotas?.max_jobs) {
                const jobDisplay = plan.quotas.max_jobs === -1 ? 'Unlimited' : plan.quotas.max_jobs;
                featureNames.push(`${jobDisplay} job postings`);
              }
              if (plan.quotas?.storage_gb) featureNames.push(`${plan.quotas.storage_gb}GB storage`);
              if (plan.trial_period_days) featureNames.push(`${plan.trial_period_days}-day free trial`);
            }

            return {
              id: String(plan.id),
              name: plan.plan_name,
              description: plan.description,
              monthlyPrice: plan.monthly_price > 0 ? plan.monthly_price : (plan.base_price > 0 ? plan.base_price : null),
              yearlyPrice: null, // Will be calculated with 20% discount
              currency: plan.currency || 'USD',
              icon: getIconForPlan(plan.plan_name),
              gradient: getGradientForPlan(plan.plan_name, index),
              popular: plan.is_featured || false,
              features: featureNames,
              quotas: plan.quotas,
            };
          });

        setPlans(transformedPlans);
      } catch (err) {
        console.error('Error fetching plans:', err);
        setError(err instanceof Error ? err.message : 'Failed to load plans');
        setPlans([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPlans();
  }, []);

  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    const checkScreen = () => {
      const w = window.innerWidth;
      setIsMobile(w < 640);
      setIsTablet(w >= 640 && w < 1024);
    };
    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  // Calculate yearly price with 20% discount from monthly
  const calculateYearlyPrice = (monthlyPrice: number | null): number | null => {
    if (monthlyPrice === null) return null;
    return Math.round(monthlyPrice * 0.8); // 20% discount
  };

  // Get display price based on toggle
  const getDisplayPrice = (plan: DisplayPlan): number | null => {
    if (isYearly) {
      // If API provides yearly price, use it; otherwise calculate 20% discount
      return plan.yearlyPrice || calculateYearlyPrice(plan.monthlyPrice);
    }
    return plan.monthlyPrice;
  };

  // Get currency symbol
  const getCurrencySymbol = (currency: string): string => {
    const symbols: Record<string, string> = {
      'USD': '$',
      'EUR': '\u20AC',
      'GBP': '\u00A3',
      'INR': '\u20B9',
    };
    return symbols[currency] || currency;
  };

  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    backgroundColor: isDark ? '#0F172A' : '#ffffff',
    color: isDark ? '#ffffff' : '#111827',
    padding: isMobile ? '40px 0' : isTablet ? '60px 0' : '80px 0',
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: isMobile ? '0 16px' : isTablet ? '0 20px' : '0 24px',
  };

  const headerStyle: React.CSSProperties = {
    textAlign: 'center',
    marginBottom: isMobile ? '36px' : isTablet ? '48px' : '64px',
  };

  const badgeStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    borderRadius: '9999px',
    backgroundColor: isDark ? 'rgba(139, 92, 246, 0.2)' : '#EDE9FE',
    color: isDark ? '#C4B5FD' : '#7C3AED',
    fontSize: '14px',
    fontWeight: 600,
    marginBottom: '16px',
  };

  const titleStyle: React.CSSProperties = {
    fontSize: isMobile ? '28px' : isTablet ? '40px' : '56px',
    fontWeight: 700,
    color: isDark ? '#ffffff' : '#111827',
    marginBottom: '16px',
    lineHeight: 1.1,
  };

  const subtitleStyle: React.CSSProperties = {
    fontSize: isMobile ? '16px' : isTablet ? '18px' : '20px',
    color: isDark ? '#94A3B8' : '#6B7280',
    maxWidth: '672px',
    margin: '0 auto',
    lineHeight: 1.6,
  };

  const toggleContainerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '16px',
    marginTop: '32px',
  };

  const toggleLabelStyle = (isActive: boolean): React.CSSProperties => ({
    fontSize: '18px',
    fontWeight: isActive ? 600 : 400,
    color: isActive ? (isDark ? '#ffffff' : '#111827') : (isDark ? '#64748B' : '#9CA3AF'),
  });

  const toggleSwitchStyle: React.CSSProperties = {
    width: '56px',
    height: '28px',
    borderRadius: '14px',
    backgroundColor: isDark ? '#8B5CF6' : '#7C3AED',
    position: 'relative',
    cursor: 'pointer',
    border: 'none',
    padding: 0,
  };

  const toggleKnobStyle: React.CSSProperties = {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: '#ffffff',
    position: 'absolute',
    top: '2px',
    left: isYearly ? '30px' : '2px',
    transition: 'left 0.2s',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
  };

  const saveBadgeStyle: React.CSSProperties = {
    padding: '4px 12px',
    borderRadius: '9999px',
    backgroundColor: isDark ? 'rgba(34, 197, 94, 0.2)' : '#DCFCE7',
    color: isDark ? '#86EFAC' : '#16A34A',
    fontSize: '14px',
    fontWeight: 600,
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : isTablet ? 'repeat(2, 1fr)' : `repeat(${Math.min(plans.length, 3)}, 1fr)`,
    gap: isMobile ? '24px' : '32px',
    maxWidth: '1200px',
    margin: '0 auto',
    alignItems: 'stretch',
  };

  const cardStyle = (isPopular: boolean): React.CSSProperties => ({
    padding: isMobile ? '24px' : '32px',
    borderRadius: isMobile ? '16px' : '24px',
    border: isPopular
      ? '2px solid #8B5CF6'
      : `1px solid ${isDark ? '#1E293B' : '#E5E7EB'}`,
    backgroundColor: isDark ? '#1E293B' : '#ffffff',
    position: 'relative',
    transform: isPopular && !isMobile && !isTablet ? 'scale(1.05)' : 'none',
    boxShadow: isPopular ? '0 20px 60px rgba(139, 92, 246, 0.2)' : 'none',
    zIndex: isPopular ? 10 : 1,
  });

  const popularBadgeStyle: React.CSSProperties = {
    position: 'absolute',
    top: '-14px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '6px 16px',
    borderRadius: '9999px',
    background: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  };

  const iconBoxStyle = (gradient: string): React.CSSProperties => ({
    width: '56px',
    height: '56px',
    borderRadius: '16px',
    background: gradient,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '24px',
  });

  const planNameStyle: React.CSSProperties = {
    fontSize: '24px',
    fontWeight: 700,
    color: isDark ? '#ffffff' : '#111827',
    marginBottom: '8px',
  };

  const planDescStyle: React.CSSProperties = {
    color: isDark ? '#94A3B8' : '#6B7280',
    marginBottom: '24px',
  };

  const priceStyle: React.CSSProperties = {
    marginBottom: '24px',
  };

  const priceAmountStyle: React.CSSProperties = {
    fontSize: isMobile ? '36px' : '48px',
    fontWeight: 700,
    color: isDark ? '#ffffff' : '#111827',
  };

  const pricePeriodStyle: React.CSSProperties = {
    fontSize: '18px',
    color: isDark ? '#94A3B8' : '#6B7280',
  };

  const featureListStyle: React.CSSProperties = {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 32px 0',
  };

  const featureItemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '12px',
    color: isDark ? '#CBD5E1' : '#374151',
  };

  const buttonStyle = (isPopular: boolean): React.CSSProperties => ({
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '16px 24px',
    fontSize: '16px',
    fontWeight: 600,
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    border: isPopular ? 'none' : `2px solid ${isDark ? '#334155' : '#E5E7EB'}`,
    background: isPopular ? 'linear-gradient(135deg, #8B5CF6, #EC4899)' : 'transparent',
    color: isPopular ? '#ffffff' : (isDark ? '#ffffff' : '#374151'),
  });

  const faqSectionStyle: React.CSSProperties = {
    marginTop: isMobile ? '48px' : isTablet ? '72px' : '96px',
    textAlign: 'center',
    padding: isMobile ? '32px 20px' : isTablet ? '48px 32px' : '60px 40px',
    borderRadius: isMobile ? '16px' : '24px',
    backgroundColor: isDark ? '#1E293B' : '#F9FAFB',
  };

  const loadingStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 0',
  };

  if (isLoading) {
    return (
      <div style={pageStyle}>
        <div style={containerStyle}>
          <div style={headerStyle}>
            <div style={badgeStyle}>
              <Sparkles style={{ width: 16, height: 16 }} />
              Simple Pricing
            </div>
            <h1 style={titleStyle}>Choose the right plan for your team</h1>
          </div>
          <div style={loadingStyle}>
            <Loader2 style={{ width: 48, height: 48, color: '#8B5CF6', animation: 'spin 1s linear infinite' }} />
            <p style={{ marginTop: '16px', color: isDark ? '#94A3B8' : '#6B7280' }}>Loading plans...</p>
          </div>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={badgeStyle}>
            <Sparkles style={{ width: 16, height: 16 }} />
            Simple Pricing
          </div>
          <h1 style={titleStyle}>Choose the right plan for your team</h1>
          <p style={subtitleStyle}>
            Start with a {trialDays}-day free trial. No credit card required.
          </p>

          {/* Billing Toggle */}
          <div style={toggleContainerStyle}>
            <span style={toggleLabelStyle(!isYearly)}>Monthly</span>
            <button
              style={toggleSwitchStyle}
              onClick={() => setIsYearly(!isYearly)}
              aria-label="Toggle billing period"
            >
              <div style={toggleKnobStyle}></div>
            </button>
            <span style={toggleLabelStyle(isYearly)}>Yearly</span>
            {isYearly && <span style={saveBadgeStyle}>Save 20%</span>}
          </div>
        </div>

        {error && (
          <div style={{ textAlign: 'center', marginBottom: '32px', padding: '24px', backgroundColor: isDark ? 'rgba(239, 68, 68, 0.1)' : '#FEF2F2', borderRadius: '12px' }}>
            <p style={{ color: '#EF4444', marginBottom: '8px' }}>Failed to load pricing plans</p>
            <p style={{ color: isDark ? '#94A3B8' : '#6B7280', fontSize: '14px' }}>{error}</p>
          </div>
        )}

        {!error && plans.length === 0 && !isLoading && (
          <div style={{ textAlign: 'center', padding: '48px', color: isDark ? '#94A3B8' : '#6B7280' }}>
            <p>No pricing plans available at the moment.</p>
          </div>
        )}

        {/* Pricing Cards - Including Trial as First Card */}
        <div style={gridStyle}>
          {plans.map((plan, index) => {
            // Check if this is a trial/free plan for special badge
            const isTrialPlan = plan.name.toLowerCase().includes('trial') || plan.name.toLowerCase().includes('free');
            const Icon = plan.icon;
            const price = getDisplayPrice(plan);
            const currencySymbol = getCurrencySymbol(plan.currency);

            return (
              <div key={plan.id || index} style={cardStyle(plan.popular || isTrialPlan)}>
                {isTrialPlan && (
                  <div style={{
                    ...popularBadgeStyle,
                    background: 'linear-gradient(135deg, #22C55E, #16A34A)',
                  }}>Free Trial</div>
                )}
                {plan.popular && !isTrialPlan && (
                  <div style={popularBadgeStyle}>Most Popular</div>
                )}

                <div style={iconBoxStyle(isTrialPlan ? 'linear-gradient(135deg, #22C55E, #16A34A)' : plan.gradient)}>
                  <Icon style={{ width: 28, height: 28, color: '#ffffff' }} />
                </div>

                <h3 style={planNameStyle}>{plan.name}</h3>
                <p style={planDescStyle}>{plan.description}</p>

                <div style={priceStyle}>
                  {isTrialPlan && (price === null || price === 0) ? (
                    <span style={{ ...priceAmountStyle, color: '#22C55E' }}>Free</span>
                  ) : price !== null && price > 0 ? (
                    <div>
                      <span style={priceAmountStyle}>{currencySymbol}{price}</span>
                      <span style={pricePeriodStyle}>/month</span>
                      {isYearly && (
                        <p style={{ fontSize: '14px', color: isDark ? '#64748B' : '#9CA3AF', marginTop: '4px' }}>
                          Billed annually ({currencySymbol}{price * 12}/year)
                        </p>
                      )}
                      {isYearly && plan.monthlyPrice && (
                        <p style={{ fontSize: '12px', color: '#22C55E', marginTop: '2px' }}>
                          You save {currencySymbol}{(plan.monthlyPrice - price) * 12}/year
                        </p>
                      )}
                    </div>
                  ) : (
                    <span style={priceAmountStyle}>Custom</span>
                  )}
                </div>

                {isTrialPlan && freeTrialQuotas && (
                  <div style={{ borderTop: `1px solid ${isDark ? '#334155' : '#E5E7EB'}`, paddingTop: '12px', marginBottom: '16px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                      {freeTrialQuotas.max_seats !== undefined && freeTrialQuotas.max_seats !== 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: isDark ? '#94A3B8' : '#6B7280' }}>Users</span>
                          <span style={{ fontWeight: 600, color: isDark ? '#ffffff' : '#111827' }}>
                            {freeTrialQuotas.max_seats === -1 || String(freeTrialQuotas.max_seats).toLowerCase() === 'unlimited' ? 'Unlimited' : freeTrialQuotas.max_seats}
                          </span>
                        </div>
                      )}
                      {freeTrialQuotas.max_jobs !== undefined && freeTrialQuotas.max_jobs !== 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: isDark ? '#94A3B8' : '#6B7280' }}>Jobs</span>
                          <span style={{ fontWeight: 600, color: isDark ? '#ffffff' : '#111827' }}>
                            {freeTrialQuotas.max_jobs === -1 || String(freeTrialQuotas.max_jobs).toLowerCase() === 'unlimited' ? 'Unlimited' : freeTrialQuotas.max_jobs}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <ul style={featureListStyle}>
                  {plan.features.map((feature, idx) => (
                    <li key={idx} style={featureItemStyle}>
                      <Check style={{ width: 20, height: 20, color: '#22C55E', flexShrink: 0 }} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => onNavigate(price !== null || isTrialPlan ? "signup" : "contact")}
                  style={{
                    ...buttonStyle(plan.popular || isTrialPlan),
                    ...(isTrialPlan && {
                      background: 'linear-gradient(135deg, #22C55E, #16A34A)',
                      border: 'none',
                      color: '#ffffff',
                    })
                  }}
                >
                  {isTrialPlan ? "Start Free Trial" : (price !== null ? "Choose & Select" : "Contact Sales")}
                  <ArrowRight style={{ width: 18, height: 18 }} />
                </button>
              </div>
            );
          })}
        </div>

        {/* FAQ Section */}
        <div style={faqSectionStyle}>
          <h2 style={{ fontSize: '32px', fontWeight: 700, color: isDark ? '#ffffff' : '#111827', marginBottom: '16px' }}>
            Questions? We've got answers.
          </h2>
          <p style={{ color: isDark ? '#94A3B8' : '#6B7280', marginBottom: '24px' }}>
            Can't find what you're looking for? Contact our team.
          </p>
          <button
            onClick={() => onNavigate("contact")}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '14px 28px',
              fontSize: '16px',
              fontWeight: 500,
              borderRadius: '12px',
              border: `2px solid ${isDark ? '#334155' : '#E5E7EB'}`,
              backgroundColor: 'transparent',
              color: isDark ? '#ffffff' : '#374151',
              cursor: 'pointer',
            }}
          >
            Contact Support
          </button>
        </div>
      </div>
    </div>
  );
}
