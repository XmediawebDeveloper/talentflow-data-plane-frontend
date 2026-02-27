'use client';

/**
 * AddSeatsModal Component
 * Allows purchasing additional user seat credits as an addon.
 * UI matches the enhanced addon purchase modal in UsageDashboard.tsx.
 */

import React, { useState, useEffect } from 'react';
import { handleUnauthorized } from '@/lib/services/api';
import {
  X,
  Users,
  Zap,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Loader2,
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
  units_per_package: number;
  price_per_package: number;
  currency: string;
  max_packages?: number;
}

export default function AddSeatsModal({
  isOpen,
  onClose,
  currentSeats,
  maxSeats,
  planName,
  onSuccess
}: AddSeatsModalProps) {
  const { openCheckout, isProcessing: razorpayProcessing } = useRazorpay();
  const [quantity, setQuantity] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [pricing, setPricing] = useState<SeatPricing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadPricing();
      setQuantity(1);
      setError(null);
      setPurchaseSuccess(null);
    }
  }, [isOpen]);

  const loadPricing = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
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

        const seatAddon = addons.find((addon: any) => {
          const name = (addon.name || addon.addon_name || '').toLowerCase();
          return name.includes('seat') || name.includes('max_seats');
        });

        if (seatAddon) {
          console.log('[AddSeatsModal] Found seat addon:', JSON.stringify(seatAddon, null, 2));
          const units = seatAddon.credit_amount || seatAddon.min_quantity || 1;
          const price = seatAddon.price || seatAddon.unit_price || 0;
          setPricing({
            units_per_package: units,
            price_per_package: price,
            currency: seatAddon.currency || 'INR',
            addon_id: seatAddon.id,
            addon_name: seatAddon.name || seatAddon.addon_name,
            max_packages: seatAddon.max_quantity || 50,
          });
        } else {
          console.error('[AddSeatsModal] No seat addon found');
          setError('Seat addon not available');
          setPricing(null);
        }
      } else {
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

      // Step 2: Open Razorpay checkout
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

      // Step 3: Complete purchase
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

      const successMsg = `${totalSeats} seat${totalSeats > 1 ? 's' : ''} added to your account!`;
      setPurchaseSuccess(successMsg);
      toast.success(`Successfully added ${totalSeats} seat${totalSeats > 1 ? 's' : ''}!`);

      // Queue audit verification (non-blocking)
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
      } catch (e) { /* non-critical */ }

      onSuccess?.();

    } catch (err: any) {
      console.error('Purchase error:', err);
      setError(err.message || 'Failed to purchase seats. Please try again.');
    } finally {
      setIsPurchasing(false);
    }
  };

  if (!isOpen) return null;

  const pricePerPack = pricing?.price_per_package || 0;
  const unitsPerPack = pricing?.units_per_package || 0;
  const maxPacks = pricing?.max_packages || 50;
  const totalSeats = quantity * unitsPerPack;
  const subtotal = pricePerPack * quantity;
  const gst = subtotal * 0.18;
  const total = subtotal * 1.18;
  const addonDisplayName = (pricing?.addon_name || 'User Seat Pack').replace(/\s*-?\s*Pro$/i, '').trim();

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden animate-in fade-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300 max-h-[95vh] sm:max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="relative px-5 sm:px-7 py-5 sm:py-6 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex-shrink-0 overflow-hidden">
          <div className="absolute -top-6 -right-6 w-32 h-32 bg-white/5 rounded-full" />
          <div className="absolute -bottom-8 -left-4 w-24 h-24 bg-white/5 rounded-full" />
          <div className="relative flex items-center gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white/15 backdrop-blur-sm rounded-2xl flex items-center justify-center flex-shrink-0 border border-white/20">
              <Users className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h2 className="text-lg sm:text-xl font-bold text-white">Add User Seats</h2>
                <span className="text-[10px] font-semibold bg-white/20 text-white px-2 py-0.5 rounded-full border border-white/20">INSTANT</span>
              </div>
              <p className="text-xs sm:text-sm text-gray-400">Add seats to your team capacity</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center hover:bg-white/15 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-gray-300" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="overflow-y-auto flex-1">
          <div className="p-5 sm:p-7 space-y-5">

            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                {/* Success */}
                {purchaseSuccess && (
                  <div className="p-4 bg-green-50 border border-green-200 rounded-2xl flex items-start gap-3 animate-in slide-in-from-top duration-200">
                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-green-800 text-sm">Purchase Successful!</p>
                      <p className="text-xs text-green-600 mt-0.5">{purchaseSuccess}</p>
                    </div>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 animate-in slide-in-from-top duration-200">
                    <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                      <AlertCircle className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-red-800 text-sm">Purchase Failed</p>
                      <p className="text-xs text-red-600 mt-0.5">{error}</p>
                    </div>
                  </div>
                )}

                {/* Addon Details Card */}
                {pricing && (
                  <div className="relative bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-2xl p-4 sm:p-5 overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-gray-200/40 rounded-full -translate-y-8 translate-x-8" />
                    <div className="relative flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm border border-gray-200 flex-shrink-0">
                          <Users className="w-6 h-6 sm:w-7 sm:h-7 text-gray-700" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-bold text-gray-900 text-base sm:text-lg leading-tight truncate">
                            {addonDisplayName}
                          </h3>
                          <p className="text-xs text-gray-500 mt-0.5">{unitsPerPack} seat{unitsPerPack !== 1 ? 's' : ''} per pack</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-500">Per pack</p>
                        <p className="text-lg font-bold text-gray-900">₹{pricePerPack}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Quantity Selector */}
                {pricing && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-semibold text-gray-700">Select Quantity</label>
                      <span className="text-xs text-gray-400">Max {maxPacks} packs</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center bg-gray-100 rounded-2xl border border-gray-200 p-1 gap-1">
                        <button
                          onClick={() => setQuantity(Math.max(1, quantity - 1))}
                          className="w-10 h-10 sm:w-11 sm:h-11 bg-white rounded-xl flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-all font-bold text-lg text-gray-700 shadow-sm border border-gray-200"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="1"
                          max={maxPacks}
                          value={quantity}
                          onChange={(e) => setQuantity(Math.max(1, Math.min(maxPacks, parseInt(e.target.value) || 1)))}
                          className="w-14 sm:w-16 text-center bg-transparent border-none outline-none font-bold text-xl sm:text-2xl text-gray-900"
                        />
                        <button
                          onClick={() => setQuantity(Math.min(maxPacks, quantity + 1))}
                          className="w-10 h-10 sm:w-11 sm:h-11 bg-white rounded-xl flex items-center justify-center hover:bg-gray-50 active:scale-95 transition-all font-bold text-lg text-gray-700 shadow-sm border border-gray-200"
                        >
                          +
                        </button>
                      </div>
                      {/* Total seats panel */}
                      <div className="flex-1 bg-gray-900 text-white rounded-2xl px-4 py-2.5 flex items-center justify-between">
                        <span className="text-xs text-gray-400">Total seats</span>
                        <div className="flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-gray-300" />
                          <span className="font-bold text-lg">+{totalSeats}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Order Summary */}
                {pricing && (
                  <div className="border border-gray-200 rounded-2xl overflow-hidden">
                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                      <h4 className="font-semibold text-gray-700 text-sm">Order Summary</h4>
                      <span className="text-xs text-gray-400">{quantity} pack{quantity > 1 ? 's' : ''}</span>
                    </div>
                    <div className="p-4 sm:p-5 space-y-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Pack size</span>
                        <span className="font-medium text-gray-800">{unitsPerPack} seat{unitsPerPack !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Quantity</span>
                        <span className="font-medium text-gray-800">×{quantity}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">Subtotal</span>
                        <span className="font-medium text-gray-800">₹{subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500">GST (18%)</span>
                        <span className="font-medium text-gray-800">₹{gst.toFixed(2)}</span>
                      </div>
                      <div className="mt-1 pt-3 border-t border-gray-200 flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">Total Amount</p>
                          <p className="text-xs text-gray-400">Incl. all taxes</p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl sm:text-3xl font-bold text-gray-900">₹{total.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-gray-100 bg-white flex-shrink-0">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-5 py-3 border border-gray-200 rounded-2xl text-gray-600 font-semibold text-sm hover:bg-gray-50 hover:border-gray-300 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handlePurchase}
              disabled={isPurchasing || razorpayProcessing || !pricing || !!purchaseSuccess}
              className="flex-1 py-3 bg-gray-900 text-white rounded-2xl font-semibold text-sm hover:bg-gray-800 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-gray-900/20"
            >
              {isPurchasing || razorpayProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-4 h-4 flex-shrink-0" />
                  <span>Pay ₹{total.toFixed(2)}</span>
                </>
              )}
            </button>
          </div>
          <p className="text-center text-[11px] text-gray-400 mt-3 flex items-center justify-center gap-1">
            <span>🔒</span>
            <span>Secured by Razorpay · 256-bit SSL encryption</span>
          </p>
        </div>

      </div>
    </div>
  );
}
