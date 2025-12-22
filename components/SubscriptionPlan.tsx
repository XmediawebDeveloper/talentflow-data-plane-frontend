'use client';

import { useState, useEffect } from 'react';
import {
  Crown,
  Zap,
  Check,
  ArrowRight,
  Loader2,
  AlertCircle,
  TrendingUp,
  Package,
  CreditCard,
  Calendar,
  Target,
  Video,
  ClipboardCheck,
  Upload,
  Database,
  Layers,
  CheckCircle2,
  XCircle,
  FileText
} from 'lucide-react';

interface Plan {
  id: number;
  name: string;
  tier: string;
  price: number;
  billing_interval: string;
  features: {
    resume_uploads?: number;
    resume_scoring?: number;
    assessments?: number;
    ai_interviews?: number;
    [key: string]: number | undefined;
  };
}

interface Quota {
  quota_type: string;
  name: string;
  limit: number;
  used: number;
  remaining: number;
  percentage_used: number;
}

interface SubscriptionData {
  plan_id: number;
  plan_name: string;
  plan_tier: string;
  price: number;
  billing_interval: string;
  subscription_status: string;
  quotas?: {
    [key: string]: { limit: number; used: number; remaining: number };
  };
}

interface SubscriptionPlanProps {
  onBack?: () => void;
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

export default function SubscriptionPlan({ onBack }: SubscriptionPlanProps) {
  const [currentSubscription, setCurrentSubscription] = useState<SubscriptionData | null>(null);
  const [availablePlans, setAvailablePlans] = useState<Plan[]>([]);
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);
  const [showUpgradeConfirm, setShowUpgradeConfirm] = useState(false);

  // New state for plan selection options
  const [isolationType, setIsolationType] = useState<'schema' | 'database'>('schema');
  const [isNewTenant, setIsNewTenant] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [transactionResult, setTransactionResult] = useState<TransactionResult | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'https://talentflowdata.api.mo.vc/api/v1';
  const BILLING_API_BASE = process.env.NEXT_PUBLIC_BILLING_API_URL || 'https://talentflowdata.api.mo.vc';

  useEffect(() => {
    fetchData();
  }, []);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('accessToken');
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);

    try {
      const [subResponse, plansResponse, quotasResponse, meResponse] = await Promise.all([
        fetch(`${API_BASE}/subscription/current`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/subscription/plans`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/subscription/quotas`, { headers: getAuthHeaders() }),
        fetch(`${API_BASE}/auth/me`, { headers: getAuthHeaders() }),
      ]);

      if (subResponse.ok) {
        const subData = await subResponse.json();
        if (subData.status === 'success') {
          setCurrentSubscription(subData.data);
        }
      }

      if (plansResponse.ok) {
        const plansData = await plansResponse.json();
        if (plansData.status === 'success') {
          setAvailablePlans(plansData.data.plans || []);
        }
      }

      if (quotasResponse.ok) {
        const quotasData = await quotasResponse.json();
        if (quotasData.status === 'success') {
          setQuotas(quotasData.data.quotas || []);
        }
      }

      if (meResponse.ok) {
        const meData = await meResponse.json();
        if (meData.tenant_id) {
          setTenantId(meData.tenant_id);
        }
      }
    } catch (err) {
      setError('Failed to load subscription data');
      console.error('Error fetching subscription data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async (planId: number) => {
    setSelectedPlanId(planId);
    setShowUpgradeConfirm(true);
  };

  const confirmUpgrade = async () => {
    if (!selectedPlanId || !tenantId) {
      setError('Missing tenant ID or plan selection');
      return;
    }

    setUpgrading(true);
    setError(null);

    try {
      // Call Deejan's billing API for plan selection
      const response = await fetch(`${BILLING_API_BASE}/api/v1/subscriptions/${tenantId}/select-plan`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          plan_id: selectedPlanId,
          schema_per_tenant: isolationType === 'schema',
          database_per_tenant: isolationType === 'database',
          is_new_tenant: isNewTenant,
        }),
      });

      const data = await response.json();

      if (response.ok && data.status === 'success') {
        // Store transaction result and show success modal
        setTransactionResult(data.data);
        setShowUpgradeConfirm(false);
        setShowResultModal(true);
        // Refresh data after upgrade
        await fetchData();
      } else {
        setError(data.detail || data.message || 'Failed to upgrade plan');
      }
    } catch (err) {
      setError('Failed to upgrade plan. Please try again.');
      console.error('Error upgrading plan:', err);
    } finally {
      setUpgrading(false);
    }
  };

  const getQuotaIcon = (quotaType: string) => {
    switch (quotaType) {
      case 'RU':
        return <Upload className="w-5 h-5" />;
      case 'RS':
        return <Target className="w-5 h-5" />;
      case 'AS':
        return <ClipboardCheck className="w-5 h-5" />;
      case 'AIU':
        return <Video className="w-5 h-5" />;
      default:
        return <Zap className="w-5 h-5" />;
    }
  };

  const getQuotaColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-600 bg-red-100 border-red-200';
    if (percentage >= 75) return 'text-yellow-600 bg-yellow-100 border-yellow-200';
    return 'text-green-600 bg-green-100 border-green-200';
  };

  const getTierBadge = (tier: string) => {
    switch (tier.toUpperCase()) {
      case 'FREE':
        return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'PROFESSIONAL':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'ENTERPRISE':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30 flex items-center justify-center">
        <div className="flex items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <span className="text-lg text-gray-600">Loading subscription data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
                <Crown className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl text-gray-900">Subscription & Plan</h1>
                <p className="text-sm text-gray-600 mt-0.5">
                  Manage your subscription and view usage quotas
                </p>
              </div>
            </div>
            {onBack && (
              <button
                onClick={onBack}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors font-medium"
              >
                Back
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-700">{error}</span>
          </div>
        )}

        {/* Current Plan Card */}
        {currentSubscription && (
          <div className="bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl shadow-xl p-8 mb-8 text-white">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-xl">Current Plan</h2>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium bg-white/20 border border-white/30`}>
                    {currentSubscription.plan_tier}
                  </span>
                </div>
                <h3 className="text-3xl font-bold">{currentSubscription.plan_name}</h3>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold">${currentSubscription.price}</div>
                <div className="text-sm text-blue-100">/{currentSubscription.billing_interval?.toLowerCase() || 'month'}</div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-200" />
                <span className="text-sm text-blue-100">Status: {currentSubscription.subscription_status || 'Active'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-200" />
                <span className="text-sm text-blue-100">Billing: {currentSubscription.billing_interval}</span>
              </div>
            </div>
          </div>
        )}

        {/* Quotas Section */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Usage Quotas</h2>
          <div className="grid grid-cols-4 gap-6">
            {quotas.map((quota) => (
              <div
                key={quota.quota_type}
                className="bg-white rounded-xl shadow-md border border-gray-200 p-6"
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${getQuotaColor(quota.percentage_used)}`}>
                    {getQuotaIcon(quota.quota_type)}
                  </div>
                  <span className={`text-sm font-medium ${
                    quota.percentage_used >= 90 ? 'text-red-600' :
                    quota.percentage_used >= 75 ? 'text-yellow-600' : 'text-green-600'
                  }`}>
                    {quota.percentage_used.toFixed(0)}%
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">{quota.name}</h3>
                <div className="text-sm text-gray-600 mb-3">
                  {quota.used} / {quota.limit === -1 ? 'Unlimited' : quota.limit}
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      quota.percentage_used >= 90 ? 'bg-red-500' :
                      quota.percentage_used >= 75 ? 'bg-yellow-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(quota.percentage_used, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Available Plans */}
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Available Plans</h2>
          <div className="grid grid-cols-3 gap-6">
            {availablePlans.map((plan) => {
              const isCurrentPlan = currentSubscription?.plan_id === plan.id;
              const isUpgrade = currentSubscription && plan.price > currentSubscription.price;

              return (
                <div
                  key={plan.id}
                  className={`bg-white rounded-xl shadow-md border-2 p-6 transition-all ${
                    isCurrentPlan ? 'border-purple-500 ring-2 ring-purple-100' : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getTierBadge(plan.tier)}`}>
                      {plan.tier}
                    </span>
                    {isCurrentPlan && (
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700 border border-purple-200">
                        Current Plan
                      </span>
                    )}
                  </div>

                  <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                  <div className="mb-6">
                    <span className="text-3xl font-bold text-gray-900">${plan.price}</span>
                    <span className="text-gray-500">/{plan.billing_interval?.toLowerCase() || 'month'}</span>
                  </div>

                  <ul className="space-y-3 mb-6">
                    <li className="flex items-center gap-2 text-sm text-gray-600">
                      <Check className="w-4 h-4 text-green-500" />
                      <span>
                        {plan.features.resume_uploads === -1 ? 'Unlimited' : plan.features.resume_uploads} Resume Uploads
                      </span>
                    </li>
                    <li className="flex items-center gap-2 text-sm text-gray-600">
                      <Check className="w-4 h-4 text-green-500" />
                      <span>
                        {plan.features.resume_scoring === -1 ? 'Unlimited' : plan.features.resume_scoring} Resume Scoring
                      </span>
                    </li>
                    <li className="flex items-center gap-2 text-sm text-gray-600">
                      <Check className="w-4 h-4 text-green-500" />
                      <span>
                        {plan.features.assessments === -1 ? 'Unlimited' : plan.features.assessments} Assessments
                      </span>
                    </li>
                    <li className="flex items-center gap-2 text-sm text-gray-600">
                      <Check className="w-4 h-4 text-green-500" />
                      <span>
                        {plan.features.ai_interviews === -1 ? 'Unlimited' : plan.features.ai_interviews} AI Interviews
                      </span>
                    </li>
                  </ul>

                  {!isCurrentPlan && (
                    <button
                      onClick={() => handleUpgrade(plan.id)}
                      className={`w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors ${
                        isUpgrade
                          ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {isUpgrade ? (
                        <>
                          <TrendingUp className="w-4 h-4" />
                          Upgrade Plan
                        </>
                      ) : (
                        <>
                          <ArrowRight className="w-4 h-4" />
                          Switch Plan
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Upgrade Confirmation Modal */}
      {showUpgradeConfirm && selectedPlanId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-lg w-full mx-4">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Configure Plan Upgrade</h3>
                <p className="text-sm text-gray-600">Select your preferences before upgrading</p>
              </div>
            </div>

            {(() => {
              const selectedPlan = availablePlans.find(p => p.id === selectedPlanId);
              return selectedPlan ? (
                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-600">New Plan</span>
                    <span className="font-semibold text-gray-900">{selectedPlan.name}</span>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-600">Current Plan</span>
                    <span className="font-semibold text-gray-900">{currentSubscription?.plan_name || 'N/A'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Price</span>
                    <span className="font-semibold text-gray-900">${selectedPlan.price}/{selectedPlan.billing_interval?.toLowerCase()}</span>
                  </div>
                </div>
              ) : null;
            })()}

            {/* Isolation Type Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Select Isolation Type
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setIsolationType('schema')}
                  className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                    isolationType === 'schema'
                      ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <Layers className={`w-8 h-8 ${isolationType === 'schema' ? 'text-purple-600' : 'text-gray-400'}`} />
                  <span className={`font-medium ${isolationType === 'schema' ? 'text-purple-700' : 'text-gray-700'}`}>
                    Schema
                  </span>
                  <span className="text-xs text-gray-500 text-center">
                    Shared database, separate schema
                  </span>
                  {isolationType === 'schema' && (
                    <CheckCircle2 className="w-5 h-5 text-purple-600 absolute top-2 right-2" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsolationType('database')}
                  className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                    isolationType === 'database'
                      ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <Database className={`w-8 h-8 ${isolationType === 'database' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span className={`font-medium ${isolationType === 'database' ? 'text-blue-700' : 'text-gray-700'}`}>
                    Database
                  </span>
                  <span className="text-xs text-gray-500 text-center">
                    Dedicated database per tenant
                  </span>
                  {isolationType === 'database' && (
                    <CheckCircle2 className="w-5 h-5 text-blue-600 absolute top-2 right-2" />
                  )}
                </button>
              </div>
            </div>

            {/* Tenant Type Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Tenant Type
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setIsNewTenant(false)}
                  className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                    !isNewTenant
                      ? 'border-green-500 bg-green-50 ring-2 ring-green-200'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <Package className={`w-8 h-8 ${!isNewTenant ? 'text-green-600' : 'text-gray-400'}`} />
                  <span className={`font-medium ${!isNewTenant ? 'text-green-700' : 'text-gray-700'}`}>
                    Existing Tenant
                  </span>
                  <span className="text-xs text-gray-500 text-center">
                    Upgrade existing tenant
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsNewTenant(true)}
                  className={`p-4 rounded-xl border-2 transition-all flex flex-col items-center gap-2 ${
                    isNewTenant
                      ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-200'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <Zap className={`w-8 h-8 ${isNewTenant ? 'text-orange-600' : 'text-gray-400'}`} />
                  <span className={`font-medium ${isNewTenant ? 'text-orange-700' : 'text-gray-700'}`}>
                    New Tenant
                  </span>
                  <span className="text-xs text-gray-500 text-center">
                    Fresh tenant setup
                  </span>
                </button>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="text-sm text-blue-800">
                <div className="flex items-center justify-between mb-1">
                  <span>Isolation Type:</span>
                  <span className="font-medium uppercase">{isolationType}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Tenant Type:</span>
                  <span className="font-medium">{isNewTenant ? 'New' : 'Existing'}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowUpgradeConfirm(false);
                  setSelectedPlanId(null);
                  setIsolationType('schema');
                  setIsNewTenant(false);
                }}
                disabled={upgrading}
                className="flex-1 py-3 px-4 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmUpgrade}
                disabled={upgrading}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg font-medium hover:from-purple-700 hover:to-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {upgrading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Confirm Upgrade
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Result Modal */}
      {showResultModal && transactionResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">Upgrade Successful!</h3>
                <p className="text-sm text-gray-600">Your plan has been upgraded successfully</p>
              </div>
            </div>

            {/* Transaction Details */}
            <div className="space-y-4 mb-6">
              {/* Plan Info */}
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl p-4 border border-purple-200">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Crown className="w-5 h-5 text-purple-600" />
                  Plan Details
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Plan Name:</span>
                    <span className="ml-2 font-medium text-gray-900 capitalize">{transactionResult.plan_name}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Tier:</span>
                    <span className="ml-2 font-medium text-gray-900">{transactionResult.plan_tier}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Old Plan ID:</span>
                    <span className="ml-2 font-medium text-gray-900">{transactionResult.old_plan_id}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">New Plan ID:</span>
                    <span className="ml-2 font-medium text-gray-900">{transactionResult.new_plan_id}</span>
                  </div>
                </div>
              </div>

              {/* Isolation Info */}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Database className="w-5 h-5 text-blue-600" />
                  Provisioning Details
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Isolation Type:</span>
                    <span className="ml-2 font-medium text-gray-900 uppercase">{transactionResult.isolation_type}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Status:</span>
                    <span className="ml-2 font-medium text-green-600 capitalize">{transactionResult.provisioning?.status}</span>
                  </div>
                  {transactionResult.provisioning?.schema_name && (
                    <div className="col-span-2">
                      <span className="text-gray-600">Schema Name:</span>
                      <span className="ml-2 font-medium text-gray-900 font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                        {transactionResult.provisioning.schema_name}
                      </span>
                    </div>
                  )}
                  {transactionResult.provisioning?.database_name && (
                    <div className="col-span-2">
                      <span className="text-gray-600">Database:</span>
                      <span className="ml-2 font-medium text-gray-900 font-mono text-xs bg-gray-100 px-2 py-1 rounded">
                        {transactionResult.provisioning.database_name}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Invoice & Transaction */}
              <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                <h4 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-green-600" />
                  Billing Details
                </h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Invoice Number:</span>
                    <span className="ml-2 font-medium text-gray-900">{transactionResult.invoice_number}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Total Amount:</span>
                    <span className="ml-2 font-bold text-green-700">${transactionResult.total_amount?.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Transaction ID:</span>
                    <span className="ml-2 font-medium text-gray-900">#{transactionResult.transaction_id}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Subscription ID:</span>
                    <span className="ml-2 font-medium text-gray-900">#{transactionResult.subscription_id}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-600">External Ref:</span>
                    <span className="ml-2 font-mono text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                      {transactionResult.external_transaction_id}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setShowResultModal(false);
                setTransactionResult(null);
                setSelectedPlanId(null);
              }}
              className="w-full py-3 px-4 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:from-green-700 hover:to-emerald-700 transition-colors flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
