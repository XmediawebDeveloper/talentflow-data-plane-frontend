'use client';

import { useState } from 'react';
import {
  X, Check, AlertTriangle, Loader2, ArrowRight,
  TrendingUp, TrendingDown, Minus, Plus, DollarSign,
  Gauge, Zap, Clock,
} from 'lucide-react';
import { usePlanChange } from '@/components/providers/PlanChangeProvider';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import type { PlanChangeSummary } from '@/lib/types/planChanges';

const changeTypeLabels: Record<string, { title: string; icon: React.ElementType; color: string }> = {
  price_increase: { title: 'Price Change', icon: DollarSign, color: 'text-amber-600' },
  quota_decrease: { title: 'Quota Adjustment', icon: Gauge, color: 'text-orange-600' },
  feature_removal: { title: 'Feature Changes', icon: Zap, color: 'text-red-600' },
  mixed: { title: 'Plan Changes', icon: AlertTriangle, color: 'text-amber-600' },
};

const urgencyColors = {
  info: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: 'text-blue-500' },
  warning: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: 'text-amber-500' },
  critical: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: 'text-red-500' },
};

const QUOTA_LABELS: Record<string, string> = {
  RU: 'Resume Uploads',
  RS: 'Resume Scoring',
  AS: 'Assessments',
  AIU: 'AI Interviews',
  max_seats: 'Team Seats',
  max_jobs: 'Job Postings',
  storage_gb: 'Storage (GB)',
};

function PriceChangeCard({ priceChange }: { priceChange: NonNullable<PlanChangeSummary['price_change']> }) {
  const increase = priceChange.new_price > priceChange.old_price;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <DollarSign className="w-4 h-4" />
        Price Change
      </h4>
      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className="text-xs text-gray-500">Current</p>
          <p className="text-lg font-bold text-gray-900">
            ₹{priceChange.old_price.toLocaleString()}
          </p>
        </div>
        <ArrowRight className={`w-5 h-5 ${increase ? 'text-red-500' : 'text-green-500'}`} />
        <div className="text-center">
          <p className="text-xs text-gray-500">New</p>
          <p className={`text-lg font-bold ${increase ? 'text-red-600' : 'text-green-600'}`}>
            ₹{priceChange.new_price.toLocaleString()}
          </p>
        </div>
        <div className="ml-auto">
          {increase ? (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700">
              <TrendingUp className="w-3 h-3" />
              +₹{(priceChange.new_price - priceChange.old_price).toLocaleString()}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
              <TrendingDown className="w-3 h-3" />
              -₹{(priceChange.old_price - priceChange.new_price).toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function QuotaChangesTable({ changes }: { changes: NonNullable<PlanChangeSummary['quota_changes']> }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <Gauge className="w-4 h-4" />
        Quota Changes
      </h4>
      <div className="overflow-hidden rounded-lg border border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left px-3 py-2 font-medium text-gray-600">Quota</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">Current</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">New</th>
              <th className="text-center px-3 py-2 font-medium text-gray-600">Change</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {changes.map((change, i) => {
              const decrease = change.new_limit < change.old_limit;
              return (
                <tr key={i}>
                  <td className="px-3 py-2 text-gray-900">
                    {QUOTA_LABELS[change.quota_type] || change.quota_type}
                  </td>
                  <td className="px-3 py-2 text-center text-gray-600">{change.old_limit}</td>
                  <td className={`px-3 py-2 text-center font-medium ${decrease ? 'text-red-600' : 'text-green-600'}`}>
                    {change.new_limit}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {decrease ? (
                      <span className="inline-flex items-center gap-0.5 text-red-600 text-xs font-medium">
                        <Minus className="w-3 h-3" />
                        {change.old_limit - change.new_limit}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-0.5 text-green-600 text-xs font-medium">
                        <Plus className="w-3 h-3" />
                        {change.new_limit - change.old_limit}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FeatureBadges({ features, type }: { features: string[]; type: 'removed' | 'added' }) {
  const isRemoved = type === 'removed';
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <Zap className="w-4 h-4" />
        Features {isRemoved ? 'Removed' : 'Added'}
      </h4>
      <div className="flex flex-wrap gap-2">
        {features.map((feature) => (
          <span
            key={feature}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
              isRemoved
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-green-50 text-green-700 border border-green-200'
            }`}
          >
            {isRemoved ? <Minus className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            {feature}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function PlanChangeReviewModal() {
  const {
    showReviewModal,
    closeReviewModal,
    currentChange,
    urgency,
    daysRemaining,
    acceptChange,
    rejectChange,
    isInAcceptancePeriod,
  } = usePlanChange();

  const dialog = useGlobalDialog();
  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  if (!showReviewModal || !currentChange) return null;

  const changeType = changeTypeLabels[currentChange.change_type] || changeTypeLabels.mixed;
  const ChangeIcon = changeType.icon;
  const urgencyColor = urgencyColors[urgency];
  const summary = currentChange.change_summary;

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await acceptChange();
    } finally {
      setAccepting(false);
    }
  };

  const handleReject = async () => {
    const confirmed = await dialog.confirm({
      title: 'Reject Plan Changes',
      message: 'Are you sure you want to reject these changes? Your subscription will be cancelled at the end of the current billing cycle.',
      confirmText: 'Reject Changes',
      cancelText: 'Cancel',
      variant: 'error',
    });

    if (!confirmed) return;

    // Show a reason input via a prompt
    const reason = window.prompt('Please provide a reason for rejecting the plan changes:');
    if (!reason || !reason.trim()) {
      await dialog.showWarning('Rejection Cancelled', 'A reason is required to reject plan changes.');
      return;
    }

    setRejecting(true);
    try {
      await rejectChange(reason.trim());
    } finally {
      setRejecting(false);
    }
  };

  const hasChanges = summary.price_change ||
    (summary.quota_changes && summary.quota_changes.length > 0) ||
    (summary.features_removed && summary.features_removed.length > 0) ||
    (summary.features_added && summary.features_added.length > 0);

  return (
    <div className="fixed inset-0 z-[88] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <ChangeIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{changeType.title}</h2>
              <p className="text-amber-100 text-sm">Review the upcoming changes to your plan</p>
            </div>
          </div>
          {isInAcceptancePeriod && (
            <button
              onClick={closeReviewModal}
              className="p-2 rounded-lg hover:bg-white/20 transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          )}
        </div>

        {/* Urgency bar */}
        {daysRemaining !== null && (
          <div className={`${urgencyColor.bg} border-b ${urgencyColor.border} px-6 py-3 flex items-center gap-2 shrink-0`}>
            <Clock className={`w-4 h-4 ${urgencyColor.icon} flex-shrink-0`} />
            <p className={`text-sm ${urgencyColor.text}`}>
              <span className="font-semibold">{daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</span> remaining to review.
              {' '}Deadline: {new Date(currentChange.deadline).toLocaleDateString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric'
              })}
            </p>
          </div>
        )}

        {/* Notification message */}
        {currentChange.notification_message && (
          <div className="bg-gray-50 border-b border-gray-200 px-6 py-3 shrink-0">
            <p className="text-sm text-gray-700">{currentChange.notification_message}</p>
          </div>
        )}

        {/* Changes summary - scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {!hasChanges && (
            <p className="text-gray-500 text-sm text-center py-8">No detailed change information available.</p>
          )}

          {summary.price_change && (
            <PriceChangeCard priceChange={summary.price_change} />
          )}

          {summary.quota_changes && summary.quota_changes.length > 0 && (
            <QuotaChangesTable changes={summary.quota_changes} />
          )}

          {summary.features_removed && summary.features_removed.length > 0 && (
            <FeatureBadges features={summary.features_removed} type="removed" />
          )}

          {summary.features_added && summary.features_added.length > 0 && (
            <FeatureBadges features={summary.features_added} type="added" />
          )}

          {/* Impact explanation */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-2">
            <h4 className="text-sm font-semibold text-gray-700">What happens next?</h4>
            <div className="space-y-1.5 text-xs text-gray-600">
              <p className="flex items-start gap-2">
                <Check className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                <span><strong>Accept:</strong> Your subscription continues with the updated plan terms from the next billing cycle.</span>
              </p>
              <p className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                <span><strong>Reject:</strong> Your subscription will be cancelled at the end of the current billing cycle. No further charges will apply.</span>
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-6 py-4 flex items-center gap-3 shrink-0">
          <button
            onClick={handleAccept}
            disabled={accepting || rejecting}
            className="flex-1 px-5 py-2.5 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:from-green-700 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {accepting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Accepting...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Accept Changes
              </>
            )}
          </button>

          <button
            onClick={handleReject}
            disabled={accepting || rejecting}
            className="px-5 py-2.5 bg-red-50 text-red-700 rounded-lg font-medium hover:bg-red-100 transition-colors border border-red-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {rejecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Rejecting...
              </>
            ) : (
              'Reject Changes'
            )}
          </button>

          {isInAcceptancePeriod && (
            <button
              onClick={closeReviewModal}
              className="px-5 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 transition-colors border border-gray-300"
            >
              Later
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
