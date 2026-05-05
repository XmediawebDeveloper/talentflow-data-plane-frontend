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
      <div className={`rounded-xl border border-red-200 bg-white shadow-sm ring-1 ring-red-100 ${compact ? 'p-3 sm:p-4' : 'p-3 sm:p-4 lg:p-5'}`}>
        <div className="flex items-start gap-2 sm:gap-3">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center bg-gradient-to-br from-red-500 to-red-600 shadow-md shadow-red-500/25 ring-1 ring-white/10 flex-shrink-0">
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-semibold text-gray-900">User Limit Exceeded</h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-red-200 bg-red-50 text-red-700">Action required</span>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 mt-1">
              You have {seatData.used} active users, but your plan allows only {seatData.limit}.
              Please deactivate {usersToDeactivate} user{usersToDeactivate > 1 ? 's' : ''} or upgrade your plan.
            </p>
            <p className="text-[10px] sm:text-xs text-gray-400 mt-1.5 sm:mt-2">
              This may have occurred due to a recent plan downgrade.
            </p>
            {onDeactivateExcess && (
              <div className="mt-2 sm:mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => onDeactivateExcess(usersToDeactivate)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white text-xs font-medium rounded-lg transition-all shadow-md shadow-red-500/25 ring-1 ring-white/10"
                >
                  <UserMinus className="w-3.5 h-3.5" />
                  Deactivate {usersToDeactivate} Excess User{usersToDeactivate > 1 ? 's' : ''}
                </button>
                <button
                  onClick={() => window.location.href = '/subscription/current-plan'}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-brand-blue/30 text-xs font-medium rounded-lg transition-all"
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

  return (
    <>
      <div className={`rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md hover:border-brand-blue/30 transition-all ${compact ? 'p-3 sm:p-4' : 'p-3 sm:p-4 lg:p-5'}`}>
        {/* Header */}
        <div className="flex items-start justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center bg-brand-blue shadow-md shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-semibold text-gray-900">User Seats</h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-red-200 bg-red-50 text-red-700">At limit</span>
              </div>
              <p className="text-xs sm:text-sm text-gray-500 mt-0.5">{planName}</p>
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
          <div className="flex items-center justify-between text-xs sm:text-sm mb-1.5">
            <span className="text-gray-500">Usage</span>
            <span className="font-semibold text-red-600">100%</span>
          </div>
          <div className="h-2 sm:h-2.5 bg-gray-100 rounded-full overflow-hidden ring-1 ring-gray-200/60">
            <div className="h-full bg-gradient-to-r from-red-500 to-red-600 transition-all duration-300 w-full" />
          </div>
        </div>

        {/* Addon Credits Info */}
        {seatData.addon_remaining > 0 && (
          <div className="mb-3 sm:mb-4 flex items-center gap-2 p-2.5 bg-brand-cyan/5 border border-brand-cyan/20 rounded-lg ring-1 ring-brand-cyan/10">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-cyan to-brand-blue flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-cyan/25">
              <Plus className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-xs sm:text-sm text-brand-blue font-medium">
              +{seatData.addon_remaining} addon seat{seatData.addon_remaining > 1 ? 's' : ''} available
            </span>
          </div>
        )}

        {/* Exhausted Warning - always show since card only appears when at limit */}
        <div className="mb-3 sm:mb-4 p-3 bg-red-50 border border-red-200 rounded-xl ring-1 ring-red-100">
          <div className="flex items-start gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center flex-shrink-0 shadow-sm shadow-red-500/25">
              <AlertTriangle className="w-4 h-4 text-white" />
            </div>
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
          <div className="flex items-start gap-2 p-3 bg-brand-orange/5 border border-brand-orange/20 rounded-xl ring-1 ring-brand-orange/10">
            <div className="w-8 h-8 rounded-lg bg-brand-orange flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-orange/25">
              <AlertTriangle className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-semibold text-brand-orange-deep">Not available on Free Trial</p>
              <p className="text-[10px] sm:text-xs text-gray-600 mt-0.5">
                Purchasing additional seats is only available for paid subscriptions.
              </p>
            </div>
            <button
              onClick={() => window.location.href = '/subscription/current-plan'}
              className="flex-shrink-0 inline-flex items-center gap-1 bg-brand-orange hover:from-brand-orange-deep hover:to-brand-orange text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-all shadow-md shadow-brand-orange/25 ring-1 ring-white/10"
            >
              <TrendingUp className="w-3 h-3" />
              Upgrade
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowAddonModal(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg font-medium text-xs sm:text-sm transition-all bg-brand-blue hover:from-brand-blue-2 hover:to-brand-blue text-white shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
            >
              <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              Add Seats
            </button>
            <button
              onClick={() => window.location.href = '/subscription/current-plan'}
              className="px-3 sm:px-4 py-1.5 sm:py-2 border border-gray-200 text-gray-700 rounded-lg font-medium text-xs sm:text-sm hover:bg-gray-50 hover:border-brand-blue/30 hover:text-brand-blue transition-all flex items-center gap-1.5"
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
