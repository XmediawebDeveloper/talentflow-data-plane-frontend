'use client';

import React from 'react';
import { X, AlertTriangle, Lock, Trash2, FileText } from 'lucide-react';

interface QuotaOverage {
  quotaType: string;
  quotaLabel: string;
  currentUsage: number;
  newPlanLimit: number;
  overage: number;
  unit: string;
}

interface DowngradeWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  currentPlanName: string;
  targetPlanName: string;
  overages: QuotaOverage[];
  isDowngrading?: boolean;
}

export default function DowngradeWarningModal({
  isOpen,
  onClose,
  onConfirm,
  currentPlanName,
  targetPlanName,
  overages,
  isDowngrading = false,
}: DowngradeWarningModalProps) {
  if (!isOpen) return null;

  const hasOverages = overages.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 dark:bg-black/70 backdrop-blur-sm p-4 sm:p-6">
      <div className="relative w-full max-w-[95vw] sm:max-w-2xl bg-white dark:bg-slate-900 rounded-xl shadow-2xl shadow-brand-blue/10 border border-gray-100 dark:border-slate-700/60 ring-1 ring-black/[0.02] dark:ring-white/[0.02] max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-brand-orange/20 bg-gradient-to-r from-brand-orange/5 to-brand-orange-deep/5 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-9 w-9 sm:h-10 sm:w-10 bg-brand-orange/10 ring-1 ring-brand-orange/15 rounded-lg flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-brand-orange" />
            </div>
            <div className="min-w-0">
              <h2 className="tf-section-title sm:text-lg truncate">
                Downgrade Warning
              </h2>
              <p className="tf-body-secondary truncate">
                {currentPlanName} → {targetPlanName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isDowngrading}
            className="p-1.5 hover:bg-white/50 rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
           aria-label="Close">
            <X className="w-5 h-5 text-gray-500 dark:text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 sm:px-6 py-4 sm:py-6 overflow-y-auto flex-1">
          {hasOverages ? (
            <>
              {/* Warning Message */}
              <div className="mb-5 p-3 sm:p-4 bg-brand-orange/5 ring-1 ring-brand-orange/20 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-brand-orange mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="text-sm sm:text-base font-semibold text-brand-orange-deep mb-1">
                      Current Usage Exceeds Target Plan Limits
                    </h3>
                    <p className="tf-body">
                      Your current usage exceeds the limits of the <strong>{targetPlanName}</strong> plan.
                      You must reduce your usage before downgrading.
                    </p>
                  </div>
                </div>
              </div>

              {/* Quota Overages */}
              <div className="space-y-3 mb-5">
                <h4 className="tf-row-title sm:text-base flex items-center gap-2">
                  <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-gray-600 dark:text-slate-400" />
                  Quota Overages
                </h4>

                {overages.map((overage, index) => (
                  <div key={index} className="p-3 sm:p-4 bg-red-50 border border-red-200 rounded-xl">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h5 className="tf-row-title sm:text-base">{overage.quotaLabel}</h5>
                        <p className="tf-body-secondary mt-1">
                          You need to reduce your usage to fit within the new plan limit
                        </p>
                      </div>
                      <Trash2 className="w-5 h-5 text-red-600 flex-shrink-0" />
                    </div>

                    <div className="grid grid-cols-3 gap-2 sm:gap-4 text-sm">
                      <div>
                        <p className="text-gray-600 dark:text-slate-400">Current Usage</p>
                        <p className="tf-section-title sm:text-lg">
                          {overage.currentUsage.toLocaleString()}
                          <span className="tf-meta ml-1">{overage.unit}</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600 dark:text-slate-400">New Plan Limit</p>
                        <p className="font-semibold text-brand-blue text-base sm:text-lg">
                          {overage.newPlanLimit.toLocaleString()}
                          <span className="tf-meta ml-1">{overage.unit}</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600 dark:text-slate-400">Must Remove</p>
                        <p className="font-semibold text-red-600 text-base sm:text-lg">
                          {overage.overage.toLocaleString()}
                          <span className="tf-meta ml-1">{overage.unit}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Read-Only Mode Warning */}
              <div className="p-3 sm:p-4 bg-yellow-50 border border-yellow-200 rounded-xl mb-5">
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-sm sm:text-base font-semibold text-yellow-900 mb-1">
                      Read-Only Mode Will Be Activated
                    </h4>
                    <p className="text-sm text-yellow-800 mb-2">
                      After downgrading, your account will be placed in <strong>read-only mode</strong> until
                      you reduce your usage to fit within the new plan limits.
                    </p>
                    <ul className="text-sm text-yellow-800 space-y-1 ml-4 list-disc">
                      <li>You will <strong>not be able to upload new resumes</strong></li>
                      <li>You will <strong>not be able to run new resume scores</strong></li>
                      <li>You can view existing data and delete items</li>
                      <li>Once usage is within limits, full access will be restored</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Action Required */}
              <div className="p-3 sm:p-4 bg-brand-blue/5 ring-1 ring-brand-blue/15 rounded-xl">
                <h4 className="text-sm sm:text-base font-semibold text-brand-blue mb-2">
                  Action Required Before Downgrading
                </h4>
                <ol className="tf-body space-y-2 ml-4 list-decimal">
                  <li>
                    <strong>Delete excess resumes:</strong> Go to "My Resumes" and remove{' '}
                    {overages.find(o => o.quotaType === 'resume_storage')?.overage.toLocaleString() || 'excess'} resumes
                  </li>
                  <li>
                    <strong>Verify your usage:</strong> Check "Usage & Quotas" to confirm you're within limits
                  </li>
                  <li>
                    <strong>Return to this page:</strong> Once within limits, you can downgrade without restrictions
                  </li>
                </ol>
              </div>
            </>
          ) : (
            <>
              {/* No Overages - Standard Downgrade Confirmation */}
              <div className="mb-5 p-3 sm:p-4 bg-brand-blue/5 ring-1 ring-brand-blue/15 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-brand-blue mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="text-sm sm:text-base font-semibold text-brand-blue mb-1">
                      Confirm Downgrade
                    </h3>
                    <p className="tf-body">
                      You are about to downgrade from <strong>{currentPlanName}</strong> to{' '}
                      <strong>{targetPlanName}</strong>. Please review the changes below.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 tf-body">
                <p className="flex items-start gap-2">
                  <span className="text-gray-400 dark:text-slate-500">•</span>
                  Your billing will be adjusted to the lower plan rate
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-gray-400 dark:text-slate-500">•</span>
                  Your quota limits will be reduced to the new plan's limits
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-gray-400 dark:text-slate-500">•</span>
                  Changes will take effect at the end of your current billing period
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!hasOverages && (
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 sm:gap-3 px-4 sm:px-6 py-3 border-t border-gray-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-950 flex-shrink-0">
          <button
            onClick={onConfirm}
            disabled={isDowngrading}
            className="px-4 py-2 text-sm bg-brand-orange hover:bg-brand-orange-deep text-white rounded-lg shadow-md shadow-brand-orange/25 ring-1 ring-white/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isDowngrading ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Downgrading...
              </>
            ) : (
              'Confirm Downgrade'
            )}
          </button>
        </div>
        )}
      </div>
    </div>
  );
}
