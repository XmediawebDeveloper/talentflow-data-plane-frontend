'use client';

import { CreditCard, Check, Loader2, Users, Building2, Zap, AlertCircle, Lock, Clock, CheckCircle, XCircle, X, Database, Layers, Package, Sparkles, ArrowRight, ArrowLeft, Crown, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';
import api from '@/lib/services/api';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://talentflowdata.api.mo.vc/api/v1';
const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'https://talentflowapi.mo.vc/api/v1';
const BILLING_API_URL = process.env.NEXT_PUBLIC_BILLING_API_URL || 'https://talentflowapi.mo.vc';

interface PlanFeature {
  id: string;
  feature_key: string;
  feature_name: string;
  description?: string;
  feature_category: string;
  is_enabled: boolean;
}

interface PlanQuotas {
  AS?: number;
  RS?: number;
  RU?: number;
  AIU?: number;
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
  numericId: number;
  name: string;
  description: string;
  price: number | null;
  currency: string;
  icon: typeof Users | typeof Building2 | typeof Zap;
  gradient: string;
  popular: boolean;
  features: string[];
  quotas?: PlanQuotas;
  isCurrent: boolean;
}

interface CompanySettings {
  id?: string;
  tenant_id?: string;
  current_plan_id?: number;
  current_plan_name?: string;
  subscription_status: string;
  plan_start_date?: string;
  plan_expiry_date?: string;
  last_synced_at?: string;
  status: string;
  max_seats: number;
  max_jobs: number;
  max_resume_uploads: number;
  max_resume_searches: number;
  max_assessments: number;
  max_ai_interviews: number;
  storage_limit_gb: number;
  trial_start_date?: string;
  trial_end_date?: string;
  selected_plan_id?: number;
  selected_plan_name?: string;
  selected_plan_price?: number;
  payment_status: string;
  payment_attempted_at?: string;
  payment_reference?: string;
  payment_method?: string;
  created_at?: string;
  updated_at?: string;
}

interface PaymentFormData {
  cardholderName: string;
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  billingAddress: string;
  city: string;
  zipCode: string;
  country: string;
}

interface TransactionResult {
  status: string;
  tenant_id: string;
  old_plan_id: number;
  new_plan_id: number;
  plan_name: string;
  plan_tier: string;
  isolation_type: string;
  schema_per_tenant: boolean;
  database_per_tenant: boolean;
  provisioning: {
    isolation_type: string;
    resource_name: string;
    schema_name?: string;
    database_name?: string;
    status: string;
  };
  subscription_id: number;
  subscription_status: string;
  invoice_id: number;
  invoice_number: string;
  total_amount: number;
  transaction_id: number;
  external_transaction_id: string;
  billing_interval: string;
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
  return "from-blue-500 to-cyan-500";
};

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

const formatDate = (dateString: string): string => {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const getStatusBadge = (status: string, paymentStatus?: string) => {
  if (paymentStatus === 'pending') {
    return { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Pending Payment', icon: Clock };
  }

  switch (status.toLowerCase()) {
    case 'active':
      return { bg: 'bg-green-100', text: 'text-green-700', label: 'Active', icon: CheckCircle };
    case 'trial':
      return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Free Trial (14 days)', icon: Clock };
    case 'pending_payment':
      return { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Pending Payment', icon: Clock };
    case 'suspended':
      return { bg: 'bg-red-100', text: 'text-red-700', label: 'Suspended', icon: XCircle };
    case 'expired':
      return { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Expired', icon: XCircle };
    case 'locked':
      return { bg: 'bg-red-100', text: 'text-red-700', label: 'Account Locked', icon: Lock };
    default:
      return { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Free Trial', icon: Clock };
  }
};

const getDaysRemaining = (endDate: string): number => {
  const end = new Date(endDate);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

const formatCardNumber = (value: string): string => {
  const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
  const matches = v.match(/\d{4,16}/g);
  const match = (matches && matches[0]) || '';
  const parts = [];
  for (let i = 0, len = match.length; i < len; i += 4) {
    parts.push(match.substring(i, i + 4));
  }
  return parts.length ? parts.join(' ') : value;
};

export default function CurrentPlanPage() {
  const [plans, setPlans] = useState<DisplayPlan[]>([]);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSelectingPlan, setIsSelectingPlan] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Plan selection flow state
  const [modalStep, setModalStep] = useState<'isolation' | 'tenant' | 'payment' | 'result'>('isolation');
  const [isolationType, setIsolationType] = useState<'schema' | 'database'>('schema');
  const [isNewTenant, setIsNewTenant] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [transactionResult, setTransactionResult] = useState<TransactionResult | null>(null);

  // Payment mode state
  const [paymentMode, setPaymentMode] = useState<'card' | 'upi' | 'netbanking' | 'wallet'>('card');
  const [externalTransactionId, setExternalTransactionId] = useState('');

  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPlanForPayment, setSelectedPlanForPayment] = useState<DisplayPlan | null>(null);
  const [paymentForm, setPaymentForm] = useState<PaymentFormData>({
    cardholderName: '',
    cardNumber: '',
    expiryMonth: '',
    expiryYear: '',
    cvv: '',
    billingAddress: '',
    city: '',
    zipCode: '',
    country: 'India',
  });
  const [formErrors, setFormErrors] = useState<Partial<PaymentFormData>>({});

  const fetchData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      let settings: CompanySettings | null = null;
      try {
        const settingsResponse = await api.get<CompanySettings>('/settings/company-settings');
        settings = settingsResponse.data;
        setCompanySettings(settings);
      } catch (settingsError) {
        console.log('Could not fetch company settings, using defaults');
        settings = {
          subscription_status: 'trial',
          status: 'trial',
          current_plan_name: 'Free Trial',
          max_seats: 5,
          max_jobs: 5,
          max_resume_uploads: 100,
          max_resume_searches: 100,
          max_assessments: 10,
          max_ai_interviews: 10,
          storage_limit_gb: 5,
          payment_status: 'none',
        };
        setCompanySettings(settings);
      }

      // Fetch tenant_id from /auth/me (using data-plane API)
      try {
        const token = localStorage.getItem('accessToken');
        console.log('[CurrentPlan] Fetching tenant_id, token exists:', !!token);
        const meResponse = await fetch(`${API_URL}/auth/me`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        console.log('[CurrentPlan] /auth/me response status:', meResponse.status);
        if (meResponse.ok) {
          const meData = await meResponse.json();
          console.log('[CurrentPlan] /auth/me data:', meData);
          if (meData.tenant_id) {
            setTenantId(meData.tenant_id);
            console.log('[CurrentPlan] tenant_id set:', meData.tenant_id);
          }
        } else {
          console.log('[CurrentPlan] /auth/me failed:', meResponse.status, await meResponse.text());
        }
      } catch (err) {
        console.error('[CurrentPlan] Error fetching tenant_id:', err);
      }

      const plansResponse = await fetch(`${ADMIN_API_URL}/public/plans`);
      if (!plansResponse.ok) {
        throw new Error('Failed to fetch plans');
      }
      const plansResult = await plansResponse.json();
      const plansData: ApiPlan[] = plansResult.data || plansResult;

      const transformedPlans: DisplayPlan[] = plansData
        .filter(plan => plan.is_active && plan.is_public)
        .sort((a, b) => {
          if (a.display_order !== b.display_order) {
            return (a.display_order || 0) - (b.display_order || 0);
          }
          return a.base_price - b.base_price;
        })
        .map((plan) => {
          const featureNames = plan.features
            ?.filter(f => f.is_enabled)
            ?.map(f => f.feature_name) || [];

          const isCurrent = settings?.current_plan_id === plan.id ||
            settings?.current_plan_name?.toLowerCase() === plan.plan_name.toLowerCase();

          return {
            id: String(plan.id),
            numericId: plan.id,
            name: plan.plan_name,
            description: plan.description,
            price: plan.monthly_price > 0 ? plan.monthly_price : (plan.base_price > 0 ? plan.base_price : null),
            currency: plan.currency || 'INR',
            icon: getIconForPlan(plan.plan_name, plan.plan_tier),
            gradient: getGradientForPlan(plan.plan_name, plan.plan_tier),
            popular: plan.is_featured || false,
            features: featureNames,
            quotas: plan.quotas,
            isCurrent,
          };
        });

      setPlans(transformedPlans);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const validatePaymentForm = (): boolean => {
    const errors: Partial<PaymentFormData> = {};

    if (!paymentForm.cardholderName.trim()) {
      errors.cardholderName = 'Cardholder name is required';
    }

    const cardNum = paymentForm.cardNumber.replace(/\s/g, '');
    if (!cardNum || cardNum.length < 13 || cardNum.length > 19) {
      errors.cardNumber = 'Valid card number is required';
    }

    if (!paymentForm.expiryMonth || !paymentForm.expiryYear) {
      errors.expiryMonth = 'Expiry date is required';
    }

    if (!paymentForm.cvv || paymentForm.cvv.length < 3) {
      errors.cvv = 'Valid CVV is required';
    }

    if (!paymentForm.billingAddress.trim()) {
      errors.billingAddress = 'Billing address is required';
    }

    if (!paymentForm.city.trim()) {
      errors.city = 'City is required';
    }

    if (!paymentForm.zipCode.trim()) {
      errors.zipCode = 'ZIP code is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChoosePlan = (plan: DisplayPlan) => {
    if (!plan.price) {
      setError('Cannot select a plan without a price');
      return;
    }
    setSelectedPlanForPayment(plan);
    setModalStep('isolation');
    setIsolationType('schema');
    setIsNewTenant(false);
    setPaymentMode('card');
    setExternalTransactionId('');
    setTransactionResult(null);
    setShowPaymentModal(true);
    setFormErrors({});
  };

  // Generate transaction ID from card details
  const generateTransactionId = (): string => {
    const timestamp = Date.now();
    const last4 = paymentForm.cardNumber.replace(/\s/g, '').slice(-4);
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `TXN-${timestamp}-${last4}-${random}`;
  };

  const handlePaymentSubmit = async () => {
    console.log('handlePaymentSubmit called', { selectedPlanForPayment, tenantId, paymentMode });

    if (!selectedPlanForPayment) {
      setError('Please select a plan');
      return;
    }

    if (!tenantId) {
      setError('Tenant ID not found. Please refresh the page and try again.');
      return;
    }

    // Validate based on payment mode
    let transactionId = externalTransactionId;

    if (paymentMode === 'card') {
      // Validate card details
      if (!paymentForm.cardholderName.trim()) {
        setError('Please enter cardholder name');
        return;
      }
      const cardNum = paymentForm.cardNumber.replace(/\s/g, '');
      if (!cardNum || cardNum.length < 13) {
        setError('Please enter a valid card number');
        return;
      }
      if (!paymentForm.expiryMonth || !paymentForm.expiryYear) {
        setError('Please select card expiry date');
        return;
      }
      if (!paymentForm.cvv || paymentForm.cvv.length < 3) {
        setError('Please enter a valid CVV');
        return;
      }
      // Generate transaction ID from card details
      transactionId = generateTransactionId();
    } else if (!externalTransactionId) {
      setError('Please complete the payment details');
      return;
    }

    try {
      setIsSelectingPlan(true);
      setError(null);
      setSuccessMessage(null);

      const token = localStorage.getItem('accessToken');
      const apiUrl = `${BILLING_API_URL}/api/v1/subscriptions/${tenantId}/select-plan`;

      // Request body per API spec
      const requestBody = {
        plan_id: selectedPlanForPayment.numericId,
        schema_per_tenant: isolationType === 'schema',
        database_per_tenant: isolationType === 'database',
        external_transaction_id: transactionId || null,
        billing_interval: 'MONTHLY',
      };

      console.log('Calling API:', apiUrl);
      console.log('Auth - Token exists:', !!token);
      console.log('Request body:', requestBody);

      if (!token) {
        setError('Authentication token not found. Please login again.');
        setIsSelectingPlan(false);
        return;
      }

      // Call billing API with Bearer token
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (response.ok && (data.status === 'success' || response.status === 200)) {
        console.log('[CurrentPlan] Plan selection successful:', data);

        // Store transaction result and show success modal
        setTransactionResult(data.data || data);
        setModalStep('result');

        // Update company settings with the new plan
        if (selectedPlanForPayment) {
          setCompanySettings(prev => ({
            ...prev!,
            selected_plan_id: selectedPlanForPayment.numericId,
            current_plan: selectedPlanForPayment.name,
            plan_name: selectedPlanForPayment.name,
            subscription_status: 'active',
            status: 'active',
            payment_status: 'success',
          }));

          // Update the plans to mark the new one as current
          setPlans(prevPlans => prevPlans.map(p => ({
            ...p,
            isCurrent: p.numericId === selectedPlanForPayment.numericId,
          })));
        }

        // Refresh data after upgrade
        await fetchData();
      } else {
        setError(data.detail || data.message || 'Failed to upgrade plan');
      }
    } catch (err) {
      console.error('Error selecting plan:', err);
      setError(err instanceof Error ? err.message : 'Failed to select plan');
    } finally {
      setIsSelectingPlan(false);
    }
  };

  const handleSimulatePayment = async (success: boolean) => {
    try {
      setIsProcessingPayment(true);
      setError(null);
      setSuccessMessage(null);

      const response = await api.post<CompanySettings>('/settings/payment-status', {
        payment_status: success ? 'success' : 'failed',
        payment_reference: success ? `PAY-${Date.now()}` : null,
        payment_method: success ? 'card' : null,
      });

      setCompanySettings(response.data);

      if (success) {
        setSuccessMessage('Payment successful! Your plan is now active.');
      } else {
        if (response.data.status === 'locked') {
          setError('Payment failed and trial has expired. Your account is now locked.');
        } else {
          setError('Payment failed. Your trial continues.');
        }
      }

      await fetchData();
    } catch (err) {
      console.error('Error processing payment:', err);
      setError(err instanceof Error ? err.message : 'Failed to process payment');
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const currentPlan = plans.find(p => p.isCurrent);
  const selectedPlan = plans.find(p => p.numericId === companySettings?.selected_plan_id);
  const isOnTrial = companySettings?.status?.toLowerCase() === 'trial' ||
                    companySettings?.subscription_status?.toLowerCase() === 'trial';
  const isPendingPayment = companySettings?.subscription_status?.toLowerCase() === 'pending_payment' ||
                           companySettings?.payment_status === 'pending';
  const isLocked = companySettings?.status?.toLowerCase() === 'locked';
  const isActive = companySettings?.status?.toLowerCase() === 'active';
  const statusBadge = getStatusBadge(companySettings?.status || 'trial', companySettings?.payment_status);
  const StatusIcon = statusBadge.icon;

  const trialDaysRemaining = companySettings?.trial_end_date
    ? getDaysRemaining(companySettings.trial_end_date)
    : 14;

  if (isLoading) {
    return (
      <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-blue-50">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
            <p className="mt-4 text-gray-600">Loading subscription details...</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-blue-50">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-lg">
              <CreditCard className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Current Plan</h1>
              <p className="text-sm text-gray-600">Manage your subscription and billing</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-8 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <p className="text-red-700">{error}</p>
          </div>
        )}

        {successMessage && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-8 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-500" />
            <p className="text-green-700">{successMessage}</p>
          </div>
        )}

        {/* Account Locked Warning */}
        {isLocked && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-6 mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Lock className="w-8 h-8 text-red-500" />
              <div>
                <h3 className="text-lg font-semibold text-red-700">Account Locked</h3>
                <p className="text-red-600">Your trial has ended and payment was not completed. Please select a plan and complete payment to continue.</p>
              </div>
            </div>
          </div>
        )}

        {/* Pending Payment Card */}
        {isPendingPayment && selectedPlan && (
          <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Clock className="w-8 h-8 text-orange-500" />
                <div>
                  <h3 className="text-lg font-semibold text-orange-700">Payment Pending</h3>
                  <p className="text-orange-600">
                    Complete payment for <strong>{selectedPlan.name}</strong> - {formatCurrency(selectedPlan.price || 0, selectedPlan.currency)}/month
                  </p>
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <button
                onClick={() => handleSimulatePayment(true)}
                disabled={isProcessingPayment}
                className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessingPayment ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <CheckCircle className="w-5 h-5" />
                )}
                Confirm Payment Success
              </button>
              <button
                onClick={() => handleSimulatePayment(false)}
                disabled={isProcessingPayment}
                className="flex-1 bg-red-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessingPayment ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <XCircle className="w-5 h-5" />
                )}
                Payment Failed
              </button>
            </div>
          </div>
        )}

        {/* Current Plan Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Your Current Plan</h2>
              <p className="text-sm text-gray-600">
                {isLocked
                  ? 'Your account is locked. Please select a plan and complete payment.'
                  : isOnTrial
                    ? `You are on a Free Trial - ${trialDaysRemaining} days remaining`
                    : isActive
                      ? `You are on the ${companySettings?.current_plan_name || currentPlan?.name || 'Unknown'} plan`
                      : isPendingPayment
                        ? 'Complete payment to activate your selected plan'
                        : `You are on the ${companySettings?.current_plan_name || 'Unknown'} plan`
                }
              </p>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusBadge.bg} ${statusBadge.text} flex items-center gap-2`}>
              <StatusIcon className="w-4 h-4" />
              {statusBadge.label}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Plan</p>
              <p className="text-xl font-semibold text-gray-900">
                {companySettings?.current_plan_name || (isOnTrial ? 'Free Trial' : 'No Plan')}
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">Price</p>
              <p className="text-xl font-semibold text-gray-900">
                {isOnTrial ? (
                  'Free'
                ) : currentPlan?.price ? (
                  <>{formatCurrency(currentPlan.price, currentPlan.currency)}<span className="text-sm font-normal text-gray-500">/month</span></>
                ) : (
                  'Custom'
                )}
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">
                {isOnTrial ? 'Trial Started' : 'Plan Start'}
              </p>
              <p className="text-xl font-semibold text-gray-900">
                {companySettings?.trial_start_date
                  ? formatDate(companySettings.trial_start_date)
                  : companySettings?.plan_start_date
                    ? formatDate(companySettings.plan_start_date)
                    : '-'
                }
              </p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600 mb-1">
                {isOnTrial ? 'Trial Ends' : 'Expires'}
              </p>
              <p className="text-xl font-semibold text-gray-900">
                {isOnTrial && companySettings?.trial_end_date
                  ? formatDate(companySettings.trial_end_date)
                  : companySettings?.plan_expiry_date
                    ? formatDate(companySettings.plan_expiry_date)
                    : '-'
                }
              </p>
            </div>
          </div>

          {/* Quotas */}
          {companySettings && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-sm font-medium text-gray-700 mb-4">Your Plan Limits</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-semibold text-gray-900">{companySettings.max_seats}</p>
                  <p className="text-xs text-gray-600">Team Seats</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-semibold text-gray-900">{companySettings.max_jobs}</p>
                  <p className="text-xs text-gray-600">Job Postings</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-semibold text-gray-900">{companySettings.max_resume_uploads}</p>
                  <p className="text-xs text-gray-600">Resume Uploads</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-semibold text-gray-900">{companySettings.max_resume_searches}</p>
                  <p className="text-xs text-gray-600">Resume Searches</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-semibold text-gray-900">{companySettings.max_assessments}</p>
                  <p className="text-xs text-gray-600">Assessments</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-semibold text-gray-900">{companySettings.max_ai_interviews}</p>
                  <p className="text-xs text-gray-600">AI Interviews</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-semibold text-gray-900">{companySettings.storage_limit_gb}GB</p>
                  <p className="text-xs text-gray-600">Storage</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Available Plans */}
        {plans.length > 0 && (
          <>
            <h2 className="text-lg font-semibold text-gray-900 mb-6">
              {isOnTrial || isLocked ? 'Choose a Plan' : 'Available Plans'}
            </h2>
            <div className={`grid gap-8 ${
              plans.length === 1 ? 'md:grid-cols-1 max-w-md' :
              plans.length === 2 ? 'md:grid-cols-2 max-w-3xl' :
              'md:grid-cols-3'
            }`}>
              {plans.map((plan) => {
                const Icon = plan.icon;
                const isSelectedPending = isPendingPayment && companySettings?.selected_plan_id === plan.numericId;

                return (
                  <Card
                    key={plan.id}
                    className={`relative p-8 ${
                      isSelectedPending
                        ? "border-2 border-orange-500 shadow-xl"
                        : plan.isCurrent
                          ? "border-2 border-blue-500 shadow-xl"
                          : plan.popular
                            ? "border-2 border-purple-500 shadow-xl scale-105"
                            : "border border-gray-200"
                    }`}
                  >
                    {isSelectedPending && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                        <Badge className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-1">
                          Selected - Pending Payment
                        </Badge>
                      </div>
                    )}
                    {plan.isCurrent && !isSelectedPending && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                        <Badge className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-1">
                          Current Plan
                        </Badge>
                      </div>
                    )}
                    {plan.popular && !plan.isCurrent && !isSelectedPending && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                        <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-4 py-1">
                          Most Popular
                        </Badge>
                      </div>
                    )}

                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${plan.gradient} flex items-center justify-center mb-6`}>
                      <Icon className="w-7 h-7 text-white" />
                    </div>

                    <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                    <p className="text-gray-600 mb-6 min-h-[48px]">{plan.description}</p>

                    <div className="mb-6">
                      {plan.price ? (
                        <div className="flex items-baseline gap-1">
                          <span className="text-4xl font-bold text-gray-900">
                            {formatCurrency(plan.price, plan.currency)}
                          </span>
                          <span className="text-gray-600">/month</span>
                        </div>
                      ) : (
                        <div className="text-4xl font-bold text-gray-900">Custom</div>
                      )}
                    </div>

                    {/* Quotas Section */}
                    {plan.quotas && (
                      <div className="mb-6">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {plan.quotas.max_seats !== undefined && plan.quotas.max_seats >= 1 && (
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{plan.quotas.max_seats}</span>
                              <span className="text-gray-600">Team Members</span>
                            </div>
                          )}
                          {plan.quotas.max_jobs !== undefined && plan.quotas.max_jobs >= 1 && (
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{plan.quotas.max_jobs}</span>
                              <span className="text-gray-600">Job Postings</span>
                            </div>
                          )}
                          {plan.quotas.RU !== undefined && plan.quotas.RU >= 1 && (
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{plan.quotas.RU.toLocaleString()}</span>
                              <span className="text-gray-600">Resume Uploads</span>
                            </div>
                          )}
                          {plan.quotas.RS !== undefined && plan.quotas.RS >= 1 && (
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{plan.quotas.RS.toLocaleString()}</span>
                              <span className="text-gray-600">Resume Searches</span>
                            </div>
                          )}
                          {plan.quotas.AS !== undefined && plan.quotas.AS >= 1 && (
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{plan.quotas.AS.toLocaleString()}</span>
                              <span className="text-gray-600">Assessments</span>
                            </div>
                          )}
                          {plan.quotas.AIU !== undefined && plan.quotas.AIU >= 1 && (
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{plan.quotas.AIU.toLocaleString()}</span>
                              <span className="text-gray-600">AI Interviews</span>
                            </div>
                          )}
                          {plan.quotas.storage_gb !== undefined && plan.quotas.storage_gb >= 1 && (
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-900">{plan.quotas.storage_gb}GB</span>
                              <span className="text-gray-600">Storage</span>
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
                            <span className="text-gray-700 text-sm">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {plan.features.length === 0 && <div className="mb-8" />}

                    <button
                      onClick={() => handleChoosePlan(plan)}
                      disabled={plan.isCurrent || isSelectingPlan || isSelectedPending || !plan.price}
                      className={`block w-full h-12 rounded-lg font-medium text-center transition-all flex items-center justify-center gap-2 ${
                        plan.isCurrent || isSelectedPending
                          ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                          : !plan.price
                            ? "bg-gray-100 text-gray-500 cursor-not-allowed"
                            : plan.popular
                              ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90"
                              : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {plan.isCurrent ? (
                        'Current Plan'
                      ) : isSelectedPending ? (
                        'Pending Payment'
                      ) : !plan.price ? (
                        'Contact Sales'
                      ) : isOnTrial || isLocked ? (
                        'Choose Plan'
                      ) : (
                        'Upgrade'
                      )}
                    </button>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {plans.length === 0 && !error && (
          <div className="text-center py-12 text-gray-600">
            <p>No plans available at the moment.</p>
          </div>
        )}
      </div>

      {/* Plan Selection Modal */}
      {showPaymentModal && selectedPlanForPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">

            {/* Step 1: Isolation Type Selection */}
            {modalStep === 'isolation' && (
              <>
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                        <Database className="w-5 h-5 text-purple-600" />
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold text-gray-900">Select Isolation Type</h2>
                        <p className="text-sm text-gray-600">Step 1 of 3 - {selectedPlanForPayment.name}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowPaymentModal(false)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5 text-gray-500" />
                    </button>
                  </div>
                </div>

                <div className="p-6">
                  <p className="text-sm text-gray-600 mb-6">
                    Choose how you want your tenant data to be isolated:
                  </p>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <button
                      type="button"
                      onClick={() => setIsolationType('schema')}
                      className={`p-6 rounded-xl border-2 transition-all flex flex-col items-center gap-3 relative ${
                        isolationType === 'schema'
                          ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      {isolationType === 'schema' && (
                        <CheckCircle className="w-5 h-5 text-purple-600 absolute top-3 right-3" />
                      )}
                      <Layers className={`w-10 h-10 ${isolationType === 'schema' ? 'text-purple-600' : 'text-gray-400'}`} />
                      <span className={`font-semibold text-lg ${isolationType === 'schema' ? 'text-purple-700' : 'text-gray-700'}`}>
                        Schema
                      </span>
                      <span className="text-xs text-gray-500 text-center">
                        Shared database with separate schema per tenant
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsolationType('database')}
                      className={`p-6 rounded-xl border-2 transition-all flex flex-col items-center gap-3 relative ${
                        isolationType === 'database'
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      {isolationType === 'database' && (
                        <CheckCircle className="w-5 h-5 text-blue-600 absolute top-3 right-3" />
                      )}
                      <Database className={`w-10 h-10 ${isolationType === 'database' ? 'text-blue-600' : 'text-gray-400'}`} />
                      <span className={`font-semibold text-lg ${isolationType === 'database' ? 'text-blue-700' : 'text-gray-700'}`}>
                        Database
                      </span>
                      <span className="text-xs text-gray-500 text-center">
                        Dedicated database per tenant (full isolation)
                      </span>
                    </button>
                  </div>
                </div>

                <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowPaymentModal(false)}
                      className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => setModalStep('tenant')}
                      className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                    >
                      Next
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Step 2: Tenant Type Selection */}
            {modalStep === 'tenant' && (
              <>
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <Package className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold text-gray-900">Select Tenant Type</h2>
                        <p className="text-sm text-gray-600">Step 2 of 3 - {selectedPlanForPayment.name}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowPaymentModal(false)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5 text-gray-500" />
                    </button>
                  </div>
                </div>

                <div className="p-6">
                  <p className="text-sm text-gray-600 mb-6">
                    Is this for an existing tenant or a new tenant?
                  </p>

                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <button
                      type="button"
                      onClick={() => setIsNewTenant(false)}
                      className={`p-6 rounded-xl border-2 transition-all flex flex-col items-center gap-3 relative ${
                        !isNewTenant
                          ? 'border-green-500 bg-green-50 ring-2 ring-green-200'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      {!isNewTenant && (
                        <CheckCircle className="w-5 h-5 text-green-600 absolute top-3 right-3" />
                      )}
                      <Package className={`w-10 h-10 ${!isNewTenant ? 'text-green-600' : 'text-gray-400'}`} />
                      <span className={`font-semibold text-lg ${!isNewTenant ? 'text-green-700' : 'text-gray-700'}`}>
                        Existing Tenant
                      </span>
                      <span className="text-xs text-gray-500 text-center">
                        Upgrade your current tenant plan
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsNewTenant(true)}
                      className={`p-6 rounded-xl border-2 transition-all flex flex-col items-center gap-3 relative ${
                        isNewTenant
                          ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-200'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      {isNewTenant && (
                        <CheckCircle className="w-5 h-5 text-orange-600 absolute top-3 right-3" />
                      )}
                      <Sparkles className={`w-10 h-10 ${isNewTenant ? 'text-orange-600' : 'text-gray-400'}`} />
                      <span className={`font-semibold text-lg ${isNewTenant ? 'text-orange-700' : 'text-gray-700'}`}>
                        New Tenant
                      </span>
                      <span className="text-xs text-gray-500 text-center">
                        Create a fresh new tenant
                      </span>
                    </button>
                  </div>

                  {/* Summary */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <h4 className="font-medium text-blue-900 mb-2">Selection Summary</h4>
                    <div className="text-sm text-blue-800 space-y-1">
                      <div className="flex justify-between">
                        <span>Plan:</span>
                        <span className="font-medium">{selectedPlanForPayment.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Isolation Type:</span>
                        <span className="font-medium uppercase">{isolationType}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tenant Type:</span>
                        <span className="font-medium">{isNewTenant ? 'New' : 'Existing'}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-blue-200">
                        <span>Price:</span>
                        <span className="font-bold">{formatCurrency(selectedPlanForPayment.price || 0, selectedPlanForPayment.currency)}/month</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
                  <div className="flex gap-3">
                    <button
                      onClick={() => setModalStep('isolation')}
                      className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back
                    </button>
                    <button
                      onClick={() => setModalStep('payment')}
                      className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                    >
                      Next
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Step 3: Payment Details */}
            {modalStep === 'payment' && (
              <>
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <CreditCard className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <h2 className="text-xl font-semibold text-gray-900">Payment Details</h2>
                        <p className="text-sm text-gray-600">Step 3 of 3 - {selectedPlanForPayment?.name}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowPaymentModal(false)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5 text-gray-500" />
                    </button>
                  </div>
                </div>

                <div className="p-6 max-h-[60vh] overflow-y-auto">
                  {/* Error Display */}
                  {error && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <p className="text-sm text-red-700">{error}</p>
                    </div>
                  )}

                  {/* Payment Mode Selection */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-3">Payment Mode</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setPaymentMode('card')}
                        className={`p-3 rounded-xl border-2 transition-all flex items-center gap-2 ${
                          paymentMode === 'card'
                            ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <CreditCard className={`w-5 h-5 ${paymentMode === 'card' ? 'text-blue-600' : 'text-gray-400'}`} />
                        <span className={`text-sm font-medium ${paymentMode === 'card' ? 'text-blue-700' : 'text-gray-700'}`}>
                          Card
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentMode('upi')}
                        className={`p-3 rounded-xl border-2 transition-all flex items-center gap-2 ${
                          paymentMode === 'upi'
                            ? 'border-green-500 bg-green-50 ring-2 ring-green-200'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <Zap className={`w-5 h-5 ${paymentMode === 'upi' ? 'text-green-600' : 'text-gray-400'}`} />
                        <span className={`text-sm font-medium ${paymentMode === 'upi' ? 'text-green-700' : 'text-gray-700'}`}>
                          UPI
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentMode('netbanking')}
                        className={`p-3 rounded-xl border-2 transition-all flex items-center gap-2 ${
                          paymentMode === 'netbanking'
                            ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <Building2 className={`w-5 h-5 ${paymentMode === 'netbanking' ? 'text-purple-600' : 'text-gray-400'}`} />
                        <span className={`text-sm font-medium ${paymentMode === 'netbanking' ? 'text-purple-700' : 'text-gray-700'}`}>
                          Net Banking
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPaymentMode('wallet')}
                        className={`p-3 rounded-xl border-2 transition-all flex items-center gap-2 ${
                          paymentMode === 'wallet'
                            ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-200'
                            : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                      >
                        <Users className={`w-5 h-5 ${paymentMode === 'wallet' ? 'text-orange-600' : 'text-gray-400'}`} />
                        <span className={`text-sm font-medium ${paymentMode === 'wallet' ? 'text-orange-700' : 'text-gray-700'}`}>
                          Wallet
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Card Details - Show when Card is selected */}
                  {paymentMode === 'card' && (
                    <div className="mb-6 space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Cardholder Name *
                        </label>
                        <input
                          type="text"
                          value={paymentForm.cardholderName}
                          onChange={(e) => setPaymentForm({ ...paymentForm, cardholderName: e.target.value })}
                          placeholder="John Doe"
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Card Number *
                        </label>
                        <input
                          type="text"
                          value={paymentForm.cardNumber}
                          onChange={(e) => setPaymentForm({ ...paymentForm, cardNumber: formatCardNumber(e.target.value) })}
                          placeholder="1234 5678 9012 3456"
                          maxLength={19}
                          className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors font-mono"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Month *
                          </label>
                          <select
                            value={paymentForm.expiryMonth}
                            onChange={(e) => setPaymentForm({ ...paymentForm, expiryMonth: e.target.value })}
                            className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                          >
                            <option value="">MM</option>
                            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                              <option key={m} value={String(m).padStart(2, '0')}>{String(m).padStart(2, '0')}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Year *
                          </label>
                          <select
                            value={paymentForm.expiryYear}
                            onChange={(e) => setPaymentForm({ ...paymentForm, expiryYear: e.target.value })}
                            className="w-full px-3 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                          >
                            <option value="">YY</option>
                            {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() + i).map(y => (
                              <option key={y} value={String(y).slice(-2)}>{y}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            CVV *
                          </label>
                          <input
                            type="password"
                            value={paymentForm.cvv}
                            onChange={(e) => setPaymentForm({ ...paymentForm, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                            placeholder="***"
                            maxLength={4}
                            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {/* UPI ID - Show when UPI is selected */}
                  {paymentMode === 'upi' && (
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        UPI ID *
                      </label>
                      <input
                        type="text"
                        value={externalTransactionId}
                        onChange={(e) => setExternalTransactionId(e.target.value)}
                        placeholder="yourname@upi"
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      />
                    </div>
                  )}

                  {/* Net Banking - Show when Net Banking is selected */}
                  {paymentMode === 'netbanking' && (
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Bank *
                      </label>
                      <select
                        value={externalTransactionId}
                        onChange={(e) => setExternalTransactionId(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      >
                        <option value="">Select your bank</option>
                        <option value="HDFC">HDFC Bank</option>
                        <option value="ICICI">ICICI Bank</option>
                        <option value="SBI">State Bank of India</option>
                        <option value="AXIS">Axis Bank</option>
                        <option value="KOTAK">Kotak Mahindra Bank</option>
                        <option value="PNB">Punjab National Bank</option>
                        <option value="BOB">Bank of Baroda</option>
                        <option value="IDFC">IDFC First Bank</option>
                      </select>
                    </div>
                  )}

                  {/* Wallet - Show when Wallet is selected */}
                  {paymentMode === 'wallet' && (
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Wallet *
                      </label>
                      <select
                        value={externalTransactionId}
                        onChange={(e) => setExternalTransactionId(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                      >
                        <option value="">Select wallet</option>
                        <option value="PAYTM">Paytm</option>
                        <option value="PHONEPE">PhonePe</option>
                        <option value="GPAY">Google Pay</option>
                        <option value="AMAZONPAY">Amazon Pay</option>
                        <option value="MOBIKWIK">MobiKwik</option>
                        <option value="FREECHARGE">Freecharge</option>
                      </select>
                    </div>
                  )}

                  {/* Payment Summary */}
                  <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl p-4">
                    <h4 className="font-medium text-gray-900 mb-3">Payment Summary</h4>
                    <div className="text-sm space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Plan:</span>
                        <span className="font-medium text-gray-900">{selectedPlanForPayment?.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Isolation:</span>
                        <span className="font-medium text-gray-900 uppercase">{isolationType}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Tenant:</span>
                        <span className="font-medium text-gray-900">{isNewTenant ? 'New' : 'Existing'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Payment Mode:</span>
                        <span className="font-medium text-gray-900 capitalize">{paymentMode === 'upi' ? 'UPI' : paymentMode === 'netbanking' ? 'Net Banking' : paymentMode}</span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-blue-200">
                        <span className="text-gray-700 font-medium">Total Amount:</span>
                        <span className="font-bold text-blue-700 text-lg">
                          {formatCurrency(selectedPlanForPayment?.price || 0, selectedPlanForPayment?.currency || 'INR')}/month
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
                  <div className="flex gap-3">
                    <button
                      onClick={() => setModalStep('tenant')}
                      className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
                    >
                      <ArrowLeft className="w-4 h-4" />
                      Back
                    </button>
                    <button
                      onClick={handlePaymentSubmit}
                      disabled={isSelectingPlan || (paymentMode === 'card' && (!paymentForm.cardNumber || !paymentForm.cvv || !paymentForm.expiryMonth || !paymentForm.expiryYear || !paymentForm.cardholderName)) || (paymentMode !== 'card' && !externalTransactionId)}
                      className="flex-1 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-purple-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isSelectingPlan ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          Confirm & Subscribe
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Step 4: Transaction Result */}
            {modalStep === 'result' && transactionResult && (
              <>
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                      <CheckCircle className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">Upgrade Successful!</h2>
                      <p className="text-sm text-gray-600">Your plan has been upgraded successfully</p>
                    </div>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  {/* Plan Info */}
                  <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-4 border border-purple-200">
                    <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <Crown className="w-5 h-5 text-purple-600" />
                      Plan Details
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-600">Plan Name:</span>
                        <span className="ml-2 font-medium text-gray-900 capitalize">{transactionResult.plan_name}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Tier:</span>
                        <span className="ml-2 font-medium text-gray-900">{transactionResult.plan_tier}</span>
                      </div>
                    </div>
                  </div>

                  {/* Provisioning Info */}
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <Database className="w-5 h-5 text-blue-600" />
                      Provisioning Details
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-600">Isolation:</span>
                        <span className="ml-2 font-medium text-gray-900 uppercase">{transactionResult.isolation_type}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Status:</span>
                        <span className="ml-2 font-medium text-green-600 capitalize">{transactionResult.provisioning?.status}</span>
                      </div>
                      {transactionResult.provisioning?.schema_name && (
                        <div className="col-span-2">
                          <span className="text-gray-600">Schema:</span>
                          <span className="ml-2 font-mono text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
                            {transactionResult.provisioning.schema_name}
                          </span>
                        </div>
                      )}
                      {transactionResult.provisioning?.database_name && (
                        <div className="col-span-2">
                          <span className="text-gray-600">Database:</span>
                          <span className="ml-2 font-mono text-xs bg-gray-100 text-gray-800 px-2 py-1 rounded">
                            {transactionResult.provisioning.database_name}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Billing Info */}
                  <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                    <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-green-600" />
                      Billing Details
                    </h4>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-gray-600">Invoice:</span>
                        <span className="ml-2 font-medium text-gray-900">{transactionResult.invoice_number}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Amount:</span>
                        <span className="ml-2 font-bold text-green-700">${transactionResult.total_amount?.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Transaction:</span>
                        <span className="ml-2 font-medium text-gray-900">#{transactionResult.transaction_id}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Subscription:</span>
                        <span className="ml-2 font-medium text-gray-900">#{transactionResult.subscription_id}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
                  <button
                    onClick={() => {
                      setShowPaymentModal(false);
                      setTransactionResult(null);
                      setSelectedPlanForPayment(null);
                      setSuccessMessage('Plan upgraded successfully!');
                    }}
                    className="w-full py-3 px-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:from-green-700 hover:to-emerald-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Done
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
