'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { SESSION_EXPIRED_EVENT, performSessionLogout } from '@/lib/services/api';

export default function SessionExpiredModal() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleSessionExpired = () => {
      setIsVisible(true);
    };

    window.addEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleSessionExpired);
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
        className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 animate-in fade-in zoom-in duration-200"
      >
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>

          <h3 id="session-expired-title" className="text-xl font-semibold text-gray-900 mb-2">
            Session Expired
          </h3>

          <p id="session-expired-desc" className="text-gray-600 mb-6">
            Your session has expired. Please log in again to continue.
          </p>

          <button
            onClick={performSessionLogout}
            autoFocus
            className="w-full px-4 py-3 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-colors font-medium"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
