'use client';

import { Sparkles, X } from 'lucide-react';
import { useAdminAssignedPlan } from '@/components/providers/AdminAssignedPlanProvider';
import { IconButton } from '@/components/ui/icon-button';

export default function AdminAssignedPlanBanner() {
  const {
    hasPendingPlan,
    pendingPlan,
    reminderDismissed,
    dismissReminder,
    openPaymentModal,
  } = useAdminAssignedPlan();

  if (!hasPendingPlan || reminderDismissed || !pendingPlan) return null;

  const planName = pendingPlan.new_plan_name || pendingPlan.plan_name || 'a new plan';

  return (
    // flex-col below sm: the message + full-width buttons row used to share
    // one flex row, so the fixed-width "Complete Payment" button and dismiss
    // icon left the message well under 100px to wrap into on a phone,
    // breaking into one word per line instead of reading as a sentence.
    <div className="border-b bg-indigo-50 border-indigo-200 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 shrink-0">
      <div className="flex items-center gap-3 min-w-0">
        <Sparkles className="w-5 h-5 text-indigo-500 flex-shrink-0" />
        <p className="text-sm text-indigo-800 min-w-0">
          Your admin assigned you <span className="font-semibold">{planName}</span>.
          {' '}Complete payment to activate it.
        </p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto sm:ml-auto">
        <button
          onClick={openPaymentModal}
          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0 whitespace-nowrap"
        >
          Complete Payment
        </button>
        <IconButton bare label="Dismiss"
          onClick={dismissReminder}
          className="p-1 rounded hover:bg-black/5 transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4 text-indigo-500" />
        </IconButton>
      </div>
    </div>
  );
}
