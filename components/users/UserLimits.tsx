'use client';

/**
 * UserLimits Component - RBAC01
 * Displays user seat limits and usage for the tenant
 */

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  AlertTriangle,
  TrendingUp,
  Loader2,
  Info,
  Plus,
  ShoppingCart
} from 'lucide-react';
import { toast } from 'sonner';
import { featurePermissionService, UserLimitsResponse } from '@/lib/services/featurePermissionService';
import { useQuota } from '@/contexts/QuotaContext';
import AddSeatsModal from './AddSeatsModal';

interface UserLimitsProps {
  onUpgradeClick?: () => void;
  onAddSeatsClick?: () => void;
  compact?: boolean;
  refreshTrigger?: number;
}

export default function UserLimits({ onUpgradeClick, onAddSeatsClick, compact = false, refreshTrigger = 0 }: UserLimitsProps) {
  const router = useRouter();
  const { quotaData } = useQuota();
  const isTrial = quotaData?.is_trial ?? false;
  const [isLoading, setIsLoading] = useState(true);
  const [limits, setLimits] = useState<UserLimitsResponse | null>(null);
  const [showAddSeatsModal, setShowAddSeatsModal] = useState(false);

  useEffect(() => {
    loadLimits();
  }, [refreshTrigger]);

  const loadLimits = async () => {
    setIsLoading(true);
    try {
      const data = await featurePermissionService.getUserLimits();
      setLimits(data);
    } catch (error: any) {
      // Don't show error toast for this component - it's informational
      console.error('Failed to load user limits:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className={`${compact ? 'p-3' : 'p-4'} bg-white rounded-xl border border-gray-200 shadow-sm`}>
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-4 h-4 text-brand-blue animate-spin" />
          <span className="text-sm">Loading limits...</span>
        </div>
      </div>
    );
  }

  if (!limits) {
    return null;
  }

  const progressPercentage = Math.min(limits.usage_percentage, 100);
  const progressColor = limits.is_at_limit
    ? 'bg-gradient-to-r from-red-500 to-red-600'
    : limits.approaching_limit
    ? 'bg-brand-orange'
    : 'bg-brand-blue';

  if (compact) {
    return (
      <>
        <div className={`p-2.5 sm:p-3 rounded-xl border shadow-sm transition-all ${
          limits.is_at_limit
            ? 'bg-red-50/60 border-red-200 ring-1 ring-red-100'
            : limits.approaching_limit
            ? 'bg-brand-orange/5 border-brand-orange/30 ring-1 ring-brand-orange/10'
            : 'bg-white border-gray-200 hover:border-brand-blue/30 hover:shadow-md'
        }`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm ring-1 ring-white/10 ${
                limits.is_at_limit
                  ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/25'
                  : limits.approaching_limit
                  ? 'bg-brand-orange shadow-brand-orange/25'
                  : 'bg-brand-blue shadow-brand-blue/25'
              }`}>
                <Users className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-xs sm:text-sm font-medium text-gray-800 truncate">
                {limits.current_users}/{limits.max_users === -1 ? '∞' : limits.max_users} users
              </span>
            </div>
            {limits.is_at_limit && !isTrial && (
              <button
                onClick={() => {
                  if (onAddSeatsClick) {
                    onAddSeatsClick();
                  } else {
                    setShowAddSeatsModal(true);
                  }
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-blue hover:bg-brand-blue-2 text-white text-[10px] sm:text-xs font-medium rounded-lg transition-all flex-shrink-0 shadow-sm shadow-brand-blue/25 ring-1 ring-white/10"
              >
                <Plus className="w-3 h-3" />
                Add Seats
              </button>
            )}
          </div>
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden ring-1 ring-gray-200/60">
            <div
              className={`h-full ${progressColor} transition-all`}
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Add Seats Modal */}
        <AddSeatsModal
          isOpen={showAddSeatsModal}
          onClose={() => setShowAddSeatsModal(false)}
          currentSeats={limits.current_users}
          maxSeats={limits.max_users}
          planName={limits.plan_name}
          onSuccess={loadLimits}
        />
      </>
    );
  }

  return (
    <div className={`p-4 sm:p-5 rounded-xl border bg-white shadow-sm hover:shadow-md transition-all ${
      limits.is_at_limit
        ? 'border-red-200 ring-1 ring-red-100'
        : limits.approaching_limit
        ? 'border-brand-orange/30 ring-1 ring-brand-orange/10'
        : 'border-gray-200 hover:border-brand-blue/30'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md ring-1 ring-white/10 ${
            limits.is_at_limit
              ? 'bg-gradient-to-br from-red-500 to-red-600 shadow-red-500/25'
              : limits.approaching_limit
              ? 'bg-brand-orange shadow-brand-orange/25'
              : 'bg-brand-blue shadow-brand-blue/25'
          }`}>
            <Users className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm sm:text-base font-semibold text-gray-900">User Seats</h3>
              {limits.is_at_limit ? (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-red-200 bg-red-50 text-red-700">At limit</span>
              ) : limits.approaching_limit ? (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-brand-orange/30 bg-brand-orange/10 text-brand-orange-deep">Nearing</span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium ring-1 ring-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan">Active</span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              {limits.plan_name} Plan
            </p>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <div className="text-lg sm:text-2xl font-bold text-gray-900">
            {limits.current_users}
            <span className="text-sm sm:text-lg text-gray-400">/{limits.max_users}</span>
          </div>
          <p className="text-xs sm:text-sm text-gray-500">
            {limits.available_slots} available
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs sm:text-sm mb-1.5">
          <span className="text-gray-500">Usage</span>
          <span className={`font-semibold ${
            limits.is_at_limit ? 'text-red-600' : limits.approaching_limit ? 'text-brand-orange-deep' : 'text-brand-blue'
          }`}>
            {Math.round(limits.usage_percentage)}%
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden ring-1 ring-gray-200/60">
          <div
            className={`h-full ${progressColor} transition-all`}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Warning messages */}
      {limits.is_at_limit && (
        <div className="mt-4 flex items-start gap-3 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-xl ring-1 ring-red-100">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center flex-shrink-0 shadow-sm shadow-red-500/25 ring-1 ring-white/10">
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm font-semibold text-red-800">User limit reached</p>
            <p className="text-[10px] sm:text-sm text-red-700 mt-0.5">
              {isTrial
                ? 'Purchasing additional seats is only available for paid subscriptions. Please upgrade your plan.'
                : 'You cannot add more users. Purchase additional seats, upgrade your plan, or deactivate existing users.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {!isTrial && (
                <button
                  onClick={() => {
                    if (onAddSeatsClick) {
                      onAddSeatsClick();
                    } else {
                      setShowAddSeatsModal(true);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue hover:bg-brand-blue-2 text-white text-xs sm:text-sm font-medium rounded-lg transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
                >
                  <ShoppingCart className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Add Seats
                </button>
              )}
              {onUpgradeClick && (
                <button
                  onClick={onUpgradeClick}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white text-gray-700 text-xs sm:text-sm font-medium rounded-lg border border-gray-200 hover:bg-gray-50 hover:border-brand-blue/30 hover:text-brand-blue transition-all"
                >
                  <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  Upgrade Plan
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {limits.approaching_limit && !limits.is_at_limit && (
        <div className="mt-4 flex items-start gap-3 p-3 sm:p-4 bg-brand-orange/5 border border-brand-orange/20 rounded-xl ring-1 ring-brand-orange/10">
          <div className="w-9 h-9 rounded-lg bg-brand-orange flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-orange/25 ring-1 ring-white/10">
            <Info className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm font-semibold text-brand-orange-deep">Approaching user limit</p>
            <p className="text-[10px] sm:text-sm text-gray-600 mt-0.5">
              Only {limits.available_slots} user slot{limits.available_slots !== 1 ? 's' : ''} remaining.
              Consider adding more seats or upgrading your plan.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  if (onAddSeatsClick) {
                    onAddSeatsClick();
                  } else {
                    setShowAddSeatsModal(true);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-blue hover:bg-brand-blue-2 text-white text-xs sm:text-sm font-medium rounded-lg transition-all shadow-md shadow-brand-blue/25 ring-1 ring-white/10"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Seats
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Seats Modal */}
      <AddSeatsModal
        isOpen={showAddSeatsModal}
        onClose={() => setShowAddSeatsModal(false)}
        currentSeats={limits.current_users}
        maxSeats={limits.max_users}
        planName={limits.plan_name}
        onSuccess={loadLimits}
      />
    </div>
  );
}

// Hook for checking if users can be added
export function useUserLimits() {
  const [limits, setLimits] = useState<UserLimitsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    featurePermissionService.getUserLimits()
      .then(setLimits)
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  const canAddUsers = (count: number = 1): boolean => {
    if (!limits) return false;
    return limits.available_slots >= count;
  };

  const refresh = async () => {
    try {
      const data = await featurePermissionService.getUserLimits();
      setLimits(data);
    } catch (error) {
      console.error('Failed to refresh user limits:', error);
    }
  };

  return {
    limits,
    isLoading,
    canAddUsers,
    isAtLimit: limits?.is_at_limit ?? false,
    approachingLimit: limits?.approaching_limit ?? false,
    availableSlots: limits?.available_slots ?? 0,
    refresh,
  };
}
