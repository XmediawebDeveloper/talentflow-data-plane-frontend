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
export default function WizardDiscardButton({
  onClick,
  disabled = false,
  label = 'Discard',
}: {
  onClick: () => void;
  disabled?: boolean;
  /** Overridden only where the step discards something other than the draft. */
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Discard this draft"
      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <Trash2 className="w-4 h-4" />
      {label}
    </button>
  );
}
