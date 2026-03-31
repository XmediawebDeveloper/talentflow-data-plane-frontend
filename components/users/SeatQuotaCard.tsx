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
  TrendingUp,
  UserMinus,
} from 'lucide-react';
import { useQuota } from '@/contexts/QuotaContext';
import AddSeatsModal from './AddSeatsModal';

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
  onDeactivateExcess?: (count: number) => void;
  compact?: boolean;
  refreshTrigger?: number; // Increment this to trigger a refresh
}


export default function SeatQuotaCard({ onRefresh, onDeactivateExcess, compact = false, refreshTrigger = 0 }: SeatQuotaCardProps) {
  const { quotaData } = useQuota();
  const isTrial = quotaData?.is_trial ?? false;
  const [loading, setLoading] = useState(true);
  const [seatData, setSeatData] = useState<SeatQuotaData | null>(null);
  const [planName, setPlanName] = useState('');
  const [showAddonModal, setShowAddonModal] = useState(false);

  useEffect(() => {
    fetchQuotaData();
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
      }
    } catch (error) {
      console.error('[SeatQuotaCard] Error fetching user limits:', error);
    } finally {
      setLoading(false);
    }
  };

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
      <div className={`rounded-xl border-2 border-red-300 bg-red-50 ${compact ? 'p-3 sm:p-4' : 'p-3 sm:p-4 lg:p-5'}`}>
        <div className="flex items-start gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center bg-red-100 flex-shrink-0">
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm sm:text-base font-semibold text-red-800">User Limit Exceeded</h3>
            <p className="text-xs sm:text-sm text-red-600 mt-1">
              You have {seatData.used} active users, but your plan allows only {seatData.limit}.
              Please deactivate {usersToDeactivate} user{usersToDeactivate > 1 ? 's' : ''} or upgrade your plan.
            </p>
            <p className="text-[10px] sm:text-xs text-red-500 mt-1.5 sm:mt-2">
              This may have occurred due to a recent plan downgrade.
            </p>
            {onDeactivateExcess && (
              <div className="mt-2 sm:mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => onDeactivateExcess(usersToDeactivate)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors"
                >
                  <UserMinus className="w-3.5 h-3.5" />
                  Deactivate {usersToDeactivate} Excess User{usersToDeactivate > 1 ? 's' : ''}
                </button>
                <button
                  onClick={() => window.location.href = '/subscription/current-plan'}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-red-300 text-red-700 hover:bg-red-100 text-xs font-medium rounded-lg transition-colors"
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  Upgrade Plan
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const cardBorderColor = 'border-red-300 bg-red-50'; // Always red since only shown at limit

  return (
    <>
      <div className={`rounded-xl border-2 ${cardBorderColor} ${compact ? 'p-3 sm:p-4' : 'p-3 sm:p-4 lg:p-5'}`}>
        {/* Header */}
        <div className="flex items-start justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center bg-red-100 flex-shrink-0">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-red-600" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-gray-900">User Seats</h3>
              <p className="text-xs sm:text-sm text-gray-500">{planName}</p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-lg sm:text-2xl font-bold text-gray-900">
              {seatData.used}
              <span className="text-sm sm:text-lg text-gray-400">/{seatData.limit === -1 ? '∞' : seatData.limit}</span>
            </div>
            <p className="text-xs sm:text-sm text-gray-500">
              {seatData.total_remaining === -1 ? 'Unlimited' : `${seatData.total_remaining} available`}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-3 sm:mb-4">
          <div className="flex items-center justify-between text-xs sm:text-sm mb-1">
            <span className="text-gray-500">Usage</span>
            <span className="font-medium text-red-600">100%</span>
          </div>
          <div className="h-2 sm:h-2.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 transition-all duration-300 w-full" />
          </div>
        </div>

        {/* Addon Credits Info */}
        {seatData.addon_remaining > 0 && (
          <div className="mb-3 sm:mb-4 flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-600 flex-shrink-0" />
            <span className="text-xs sm:text-sm text-blue-700">
              +{seatData.addon_remaining} addon seat{seatData.addon_remaining > 1 ? 's' : ''} available
            </span>
          </div>
        )}

        {/* Exhausted Warning - always show since card only appears when at limit */}
        <div className="mb-3 sm:mb-4 p-2.5 sm:p-3 bg-red-100 border border-red-200 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs sm:text-sm font-semibold text-red-800">Quota Exhausted</p>
              <p className="text-[10px] sm:text-sm text-red-700 mt-0.5">
                You have reached your user seat limit. Purchase additional seats to add more users.
              </p>
            </div>
          </div>
        </div>


        {/* Action Buttons */}
        {isTrial ? (
          <div className="flex items-start gap-2 p-2.5 sm:p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-semibold text-amber-800">Not available on Free Trial</p>
              <p className="text-[10px] sm:text-xs text-amber-700 mt-0.5">
                Purchasing additional seats is only available for paid subscriptions.
              </p>
            </div>
            <button
              onClick={() => window.location.href = '/subscription/current-plan'}
              className="flex-shrink-0 flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <TrendingUp className="w-3 h-3" />
              Upgrade
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowAddonModal(true)}
              className={`inline-flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg font-medium text-xs sm:text-sm transition-colors ${
                seatData.is_exhausted
                  ? 'bg-red-600 text-white hover:bg-red-700'
                  : 'bg-gray-800 text-white hover:bg-gray-700'
              }`}
            >
              <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              Add
            </button>
            <button
              onClick={() => window.location.href = '/subscription/current-plan'}
              className="px-2.5 sm:px-3 py-1.5 sm:py-2 border border-gray-300 text-gray-700 rounded-lg font-medium text-xs sm:text-sm hover:bg-gray-50 transition-colors flex items-center gap-1 sm:gap-1.5"
            >
              <TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              Upgrade
            </button>
          </div>
        )}
      </div>

      <AddSeatsModal
        isOpen={showAddonModal}
        onClose={() => setShowAddonModal(false)}
        currentSeats={seatData.used}
        maxSeats={seatData.limit}
        planName={planName}
        onSuccess={() => {
          setShowAddonModal(false);
          fetchQuotaData();
          onRefresh?.();
        }}
      />
    </>
  );
}
