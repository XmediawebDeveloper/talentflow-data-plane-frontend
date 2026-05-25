'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowUpRight, Rocket, LayoutGrid } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';
import { buildMenuSections, filterMenuSections, type NavItem } from '@/lib/navigation/menuSections';
import type { Permission } from '@/lib/types/tenant';

// One-line subtitle per nav item.
const ITEM_SUBTITLE: Record<string, string> = {
  dashboard: 'Workspace home',
  'job-openings': 'Create & manage JDs',
  'resume-scoring': 'Rank candidates',
  'ai-talent-match': 'AI-powered match',
  'my-resumes': 'Upload & search',
  'resume-database': 'Internal pool',
  assessments: 'Skills & coding',
  'ai-interviews': 'Multi-round AI',
  'user-management': 'Users & roles',
  'current-plan': 'Billing & usage',
  'company-profile': 'Organisation',
  'general-settings': 'Profile & workspace',
  'audit-trail': 'Activity log',
  'support-tickets': 'Help & tickets',
  'help-desk': 'Internal desk',
};

interface SectionStyle {
  shortLabel: string;
  longLabel: string;
  tabActive: string; // active pill background/text classes
  iconChip: string; // icon-chip pastel classes
  dot: string; // tiny dot color (for "All" view chip)
}

const SECTION_STYLE: Record<string, SectionStyle> = {
  administration: {
    shortLabel: 'Admin',
    longLabel: 'Administration',
    tabActive: 'bg-slate-900 text-white shadow-sm shadow-slate-900/20',
    iconChip: 'bg-slate-100 text-slate-700 ring-slate-200',
    dot: 'bg-slate-500',
  },
  recruitment: {
    shortLabel: 'Recruitment',
    longLabel: 'Recruitment',
    tabActive: 'bg-brand-blue text-white shadow-sm shadow-brand-blue/20',
    iconChip: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/15',
    dot: 'bg-brand-blue',
  },
  'resume-management': {
    shortLabel: 'Resumes',
    longLabel: 'Resume management',
    tabActive: 'bg-brand-cyan text-white shadow-sm shadow-brand-cyan/20',
    iconChip: 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/15',
    dot: 'bg-brand-cyan',
  },
  evaluation: {
    shortLabel: 'Evaluation',
    longLabel: 'Evaluation',
    tabActive: 'bg-brand-orange text-white shadow-sm shadow-brand-orange/20',
    iconChip: 'bg-brand-orange/10 text-brand-orange ring-brand-orange/15',
    dot: 'bg-brand-orange',
  },
  'user-management-section': {
    shortLabel: 'Users',
    longLabel: 'User management',
    tabActive: 'bg-brand-blue text-white shadow-sm shadow-brand-blue/20',
    iconChip: 'bg-brand-blue/10 text-brand-blue ring-brand-blue/15',
    dot: 'bg-brand-blue',
  },
  subscription: {
    shortLabel: 'Billing',
    longLabel: 'Subscription & billing',
    tabActive: 'bg-brand-orange text-white shadow-sm shadow-brand-orange/20',
    iconChip: 'bg-brand-orange/10 text-brand-orange ring-brand-orange/15',
    dot: 'bg-brand-orange',
  },
  organization: {
    shortLabel: 'Organization',
    longLabel: 'Organization',
    tabActive: 'bg-brand-cyan text-white shadow-sm shadow-brand-cyan/20',
    iconChip: 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/15',
    dot: 'bg-brand-cyan',
  },
  settings: {
    shortLabel: 'Settings',
    longLabel: 'Settings',
    tabActive: 'bg-slate-700 text-white shadow-sm shadow-slate-700/20',
    iconChip: 'bg-slate-100 text-slate-700 ring-slate-200',
    dot: 'bg-slate-500',
  },
  audits: {
    shortLabel: 'Audits',
    longLabel: 'Audits & trail',
    tabActive: 'bg-brand-orange text-white shadow-sm shadow-brand-orange/20',
    iconChip: 'bg-brand-orange/10 text-brand-orange ring-brand-orange/15',
    dot: 'bg-brand-orange',
  },
  support: {
    shortLabel: 'Support',
    longLabel: 'Support',
    tabActive: 'bg-brand-cyan text-white shadow-sm shadow-brand-cyan/20',
    iconChip: 'bg-brand-cyan/10 text-brand-cyan ring-brand-cyan/15',
    dot: 'bg-brand-cyan',
  },
};

const FALLBACK_STYLE: SectionStyle = {
  shortLabel: 'More',
  longLabel: 'More',
  tabActive: 'bg-slate-700 text-white shadow-sm shadow-slate-700/20',
  iconChip: 'bg-slate-100 text-slate-700 ring-slate-200',
  dot: 'bg-slate-400',
};

function styleFor(sectionId: string): SectionStyle {
  return SECTION_STYLE[sectionId] ?? FALLBACK_STYLE;
}

function TileCard({ item, sectionId }: { item: NavItem; sectionId: string }) {
  const Icon = item.icon;
  const href = item.href || '#';
  const subtitle = ITEM_SUBTITLE[item.id];
  const style = styleFor(sectionId);

  return (
    <Link
      href={href}
      className="group relative flex items-center gap-2.5 rounded-xl border border-slate-300 bg-white p-3 transition-[border-color,box-shadow,color] hover:border-brand-blue/60 hover:shadow-[0_10px_28px_-14px_rgba(15,23,42,0.28)] sm:gap-3 sm:p-4"
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 transition-transform sm:h-11 sm:w-11 ${style.iconChip} group-hover:scale-105`}
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-brand-blue">{item.label}</p>
        {subtitle && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{subtitle}</p>}
      </div>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-brand-blue" />
    </Link>
  );
}

export default function DashboardQuickAccess() {
  const { user, isTenantAdmin } = useAuth();
  const { hasPlanFeature, loading: planFeaturesLoading } = usePlanFeatures();

  const hasPerm = (key: string): boolean => {
    if (!key) return true;
    if (isTenantAdmin) return true;
    if (!user?.permissions) return false;
    return user.permissions[key as keyof Permission] === true;
  };
  const hasAnyPerm = (keys: string[]): boolean => {
    if (isTenantAdmin) return true;
    if (!user?.permissions) return false;
    return keys.some((k) => user.permissions[k as keyof Permission] === true);
  };

  // These sections live in the header profile dropdown — hide them from the
  // dashboard Quick Access tiles to avoid duplication.
  const HIDDEN_SECTIONS = new Set([
    'user-management-section',
    'subscription',
    'organization',
    'settings',
    'audits',
    'support',
  ]);

  const sections = useMemo(
    () =>
      filterMenuSections(buildMenuSections(isTenantAdmin), {
        isTenantAdmin,
        hasPermission: hasPerm,
        hasAnyPermission: hasAnyPerm,
        hasPlanFeature,
        planFeaturesLoading,
      })
        .filter((s) => !HIDDEN_SECTIONS.has(s.id))
        .map((s) => ({ ...s, items: s.items.filter((i) => i.id !== 'dashboard') }))
        .filter((s) => s.items.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isTenantAdmin, user?.permissions, planFeaturesLoading],
  );

  const totalItems = sections.reduce((acc, s) => acc + s.items.length, 0);
  const [activeTab, setActiveTab] = useState<string>('all');

  if (totalItems === 0) return null;

  const tabs: Array<{ id: string; label: string; count: number; style: SectionStyle }> = [
    {
      id: 'all',
      label: 'All',
      count: totalItems,
      style: {
        shortLabel: 'All',
        longLabel: 'All',
        tabActive: 'bg-slate-900 text-white shadow-sm shadow-slate-900/20',
        iconChip: 'bg-slate-100 text-slate-700 ring-slate-200',
        dot: 'bg-slate-500',
      },
    },
    ...sections.map((s) => ({
      id: s.id,
      label: styleFor(s.id).shortLabel,
      count: s.items.length,
      style: styleFor(s.id),
    })),
  ];

  // Items shown: every section if "all" is active, otherwise just the chosen section.
  const visibleSections = activeTab === 'all' ? sections : sections.filter((s) => s.id === activeTab);

  return (
    <section
      aria-label="Quick access"
      className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_4px_12px_rgba(15,23,42,0.06),0_20px_40px_-16px_rgba(15,23,42,0.18)]"
    >
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-white px-3 py-3 sm:px-4 sm:py-4 md:px-8">
        <div className="flex items-center gap-2.5">
          <Rocket className="h-5 w-5 text-slate-900" />
          <h2 className="text-base font-semibold tracking-tight text-slate-900 sm:text-lg">Quick access</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200 sm:px-3 sm:py-1.5 sm:text-[11px]">
          <LayoutGrid className="h-3 w-3 text-slate-500" />
          {sections.length} {sections.length === 1 ? 'category' : 'categories'} · {totalItems} tools
        </span>
      </header>

      {/* Tab bar — single line, scrolls horizontally if needed */}
      <div className="bg-white px-3 pb-3 pt-0 sm:px-4 md:px-8">
        <div
          role="tablist"
          aria-label="Quick access categories"
          className="flex items-center gap-2 overflow-x-auto whitespace-nowrap scrollbar-hide"
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={
                  isActive
                    ? `inline-flex shrink-0 items-center gap-1.5 rounded-full border border-transparent px-2.5 py-1 text-xs font-semibold transition-colors ${tab.style.tabActive}`
                    : 'inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50 hover:text-slate-900'
                }
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'invisible' : tab.style.dot}`} />
                <span>{tab.label}</span>
                <span
                  className={
                    isActive
                      ? 'inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-white/20 px-1 text-[9px] font-semibold tabular-nums'
                      : 'inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-slate-100 px-1 text-[9px] font-semibold text-slate-500 tabular-nums'
                  }
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tiles — single continuous grid for all tabs to keep DOM structure stable across tab switches */}
      <div className="min-h-[200px] px-3 py-4 sm:min-h-[320px] sm:px-4 sm:py-5 md:px-8 md:py-6">
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {visibleSections.flatMap((section) =>
            section.items.map((item) => (
              <li key={item.id}>
                <TileCard item={item} sectionId={section.id} />
              </li>
            )),
          )}
        </ul>
      </div>
    </section>
  );
}
