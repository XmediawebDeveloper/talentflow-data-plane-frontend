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
import AddSeatsModal from './AddSeatsModal';

interface UserLimitsProps {
  onUpgradeClick?: () => void;
  onAddSeatsClick?: () => void;
  compact?: boolean;
  refreshTrigger?: number;
}

export default function UserLimits({ onUpgradeClick, onAddSeatsClick, compact = false, refreshTrigger = 0 }: UserLimitsProps) {
  const router = useRouter();
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
      <div className={`${compact ? 'p-3' : 'p-4'} bg-gray-50 rounded-lg`}>
        <div className="flex items-center gap-2 text-gray-400">
          <Loader2 className="w-4 h-4 animate-spin" />
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
    ? 'bg-red-500'
    : limits.approaching_limit
    ? 'bg-amber-500'
    : 'bg-green-500';

  if (compact) {
    return (
      <>
        <div className={`p-2.5 sm:p-3 rounded-lg border ${
          limits.is_at_limit
            ? 'bg-red-50 border-red-200'
            : limits.approaching_limit
            ? 'bg-amber-50 border-amber-200'
            : 'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <Users className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${
                limits.is_at_limit ? 'text-red-500' : limits.approaching_limit ? 'text-amber-500' : 'text-gray-500'
              }`} />
              <span className="text-xs sm:text-sm font-medium text-gray-700 truncate">
                {limits.current_users}/{limits.max_users === -1 ? '∞' : limits.max_users} users
              </span>
            </div>
            {limits.is_at_limit && (
              <button
                onClick={() => {
                  if (onAddSeatsClick) {
                    onAddSeatsClick();
                  } else {
                    setShowAddSeatsModal(true);
                  }
                }}
                className="inline-flex items-center gap-1 px-2 py-1 bg-red-600 text-white text-[10px] sm:text-xs font-medium rounded hover:bg-red-700 transition-colors flex-shrink-0"
              >
                <Plus className="w-3 h-3" />
                Add Seats
              </button>
            )}
          </div>
          <div className="mt-1.5 sm:mt-2 h-1 sm:h-1.5 bg-gray-200 rounded-full overflow-hidden">
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
    <div className={`p-3 sm:p-4 rounded-lg border ${
      limits.is_at_limit
        ? 'bg-red-50 border-red-200'
        : limits.approaching_limit
        ? 'bg-amber-50 border-amber-200'
        : 'bg-white border-gray-200'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <Users className={`w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0 ${
              limits.is_at_limit ? 'text-red-500' : limits.approaching_limit ? 'text-amber-500' : 'text-gray-700'
            }`} />
            <h3 className="text-sm sm:text-base font-medium text-gray-900">User Seats</h3>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            {limits.plan_name} Plan
          </p>
        </div>

        <div className="text-right">
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
      <div className="mt-3 sm:mt-4">
        <div className="flex items-center justify-between text-xs sm:text-sm mb-1">
          <span className="text-gray-500">Usage</span>
          <span className={`font-medium ${
            limits.is_at_limit ? 'text-red-600' : limits.approaching_limit ? 'text-amber-600' : 'text-gray-700'
          }`}>
            {Math.round(limits.usage_percentage)}%
          </span>
        </div>
        <div className="h-1.5 sm:h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full ${progressColor} transition-all`}
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Warning messages */}
      {limits.is_at_limit && (
        <div className="mt-3 sm:mt-4 flex items-start gap-2 p-2.5 sm:p-3 bg-red-100 rounded-lg">
          <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm font-medium text-red-800">User limit reached</p>
            <p className="text-[10px] sm:text-sm text-red-700 mt-0.5">
              You cannot add more users. Purchase additional seats, upgrade your plan, or deactivate existing users.
            </p>
            <div className="mt-2 sm:mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  if (onAddSeatsClick) {
                    onAddSeatsClick();
                  } else {
                    setShowAddSeatsModal(true);
                  }
                }}
                className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-red-600 text-white text-xs sm:text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Add Seats
              </button>
              {onUpgradeClick && (
                <button
                  onClick={onUpgradeClick}
                  className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-white text-red-700 text-xs sm:text-sm font-medium rounded-lg border border-red-300 hover:bg-red-50 transition-colors"
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
        <div className="mt-3 sm:mt-4 flex items-start gap-2 p-2.5 sm:p-3 bg-amber-100 rounded-lg">
          <Info className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm font-medium text-amber-800">Approaching user limit</p>
            <p className="text-[10px] sm:text-sm text-amber-700 mt-0.5">
              Only {limits.available_slots} user slot{limits.available_slots !== 1 ? 's' : ''} remaining.
              Consider adding more seats or upgrading your plan.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => {
                  if (onAddSeatsClick) {
                    onAddSeatsClick();
                  } else {
                    setShowAddSeatsModal(true);
                  }
                }}
                className="inline-flex items-center gap-1 text-xs sm:text-sm font-medium text-amber-800 hover:text-amber-900 underline"
              >
                <Plus className="w-3 h-3" />
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
