'use client';

import React, { useEffect, useState } from 'react';
import { ShieldAlert, LogOut, Mail, UserRound } from 'lucide-react';
import { usePathname } from 'next/navigation';
import {
  ACCESS_RESTRICTED_EVENT,
  AccessRestrictedDetail,
  clearTokens,
} from '@/lib/services/api';
import { getLoginUrl } from '@/lib/services/authService';

// Auth / unauthenticated routes where a logged-in restriction modal makes no
// sense (the user is already signed out or setting up their account).
const EXCLUDED_PATHS = ['/login', '/signup', '/signin', '/set-password', '/forgot-password', '/complete-payment'];

interface RestrictedUser {
  name?: string;
  email?: string;
}

// Best-effort read of the current user's basic info from localStorage, used as a
// fallback when the dispatched event doesn't carry name/email (e.g. the reactive
// interceptor path, which only knows a request was rejected).
const readStoredUser = (): RestrictedUser => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem('talentflow_user');
    if (!raw) return {};
    const u = JSON.parse(raw);
    return { name: u?.name, email: u?.email };
  } catch {
    return {};
  }
};

export default function AccessRestrictedModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [affectedUser, setAffectedUser] = useState<RestrictedUser>({});
  const pathname = usePathname();

  const isExcludedPath = EXCLUDED_PATHS.some((p) => pathname?.includes(p));

  useEffect(() => {
    const handleRestricted = (event: CustomEvent<AccessRestrictedDetail>) => {
      // Never overlay the login / setup screens.
      if (EXCLUDED_PATHS.some((p) => window.location.pathname.includes(p))) return;

      const detail = event.detail || {};
      const stored = readStoredUser();
      setAffectedUser({
        name: detail.name || stored.name,
        email: detail.email || stored.email,
      });
      setIsOpen(true);
    };

    window.addEventListener(ACCESS_RESTRICTED_EVENT, handleRestricted as EventListener);
    return () => window.removeEventListener(ACCESS_RESTRICTED_EVENT, handleRestricted as EventListener);
  }, []);

  // Lock background scroll while the modal blocks the app.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (isOpen && !isExcludedPath) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [isOpen, isExcludedPath]);

  const handleSignOut = () => {
    // Full local cleanup so a refresh/back-navigation can't restore the session.
    clearTokens();
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('talentflow_user');
        localStorage.removeItem('talentflow_tenant');
        localStorage.removeItem('permission_version');
        localStorage.removeItem('pending_password_reset');
        sessionStorage.clear();
      } catch { /* noop */ }
    }
    const loginUrl = getLoginUrl();
    setIsOpen(false);
    // Hard navigate — re-mounts the login page cleanly and guarantees no dashboard
    // state survives (mirrors AuthProvider.logout()).
    if (typeof window !== 'undefined') window.location.href = loginUrl;
  };

  if (!isOpen || isExcludedPath) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="access-restricted-title"
      aria-describedby="access-restricted-desc"
    >
      {/* Backdrop — darkened + blurred, captures all pointer events so nothing
          behind it is interactive. No click-to-dismiss: the only way out is Sign Out. */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-w-[95vw] sm:max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">

        {/* Top red banner */}
        <div className="h-1.5 bg-red-500 shrink-0" />

        {/* Header */}
        <div className="pt-7 pb-2 px-6 sm:px-8 text-center shrink-0">
          <div className="mx-auto w-16 h-16 sm:w-20 sm:h-20 bg-red-100 dark:bg-red-500/15 ring-1 ring-red-200 dark:ring-red-500/30 rounded-full flex items-center justify-center mb-4">
            <ShieldAlert className="w-8 h-8 sm:w-10 sm:h-10 text-red-600" strokeWidth={2} />
          </div>

          <h2 id="access-restricted-title" className="text-lg sm:text-xl font-semibold mb-2 text-red-700 dark:text-red-400">
            Access Restricted
          </h2>

          <p className="text-gray-600 dark:text-slate-400 text-sm">
            Your access has been restricted by your organization administrator.
          </p>
        </div>

        {/* Body */}
        <div className="px-6 sm:px-8 pb-6 flex-1 overflow-y-auto">

          {/* Explanation */}
          <p id="access-restricted-desc" className="mt-4 text-sm text-gray-600 dark:text-slate-400 leading-relaxed text-center">
            Your current session has ended and you can no longer access the application.
            If you believe this restriction was made in error, please contact your administrator.
          </p>

          {/* Affected user info */}
          {(affectedUser.name || affectedUser.email) && (
            <div className="mt-5 mb-5 p-4 bg-slate-50 dark:bg-slate-950 rounded-lg border border-gray-100 dark:border-slate-700/60">
              {affectedUser.name && (
                <div className="flex items-center gap-3 text-sm">
                  <UserRound className="w-4 h-4 text-gray-400 dark:text-slate-500 shrink-0" />
                  <span className="text-gray-500 dark:text-slate-500">Name</span>
                  <span className="ml-auto font-medium text-gray-800 dark:text-slate-200 truncate">{affectedUser.name}</span>
                </div>
              )}
              {affectedUser.email && (
                <div className={`flex items-center gap-3 text-sm ${affectedUser.name ? 'mt-2.5' : ''}`}>
                  <Mail className="w-4 h-4 text-gray-400 dark:text-slate-500 shrink-0" />
                  <span className="text-gray-500 dark:text-slate-500">Email</span>
                  <span className="ml-auto font-medium text-gray-800 dark:text-slate-200 truncate">{affectedUser.email}</span>
                </div>
              )}
            </div>
          )}

          {/* Sign Out */}
          <button
            onClick={handleSignOut}
            autoFocus
            className="w-full px-4 py-2.5 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-md shadow-red-600/25 ring-1 ring-white/10 transition-colors flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
