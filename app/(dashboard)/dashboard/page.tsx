'use client';

/**
 * Dashboard — every widget on this page is wired to a real API field.
 *
 *   useAuth()                              → profile banner, role, tenant, plan
 *   dashboardService.getDashboard()        → stats, subscription_units,
 *                                            recent_activity, jd_recent_activity,
 *                                            user_recent_activity
 *   aiInterviewService.getStats()          → interview totals & avg score
 *
 * Today's-focus items are *derived* from those real numbers — no synthesized
 * data, no seeded curves. Sections appear with skeletons while loading and
 * honest empty states when there's nothing to show.
 *
 * Future-need endpoints (backend tickets):
 *   - GET /dashboard/series?metric=X&days=N  → real sparklines, real trends
 *   - GET /ai-interviews/upcoming?limit=5    → calendar-style next interviews
 *   - GET /dashboard/jds/performance         → per-JD funnel breakdown
 *   - GET /notifications/recent              → bell-feed surfaced on dashboard
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  Briefcase,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Gauge,
  Layers3,
  Mail,
  Plus,
  Shield,
  Sparkles,
  Star,
  UserCircle2,
  Users,
  Video,
  Zap,
  type LucideIcon,
} from 'lucide-react';
import DashboardQuickAccess from '@/components/dashboard/DashboardQuickAccess';
import { useAuth } from '@/lib/hooks/useAuth';
import {
  dashboardService,
  type DashboardResponse,
  type RecentActivity,
  type SubscriptionUnits,
  type UnitAvailability,
} from '@/lib/services/dashboardService';
import { aiInterviewService, type AIInterviewStatsResponse } from '@/lib/services/aiInterviewService';

const ROLE_LABELS: Record<string, string> = {
  tenant_admin: 'Owner',
  recruiter: 'Recruiter',
  billing_manager: 'Billing Manager',
  viewer: 'Viewer',
  standard_user: 'Standard User',
};

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatLongDate(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatShortDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(value?: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffMs = date.getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function extractFirstName(value?: string | null): string {
  if (!value) return 'there';
  return value.split(/[\s@]/)[0] || 'there';
}

function userInitials(name?: string | null, email?: string | null): string {
  const source = (name || email || 'U').trim();
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '--';
  return value.toLocaleString();
}

function extractDetail(activity: RecentActivity): string | null {
  const details = activity.details as Record<string, string | undefined> | null;
  return (
    details?.title ||
    details?.name ||
    details?.email ||
    details?.candidate_name ||
    details?.jd_title ||
    details?.jd_number ||
    activity.entity_type
  );
}

function activityAppearance(action: string): { icon: LucideIcon; accent: string } {
  if (action.includes('jd') || action.includes('job')) {
    return { icon: Briefcase, accent: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/15' };
  }
  if (action.includes('resume') || action.includes('scoring')) {
    return { icon: FileText, accent: 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/15' };
  }
  if (action.includes('assessment')) {
    return { icon: ClipboardList, accent: 'bg-brand-orange/10 text-brand-orange ring-brand-orange/15' };
  }
  if (action.includes('interview') || action.includes('ai_match')) {
    return { icon: Sparkles, accent: 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/15' };
  }
  if (action.includes('login') || action.includes('logout')) {
    return { icon: UserCircle2, accent: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-500 ring-slate-200 dark:ring-slate-700' };
  }
  return { icon: Layers3, accent: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-500 ring-slate-200 dark:ring-slate-700' };
}

function normalizeUnits(units: SubscriptionUnits | null | undefined): Array<{
  key: string;
  label: string;
  icon: LucideIcon;
  value: UnitAvailability;
  accent: string;
}> {
  if (!units) return [];
  const defs = [
    { key: 'RU', label: 'Resume storage', icon: FileText, accent: 'bg-brand-blue' },
    { key: 'RS', label: 'Resume scoring', icon: Star, accent: 'bg-brand-cyan' },
    { key: 'AS', label: 'Assessments', icon: ClipboardList, accent: 'bg-brand-orange' },
    { key: 'AIU', label: 'AI interviews', icon: Video, accent: 'bg-brand-blue' },
  ];
  return defs.flatMap((def) => {
    const value = units[def.key];
    if (!value) return [];
    return [{ ...def, value }];
  });
}

function quotaStatus(percent: number): { label: string; tone: string } {
  if (percent >= 90) return { label: 'Critical', tone: 'bg-brand-orange/10 text-brand-orange ring-brand-orange/20' };
  if (percent >= 75) return { label: 'Watch', tone: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 ring-slate-200 dark:ring-slate-700' };
  return { label: 'Healthy', tone: 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/15' };
}

function SectionShell({
  eyebrow,
  title,
  description,
  children,
  action,
  className,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.08)] sm:p-6 ${className ?? ''}`}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{eyebrow}</p>
          <h2 className="mt-1.5 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50">{title}</h2>
          {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-500">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

interface AreaChartProps {
  buckets: Array<{ label: string; value: number }>;
  stroke: string;
  fillFrom: string;
  fillTo: string;
}

function AreaChart({ buckets, stroke, fillFrom, fillTo }: AreaChartProps) {
  const width = 600;
  const height = 160;
  const padding = { left: 8, right: 8, top: 12, bottom: 22 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const max = Math.max(...buckets.map((b) => b.value), 1);
  const stepX = innerW / Math.max(buckets.length - 1, 1);

  const points = buckets.map((b, i) => {
    const x = padding.left + i * stepX;
    const y = padding.top + innerH - (b.value / max) * innerH;
    return { x, y, ...b };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const areaPath = `${linePath} L${padding.left + innerW},${padding.top + innerH} L${padding.left},${padding.top + innerH} Z`;
  const gradId = `ag-${Math.abs(buckets.reduce((a, b) => a + b.value, 0) || 1)}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillFrom} stopOpacity="0.45" />
          <stop offset="100%" stopColor={fillTo} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.5, 1].map((g) => {
        const y = padding.top + innerH - g * innerH;
        return (
          <line
            key={g}
            x1={padding.left}
            y1={y}
            x2={padding.left + innerW}
            y2={y}
            stroke="#e2e8f0"
            strokeWidth="1"
            strokeDasharray={g === 1 ? '0' : '3,3'}
          />
        );
      })}
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p) => (
        <circle key={`pt-${p.label}`} cx={p.x} cy={p.y} r="3" fill="white" stroke={stroke} strokeWidth="1.5" />
      ))}
      {points.map((p, i) =>
        i % Math.max(1, Math.floor(points.length / 7)) === 0 || i === points.length - 1 ? (
          <text
            key={`label-${p.label}`}
            x={p.x}
            y={height - 6}
            textAnchor="middle"
            fontSize="9"
            fill="#94a3b8"
            fontFamily="ui-sans-serif, system-ui"
          >
            {p.label}
          </text>
        ) : null,
      )}
    </svg>
  );
}

interface FunnelDonutProps {
  segments: Array<{ label: string; value: number; color: string }>;
  centerLabel: string;
  centerValue: string;
}

function FunnelDonut({ segments, centerLabel, centerValue }: FunnelDonutProps) {
  const total = segments.reduce((a, b) => a + b.value, 0) || 1;
  const size = 120;
  const center = size / 2;
  const radius = 42;
  const stroke = 12;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  return (
    <div className="relative flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden>
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
        {segments.map((seg) => {
          const length = (seg.value / total) * circumference;
          const dashArray = `${length} ${circumference - length}`;
          const el = (
            <circle
              key={seg.label}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={stroke}
              strokeDasharray={dashArray}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${center} ${center})`}
            />
          );
          offset += length;
          return el;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <p className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-50 tabular-nums">{centerValue}</p>
        <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">{centerLabel}</p>
      </div>
    </div>
  );
}

interface KpiCardProps {
  label: string;
  value: number | null;
  note: string;
  icon: LucideIcon;
  accent: string;
  bar: string;
  loading: boolean;
  trendValue?: string;
  href?: string;
}

function KpiCard({ label, value, note, icon: Icon, accent, bar, loading, trendValue, href }: KpiCardProps) {
  const Wrapper: React.ElementType = href ? Link : 'div';
  const wrapperProps = href ? { href } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className="group relative overflow-hidden rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_20px_-12px_rgba(15,23,42,0.15)]"
    >
      <span className={`absolute inset-x-0 top-0 h-0.5 ${bar} opacity-80`} />
      <div className="flex items-start justify-between gap-2">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ring-1 ${accent}`}>
          <Icon className="h-4 w-4" />
        </div>
        {trendValue && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-slate-700">
            {trendValue}
          </span>
        )}
      </div>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{label}</p>
      <p className="mt-0.5 text-xl font-semibold leading-tight tracking-tight text-slate-900 dark:text-slate-50 tabular-nums">
        {loading ? <span className="inline-block h-6 w-14 animate-pulse rounded bg-slate-100 dark:bg-slate-800" /> : formatCompactNumber(value)}
      </p>
      <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-500">{note}</p>
    </Wrapper>
  );
}

export default function DashboardPage() {
  const { user, tenant, hasPermission, isTenantAdmin } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardResponse | null>(null);
  const [interviewStats, setInterviewStats] = useState<AIInterviewStatsResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const [dashboardRes, interviewRes] = await Promise.allSettled([
        dashboardService.getDashboard(),
        aiInterviewService.getStats(),
      ]);

      if (cancelled) return;

      if (dashboardRes.status === 'fulfilled') {
        setDashboardData(dashboardRes.value);
      } else {
        setError('We could not load some workspace data. Some widgets may be empty.');
      }
      if (interviewRes.status === 'fulfilled') {
        setInterviewStats(interviewRes.value);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ───── Identity (from useAuth — already in context, no API call) ─────
  const firstName = extractFirstName(user?.name || user?.email);
  const displayName = user?.name || firstName;
  const initials = userInitials(user?.name, user?.email);
  const roleLabel = ROLE_LABELS[user?.role || ''] || 'Member';
  const tenantName = tenant?.name || user?.tenantName || null;
  const planName = tenant?.subscription?.planName || null;
  const renewalLabel = formatShortDate(tenant?.subscription?.renewalDate);
  const renewalDays = daysUntil(tenant?.subscription?.renewalDate);
  const lastLoginLabel = formatShortDate(user?.lastLogin);
  const memberSinceLabel = formatShortDate(user?.createdAt);

  // ───── Stats (from /dashboard) ─────
  const stats = dashboardData?.stats;
  const recentActivity = dashboardData?.recent_activity ?? [];
  const userRecentActivity = dashboardData?.user_recent_activity ?? [];
  const jdActivity = dashboardData?.jd_recent_activity ?? [];
  const units = useMemo(() => normalizeUnits(dashboardData?.subscription_units), [dashboardData?.subscription_units]);

  // ───── Interview stats (from /ai-interviews/stats) ─────
  const interviewTotal = interviewStats?.total_interviews ?? null;
  const interviewCompleted = interviewStats?.completed ?? 0;
  const interviewScheduled = interviewStats?.scheduled ?? 0;
  const interviewInProgress = interviewStats?.in_progress ?? 0;
  const interviewAvgScore = interviewStats?.average_score ?? null;
  const candidatesInvited = interviewStats?.candidates_invited ?? 0;

  // ───── Derived (from real numbers above; no synthesis) ─────
  const assessmentCompletion =
    stats?.total_assessments && stats.total_assessments > 0
      ? Math.min(100, Math.round(((stats.assessment_completed_count ?? 0) / stats.total_assessments) * 100))
      : 0;
  const interviewCompletion =
    interviewTotal && interviewTotal > 0 ? Math.min(100, Math.round((interviewCompleted / interviewTotal) * 100)) : 0;

  // ───── Resume inflow buckets — bucket recent_activity by day ─────
  // Only as much history as the API returns; older days stay 0 honestly.
  const inflowBuckets = useMemo(() => {
    const days = 14;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const buckets: Array<{ label: string; value: number; iso: string }> = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      buckets.push({
        label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        value: 0,
        iso: d.toISOString().slice(0, 10),
      });
    }
    const all = [...recentActivity, ...userRecentActivity];
    for (const a of all) {
      const action = a.action ?? '';
      if (!action.includes('resume') && !action.includes('upload')) continue;
      const iso = a.created_at?.slice(0, 10);
      const bucket = buckets.find((b) => b.iso === iso);
      if (bucket) bucket.value += 1;
    }
    return buckets;
  }, [recentActivity, userRecentActivity]);
  const inflowHasData = inflowBuckets.some((b) => b.value > 0);

  // ───── Today's focus — derived from real stats only ─────
  const focusItems: Array<{
    id: string;
    title: string;
    description: string;
    icon: LucideIcon;
    href: string;
    accent: string;
    urgency: 'high' | 'medium' | 'low';
  }> = [];

  if ((stats?.draft_jds ?? 0) > 0) {
    focusItems.push({
      id: 'draft-jds',
      title: `${stats?.draft_jds} draft ${stats?.draft_jds === 1 ? 'job' : 'jobs'} pending publish`,
      description: 'Finalize and publish drafts to start receiving candidates.',
      icon: Briefcase,
      href: '/recruitment/job-openings?status=draft',
      accent: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/15',
      urgency: 'high',
    });
  }
  if (interviewScheduled > 0) {
    focusItems.push({
      id: 'scheduled-interviews',
      title: `${interviewScheduled} ${interviewScheduled === 1 ? 'interview' : 'interviews'} scheduled`,
      description: 'Review upcoming AI interviews before they start.',
      icon: Video,
      href: '/recruitment/ai-interviews',
      accent: 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/15',
      urgency: 'high',
    });
  }
  if (interviewInProgress > 0) {
    focusItems.push({
      id: 'in-progress-interviews',
      title: `${interviewInProgress} ${interviewInProgress === 1 ? 'interview' : 'interviews'} in progress`,
      description: 'Active interview sessions — monitor as needed.',
      icon: Activity,
      href: '/recruitment/ai-interviews',
      accent: 'bg-brand-orange/10 text-brand-orange ring-brand-orange/15',
      urgency: 'medium',
    });
  }
  if ((stats?.total_assessments ?? 0) > 0 && assessmentCompletion < 60) {
    focusItems.push({
      id: 'assessment-completion',
      title: `Assessment completion at ${assessmentCompletion}%`,
      description: 'Nudge candidates with pending assessments to finish their sessions.',
      icon: ClipboardList,
      href: '/recruitment/assessments',
      accent: 'bg-brand-orange/10 text-brand-orange ring-brand-orange/15',
      urgency: 'medium',
    });
  }
  if (renewalDays !== null && renewalDays >= 0 && renewalDays <= 14) {
    focusItems.push({
      id: 'renewal-soon',
      title: `Plan renews in ${renewalDays} day${renewalDays === 1 ? '' : 's'}`,
      description: `${planName ?? 'Workspace plan'} renews on ${renewalLabel}.`,
      icon: Zap,
      href: '/subscription/current-plan',
      accent: 'bg-brand-orange/10 text-brand-orange ring-brand-orange/15',
      urgency: 'medium',
    });
  }

  // ───── KPI definitions (real fields only) ─────
  // const metricCards: KpiCardProps[] = [
  //   {
  //     label: 'Active jobs',
  //     value: stats?.active_jds ?? null,
  //     note:
  //       typeof stats?.draft_jds === 'number' && stats.draft_jds > 0
  //         ? `${stats.draft_jds} draft in progress`
  //         : 'Published roles in market',
  //     icon: Briefcase,
  //     accent: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/15',
  //     bar: 'bg-brand-blue',
  //     loading,
  //     trendValue:
  //       typeof stats?.draft_jds === 'number' && stats.draft_jds > 0 ? `${stats.draft_jds} drafts` : undefined,
  //     href: '/recruitment/job-openings',
  //   },
  //   {
  //     label: 'Resume volume',
  //     value: stats?.total_resumes ?? null,
  //     note:
  //       typeof stats?.resumes_this_week === 'number'
  //         ? `${stats.resumes_this_week} added this week`
  //         : 'Candidate inventory',
  //     icon: FileText,
  //     accent: 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/15',
  //     bar: 'bg-brand-cyan',
  //     loading,
  //     trendValue:
  //       typeof stats?.resumes_this_week === 'number' && stats.resumes_this_week > 0
  //         ? `+${stats.resumes_this_week} 7d`
  //         : undefined,
  //     href: '/recruitment/my-resumes',
  //   },
  //   {
  //     label: 'Assessments',
  //     value: stats?.total_assessments ?? null,
  //     note:
  //       typeof stats?.assessment_completed_count === 'number'
  //         ? `${stats.assessment_completed_count} completed`
  //         : 'Evaluation workflow',
  //     icon: ClipboardList,
  //     accent: 'bg-brand-orange/10 text-brand-orange ring-brand-orange/15',
  //     bar: 'bg-brand-orange',
  //     loading,
  //     trendValue: assessmentCompletion > 0 ? `${assessmentCompletion}%` : undefined,
  //     href: '/recruitment/assessments',
  //   },
  //   {
  //     label: 'AI interviews',
  //     value: interviewTotal,
  //     note:
  //       interviewCompleted > 0
  //         ? `${interviewCompleted} completed`
  //         : interviewTotal && interviewTotal > 0
  //           ? 'Pipeline live'
  //           : 'Ready to schedule',
  //     icon: Video,
  //     accent: 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/15',
  //     bar: 'bg-brand-cyan',
  //     loading,
  //     trendValue: interviewScheduled > 0 ? `${interviewScheduled} upcoming` : undefined,
  //     href: '/recruitment/ai-interviews',
  //   },
  // ];

  // ───── Pipeline (real values only) ─────
  const pipelineSteps = [
    { key: 'resumes', label: 'Resumes', value: stats?.total_resumes ?? 0, color: '#0f3c99' },
    { key: 'scoring', label: 'Scoring runs', value: stats?.total_scorings ?? 0, color: '#079cc4' },
    { key: 'assessments', label: 'Assessments', value: stats?.total_assessments ?? 0, color: '#ed881c' },
    { key: 'interviews', label: 'AI interviews', value: interviewTotal ?? 0, color: '#334155' },
  ];
  const pipelineMax = Math.max(...pipelineSteps.map((s) => s.value), 1);
  const pipelineTotal = pipelineSteps.reduce((a, b) => a + b.value, 0);

  // CTAs (gated by real permissions)
  const featuredActions = [
    { label: 'Create job', href: '/recruitment/jd-creation', visible: isTenantAdmin || hasPermission('canCreateJD'), primary: true, icon: Plus },
  ].filter((item) => item.visible);

  return (
    // NOTE: no `overflow-hidden` here — on a `flex-1` item it zeroes the
    // automatic `min-height`, which clips content below the fold and breaks
    // vertical scrolling (the layout's scroll container can never see overflow).
    <div className="relative flex-1">
      {/* parent layout bg removed — inner card provides the surface */}

      <div className="mx-auto w-full max-w-[1400px]">
      <div className="p-3 sm:p-4 md:p-8 w-full space-y-4 md:space-y-6">
        {/* Optional error banner — only if /dashboard failed entirely */}
        {error && (
          <div className="rounded-2xl border border-brand-orange/20 bg-brand-orange/10 px-4 py-3 text-sm text-brand-orange">
            {error}
          </div>
        )}

        <div className="space-y-4 md:space-y-6">
        {/* ── PROFILE BANNER ── useAuth only ──────────────────────────── */}
        <section className="relative overflow-hidden rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)] transition-shadow hover:shadow-[0_4px_8px_rgba(15,23,42,0.06),0_16px_40px_-12px_rgba(15,23,42,0.18)] md:px-8 md:py-6">
          {/* Identity row: avatar + name+text (left) · CTAs (center) · illustration (right) */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              {/* Avatar — solid rounded square */}
              <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-2xl bg-brand-blue text-base font-semibold text-white shadow-md shadow-brand-blue/20 ring-1 ring-white/20">
                {user?.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </div>

              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-500">
                  {timeOfDayGreeting()},
                </p>
                <div className="mt-0.5 flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-[28px]">
                    {displayName}
                  </h1>
                  {isTenantAdmin && (
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-blue/10 px-2.5 py-0.5 text-[11px] font-semibold text-brand-blue ring-1 ring-brand-blue/15">
                      <BadgeCheck className="h-3 w-3" />
                      Owner
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-500">
                  Streamline your hiring and build the perfect team.
                </p>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-2 md:mr-32 lg:mr-40">
              {featuredActions.map((item) => {
                const ItemIcon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      item.primary
                        ? 'inline-flex items-center gap-2 rounded-xl bg-brand-blue px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-blue/20 transition-colors hover:opacity-90'
                        : 'inline-flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 transition-colors hover:border-brand-blue/30 hover:text-brand-blue'
                    }
                  >
                    <ItemIcon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Decorative illustration — hidden on small screens, anchored to right edge */}
          <div aria-hidden className="pointer-events-none absolute -right-2 top-1/2 hidden -translate-y-1/2 md:block">
            <svg width="180" height="140" viewBox="0 0 180 140" fill="none" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="cardGrad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#EEF2FF" />
                  <stop offset="100%" stopColor="#E0E7FF" />
                </linearGradient>
                <linearGradient id="barA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#A5B4FC" />
                  <stop offset="100%" stopColor="#6366F1" />
                </linearGradient>
                <linearGradient id="barB" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#C7D2FE" />
                  <stop offset="100%" stopColor="#818CF8" />
                </linearGradient>
              </defs>
              <rect x="20" y="20" width="140" height="100" rx="14" fill="url(#cardGrad)" stroke="#C7D2FE" strokeWidth="1"/>
              <circle cx="32" cy="32" r="2" fill="#FCA5A5" />
              <circle cx="40" cy="32" r="2" fill="#FCD34D" />
              <circle cx="48" cy="32" r="2" fill="#86EFAC" />
              <rect x="32" y="80" width="14" height="28" rx="3" fill="url(#barB)" />
              <rect x="52" y="68" width="14" height="40" rx="3" fill="url(#barA)" />
              <rect x="72" y="56" width="14" height="52" rx="3" fill="url(#barB)" />
              <rect x="92" y="44" width="14" height="64" rx="3" fill="url(#barA)" />
              <circle cx="128" cy="56" r="9" fill="#FB7185" opacity="0.85"/>
              <circle cx="140" cy="70" r="6" fill="#FCD34D" opacity="0.9"/>
              <circle cx="148" cy="108" r="14" fill="#34D399" stroke="#fff" strokeWidth="2"/>
              <path d="M142 108 L146 112 L154 104" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>
        </section>

        {/* ── QUICK ACCESS — categorized navigation hub ── */}
        <DashboardQuickAccess />
        </div>

        {/* ── KPI ROW ── real fields only ─────────────────────────────── */}
        {/* <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((card) => (
            <KpiCard key={card.label} {...card} />
          ))}
        </div> */}

        {/* ── FUNNEL + CAPACITY ── stats + subscription_units ─────────── */}
        {/* <div className="grid gap-6 xl:grid-cols-[1.3fr_0.9fr]">
          <SectionShell
            eyebrow="Pipeline"
            title="Recruitment funnel"
            description="Real candidate flow across each workflow stage."
            action={
              <Link href="/audits/activity" className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue hover:underline">
                See history
                <ArrowRight className="h-4 w-4" />
              </Link>
            }
          >
            {loading ? (
              <div className="grid gap-3 lg:grid-cols-[auto_1fr] lg:items-center">
                <div className="h-[120px] w-[120px] animate-pulse rounded-full bg-slate-100" />
                <div className="space-y-1.5">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100" />
                  ))}
                </div>
              </div>
            ) : pipelineTotal === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
                <Briefcase className="mx-auto h-6 w-6 text-slate-300" />
                <p className="mt-2 text-sm font-medium text-slate-700">No pipeline activity yet</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Create a job and add resumes — your funnel will populate as work happens.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[auto_1fr] lg:items-center">
                <div className="flex justify-center lg:justify-start">
                  <FunnelDonut
                    segments={pipelineSteps.map((s) => ({ label: s.label, value: s.value, color: s.color }))}
                    centerLabel="Total"
                    centerValue={formatCompactNumber(pipelineTotal)}
                  />
                </div>
                <div className="space-y-1.5">
                  {pipelineSteps.map((step, index) => {
                    const prev = index > 0 ? pipelineSteps[index - 1].value : null;
                    const conversion = prev !== null && prev > 0 ? `${Math.round((step.value / prev) * 100)}%` : '100%';
                    const ratio = Math.max(4, Math.round((step.value / pipelineMax) * 100));
                    return (
                      <div key={step.key} className="rounded-lg border border-slate-200/80 bg-slate-50/60 px-2.5 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: step.color }} />
                            <p className="text-xs font-semibold text-slate-900">{step.label}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-600 ring-1 ring-slate-200 tabular-nums">
                              {conversion}
                            </span>
                            <p className="w-10 text-right text-sm font-semibold text-slate-900 tabular-nums">
                              {step.value.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="mt-1.5 h-1 rounded-full bg-white ring-1 ring-slate-200/80">
                          <div className="h-1 rounded-full" style={{ width: `${ratio}%`, backgroundColor: step.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!loading && pipelineTotal > 0 && (
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200/80 bg-white p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Weekly inflow</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">
                    {formatCompactNumber(stats?.resumes_this_week ?? null)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200/80 bg-white p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Assessment</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{assessmentCompletion}%</p>
                  <p className="text-[10px] text-slate-500">
                    {formatCompactNumber(stats?.assessment_completed_count ?? null)} /{' '}
                    {formatCompactNumber(stats?.total_assessments ?? null)}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200/80 bg-white p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Interview</p>
                  <p className="mt-1 text-lg font-semibold text-slate-900 tabular-nums">{interviewCompletion}%</p>
                  <p className="text-[10px] text-slate-500">
                    {formatCompactNumber(interviewCompleted)} / {formatCompactNumber(interviewTotal)}
                  </p>
                </div>
              </div>
            )}
          </SectionShell>

          <SectionShell
            eyebrow="Capacity"
            title="Plan & quota usage"
            description="Real consumption from subscription_units."
            action={
              <Link href="/subscription/usage-quotas" className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue hover:underline">
                Quotas
                <ArrowRight className="h-4 w-4" />
              </Link>
            }
          >
            <div className="space-y-2">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="rounded-lg border border-slate-200/80 bg-slate-50/60 p-2.5">
                    <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
                    <div className="mt-2 h-1.5 w-full animate-pulse rounded bg-slate-200" />
                  </div>
                ))
              ) : units.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center">
                  <Gauge className="mx-auto h-6 w-6 text-slate-300" />
                  <p className="mt-2 text-sm font-medium text-slate-700">No quota data</p>
                  <p className="mt-0.5 text-xs text-slate-500">Subscription unit data not available on your plan.</p>
                </div>
              ) : (
                units.map((item) => {
                  const ItemIcon = item.icon;
                  const percentage = item.value.is_unlimited
                    ? 0
                    : Math.min(100, Math.max(0, Math.round(item.value.percentage_used)));
                  const status = quotaStatus(percentage);
                  return (
                    <div key={item.key} className="rounded-lg border border-slate-200/80 bg-slate-50/60 px-2.5 py-2 transition-colors hover:bg-white">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="grid h-7 w-7 place-items-center rounded-md bg-white ring-1 ring-slate-200">
                            <ItemIcon className="h-3 w-3 text-slate-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-slate-900">{item.label}</p>
                            <p className="text-[10px] text-slate-500">
                              {item.value.is_unlimited
                                ? `${item.value.used.toLocaleString()} · unlimited`
                                : `${item.value.used.toLocaleString()} / ${item.value.limit.toLocaleString()}`}
                            </p>
                          </div>
                        </div>
                        {!item.value.is_unlimited && (
                          <span className={`inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ring-1 ${status.tone}`}>
                            {status.label}
                          </span>
                        )}
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1 flex-1 rounded-full bg-white ring-1 ring-slate-200">
                          <div
                            className={`h-1 rounded-full ${item.accent}`}
                            style={{ width: item.value.is_unlimited ? '28%' : `${percentage}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-medium tabular-nums text-slate-500">
                          {item.value.is_unlimited ? '∞' : `${percentage}%`}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </SectionShell>
        </div> */}

        {/* ── FOCUS + RESUME INFLOW ── derived + bucketed real data ───── */}
        {/* <div className="grid gap-6 xl:grid-cols-[0.9fr_1.3fr]">
          <SectionShell
            eyebrow="Today"
            title="Focus & action items"
            description="Derived directly from your real numbers."
          >
            {loading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : focusItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center">
                <CheckCircle2 className="mx-auto h-7 w-7 text-brand-cyan" />
                <p className="mt-2 text-sm font-medium text-slate-700">Nothing urgent right now</p>
                <p className="mt-1 text-xs text-slate-500">No drafts, no pending renewals, no stalled sessions.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {focusItems.slice(0, 5).map((item) => {
                  const ItemIcon = item.icon;
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="group flex items-start gap-3 rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 transition-[border-color,box-shadow,color,background-color] hover:border-brand-blue/30 hover:bg-slate-50/60"
                    >
                      <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${item.accent}`}>
                        <ItemIcon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-brand-blue">{item.title}</p>
                          {item.urgency === 'high' && (
                            <span className="rounded-full bg-brand-orange/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-orange ring-1 ring-brand-orange/20">
                              High
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{item.description}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-brand-blue" />
                    </Link>
                  );
                })}
              </div>
            )}
          </SectionShell>

          <SectionShell
            eyebrow="Trend"
            title="Resume inflow"
            description="Bucketed from real upload events. Older days outside the API window stay 0 honestly."
            action={
              inflowHasData ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-cyan/10 px-2.5 py-1 text-[11px] font-medium text-brand-cyan ring-1 ring-brand-cyan/15">
                  Peak {Math.max(...inflowBuckets.map((b) => b.value))} / day
                </span>
              ) : undefined
            }
          >
            {loading ? (
              <div className="h-[160px] w-full animate-pulse rounded-xl bg-slate-100" />
            ) : !inflowHasData ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-12 text-center">
                <FileText className="mx-auto h-7 w-7 text-slate-300" />
                <p className="mt-2 text-sm font-medium text-slate-700">No upload events in the recent window</p>
                <p className="mt-1 text-xs text-slate-500">
                  The chart fills as resumes are uploaded. Requires a backend time-series endpoint to extend beyond the activity window.
                </p>
              </div>
            ) : (
              <>
                <AreaChart buckets={inflowBuckets} stroke="#079cc4" fillFrom="#079cc4" fillTo="#079cc4" />
                <div className="mt-5 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Last 14 days</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">
                      {inflowBuckets.reduce((a, b) => a + b.value, 0)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">This week</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">
                      {formatCompactNumber(stats?.resumes_this_week ?? null)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Daily avg</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">
                      {(inflowBuckets.reduce((a, b) => a + b.value, 0) / Math.max(inflowBuckets.length, 1)).toFixed(1)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Best day</p>
                    <p className="mt-1 text-xl font-semibold text-slate-900 tabular-nums">
                      {Math.max(...inflowBuckets.map((b) => b.value))}
                    </p>
                  </div>
                </div>
              </>
            )}
          </SectionShell>
        </div> */}

        {/* ── ACTIVITY FEEDS ── recent_activity + user_recent_activity ── */}
        {/* <div className="grid gap-6 lg:grid-cols-2">
          <SectionShell
            eyebrow="Workspace"
            title="Recent activity"
            description="Every team action recorded in the activity log."
            action={
              <Link href="/audits/activity" className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue hover:underline">
                View all
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            }
          >
            <div className="h-[400px] overflow-y-auto pr-1">
              {loading ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 px-4 py-3">
                      <div className="h-9 w-9 animate-pulse rounded-lg bg-slate-200" />
                      <div className="flex-1 space-y-2 pt-1">
                        <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
                        <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
                    <Activity className="mx-auto h-7 w-7 text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-700">No recent activity yet</p>
                    <p className="mt-1 text-xs text-slate-500">Team actions will appear here as work happens.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentActivity.map((activity) => {
                    const visual = activityAppearance(activity.action || '');
                    const Icon = visual.icon;
                    return (
                      <div
                        key={activity.id}
                        className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 transition-all hover:border-brand-blue/30 hover:bg-slate-50/60"
                      >
                        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ring-1 ${visual.accent}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-slate-900">
                                {activity.user_name || 'System'}
                                <span className="font-normal text-slate-500"> · {activity.action_display}</span>
                              </p>
                              {extractDetail(activity) && (
                                <p className="truncate text-xs text-slate-500">{extractDetail(activity)}</p>
                              )}
                            </div>
                            <span className="whitespace-nowrap text-[11px] text-slate-400">{activity.time_ago}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </SectionShell>

          <SectionShell
            eyebrow="Your activity"
            title={`${firstName}'s timeline`}
            description="Only your own actions in this workspace."
          >
            <div className="h-[400px] overflow-y-auto pr-1">
              {loading ? (
                <div className="space-y-3">
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 px-4 py-3">
                      <div className="h-9 w-9 animate-pulse rounded-lg bg-slate-200" />
                      <div className="flex-1 space-y-2 pt-1">
                        <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
                        <div className="h-3 w-1/3 animate-pulse rounded bg-slate-200" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : userRecentActivity.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-6 py-10 text-center">
                    <UserCircle2 className="mx-auto h-7 w-7 text-slate-300" />
                    <p className="mt-2 text-sm font-medium text-slate-700">No personal activity yet</p>
                    <p className="mt-1 text-xs text-slate-500">Your own actions will show up here as you work.</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {userRecentActivity.map((activity) => {
                  const visual = activityAppearance(activity.action || '');
                  const Icon = visual.icon;
                  return (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3"
                    >
                      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ring-1 ${visual.accent}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{activity.action_display}</p>
                        {extractDetail(activity) && (
                          <p className="truncate text-xs text-slate-500">{extractDetail(activity)}</p>
                        )}
                        <p className="mt-0.5 text-[11px] text-slate-400">{activity.time_ago}</p>
                      </div>
                    </div>
                  );
                })}
                </div>
              )}
            </div>
          </SectionShell>
        </div> */}

        {/* ── JD ACTIVITY (only if backend returned any) ── */}
        {jdActivity.length > 0 && (
          <SectionShell
            eyebrow="Jobs"
            title="Recent JD updates"
            description="Latest changes to job descriptions."
            action={
              <Link href="/recruitment/job-openings" className="inline-flex items-center gap-1 text-sm font-medium text-brand-blue hover:underline">
                All jobs
                <ArrowUpRight className="h-4 w-4" />
              </Link>
            }
          >
            <div className="space-y-2">
              {jdActivity.slice(0, 5).map((item) => (
                <div key={item.id} className="flex items-start gap-3 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3">
                  <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15">
                    <Briefcase className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-50">{item.action_display}</p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-500">{item.jd_title || 'Job description update'}</p>
                  </div>
                  <span className="whitespace-nowrap text-[11px] text-slate-400 dark:text-slate-500">{item.time_ago}</span>
                </div>
              ))}
            </div>
          </SectionShell>
        )}
      </div>
      </div>
    </div>
  );
}
