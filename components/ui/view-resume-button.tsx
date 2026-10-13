'use client';

import { Eye, Loader2 } from 'lucide-react';

interface ViewResumeButtonProps {
  onClick: () => void;
  /** Swaps the eye for a spinner and blocks further clicks while a resume loads. */
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  /** `bordered` is the outline with a full-strength brand-blue border; `outline` (default) is the canonical look. */
  variant?: 'outline' | 'bordered';
}

/**
 * The one "View Resume" button. Extracted because the four call sites had
 * drifted into four different looks — an amber pill in the upload duplicate
 * warning, a filled brand-blue button in the upload-history footer, and two
 * near-identical outlines that disagreed on vertical padding. The canonical
 * appearance is the one on the assessment candidate-result page.
 *
 * Presentational only: every caller keeps its own resolve/open logic.
 */
export default function ViewResumeButton({
  onClick,
  loading = false,
  disabled = false,
  className = '',
  variant = 'outline',
}: ViewResumeButtonProps) {
  const look = variant === 'bordered'
    ? 'text-brand-blue bg-white border border-brand-blue hover:bg-brand-blue/5 justify-center'
    : 'text-brand-blue bg-white border border-brand-blue/40 hover:bg-brand-blue/5';
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium ${look} rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed${className ? ` ${className}` : ''}`}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
      View Resume
    </button>
  );
}
