'use client';

import React from 'react';
import {
  BarChart3, Briefcase, CreditCard, Database, FileText, Gauge, HelpCircle, LifeBuoy,
  ListChecks, Network, SlidersHorizontal, Sparkles, Users, Video, type LucideIcon,
} from 'lucide-react';
import {
  ACCESS_MODULES,
  describeModule,
  levelText,
  LEVEL_NAMES,
  type AccessModule,
  type LevelTone,
} from '@/lib/permissions/moduleLevels';

/** One icon per Quick Setup module. */
export const MODULE_ICONS: Record<string, LucideIcon> = {
  job_description: Briefcase,
  resume_scoring: Gauge,
  ai_talent_match: Sparkles,
  assessments: ListChecks,
  ai_interviews: Video,
  my_resumes: FileText,
  internal_database: Database,
  hr_question_bank: HelpCircle,
  user_management: Users,
  teams: Network,
  subscription_billing: CreditCard,
  settings: SlidersHorizontal,
  analytics: BarChart3,
  support: LifeBuoy,
};

export const ModuleIcon = ({ module, className }: { module: AccessModule; className?: string }) => {
  const Icon = MODULE_ICONS[module.id] ?? Briefcase;
  return <Icon className={className} aria-hidden />;
};

const DOT_CLASS: Record<LevelTone, string> = {
  full: 'bg-brand-blue',
  view: 'bg-transparent ring-2 ring-inset ring-brand-blue',
  exc: 'bg-amber-500',
  none: 'bg-gray-300 dark:bg-slate-600',
};

/** Level dot: Full = solid, View = ring, has exceptions = amber, No access = grey. */
export const AccessDot = ({ tone, className = 'h-2 w-2' }: { tone: LevelTone; className?: string }) => (
  <span className={`inline-block shrink-0 rounded-full ${DOT_CLASS[tone]} ${className}`} aria-hidden />
);

export const AccessLegend = ({ className = '' }: { className?: string }) => (
  <div className={`flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-slate-400 ${className}`}>
    <span className="inline-flex items-center gap-1.5"><AccessDot tone="full" />{LEVEL_NAMES.full}</span>
    <span className="inline-flex items-center gap-1.5"><AccessDot tone="view" />{LEVEL_NAMES.view}</span>
    <span className="inline-flex items-center gap-1.5"><AccessDot tone="exc" />Some turned off</span>
  </div>
);

/**
 * Compact read-only access line: the first `max` modules the role can use, as
 * dots, then "+N more" (hover lists the rest). Used in the users table and on
 * role cards. Information only, nothing clickable.
 */
export function AccessInline({ codes, max = 3 }: { codes: Set<string>; max?: number }) {
  const items = ACCESS_MODULES
    .filter((m) => !m.always)
    .map((m) => ({ m, d: describeModule(codes, m) }))
    .filter((x) => x.d.base !== 'none' || x.d.distance);
  if (!items.length) return <span className="text-xs text-gray-500 dark:text-slate-400">Dashboard and Support only</span>;
  const rest = items.slice(max);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3.5 gap-y-1 text-[13px] text-gray-800 dark:text-slate-200">
      {items.slice(0, max).map(({ m, d }) => {
        const lt = levelText(d);
        return (
          <span key={m.id} className="inline-flex items-center gap-1.5 whitespace-nowrap" title={`${m.name}: ${lt.text}`}>
            <AccessDot tone={lt.tone} />
            {m.name}
          </span>
        );
      })}
      {rest.length > 0 && (
        <span
          className="whitespace-nowrap text-gray-500 dark:text-slate-400"
          title={rest.map(({ m, d }) => `${m.name} (${levelText(d).text})`).join(', ')}
        >
          +{rest.length} more
        </span>
      )}
    </div>
  );
}

/** Short key for the three levels, shown under "What this role can do" in the
 *  role editor and above the read-only access list. */
export const AccessLevelKey = ({ className = '' }: { className?: string }) => (
  <dl className={`grid gap-1.5 rounded-xl bg-gray-50 px-3.5 py-2.5 text-[13px] dark:bg-slate-800/50 sm:grid-cols-3 sm:gap-4 ${className}`}>
    {([
      [LEVEL_NAMES.full, 'Can see it and do everything in it'],
      [LEVEL_NAMES.view, 'Can see it, but not change anything'],
      [LEVEL_NAMES.none, "Can't see this area"],
    ] as const).map(([term, text]) => (
      <div key={term}>
        <dt className="font-semibold text-gray-900 dark:text-slate-100">{term}</dt>
        <dd className="text-gray-500 dark:text-slate-400">{text}</dd>
      </div>
    ))}
  </dl>
);
