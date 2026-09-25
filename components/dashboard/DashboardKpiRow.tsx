'use client';

import Link from 'next/link';
import { Briefcase, FileText, ClipboardList, Video, type LucideIcon } from 'lucide-react';

interface KpiDef {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  accent: string; // text + bg color class for the icon chip
  value: number | null;
  subtitle?: string; // contextual mini-line under the number
}

interface Props {
  loading: boolean;
  activeJobs: number | null;
  totalResumes: number | null;
  totalAssessments: number | null;
  totalInterviews: number | null;
  // Context for subtitles
  draftJobs?: number | null;
  resumesThisWeek?: number | null;
  assessmentsCompleted?: number | null;
}

/**
 * KPI strip — four monochrome white tiles, one bold number each. The subtitle
 * line under the number turns the raw figure into a small story
 * ("+3 this week", "5 drafts", etc.).
 */
export default function DashboardKpiRow({
  loading,
  activeJobs,
  totalResumes,
  totalAssessments,
  totalInterviews,
  draftJobs,
  resumesThisWeek,
  assessmentsCompleted,
}: Props) {
  const kpis: KpiDef[] = [
    {
      id: 'jobs',
      label: 'Active Jobs',
      href: '/recruitment/job-openings?status=published',
      icon: Briefcase,
      accent: 'text-brand-blue bg-brand-blue/10 ring-brand-blue/15',
      value: activeJobs,
      subtitle: draftJobs && draftJobs > 0 ? `${draftJobs} draft${draftJobs === 1 ? '' : 's'}` : undefined,
    },
    {
      id: 'resumes',
      label: 'Resumes',
      href: '/recruitment/resume-database?tab=my-resumes',
      icon: FileText,
      accent: 'text-brand-cyan bg-brand-cyan/10 ring-brand-cyan/15',
      value: totalResumes,
      subtitle:
        typeof resumesThisWeek === 'number'
          ? resumesThisWeek > 0
            ? `+${resumesThisWeek} this week`
            : 'No new this week'
          : undefined,
    },
    {
      id: 'assessments',
      label: 'Assessments',
      href: '/recruitment/assessments',
      icon: ClipboardList,
      accent: 'text-brand-orange-deep bg-brand-orange/10 ring-brand-orange/15',
      value: totalAssessments,
      subtitle:
        typeof assessmentsCompleted === 'number' && assessmentsCompleted > 0
          ? `${assessmentsCompleted} completed`
          : undefined,
    },
    {
      id: 'interviews',
      label: 'AI Interviews',
      href: '/recruitment/ai-interviews',
      icon: Video,
      accent: 'text-emerald-600 bg-emerald-50 ring-emerald-100',
      value: totalInterviews,
      subtitle: totalInterviews === 0 ? 'None scheduled' : undefined,
    },
  ];

  return (
    /* No bottom margin of its own — the dashboard stacks its sections with
       `space-y`, and a `mb-6` here would add a second gap under this one. */
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {kpis.map((k) => {
        const Icon = k.icon;
        return (
          <Link
            key={k.id}
            href={k.href}
            className="group flex items-center gap-4 rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm ring-1 ring-black/[0.02] transition-[border-color,box-shadow,color,background-color] hover:border-brand-blue/30 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:ring-white/[0.02] sm:px-5 sm:py-5"
          >
            <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${k.accent}`}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-2xs font-medium uppercase tracking-wider text-gray-500 dark:text-slate-500">{k.label}</p>
              <p className="mt-0.5 text-2xl font-semibold tracking-tight text-gray-900 tabular-nums dark:text-slate-50 sm:text-[1.875rem]">
                {loading ? (
                  <span className="inline-block h-7 w-14 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                ) : k.value === null ? (
                  <span className="text-gray-300 dark:text-slate-600">—</span>
                ) : (
                  k.value.toLocaleString()
                )}
              </p>
              {!loading && k.subtitle && (
                <p className="mt-0.5 truncate text-2xs text-gray-500 dark:text-slate-500">{k.subtitle}</p>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
