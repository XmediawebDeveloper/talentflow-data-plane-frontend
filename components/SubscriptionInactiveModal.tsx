'use client';

import React, { useEffect, useState } from 'react';
import {
  SUBSCRIPTION_INACTIVE_EVENT,
  SubscriptionInactiveDetail,
  clearTokens
} from '@/lib/services/api';
import { useRouter } from 'next/navigation';

export default function SubscriptionInactiveModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [errorDetails, setErrorDetails] = useState<SubscriptionInactiveDetail | null>(null);
  const router = useRouter();

  useEffect(() => {
    const handleSubscriptionInactive = (event: CustomEvent<SubscriptionInactiveDetail>) => {
      setErrorDetails(event.detail);
      setIsOpen(true);
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

  const handleLogout = () => {
    clearTokens();
    setIsOpen(false);
    router.push('/login');
  };

  const handleContactSupport = () => {
    if (errorDetails?.support_email) {
      window.location.href = `mailto:${errorDetails.support_email}?subject=Account Access Issue`;
    }
  };

  // Determine title and message based on status
  const isSuspended = errorDetails?.status === 'SUSPENDED';
  const isExpired = errorDetails?.status === 'EXPIRED';

  const getTitle = () => {
    if (isSuspended) return 'Account Suspended';
    if (isExpired) return 'Subscription Inactive';
    return 'Subscription Inactive';
  };

  const getMessage = () => {
    if (isSuspended) {
      return 'Your account has been suspended by the administrator.';
    }
    if (isExpired) {
      return 'Your subscription has expired. Please renew to continue.';
    }
    return 'Your subscription is inactive. Please contact support.';
  };

  const getIcon = () => {
    if (isSuspended) {
      // Lock icon for suspended
      return (
        <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0 0v2m0-2h2m-2 0H10m4-6V9a4 4 0 10-8 0v4m12 0a2 2 0 01-2 2H6a2 2 0 01-2-2v-4a2 2 0 012-2h12a2 2 0 012 2v4z" />
        </svg>
      );
    }
    // Credit card icon for expired/inactive subscription
    return (
      <svg className="w-8 h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    );
  };

  const getIconBgColor = () => {
    if (isSuspended) return 'bg-red-100';
    return 'bg-orange-100';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Icon & Header */}
        <div className="pt-8 pb-4 px-6 text-center">
          <div className={`mx-auto w-16 h-16 ${getIconBgColor()} rounded-full flex items-center justify-center mb-4`}>
            {getIcon()}
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {getTitle()}
          </h2>
        </div>

        {/* Body */}
        <div className="px-6 pb-6">
          <div className="text-center mb-6">
            <p className="text-gray-600 text-base">
              {getMessage()}
            </p>
            <p className="text-gray-600 text-base">
              Please contact support for further assistance.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex flex-col gap-3">
            {isExpired ? (
              <button
                onClick={() => window.location.href = '/subscription/current-plan'}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Renew Subscription
              </button>
            ) : (
              <button
                onClick={handleContactSupport}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Contact Support
              </button>
            )}
            <button
              onClick={handleLogout}
              className="w-full px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Support Email */}
        {errorDetails?.support_email && (
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-500">
              Need help? Email us at{' '}
              <a href={`mailto:${errorDetails.support_email}`} className="text-blue-600 hover:underline">
                {errorDetails.support_email}
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
