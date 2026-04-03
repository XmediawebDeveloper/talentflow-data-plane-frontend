'use client';

/**
 * UsageHistory Component
 * Tenant Admin Only - Comprehensive usage history dashboard
 * Shows feature-wise, user-wise, team-wise usage with analytics, filters, export, and pagination
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Target,
  ClipboardCheck,
  Video,
  Upload,
  Users,
  TrendingDown,
  Download,
  Calendar,
  Filter,
  Search,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  X,
  FileText,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  Shield,
  User,
  Info,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/hooks/useAuth';
import { formatIST, formatISTDate } from '@/lib/utils/dateUtils';
import {
  unitPoolService,
  UnitType,
  ConsumptionLogEntry,
  AdjustmentLogEntry,
  AllPoolsResponse,
  ExistingUsageUser,
  UsageSummaryResponse,
  getUnitTypeName,
} from '@/lib/services/unitPoolService';
import teamService, { AllTeamsUsageSummary, TeamMembersUsageSummary } from '@/lib/services/teamService';
import dashboardService, { SubscriptionUnits } from '@/lib/services/dashboardService';
import { featurePermissionService, UserLimitsResponse } from '@/lib/services/featurePermissionService';

// ─── Constants ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

type LucideIcon = React.FC<React.SVGProps<SVGSVGElement>>;

const UNIT_TYPE_CONFIG: Record<UnitType, { label: string; icon: LucideIcon; color: string; bg: string; bar: string }> = {
  RS: { label: 'Resume Scoring', icon: Target, color: 'text-blue-700', bg: 'bg-blue-50', bar: 'bg-blue-500' },
  AS: { label: 'Assessment', icon: ClipboardCheck, color: 'text-purple-700', bg: 'bg-purple-50', bar: 'bg-purple-500' },
  AIU: { label: 'AI Interview', icon: Video, color: 'text-emerald-700', bg: 'bg-emerald-50', bar: 'bg-emerald-500' },
};

const CONSUMPTION_COLUMNS: Array<{
  key: string;
  label: string;
  icon: LucideIcon;
  iconClass: string;
}> = [
  { key: 'RS', label: 'Resume Scoring', icon: Target, iconClass: 'text-blue-500' },
  { key: 'AS', label: 'Assessment', icon: ClipboardCheck, iconClass: 'text-purple-500' },
  { key: 'AIU', label: 'AI Interview', icon: Video, iconClass: 'text-emerald-500' },
  { key: 'RU', label: 'Resume Storage', icon: Upload, iconClass: 'text-amber-500' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  SUCCESS: { label: 'Success', color: 'text-green-700', bg: 'bg-green-50' },
  FAILED: { label: 'Failed', color: 'text-red-700', bg: 'bg-red-50' },
  INSUFFICIENT_UNITS: { label: 'Insufficient', color: 'text-orange-700', bg: 'bg-orange-50' },
  ABANDONED: { label: 'Abandoned', color: 'text-gray-600', bg: 'bg-gray-100' },
  INTERRUPTED: { label: 'Interrupted', color: 'text-yellow-700', bg: 'bg-yellow-50' },
  TENANT_SUSPENDED: { label: 'Suspended', color: 'text-red-700', bg: 'bg-red-50' },
  TENANT_EXPIRED: { label: 'Expired', color: 'text-red-700', bg: 'bg-red-50' },
  BLOCKED: { label: 'Blocked', color: 'text-gray-700', bg: 'bg-gray-100' },
};

type TabId = 'feature' | 'user' | 'team' | 'refunds';
type ExportFormat = 'csv' | 'excel';
type ExistingUser = ExistingUsageUser;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDateForInput(d: Date): string {
  return d.toISOString().split('T')[0];
}

function getUsagePct(consumed: number, allocated: number): number {
  if (!allocated) return 0;
  return Math.min(100, Math.round((consumed / allocated) * 100));
}

function getBarColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 70) return 'bg-orange-400';
  return 'bg-blue-500';
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'text-gray-600', bg: 'bg-gray-100' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function UnitTypeBadge({ type }: { type: string }) {
  const cfg = UNIT_TYPE_CONFIG[type as UnitType];
  if (!cfg) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
        {type}
      </span>
    );
  }
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
}

function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}) {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-white">
      <p className="text-sm text-gray-500">
        Showing <span className="font-medium">{start}–{end}</span> of <span className="font-medium">{total}</span> records
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          let pageNum: number;
          if (totalPages <= 5) {
            pageNum = i + 1;
          } else if (page <= 3) {
            pageNum = i + 1;
          } else if (page >= totalPages - 2) {
            pageNum = totalPages - 4 + i;
          } else {
            pageNum = page - 2 + i;
          }
          return (
            <button
              key={pageNum}
              onClick={() => onPageChange(pageNum)}
              className={`w-8 h-8 text-sm rounded ${pageNum === page ? 'bg-blue-600 text-white font-medium' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {pageNum}
            </button>
          );
        })}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function ExportModal({
  open,
  onClose,
  onExport,
  isExporting,
}: {
  open: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat) => void;
  isExporting: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-900">Export Usage History</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-gray-500">Choose export format:</p>
          <button
            onClick={() => onExport('csv')}
            disabled={isExporting}
            className="w-full flex items-center gap-3 p-3.5 rounded-lg border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-colors group disabled:opacity-50"
          >
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <FileText className="w-5 h-5 text-green-600" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700">CSV File</p>
              <p className="text-xs text-gray-500">Comma-separated values (.csv)</p>
            </div>
          </button>
          <button
            onClick={() => onExport('excel')}
            disabled={isExporting}
            className="w-full flex items-center gap-3 p-3.5 rounded-lg border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-colors group disabled:opacity-50"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-gray-900 group-hover:text-blue-700">Excel Spreadsheet</p>
              <p className="text-xs text-gray-500">Microsoft Excel format (.xlsx)</p>
            </div>
          </button>
        </div>
        {isExporting && (
          <div className="px-5 pb-4 flex items-center gap-2 text-sm text-blue-600">
            <Loader2 className="w-4 h-4 animate-spin" />
            Preparing export…
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Analytics Cards ─────────────────────────────────────────────────────────

function AnalyticsCards({
  pools,
  summary,
  subscriptionUnits,
  userLimits,
}: {
  pools: AllPoolsResponse | null;
  summary: UsageSummaryResponse | null;
  subscriptionUnits: SubscriptionUnits | null;
  userLimits: UserLimitsResponse | null;
}) {
  const unitTypes: UnitType[] = ['RS', 'AS', 'AIU'];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
      {/* RS, AS, AIU — use subscriptionUnits (dashboard) as primary, unit pool as fallback */}
      {unitTypes.map((type) => {
        const sub = subscriptionUnits?.[type as keyof typeof subscriptionUnits] as import('@/lib/services/dashboardService').UnitAvailability | undefined;
        const pool = pools?.pools?.[type];
        const cfg = UNIT_TYPE_CONFIG[type];
        const Icon = cfg.icon;

        // Prefer subscriptionUnits data (more accurate), fall back to unit pool
        const isUnlimited = sub?.is_unlimited ?? false;
        const purchased = sub ? (isUnlimited ? null : sub.limit) : (pool?.total_allocated ?? null);
        const consumed  = sub ? sub.used : (pool?.total_consumed ?? null);
        const remaining = sub ? (isUnlimited ? null : sub.available) : (pool?.available_units ?? null);
        const pct = isUnlimited ? 0 : (sub ? Math.min(100, Math.round(sub.percentage_used)) : getUsagePct(pool?.total_consumed ?? 0, pool?.total_allocated ?? 0));
        const barColor = getBarColor(pct);

        return (
          <div key={type} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-10 h-10 rounded-lg ${cfg.bg} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${cfg.color}`} />
              </div>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${cfg.bg} ${cfg.color}`}>{type}</span>
            </div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">{cfg.label}</h3>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div>
                <p className="text-xs text-gray-400">Purchased</p>
                <p className="text-lg font-bold text-gray-900">{isUnlimited ? '∞' : (purchased?.toLocaleString() ?? '—')}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Consumed</p>
                <p className="text-lg font-bold text-gray-700">{consumed?.toLocaleString() ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Remaining</p>
                <p className={`text-lg font-bold ${pct >= 90 ? 'text-red-600' : pct >= 70 ? 'text-orange-500' : 'text-emerald-600'}`}>
                  {isUnlimited ? '∞' : (remaining?.toLocaleString() ?? '—')}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Usage</span>
                <span className={pct >= 90 ? 'text-red-600 font-medium' : ''}>{isUnlimited ? 'Unlimited' : `${pct}%`}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full transition-all ${barColor}`} style={{ width: isUnlimited ? '0%' : `${pct}%` }} />
              </div>
            </div>
          </div>
        );
      })}

      {/* RU — Resume Storage card */}
      {(() => {
        const ru = subscriptionUnits?.RU;
        const pct = ru ? (ru.is_unlimited ? 0 : Math.min(100, Math.round(ru.percentage_used))) : 0;
        const barColor = getBarColor(pct);
        return (
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <FileText className="w-5 h-5 text-amber-700" />
              </div>
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-50 text-amber-700">RU</span>
            </div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">Resume Storage</h3>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div>
                <p className="text-xs text-gray-400">Limit</p>
                <p className="text-lg font-bold text-gray-900">
                  {ru ? (ru.is_unlimited ? '∞' : ru.limit.toLocaleString()) : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Used</p>
                <p className="text-lg font-bold text-gray-700">{ru?.used?.toLocaleString() ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Available</p>
                <p className={`text-lg font-bold ${pct >= 90 ? 'text-red-600' : pct >= 70 ? 'text-orange-500' : 'text-emerald-600'}`}>
                  {ru ? (ru.is_unlimited ? '∞' : ru.available.toLocaleString()) : '—'}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Usage</span>
                <span className={pct >= 90 ? 'text-red-600 font-medium' : ''}>
                  {ru?.is_unlimited ? 'Unlimited' : `${pct}%`}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full transition-all ${barColor}`} style={{ width: ru?.is_unlimited ? '0%' : `${pct}%` }} />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Max Users card */}
      {(() => {
        const isUnlimited = userLimits ? userLimits.max_users === -1 : false;
        const pct = userLimits && !isUnlimited ? Math.min(100, Math.round(userLimits.usage_percentage)) : 0;
        const barColor = getBarColor(pct);
        return (
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                <Users className="w-5 h-5 text-indigo-700" />
              </div>
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-indigo-50 text-indigo-700">MAX</span>
            </div>
            <h3 className="text-sm font-medium text-gray-500 mb-1">User Seats</h3>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div>
                <p className="text-xs text-gray-400">Max Users</p>
                <p className="text-lg font-bold text-gray-900">
                  {userLimits ? (isUnlimited ? '∞' : userLimits.max_users.toLocaleString()) : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Active</p>
                <p className="text-lg font-bold text-gray-700">{userLimits?.current_users?.toLocaleString() ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Available</p>
                <p className={`text-lg font-bold ${pct >= 90 ? 'text-red-600' : pct >= 70 ? 'text-orange-500' : 'text-emerald-600'}`}>
                  {userLimits ? (isUnlimited ? '∞' : userLimits.available_slots.toLocaleString()) : '—'}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Usage</span>
                <span className={pct >= 90 ? 'text-red-600 font-medium' : ''}>
                  {isUnlimited ? 'Unlimited' : `${pct}%`}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5">
                <div className={`h-1.5 rounded-full transition-all ${barColor}`} style={{ width: isUnlimited ? '0%' : `${pct}%` }} />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Feature-Wise Tab ─────────────────────────────────────────────────────────

function FeatureWiseTab({
  items,
  total,
  page,
  onPageChange,
  isLoading,
}: {
  items: ConsumptionLogEntry[];
  total: number;
  page: number;
  onPageChange: (p: number) => void;
  isLoading: boolean;
}) {
  const totalPages = Math.ceil(total / PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <BarChart3 className="w-10 h-10 text-gray-300 mb-3" />
        <p className="text-gray-500 font-medium">No usage records found</p>
        <p className="text-gray-400 text-sm mt-1">Try adjusting your filters or date range</p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Feature</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">User</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Entity</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Units</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Balance After</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Date & Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((entry) => (
              <tr key={entry.id} className="hover:bg-gray-50/60 transition-colors">
                <td className="px-4 py-3">
                  <UnitTypeBadge type={entry.unit_type} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                      <User className="w-3 h-3 text-blue-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-800 text-xs leading-tight">{entry.user_name || '—'}</p>
                      <p className="text-gray-400 text-xs">{entry.user_email || '—'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="text-gray-700 text-xs font-medium">{entry.entity_name || '—'}</p>
                  {entry.entity_type && <p className="text-gray-400 text-xs capitalize">{entry.entity_type.replace(/_/g, ' ')}</p>}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-semibold text-gray-900">{entry.units_consumed}</span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={entry.status} />
                  {entry.refund_flag === 'YES' && (
                    <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-teal-50 text-teal-700">
                      Refunded
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-gray-600 text-xs">{entry.balance_after?.toLocaleString() ?? '—'}</span>
                </td>
                <td className="px-4 py-3">
                  <p className="text-gray-700 text-xs">{formatISTDate(entry.created_at)}</p>
                  <p className="text-gray-400 text-xs">{formatIST(entry.created_at).split(', ')[1] || ''}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={onPageChange} />
      )}
    </div>
  );
}

// ─── User-Wise Tab ─────────────────────────────────────────────────────────

function UserWiseTab({
  items,
  existingUsers,
  total,
  page,
  onPageChange,
  isLoading,
}: {
  items: ConsumptionLogEntry[];
  existingUsers: ExistingUser[];
  total: number;
  page: number;
  onPageChange: (p: number) => void;
  isLoading: boolean;
}) {
  // Aggregate by user
  const userMap = new Map<string, {
    userId: string;
    userName: string;
    userEmail: string;
    byType: Record<string, number>;
    total: number;
    successCount: number;
    failedCount: number;
    lastUsed: string;
    isExistingUser: boolean;
  }>();

  existingUsers.forEach((existingUser) => {
    userMap.set(existingUser.id, {
      userId: existingUser.id,
      userName: existingUser.name || 'Unknown',
      userEmail: existingUser.email || '—',
      byType: {},
      total: 0,
      successCount: 0,
      failedCount: 0,
      lastUsed: '',
      isExistingUser: true,
    });
  });

  items.forEach((entry) => {
    const key = entry.user_id || entry.user_email || entry.id;
    if (!userMap.has(key)) {
      userMap.set(key, {
        userId: entry.user_id || key,
        userName: entry.user_name || 'Unknown',
        userEmail: entry.user_email || '—',
        byType: {},
        total: 0,
        successCount: 0,
        failedCount: 0,
        lastUsed: entry.created_at,
        isExistingUser: false,
      });
    }
    const u = userMap.get(key)!;
    if ((u.userName === 'Unknown' || !u.userName) && entry.user_name) {
      u.userName = entry.user_name;
    }
    if ((u.userEmail === '—' || !u.userEmail) && entry.user_email) {
      u.userEmail = entry.user_email;
    }
    u.byType[entry.unit_type] = (u.byType[entry.unit_type] || 0) + entry.units_consumed;
    if (entry.unit_type !== 'max_seats') {
      u.total += entry.units_consumed;
    }
    if (entry.status === 'SUCCESS') u.successCount++;
    else if (entry.status === 'FAILED' || entry.status === 'INSUFFICIENT_UNITS') u.failedCount++;
    if (!u.lastUsed || entry.created_at > u.lastUsed) u.lastUsed = entry.created_at;
  });

  const users = Array.from(userMap.values()).sort((a, b) => {
    if (a.isExistingUser !== b.isExistingUser) {
      return a.isExistingUser ? -1 : 1;
    }
    if (b.total !== a.total) {
      return b.total - a.total;
    }
    return a.userName.localeCompare(b.userName);
  });
  const totalPages = Math.ceil(users.length / PAGE_SIZE);
  const paginatedUsers = users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!users.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users className="w-10 h-10 text-gray-300 mb-3" />
        <p className="text-gray-500 font-medium">No user usage data found</p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">#</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">User</th>
              {CONSUMPTION_COLUMNS.map((column) => {
                const Icon = column.icon;
                return (
                  <th key={column.key} className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    <span className="inline-flex items-center gap-1">
                      <Icon className={`w-3 h-3 ${column.iconClass}`} />
                      {column.label}
                    </span>
                  </th>
                );
              })}
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Total</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Success / Failed</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Last Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {paginatedUsers.map((u, idx) => (
              <tr key={u.userId} className="hover:bg-gray-50/60 transition-colors">
                <td className="px-4 py-3 text-gray-400 text-xs">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs font-bold">{u.userName.charAt(0).toUpperCase()}</span>
                    </div>
                    <div>
                      <p className="font-medium text-gray-800 text-xs">{u.userName}</p>
                      <p className="text-gray-400 text-xs">{u.userEmail}</p>
                    </div>
                  </div>
                </td>
                {CONSUMPTION_COLUMNS.map((column) => (
                  <td key={column.key} className="px-4 py-3 text-right text-gray-700 font-medium">
                    {u.byType[column.key]?.toLocaleString() || '—'}
                  </td>
                ))}
                <td className="px-4 py-3 text-right">
                  <span className="font-bold text-gray-900">{u.total.toLocaleString()}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <span className="inline-flex items-center gap-0.5 text-xs text-green-700 font-medium">
                      <CheckCircle2 className="w-3 h-3" />{u.successCount}
                    </span>
                    <span className="text-gray-300">/</span>
                    <span className="inline-flex items-center gap-0.5 text-xs text-red-600 font-medium">
                      <XCircle className="w-3 h-3" />{u.failedCount}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{u.lastUsed ? formatIST(u.lastUsed) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} total={users.length} pageSize={PAGE_SIZE} onPageChange={onPageChange} />
      )}
    </div>
  );
}

// ─── Team-Wise Tab ─────────────────────────────────────────────────────────

function TeamWiseTab({
  teamsData,
  page,
  onPageChange,
  startDate,
  endDate,
  isLoading,
}: {
  teamsData: AllTeamsUsageSummary | null;
  page: number;
  onPageChange: (p: number) => void;
  startDate: string;
  endDate: string;
  isLoading: boolean;
}) {
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!teamsData?.teams?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Users className="w-10 h-10 text-gray-300 mb-3" />
        <p className="text-gray-500 font-medium">No team usage data found</p>
        <p className="text-gray-400 text-sm mt-1">Teams data will appear once team members start using features</p>
      </div>
    );
  }

  const totalTeams = teamsData.teams.length;
  const totalPages = Math.ceil(totalTeams / PAGE_SIZE);
  const paginatedTeams = teamsData.teams.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">#</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Team</th>
              {CONSUMPTION_COLUMNS.map((column) => {
                const Icon = column.icon;
                return (
                  <th key={column.key} className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">
                    <span className="inline-flex items-center gap-1">
                      <Icon className={`w-3 h-3 ${column.iconClass}`} />
                      {column.label}
                    </span>
                  </th>
                );
              })}
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">JDs Created</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Assessments</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {paginatedTeams.map((team, idx) => {
              const rsConsumed = team.by_type?.RS?.total_consumed ?? 0;
              const asConsumed = team.by_type?.AS?.total_consumed ?? 0;
              const aiuConsumed = team.by_type?.AIU?.total_consumed ?? 0;
              const ruConsumed = team.by_type?.RU?.total_consumed ?? 0;
              const totalConsumed = rsConsumed + asConsumed + aiuConsumed + ruConsumed;
              const isExpanded = expandedTeamId === team.team_id;
              return (
                <React.Fragment key={team.team_id}>
                  <tr
                    className="hover:bg-gray-50/60 transition-colors cursor-pointer"
                    onClick={() => setExpandedTeamId(isExpanded ? null : team.team_id)}
                  >
                    <td className="px-4 py-3 text-gray-400 text-xs">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-gray-400 hover:text-gray-600"
                          aria-label={isExpanded ? 'Collapse team users' : 'Expand team users'}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center flex-shrink-0">
                          <Users className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-800 text-xs">{team.team_name || 'Unnamed Team'}</p>
                          <p className="text-gray-400 text-xs">{totalConsumed.toLocaleString()} units total</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-700 font-medium">{rsConsumed ? rsConsumed.toLocaleString() : '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-700 font-medium">{asConsumed ? asConsumed.toLocaleString() : '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-700 font-medium">{aiuConsumed ? aiuConsumed.toLocaleString() : '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-700 font-medium">{ruConsumed ? ruConsumed.toLocaleString() : '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{team.jds_created?.toLocaleString() ?? '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{team.assessments_created?.toLocaleString() ?? '—'}</td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-gray-50/70">
                      <td colSpan={8} className="px-4 py-4">
                        <InlineTeamMembersUsage
                          teamId={team.team_id}
                          teamName={team.team_name || 'Unnamed Team'}
                          startDate={startDate}
                          endDate={endDate}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50">
              <td className="px-4 py-3" colSpan={2}>
                <span className="text-xs font-semibold text-gray-600">{teamsData.teams.length} team{teamsData.teams.length !== 1 ? 's' : ''} total</span>
              </td>
              <td className="px-4 py-3 text-right text-xs font-bold text-blue-700">
                {teamsData.teams.reduce((s, t) => s + (t.by_type?.RS?.total_consumed ?? 0), 0).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right text-xs font-bold text-purple-700">
                {teamsData.teams.reduce((s, t) => s + (t.by_type?.AS?.total_consumed ?? 0), 0).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right text-xs font-bold text-emerald-700">
                {teamsData.teams.reduce((s, t) => s + (t.by_type?.AIU?.total_consumed ?? 0), 0).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right text-xs font-bold text-amber-700">
                {teamsData.teams.reduce((s, t) => s + (t.by_type?.RU?.total_consumed ?? 0), 0).toLocaleString()}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} total={totalTeams} pageSize={PAGE_SIZE} onPageChange={onPageChange} />
      )}
    </div>
  );
}

function InlineTeamMembersUsage({
  teamId,
  teamName,
  startDate,
  endDate,
}: {
  teamId: string;
  teamName: string;
  startDate: string;
  endDate: string;
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [membersUsage, setMembersUsage] = useState<TeamMembersUsageSummary | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadMembersUsage = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const data = await teamService.getTeamMembersUsage(teamId, startDate, endDate);
        if (isMounted) {
          setMembersUsage(data);
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.response?.data?.detail?.message || err?.message || 'Failed to load team user usage');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadMembersUsage();

    return () => {
      isMounted = false;
    };
  }, [endDate, startDate, teamId]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading team users usage...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const members = membersUsage?.members || [];

  if (!members.length) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500">
        No usage found for users in {teamName} during the selected date range.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div>
          <p className="text-sm font-semibold text-gray-900">{teamName} Users</p>
          <p className="text-xs text-gray-500">Usage details for team members</p>
        </div>
        <span className="text-xs font-medium text-gray-500">{members.length} user{members.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-white">
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">User</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Resume Scoring</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Assessment</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">AI Interview</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Resume Storage</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Total</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Last Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {members.map((member) => {
              const rs = member.by_type?.RS?.total_consumed ?? 0;
              const as = member.by_type?.AS?.total_consumed ?? 0;
              const aiu = member.by_type?.AIU?.total_consumed ?? 0;
              const ru = member.by_type?.RU?.total_consumed ?? 0;
              const total = rs + as + aiu + ru;
              return (
                <tr key={member.user_id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-800 text-xs">{member.user_name || 'Unknown User'}</p>
                      <p className="text-gray-400 text-xs">{member.user_email || '—'}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium">{rs ? rs.toLocaleString() : '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium">{as ? as.toLocaleString() : '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium">{aiu ? aiu.toLocaleString() : '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium">{ru ? ru.toLocaleString() : '—'}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900">{total.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{member.last_activity ? formatIST(member.last_activity) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Refunds & Adjustments Tab ─────────────────────────────────────────────

function RefundsTab({
  items,
  total,
  page,
  onPageChange,
  isLoading,
  unavailable,
}: {
  items: AdjustmentLogEntry[];
  total: number;
  page: number;
  onPageChange: (p: number) => void;
  isLoading: boolean;
  unavailable?: boolean;
}) {
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const ACTION_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    REFUND: { label: 'Refund', color: 'text-teal-700', bg: 'bg-teal-50' },
    ADJUST_ADD: { label: 'Credit', color: 'text-green-700', bg: 'bg-green-50' },
    ADJUST_DEDUCT: { label: 'Deduct', color: 'text-red-700', bg: 'bg-red-50' },
    REPLENISH: { label: 'Replenish', color: 'text-blue-700', bg: 'bg-blue-50' },
    UPGRADE: { label: 'Upgrade', color: 'text-indigo-700', bg: 'bg-indigo-50' },
    EXPIRE: { label: 'Expired', color: 'text-gray-600', bg: 'bg-gray-100' },
    INIT: { label: 'Init', color: 'text-gray-600', bg: 'bg-gray-100' },
    CONSUME: { label: 'Consume', color: 'text-orange-700', bg: 'bg-orange-50' },
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertTriangle className="w-10 h-10 text-amber-300 mb-3" />
        <p className="text-gray-600 font-medium">Refunds & Adjustments Not Yet Available</p>
        <p className="text-gray-400 text-sm mt-1 max-w-sm">
          This feature requires a database migration that hasn't been applied to your tenant yet.
          Please contact your system administrator.
        </p>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <RefreshCw className="w-10 h-10 text-gray-300 mb-3" />
        <p className="text-gray-500 font-medium">No refunds or adjustments found</p>
        <p className="text-gray-400 text-sm mt-1">Unit adjustments and refunds will appear here</p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Type</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Feature</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Units</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Before</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">After</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Actor</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Reason</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wide">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {items.map((entry) => {
              const acfg = ACTION_CONFIG[entry.action_type] ?? { label: entry.action_type, color: 'text-gray-600', bg: 'bg-gray-100' };
              const isPositive = ['REFUND', 'ADJUST_ADD', 'REPLENISH', 'UPGRADE', 'INIT'].includes(entry.action_type);
              return (
                <tr key={entry.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${acfg.bg} ${acfg.color}`}>
                      {acfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <UnitTypeBadge type={entry.unit_type} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-bold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                      {isPositive ? '+' : '-'}{Math.abs(entry.units_amount).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 text-xs">{entry.balance_before.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-gray-700 text-xs font-medium">{entry.balance_after.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <p className="text-gray-700 text-xs">{entry.actor_name || entry.actor_email || '—'}</p>
                    <p className="text-gray-400 text-xs capitalize">{entry.actor_type?.toLowerCase()}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-600 text-xs max-w-[200px] truncate" title={entry.reason}>{entry.reason}</p>
                    {entry.notes && <p className="text-gray-400 text-xs truncate max-w-[200px]" title={entry.notes}>{entry.notes}</p>}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{formatISTDate(entry.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPageChange={onPageChange} />
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function UsageHistory() {
  const { user, isTenantAdmin } = useAuth();
  const today = useMemo(() => new Date(), []);
  const defaultStartDate = useMemo(
    () => formatDateForInput(new Date(today.getFullYear(), today.getMonth(), 1)),
    [today]
  );
  const defaultEndDate = useMemo(() => formatDateForInput(today), [today]);

  // Tabs
  const [activeTab, setActiveTab] = useState<TabId>('user');

  // Filters
  const [startDateInput, setStartDateInput] = useState<string>('');
  const [endDateInput, setEndDateInput] = useState<string>('');
  const [quickPeriod, setQuickPeriod] = useState<string>('');
  const [filterUnitType, setFilterUnitType] = useState<UnitType | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchUser, setSearchUser] = useState('');

  // Pagination per tab
  const [featurePage, setFeaturePage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const [teamPage, setTeamPage] = useState(1);
  const [refundsPage, setRefundsPage] = useState(1);

  // Data
  const [pools, setPools] = useState<AllPoolsResponse | null>(null);
  const [summary, setSummary] = useState<UsageSummaryResponse | null>(null);
  const [consumptionItems, setConsumptionItems] = useState<ConsumptionLogEntry[]>([]);
  const [consumptionTotal, setConsumptionTotal] = useState(0);
  const [teamsData, setTeamsData] = useState<AllTeamsUsageSummary | null>(null);
  const [adjustmentItems, setAdjustmentItems] = useState<AdjustmentLogEntry[]>([]);
  const [adjustmentTotal, setAdjustmentTotal] = useState(0);
  const [existingUsers, setExistingUsers] = useState<ExistingUser[]>([]);
  const [subscriptionUnits, setSubscriptionUnits] = useState<SubscriptionUnits | null>(null);
  const [userLimits, setUserLimits] = useState<UserLimitsResponse | null>(null);

  // Loading states
  const [isLoadingPools, setIsLoadingPools] = useState(true);
  const [isLoadingConsumption, setIsLoadingConsumption] = useState(false);
  const [isLoadingTeams, setIsLoadingTeams] = useState(false);
  const [isLoadingAdjustments, setIsLoadingAdjustments] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Export
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // ── Computed date range (memoized to prevent infinite effect loops) ────────
  const { dateStart, dateEnd } = useMemo(() => {
    const start = startDateInput ? new Date(startDateInput) : null;
    const end = endDateInput ? new Date(endDateInput) : null;

    if (start && end && start > end) {
      return { dateStart: end, dateEnd: end };
    }

    return {
      dateStart: start ?? new Date(defaultStartDate),
      dateEnd: end ?? new Date(defaultEndDate),
    };
  }, [defaultEndDate, defaultStartDate, endDateInput, startDateInput]);

  // ── Access guard ─────────────────────────────────────────────────────────
  if (!isTenantAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <Shield className="w-12 h-12 text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Access Restricted</h2>
        <p className="text-gray-500 max-w-sm">Usage History is only accessible to Tenant Admins.</p>
      </div>
    );
  }

  // ── Load pool status & summary ────────────────────────────────────────────
  const loadPoolData = useCallback(async () => {
    setIsLoadingPools(true);
    try {
      const days = Math.max(1, Math.ceil((dateEnd.getTime() - dateStart.getTime()) / (1000 * 60 * 60 * 24)));
      const [poolsRes, summaryRes, dashRes, limitsRes] = await Promise.all([
        unitPoolService.getPoolStatus(),
        unitPoolService.getUsageSummary(days),
        dashboardService.getDashboard().catch(() => null),
        featurePermissionService.getUserLimits().catch(() => null),
      ]);
      setPools(poolsRes);
      setSummary(summaryRes);
      if (dashRes?.subscription_units) setSubscriptionUnits(dashRes.subscription_units);
      if (limitsRes) setUserLimits(limitsRes);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load pool data');
    } finally {
      setIsLoadingPools(false);
    }
  }, [dateStart, dateEnd]);

  // ── Load consumption history ───────────────────────────────────────────────
  const loadConsumption = useCallback(async (page: number, mode: 'feature' | 'user' = 'feature') => {
    setIsLoadingConsumption(true);
    try {
      const res = await unitPoolService.getConsumptionHistory({
        unit_type: filterUnitType === 'all' ? undefined : filterUnitType,
        status: filterStatus === 'all' ? undefined : filterStatus,
        start_date: startDateInput || undefined,
        end_date: endDateInput || undefined,
        limit: mode === 'user' ? 10000 : PAGE_SIZE,
        offset: mode === 'user' ? 0 : (page - 1) * PAGE_SIZE,
      });
      setConsumptionItems(res.items);
      setExistingUsers(res.users || []);
      setConsumptionTotal(mode === 'user' ? (res.users?.length ?? res.items.length) : res.total);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load consumption history');
    } finally {
      setIsLoadingConsumption(false);
    }
  }, [filterUnitType, filterStatus, dateStart, dateEnd]);

  // ── Load teams data ────────────────────────────────────────────────────────
  const loadTeams = useCallback(async () => {
    setIsLoadingTeams(true);
    try {
      const res = await teamService.getAllTeamsUsage(startDateInput || undefined, endDateInput || undefined);
      setTeamsData(res);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load team data');
    } finally {
      setIsLoadingTeams(false);
    }
  }, [dateStart, dateEnd]);

  // ── Load adjustments ────────────────────────────────────────────────────────
  const [adjustmentsUnavailable, setAdjustmentsUnavailable] = useState(false);

  const loadAdjustments = useCallback(async (page: number) => {
    if (!user?.tenantId) return;
    setIsLoadingAdjustments(true);
    try {
      const res = await unitPoolService.getAdjustmentHistory(user.tenantId, {
        unit_type: filterUnitType === 'all' ? undefined : filterUnitType,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      });
      setAdjustmentItems(res.items);
      setAdjustmentTotal(res.total);
      setAdjustmentsUnavailable(false);
    } catch (err: any) {
      // Table may not exist yet on this tenant — show unavailable state instead of error toast
      if (err?.response?.status === 500 || err?.status === 500 || err?.message?.includes('500')) {
        setAdjustmentsUnavailable(true);
      } else {
        toast.error(err.message || 'Failed to load adjustments');
      }
    } finally {
      setIsLoadingAdjustments(false);
    }
  }, [user?.tenantId, filterUnitType]);

  // ── Effects ────────────────────────────────────────────────────────────────

  // Pool status — fires when date range changes (loadPoolData encodes dateStart/dateEnd)
  useEffect(() => {
    loadPoolData();
  }, [loadPoolData]);

  // Reset pages when filters/tab/dates change (no API call here)
  useEffect(() => {
    setFeaturePage(1);
    setUserPage(1);
    setTeamPage(1);
  }, [activeTab, filterUnitType, filterStatus, dateStart, dateEnd]);

  // Single consumption load effect — loadConsumption encodes all filter+date deps via useCallback
  useEffect(() => {
    if (activeTab === 'feature') {
      loadConsumption(featurePage, 'feature');
    } else if (activeTab === 'user') {
      loadConsumption(userPage, 'user');
    }
  }, [activeTab, loadConsumption, featurePage, userPage]);

  // Teams
  useEffect(() => {
    if (activeTab === 'team') loadTeams();
  }, [loadTeams, activeTab]);

  // Adjustments — reset page when deps change
  useEffect(() => {
    setRefundsPage(1);
  }, [activeTab, filterUnitType, dateStart, dateEnd]);

  useEffect(() => {
    if (activeTab === 'refunds') loadAdjustments(refundsPage);
  }, [loadAdjustments, refundsPage, activeTab]);

  // ── Refresh ────────────────────────────────────────────────────────────────
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([
      loadPoolData(),
      activeTab === 'feature'
        ? loadConsumption(featurePage, 'feature')
        : activeTab === 'user'
          ? loadConsumption(userPage, 'user')
          : Promise.resolve(),
      activeTab === 'team' ? loadTeams() : Promise.resolve(),
      activeTab === 'refunds' ? loadAdjustments(refundsPage) : Promise.resolve(),
    ]);
    setIsRefreshing(false);
    toast.success('Data refreshed');
  };

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = async (format: ExportFormat) => {
    setIsExporting(true);
    try {
      const blob = await unitPoolService.exportConsumptionHistory({
        format,
        unit_type: filterUnitType === 'all' ? undefined : filterUnitType,
        status: filterStatus === 'all' ? undefined : filterStatus,
        start_date: formatDateForInput(dateStart),
        end_date: formatDateForInput(dateEnd),
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `usage-history-${formatDateForInput(dateStart)}-to-${formatDateForInput(dateEnd)}.${format === 'csv' ? 'csv' : 'xlsx'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported as ${format.toUpperCase()}`);
      setShowExportModal(false);
    } catch (err: any) {
      toast.error(err.message || 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const TABS: { id: TabId; label: string; icon: LucideIcon; count?: number }[] = [
    { id: 'user', label: 'User-Wise', icon: User },
    { id: 'team', label: 'Team-Wise', icon: Users, count: teamsData?.teams?.length || undefined },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* ── Page Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usage History</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Comprehensive feature-wise, user-wise, and team-wise consumption tracking for your organization
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={() => setShowExportModal(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* ── Feature Analytics Cards ── */}
      <AnalyticsCards
        pools={isLoadingPools ? null : pools}
        summary={summary}
        subscriptionUnits={subscriptionUnits}
        userLimits={userLimits}
      />

      {/* ── Filters ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Filters</span>
        </div>
        <div className="flex flex-wrap gap-3">
          {/* Quick Period */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Period</label>
            <select
              value={quickPeriod}
              onChange={(e) => {
                const val = e.target.value;
                setQuickPeriod(val);
                if (!val) {
                  setStartDateInput('');
                  setEndDateInput('');
                  return;
                }
                const now = new Date();
                const end = formatDateForInput(now);
                let start = '';
                if (val === 'last_week') {
                  const d = new Date(now); d.setDate(d.getDate() - 7); start = formatDateForInput(d);
                } else if (val === 'last_month') {
                  const d = new Date(now); d.setMonth(d.getMonth() - 1); start = formatDateForInput(d);
                } else if (val === 'last_quarter') {
                  const d = new Date(now); d.setMonth(d.getMonth() - 3); start = formatDateForInput(d);
                } else if (val === 'last_year') {
                  const d = new Date(now); d.setFullYear(d.getFullYear() - 1); start = formatDateForInput(d);
                }
                setStartDateInput(start);
                setEndDateInput(end);
              }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Time</option>
              <option value="last_week">Last Week</option>
              <option value="last_month">Last Month</option>
              <option value="last_quarter">Last Quarter</option>
              <option value="last_year">Last Year</option>
            </select>
          </div>

          {/* Date Range */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">From</label>
            <input
              type="date"
              value={startDateInput}
              max={endDateInput || defaultEndDate}
              onChange={(e) => { setStartDateInput(e.target.value); setQuickPeriod(''); }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">To</label>
            <input
              type="date"
              value={endDateInput}
              min={startDateInput || undefined}
              max={defaultEndDate}
              onChange={(e) => { setEndDateInput(e.target.value); setQuickPeriod(''); }}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status */}
          {(activeTab === 'feature') && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                <option value="SUCCESS">Success</option>
                <option value="FAILED">Failed</option>
                <option value="INSUFFICIENT_UNITS">Insufficient Units</option>
                <option value="ABANDONED">Abandoned</option>
                <option value="INTERRUPTED">Interrupted</option>
              </select>
            </div>
          )}

        </div>
      </div>

      {/* ── Tabs + Table ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Tab bar */}
        <div className="border-b border-gray-100 px-4">
          <div className="flex gap-0 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${isActive ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab content */}
        <div>
          {activeTab === 'feature' && (
            <FeatureWiseTab
              items={consumptionItems}
              total={consumptionTotal}
              page={featurePage}
              onPageChange={setFeaturePage}
              isLoading={isLoadingConsumption}
            />
          )}
          {activeTab === 'user' && (
            <UserWiseTab
              items={consumptionItems}
              existingUsers={existingUsers}
              total={consumptionTotal}
              page={userPage}
              onPageChange={setUserPage}
              isLoading={isLoadingConsumption}
            />
          )}
          {activeTab === 'team' && (
            <TeamWiseTab
              teamsData={teamsData}
              page={teamPage}
              onPageChange={setTeamPage}
              startDate={formatDateForInput(dateStart)}
              endDate={formatDateForInput(dateEnd)}
              isLoading={isLoadingTeams}
            />
          )}
          {activeTab === 'refunds' && (
            <RefundsTab
              items={adjustmentItems}
              total={adjustmentTotal}
              page={refundsPage}
              onPageChange={setRefundsPage}
              isLoading={isLoadingAdjustments}
              unavailable={adjustmentsUnavailable}
            />
          )}
        </div>
      </div>

      {/* ── Audit note ── */}
      <div className="flex items-start gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg p-3 border border-gray-100">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <p>All dashboard access and exports are audit-logged with your Tenant ID, User ID, and timestamp in compliance with platform policies.</p>
      </div>

      {/* ── Export Modal ── */}
      <ExportModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExport}
        isExporting={isExporting}
      />
    </div>
  );
}
