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
import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

const SEATS_BLOCKED_MESSAGE = "Your role can't buy seats or add-ons. Ask the account owner or a Billing Manager.";

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
  // Buying seats is a billing action (2026-11-10): Subscription & Billing
  // Access (Upgrade Plan), same as the add-on API.
  const { isTenantAdmin: isOwnerForSeats, hasPermission: hasPermissionForSeats } = useAuth();
  const canBuySeats = isOwnerForSeats || hasPermissionForSeats('canUpgradePlan');
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
      <div className={`rounded-xl border border-destructive-line bg-white shadow-sm ring-1 ring-destructive-line ${compact ? 'p-4' : 'p-4 sm:p-5'}`}>
        <div className="flex items-start gap-2 sm:gap-3">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center bg-destructive shadow-md shadow-red-500/25 ring-1 ring-white/10 flex-shrink-0">
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="tf-section-title max-sm:text-sm">User Limit Exceeded</h3>
              <Badge variant="destructive">Action required</Badge>
            </div>
            <p className="tf-body-secondary mt-1">
              You have {seatData.used} active users, but your plan allows only {seatData.limit}.
              Please deactivate {usersToDeactivate} user{usersToDeactivate > 1 ? 's' : ''} or upgrade your plan.
            </p>
            <p className="tf-hint mt-1.5 sm:mt-2">
              This may have occurred due to a recent plan downgrade.
            </p>
            {onDeactivateExcess && (
              <div className="mt-2 sm:mt-3 flex flex-wrap gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => onDeactivateExcess(usersToDeactivate)}
                  icon={<UserMinus className="w-3.5 h-3.5" />}
                >
                  Deactivate {usersToDeactivate} Excess User{usersToDeactivate > 1 ? 's' : ''}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.location.href = '/subscription/current-plan'}
                  icon={<TrendingUp className="w-3.5 h-3.5" />}
                >
                  Upgrade Plan
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`rounded-xl border border-gray-200 bg-white shadow-sm hover:shadow-md hover:border-brand-blue/30 transition-all ${compact ? 'p-4' : 'p-4 sm:p-5'}`}>
        {/* Header */}
        <div className="flex items-start justify-between mb-3 sm:mb-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center bg-brand-blue shadow-md shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
              <Users className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="tf-section-title max-sm:text-sm">User Seats</h3>
                <Badge variant="destructive">At limit</Badge>
              </div>
              <p className="tf-meta mt-0.5">{planName}</p>
            </div>
          </div>

          <div className="text-right">
            <div className="text-xl max-sm:text-lg font-bold text-gray-900">
              {seatData.used}
              <span className="tf-body-muted">/{seatData.limit === -1 ? '∞' : seatData.limit}</span>
            </div>
            <p className="tf-meta">
              {seatData.total_remaining === -1 ? 'Unlimited' : `${seatData.total_remaining} available`}
            </p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-3 sm:mb-4">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-gray-500">Usage</span>
            <span className="font-semibold text-destructive">100%</span>
          </div>
          <div className="h-2 sm:h-2.5 bg-gray-100 rounded-full overflow-hidden ring-1 ring-gray-200/60">
            <div className="h-full bg-destructive transition-all duration-300 w-full" />
          </div>
        </div>

        {/* Addon Credits Info */}
        {seatData.addon_remaining > 0 && (
          <div className="mb-3 sm:mb-4 flex items-center gap-2 p-2.5 bg-brand-cyan/5 border border-brand-cyan/20 rounded-lg ring-1 ring-brand-cyan/10">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-brand-cyan to-brand-blue flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-cyan/25">
              <Plus className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-sm text-brand-blue font-medium">
              +{seatData.addon_remaining} addon seat{seatData.addon_remaining > 1 ? 's' : ''} available
            </span>
          </div>
        )}

        {/* Exhausted Warning - always show since card only appears when at limit */}
        <div className="mb-3 sm:mb-4 p-3 bg-destructive-subtle border border-destructive-line rounded-xl ring-1 ring-destructive-line">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-destructive flex items-center justify-center flex-shrink-0 shadow-sm shadow-red-500/25">
              <AlertTriangle className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-destructive-strong">Quota Exhausted</p>
              <p className="text-sm text-destructive mt-0.5">
                You have reached your user seat limit. Purchase additional seats to add more users.
              </p>
            </div>
          </div>
        </div>


        {/* Action Buttons */}
        {isTrial ? (
          <div className="flex items-start gap-3 p-3 bg-brand-orange/5 border border-brand-orange/20 rounded-xl ring-1 ring-brand-orange/10">
            <div className="w-8 h-8 rounded-lg bg-brand-orange flex items-center justify-center flex-shrink-0 shadow-sm shadow-brand-orange/25">
              <AlertTriangle className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-brand-orange-deep">Not available on Free Trial</p>
              <p className="tf-body-secondary mt-0.5">
                Purchasing additional seats is only available for paid subscriptions.
              </p>
            </div>
            <button
              onClick={() => window.location.href = '/subscription/current-plan'}
              className="flex-shrink-0 inline-flex items-center gap-1 bg-brand-orange hover:bg-brand-orange-deep text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-all shadow-md shadow-brand-orange/25 ring-1 ring-white/10"
            >
              <TrendingUp className="w-3 h-3" />
              Upgrade
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="primary"
              size="sm"
              aria-disabled={!canBuySeats}
              title={canBuySeats ? undefined : SEATS_BLOCKED_MESSAGE}
              style={!canBuySeats ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
              onClick={() => { if (!canBuySeats) return; setShowAddonModal(true); }}
              icon={<Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
            >
              Add Seats
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => window.location.href = '/subscription/current-plan'}
              icon={<TrendingUp className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
            >
              Upgrade
            </Button>
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
