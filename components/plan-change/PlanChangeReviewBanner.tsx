'use client';

import { AlertTriangle, Info, AlertCircle, X } from 'lucide-react';
import { usePlanChange } from '@/components/providers/PlanChangeProvider';
import { IconButton } from '@/components/ui/icon-button';

const urgencyConfig = {
  info: {
    bg: 'bg-blue-50 border-blue-200',
    text: 'text-blue-800',
    icon: Info,
    iconColor: 'text-blue-500',
    btnBg: 'bg-blue-600 hover:bg-blue-700',
  },
  warning: {
    bg: 'bg-amber-50 border-amber-200',
    text: 'text-amber-800',
    icon: AlertTriangle,
    iconColor: 'text-amber-500',
    btnBg: 'bg-amber-600 hover:bg-amber-700',
  },
  critical: {
    bg: 'bg-red-50 border-red-200',
    text: 'text-red-800',
    icon: AlertCircle,
    iconColor: 'text-red-500',
    btnBg: 'bg-red-600 hover:bg-red-700',
  },
};

export default function PlanChangeReviewBanner() {
  const {
    hasPendingChanges,
    isInAcceptancePeriod,
    reminderDismissed,
    dismissReminder,
    openReviewModal,
    urgency,
    daysRemaining,
  } = usePlanChange();

  if (!hasPendingChanges || !isInAcceptancePeriod || reminderDismissed) return null;

  const config = urgencyConfig[urgency];
  const Icon = config.icon;

  return (
    <div className={`border-b ${config.bg} px-4 py-3 flex items-center gap-3 shrink-0`}>
      <Icon className={`w-5 h-5 ${config.iconColor} flex-shrink-0`} />
      <p className={`text-sm ${config.text} flex-1`}>
        Your plan has upcoming changes.
        {daysRemaining !== null && (
          <> <span className="font-semibold">{daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</span> to review.</>
        )}
      </p>
      <button
        onClick={openReviewModal}
        className={`px-3 py-1.5 ${config.btnBg} text-white text-sm font-medium rounded-lg transition-colors flex-shrink-0`}
      >
        Review Changes
      </button>
      <IconButton bare label="Dismiss"
        onClick={dismissReminder}
        className="p-1 rounded hover:bg-black/5 transition-colors flex-shrink-0"
      >
        <X className={`w-4 h-4 ${config.iconColor}`} />
      </IconButton>
    </div>
  );
}
