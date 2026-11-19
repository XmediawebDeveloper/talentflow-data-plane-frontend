'use client';

import { Trash2 } from 'lucide-react';

/**
 * "Discard" in the AI Interview wizard's footer.
 *
 * One component because the steps had drawn it three ways — Clusters with a
 * trash icon, Preview with none, Configure without the button at all — and a
 * destructive action that changes shape from one step to the next is the one
 * control that should not.
 */
/* Phone footer variant: the wizard footers put Back | Discard on one row as two
   equal halves, so below sm Discard centres its content to match Back beside
   it. (The soft red outline is on the base button at every width.) */
export const WIZARD_DISCARD_MOBILE_CLASS = 'max-sm:justify-center';

export default function WizardDiscardButton({
  onClick,
  disabled = false,
  label = 'Discard',
  className = '',
}: {
  onClick: () => void;
  disabled?: boolean;
  /** Overridden only where the step discards something other than the draft. */
  label?: string;
  /** Extra classes — e.g. the phone footer's full-width, outlined variant. */
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Discard this draft"
      className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-red-600 border border-red-200 dark:border-red-500/40 hover:text-red-700 hover:bg-red-50 hover:border-red-300 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      <Trash2 className="w-4 h-4" />
      {label}
    </button>
  );
}
