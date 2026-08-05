'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { X, FileText, AlertTriangle, Loader2, LogOut, Check, Shield, Cookie } from 'lucide-react';
import { useTerms } from '@/components/providers/TermsProvider';
import { useAuth } from '@/lib/hooks/useAuth';
import { getLoginUrl } from '@/lib/services/authService';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import type { DocumentType } from '@/lib/services/termsService';

const DOC_META: Record<DocumentType, { label: string; checkboxText: string; Icon: React.ElementType }> = {
  TERMS_AND_CONDITIONS: {
    label: 'Terms & Conditions',
    checkboxText: 'I have read and understand the Terms & Conditions',
    Icon: FileText,
  },
  PRIVACY_POLICY: {
    label: 'Privacy Policy',
    checkboxText: 'I have read and understand the Privacy Policy',
    Icon: Shield,
  },
  COOKIES_POLICY: {
    label: 'Cookie Policy',
    checkboxText: 'I have read and understand the Cookie Policy',
    Icon: Cookie,
  },
};

export default function TermsAcceptanceModal() {
  const {
    showAcceptanceModal,
    closeAcceptanceModal,
    currentTerms,
    currentDocumentType,
    currentDocStep,
    totalDocsRequired,
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

  // Reset scroll/checkbox state when the document changes
  useEffect(() => {
    if (showAcceptanceModal) {
      setHasScrolledToBottom(false);
      setCheckboxAgreed(false);
      setAccepting(false);
      // Scroll content to top for new document
      if (contentRef.current) {
        contentRef.current.scrollTop = 0;
      }
    }
  }, [showAcceptanceModal, currentDocumentType]);

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
        const docLabel = currentDocumentType ? DOC_META[currentDocumentType].label : 'document';
        toast.success(`${docLabel} accepted successfully`);
      } else {
        toast.error('Failed to accept. Please try again.');
      }
    } catch {
      toast.error('Failed to accept. Please try again.');
    } finally {
      setAccepting(false);
    }
  };

  const handleSignOut = async () => {
    const loginUrl = getLoginUrl();
    await logout();
    router.push(loginUrl);
  };

  if (!showAcceptanceModal || !currentTerms || !currentDocumentType) return null;

  const meta = DOC_META[currentDocumentType];
  const DocIcon = meta.Icon;
  const showStepIndicator = totalDocsRequired > 1;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[95vw] sm:max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <DocIcon className="w-5 h-5 text-white" />
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

        {/* Step indicator (only when multiple docs need acceptance) */}
        {showStepIndicator && (
          <div className="bg-indigo-50 border-b border-indigo-100 px-6 py-2.5 flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-1.5">
              {Array.from({ length: totalDocsRequired }).map((_, i) => (
                <div
                  key={i}
                  className={`h-2 rounded-full transition-all ${
                    i < currentDocStep
                      ? 'bg-indigo-600 w-6'
                      : i === currentDocStep - 1
                      ? 'bg-indigo-600 w-6'
                      : 'bg-indigo-200 w-4'
                  }`}
                />
              ))}
            </div>
            <span className="text-sm text-indigo-700 font-medium">
              Document {currentDocStep} of {totalDocsRequired}: {meta.label}
            </span>
          </div>
        )}

        {/* Grace period info bar */}
        {isInGracePeriod && daysRemaining !== null && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-800">
              You have <span className="font-semibold">{daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</span> remaining to accept the updated documents before access is restricted.
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
          {/* Checkbox fallback */}
          {!hasScrolledToBottom && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={checkboxAgreed}
                onChange={(e) => setCheckboxAgreed(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-600">{meta.checkboxText}</span>
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
                  {showStepIndicator && currentDocStep < totalDocsRequired
                    ? `Accept & Continue (${currentDocStep}/${totalDocsRequired})`
                    : 'I Accept'}
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
