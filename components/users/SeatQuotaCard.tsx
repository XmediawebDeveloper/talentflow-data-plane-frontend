'use client';

/**
 * SeatQuotaCard Component
 * Displays seat quota status with exhausted message and addon purchase
 * Uses the same API as UsageDashboard (/usage/quota-status)
 */

import React, { useState, useEffect } from 'react';
import {
  Users,
  AlertTriangle,
  Plus,
  Minus,
  ShoppingCart,
  Loader2,
  AlertCircle,
  CheckCircle,
  X,
  Info,
  TrendingUp
} from 'lucide-react';
import { toast } from 'sonner';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface SeatQuotaData {
  limit: number;
  used: number;
  remaining: number;
  percentage: number;
  status: string;
  is_exhausted: boolean;
  is_low: boolean;
  addon_remaining: number;
  total_remaining: number;
}

interface SeatQuotaCardProps {
  onRefresh?: () => void;
  compact?: boolean;
  refreshTrigger?: number; // Increment this to trigger a refresh
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

export default function SeatQuotaCard({ onRefresh, compact = false, refreshTrigger = 0 }: SeatQuotaCardProps) {
  const [loading, setLoading] = useState(true);
  const [seatData, setSeatData] = useState<SeatQuotaData | null>(null);
  const [planName, setPlanName] = useState('');
  const [isTrial, setIsTrial] = useState(false);

  // Addon modal states
  const [showAddonModal, setShowAddonModal] = useState(false);
  const [seatPricing, setSeatPricing] = useState<SeatPricing | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [purchasing, setPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  useEffect(() => {
    fetchQuotaData();
    fetchSeatPricing();
  }, [refreshTrigger]); // Re-fetch when refreshTrigger changes

  const getAuthHeaders = () => {
    const token = localStorage.getItem('accessToken') || localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
    };
  };

  const fetchQuotaData = async () => {
    setLoading(true);
    try {
      // Use /users/limits API - same as UserLimits component
      // This returns actual user count, not quota tracking
      const response = await fetch(`${API_BASE}/users/limits`, {
        headers: getAuthHeaders(),
      });

      if (response.ok) {
        const data = await response.json();
        console.log('[SeatQuotaCard] User limits response:', data);

        const used = data.current_users || 0;
        const limit = data.max_users === 'Unlimited' ? -1 : (data.max_users || 0);
        const remaining = data.available_slots || 0;
        const isUnlimited = limit === -1;
        const percentage = isUnlimited ? 0 : (limit > 0 ? (used / limit) * 100 : 0);
        const isExhausted = !isUnlimited && (data.is_at_limit || remaining <= 0);

        console.log('[SeatQuotaCard] Parsed data:', {
          limit, used, remaining, isExhausted, isAtLimit: data.is_at_limit
        });

        setSeatData({
          limit,
          used,
          remaining,
          percentage,
          status: isExhausted ? 'EXCEEDED' : 'OK',
          is_exhausted: isExhausted,
          is_low: data.approaching_limit || false,
          addon_remaining: 0,
          total_remaining: remaining,
        });

        setPlanName(data.plan_name || 'Unknown Plan');
        setIsTrial(false);
      }
    } catch (error) {
      console.error('[SeatQuotaCard] Error fetching user limits:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSeatPricing = async () => {
    try {
      // Fetch from same /addons API as usage-quotas page
      const response = await fetch(`${API_BASE}/addons?active_only=true&public_only=true`, {
        headers: getAuthHeaders(),
      });

      const result = await response.json();
      console.log('[SeatQuotaCard] Addons response:', response.status, result);

      if (response.ok) {
        const addons = result.data || result || [];

        // Find seat addon (same logic as usage-quotas page)
        const seatAddon = addons.find((addon: any) => {
          const name = (addon.name || addon.addon_name || '').toLowerCase();
          return name.includes('seat') || name.includes('max_seats');
        });

        if (seatAddon) {
          console.log('[SeatQuotaCard] Found seat addon (raw):', JSON.stringify(seatAddon, null, 2));
          const units = seatAddon.credit_amount || seatAddon.min_quantity || 1;
          const price = seatAddon.price || seatAddon.unit_price || 0;
          console.log('[SeatQuotaCard] Extracted: units=', units, 'price=', price);
          setSeatPricing({
            units_per_package: units,
            price_per_package: price,
            currency: seatAddon.currency || 'INR',
            addon_id: seatAddon.id,
            addon_name: seatAddon.name || seatAddon.addon_name,
            max_packages: seatAddon.max_quantity || 50,
          });
        } else {
          console.error('[SeatQuotaCard] No seat addon found in:', addons.map((a: any) => a.name));
          setPurchaseError('Seat addon not available');
        }
      } else {
        console.error('[SeatQuotaCard] Addons API error:', result);
        setPurchaseError(result.detail || 'Failed to load addons');
      }
    } catch (error) {
      console.error('[SeatQuotaCard] Error fetching addons:', error);
      setPurchaseError('Failed to load seat pricing');
    }
  };

  const handlePurchase = async () => {
    if (quantity < 1 || !seatPricing) return;

    setPurchasing(true);
    setPurchaseError(null);

    // Calculate total seats from packages
    const seatsToAdd = quantity * seatPricing.units_per_package;
    console.log('[SeatQuotaCard] Purchase:', {
      packages: quantity,
      units_per_package: seatPricing.units_per_package,
      total_seats: seatsToAdd,
      price_per_package: seatPricing.price_per_package,
    });

    try {
      const response = await fetch(`${API_BASE}/addons/purchase-seats`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ quantity: seatsToAdd }),  // Send total seats
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(`Successfully added ${totalSeats} seat${totalSeats > 1 ? 's' : ''} to your account!`);

        // Queue audit verification for seats purchase (non-blocking)
        try {
          const mod = await import('@/lib/services/auditVerificationService');
          const stored = localStorage.getItem('talentflow_user');
          const u = stored ? JSON.parse(stored) : {};
          mod.auditVerificationService.storePendingVerification({
            action: 'seats_purchase',
            entity_type: 'seats',
            entity_id: String(seatsToAdd),
            user_id: u.id,
            user_email: u.email,
            timestamp: new Date().toISOString(),
          });
          console.log('[AuditVerification] Queued seats purchase verification');
        } catch (e) { console.warn('[AuditVerification] Failed to queue:', e); }

        setShowAddonModal(false);
        setQuantity(1);
        fetchQuotaData();
        onRefresh?.();
      } else {
        const errorMsg = data.detail?.message || data.detail || data.message || 'Failed to purchase seats';
        setPurchaseError(errorMsg);
      }
    } catch (error: any) {
      console.error('[SeatQuotaCard] Purchase error:', error);
      setPurchaseError(error.message || 'Failed to purchase seats');
    } finally {
      setPurchasing(false);
    }
  };

  // Use pricing from seat-pricing API (package-based, no hardcoded values)
  const unitsPerPackage = seatPricing?.units_per_package || 0;
  const pricePerPackage = seatPricing?.price_per_package || 0;
  const currency = seatPricing?.currency || 'INR';
  const totalSeats = quantity * unitsPerPackage;
  const totalPrice = (quantity * pricePerPackage).toFixed(2);

  // Don't show anything while loading - card only appears when at limit
  if (loading) {
    return null;
  }

  if (!seatData) {
    console.log('[SeatQuotaCard] No seatData - returning null');
    return null;
  }

  console.log('[SeatQuotaCard] Checking visibility:', {
    used: seatData.used,
    limit: seatData.limit,
    shouldShow: seatData.limit <= 0 || seatData.used >= seatData.limit
  });

  // Only show card when at limit or exceeded (used >= limit)
  // Don't show if used < limit (e.g., 2/5)
  if (seatData.limit > 0 && seatData.used < seatData.limit) {
    console.log('[SeatQuotaCard] Hiding - used < limit');
    return null;
  }

  console.log('[SeatQuotaCard] SHOWING CARD');

  // Show error if used > limit (invalid data like 3/2)
  const isInvalidData = seatData.limit > 0 && seatData.used > seatData.limit;

  // Error state for invalid data
  if (isInvalidData) {
    const usersToDeactivate = seatData.used - seatData.limit;
    return (
      <div className={`rounded-xl border-2 border-red-300 bg-red-50 ${compact ? 'p-4' : 'p-5'}`}>
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-red-100 flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-red-800">User Limit Exceeded</h3>
            <p className="text-sm text-red-600 mt-1">
              You have {seatData.used} active users, but your plan allows only {seatData.limit}.
              Please deactivate {usersToDeactivate} user{usersToDeactivate > 1 ? 's' : ''} or upgrade your plan.
            </p>
            <p className="text-xs text-red-500 mt-2">
              This may have occurred due to a recent plan downgrade.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const cardBorderColor = 'border-red-300 bg-red-50'; // Always red since only shown at limit

  return (
    <>
      <div className={`rounded-xl border-2 ${cardBorderColor} ${compact ? 'p-4' : 'p-5'}`}>
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-red-100">
              <Users className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">User Seats</h3>
              <p className="text-sm text-gray-500">{planName}</p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900">
              {seatData.used}
              <span className="text-lg text-gray-400">/{seatData.limit === -1 ? '∞' : seatData.limit}</span>
            </div>
            <p className="text-sm text-gray-500">
              {seatData.total_remaining === -1 ? 'Unlimited' : `${seatData.total_remaining} available`}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-500">Usage</span>
            <span className="font-medium text-red-600">100%</span>
          </div>
          <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 transition-all duration-300 w-full" />
          </div>
        </div>

        {/* Addon Credits Info */}
        {seatData.addon_remaining > 0 && (
          <div className="mb-4 flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
            <Plus className="w-4 h-4 text-blue-600" />
            <span className="text-sm text-blue-700">
              +{seatData.addon_remaining} addon seat{seatData.addon_remaining > 1 ? 's' : ''} available
            </span>
          </div>
        )}

        {/* Exhausted Warning - always show since card only appears when at limit */}
        <div className="mb-4 p-3 bg-red-100 border border-red-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-800">Quota Exhausted</p>
              <p className="text-sm text-red-700 mt-0.5">
                You have reached your user seat limit. Purchase additional seats to add more users.
              </p>
            </div>
          </div>
        </div>


        {/* Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={() => {
              setShowAddonModal(true);
              setQuantity(1);
              setPurchaseError(null);
            }}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg font-medium text-sm transition-colors ${
              seatData.is_exhausted
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-gray-800 text-white hover:bg-gray-700'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>
          {!isTrial && (
            <button
              onClick={() => window.location.href = '/subscription/current-plan'}
              className="px-3 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors flex items-center gap-1.5"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Upgrade
            </button>
          )}
        </div>
      </div>

      {/* Purchase Modal */}
      {showAddonModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-6 py-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-white">Add User Seats</h2>
                    <p className="text-sm text-gray-300">Expand your team capacity</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddonModal(false)}
                  className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {/* Current Status */}
              <div className="bg-gray-50 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Current Plan</span>
                  <span className="text-sm font-medium text-gray-900">{planName}</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Current Usage</span>
                  <span className="text-sm font-medium text-gray-900">
                    {seatData.used} / {seatData.limit === -1 ? '∞' : seatData.limit} seats
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Available</span>
                  <span className={`text-sm font-medium ${seatData.is_exhausted ? 'text-red-600' : 'text-green-600'}`}>
                    {seatData.total_remaining} seat{seatData.total_remaining !== 1 ? 's' : ''}
                  </span>
                </div>
                {seatData.is_exhausted && (
                  <div className="mt-3 flex items-center gap-2 text-red-600">
                    <AlertCircle className="w-4 h-4" />
                    <span className="text-xs font-medium">Seat limit reached</span>
                  </div>
                )}
              </div>

              {/* Package Selector */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Number of packages to buy
                </label>
                <div className="flex items-center justify-center gap-4">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    disabled={quantity <= 1}
                    className="w-12 h-12 rounded-xl border-2 border-gray-200 flex items-center justify-center text-gray-600 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <div className="w-24 text-center">
                    <input
                      type="number"
                      min={1}
                      max={seatPricing?.max_packages || 50}
                      value={quantity}
                      onChange={(e) => setQuantity(Math.max(1, Math.min(seatPricing?.max_packages || 50, parseInt(e.target.value) || 1)))}
                      className="w-full text-center text-3xl font-bold text-gray-900 border-0 focus:ring-0 bg-transparent"
                    />
                    <span className="text-sm text-gray-500">package{quantity > 1 ? 's' : ''}</span>
                  </div>
                  <button
                    onClick={() => setQuantity(Math.min(seatPricing?.max_packages || 50, quantity + 1))}
                    disabled={quantity >= (seatPricing?.max_packages || 50)}
                    className="w-12 h-12 rounded-xl border-2 border-gray-200 flex items-center justify-center text-gray-600 hover:border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                {seatPricing && (
                  <p className="text-center text-sm text-gray-500 mt-2">
                    = {totalSeats} seat{totalSeats !== 1 ? 's' : ''} total
                  </p>
                )}
              </div>

              {/* Pricing */}
              <div className="bg-gray-100 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Package</span>
                  <span className="text-sm font-medium text-gray-900">
                    {unitsPerPackage} seats for {getCurrencySymbol(currency)}{pricePerPackage}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-200">
                  <span className="text-base font-medium text-gray-800">Total ({totalSeats} seats)</span>
                  <span className="text-2xl font-bold text-gray-900">
                    {getCurrencySymbol(currency)}{totalPrice}
                  </span>
                </div>
              </div>

              {/* Info */}
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg mb-6">
                <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">
                  Additional seats will be available immediately after purchase.
                  Charges will be added to your next billing cycle.
                </p>
              </div>

              {/* Error */}
              {purchaseError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-6">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{purchaseError}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowAddonModal(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePurchase}
                  disabled={purchasing || quantity < 1 || !seatPricing}
                  className="flex-1 px-4 py-3 bg-gray-800 text-white rounded-xl font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {purchasing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="w-4 h-4" />
                      Add {totalSeats} Seat{totalSeats !== 1 ? 's' : ''}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
