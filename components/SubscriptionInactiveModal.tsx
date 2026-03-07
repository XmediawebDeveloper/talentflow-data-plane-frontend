'use client';

import React, { useEffect, useState } from 'react';
import {
  SUBSCRIPTION_INACTIVE_EVENT,
  SubscriptionInactiveDetail,
  clearTokens
} from '@/lib/services/api';
import { getLoginUrl } from '@/lib/services/authService';
import { useRouter, usePathname } from 'next/navigation';
import { formatIST } from '@/lib/utils/dateUtils';

// Pages where the modal should NOT appear (user needs access to renew)
const ALLOWED_PATHS = [
  '/subscription/current-plan',
  '/subscription/payment-methods',
];

export default function SubscriptionInactiveModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [errorDetails, setErrorDetails] = useState<SubscriptionInactiveDetail | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Check if current path is allowed (subscription management pages)
  const isAllowedPath = ALLOWED_PATHS.some(path => pathname?.includes(path));

  useEffect(() => {
    const handleSubscriptionInactive = (event: CustomEvent<SubscriptionInactiveDetail>) => {
      // SUSPENDED accounts are handled by the full-screen overlay in dashboard layout
      // Don't show modal for suspended - only for expired/inactive
      if (event.detail?.status === 'SUSPENDED') {
        return;
      }
      setErrorDetails(event.detail);
      // Only show modal if NOT on an allowed path
      if (!ALLOWED_PATHS.some(path => window.location.pathname.includes(path))) {
        setIsOpen(true);
      }
    };

    window.addEventListener(
      SUBSCRIPTION_INACTIVE_EVENT,
      handleSubscriptionInactive as EventListener
    );

    return () => {
      window.removeEventListener(
        SUBSCRIPTION_INACTIVE_EVENT,
        handleSubscriptionInactive as EventListener
      );
    };
  }, []);

  // Close modal if user navigates to an allowed path
  useEffect(() => {
    if (isAllowedPath && isOpen) {
      setIsOpen(false);
    }
  }, [isAllowedPath, isOpen]);

  const handleLogout = () => {
    const loginUrl = getLoginUrl();
    clearTokens();
    setIsOpen(false);
    router.push(loginUrl);
  };

  const handleContactSupport = () => {
    if (errorDetails?.support_email) {
      window.location.href = `mailto:${errorDetails.support_email}?subject=Account Access Issue - Suspended Account`;
    }
  };

  const handleRenewSubscription = () => {
    setIsOpen(false);
    router.push('/subscription/current-plan');
  };

  // Determine title and message based on status
  const isSuspended = errorDetails?.status === 'SUSPENDED';
  const isExpired = errorDetails?.status === 'EXPIRED';

  // Don't show modal if not open OR if on an allowed path
  if (!isOpen || isAllowedPath) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in duration-200">

        {/* Top colored banner */}
        <div className={`h-2 ${isSuspended ? 'bg-red-500' : 'bg-orange-500'}`} />

        {/* Header Section */}
        <div className="pt-8 pb-2 px-8 text-center">
          {/* Icon */}
          <div className={`mx-auto w-20 h-20 ${isSuspended ? 'bg-red-100' : 'bg-orange-100'} rounded-full flex items-center justify-center mb-5 shadow-lg`}>
            {isSuspended ? (
              <svg className="w-10 h-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            ) : (
              <svg className="w-10 h-10 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>

          {/* Title */}
          <h2 className={`text-2xl font-bold mb-2 ${isSuspended ? 'text-red-700' : 'text-orange-700'}`}>
            {isSuspended ? 'Account Suspended' : isExpired ? 'Subscription Expired' : 'Subscription Inactive'}
          </h2>

          {/* Subtitle */}
          <p className="text-gray-600 text-base">
            {isSuspended
              ? 'Your account access has been temporarily restricted.'
              : isExpired
                ? 'Your subscription has expired. Renew to continue.'
                : 'Your subscription is currently inactive.'
            }
          </p>
        </div>

        {/* Body */}
        <div className="px-8 pb-6">

          {/* Suspension Reason Card */}
          {isSuspended && errorDetails?.reason && (
            <div className="mt-4 mb-6 p-5 bg-gradient-to-br from-red-50 to-red-100 border-l-4 border-red-500 rounded-lg shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-red-800 uppercase tracking-wide mb-1">
                    Suspension Reason
                  </h3>
                  <p className="text-base font-medium text-red-900 leading-relaxed">
                    {errorDetails.reason}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Suspended Date */}
          {isSuspended && errorDetails?.suspended_at && (
            <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mb-4">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>
                Suspended on {formatIST(errorDetails.suspended_at)}
              </span>
            </div>
          )}

          {/* Help Text */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <p className="text-sm text-gray-600 text-center">
              {isSuspended
                ? 'If you believe this is an error or need assistance, please contact our support team.'
                : 'Renew your subscription to restore full access to your account.'
              }
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            {isExpired ? (
              <button
                onClick={handleRenewSubscription}
                className="w-full px-5 py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Renew Subscription
              </button>
            ) : (
              <button
                onClick={handleContactSupport}
                className="w-full px-5 py-3.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Contact Support
              </button>
            )}

            <button
              onClick={handleLogout}
              className="w-full px-5 py-3.5 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>

        {/* Footer with Support Email */}
        {errorDetails?.support_email && (
          <div className="px-8 py-4 bg-gray-50 border-t border-gray-100">
            <div className="flex items-center justify-center gap-2 text-sm">
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="text-gray-500">Need help?</span>
              <a
                href={`mailto:${errorDetails.support_email}`}
                className="text-blue-600 font-medium hover:underline"
              >
                {errorDetails.support_email}
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
