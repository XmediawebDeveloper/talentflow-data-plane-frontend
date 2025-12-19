'use client';

import { Wallet, Plus, CreditCard, Trash2, Check, Building2, X, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';

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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

export default function PaymentMethodsPage() {
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
        alert('Please log in to add a payment method');
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
        alert(error.detail || 'Failed to add payment method');
      }
    } catch (error) {
      console.error('Error adding payment method:', error);
      alert('Failed to add payment method');
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
    if (!confirm('Are you sure you want to delete this payment method?')) return;

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

      if (response.ok) {
        setPaymentMethods(prev => prev.filter(pm => pm.id !== id));
      }
    } catch (error) {
      console.error('Error deleting payment method:', error);
    } finally {
      setDeleting(null);
    }
  };

  const getCardIcon = (cardType: string) => {
    // You could replace this with actual card brand icons
    return <CreditCard className="w-6 h-6 text-gray-600" />;
  };

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-blue-50">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-green-600 to-green-700 rounded-xl flex items-center justify-center shadow-lg">
                <Wallet className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900">Payment Methods</h1>
                <p className="text-sm text-gray-600">Manage your payment methods</p>
              </div>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Payment Method
            </button>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        )}

        {/* Empty State */}
        {!loading && paymentMethods.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CreditCard className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No payment methods</h3>
            <p className="text-gray-500 mb-6">Add a payment method to manage your subscription</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Payment Method
            </button>
          </div>
        )}

        {/* Payment Methods List */}
        {!loading && paymentMethods.length > 0 && (
          <div className="space-y-4">
            {paymentMethods.map((method) => (
              <div
                key={method.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-6"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                      {getCardIcon(method.card_type)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">
                        {method.card_type} •••• {method.card_last_four}
                      </p>
                      <p className="text-sm text-gray-500">
                        {method.cardholder_name} • Expires {method.expiry_month}/{method.expiry_year}
                      </p>
                    </div>
                    {method.is_default && (
                      <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!method.is_default && (
                      <button
                        onClick={() => setAsDefault(method.id)}
                        className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        Set as Default
                      </button>
                    )}
                    <button
                      onClick={() => deleteMethod(method.id)}
                      disabled={deleting === method.id}
                      className="p-2 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                    >
                      {deleting === method.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-red-600" />
                      ) : (
                        <Trash2 className="w-4 h-4 text-red-600" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add Payment Method Info */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-blue-900">Secure Payments</h3>
              <p className="text-sm text-blue-700 mt-1">
                All payment information is securely processed and stored. We use industry-standard encryption to protect your data.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Add Payment Method Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Add Payment Method</h2>
                  <p className="text-sm text-gray-500">Enter your card details</p>
                </div>
              </div>
              <button
                onClick={() => { setShowAddModal(false); resetForm(); }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Card Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-gray-700">Card Information</h3>

                {/* Cardholder Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cardholder Name *
                  </label>
                  <input
                    type="text"
                    value={formData.cardholderName}
                    onChange={(e) => setFormData({ ...formData, cardholderName: e.target.value })}
                    placeholder="John Doe"
                    className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      formErrors.cardholderName ? 'border-red-300' : 'border-gray-300'
                    }`}
                  />
                  {formErrors.cardholderName && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.cardholderName}</p>
                  )}
                </div>

                {/* Card Number */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Card Number *
                  </label>
                  <input
                    type="text"
                    value={formData.cardNumber}
                    onChange={(e) => setFormData({ ...formData, cardNumber: formatCardNumber(e.target.value) })}
                    placeholder="1234 5678 9012 3456"
                    maxLength={19}
                    className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      formErrors.cardNumber ? 'border-red-300' : 'border-gray-300'
                    }`}
                  />
                  {formErrors.cardNumber && (
                    <p className="text-red-500 text-xs mt-1">{formErrors.cardNumber}</p>
                  )}
                </div>

                {/* Expiry and CVV */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Month *
                    </label>
                    <input
                      type="text"
                      value={formData.expiryMonth}
                      onChange={(e) => setFormData({ ...formData, expiryMonth: e.target.value.replace(/\D/g, '').slice(0, 2) })}
                      placeholder="MM"
                      maxLength={2}
                      className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        formErrors.expiryMonth ? 'border-red-300' : 'border-gray-300'
                      }`}
                    />
                    {formErrors.expiryMonth && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.expiryMonth}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Year *
                    </label>
                    <input
                      type="text"
                      value={formData.expiryYear}
                      onChange={(e) => setFormData({ ...formData, expiryYear: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                      placeholder="YYYY"
                      maxLength={4}
                      className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        formErrors.expiryYear ? 'border-red-300' : 'border-gray-300'
                      }`}
                    />
                    {formErrors.expiryYear && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.expiryYear}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      CVV *
                    </label>
                    <input
                      type="password"
                      value={formData.cvv}
                      onChange={(e) => setFormData({ ...formData, cvv: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                      placeholder="•••"
                      maxLength={4}
                      className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        formErrors.cvv ? 'border-red-300' : 'border-gray-300'
                      }`}
                    />
                    {formErrors.cvv && (
                      <p className="text-red-500 text-xs mt-1">{formErrors.cvv}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Billing Address (Optional) */}
              <div className="space-y-4 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-700">Billing Address (Optional)</h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Street Address
                  </label>
                  <input
                    type="text"
                    value={formData.billingAddress}
                    onChange={(e) => setFormData({ ...formData, billingAddress: e.target.value })}
                    placeholder="123 Main Street"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      City
                    </label>
                    <input
                      type="text"
                      value={formData.billingCity}
                      onChange={(e) => setFormData({ ...formData, billingCity: e.target.value })}
                      placeholder="New York"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      ZIP Code
                    </label>
                    <input
                      type="text"
                      value={formData.billingZip}
                      onChange={(e) => setFormData({ ...formData, billingZip: e.target.value })}
                      placeholder="10001"
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Country
                  </label>
                  <select
                    value={formData.billingCountry}
                    onChange={(e) => setFormData({ ...formData, billingCountry: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                </div>
              </div>

              {/* Set as Default */}
              <div className="flex items-center gap-3 pt-4">
                <input
                  type="checkbox"
                  id="setAsDefault"
                  checked={formData.setAsDefault}
                  onChange={(e) => setFormData({ ...formData, setAsDefault: e.target.checked })}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="setAsDefault" className="text-sm text-gray-700">
                  Set as default payment method
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
              <button
                onClick={() => { setShowAddModal(false); resetForm(); }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
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
