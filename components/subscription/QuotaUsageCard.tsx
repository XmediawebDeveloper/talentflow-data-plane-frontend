'use client';

import React from 'react';
import { AlertTriangle, FileText, Users, Target, Brain, Calendar, HardDrive } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface QuotaUsage {
  label: string;
  type: string;
  used: number;
  limit: number;
  unit: string;
  icon?: 'resume' | 'users' | 'assessment' | 'ai' | 'job' | 'storage';
  actionLink?: string;
}

interface QuotaUsageCardProps {
  quotas: QuotaUsage[];
  planName?: string;
  showWarnings?: boolean;
  warningThreshold?: number; // Percentage (e.g., 75 = warn when 75% used)
}

export default function QuotaUsageCard({
  quotas,
  planName,
  showWarnings = true,
  warningThreshold = 75,
}: QuotaUsageCardProps) {
  const router = useRouter();

  const getIcon = (iconType?: string) => {
    switch (iconType) {
      case 'resume':
        return <FileText className="w-5 h-5" />;
      case 'users':
        return <Users className="w-5 h-5" />;
      case 'assessment':
        return <Target className="w-5 h-5" />;
      case 'ai':
        return <Brain className="w-5 h-5" />;
      case 'job':
        return <Calendar className="w-5 h-5" />;
      case 'storage':
        return <HardDrive className="w-5 h-5" />;
      default:
        return <FileText className="w-5 h-5" />;
    }
  };

  const getProgressColor = (percentageUsed: number) => {
    if (percentageUsed >= 90) return 'bg-red-500';
    if (percentageUsed >= warningThreshold) return 'bg-amber-500';
    return 'bg-blue-500';
  };

  const getWarningLevel = (percentageUsed: number) => {
    if (percentageUsed >= 100) return 'critical';
    if (percentageUsed >= 90) return 'high';
    if (percentageUsed >= warningThreshold) return 'medium';
    return 'low';
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm tf-round-edges">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="tf-section-title">Quota Usage</h3>
            {planName && (
              <p className="tf-body-secondary mt-0.5">
                Current Plan: <span className="font-medium">{planName}</span>
              </p>
            )}
          </div>
          <button
            onClick={() => router.push('/subscription/usage-quotas')}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            View Details →
          </button>
        </div>
      </div>

      {/* Quota List */}
      <div className="p-6 space-y-4">
        {quotas.map((quota, index) => {
          const percentageUsed = quota.limit > 0 ? (quota.used / quota.limit) * 100 : 0;
          const remaining = Math.max(0, quota.limit - quota.used);
          const warningLevel = getWarningLevel(percentageUsed);

          return (
            <div key={index} className="space-y-2">
              {/* Label and Stats */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`text-gray-600 ${warningLevel === 'critical' || warningLevel === 'high' ? 'text-red-600' : ''}`}>
                    {getIcon(quota.icon)}
                  </div>
                  <span className="font-medium text-gray-900">{quota.label}</span>
                </div>
                <div className="text-right">
                  <p className="tf-row-title">
                    {quota.used.toLocaleString()} / {quota.limit.toLocaleString()}
                    <span className="text-gray-500 ml-1">{quota.unit}</span>
                  </p>
                  <p className={`text-xs font-medium ${
                    warningLevel === 'critical' ? 'text-red-600' :
                    warningLevel === 'high' ? 'text-red-500' :
                    warningLevel === 'medium' ? 'text-amber-600' :
                    'text-gray-500'
                  }`}>
                    {percentageUsed.toFixed(0)}% used
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${getProgressColor(percentageUsed)}`}
                  style={{ width: `${Math.min(percentageUsed, 100)}%` }}
                />
              </div>

              {/* Warning Messages */}
              {showWarnings && (
                <>
                  {warningLevel === 'critical' && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        <p className="font-semibold text-red-900">
                          Quota Limit Reached!
                        </p>
                        <p className="text-red-700 mt-0.5">
                          You cannot upload new {quota.unit}. Delete old items or upgrade your plan.
                        </p>
                        {quota.actionLink && (
                          <button
                            onClick={() => router.push(quota.actionLink!)}
                            className="text-red-700 hover:text-red-800 font-medium mt-1 underline"
                          >
                            Manage {quota.label} →
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {warningLevel === 'high' && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        <p className="font-semibold text-red-900">
                          Almost Full - Only {remaining.toLocaleString()} {quota.unit} Remaining
                        </p>
                        <p className="text-red-700 mt-0.5">
                          You're running out of storage. Consider deleting old items or upgrading your plan.
                        </p>
                      </div>
                    </div>
                  )}

                  {warningLevel === 'medium' && (
                    <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                      <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-amber-800">
                        <strong>Warning:</strong> You have only{' '}
                        <strong>{remaining.toLocaleString()} {quota.unit}</strong> left.
                        Monitor your usage to avoid hitting the limit.
                      </p>
                    </div>
                  )}

                  {warningLevel === 'low' && remaining > 0 && (
                    <p className="tf-meta">
                      {remaining.toLocaleString()} {quota.unit} available
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer Action */}
      <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <p className="tf-body-secondary">
            Need more quota?
          </p>
          <button
            onClick={() => router.push('/subscription/current-plan')}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
          >
            Upgrade Plan
          </button>
        </div>
      </div>
    </div>
  );
}
