'use client';

import PageBreadcrumb from '@/components/PageBreadcrumb';
import { Wallet, Plus, CreditCard, Trash2, Building2, X, Loader2, Sparkles, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { useState, useEffect } from 'react';
import { handleUnauthorized } from '@/lib/services/api';
import { toast } from 'sonner';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { useAuth } from '@/lib/hooks/useAuth';
import { CardGridSkeleton } from '@/components/ui/skeleton';
import { useScrollRestoration } from '@/lib/hooks/useListViewPersistence';

interface PaymentMethod {
  id: string;
  card_type: string;
  cardholder_name: string;
  card_last_four: string;
  expiry_month: number;
  expiry_year: number;
  is_default: boolean;
  billing_address?: string;
  billing_city?: string;
  billing_zip?: string;
  billing_country?: string;
  created_at?: string;
}

interface CardFormData {
  cardholderName: string;
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  billingAddress: string;
  billingCity: string;
  billingZip: string;
  billingCountry: string;
  setAsDefault: boolean;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export default function PaymentMethodsPage() {
  const dialog = useGlobalDialog();
  const { hasPermission } = useAuth();
  const canAdd = hasPermission('canAddPaymentMethod');
  const canEdit = hasPermission('canEditPaymentMethod');
  const canDelete = hasPermission('canDeletePaymentMethod');
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<CardFormData>({
    cardholderName: '',
    cardNumber: '',
    expiryMonth: '',
    expiryYear: '',
    cvv: '',
    billingAddress: '',
    billingCity: '',
    billingZip: '',
    billingCountry: '',
    setAsDefault: false,
  });

  // Scroll-only persistence: no list filters/pagination to restore here.
  const rootRef = useScrollRestoration<HTMLElement>('sub-payment-methods', !loading);

  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      const authData = localStorage.getItem('auth');
      if (authData) {
        const parsed = JSON.parse(authData);
        return parsed?.tokens?.access_token || parsed?.access_token;
      }
    }
    return null;
  };

  // Fetch payment methods on mount
  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      const token = getAuthToken();
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await fetch(`${API_URL}/api/v1/settings/payment-methods`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setPaymentMethods(data);
      }
    } catch (error) {
      console.error('Error fetching payment methods:', error);
    } finally {
      setLoading(false);
    }
  };

  const detectCardType = (number: string): string => {
    const cleaned = number.replace(/\s/g, '');
    if (/^4/.test(cleaned)) return 'Visa';
    if (/^5[1-5]/.test(cleaned)) return 'Mastercard';
    if (/^3[47]/.test(cleaned)) return 'Amex';
    if (/^6(?:011|5)/.test(cleaned)) return 'Discover';
    return 'Card';
  };

  const formatCardNumber = (value: string): string => {
    const cleaned = value.replace(/\D/g, '');
    const groups = cleaned.match(/.{1,4}/g);
    return groups ? groups.join(' ') : cleaned;
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.cardholderName.trim()) {
      errors.cardholderName = 'Cardholder name is required';
    }

    const cardNumberClean = formData.cardNumber.replace(/\s/g, '');
    if (!cardNumberClean || cardNumberClean.length < 13 || cardNumberClean.length > 19) {
      errors.cardNumber = 'Valid card number is required';
    }

    const month = parseInt(formData.expiryMonth);
    if (!month || month < 1 || month > 12) {
      errors.expiryMonth = 'Valid month (1-12) required';
    }

    const year = parseInt(formData.expiryYear);
    const currentYear = new Date().getFullYear();
    if (!year || year < currentYear || year > currentYear + 20) {
      errors.expiryYear = 'Valid year required';
    }

    if (!formData.cvv || formData.cvv.length < 3 || formData.cvv.length > 4) {
      errors.cvv = 'Valid CVV required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const token = getAuthToken();
      if (!token) {
        toast.error('Please log in to add a payment method');
        return;
      }

      const cardNumberClean = formData.cardNumber.replace(/\s/g, '');
      const cardType = detectCardType(cardNumberClean);
      const last4 = cardNumberClean.slice(-4);

      const response = await fetch(`${API_URL}/api/v1/settings/payment-methods`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          card_type: cardType,
          cardholder_name: formData.cardholderName,
          card_last_four: last4,
          expiry_month: parseInt(formData.expiryMonth),
          expiry_year: parseInt(formData.expiryYear),
          is_default: formData.setAsDefault,
          billing_address: formData.billingAddress || null,
          billing_city: formData.billingCity || null,
          billing_zip: formData.billingZip || null,
          billing_country: formData.billingCountry || null,
        }),
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (response.ok) {
        const newMethod = await response.json();

        // If the new method is default, update others
        if (newMethod.is_default) {
          setPaymentMethods(prev =>
            prev.map(pm => ({ ...pm, is_default: false }))
          );
        }

        setPaymentMethods(prev => [newMethod, ...prev]);
        setShowAddModal(false);
        resetForm();
      } else {
        const error = await response.json();
        toast.error(error.detail || 'Failed to add payment method');
      }
    } catch (error) {
      console.error('Error adding payment method:', error);
      toast.error('Failed to add payment method');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormData({
      cardholderName: '',
      cardNumber: '',
      expiryMonth: '',
      expiryYear: '',
      cvv: '',
      billingAddress: '',
      billingCity: '',
      billingZip: '',
      billingCountry: '',
      setAsDefault: false,
    });
    setFormErrors({});
  };

  const setAsDefault = async (id: string) => {
    try {
      const token = getAuthToken();
      if (!token) return;

      const response = await fetch(`${API_URL}/api/v1/settings/payment-methods/${id}/default`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (response.ok) {
        setPaymentMethods(prev =>
          prev.map(pm => ({ ...pm, is_default: pm.id === id }))
        );
      }
    } catch (error) {
      console.error('Error setting default:', error);
    }
  };

  const deleteMethod = async (id: string) => {
    if (!await dialog.confirm({ title: 'Delete Payment Method', message: 'Are you sure you want to delete this payment method?', variant: 'error', confirmText: 'Delete' })) return;

    setDeleting(id);
    try {
      const token = getAuthToken();
      if (!token) return;

      const response = await fetch(`${API_URL}/api/v1/settings/payment-methods/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (response.ok) {
        setPaymentMethods(prev => prev.filter(pm => pm.id !== id));
      }
    } catch (error) {
      console.error('Error deleting payment method:', error);
    } finally {
      setDeleting(null);
    }
  };

  const getCardIcon = (_cardType: string) => {
    return <CreditCard className="h-6 w-6 text-brand-blue" />;
  };

  return (
    <main ref={rootRef} className="flex-1 overflow-x-hidden bg-slate-50">
      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-4 md:p-8 w-full bg-white rounded-2xl my-4 md:my-5 shadow-2xl">
        <PageBreadcrumb className="mb-4 md:mb-8" items={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Current Plan', href: '/subscription/current-plan' }, { label: 'Payment Methods' }]} />

        {/* Header — title + add button */}
        {canAdd && (
          <div className="flex items-center justify-end mb-4">
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-blue px-4 py-2 text-sm font-medium text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors hover:bg-brand-blue-2"
            >
              <Plus className="h-4 w-4" />
              Add Payment Method
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && <CardGridSkeleton count={3} />}

        {/* Empty State */}
        {!loading && paymentMethods.length === 0 && (
          <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-12 text-center shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
              <CreditCard className="h-7 w-7 text-brand-blue" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-slate-50">No payment methods</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-500">Add a payment method to manage your subscription</p>
            {canAdd && (
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-5 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-blue px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-blue/25 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              >
                <Plus className="h-4 w-4" />
                Add Payment Method
              </button>
            )}
          </div>
        )}

        {/* Payment Methods List */}
        {!loading && paymentMethods.length > 0 && (
          <div className="space-y-4">
            {paymentMethods.map((method) => (
              <div
                key={method.id}
                className={`rounded-2xl border bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-all hover:shadow-md sm:p-6 ${
                  method.is_default
                    ? 'border-brand-blue/20 shadow-brand-blue/10 ring-brand-blue/10'
                    : 'border-gray-100 dark:border-slate-700/60 shadow-brand-blue/5 hover:border-brand-cyan/25'
                }`}
              >
                <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 items-center gap-4">
                    <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
                      {getCardIcon(method.card_type)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-gray-900 dark:text-slate-50">
                          {method.card_type} •••• {method.card_last_four}
                        </p>
                        {method.is_default && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-brand-teal/10 px-2.5 py-1 text-[11px] font-medium text-brand-teal ring-1 ring-brand-teal/15">
                            <ShieldCheck className="h-3 w-3" />
                            Default
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-gray-500 dark:text-slate-500">
                        {method.cardholder_name} · Expires {String(method.expiry_month).padStart(2, '0')}/{method.expiry_year}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canEdit && !method.is_default && (
                      <button
                        onClick={() => setAsDefault(method.id)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 transition-all hover:border-brand-cyan/25 hover:bg-brand-cyan/[0.04] hover:text-brand-blue"
                      >
                        Set as Default
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => deleteMethod(method.id)}
                        disabled={deleting === method.id}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-brand-orange/15 bg-brand-orange/[0.05] text-brand-orange-deep transition-all hover:-translate-y-0.5 hover:bg-brand-orange/[0.1] disabled:translate-y-0 disabled:opacity-50"
                        aria-label="Delete payment method" title="Delete payment method"
                      >
                        {deleting === method.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Secure Payments Info */}
        <div className="mt-8 rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-5 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-teal/10 ring-1 ring-brand-teal/15 shadow-sm shadow-brand-teal/10">
              <ShieldCheck className="h-5 w-5 text-brand-teal" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-50">Secure Payments</h3>
              <p className="mt-1 text-sm text-gray-600 dark:text-slate-400">
                All payment information is securely processed and stored. We use industry-standard encryption to protect your data.
              </p>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Add Payment Method Modal — only renders if user has Add permission */}
      {showAddModal && canAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-3xl border border-white/40 bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-black/5">
            {/* Modal Header */}
            <div className="relative overflow-hidden bg-brand-blue px-5 py-4 text-white sm:px-6">
              <div className="pointer-events-none absolute -top-10 right-0 h-32 w-32 rounded-full bg-white/10 blur-3xl" />
              <div className="relative flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15">
                    <CreditCard className="h-5 w-5 text-white" />
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold">Add Payment Method</h2>
                    <p className="mt-0.5 text-sm text-white/75">Enter your card details to save it for future billing.</p>
                  </div>
                </div>
                <button
                  onClick={() => { setShowAddModal(false); resetForm(); }}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/15"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="max-h-[calc(90vh-184px)] space-y-5 overflow-y-auto p-5 sm:p-6">
              {/* Card Information */}
              <div className="space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-slate-500">Card Information</h3>

                {/* Cardholder Name */}
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
                    Cardholder Name <span className="text-brand-orange">*</span>
                  </span>
                  <input
                    type="text"
                    value={formData.cardholderName}
                    onChange={(e) => setFormData({ ...formData, cardholderName: e.target.value })}
                    placeholder="Name as it appears on the card"
                    className={`w-full rounded-xl border bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 focus:ring-4 ${
                      formErrors.cardholderName ? 'border-red-300 focus:border-red-300 focus:ring-red-100' : 'border-gray-200 dark:border-slate-700 focus:border-brand-blue/30 focus:ring-brand-blue/10'
                    }`}
                  />
                  {formErrors.cardholderName && (
                    <p className="mt-1 text-xs text-red-500">{formErrors.cardholderName}</p>
                  )}
                </label>

                {/* Card Number */}
                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
                    Card Number <span className="text-brand-orange">*</span>
                  </span>
                  <div className={`flex items-center gap-2 rounded-xl border bg-white dark:bg-slate-900 px-3 py-2.5 transition-all focus-within:ring-4 ${
                    formErrors.cardNumber ? 'border-red-300 focus-within:border-red-300 focus-within:ring-red-100' : 'border-gray-200 dark:border-slate-700 focus-within:border-brand-blue/30 focus-within:ring-brand-blue/10'
                  }`}>
                    <CreditCard className="h-4 w-4 text-gray-400 dark:text-slate-500" />
                    <input
                      type="text"
                      value={formData.cardNumber}
                      onChange={(e) => setFormData({ ...formData, cardNumber: formatCardNumber(e.target.value) })}
                      placeholder="•••• •••• •••• ••••"
                      maxLength={19}
                      className="flex-1 bg-transparent text-sm text-gray-900 dark:text-slate-50 outline-none placeholder:text-gray-400"
                    />
                  </div>
                  {formErrors.cardNumber && (
                    <p className="mt-1 text-xs text-red-500">{formErrors.cardNumber}</p>
                  )}
                </label>

                {/* Expiry and CVV */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
                      Month <span className="text-brand-orange">*</span>
                    </span>
                    <input
                      type="text"
                      value={formData.expiryMonth}
                      onChange={(e) => setFormData({ ...formData, expiryMonth: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                      placeholder="MM"
                      maxLength={2}
                      className={`w-full rounded-xl border bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 focus:ring-4 ${
                        formErrors.expiryMonth ? 'border-red-300 focus:border-red-300 focus:ring-red-100' : 'border-gray-200 dark:border-slate-700 focus:border-brand-blue/30 focus:ring-brand-blue/10'
                      }`}
                    />
                    {formErrors.expiryMonth && (
                      <p className="mt-1 text-xs text-red-500">{formErrors.expiryMonth}</p>
                    )}
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
                      Year <span className="text-brand-orange">*</span>
                    </span>
                    <input
                      type="text"
                      value={formData.expiryYear}
                      onChange={(e) => setFormData({ ...formData, expiryYear: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                      placeholder="YYYY"
                      maxLength={4}
                      className={`w-full rounded-xl border bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 focus:ring-4 ${
                        formErrors.expiryYear ? 'border-red-300 focus:border-red-300 focus:ring-red-100' : 'border-gray-200 dark:border-slate-700 focus:border-brand-blue/30 focus:ring-brand-blue/10'
                      }`}
                    />
                    {formErrors.expiryYear && (
                      <p className="mt-1 text-xs text-red-500">{formErrors.expiryYear}</p>
                    )}
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
                      CVV <span className="text-brand-orange">*</span>
                    </span>
                    <input
                      type="password"
                      value={formData.cvv}
                      onChange={(e) => setFormData({ ...formData, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                      placeholder="•••"
                      maxLength={4}
                      className={`w-full rounded-xl border bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 focus:ring-4 ${
                        formErrors.cvv ? 'border-red-300 focus:border-red-300 focus:ring-red-100' : 'border-gray-200 dark:border-slate-700 focus:border-brand-blue/30 focus:ring-brand-blue/10'
                      }`}
                    />
                    {formErrors.cvv && (
                      <p className="mt-1 text-xs text-red-500">{formErrors.cvv}</p>
                    )}
                  </label>
                </div>
              </div>

              {/* Billing Address (Optional) */}
              <div className="space-y-4 border-t border-gray-100 dark:border-slate-700/60 pt-5">
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-brand-blue" />
                  <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-slate-500">Billing Address (Optional)</h3>
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">Street Address</span>
                  <input
                    type="text"
                    value={formData.billingAddress}
                    onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
                    placeholder="Street and number"
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                  />
                </label>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">City</span>
                    <input
                      type="text"
                      value={formData.billingCity}
                      onChange={(e) => setFormData({ ...formData, billingCity: e.target.value })}
                      placeholder="City"
                      className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">ZIP Code</span>
                    <input
                      type="text"
                      value={formData.billingZip}
                      onChange={(e) => setFormData({ ...formData, billingZip: e.target.value })}
                      placeholder="Postal code"
                      className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">Country</span>
                  <select
                    value={formData.billingCountry}
                    onChange={(e) => setFormData({ ...formData, billingCountry: e.target.value })}
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                  >
                    <option value="">Select Country</option>
                    <option value="US">United States</option>
                    <option value="IN">India</option>
                    <option value="GB">United Kingdom</option>
                    <option value="CA">Canada</option>
                    <option value="AU">Australia</option>
                    <option value="DE">Germany</option>
                    <option value="FR">France</option>
                    <option value="SG">Singapore</option>
                    <option value="AE">UAE</option>
                  </select>
                </label>
              </div>

              {/* Set as Default */}
              <label
                htmlFor="setAsDefault"
                className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-all ${
                  formData.setAsDefault
                    ? 'border-brand-blue/25 bg-brand-blue/[0.04]'
                    : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-brand-cyan/25 hover:bg-brand-cyan/[0.04]'
                }`}
              >
                <input
                  type="checkbox"
                  id="setAsDefault"
                  checked={formData.setAsDefault}
                  onChange={(e) => setFormData({ ...formData, setAsDefault: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300 dark:border-slate-700 text-brand-blue focus:ring-brand-blue/30"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-slate-300">Set as default payment method</span>
              </label>
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col items-stretch justify-end gap-2 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-800/50 px-5 py-4 sm:flex-row sm:items-center sm:gap-3 sm:px-6">
              <button
                onClick={() => { setShowAddModal(false); resetForm(); }}
                className="inline-flex items-center justify-center rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-300 transition-all hover:border-gray-300 dark:hover:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-blue px-5 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-blue/25 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    Add Card
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
