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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4 sm:p-6">
      <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl border border-gray-200 max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-orange-50 to-red-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-orange-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Downgrade Warning
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
              <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-orange-900 mb-1">
                      Current Usage Exceeds Target Plan Limits
                    </h3>
                    <p className="text-sm text-orange-800">
                      Your current usage exceeds the limits of the <strong>{targetPlanName}</strong> plan.
                      You must reduce your usage before downgrading.
                    </p>
                  </div>
                </div>
              </div>

              {/* Quota Overages */}
              <div className="space-y-4 mb-6">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-gray-600" />
                  Quota Overages
                </h4>

                {overages.map((overage, index) => (
                  <div key={index} className="p-4 bg-red-50 border border-red-200 rounded-xl">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h5 className="font-semibold text-gray-900">{overage.quotaLabel}</h5>
                        <p className="text-sm text-gray-600 mt-1">
                          You need to reduce your usage to fit within the new plan limit
                        </p>
                      </div>
                      <Trash2 className="w-5 h-5 text-red-600 flex-shrink-0" />
                    </div>

                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-gray-600">Current Usage</p>
                        <p className="font-bold text-gray-900 text-lg">
                          {overage.currentUsage.toLocaleString()}
                          <span className="text-sm text-gray-600 ml-1">{overage.unit}</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">New Plan Limit</p>
                        <p className="font-bold text-blue-600 text-lg">
                          {overage.newPlanLimit.toLocaleString()}
                          <span className="text-sm text-gray-600 ml-1">{overage.unit}</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-gray-600">Must Remove</p>
                        <p className="font-bold text-red-600 text-lg">
                          {overage.overage.toLocaleString()}
                          <span className="text-sm text-gray-600 ml-1">{overage.unit}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Read-Only Mode Warning */}
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-xl mb-6">
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-yellow-900 mb-1">
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
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <h4 className="font-semibold text-blue-900 mb-2">
                  ✅ Action Required Before Downgrading
                </h4>
                <ol className="text-sm text-blue-800 space-y-2 ml-4 list-decimal">
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
              <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-blue-900 mb-1">
                      Confirm Downgrade
                    </h3>
                    <p className="text-sm text-blue-800">
                      You are about to downgrade from <strong>{currentPlanName}</strong> to{' '}
                      <strong>{targetPlanName}</strong>. Please review the changes below.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3 text-sm text-gray-700">
                <p className="flex items-start gap-2">
                  <span className="text-gray-400">•</span>
                  Your billing will be adjusted to the lower plan rate
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-gray-400">•</span>
                  Your quota limits will be reduced to the new plan's limits
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-gray-400">•</span>
                  Changes will take effect at the end of your current billing period
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
          {hasOverages ? (
            <button
              onClick={onClose}
              className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              I Understand - Close
            </button>
          ) : (
            <button
              onClick={onConfirm}
              disabled={isDowngrading}
              className="px-6 py-2.5 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center gap-2"
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
          )}
        </div>
      </div>
    </div>
  );
}
