'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Lock, ShieldCheck } from 'lucide-react';
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
        className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] w-full max-w-[95vw] sm:max-w-md mx-4 max-h-[90dvh] flex flex-col animate-in fade-in zoom-in duration-200 tf-round-edges"
      >
        {/* Body */}
        <div className="px-6 sm:px-8 pt-8 pb-6 flex-1 overflow-y-auto text-center">
          <div className="w-20 h-20 bg-brand-orange/10 rounded-full flex items-center justify-center mx-auto mb-5">
            <AlertTriangle className="w-10 h-10 text-brand-orange" strokeWidth={2} />
          </div>

          <h3 id="session-expired-title" className="text-2xl font-bold text-gray-900 dark:text-slate-50 mb-3">
            Session Expired
          </h3>

          <p id="session-expired-desc" className="tf-body-muted leading-relaxed">
            Your session has expired due to inactivity for security reasons.
            <br />
            Please log in again to continue.
          </p>

          <div className="mt-6 bg-brand-blue/5 dark:bg-brand-blue/10 rounded-xl p-4 flex items-start gap-3 text-left">
            <ShieldCheck className="w-6 h-6 text-brand-blue dark:text-brand-blue shrink-0 mt-0.5" strokeWidth={2} />
            <div>
              <p className="text-sm font-semibold text-brand-blue dark:text-brand-blue">
                Your data is safe and secure.
              </p>
              <p className="tf-body-muted mt-0.5">
                For your security, we&apos;ve automatically signed you out.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 sm:px-8 pb-8 shrink-0">
          <button
            onClick={performSessionLogout}
            autoFocus
            className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold bg-brand-blue hover:bg-brand-blue-2 text-white rounded-xl shadow-md shadow-brand-blue/25 ring-1 ring-white/10 transition-colors"
          >
            <Lock className="w-4 h-4" strokeWidth={2} />
            Log In Again
          </button>
        </div>
      </div>
    </div>
  );
}
