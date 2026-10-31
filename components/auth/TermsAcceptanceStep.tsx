'use client';

import { useState, useRef, useCallback } from 'react';
import { ArrowLeft, Check, Loader2, FileText } from 'lucide-react';
import type { TermsAndConditions } from '@/lib/types/terms';

interface TermsAcceptanceStepProps {
  terms: TermsAndConditions;
  onAccept: (termsId: string) => void;
  onBack: () => void;
  isLoading?: boolean;
}

export default function TermsAcceptanceStep({
  terms,
  onAccept,
  onBack,
  isLoading = false,
}: TermsAcceptanceStepProps) {
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const [checkboxAgreed, setCheckboxAgreed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const threshold = 50;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    if (isAtBottom) setHasScrolledToBottom(true);
  }, []);

  const canAccept = hasScrolledToBottom || checkboxAgreed;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">{terms.title}</h2>
          <p className="tf-body-muted">Version {terms.version}</p>
        </div>
      </div>

      <p className="tf-card-desc mb-4">
        Please review and accept our Terms & Conditions to complete your registration.
      </p>

      {/* Scrollable T&C content */}
      <div
        ref={contentRef}
        onScroll={handleScroll}
        className="h-64 overflow-y-auto border border-gray-200 rounded-xl p-4 bg-gray-50 prose prose-sm max-w-none mb-4"
        dangerouslySetInnerHTML={{ __html: terms.content_html }}
      />

      {/* Checkbox fallback */}
      {!hasScrolledToBottom && (
        <label className="flex items-start gap-2 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={checkboxAgreed}
            onChange={(e) => setCheckboxAgreed(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="tf-card-desc">
            I have read and agree to the Terms & Conditions
          </span>
        </label>
      )}

      {/* Buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={isLoading}
          className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors border border-gray-300 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          type="button"
          onClick={() => onAccept(terms.id)}
          disabled={!canAccept || isLoading}
          className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Check className="w-4 h-4" />
              I Accept & Continue
            </>
          )}
        </button>
      </div>
    </div>
  );
}
