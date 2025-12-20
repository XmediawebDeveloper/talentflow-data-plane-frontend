import { useState, useEffect } from "react";
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
}

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://192.168.1.110:8000/api/v1';

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
  const [isYearly, setIsYearly] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [plans, setPlans] = useState<DisplayPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch plans from API
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        setIsLoading(true);
        setError(null);

        // Use public endpoint that doesn't require authentication
        const response = await fetch(`${ADMIN_API_URL}/plans?active_only=false&public_only=false&include_features=true`);

        if (!response.ok) {
          throw new Error(`Failed to fetch plans: ${response.status}`);
        }

        const result = await response.json();
        // API returns { status, data, meta } structure
        const data: ApiPlan[] = result.data || result;

        // Transform API data to display format
        const transformedPlans: DisplayPlan[] = data
          .filter(plan => plan.is_active && plan.is_public)
          .sort((a, b) => (a.display_order || 0) - (b.display_order || 0) || a.base_price - b.base_price)
          .map((plan, index) => {
            // Extract feature names from features array
            const featureNames = plan.features
              ?.filter(f => f.is_enabled)
              ?.map(f => f.feature_name) || [];

            // Add default features based on plan limits/quotas if no features provided
            if (featureNames.length === 0) {
              if (plan.included_seats) featureNames.push(`${plan.included_seats} team members`);
              if (plan.quotas?.max_jobs) featureNames.push(`${plan.quotas.max_jobs} job postings`);
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

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    setIsDark(document.documentElement.classList.contains('dark'));
    return () => window.removeEventListener('resize', checkMobile);
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
    padding: '80px 0',
  };

  const containerStyle: React.CSSProperties = {
    maxWidth: '1400px',
    margin: '0 auto',
    padding: '0 24px',
  };

  const headerStyle: React.CSSProperties = {
    textAlign: 'center',
    marginBottom: '64px',
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
    fontSize: isMobile ? '36px' : '56px',
    fontWeight: 700,
    color: isDark ? '#ffffff' : '#111827',
    marginBottom: '16px',
    lineHeight: 1.1,
  };

  const subtitleStyle: React.CSSProperties = {
    fontSize: '20px',
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
    gridTemplateColumns: isMobile ? '1fr' : `repeat(${Math.min(plans.length, 3)}, 1fr)`,
    gap: '32px',
    maxWidth: '1200px',
    margin: '0 auto',
    alignItems: 'stretch',
  };

  const cardStyle = (isPopular: boolean): React.CSSProperties => ({
    padding: '32px',
    borderRadius: '24px',
    border: isPopular
      ? '2px solid #8B5CF6'
      : `1px solid ${isDark ? '#1E293B' : '#E5E7EB'}`,
    backgroundColor: isDark ? '#1E293B' : '#ffffff',
    position: 'relative',
    transform: isPopular && !isMobile ? 'scale(1.05)' : 'none',
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
    fontSize: '48px',
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
    marginTop: '96px',
    textAlign: 'center',
    padding: '60px 40px',
    borderRadius: '24px',
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
            Start with a 14-day free trial. No credit card required.
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

        {/* Pricing Cards */}
        <div style={gridStyle}>
          {plans.map((plan, index) => {
            const Icon = plan.icon;
            const price = getDisplayPrice(plan);
            const currencySymbol = getCurrencySymbol(plan.currency);

            return (
              <div key={plan.id || index} style={cardStyle(plan.popular)}>
                {plan.popular && (
                  <div style={popularBadgeStyle}>Most Popular</div>
                )}

                <div style={iconBoxStyle(plan.gradient)}>
                  <Icon style={{ width: 28, height: 28, color: '#ffffff' }} />
                </div>

                <h3 style={planNameStyle}>{plan.name}</h3>
                <p style={planDescStyle}>{plan.description}</p>

                <div style={priceStyle}>
                  {price !== null ? (
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

                <ul style={featureListStyle}>
                  {plan.features.map((feature, idx) => (
                    <li key={idx} style={featureItemStyle}>
                      <Check style={{ width: 20, height: 20, color: '#22C55E', flexShrink: 0 }} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => onNavigate(price !== null ? "signup" : "contact")}
                  style={buttonStyle(plan.popular)}
                >
                  {price !== null ? "Start Free Trial" : "Contact Sales"}
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
