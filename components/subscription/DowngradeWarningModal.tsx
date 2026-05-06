'use client';

import React from 'react';
import { X, AlertTriangle, Lock, Trash2, FileText, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface QuotaOverage {
  quotaType: string;
  quotaLabel: string;
  currentUsage: number;
  newPlanLimit: number;
  overage: number;
  unit: string;
}

interface QuotaNearLimit {
  quotaType: string;
  quotaLabel: string;
  currentUsage: number;
  newPlanLimit: number;
  remaining: number;
  percentageUsed: number;
  unit: string;
}

interface DowngradeWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  currentPlanName: string;
  targetPlanName: string;
  overages: QuotaOverage[];
  nearLimitQuotas?: QuotaNearLimit[];
  isDowngrading?: boolean;
}

export default function DowngradeWarningModal({
  isOpen,
  onClose,
  onConfirm,
  currentPlanName,
  targetPlanName,
  overages,
  nearLimitQuotas = [],
  isDowngrading = false,
}: DowngradeWarningModalProps) {
  const router = useRouter();

  if (!isOpen) return null;

  const hasOverages = overages.length > 0;
  const hasNearLimitWarnings = nearLimitQuotas.length > 0;

  // Get icon for quota type
  const getQuotaIcon = (quotaType: string) => {
    switch (quotaType) {
      case 'resume_storage':
        return <FileText className="w-5 h-5 text-red-600 flex-shrink-0" />;
      case 'max_seats':
        return <Users className="w-5 h-5 text-red-600 flex-shrink-0" />;
      default:
        return <Trash2 className="w-5 h-5 text-red-600 flex-shrink-0" />;
    }
  };

  // Get action link for quota type
  const getActionLink = (quotaType: string) => {
    switch (quotaType) {
      case 'resume_storage':
        return '/recruitment/my-resumes';
      case 'max_seats':
        return '/organization/user-management';
      default:
        return null;
    }
  };

  const handleGoToAction = (quotaType: string) => {
    const link = getActionLink(quotaType);
    if (link) {
      onClose();
      router.push(link);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl mx-4 bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-red-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                {hasOverages ? 'Downgrade with Read-Only Mode' : 'Confirm Downgrade'}
              </h2>
              <p className="text-sm text-gray-600">
                {currentPlanName} → {targetPlanName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDowngrading}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
           aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {hasOverages ? (
            <>
              {/* Warning Message */}
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-red-900 mb-1">
                      Current Usage Exceeds Target Plan Limits
                    </h3>
                    <p className="text-sm text-red-800">
                      Your current usage exceeds the limits of the <strong>{targetPlanName}</strong> plan.
                      You can still downgrade — your account will enter <strong>read-only mode</strong> until you reduce usage to fit within the new limits.
                    </p>
                  </div>
                </div>
              </div>

              {/* Quota Overages */}
              <div className="space-y-4 mb-6">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-gray-600" />
                  Usage Overages
                </h4>

                {overages.map((overage, index) => (
                  <div key={index} className="p-4 bg-red-50 border border-red-200 rounded-xl">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-3">
                        {getQuotaIcon(overage.quotaType)}
                        <div>
                          <h5 className="font-semibold text-gray-900">{overage.quotaLabel}</h5>
                          <p className="text-sm text-gray-600 mt-1">
                            You need to reduce your usage to fit within the new plan limit
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-sm mb-4">
                      <div>
                        <p className="text-gray-600">Current Usage</p>
                        <p className="font-bold text-gray-900 text-lg">
                          {overage.currentUsage.toLocaleString()}
                          {overage.unit && <span className="text-sm text-gray-600 ml-1">{overage.unit}</span>}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">New Plan Limit</p>
                        <p className="font-bold text-blue-600 text-lg">
                          {overage.newPlanLimit.toLocaleString()}
                          {overage.unit && <span className="text-sm text-gray-600 ml-1">{overage.unit}</span>}
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">Must Remove</p>
                        <p className="font-bold text-red-600 text-lg">
                          {overage.overage.toLocaleString()}
                          {overage.unit && <span className="text-sm text-gray-600 ml-1">{overage.unit}</span>}
                        </p>
                      </div>
                    </div>

                    {getActionLink(overage.quotaType) && (
                      <button
                        onClick={() => handleGoToAction(overage.quotaType)}
                        className="w-full px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                      >
                        {overage.quotaType === 'resume_storage' ? (
                          <>
                            <FileText className="w-4 h-4" />
                            Go to My Resumes
                          </>
                        ) : overage.quotaType === 'max_seats' ? (
                          <>
                            <Users className="w-4 h-4" />
                            Go to User Management
                          </>
                        ) : (
                          <>Manage {overage.quotaLabel}</>
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Read-Only Mode Warning */}
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl mb-6">
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-yellow-900 mb-1">
                      ⚠️ Read-Only Mode Will Be Activated
                    </h4>
                    <p className="text-sm text-yellow-800 mb-2">
                      If you downgrade while exceeding quota limits, your account will be placed in{' '}
                      <strong>read-only mode</strong> until you reduce your usage.
                    </p>
                    <ul className="text-sm text-yellow-800 space-y-1 ml-4 list-disc">
                      <li>You will <strong>NOT be able to upload new resumes</strong></li>
                      <li>You will <strong>NOT be able to run new resume scores</strong></li>
                      <li>You will <strong>NOT be able to create new assessments</strong></li>
                      <li>You <strong>CAN</strong> view existing data and delete items to reduce usage</li>
                      <li>Once usage is within limits, full access will be automatically restored</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Action Steps */}
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                  <span className="text-lg">ℹ️</span>
                  Steps to Restore Full Access After Downgrading
                </h4>
                <ol className="text-sm text-blue-800 space-y-2 ml-4 list-decimal">
                  {overages.map((overage, index) => (
                    <li key={index}>
                      <strong>Reduce {overage.quotaLabel}:</strong> Remove{' '}
                      {overage.overage.toLocaleString()} {overage.unit || 'items'} to fit within the{' '}
                      {overage.newPlanLimit.toLocaleString()} limit
                    </li>
                  ))}
                  <li>
                    <strong>Full access restored automatically</strong> once your usage is within all new plan limits
                  </li>
                </ol>
              </div>
            </>
          ) : (
            <>
              {/* No Overages - Standard Downgrade Confirmation */}
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-blue-900 mb-1">
                      Confirm Plan Downgrade
                    </h3>
                    <p className="text-sm text-blue-800">
                      You are about to downgrade from <strong>{currentPlanName}</strong> to{' '}
                      <strong>{targetPlanName}</strong>. Please review the changes below.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 text-sm text-gray-700 mb-6">
                <p className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold">•</span>
                  <span>Your billing will be adjusted to the lower plan rate</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold">•</span>
                  <span>Your quota limits will be reduced to match the new plan</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold">•</span>
                  <span>Changes will take effect at the end of your current billing period</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold">•</span>
                  <span>You can upgrade again at any time if needed</span>
                </p>
              </div>

              {/* Near Limit Warnings - Show when approaching quota limits */}
              {hasNearLimitWarnings && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-start gap-3 mb-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <h4 className="font-semibold text-amber-900 mb-1">
                        ⚠️ Limited Storage Remaining
                      </h4>
                      <p className="text-sm text-amber-800">
                        After downgrading, you'll be close to your quota limits. Be careful with new uploads.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {nearLimitQuotas.map((quota, index) => (
                      <div key={index} className="p-3 bg-white rounded-lg border border-amber-200">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-semibold text-gray-900">{quota.quotaLabel}</span>
                          <span className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-1 rounded">
                            {quota.percentageUsed.toFixed(0)}% Used
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-sm mb-2">
                          <div>
                            <p className="text-gray-600 text-xs">Used</p>
                            <p className="font-bold text-gray-900">
                              {quota.currentUsage.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-gray-600 text-xs">Limit</p>
                            <p className="font-bold text-blue-600">
                              {quota.newPlanLimit.toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-amber-700 text-xs font-semibold">Remaining</p>
                            <p className="font-bold text-amber-700">
                              {quota.remaining.toLocaleString()}
                            </p>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all ${
                              quota.percentageUsed >= 90
                                ? 'bg-red-500'
                                : quota.percentageUsed >= 75
                                ? 'bg-amber-500'
                                : 'bg-blue-500'
                            }`}
                            style={{ width: `${Math.min(quota.percentageUsed, 100)}%` }}
                          />
                        </div>

                        <p className="text-xs text-amber-800 mt-2">
                          <strong>Warning:</strong> You have only{' '}
                          <strong>{quota.remaining.toLocaleString()} {quota.unit}</strong> left to upload.
                          Consider deleting old data before adding new items.
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">
                  <strong>Note:</strong> Make sure your current usage is within the new plan's limits
                  to avoid any service interruptions.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            disabled={isDowngrading}
            className="px-6 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDowngrading}
            className={`px-6 py-2.5 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 ${
              hasOverages
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-orange-600 hover:bg-orange-700'
            }`}
          >
            {isDowngrading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Downgrading...
              </>
            ) : hasOverages ? (
              <>
                <Lock className="w-4 h-4" />
                Downgrade (Read-Only Mode)
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4" />
                Confirm Downgrade
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
