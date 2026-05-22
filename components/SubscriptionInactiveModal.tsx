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
      <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

        {/* Top colored banner */}
        <div className={`h-1.5 ${isSuspended ? 'bg-red-500' : 'bg-brand-orange'} shrink-0`} />

        {/* Header Section */}
        <div className="pt-7 pb-2 px-6 sm:px-8 text-center shrink-0">
          {/* Icon */}
          <div className={`mx-auto w-16 h-16 sm:w-20 sm:h-20 ${isSuspended ? 'bg-red-100 ring-1 ring-red-200' : 'bg-brand-orange/10 ring-1 ring-brand-orange/15'} rounded-full flex items-center justify-center mb-4`}>
            {isSuspended ? (
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
            ) : (
              <svg className="w-8 h-8 sm:w-10 sm:h-10 text-brand-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>

          {/* Title */}
          <h2 className={`text-lg sm:text-xl font-semibold mb-2 ${isSuspended ? 'text-red-700' : 'text-brand-orange-deep'}`}>
            {isSuspended ? 'Account Suspended' : isExpired ? 'Subscription Expired' : 'Subscription Inactive'}
          </h2>

          {/* Subtitle */}
          <p className="text-gray-600 dark:text-slate-400 text-sm">
            {isSuspended
              ? 'Your account access has been temporarily restricted.'
              : isExpired
                ? 'Your subscription has expired. Renew to continue.'
                : 'Your subscription is currently inactive.'
            }
          </p>
        </div>

        {/* Body */}
        <div className="px-6 sm:px-8 pb-6 flex-1 overflow-y-auto">

          {/* Suspension Reason Card */}
          {isSuspended && errorDetails?.reason && (
            <div className="mt-4 mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg ring-1 ring-red-100">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <svg className="w-5 h-5 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-xs font-semibold text-red-800 uppercase tracking-wide mb-1">
                    Suspension Reason
                  </h3>
                  <p className="text-sm font-medium text-red-900 leading-relaxed">
                    {errorDetails.reason}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Suspended Date */}
          {isSuspended && errorDetails?.suspended_at && (
            <div className="flex items-center justify-center gap-2 text-xs sm:text-sm text-gray-500 dark:text-slate-500 mb-4">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>
                Suspended on {formatIST(errorDetails.suspended_at)}
              </span>
            </div>
          )}

          {/* Help Text */}
          <div className="bg-slate-50 dark:bg-slate-950 rounded-lg p-3 sm:p-4 mb-5 border border-gray-100 dark:border-slate-700/60">
            <p className="text-xs sm:text-sm text-gray-600 dark:text-slate-400 text-center">
              {isSuspended
                ? 'If you believe this is an error or need assistance, please contact our support team.'
                : 'Renew your subscription to restore full access to your account.'
              }
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2.5">
            {isExpired ? (
              <button
                onClick={handleRenewSubscription}
                className="w-full px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Renew Subscription
              </button>
            ) : (
              <button
                onClick={handleContactSupport}
                className="w-full px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Contact Support
              </button>
            )}

            <button
              onClick={handleLogout}
              className="w-full px-4 py-2 text-sm bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 text-gray-700 dark:text-slate-300 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>
          </div>
        </div>

        {/* Footer with Support Email */}
        {errorDetails?.support_email && (
          <div className="px-6 sm:px-8 py-3 bg-slate-50 dark:bg-slate-950 border-t border-gray-100 dark:border-slate-700/60 shrink-0">
            <div className="flex items-center justify-center gap-2 text-xs sm:text-sm">
              <svg className="w-4 h-4 text-gray-400 dark:text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <span className="text-gray-500 dark:text-slate-500">Need help?</span>
              <a
                href={`mailto:${errorDetails.support_email}`}
                className="text-brand-blue font-medium hover:underline"
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
