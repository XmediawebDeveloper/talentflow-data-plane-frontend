'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, FileText, AlertTriangle, Loader2, LogOut, Check } from 'lucide-react';
import { useTerms } from '@/components/providers/TermsProvider';
import { useAuth } from '@/lib/hooks/useAuth';
import { getLoginUrl } from '@/lib/services/authService';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function TermsAcceptanceModal() {
  const {
    showAcceptanceModal,
    closeAcceptanceModal,
    currentTerms,
    acceptTerms,
    isBlocked,
    isInGracePeriod,
    daysRemaining,
  } = useTerms();
  const { logout } = useAuth();
  const router = useRouter();

  const [accepting, setAccepting] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [checkboxAgreed, setCheckboxAgreed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (showAcceptanceModal) {
      setHasScrolledToBottom(false);
      setCheckboxAgreed(false);
      setAccepting(false);
    }
  }, [showAcceptanceModal]);

  const handleScroll = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const threshold = 50;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    if (isAtBottom) setHasScrolledToBottom(true);
  }, []);

  const canAccept = hasScrolledToBottom || checkboxAgreed;

  const handleAccept = async () => {
    if (!canAccept) return;
    setAccepting(true);
    try {
      const success = await acceptTerms();
      if (success) {
        toast.success('Terms accepted successfully');
      } else {
        toast.error('Failed to accept terms. Please try again.');
      }
    } catch {
      toast.error('Failed to accept terms. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  const handleSignOut = async () => {
    const loginUrl = getLoginUrl();
    await logout();
    router.push(loginUrl);
  };

  if (!showAcceptanceModal || !currentTerms) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{currentTerms.title}</h2>
              <p className="text-blue-100 text-sm">Version {currentTerms.version}</p>
            </div>
          </div>
          {isInGracePeriod && (
            <button
              onClick={closeAcceptanceModal}
              className="p-2 rounded-lg hover:bg-white/20 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          )}
        </div>

        {/* Grace period info bar */}
        {isInGracePeriod && daysRemaining !== null && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800">
              You have <span className="font-semibold">{daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</span> remaining to accept the updated terms before access is restricted.
            </p>
          </div>
        )}

        {/* Scrollable content */}
        <div
          ref={contentRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto px-6 py-5 prose prose-sm max-w-none"
          dangerouslySetInnerHTML={{ __html: currentTerms.content_html }}
        />

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 space-y-3 shrink-0">
          {/* Checkbox fallback for accessibility */}
          {!hasScrolledToBottom && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={checkboxAgreed}
                onChange={(e) => setCheckboxAgreed(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">
                I have read and understand the Terms & Conditions
              </span>
            </label>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleAccept}
              disabled={!canAccept || accepting}
              className="flex-1 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg font-medium hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {accepting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Accepting...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  I Accept
                </>
              )}
            </button>

            {isInGracePeriod && (
              <button
                onClick={closeAcceptanceModal}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors border border-gray-300"
              >
                Remind Me Later
              </button>
            )}

            {isBlocked && (
              <button
                onClick={handleSignOut}
                className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors border border-gray-300 flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
