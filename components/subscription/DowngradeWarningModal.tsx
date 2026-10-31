'use client';

import React from 'react';
import { AlertTriangle, Lock, Trash2, FileText, Users, Info, ArrowRight } from 'lucide-react';
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
        return <FileText className="h-4 w-4" />;
      case 'max_seats':
        return <Users className="h-4 w-4" />;
      default:
        return <Trash2 className="h-4 w-4" />;
    }
  };

  // Get action link for quota type
  const getActionLink = (quotaType: string) => {
    switch (quotaType) {
      case 'resume_storage':
        return '/recruitment/resume-database?tab=my-resumes';
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

  // One neutral stat cell: label above, value + unit below.
  const Stat = ({ label, value, unit, tone = 'default' }: { label: string; value: number; unit?: string; tone?: 'default' | 'danger' }) => (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-medium text-gray-500 dark:text-slate-400 sm:text-xs">{label}</p>
      <p className={`mt-0.5 truncate text-base font-semibold tabular-nums sm:text-lg ${tone === 'danger' ? 'text-destructive' : 'text-gray-900 dark:text-slate-50'}`}>
        {value.toLocaleString()}
        {unit && <span className="ml-1 text-xs font-normal text-gray-500 dark:text-slate-400">{unit}</span>}
      </p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm dark:bg-black/70 sm:items-center sm:p-4">
      <div className="relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:max-h-[90dvh] sm:max-w-2xl sm:rounded-2xl tf-round-edges">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-100 px-4 py-3 dark:border-slate-700/60 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-subtle text-warning sm:h-10 sm:w-10">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate tf-section-title">
                {hasOverages ? 'Downgrade with Read-Only Mode' : 'Confirm Downgrade'}
              </h2>
              <p className="truncate text-xs text-gray-500 dark:text-slate-400 sm:text-sm">
                {currentPlanName} → {targetPlanName}
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:space-y-5 sm:px-6 sm:py-5">
          {hasOverages ? (
            <>
              {/* Warning Message */}
              <div className="flex items-start gap-3 rounded-xl bg-warning-subtle/60 p-3 sm:p-4">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div className="min-w-0">
                  <h3 className="tf-subsection-title">
                    Current Usage Exceeds Target Plan Limits
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-600 dark:text-slate-400 sm:text-sm">
                    Your current usage exceeds the limits of the <strong className="font-semibold text-gray-900 dark:text-slate-100">{targetPlanName}</strong> plan.
                    You can still downgrade — your account will enter <strong className="font-semibold text-gray-900 dark:text-slate-100">read-only mode</strong> until you reduce usage to fit within the new limits.
                  </p>
                </div>
              </div>

              {/* Quota Overages */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
                  Usage Overages
                </h4>

                {overages.map((overage, index) => (
                  <div key={index} className="rounded-xl border border-gray-200 p-3 dark:border-slate-700 sm:p-4">
                    <div className="mb-3 flex items-start gap-2.5">
                      <span className="mt-0.5 text-gray-500 dark:text-slate-400">{getQuotaIcon(overage.quotaType)}</span>
                      <div className="min-w-0">
                        <h5 className="text-sm font-semibold text-gray-900 dark:text-slate-50">{overage.quotaLabel}</h5>
                        <p className="mt-0.5 tf-meta">
                          You need to reduce your usage to fit within the new plan limit
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 rounded-lg bg-gray-50 p-2.5 dark:bg-slate-800/50 sm:gap-4 sm:p-3">
                      <Stat label="Current Usage" value={overage.currentUsage} unit={overage.unit} />
                      <Stat label="New Plan Limit" value={overage.newPlanLimit} unit={overage.unit} />
                      <Stat label="Must Remove" value={overage.overage} unit={overage.unit} tone="danger" />
                    </div>

                    {getActionLink(overage.quotaType) && (
                      <button
                        onClick={() => handleGoToAction(overage.quotaType)}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-800 transition-colors hover:border-brand-blue/30 hover:bg-brand-blue/[0.04] hover:text-brand-blue dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        {overage.quotaType === 'resume_storage' ? (
                          <>
                            <FileText className="h-4 w-4" />
                            Go to My Resumes
                          </>
                        ) : overage.quotaType === 'max_seats' ? (
                          <>
                            <Users className="h-4 w-4" />
                            Go to User Management
                          </>
                        ) : (
                          <>Manage {overage.quotaLabel}</>
                        )}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Read-Only Mode Warning */}
              <div className="rounded-xl bg-gray-50 p-3 dark:bg-slate-800/50 sm:p-4">
                <div className="flex items-start gap-3">
                  <Lock className="mt-0.5 h-4 w-4 shrink-0 text-gray-500 dark:text-slate-400" />
                  <div className="min-w-0">
                    <h4 className="tf-subsection-title">
                      Read-Only Mode Will Be Activated
                    </h4>
                    <p className="mt-0.5 text-xs text-gray-600 dark:text-slate-400 sm:text-sm">
                      If you downgrade while exceeding quota limits, your account will be placed in{' '}
                      <strong className="font-semibold text-gray-900 dark:text-slate-100">read-only mode</strong> until you reduce your usage.
                    </p>
                    <ul className="ml-4 mt-2 list-disc space-y-1 text-xs text-gray-600 marker:text-gray-400 dark:text-slate-400 sm:text-sm">
                      <li>You will <strong className="font-semibold text-gray-900 dark:text-slate-100">NOT be able to upload new resumes</strong></li>
                      <li>You will <strong className="font-semibold text-gray-900 dark:text-slate-100">NOT be able to run new resume scores</strong></li>
                      <li>You will <strong className="font-semibold text-gray-900 dark:text-slate-100">NOT be able to create new assessments</strong></li>
                      <li>You <strong className="font-semibold text-gray-900 dark:text-slate-100">CAN</strong> view existing data and delete items to reduce usage</li>
                      <li>Once usage is within limits, full access will be automatically restored</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Action Steps */}
              <div className="rounded-xl border border-gray-200 p-3 dark:border-slate-700 sm:p-4">
                <h4 className="mb-2 flex items-center gap-2 tf-subsection-title">
                  <Info className="h-4 w-4 text-brand-blue" />
                  Steps to Restore Full Access After Downgrading
                </h4>
                <ol className="space-y-2 text-xs text-gray-600 dark:text-slate-400 sm:text-sm">
                  {[
                    ...overages.map((overage, index) => (
                      <React.Fragment key={index}>
                        <strong className="font-semibold text-gray-900 dark:text-slate-100">Reduce {overage.quotaLabel}:</strong> Remove{' '}
                        {overage.overage.toLocaleString()} {overage.unit || 'items'} to fit within the{' '}
                        {overage.newPlanLimit.toLocaleString()} limit
                      </React.Fragment>
                    )),
                    <React.Fragment key="restore">
                      <strong className="font-semibold text-gray-900 dark:text-slate-100">Full access restored automatically</strong> once your usage is within all new plan limits
                    </React.Fragment>,
                  ].map((content, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 dark:bg-slate-800 dark:text-slate-300">
                        {idx + 1}
                      </span>
                      <span className="min-w-0 pt-0.5">{content}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </>
          ) : (
            <>
              {/* No Overages - Standard Downgrade Confirmation */}
              <div className="flex items-start gap-3 rounded-xl bg-gray-50 p-3 dark:bg-slate-800/50 sm:p-4">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
                <div className="min-w-0">
                  <h3 className="tf-subsection-title">
                    Confirm Plan Downgrade
                  </h3>
                  <p className="mt-0.5 text-xs text-gray-600 dark:text-slate-400 sm:text-sm">
                    You are about to downgrade from <strong className="font-semibold text-gray-900 dark:text-slate-100">{currentPlanName}</strong> to{' '}
                    <strong className="font-semibold text-gray-900 dark:text-slate-100">{targetPlanName}</strong>. Please review the changes below.
                  </p>
                </div>
              </div>

              <ul className="space-y-2 text-xs text-gray-700 dark:text-slate-300 sm:text-sm">
                {[
                  'Your billing will be adjusted to the lower plan rate',
                  'Your quota limits will be reduced to match the new plan',
                  'Changes will take effect at the end of your current billing period',
                  'You can upgrade again at any time if needed',
                ].map(item => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-400 dark:bg-slate-500" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              {/* Near Limit Warnings - Show when approaching quota limits */}
              {hasNearLimitWarnings && (
                <div className="rounded-xl border border-gray-200 p-3 dark:border-slate-700 sm:p-4">
                  <div className="mb-3 flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <div className="min-w-0">
                      <h4 className="tf-subsection-title">
                        Limited Storage Remaining
                      </h4>
                      <p className="mt-0.5 text-xs text-gray-600 dark:text-slate-400 sm:text-sm">
                        After downgrading, you&apos;ll be close to your quota limits. Be careful with new uploads.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2.5">
                    {nearLimitQuotas.map((quota, index) => (
                      <div key={index} className="rounded-lg bg-gray-50 p-3 dark:bg-slate-800/50">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="truncate tf-cell-name">{quota.quotaLabel}</span>
                          <span className="shrink-0 rounded bg-white px-2 py-0.5 text-[11px] font-semibold text-gray-600 ring-1 ring-gray-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700">
                            {quota.percentageUsed.toFixed(0)}% Used
                          </span>
                        </div>

                        <div className="mb-2 grid grid-cols-3 gap-2">
                          <Stat label="Used" value={quota.currentUsage} />
                          <Stat label="Limit" value={quota.newPlanLimit} />
                          <Stat label="Remaining" value={quota.remaining} />
                        </div>

                        {/* Progress bar */}
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-slate-700">
                          <div
                            className={`h-full rounded-full transition-all ${
                              quota.percentageUsed >= 90 ? 'bg-destructive' : quota.percentageUsed >= 75 ? 'bg-warning' : 'bg-brand-blue'
                            }`}
                            style={{ width: `${Math.min(quota.percentageUsed, 100)}%` }}
                          />
                        </div>

                        <p className="mt-2 tf-meta-strong">
                          <strong className="font-semibold text-gray-900 dark:text-slate-100">Warning:</strong> You have only{' '}
                          <strong className="font-semibold text-gray-900 dark:text-slate-100">{quota.remaining.toLocaleString()} {quota.unit}</strong> left to upload.
                          Consider deleting old data before adding new items.
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <p className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-slate-800/50 dark:text-slate-400 sm:text-sm">
                <strong className="font-semibold text-gray-900 dark:text-slate-100">Note:</strong> Make sure your current usage is within the new plan&apos;s limits
                to avoid any service interruptions.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-gray-100 px-4 py-3 dark:border-slate-700/60 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={isDowngrading}
            className="flex w-full items-center justify-center rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 sm:w-auto"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDowngrading}
            className={`flex w-full items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50 sm:w-auto ${
              hasOverages
                ? 'bg-destructive hover:opacity-90'
                : 'bg-brand-blue hover:bg-brand-blue-2'
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
                <Lock className="h-4 w-4" />
                Downgrade (Read-Only Mode)
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4" />
                Confirm Downgrade
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
