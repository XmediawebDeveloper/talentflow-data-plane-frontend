'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, TrendingUp, Zap, FileText, Video, ClipboardCheck, ArrowUpRight, RefreshCw, X } from 'lucide-react';

interface Quota {
  quota_type: string;
  name: string;
  limit: number;
  used: number;
  remaining: number;
  percentage_used: number;
  is_low: boolean;
  is_exhausted: boolean;
}

interface QuotaSummary {
  quotas: Quota[];
  has_low_quotas: boolean;
  low_quota_types: string[];
  needs_upgrade: boolean;
  upgrade_message: string | null;
}

interface QuotaDisplayProps {
  compact?: boolean;
  showUpgradePrompt?: boolean;
  onUpgradeClick?: () => void;
}

const QUOTA_ICONS: Record<string, React.ReactNode> = {
  'RU': <FileText className="w-5 h-5" />,
  'RS': <Zap className="w-5 h-5" />,
  'AS': <ClipboardCheck className="w-5 h-5" />,
  'AIU': <Video className="w-5 h-5" />,
};

const QUOTA_COLORS: Record<string, { bg: string; text: string; border: string; progress: string }> = {
  'RU': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', progress: 'bg-blue-500' },
  'RS': { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', progress: 'bg-purple-500' },
  'AS': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', progress: 'bg-green-500' },
  'AIU': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', progress: 'bg-orange-500' },
};

export default function QuotaDisplay({ compact = false, showUpgradePrompt = true, onUpgradeClick }: QuotaDisplayProps) {
  const [quotaSummary, setQuotaSummary] = useState<QuotaSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBanner, setShowBanner] = useState(true);

  const USAGE_API_BASE = process.env.NEXT_PUBLIC_USAGE_API_URL || 'https://talentflowapi.mo.vc/api/v1';

  const fetchQuotaSummary = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${USAGE_API_BASE}/subscription/quota-summary`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          setQuotaSummary(data.data);
        }
      }
    } catch (err) {
      setError('Failed to load quota information');
      console.error('Error fetching quota summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotaSummary();
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-24 bg-gray-200 rounded-lg"></div>
      </div>
    );
  }

  if (error || !quotaSummary) {
    return null; // Silently fail
  }

  const getProgressColor = (percentage: number, isLow: boolean, isExhausted: boolean) => {
    if (isExhausted) return 'bg-red-500';
    if (isLow) return 'bg-yellow-500';
    if (percentage > 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  // Compact view - just shows warning banner if quotas are low
  if (compact) {
    if (!quotaSummary.has_low_quotas) return null;

    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-yellow-600" />
          <span className="text-sm text-yellow-800">
            Low quota: {quotaSummary.low_quota_types.join(', ')}
          </span>
        </div>
        {showUpgradePrompt && (
          <button
            onClick={onUpgradeClick}
            className="text-sm font-medium text-yellow-700 hover:text-yellow-900 flex items-center gap-1"
          >
            Upgrade <ArrowUpRight className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  // Full view
  return (
    <div className="space-y-4">
      {/* Low Quota Warning Banner */}
      {quotaSummary.has_low_quotas && showBanner && (
        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-300 rounded-xl p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
              </div>
              <div>
                <h3 className="font-semibold text-yellow-900">Quota Running Low</h3>
                <p className="text-sm text-yellow-700 mt-1">
                  {quotaSummary.upgrade_message || `You are running low on ${quotaSummary.low_quota_types.join(', ')}.`}
                </p>
                {showUpgradePrompt && (
                  <button
                    onClick={onUpgradeClick}
                    className="mt-3 px-4 py-2 bg-yellow-600 text-white text-sm font-medium rounded-lg hover:bg-yellow-700 transition-colors flex items-center gap-2"
                  >
                    <TrendingUp className="w-4 h-4" />
                    Upgrade Plan
                  </button>
                )}
              </div>
            </div>
            <button
              onClick={() => setShowBanner(false)}
              className="text-yellow-600 hover:text-yellow-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Quota Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {quotaSummary.quotas.map((quota) => {
          const colors = QUOTA_COLORS[quota.quota_type] || QUOTA_COLORS['RU'];
          const icon = QUOTA_ICONS[quota.quota_type] || <Zap className="w-5 h-5" />;

          return (
            <div
              key={quota.quota_type}
              className={`${colors.bg} ${colors.border} border-2 rounded-xl p-4 transition-all hover:shadow-md ${
                quota.is_exhausted ? 'ring-2 ring-red-400' : quota.is_low ? 'ring-2 ring-yellow-400' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className={`${colors.text}`}>
                  {icon}
                </div>
                {quota.is_exhausted && (
                  <span className="text-xs font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                    EXHAUSTED
                  </span>
                )}
                {quota.is_low && !quota.is_exhausted && (
                  <span className="text-xs font-bold text-yellow-600 bg-yellow-100 px-2 py-0.5 rounded-full">
                    LOW
                  </span>
                )}
              </div>

              <div className="mb-2">
                <div className="text-sm text-gray-600">{quota.name}</div>
                <div className={`text-2xl font-bold ${colors.text}`}>
                  {quota.remaining}
                  <span className="text-sm font-normal text-gray-500">/{quota.limit}</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${getProgressColor(quota.percentage_used, quota.is_low, quota.is_exhausted)}`}
                  style={{ width: `${Math.min(quota.percentage_used, 100)}%` }}
                />
              </div>

              <div className="mt-1 text-xs text-gray-500">
                {quota.used} used ({quota.percentage_used.toFixed(1)}%)
              </div>
            </div>
          );
        })}
      </div>

      {/* Refresh Button */}
      <div className="flex justify-end">
        <button
          onClick={fetchQuotaSummary}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>
    </div>
  );
}


// Hook to check quota before an operation
export function useQuotaCheck() {
  const USAGE_API_BASE = process.env.NEXT_PUBLIC_USAGE_API_URL || 'https://talentflowapi.mo.vc/api/v1';

  const checkQuota = async (quotaType: 'RU' | 'RS' | 'AS' | 'AIU', amount: number = 1) => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${USAGE_API_BASE}/subscription/check-quota`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ quota_type: quotaType, amount }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.status === 'success') {
          return {
            hasQuota: data.data.has_quota,
            remaining: data.data.remaining,
            needsUpgrade: data.data.needs_upgrade,
            message: data.data.message,
          };
        }
      }

      // Default to allowing operation if check fails
      return { hasQuota: true, remaining: -1, needsUpgrade: false, message: 'Quota check unavailable' };
    } catch (error) {
      console.error('Error checking quota:', error);
      return { hasQuota: true, remaining: -1, needsUpgrade: false, message: 'Quota check failed' };
    }
  };

  return { checkQuota };
}
