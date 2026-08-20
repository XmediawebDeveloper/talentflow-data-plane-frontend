'use client';

import { AlertTriangle, Mail, LogOut, ExternalLink, FileSearch, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { getLoginUrl } from '@/lib/services/authService';
import { usePlanChange } from '@/components/providers/PlanChangeProvider';
import type { PlanChangeSummary } from '@/lib/types/planChanges';

const QUOTA_LABELS: Record<string, string> = {
  RU: 'Resume Storage',
  RS: 'Resume Scoring',
  AS: 'Assessments',
  AIU: 'AI Interviews',
  max_seats: 'Team Seats',
  max_jobs: 'Job Postings',
  storage_gb: 'Storage (GB)',
};

function ChangeSummaryInline({ summary }: { summary: PlanChangeSummary }) {
  return (
    <div className="space-y-3">
      {summary.price_change && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-orange-600 font-medium">Price:</span>
          <span className="text-gray-700">
            ₹{summary.price_change.old_price.toLocaleString()} → ₹{summary.price_change.new_price.toLocaleString()}
          </span>
        </div>
      )}

      {summary.quota_changes && summary.quota_changes.length > 0 && (
        <div className="space-y-1">
          <span className="text-orange-600 font-medium text-sm">Quota changes:</span>
          {summary.quota_changes.map((change, i) => (
            <div key={i} className="flex items-center gap-2 text-sm pl-4">
              <span className="text-gray-600">
                {QUOTA_LABELS[change.quota_type] || change.quota_type}:
              </span>
              <span className="text-gray-700">
                {change.old_limit} → {change.new_limit}
              </span>
            </div>
          ))}
        </div>
      )}

      {summary.features_removed && summary.features_removed.length > 0 && (
        <div className="text-sm">
          <span className="text-orange-600 font-medium">Features removed: </span>
          <span className="text-gray-700">{summary.features_removed.join(', ')}</span>
        </div>
      )}
    </div>
  );
}

export default function PlanChangeSuspendedBlock() {
  const router = useRouter();
  const { logout } = useAuth();
  const { currentChange, openReviewModal } = usePlanChange();

  const handleSignOut = async () => {
    const loginUrl = getLoginUrl();
    await logout();
    router.push(loginUrl);
  };

  const handleContactSupport = () => {
    window.location.href = 'mailto:support@talentflow.com?subject=Plan Change - Account Paused - Support Request';
  };

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-2xl border-2 border-orange-200 overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-orange-500 to-amber-600 px-8 py-6">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Account Paused</h1>
                <p className="text-orange-100 text-sm mt-1">Plan changes require your review</p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-8 py-8">
            {/* Suspension Message */}
            <div className="bg-orange-50 border-l-4 border-orange-500 p-6 rounded-r-lg mb-8">
              <p className="text-orange-800 font-medium mb-2">
                Your account has been paused because pending plan changes were not reviewed before the deadline.
              </p>
              <p className="text-orange-600 text-sm">
                You can still accept the changes to reactivate your account immediately.
              </p>
            </div>

            {/* Change summary */}
            {currentChange?.change_summary && (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-500" />
                  Pending Changes
                </h3>
                <ChangeSummaryInline summary={currentChange.change_summary} />
              </div>
            )}

            {/* Information */}
            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-orange-600 text-sm font-bold">!</span>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">What does this mean?</h3>
                  <p className="text-gray-600 text-sm">
                    Your account access has been temporarily paused. You can restore full access by reviewing and accepting the plan changes, or contact support for assistance.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                  <FileSearch className="w-3.5 h-3.5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">How to restore access?</h3>
                  <p className="text-gray-600 text-sm">
                    Click &quot;Review & Accept Changes&quot; below to review the pending plan changes and accept them. Your account will be reactivated immediately.
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={openReviewModal}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-semibold hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
              >
                <FileSearch className="w-5 h-5" />
                Review & Accept Changes
              </button>

              <button
                onClick={handleContactSupport}
                className="flex-1 px-6 py-3 bg-blue-50 text-blue-700 rounded-lg font-semibold hover:bg-blue-100 transition-all flex items-center justify-center gap-2 border border-blue-200"
              >
                <Mail className="w-5 h-5" />
                Contact Support
                <ExternalLink className="w-4 h-4" />
              </button>

              <button
                onClick={handleSignOut}
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition-all flex items-center justify-center gap-2 border border-gray-300"
              >
                <LogOut className="w-5 h-5" />
                Sign Out
              </button>
            </div>

            {/* Support Info */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <p className="text-center text-sm text-gray-500">
                Need immediate assistance? Email us at{' '}
                <a
                  href="mailto:support@talentflow.com"
                  className="text-blue-600 hover:text-blue-700 font-medium underline"
                >
                  support@talentflow.com
                </a>
              </p>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-6 text-center">
          <p className="text-gray-600 text-sm">
            Your account data is safe and secure. Accepting the changes will restore full access immediately.
          </p>
        </div>
      </div>
    </div>
  );
}
