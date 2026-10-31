'use client';

import Link from 'next/link';
import {
  Activity,
  Archive,
  ArrowUpRight,
  Briefcase,
  CheckCircle,
  Edit2,
  LogIn,
  LogOut,
  Sparkles,
  Star,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import type { RecentActivity } from '@/lib/services/dashboardService';

interface Props {
  loading: boolean;
  items: RecentActivity[] | null;
}

interface ActivityVisual {
  Icon: LucideIcon;
  accent: string; // bg + ring classes
  iconColor: string;
}

// Mirror of the action → icon/accent mapping the existing EnhancedDashboard
// uses, so activity items here look consistent with the rest of the app.
function visualFor(action: string): ActivityVisual {
  if (action.includes('login')) return { Icon: LogIn, accent: 'bg-brand-blue/10 ring-brand-blue/15', iconColor: 'text-brand-blue' };
  if (action.includes('logout')) return { Icon: LogOut, accent: 'bg-gray-50 ring-gray-100', iconColor: 'text-gray-500' };
  if (action.includes('jd_create') || action.includes('jd_publish')) return { Icon: Briefcase, accent: 'bg-green-50 ring-green-100', iconColor: 'text-green-600' };
  if (action.includes('jd_update')) return { Icon: Edit2, accent: 'bg-brand-orange/10 ring-brand-orange/15', iconColor: 'text-brand-orange' };
  if (action.includes('jd_archive')) return { Icon: Archive, accent: 'bg-gray-50 ring-gray-100', iconColor: 'text-gray-500' };
  if (action.includes('resume_upload')) return { Icon: Upload, accent: 'bg-brand-cyan/10 ring-brand-cyan/15', iconColor: 'text-brand-cyan' };
  if (action.includes('scoring')) return { Icon: Star, accent: 'bg-brand-orange/10 ring-brand-orange-deep/15', iconColor: 'text-brand-orange-deep' };
  if (action.includes('assessment')) return { Icon: CheckCircle, accent: 'bg-brand-teal/10 ring-brand-teal/15', iconColor: 'text-brand-teal' };
  if (action.includes('ai_match')) return { Icon: Sparkles, accent: 'bg-brand-blue-2/10 ring-brand-blue-2/15', iconColor: 'text-brand-blue-2' };
  return { Icon: Activity, accent: 'bg-gray-50 ring-gray-100', iconColor: 'text-gray-400' };
}

/**
 * Recent activity — clean list with action-typed icon chips. Each row shows
 * "<actor> · <action>" + a one-line detail (if any) + a relative timestamp.
 * Skeleton while loading, an inviting empty state otherwise.
 */
export default function DashboardRecentActivity({ loading, items }: Props) {
  const visible = (items ?? []).slice(0, 6);

  return (
    <section
      aria-label="Recent activity"
      className="flex flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-sm ring-1 ring-black/[0.02] dark:border-slate-700 dark:bg-slate-900 dark:ring-white/[0.02] sm:p-6"
    >
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900 dark:text-slate-50">Recent Activity</h2>
          <p className="mt-0.5 tf-meta">What&apos;s happened across your workspace.</p>
        </div>
        <Link
          href="/audits/activity"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-blue hover:underline"
        >
          View all
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </header>

      {loading ? (
        <ul className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex items-start gap-3">
              <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
              <div className="flex-1 space-y-1.5 pt-1.5">
                <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-2.5 w-1/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            </li>
          ))}
        </ul>
      ) : visible.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-10 text-center">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15">
            <Activity className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-gray-700 dark:text-slate-300">No recent activity yet</p>
          <p className="mt-0.5 max-w-[220px] tf-meta">
            Your team&apos;s actions will show up here as they happen.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((a) => {
            const { Icon, accent, iconColor } = visualFor(a.action || '');
            const detail = a.details as Record<string, unknown> | null;
            const detailText =
              (detail?.title as string | undefined) ||
              (detail?.name as string | undefined) ||
              (detail?.email as string | undefined) ||
              (detail?.candidate_name as string | undefined) ||
              (detail?.jd_number as string | undefined) ||
              undefined;
            return (
              <li key={a.id} className="group flex items-start gap-3 rounded-xl px-1 py-1.5 transition-colors hover:bg-gray-50/60 dark:hover:bg-slate-800/60">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ${accent}`}>
                  <Icon className={`h-4 w-4 ${iconColor}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-gray-800 dark:text-slate-300">
                    <span className="font-medium text-gray-900 dark:text-slate-50">{a.user_name || 'System'}</span>
                    <span className="text-gray-500 dark:text-slate-500"> · {a.action_display || a.action}</span>
                  </p>
                  {detailText && (
                    <p className="truncate text-2xs text-gray-500 dark:text-slate-500">{detailText}</p>
                  )}
                  <p className="mt-0.5 text-2xs text-gray-400 dark:text-slate-600">{a.time_ago}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
