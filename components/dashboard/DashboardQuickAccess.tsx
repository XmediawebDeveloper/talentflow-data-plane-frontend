'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowUpRight, Rocket, LayoutGrid } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';
import { buildMenuSections, filterMenuSections, type NavItem } from '@/lib/navigation/menuSections';
import type { Permission } from '@/lib/types/tenant';

// One-line subtitle per nav item.
const ITEM_SUBTITLE: Record<string, string> = {
  dashboard: 'Workspace home',
  'job-openings': 'Create & Manage JD',
  'resume-scoring': 'Score Candidates',
  'ai-talent-match': 'Rank Candidates',
  'my-resumes': 'Manage Resumes',
  'resume-database': 'Shared Resume Pool',
  assessments: 'Test Skills & Coding',
  'ai-interviews': 'Live AI Interviews',
  'user-management': 'Manage Users',
  'current-plan': 'Billing & usage',
  'company-profile': 'Organisation',
  'general-settings': 'Profile & workspace',
  'audit-trail': 'Activity log',
  'support-tickets': 'Help & tickets',
  'help-desk': 'Internal desk',
};

/**
 * Tile colour runs by POSITION, in pairs: the first two tiles are brand blue,
 * the next two brand cyan, the next two brand orange, then it repeats. The
 * tiles used to be tinted by which menu section they came from, which meant
 * the run of colours changed shape as permissions and plan features hid
 * sections — the grid could open with four identical blues or a lone orange.
 *
 * Every value is a literal class string: Tailwind only ships classes it can
 * read in the source, so these can't be assembled from a token at runtime.
 */
interface TileTone {
  /** Resting card fill — a wash, so the label stays the loudest thing on it. */
  card: string;
  /** Icon chip: the glass bead's tint, glyph colour, rim and cast shadow. */
  iconChip: string;
  /** Border picked up on hover, and the title/arrow colour that goes with it. */
  hoverBorder: string;
  hoverText: string;
}

/* The chips are "liquid glass": a diagonal tint that runs from saturated at the
   top-left to almost clear at the bottom-right, a bright rim, and a coloured
   shadow cast onto the tile — so the bead looks lit from above rather than
   filled with flat colour. The highlight and the pooled light inside it are
   drawn as overlays in TileCard; only the tint and rim vary per tone. */
const TILE_TONES: TileTone[] = [
  {
    card: 'bg-brand-blue/[0.04]',
    iconChip:
      'bg-gradient-to-br from-brand-blue/35 via-brand-blue/15 to-brand-blue/[0.04] text-brand-blue ring-brand-blue/25 shadow-sm shadow-brand-blue/25',
    hoverBorder: 'hover:border-brand-blue/60',
    hoverText: 'group-hover:text-brand-blue',
  },
  {
    card: 'bg-brand-cyan/[0.05]',
    iconChip:
      'bg-gradient-to-br from-brand-cyan/35 via-brand-cyan/15 to-brand-cyan/[0.04] text-brand-cyan ring-brand-cyan/25 shadow-sm shadow-brand-cyan/25',
    hoverBorder: 'hover:border-brand-cyan/60',
    hoverText: 'group-hover:text-brand-cyan',
  },
  {
    card: 'bg-brand-orange/[0.06]',
    iconChip:
      'bg-gradient-to-br from-brand-orange/35 via-brand-orange/15 to-brand-orange/[0.04] text-brand-orange ring-brand-orange/25 shadow-sm shadow-brand-orange/25',
    hoverBorder: 'hover:border-brand-orange/60',
    hoverText: 'group-hover:text-brand-orange',
  },
];

/** Two tiles per tone, cycling. */
const toneFor = (index: number): TileTone => TILE_TONES[Math.floor(index / 2) % TILE_TONES.length];

function TileCard({ item, tone }: { item: NavItem; tone: TileTone }) {
  const Icon = item.icon;
  const href = item.href || '#';
  const subtitle = ITEM_SUBTITLE[item.id];

  return (
    <Link
      href={href}
      prefetch={false}
      className={`group relative flex items-center gap-2.5 rounded-xl border border-slate-200 p-3 transition-[border-color,box-shadow,color] hover:shadow-[0_10px_28px_-14px_rgba(15,23,42,0.28)] sm:gap-3 sm:p-4 ${tone.card} ${tone.hoverBorder}`}
    >
      <span
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[14px] ring-1 backdrop-blur-sm transition-transform sm:h-11 sm:w-11 ${tone.iconChip} group-hover:scale-105`}
      >
        {/* Specular highlight across the top-left — the "wet" edge of the bead. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/70 via-white/15 to-transparent"
        />
        {/* Light pooling under the glass, offset so it reads as depth rather
            than a second gradient. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-3 -right-2 h-8 w-8 rounded-full bg-white/40 blur-lg"
        />
        {/* Inner rim: a hairline of white along the top edge, catching the light. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[14px] shadow-[inset_0_1px_0_rgba(255,255,255,0.75),inset_0_-6px_12px_-8px_rgba(15,23,42,0.25)]"
        />
        <Icon className="relative h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm font-semibold text-slate-900 ${tone.hoverText}`}>{item.label}</p>
        {subtitle && <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{subtitle}</p>}
      </div>
      <ArrowUpRight className={`h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${tone.hoverText}`} />
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
  // 'user-management-section' (Users) was moved out of the header dropdown into
  // Quick Access, so it is intentionally NOT hidden here.
  const HIDDEN_SECTIONS = new Set([
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

  if (totalItems === 0) return null;

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

      {/* Tiles — single continuous grid across all categories */}
      <div className="px-3 pb-4 pt-0 sm:px-4 sm:pb-5 sm:pt-0 md:px-8 md:pb-6 md:pt-0">
        {/* Flattened first so the colour run counts tiles as they appear on
            screen, not as they are grouped by section. */}
        <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {sections.flatMap((section) => section.items).map((item, index) => (
            <li key={item.id}>
              <TileCard item={item} tone={toneFor(index)} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
