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
  Sparkles,
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
  RS: { label: 'Resume Scoring', icon: Target, color: 'text-brand-blue', bg: 'bg-brand-blue/10', bar: 'bg-brand-blue' },
  AS: { label: 'Assessment', icon: ClipboardCheck, color: 'text-purple-700', bg: 'bg-purple-50', bar: 'bg-purple-500' },
  AIU: { label: 'AI Interview', icon: Video, color: 'text-emerald-700', bg: 'bg-emerald-50', bar: 'bg-emerald-500' },
};

const CONSUMPTION_COLUMNS: Array<{
  key: string;
  label: string;
  icon: LucideIcon;
  iconClass: string;
}> = [
  { key: 'RS', label: 'Resume Scoring', icon: Target, iconClass: 'text-brand-blue' },
  { key: 'AS', label: 'Assessment', icon: ClipboardCheck, iconClass: 'text-purple-500' },
  { key: 'AIU', label: 'AI Interview', icon: Video, iconClass: 'text-emerald-500' },
  { key: 'RU', label: 'Resume Storage', icon: Upload, iconClass: 'text-brand-orange' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  SUCCESS: { label: 'Success', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  FAILED: { label: 'Failed', color: 'text-red-700', bg: 'bg-red-50' },
  INSUFFICIENT_UNITS: { label: 'Insufficient', color: 'text-brand-orange-deep', bg: 'bg-brand-orange/10' },
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
  if (pct >= 90) return 'bg-gradient-to-r from-red-500 to-red-600';
  if (pct >= 70) return 'bg-brand-orange';
  return 'bg-gradient-to-r from-brand-blue to-brand-cyan';
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'text-gray-600', bg: 'bg-gray-100' };
  const ringMap: Record<string, string> = {
    SUCCESS: 'ring-emerald-200',
    FAILED: 'ring-red-200',
    INSUFFICIENT_UNITS: 'ring-orange-200',
    ABANDONED: 'ring-gray-200',
    INTERRUPTED: 'ring-yellow-200',
    TENANT_SUSPENDED: 'ring-red-200',
    TENANT_EXPIRED: 'ring-red-200',
    BLOCKED: 'ring-gray-200',
  };
  const ring = ringMap[status] ?? 'ring-gray-200';
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ${ring} ${cfg.bg} ${cfg.color}`}>
      {cfg.label}
    </span>
  );
}

function UnitTypeBadge({ type }: { type: string }) {
  const cfg = UNIT_TYPE_CONFIG[type as UnitType];
  if (!cfg) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 ring-1 ring-gray-200">
        {type}
      </span>
    );
  }
  const Icon = cfg.icon;
  const ringMap: Record<string, string> = {
    RS: 'ring-brand-blue/20',
    AS: 'ring-purple-200',
    AIU: 'ring-emerald-200',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ${ringMap[type] ?? 'ring-gray-200'} ${cfg.bg} ${cfg.color}`}>
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
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gradient-to-b from-white to-slate-50/50">
      <p className="text-sm text-gray-500">
        Showing <span className="font-medium text-gray-900">{start}–{end}</span> of <span className="font-medium text-gray-900">{total}</span> records
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="p-1.5 rounded-lg border border-gray-200 hover:border-brand-blue/40 hover:bg-brand-blue/5 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 transition-all"
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
              className={`w-8 h-8 text-sm rounded-lg transition-all ${pageNum === page ? 'bg-brand-blue text-white font-semibold shadow-sm shadow-brand-blue/25 ring-1 ring-white/10' : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'}`}
            >
              {pageNum}
            </button>
          );
        })}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="p-1.5 rounded-lg border border-gray-200 hover:border-brand-blue/40 hover:bg-brand-blue/5 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 transition-all"
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
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-center justify-between p-5 bg-brand-blue rounded-t-2xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 ring-1 ring-white/20 backdrop-blur">
              <Download className="w-5 h-5 text-white" />
            </div>
            <h3 className="text-base font-semibold text-white">Export Usage History</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors ring-1 ring-white/20" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-gray-500">Choose export format:</p>
          <button
            onClick={() => onExport('csv')}
            disabled={isExporting}
            className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 hover:border-brand-blue/40 hover:bg-brand-blue/5 hover:shadow-md transition-all group disabled:opacity-50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm shadow-emerald-500/25 ring-1 ring-white/10">
              <FileText className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-blue">CSV File</p>
              <p className="text-xs text-gray-500">Comma-separated values (.csv)</p>
            </div>
          </button>
          <button
            onClick={() => onExport('excel')}
            disabled={isExporting}
            className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 hover:border-brand-blue/40 hover:bg-brand-blue/5 hover:shadow-md transition-all group disabled:opacity-50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-cyan text-white shadow-sm shadow-brand-cyan/25 ring-1 ring-white/10">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-900 group-hover:text-brand-blue">Excel Spreadsheet</p>
              <p className="text-xs text-gray-500">Microsoft Excel format (.xlsx)</p>
            </div>
          </button>
        </div>
        {isExporting && (
          <div className="px-5 pb-4 flex items-center gap-2 text-sm text-brand-blue">
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

  const tileGradient: Record<UnitType, string> = {
    RS: 'from-brand-blue to-brand-blue-2 shadow-brand-blue/25',
    AS: 'from-purple-500 to-purple-700 shadow-purple-500/25',
    AIU: 'from-brand-cyan to-emerald-500 shadow-brand-cyan/25',
  };
  const ringByType: Record<UnitType, string> = {
    RS: 'ring-brand-blue/20',
    AS: 'ring-purple-200',
    AIU: 'ring-brand-cyan/20',
  };

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
          <div key={type} className="group bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md hover:border-brand-blue/30 hover:-translate-y-0.5 transition-all">
            <div className="flex items-start justify-between mb-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br ${tileGradient[type]} text-white shadow-sm ring-1 ring-white/10`}>
                <Icon className="w-5 h-5" />
              </div>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ring-1 ${ringByType[type]} ${cfg.bg} ${cfg.color}`}>{type}</span>
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
                <p className={`text-lg font-bold ${pct >= 90 ? 'text-red-600' : pct >= 70 ? 'text-brand-orange-deep' : 'text-emerald-600'}`}>
                  {isUnlimited ? '∞' : (remaining?.toLocaleString() ?? '—')}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Usage</span>
                <span className={pct >= 90 ? 'text-red-600 font-medium' : ''}>{isUnlimited ? 'Unlimited' : `${pct}%`}</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
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
          <div className="group bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md hover:border-brand-blue/30 hover:-translate-y-0.5 transition-all">
            <div className="flex items-start justify-between mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-orange text-white shadow-sm shadow-brand-orange/25 ring-1 ring-white/10">
                <FileText className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full ring-1 ring-brand-orange/30 bg-brand-orange/10 text-brand-orange-deep">RU</span>
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
                <p className={`text-lg font-bold ${pct >= 90 ? 'text-red-600' : pct >= 70 ? 'text-brand-orange-deep' : 'text-emerald-600'}`}>
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
              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
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
          <div className="group bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:shadow-md hover:border-brand-blue/30 hover:-translate-y-0.5 transition-all">
            <div className="flex items-start justify-between mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-700 text-white shadow-sm shadow-indigo-500/25 ring-1 ring-white/10">
                <Users className="w-5 h-5" />
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full ring-1 ring-indigo-200 bg-indigo-50 text-indigo-700">MAX</span>
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
                <p className={`text-lg font-bold ${pct >= 90 ? 'text-red-600' : pct >= 70 ? 'text-brand-orange-deep' : 'text-emerald-600'}`}>
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
              <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
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
        <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/15 mb-4">
          <Layers className="w-7 h-7 text-brand-blue" />
        </div>
        <p className="text-gray-700 font-semibold">No usage records found</p>
        <p className="text-gray-500 text-sm mt-1">Try adjusting your filters or date range</p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Feature</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">User</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Entity</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Units</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Status</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Balance After</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Date & Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((entry) => (
              <tr key={entry.id} className="hover:bg-brand-blue/[0.03] transition-colors">
                <td className="px-4 py-3">
                  <UnitTypeBadge type={entry.unit_type} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                      <User className="w-3.5 h-3.5" />
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
                    <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-brand-cyan/10 text-brand-cyan ring-1 ring-brand-cyan/20">
                      Refunded
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-gray-600 text-xs font-medium">{entry.balance_after?.toLocaleString() ?? '—'}</span>
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
        <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
      </div>
    );
  }

  if (!users.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/15 mb-4">
          <Users className="w-7 h-7 text-brand-blue" />
        </div>
        <p className="text-gray-700 font-semibold">No user usage data found</p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">#</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">User</th>
              {CONSUMPTION_COLUMNS.map((column) => {
                const Icon = column.icon;
                return (
                  <th key={column.key} className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1">
                      <Icon className={`w-3.5 h-3.5 ${column.iconClass}`} />
                      {column.label}
                    </span>
                  </th>
                );
              })}
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Total</th>
              <th className="text-center px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Success / Failed</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Last Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedUsers.map((u, idx) => (
              <tr key={u.userId} className="hover:bg-brand-blue/[0.03] transition-colors">
                <td className="px-4 py-3 text-gray-400 text-xs font-medium">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
                      <span className="text-xs font-bold">{u.userName.charAt(0).toUpperCase()}</span>
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
                  <span className="font-bold text-brand-blue">{u.total.toLocaleString()}</span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium px-2 py-0.5 rounded-full bg-emerald-50 ring-1 ring-emerald-200">
                      <CheckCircle2 className="w-3 h-3" />{u.successCount}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium px-2 py-0.5 rounded-full bg-red-50 ring-1 ring-red-200">
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
        <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
      </div>
    );
  }

  if (!teamsData?.teams?.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/15 mb-4">
          <Users className="w-7 h-7 text-brand-blue" />
        </div>
        <p className="text-gray-700 font-semibold">No team usage data found</p>
        <p className="text-gray-500 text-sm mt-1">Teams data will appear once team members start using features</p>
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
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">#</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Team</th>
              {CONSUMPTION_COLUMNS.map((column) => {
                const Icon = column.icon;
                return (
                  <th key={column.key} className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1">
                      <Icon className={`w-3.5 h-3.5 ${column.iconClass}`} />
                      {column.label}
                    </span>
                  </th>
                );
              })}
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">JDs Created</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Assessments</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
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
                    className={`hover:bg-brand-blue/[0.03] transition-colors cursor-pointer ${isExpanded ? 'bg-brand-blue/[0.04]' : ''}`}
                    onClick={() => setExpandedTeamId(isExpanded ? null : team.team_id)}
                  >
                    <td className="px-4 py-3 text-gray-400 text-xs font-medium">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="text-gray-400 hover:text-brand-blue transition-colors"
                          aria-label={isExpanded ? 'Collapse team users' : 'Expand team users'}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-cyan to-brand-blue text-white shadow-sm shadow-brand-cyan/25 ring-1 ring-white/10 flex-shrink-0">
                          <Users className="w-4 h-4" />
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
                    <tr className="bg-gradient-to-b from-brand-blue/[0.03] to-slate-50/70">
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
            <tr className="border-t-2 border-gray-200 bg-gradient-to-r from-gray-50 to-slate-50">
              <td className="px-4 py-3" colSpan={2}>
                <span className="text-xs font-semibold text-gray-700">{teamsData.teams.length} team{teamsData.teams.length !== 1 ? 's' : ''} total</span>
              </td>
              <td className="px-4 py-3 text-right text-xs font-bold text-brand-blue">
                {teamsData.teams.reduce((s, t) => s + (t.by_type?.RS?.total_consumed ?? 0), 0).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right text-xs font-bold text-purple-700">
                {teamsData.teams.reduce((s, t) => s + (t.by_type?.AS?.total_consumed ?? 0), 0).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right text-xs font-bold text-emerald-700">
                {teamsData.teams.reduce((s, t) => s + (t.by_type?.AIU?.total_consumed ?? 0), 0).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right text-xs font-bold text-brand-orange-deep">
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
      <div className="flex items-center gap-2 text-sm text-brand-blue">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading team users usage...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-100">
        {error}
      </div>
    );
  }

  const members = membersUsage?.members || [];

  if (!members.length) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-500 shadow-sm">
        No usage found for users in {teamName} during the selected date range.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gradient-to-r from-brand-blue/[0.04] to-brand-cyan/[0.03]">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
            <Users className="w-4 h-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{teamName} Users</p>
            <p className="text-xs text-gray-500">Usage details for team members</p>
          </div>
        </div>
        <span className="text-xs font-medium text-brand-blue px-2.5 py-1 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20">{members.length} user{members.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">User</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Resume Scoring</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Assessment</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">AI Interview</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Resume Storage</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Total</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Last Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {members.map((member) => {
              const rs = member.by_type?.RS?.total_consumed ?? 0;
              const as = member.by_type?.AS?.total_consumed ?? 0;
              const aiu = member.by_type?.AIU?.total_consumed ?? 0;
              const ru = member.by_type?.RU?.total_consumed ?? 0;
              const total = rs + as + aiu + ru;
              return (
                <tr key={member.user_id} className="hover:bg-brand-blue/[0.03] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-cyan to-brand-blue text-white shadow-sm shadow-brand-cyan/25 ring-1 ring-white/10 flex-shrink-0">
                        <span className="text-xs font-bold">{(member.user_name || 'U').charAt(0).toUpperCase()}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-800 text-xs">{member.user_name || 'Unknown User'}</p>
                        <p className="text-gray-400 text-xs">{member.user_email || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium">{rs ? rs.toLocaleString() : '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium">{as ? as.toLocaleString() : '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium">{aiu ? aiu.toLocaleString() : '—'}</td>
                  <td className="px-4 py-3 text-right text-gray-700 font-medium">{ru ? ru.toLocaleString() : '—'}</td>
                  <td className="px-4 py-3 text-right font-bold text-brand-blue">{total.toLocaleString()}</td>
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

  const ACTION_CONFIG: Record<string, { label: string; color: string; bg: string; ring: string }> = {
    REFUND: { label: 'Refund', color: 'text-brand-cyan', bg: 'bg-brand-cyan/10', ring: 'ring-brand-cyan/20' },
    ADJUST_ADD: { label: 'Credit', color: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'ring-emerald-200' },
    ADJUST_DEDUCT: { label: 'Deduct', color: 'text-red-700', bg: 'bg-red-50', ring: 'ring-red-200' },
    REPLENISH: { label: 'Replenish', color: 'text-brand-blue', bg: 'bg-brand-blue/10', ring: 'ring-brand-blue/20' },
    UPGRADE: { label: 'Upgrade', color: 'text-indigo-700', bg: 'bg-indigo-50', ring: 'ring-indigo-200' },
    EXPIRE: { label: 'Expired', color: 'text-gray-600', bg: 'bg-gray-100', ring: 'ring-gray-200' },
    INIT: { label: 'Init', color: 'text-gray-600', bg: 'bg-gray-100', ring: 'ring-gray-200' },
    CONSUME: { label: 'Consume', color: 'text-brand-orange-deep', bg: 'bg-brand-orange/10', ring: 'ring-brand-orange/20' },
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-orange/10 to-amber-100 ring-1 ring-brand-orange/20 mb-4">
          <AlertTriangle className="w-7 h-7 text-brand-orange-deep" />
        </div>
        <p className="text-gray-700 font-semibold">Refunds & Adjustments Not Yet Available</p>
        <p className="text-gray-500 text-sm mt-1 max-w-sm">
          This feature requires a database migration that hasn't been applied to your tenant yet.
          Please contact your system administrator.
        </p>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/15 mb-4">
          <RefreshCw className="w-7 h-7 text-brand-blue" />
        </div>
        <p className="text-gray-700 font-semibold">No refunds or adjustments found</p>
        <p className="text-gray-500 text-sm mt-1">Unit adjustments and refunds will appear here</p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Type</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Feature</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Units</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Before</th>
              <th className="text-right px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">After</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Actor</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Reason</th>
              <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((entry) => {
              const acfg = ACTION_CONFIG[entry.action_type] ?? { label: entry.action_type, color: 'text-gray-600', bg: 'bg-gray-100', ring: 'ring-gray-200' };
              const isPositive = ['REFUND', 'ADJUST_ADD', 'REPLENISH', 'UPGRADE', 'INIT'].includes(entry.action_type);
              return (
                <tr key={entry.id} className="hover:bg-brand-blue/[0.03] transition-colors">
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ${acfg.ring} ${acfg.bg} ${acfg.color}`}>
                      {acfg.label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <UnitTypeBadge type={entry.unit_type} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-bold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
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
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/15 mb-4">
          <Shield className="w-8 h-8 text-brand-blue" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Access Restricted</h2>
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
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
      {/* ── Page Header ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal text-white shadow-xl shadow-brand-blue/20 ring-1 ring-white/10">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-cyan/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-brand-orange/15 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        <div className="relative flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15 backdrop-blur-sm">
              <TrendingDown className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
                <Sparkles className="h-3 w-3 text-brand-orange" />
                Usage analytics
              </div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Usage History</h1>
              <p className="text-white/80 mt-2 text-sm max-w-2xl sm:text-base">
                Comprehensive feature-wise, user-wise, and team-wise consumption tracking for your organization.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-white/10 border border-white/20 rounded-lg hover:bg-white/20 transition-colors disabled:opacity-50 backdrop-blur"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-brand-blue bg-white rounded-lg hover:bg-white/95 transition-colors shadow-md ring-1 ring-white/40"
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
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
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
            <Filter className="w-4 h-4" />
          </div>
          <div>
            <span className="text-sm font-semibold text-gray-900">Filters</span>
            <p className="text-xs text-gray-500">Refine your usage data view</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          {/* Quick Period */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">Period</label>
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
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue transition-all hover:border-brand-blue/40"
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
            <label className="text-xs font-medium text-gray-600">From</label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-blue/70" />
              <input
                type="date"
                value={startDateInput}
                max={endDateInput || defaultEndDate}
                onChange={(e) => { setStartDateInput(e.target.value); setQuickPeriod(''); }}
                className="text-sm border border-gray-200 rounded-lg pl-8 pr-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue transition-all hover:border-brand-blue/40"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-600">To</label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-brand-blue/70" />
              <input
                type="date"
                value={endDateInput}
                min={startDateInput || undefined}
                max={defaultEndDate}
                onChange={(e) => { setEndDateInput(e.target.value); setQuickPeriod(''); }}
                className="text-sm border border-gray-200 rounded-lg pl-8 pr-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue transition-all hover:border-brand-blue/40"
              />
            </div>
          </div>

          {/* Status */}
          {(activeTab === 'feature') && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-gray-600">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue transition-all hover:border-brand-blue/40"
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
        <div className="border-b border-gray-200 px-4 bg-gradient-to-b from-slate-50/50 to-white">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
                    isActive
                      ? 'border-brand-blue text-brand-blue'
                      : 'border-transparent text-gray-500 hover:text-brand-blue hover:border-brand-blue/30'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ring-1 ${isActive ? 'bg-brand-blue/10 text-brand-blue ring-brand-blue/20' : 'bg-gray-100 text-gray-500 ring-gray-200'}`}>
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
      <div className="flex items-start gap-3 text-xs text-gray-600 bg-gradient-to-r from-brand-blue/[0.04] to-brand-cyan/[0.03] rounded-xl p-4 border border-brand-blue/15 ring-1 ring-brand-blue/5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10 flex-shrink-0">
          <Info className="w-3.5 h-3.5" />
        </div>
        <p className="pt-1">All dashboard access and exports are audit-logged with your Tenant ID, User ID, and timestamp in compliance with platform policies.</p>
      </div>

      {/* ── Export Modal ── */}
      <ExportModal
        open={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExport}
        isExporting={isExporting}
      />
      </div>
    </div>
  );
}
