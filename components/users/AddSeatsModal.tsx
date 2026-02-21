'use client';

/**
 * AddSeatsModal Component
 * Allows purchasing additional user seat credits as an addon
 */

import React, { useState, useEffect } from 'react';
import { handleUnauthorized } from '@/lib/services/api';
import {
  X,
  Users,
  Plus,
  Minus,
  ShoppingCart,
  CreditCard,
  AlertCircle,
  CheckCircle,
  Loader2,
  Info
} from 'lucide-react';
import { toast } from 'sonner';
import { useRazorpay } from '@/lib/hooks/useRazorpay';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface AddSeatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSeats: number;
  maxSeats: number;
  planName: string;
  onSuccess?: () => void;
}

interface SeatPricing {
  addon_id?: number;
  addon_name?: string;
  units_per_package: number;  // e.g., 5 seats per package
  price_per_package: number;  // e.g., ₹49 per package
  currency: string;
  max_packages?: number;
}

// Helper to get currency symbol
const getCurrencySymbol = (currency: string): string => {
  switch (currency?.toUpperCase()) {
    case 'INR': return '₹';
    case 'USD': return '$';
    case 'EUR': return '€';
    case 'GBP': return '£';
    default: return currency || '₹';
  }
};

export default function AddSeatsModal({
  isOpen,
  onClose,
  currentSeats,
  maxSeats,
  planName,
  onSuccess
}: AddSeatsModalProps) {
  const { openCheckout, isProcessing: razorpayProcessing } = useRazorpay();
  const [quantity, setQuantity] = useState(1);  // Number of packages to buy
  const [isLoading, setIsLoading] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [pricing, setPricing] = useState<SeatPricing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadPricing();
      setQuantity(1);
      setError(null);
    }
  }, [isOpen]);

  const loadPricing = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
      // Fetch from same /addons API as usage-quotas page
      const response = await fetch(`${API_URL}/addons?active_only=true&public_only=true`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const result = await response.json();
      console.log('[AddSeatsModal] Addons response:', response.status, result);

      if (response.ok) {
        const addons = result.data || result || [];

        // Find seat addon (same logic as usage-quotas page)
        const seatAddon = addons.find((addon: any) => {
          const name = (addon.name || addon.addon_name || '').toLowerCase();
          return name.includes('seat') || name.includes('max_seats');
        });

        if (seatAddon) {
          console.log('[AddSeatsModal] Found seat addon (raw):', JSON.stringify(seatAddon, null, 2));
          const units = seatAddon.credit_amount || seatAddon.min_quantity || 1;
          const price = seatAddon.price || seatAddon.unit_price || 0;
          console.log('[AddSeatsModal] Extracted: units=', units, 'price=', price);
          setPricing({
            units_per_package: units,
            price_per_package: price,
            currency: seatAddon.currency || 'INR',
            addon_id: seatAddon.id,
            addon_name: seatAddon.name || seatAddon.addon_name,
            max_packages: seatAddon.max_quantity || 50,
          });
        } else {
          console.error('[AddSeatsModal] No seat addon found in:', addons.map((a: any) => a.name));
          setError('Seat addon not available');
          setPricing(null);
        }
      } else {
        console.error('[AddSeatsModal] Addons API error:', result);
        setError('Failed to load pricing. Please try again.');
        setPricing(null);
      }
    } catch (err) {
      console.error('Failed to load addons:', err);
      setError('Failed to load pricing. Please try again.');
      setPricing(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (quantity < 1 || !pricing) {
      setError('Please select at least 1 package');
      return;
    }

    setIsPurchasing(true);
    setError(null);

    // Calculate total seats being added
    const totalSeats = quantity * pricing.units_per_package;

    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');

      // Step 1: Create Razorpay order
      const orderRes = await fetch(`${API_URL}/addons/create-order`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          credit_type: 'max_seats',
          quantity: totalSeats,
        }),
      });

      if (orderRes.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!orderRes.ok) {
        const errData = await orderRes.json().catch(() => ({}));
        throw new Error(errData.detail || `Failed to create order: ${orderRes.status}`);
      }

      const orderData = await orderRes.json();
      console.log('[AddSeatsModal] Razorpay order created:', orderData);

      // Step 2: Open Razorpay checkout modal
      let paymentResponse;
      try {
        const stored = localStorage.getItem('talentflow_user');
        const u = stored ? JSON.parse(stored) : {};
        paymentResponse = await openCheckout({
          orderId: orderData.order_id,
          amount: orderData.amount,
          currency: orderData.currency,
          planName: 'User Seats',
          userName: u.name || '',
          userEmail: u.email || '',
        });
      } catch (checkoutErr: any) {
        setIsPurchasing(false);
        if (checkoutErr?.message?.includes('cancelled')) {
          toast.info('Payment cancelled');
        } else {
          toast.error(checkoutErr?.message || 'Payment failed');
        }
        return;
      }

      // Step 3: Complete purchase with Razorpay payment credentials
      const response = await fetch(`${API_URL}/addons/purchase-seats`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          quantity: totalSeats,
          razorpay_payment_id: paymentResponse.razorpay_payment_id,
          razorpay_order_id: paymentResponse.razorpay_order_id,
          razorpay_signature: paymentResponse.razorpay_signature,
        }),
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail?.message || data.detail || 'Failed to purchase seats');
      }

      toast.success(`Successfully added ${totalSeats} seat${totalSeats > 1 ? 's' : ''} to your account!`);

      // Queue audit verification for seats purchase (non-blocking)
      try {
        const mod = await import('@/lib/services/auditVerificationService');
        const stored = localStorage.getItem('talentflow_user');
        const u = stored ? JSON.parse(stored) : {};
        mod.auditVerificationService.storePendingVerification({
          action: 'seats_purchase',
          entity_type: 'seats',
          entity_id: String(totalSeats),
          user_id: u.id,
          user_email: u.email,
          timestamp: new Date().toISOString(),
        });
        console.log('[AuditVerification] Queued seats purchase verification');
      } catch (e) { console.warn('[AuditVerification] Failed to queue:', e); }

      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error('Purchase error:', err);
      setError(err.message || 'Failed to purchase seats. Please try again.');
    } finally {
      setIsPurchasing(false);
    }
  };

  const incrementQuantity = () => {
    const maxPackages = pricing?.max_packages || 50;
    if (quantity < maxPackages) {
      setQuantity(prev => prev + 1);
    }
  };

  const decrementQuantity = () => {
    if (quantity > 1) {
      setQuantity(prev => prev - 1);
    }
  };

  // Calculate totals from API data
  const unitsPerPackage = pricing?.units_per_package || 0;
  const pricePerPackage = pricing?.price_per_package || 0;
  const totalSeats = quantity * unitsPerPackage;
  const totalPrice = (quantity * pricePerPackage).toFixed(2);
  const currency = pricing?.currency || 'INR';

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 sm:px-6 py-4 sm:py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-white">Add User Seats</h2>
                <p className="text-xs sm:text-sm text-blue-100">Expand your team capacity</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 sm:py-12">
              <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-blue-600" />
            </div>
          ) : (
            <>
              {/* Current Status */}
              <div className="bg-gray-50 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs sm:text-sm text-gray-600">Current Plan</span>
                  <span className="text-xs sm:text-sm font-medium text-gray-900">{planName}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm text-gray-600">Active Users</span>
                  <span className="text-xs sm:text-sm font-medium text-gray-900">
                    {currentSeats} / {maxSeats === -1 ? '∞' : maxSeats} seats
                  </span>
                </div>
                {currentSeats >= maxSeats && maxSeats !== -1 && (
                  <div className="mt-2 sm:mt-3 flex items-center gap-2 text-red-600">
                    <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="text-[10px] sm:text-xs font-medium">Seat limit reached</span>
                  </div>
                )}
              </div>

              {/* Package Selector */}
              <div className="mb-4 sm:mb-6">
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-2 sm:mb-3">
                  Number of packages to buy
                </label>
                <div className="flex items-center justify-center gap-3 sm:gap-4">
                  <button
                    onClick={decrementQuantity}
                    disabled={quantity <= 1}
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl border-2 border-gray-200 flex items-center justify-center text-gray-600 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Minus className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                  <div className="w-20 sm:w-24 text-center">
                    <input
                      type="number"
                      min={1}
                      max={pricing?.max_packages || 50}
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, Math.min(pricing?.max_packages || 50, parseInt(e.target.value) || 1)))}
                      className="w-full text-center text-2xl sm:text-3xl font-bold text-gray-900 border-0 focus:ring-0 bg-transparent"
                    />
                    <span className="text-xs sm:text-sm text-gray-500">package{quantity > 1 ? 's' : ''}</span>
                  </div>
                  <button
                    onClick={incrementQuantity}
                    disabled={pricing ? quantity >= (pricing.max_packages || 50) : false}
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl border-2 border-gray-200 flex items-center justify-center text-gray-600 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </div>
                {pricing && (
                  <p className="text-center text-xs sm:text-sm text-gray-500 mt-2">
                    = {totalSeats} seat{totalSeats !== 1 ? 's' : ''} total
                  </p>
                )}
              </div>

              {/* Pricing */}
              {pricing && (
                <div className="bg-blue-50 rounded-xl p-3 sm:p-4 mb-4 sm:mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs sm:text-sm text-blue-700">Package</span>
                    <span className="text-xs sm:text-sm font-medium text-blue-900">
                      {unitsPerPackage} seats for {getCurrencySymbol(currency)}{pricePerPackage}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-blue-200">
                    <span className="text-sm sm:text-base font-medium text-blue-800">Total ({totalSeats} seats)</span>
                    <span className="text-xl sm:text-2xl font-bold text-blue-900">
                      {getCurrencySymbol(currency)}{totalPrice}
                    </span>
                  </div>
                </div>
              )}

              {/* Info */}
              <div className="flex items-start gap-2 p-2.5 sm:p-3 bg-gray-50 rounded-lg mb-4 sm:mb-6">
                <Info className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] sm:text-xs text-gray-600">
                  Additional seats will be available immediately after purchase.
                  You'll be charged on your next billing cycle.
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 p-2.5 sm:p-3 bg-red-50 border border-red-200 rounded-lg mb-4 sm:mb-6">
                  <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs sm:text-sm text-red-700">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2.5 sm:py-3 border border-gray-300 text-gray-700 rounded-xl font-medium text-sm sm:text-base hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePurchase}
                  disabled={isPurchasing || razorpayProcessing || quantity < 1 || !pricing}
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isPurchasing || razorpayProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-4 h-4" />
                      Pay & Add {totalSeats} Seat{totalSeats !== 1 ? 's' : ''}
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
