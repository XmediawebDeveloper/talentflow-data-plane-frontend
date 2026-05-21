'use client';

import { Sparkles, X } from 'lucide-react';
import { useAdminAssignedPlan } from '@/components/providers/AdminAssignedPlanProvider';

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
    <div className="border-b bg-indigo-50 border-indigo-200 px-4 py-3 flex items-center gap-3 shrink-0">
      <Sparkles className="w-5 h-5 text-indigo-500 flex-shrink-0" />
      <p className="text-sm text-indigo-800 flex-1">
        Your admin assigned you <span className="font-semibold">{planName}</span>.
        {' '}Complete payment to activate it.
      </p>
      <button
        onClick={openPaymentModal}
        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0"
      >
        Complete Payment
      </button>
      <button
        onClick={dismissReminder}
        className="p-1 rounded hover:bg-black/5 transition-colors flex-shrink-0"
        aria-label="Dismiss"
      >
        <X className="w-4 h-4 text-indigo-500" />
      </button>
    </div>
  );
}
