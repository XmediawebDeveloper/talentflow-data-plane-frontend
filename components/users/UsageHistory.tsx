'use client';

import AppModal from '@/components/ui/app-modal';

/**
 * UsageHistory Component
 * Tenant Admin Only - Comprehensive usage history dashboard
 * Shows feature-wise, user-wise, team-wise usage with analytics, filters, export, and pagination
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ClipboardList,
  ClipboardCheck,
  Video,
  Upload,
  Users,
  TrendingDown,
  Download,
  Search,
  RefreshCw,
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
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
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { Skeleton } from '@/components/ui/skeleton';
import { DateField } from '@/components/ui/date-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Tooltip } from '@/components/ui/tooltip';
import { PageHeader } from '@/components/ui/page-header';
import NameAvatar from '@/components/ui/name-avatar';

type BadgeVariant = React.ComponentProps<typeof Badge>['variant'];

/* Neutral-gray table skeleton whose columns mirror a specific usage-history
   tab. `cols` is one width class (e.g. 'w-24') per column, in table order. */
function UsageTableSkeleton({ cols, rows = 8 }: { cols: string[]; rows?: number }) {
  const gridStyle = { gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` };
  return (
    <div className="overflow-x-auto tf-table-shell">
      <div
        className="grid gap-4 border-b border-gray-200 bg-gray-50 px-4 py-3"
        style={gridStyle}
      >
        {cols.map((w, i) => (
          <Skeleton key={i} className={`h-3 ${w}`} />
        ))}
      </div>
      <div className="divide-y divide-gray-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="grid items-center gap-4 px-4 py-3" style={gridStyle}>
            {cols.map((_w, c) => (
              <Skeleton key={c} className="h-4" style={{ width: `${55 + ((r + c) * 7) % 40}%` }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Constants ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 10;

type LucideIcon = React.FC<React.SVGProps<SVGSVGElement>>;

const UNIT_TYPE_CONFIG: Record<UnitType, { label: string; icon: LucideIcon; color: string; bg: string; bar: string }> = {
  RS: { label: 'Resume Scoring', icon: ClipboardList, color: 'text-brand-blue', bg: 'bg-brand-blue/10', bar: 'bg-brand-blue' },
  AS: { label: 'Assessment', icon: ClipboardCheck, color: 'text-brand-cyan', bg: 'bg-brand-cyan/10', bar: 'bg-brand-cyan' },
  AIU: { label: 'AI Interview', icon: Video, color: 'text-success', bg: 'bg-success-subtle', bar: 'bg-success' },
};

const CONSUMPTION_COLUMNS: Array<{
  key: string;
  label: string;
  icon: LucideIcon;
  iconClass: string;
}> = [
  { key: 'RS', label: 'Resume Scoring', icon: ClipboardList, iconClass: 'text-brand-blue' },
  { key: 'AS', label: 'Assessment', icon: ClipboardCheck, iconClass: 'text-brand-cyan' },
  { key: 'AIU', label: 'AI Interview', icon: Video, iconClass: 'text-success' },
  { key: 'RU', label: 'Resume Storage', icon: Upload, iconClass: 'text-brand-orange' },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  SUCCESS: { label: 'Success', color: 'text-success', bg: 'bg-success-subtle' },
  FAILED: { label: 'Failed', color: 'text-destructive', bg: 'bg-destructive-subtle' },
  INSUFFICIENT_UNITS: { label: 'Insufficient', color: 'text-brand-orange-deep', bg: 'bg-brand-orange/10' },
  ABANDONED: { label: 'Abandoned', color: 'text-gray-600', bg: 'bg-gray-100' },
  INTERRUPTED: { label: 'Interrupted', color: 'text-warning', bg: 'bg-warning-subtle' },
  TENANT_SUSPENDED: { label: 'Suspended', color: 'text-destructive', bg: 'bg-destructive-subtle' },
  TENANT_EXPIRED: { label: 'Expired', color: 'text-destructive', bg: 'bg-destructive-subtle' },
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
  if (pct >= 90) return 'bg-destructive';
  if (pct >= 70) return 'bg-brand-orange';
  return 'bg-gradient-to-r from-brand-blue to-brand-cyan';
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: 'text-gray-600', bg: 'bg-gray-100' };
  const variantMap: Record<string, BadgeVariant> = {
    SUCCESS: 'success',
    FAILED: 'destructive',
    INSUFFICIENT_UNITS: 'warning',
    ABANDONED: 'muted',
    INTERRUPTED: 'warning',
    TENANT_SUSPENDED: 'destructive',
    TENANT_EXPIRED: 'destructive',
    BLOCKED: 'muted',
  };
  return <Badge variant={variantMap[status] ?? 'muted'}>{cfg.label}</Badge>;
}

function UnitTypeBadge({ type }: { type: string }) {
  const cfg = UNIT_TYPE_CONFIG[type as UnitType];
  if (!cfg) {
    return <Badge variant="muted">{type}</Badge>;
  }
  const Icon = cfg.icon;
  const ringMap: Record<string, string> = {
    RS: 'ring-brand-blue/20',
    AS: 'ring-brand-cyan/20',
    AIU: 'ring-success-line',
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

  const [goToPage, setGoToPage] = useState(String(page));
  useEffect(() => {
    setGoToPage(String(page));
  }, [page]);

  const commitGoToPage = () => {
    const target = Math.round(Number(goToPage));
    if (Number.isFinite(target) && target >= 1 && target <= totalPages) {
      onPageChange(target);
    } else {
      setGoToPage(String(page));
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-y-3 gap-x-2 px-4 py-3 border-t border-gray-100 bg-gradient-to-b from-white to-slate-50/50">
      <p className="text-sm text-gray-500">
        Showing <span className="font-medium text-gray-900">{start}–{end}</span> of <span className="font-medium text-gray-900">{total}</span> records
      </p>
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-gray-600 whitespace-nowrap">Go to</span>
          <Input
            type="number"
            min={1}
            max={totalPages}
            value={goToPage}
            onChange={(e) => setGoToPage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.currentTarget.blur();
                commitGoToPage();
              }
            }}
            onBlur={commitGoToPage}
            aria-label="Go to page"
            className="w-14 h-8 sm:h-9 text-center"
          />
        </div>
        <Tooltip content="Previous page">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors"
            aria-label="Previous page"
          >
            <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </Tooltip>
        <span className="text-sm font-medium text-gray-700 px-1 whitespace-nowrap">
          <span className="text-brand-blue font-semibold">{page}</span> / {totalPages}
        </span>
        <Tooltip content="Next page">
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
            className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-brand-blue/5 hover:border-brand-blue/30 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 disabled:hover:text-gray-700 transition-colors"
            aria-label="Next page"
          >
            <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>
        </Tooltip>
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
    <AppModal
      open={open}
      onCancel={onClose}
      size="sm"
      zIndexClass="z-50"
      icon={<Download />}
      title="Export Usage History"
      footerStart={isExporting ? (
        <span className="flex items-center gap-2 text-sm text-brand-blue">
          <Loader2 className="w-4 h-4 animate-spin" />
          Preparing export…
        </span>
      ) : null}
    >
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Choose export format:</p>
          <button
            onClick={() => onExport('csv')}
            disabled={isExporting}
            className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 hover:border-brand-blue/40 hover:bg-brand-blue/5 hover:shadow-md transition-all group disabled:opacity-50"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-success text-white shadow-sm shadow-success/25 ring-1 ring-white/10">
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
    </AppModal>
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
    AS: 'from-brand-cyan to-brand-blue shadow-brand-cyan/25',
    AIU: 'from-success to-success-strong shadow-success/25',
  };
  const ringByType: Record<UnitType, string> = {
    RS: 'ring-brand-blue/20',
    AS: 'ring-brand-cyan/20',
    AIU: 'ring-success-line',
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
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
          <div key={type} className="group bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-4 shadow-sm shadow-brand-blue/5 hover:shadow-md hover:border-brand-blue/40 hover:-translate-y-0.5 transition-all">
            <div className="flex items-start justify-between mb-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br ${tileGradient[type]} text-white shadow-sm ring-1 ring-white/10`}>
                <Icon className="w-4 h-4" />
              </div>
              <span className={`text-2xs font-semibold px-2 py-0.5 rounded-full ring-1 ${ringByType[type]} ${cfg.bg} ${cfg.color}`}>{type}</span>
            </div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2 truncate">{cfg.label}</h3>
            <div className="grid grid-cols-3 gap-1.5 mb-2.5">
              <div className="min-w-0">
                <p className="truncate text-2xs text-gray-400">Purchased</p>
                <p className="text-base font-semibold tabular-nums text-gray-900 truncate">{isUnlimited ? '∞' : (purchased?.toLocaleString() ?? '—')}</p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-2xs text-gray-400">Consumed</p>
                <p className="text-base font-semibold tabular-nums text-gray-700 truncate">{consumed?.toLocaleString() ?? '—'}</p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-2xs text-gray-400">Remaining</p>
                <p className={`text-base font-semibold tabular-nums truncate ${pct >= 90 ? 'text-destructive' : pct >= 70 ? 'text-brand-orange-deep' : 'text-success'}`}>
                  {isUnlimited ? '∞' : (remaining?.toLocaleString() ?? '—')}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Usage</span>
                <span className={pct >= 90 ? 'text-destructive font-medium' : ''}>{isUnlimited ? 'Unlimited' : `${pct}%`}</span>
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
          <div className="group bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-4 shadow-sm shadow-brand-blue/5 hover:shadow-md hover:border-brand-blue/40 hover:-translate-y-0.5 transition-all">
            <div className="flex items-start justify-between mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-orange text-white shadow-sm shadow-brand-orange/25 ring-1 ring-white/10">
                <FileText className="w-4 h-4" />
              </div>
              <span className="text-2xs font-semibold px-2 py-0.5 rounded-full ring-1 ring-brand-orange/30 bg-brand-orange/10 text-brand-orange-deep">RU</span>
            </div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2 truncate">Resume Storage</h3>
            <div className="grid grid-cols-3 gap-1.5 mb-2.5">
              <div className="min-w-0">
                <p className="truncate text-2xs text-gray-400">Limit</p>
                <p className="text-base font-semibold tabular-nums text-gray-900 truncate">
                  {ru ? (ru.is_unlimited ? '∞' : ru.limit.toLocaleString()) : '—'}
                </p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-2xs text-gray-400">Used</p>
                <p className="text-base font-semibold tabular-nums text-gray-700 truncate">{ru?.used?.toLocaleString() ?? '—'}</p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-2xs text-gray-400">Available</p>
                <p className={`text-base font-semibold tabular-nums truncate ${pct >= 90 ? 'text-destructive' : pct >= 70 ? 'text-brand-orange-deep' : 'text-success'}`}>
                  {ru ? (ru.is_unlimited ? '∞' : ru.available.toLocaleString()) : '—'}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Usage</span>
                <span className={pct >= 90 ? 'text-destructive font-medium' : ''}>
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
          <div className="group bg-white dark:bg-slate-900 rounded-xl border border-gray-300 dark:border-slate-700 ring-1 ring-black/[0.02] dark:ring-white/[0.02] p-4 shadow-sm shadow-brand-blue/5 hover:shadow-md hover:border-brand-blue/40 hover:-translate-y-0.5 transition-all">
            <div className="flex items-start justify-between mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-blue-2 to-brand-blue text-white shadow-sm shadow-brand-blue/25 ring-1 ring-white/10">
                <Users className="w-4 h-4" />
              </div>
              <span className="text-2xs font-semibold px-2 py-0.5 rounded-full ring-1 ring-gray-200 bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300">MAX</span>
            </div>
            <h3 className="text-sm font-semibold text-gray-500 mb-2 truncate">User Seats</h3>
            <div className="grid grid-cols-3 gap-1.5 mb-2.5">
              <div className="min-w-0">
                <p className="truncate text-2xs text-gray-400">Max Users</p>
                <p className="text-base font-semibold tabular-nums text-gray-900 truncate">
                  {userLimits ? (isUnlimited ? '∞' : userLimits.max_users.toLocaleString()) : '—'}
                </p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-2xs text-gray-400">Active</p>
                <p className="text-base font-semibold tabular-nums text-gray-700 truncate">{userLimits?.current_users?.toLocaleString() ?? '—'}</p>
              </div>
              <div className="min-w-0">
                <p className="truncate text-2xs text-gray-400">Available</p>
                <p className={`text-base font-semibold tabular-nums truncate ${pct >= 90 ? 'text-destructive' : pct >= 70 ? 'text-brand-orange-deep' : 'text-success'}`}>
                  {userLimits ? (isUnlimited ? '∞' : userLimits.available_slots.toLocaleString()) : '—'}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Usage</span>
                <span className={pct >= 90 ? 'text-destructive font-medium' : ''}>
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
    // Feature, User, Entity, Units, Status, Balance After, Date & Time.
    return <UsageTableSkeleton cols={['w-24', 'w-24', 'w-20', 'w-12', 'w-16', 'w-20', 'w-24']} />;
  }

  if (!items.length) {
    return (
      <EmptyState
        icon={Layers}
        title="No usage records found"
        description="Try adjusting your filters or date range"
      />
    );
  }

  return (
    <div>
      <div className="overflow-x-auto tf-table-shell">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Feature</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">User</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Entity</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Units</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Status</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Balance After</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Date & Time</th>
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
                      <p className="font-medium text-gray-800 text-sm leading-tight">{entry.user_name || '—'}</p>
                      <p className="text-gray-400 text-xs">{entry.user_email || '—'}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="text-gray-700 text-sm font-medium">{entry.entity_name || '—'}</p>
                  {entry.entity_type && <p className="text-gray-400 text-xs capitalize">{entry.entity_type.replace(/_/g, ' ')}</p>}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="font-semibold text-gray-900">{entry.units_consumed}</span>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={entry.status} />
                  {entry.refund_flag === 'YES' && (
                    <Badge variant="secondary" className="ml-1">Refunded</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="text-gray-600 text-sm font-medium">{entry.balance_after?.toLocaleString() ?? '—'}</span>
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
    // #, User, RS, AS, AIU, RU, Total, Success / Failed, Last Active.
    return <UsageTableSkeleton cols={['w-6', 'w-24', 'w-14', 'w-14', 'w-14', 'w-14', 'w-14', 'w-20', 'w-20']} />;
  }

  if (!users.length) {
    return (
      <EmptyState
        icon={Users}
        title="No user usage data found"
        description="Try adjusting your filters or date range"
      />
    );
  }

  return (
    <div>
      <div className="overflow-x-auto tf-table-shell">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">#</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">User</th>
              {CONSUMPTION_COLUMNS.map((column) => {
                const Icon = column.icon;
                return (
                  <th key={column.key} className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1">
                      <Icon className={`w-3.5 h-3.5 ${column.iconClass}`} />
                      {column.label}
                    </span>
                  </th>
                );
              })}
              <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Total</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Success / Failed</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Last Active</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedUsers.map((u, idx) => (
              <tr key={u.userId} className="hover:bg-brand-blue/[0.03] transition-colors">
                <td className="px-4 py-3 text-gray-400 text-xs font-medium">{(page - 1) * PAGE_SIZE + idx + 1}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <NameAvatar name={u.userName} fallback={u.userEmail} size="sm" />
                    <div>
                      <p className="font-medium text-gray-800 text-sm">{u.userName}</p>
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
                    <Badge variant="success">
                      <CheckCircle2 className="w-3 h-3" />{u.successCount}
                    </Badge>
                    <Badge variant="destructive">
                      <XCircle className="w-3 h-3" />{u.failedCount}
                    </Badge>
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
    // #, Team, RS, AS, AIU, RU, JDs Created, Assessments.
    return <UsageTableSkeleton cols={['w-6', 'w-28', 'w-14', 'w-14', 'w-14', 'w-14', 'w-16', 'w-20']} />;
  }

  if (!teamsData?.teams?.length) {
    return (
      <EmptyState
        icon={Users}
        title="No team usage data found"
        description="Teams data will appear once team members start using features"
      />
    );
  }

  const totalTeams = teamsData.teams.length;
  const totalPages = Math.ceil(totalTeams / PAGE_SIZE);
  const paginatedTeams = teamsData.teams.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      <div className="overflow-x-auto tf-table-shell">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">#</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Team</th>
              {CONSUMPTION_COLUMNS.map((column) => {
                const Icon = column.icon;
                return (
                  <th key={column.key} className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">
                    <span className="inline-flex items-center gap-1">
                      <Icon className={`w-3.5 h-3.5 ${column.iconClass}`} />
                      {column.label}
                    </span>
                  </th>
                );
              })}
              <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">JDs Created</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Assessments</th>
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
                          <p className="font-medium text-gray-800 text-sm">{team.team_name || 'Unnamed Team'}</p>
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
                <span className="text-sm font-semibold text-gray-700">{teamsData.teams.length} team{teamsData.teams.length !== 1 ? 's' : ''} total</span>
              </td>
              <td className="px-4 py-3 text-right text-sm font-bold text-brand-blue">
                {teamsData.teams.reduce((s, t) => s + (t.by_type?.RS?.total_consumed ?? 0), 0).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right text-sm font-bold text-brand-cyan">
                {teamsData.teams.reduce((s, t) => s + (t.by_type?.AS?.total_consumed ?? 0), 0).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right text-sm font-bold text-success">
                {teamsData.teams.reduce((s, t) => s + (t.by_type?.AIU?.total_consumed ?? 0), 0).toLocaleString()}
              </td>
              <td className="px-4 py-3 text-right text-sm font-bold text-brand-orange-deep">
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
      <div className="flex items-center justify-center gap-2 text-sm text-brand-blue tf-loader-center">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading team users usage...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive-line bg-destructive-subtle px-4 py-3 text-sm text-destructive ring-1 ring-destructive-line">
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
            <p className="text-base font-semibold text-gray-900">{teamName} Users</p>
            <p className="text-xs text-gray-500">Usage details for team members</p>
          </div>
        </div>
        <span className="text-xs font-medium text-brand-blue px-2.5 py-1 rounded-full bg-brand-blue/10 ring-1 ring-brand-blue/20">{members.length} user{members.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="overflow-x-auto tf-table-shell">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">User</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Resume Scoring</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Assessment</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">AI Interview</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Resume Storage</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Total</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Last Active</th>
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
                      <NameAvatar name={member.user_name} fallback={member.user_email} size="sm" />
                      <div>
                        <p className="font-medium text-gray-800 text-sm">{member.user_name || 'Unknown User'}</p>
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

  const ACTION_CONFIG: Record<string, { label: string; variant: BadgeVariant }> = {
    REFUND: { label: 'Refund', variant: 'secondary' },
    ADJUST_ADD: { label: 'Credit', variant: 'success' },
    ADJUST_DEDUCT: { label: 'Deduct', variant: 'destructive' },
    REPLENISH: { label: 'Replenish', variant: 'default' },
    UPGRADE: { label: 'Upgrade', variant: 'secondary' },
    EXPIRE: { label: 'Expired', variant: 'muted' },
    INIT: { label: 'Init', variant: 'muted' },
    CONSUME: { label: 'Consume', variant: 'warning' },
  };

  if (isLoading) {
    // Type, Feature, Units, Before, After, Actor, Reason, Date.
    return <UsageTableSkeleton cols={['w-16', 'w-20', 'w-12', 'w-14', 'w-14', 'w-24', 'w-28', 'w-20']} />;
  }

  if (unavailable) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Refunds & Adjustments Not Yet Available"
        description="This feature requires a database migration that hasn't been applied to your tenant yet. Please contact your system administrator."
      />
    );
  }

  if (!items.length) {
    return (
      <EmptyState
        icon={RefreshCw}
        title="No refunds or adjustments found"
        description="Unit adjustments and refunds will appear here"
      />
    );
  }

  return (
    <div>
      <div className="overflow-x-auto tf-table-shell">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Type</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Feature</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Units</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Before</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">After</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Actor</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Reason</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-500 text-xs uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map((entry) => {
              const acfg = ACTION_CONFIG[entry.action_type] ?? { label: entry.action_type, variant: 'muted' as BadgeVariant };
              const isPositive = ['REFUND', 'ADJUST_ADD', 'REPLENISH', 'UPGRADE', 'INIT'].includes(entry.action_type);
              return (
                <tr key={entry.id} className="hover:bg-brand-blue/[0.03] transition-colors">
                  <td className="px-4 py-3">
                    <Badge variant={acfg.variant}>{acfg.label}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <UnitTypeBadge type={entry.unit_type} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-bold ${isPositive ? 'text-success' : 'text-destructive'}`}>
                      {isPositive ? '+' : '-'}{Math.abs(entry.units_amount).toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-500 text-sm">{entry.balance_before.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-gray-700 text-sm font-medium">{entry.balance_after.toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <p className="text-gray-700 text-sm">{entry.actor_name || entry.actor_email || '—'}</p>
                    <p className="text-gray-400 text-xs capitalize">{entry.actor_type?.toLowerCase()}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-gray-600 text-sm max-w-[200px] truncate" title={entry.reason}>{entry.reason}</p>
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
  const { user, isTenantAdmin, hasPermission } = useAuth();
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

  /* Bumped by every loadConsumption / loadPoolData run, so only the latest
     request applies. The By Feature and By User tabs share the consumption
     state, and the mount loads run with defaults before the saved filters
     and dates are restored — an older response landing last used to show
     the other tab's rows / totals or the default period's numbers. Declared
     here, above the access guard's early return, with the other hooks. */
  const consumptionSeqRef = useRef(0);
  const poolSeqRef = useRef(0);

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

  // Persist scroll + view state so returning to Usage History lands the user
  // where they left off. Re-detect the scroll container when the active tab
  // flips (each tab renders a differently-sized table). Per-tab page numbers are
  // intentionally not persisted — they auto-reset whenever the tab/filters/dates
  // change, which restore itself triggers.
  const rootRef = useScrollRestoration('org-usage-history', !isLoadingPools, [activeTab]);
  useListStatePersistence(
    'org-usage-history',
    { activeTab, startDateInput, endDateInput, quickPeriod, filterUnitType, filterStatus, searchUser },
    (s) => {
      if (s.activeTab === 'feature' || s.activeTab === 'user' || s.activeTab === 'team' || s.activeTab === 'refunds') {
        setActiveTab(s.activeTab as TabId);
      }
      if (typeof s.startDateInput === 'string') setStartDateInput(s.startDateInput);
      if (typeof s.endDateInput === 'string') setEndDateInput(s.endDateInput);
      if (typeof s.quickPeriod === 'string') setQuickPeriod(s.quickPeriod);
      if (typeof s.filterUnitType === 'string') setFilterUnitType(s.filterUnitType as UnitType | 'all');
      if (typeof s.filterStatus === 'string') setFilterStatus(s.filterStatus);
      if (typeof s.searchUser === 'string') setSearchUser(s.searchUser);
    },
  );

  // ── Access guard ─────────────────────────────────────────────────────────
  // Was isTenantAdmin-only, hiding this page from a non-owner admin who had
  // been granted canViewUsage — the same permission lib/navigation/routeAccess.ts
  // already declares for this exact route prefix ('/organization/usage'),
  // and the same permission OrganizationTabs.tsx checks to show this tab.
  if (!isTenantAdmin && !hasPermission('canViewUsage')) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60dvh] text-center p-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/15 mb-4">
          <Shield className="w-8 h-8 text-brand-blue" />
        </div>
        <h2 className="text-base font-semibold text-gray-900 mb-2">Access Restricted</h2>
        <p className="text-sm text-gray-500 max-w-sm">Usage History is only accessible to Tenant Admins.</p>
      </div>
    );
  }

  // ── Load pool status & summary ────────────────────────────────────────────
  const loadPoolData = useCallback(async () => {
    const seq = ++poolSeqRef.current;
    const isStale = () => seq !== poolSeqRef.current;
    setIsLoadingPools(true);
    try {
      const days = Math.max(1, Math.ceil((dateEnd.getTime() - dateStart.getTime()) / (1000 * 60 * 60 * 24)));
      const [poolsRes, summaryRes, dashRes, limitsRes] = await Promise.all([
        unitPoolService.getPoolStatus(),
        unitPoolService.getUsageSummary(days),
        dashboardService.getDashboard().catch(() => null),
        featurePermissionService.getUserLimits().catch(() => null),
      ]);
      if (isStale()) return;
      setPools(poolsRes);
      setSummary(summaryRes);
      if (dashRes?.subscription_units) setSubscriptionUnits(dashRes.subscription_units);
      if (limitsRes) setUserLimits(limitsRes);
    } catch (err: any) {
      if (isStale()) return;
      toast.error(err.message || 'Failed to load pool data');
    } finally {
      if (!isStale()) setIsLoadingPools(false);
    }
  }, [dateStart, dateEnd]);

  // ── Load consumption history ───────────────────────────────────────────────
  const loadConsumption = useCallback(async (page: number, mode: 'feature' | 'user' = 'feature') => {
    const seq = ++consumptionSeqRef.current;
    const isStale = () => seq !== consumptionSeqRef.current;
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
      if (isStale()) return;
      setConsumptionItems(res.items);
      setExistingUsers(res.users || []);
      setConsumptionTotal(mode === 'user' ? (res.users?.length ?? res.items.length) : res.total);
    } catch (err: any) {
      if (isStale()) return;
      toast.error(err.message || 'Failed to load consumption history');
    } finally {
      if (!isStale()) setIsLoadingConsumption(false);
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

  const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
    { id: 'user', label: 'User-Wise', icon: User },
    { id: 'team', label: 'Team-Wise', icon: Users },
  ];

  return (
    // Card, breadcrumb, organization tabs and the tab panel come from
    // app/(dashboard)/organization/layout.tsx — this renders the panel's content.
    <div ref={rootRef} className="space-y-6">
      {/* ── Page Header ── */}
      <PageHeader
        icon={<TrendingDown className="h-5 w-5" />}
        title="Usage History"
        description="Comprehensive feature-wise, user-wise, and team-wise consumption tracking for your organization."
        actions={
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="secondary"
              onClick={handleRefresh}
              disabled={isRefreshing}
              icon={<RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              onClick={() => setShowExportModal(true)}
              icon={<Download className="w-4 h-4" />}
            >
              Export
            </Button>
          </div>
        }
      />

      {/* ── Feature Analytics Cards ── */}
      <AnalyticsCards
        pools={isLoadingPools ? null : pools}
        summary={summary}
        subscriptionUnits={subscriptionUnits}
        userLimits={userLimits}
      />

      {/* ── Filters + view toggle + table: one card ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Toolbar: filters left, User-Wise / Team-Wise toggle right */}
        <div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
            {/* Quick Period */}
            <label className="flex items-center gap-2 text-sm font-medium text-gray-600">
              Period
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
                className="h-9 flex-1 sm:flex-none text-sm font-normal border border-gray-200 rounded-lg px-3 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue transition-all hover:border-brand-blue/40"
              >
                <option value="">All Time</option>
                <option value="last_week">Last Week</option>
                <option value="last_month">Last Month</option>
                <option value="last_quarter">Last Quarter</option>
                <option value="last_year">Last Year</option>
              </select>
            </label>

            {/* Date Range */}
            <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
              <span>From</span>
              <DateField
                aria-label="From date"
                value={startDateInput}
                max={endDateInput || defaultEndDate}
                onChange={(v) => { setStartDateInput(v); setQuickPeriod(''); }}
                className="flex-1 sm:flex-none sm:w-[150px]"
              />
              <span>To</span>
              <DateField
                aria-label="To date"
                value={endDateInput}
                min={startDateInput || undefined}
                max={defaultEndDate}
                onChange={(v) => { setEndDateInput(v); setQuickPeriod(''); }}
                className="flex-1 sm:flex-none sm:w-[150px]"
              />
            </div>

            {/* Status */}
            {(activeTab === 'feature') && (
              <label className="flex items-center gap-2 text-sm font-medium text-gray-600">
                Status
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="h-9 flex-1 sm:flex-none text-sm font-normal border border-gray-200 rounded-lg px-3 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue transition-all hover:border-brand-blue/40"
                >
                  <option value="all">All Statuses</option>
                  <option value="SUCCESS">Success</option>
                  <option value="FAILED">Failed</option>
                  <option value="INSUFFICIENT_UNITS">Insufficient Units</option>
                  <option value="ABANDONED">Abandoned</option>
                  <option value="INTERRUPTED">Interrupted</option>
                </select>
              </label>
            )}
          </div>

          {/* View toggle — the sliding white tile from Resume Scoring's "View by"
              toggle: equal halves on one track, the tile slides under the
              active one. */}
          <div
            role="radiogroup"
            aria-label="Usage view"
            className="relative grid grid-cols-2 h-[38px] p-1 rounded-lg bg-brand-blue/5 ring-1 ring-brand-blue/10 self-start lg:self-auto shrink-0"
          >
            <span
              aria-hidden
              className={`absolute top-1 bottom-1 left-1 w-[calc(50%-0.25rem)] rounded-md bg-white dark:bg-slate-800 shadow-sm shadow-brand-blue/15 ring-1 ring-brand-blue/10 transition-transform duration-300 ease-out ${
                activeTab === TABS[1].id ? 'translate-x-full' : 'translate-x-0'
              }`}
            />
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative z-10 inline-flex items-center justify-center gap-1.5 px-4 rounded-md text-sm font-medium whitespace-nowrap transition-colors duration-300 ${
                    isActive ? 'text-brand-blue' : 'text-gray-600 dark:text-slate-400 hover:text-brand-blue'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
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
  );
}
