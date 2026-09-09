'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { SESSION_EXPIRED_EVENT, ACCESS_RESTRICTED_EVENT, performSessionLogout } from '@/lib/services/api';

export default function SessionExpiredModal() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleSessionExpired = () => {
      setIsVisible(true);
    };

    // An account restriction is the more specific reason for the same 401 — yield
    // to AccessRestrictedModal so the user never sees both dialogs stacked.
    const handleAccessRestricted = () => {
      setIsVisible(false);
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    window.addEventListener(ACCESS_RESTRICTED_EVENT, handleAccessRestricted);
    return () => {
      window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
      window.removeEventListener(ACCESS_RESTRICTED_EVENT, handleAccessRestricted);
    };
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop — no onClick handler, cannot be dismissed by clicking outside */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-expired-title"
        aria-describedby="session-expired-desc"
        className="relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-md mx-4 max-h-[90dvh] flex flex-col animate-in fade-in zoom-in duration-200 tf-round-edges"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-slate-700/60 flex items-center justify-between shrink-0">
          <h3 id="session-expired-title" className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-slate-50">
            Session Expired
          </h3>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex-1 overflow-y-auto text-center">
          <div className="w-16 h-16 bg-brand-orange/10 ring-1 ring-brand-orange/15 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-brand-orange" />
          </div>

          <p id="session-expired-desc" className="text-sm text-gray-600 dark:text-slate-400">
            Your session has expired. Please log in again to continue.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50/60 dark:bg-slate-950 flex items-center justify-end shrink-0">
          <button
            onClick={performSessionLogout}
            autoFocus
            className="w-full px-4 py-2 text-sm bg-brand-blue hover:bg-brand-blue-2 text-white rounded-lg shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
