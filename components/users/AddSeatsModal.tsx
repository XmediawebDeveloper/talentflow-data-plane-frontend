'use client';

/**
 * AddSeatsModal Component
 * Allows purchasing additional user seat credits as an addon.
 * UI matches the enhanced addon purchase modal in UsageDashboard.tsx.
 */

import React, { useState, useEffect } from 'react';
import { handleUnauthorized } from '@/lib/services/api';
import {
  Users,
  Zap,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ShoppingCart,
  Sparkles,
  Receipt,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { useRazorpay } from '@/lib/hooks/useRazorpay';
import { Skeleton } from '@/components/ui/skeleton';
import AppModal from '@/components/ui/app-modal';
import { Badge } from '@/components/ui/badge';

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
          payment_method: 'razorpay',
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
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          throw new Error('Service temporarily unavailable. Your payment was not charged. Please try again.');
        }
        throw new Error(data.detail?.message || data.detail || 'Failed to purchase seats');
      }

      if (data.status === 'pending') {
        setPurchaseSuccess('Payment received! Your seats are being activated in the background and will appear shortly.');
        toast.success('Payment received! Seats activation in progress.');
        onSuccess?.();
        return;
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
    <AppModal
      open
      size="md"
      zIndexClass="z-50"
      onCancel={onClose}
      cancelDisabled={isPurchasing || razorpayProcessing}
      icon={<Users />}
      title={
        <span className="inline-flex items-center gap-2">
          Add User Seats
          <span className="inline-flex items-center gap-1 text-2xs font-semibold bg-white/20 text-white px-2 py-0.5 rounded-full ring-1 ring-white/30 backdrop-blur-sm">
            <Sparkles className="w-2.5 h-2.5" />
            INSTANT
          </span>
        </span>
      }
      subtitle="Add seats to your team capacity"
      bodyClassName="bg-white dark:bg-slate-900"
      footerStart={
        <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-500">
          <ShieldCheck className="w-3 h-3 text-brand-cyan" />
          Secured by Razorpay · 256-bit SSL encryption
        </span>
      }
      actions={[
        {
          label: isPurchasing || razorpayProcessing ? 'Processing...' : `Pay ₹${total.toFixed(2)}`,
          onClick: handlePurchase,
          disabled: isPurchasing || razorpayProcessing || !pricing || !!purchaseSuccess,
          icon: isPurchasing || razorpayProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4 flex-shrink-0" />,
        },
      ]}
    >
        {/* Body (AppModal scrolls it) */}
        <div>
          <div className="space-y-5">

            {isLoading ? (
              <>
                {/* Addon Details Card skeleton */}
                <div className="relative bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-4 sm:p-5 overflow-hidden shadow-sm">
                  <div className="relative flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                      <Skeleton className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex-shrink-0" />
                      <div className="min-w-0 space-y-2">
                        <Skeleton className="h-5 sm:h-6 w-40" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 space-y-2">
                      <Skeleton className="h-3 w-14 ml-auto" />
                      <Skeleton className="h-5 w-16 ml-auto" />
                    </div>
                  </div>
                </div>

                {/* Quantity Selector skeleton */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-12 sm:h-[52px] w-36 rounded-xl flex-shrink-0" />
                    <Skeleton className="h-12 flex-1 rounded-xl" />
                  </div>
                </div>

                {/* Order Summary skeleton */}
                <div className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                  <div className="px-5 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Skeleton className="w-8 h-8 rounded-lg" />
                      <Skeleton className="h-4 w-28" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <div className="p-4 sm:p-5 space-y-3">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex justify-between items-center">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-16" />
                      </div>
                    ))}
                    <div className="mt-1 pt-3 border-t border-gray-200 dark:border-slate-700 flex justify-between items-center">
                      <div className="space-y-1.5">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-8 w-24" />
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Success */}
                {purchaseSuccess && (
                  <div className="p-4 bg-success-subtle border border-success-line rounded-xl ring-1 ring-success-line flex items-start gap-3 animate-in slide-in-from-top duration-200">
                    <div className="w-9 h-9 bg-success rounded-lg flex items-center justify-center flex-shrink-0 shadow-md shadow-success/25 ring-1 ring-white/10">
                      <CheckCircle2 className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-success-strong text-sm">Purchase Successful!</p>
                      <p className="text-xs text-success mt-0.5">{purchaseSuccess}</p>
                    </div>
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div className="p-4 bg-destructive-subtle border border-destructive-line rounded-xl ring-1 ring-destructive-line flex items-start gap-3 animate-in slide-in-from-top duration-200">
                    <div className="w-9 h-9 bg-destructive rounded-lg flex items-center justify-center flex-shrink-0 shadow-md shadow-destructive/25 ring-1 ring-white/10">
                      <AlertCircle className="w-4 h-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-destructive-strong text-sm">Purchase Failed</p>
                      <p className="text-xs text-destructive mt-0.5">{error}</p>
                    </div>
                  </div>
                )}

                {/* Addon Details Card */}
                {pricing && (
                  <div className="relative bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl p-4 sm:p-5 overflow-hidden shadow-sm hover:shadow-md hover:border-brand-blue/30 transition-all">
                    <div className="absolute top-0 right-0 w-28 h-28 bg-brand-blue/5 rounded-full -translate-y-10 translate-x-10" />
                    <div className="relative flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-brand-blue rounded-xl flex items-center justify-center shadow-md shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                          <Users className="w-6 h-6 sm:w-7 sm:h-7 text-white" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-semibold text-gray-900 dark:text-slate-50 text-base leading-tight truncate">
                            {addonDisplayName}
                          </h3>
                          <p className="text-xs text-gray-500 dark:text-slate-500 mt-0.5">{unitsPerPack} seat{unitsPerPack !== 1 ? 's' : ''} per pack</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-500 dark:text-slate-500">Per pack</p>
                        <p className="text-xl font-bold text-brand-blue">₹{pricePerPack}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Quantity Selector */}
                {pricing && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-sm font-medium text-gray-800 dark:text-slate-100">Select Quantity</label>
                      <Badge variant="muted">Max {maxPacks} packs</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center bg-white dark:bg-slate-900 rounded-xl border border-gray-200 dark:border-slate-700 p-1 gap-1 shadow-sm focus-within:ring-2 focus-within:ring-brand-blue/40 focus-within:border-brand-blue transition-all">
                        <button
                          onClick={() => setQuantity(Math.max(1, quantity - 1))}
                          aria-label="Decrease quantity"
                          className="w-10 h-10 sm:w-11 sm:h-11 bg-brand-blue rounded-lg flex items-center justify-center hover:bg-brand-blue-2 active:scale-95 transition-all font-bold text-lg text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min="1"
                          max={maxPacks}
                          value={quantity}
                          onChange={(e) => setQuantity(Math.max(1, Math.min(maxPacks, parseInt(e.target.value) || 1)))}
                          className="w-14 sm:w-16 text-center bg-transparent border-none outline-none font-bold text-xl sm:text-2xl text-gray-900 dark:text-slate-50"
                        />
                        <button
                          onClick={() => setQuantity(Math.min(maxPacks, quantity + 1))}
                          aria-label="Increase quantity"
                          className="w-10 h-10 sm:w-11 sm:h-11 bg-brand-blue rounded-lg flex items-center justify-center hover:bg-brand-blue-2 active:scale-95 transition-all font-bold text-lg text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10"
                        >
                          +
                        </button>
                      </div>
                      {/* Total seats panel */}
                      <div className="flex-1 bg-brand-blue text-white rounded-xl px-4 py-2.5 flex items-center justify-between shadow-md shadow-brand-blue/25 ring-1 ring-white/10">
                        <span className="text-xs text-white/80">Total seats</span>
                        <div className="flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-white/90" />
                          <span className="font-bold text-xl">+{totalSeats}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Order Summary */}
                {pricing && (
                  <div className="border border-gray-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                    <div className="px-5 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-200 dark:border-slate-700 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-cyan to-brand-blue flex items-center justify-center shadow-sm shadow-brand-cyan/25 ring-1 ring-white/10">
                          <Receipt className="w-4 h-4 text-white" />
                        </div>
                        <h4 className="font-semibold text-gray-800 dark:text-slate-100 text-base">Order Summary</h4>
                      </div>
                      <Badge variant="secondary">{quantity} pack{quantity > 1 ? 's' : ''}</Badge>
                    </div>
                    <div className="p-4 sm:p-5 space-y-3">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500 dark:text-slate-500">Pack size</span>
                        <span className="font-medium text-gray-800 dark:text-slate-100">{unitsPerPack} seat{unitsPerPack !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500 dark:text-slate-500">Quantity</span>
                        <span className="font-medium text-gray-800 dark:text-slate-100">×{quantity}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500 dark:text-slate-500">Subtotal</span>
                        <span className="font-medium text-gray-800 dark:text-slate-100">₹{subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-500 dark:text-slate-500">GST (18%)</span>
                        <span className="font-medium text-gray-800 dark:text-slate-100">₹{gst.toFixed(2)}</span>
                      </div>
                      <div className="mt-1 pt-3 border-t border-gray-200 dark:border-slate-700 flex justify-between items-center">
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-slate-50 text-sm">Total Amount</p>
                          <p className="text-xs text-gray-500 dark:text-slate-500">Incl. all taxes</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-brand-blue">₹{total.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </>
            )}
          </div>
        </div>

    </AppModal>
  );
}
