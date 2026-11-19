'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { ArrowUpRight, Rocket, LayoutGrid, Lock, UsersRound } from 'lucide-react';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePlanFeatures } from '@/lib/hooks/usePlanFeature';
import { buildMenuSections, filterMenuSections, DISABLED_REASON_MESSAGE, type NavItem } from '@/lib/navigation/menuSections';
import type { Permission } from '@/lib/types/tenant';

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

// One-line subtitle per nav item.
const ITEM_SUBTITLE: Record<string, string> = {
  dashboard: 'Workspace home',
  'job-openings': 'Create & Manage JD',
  'resume-scoring': 'Score Candidates',
  'ai-talent-match': 'Rank Candidates',
  'resume-database': 'Resume Management',
  assessments: 'Test Skills & Coding',
  'ai-interviews': 'Live AI Interviews',
  'user-management': 'Manage Users',
  'current-plan': 'Billing & usage',
  'company-profile': 'Organisation',
  'general-settings': 'Profile & workspace',
  'audit-trail': 'Activity log',
  'support-tickets': 'Help & tickets',
  'help-desk': 'Internal desk',
  teams: 'Members & groups',
};

// Short, always-visible reason under a disabled tile; the full sentence is in
// DISABLED_REASON_MESSAGE (hover title + the toast shown on tap).
const DISABLED_SHORT_REASON: Record<'permission' | 'plan', string> = {
  permission: 'No permission',
  plan: 'Not in your plan',
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
    card: 'bg-brand-blue/[0.04] dark:bg-brand-blue/[0.10]',
    iconChip:
      'bg-gradient-to-br from-brand-blue/35 via-brand-blue/15 to-brand-blue/[0.04] text-brand-blue ring-brand-blue/25 shadow-sm shadow-brand-blue/25',
    hoverBorder: 'hover:border-brand-blue/60',
    hoverText: 'group-hover:text-brand-blue',
  },
  {
    card: 'bg-brand-cyan/[0.05] dark:bg-brand-cyan/[0.10]',
    iconChip:
      'bg-gradient-to-br from-brand-cyan/35 via-brand-cyan/15 to-brand-cyan/[0.04] text-brand-cyan ring-brand-cyan/25 shadow-sm shadow-brand-cyan/25',
    hoverBorder: 'hover:border-brand-cyan/60',
    hoverText: 'group-hover:text-brand-cyan',
  },
  {
    card: 'bg-brand-orange/[0.06] dark:bg-brand-orange/[0.11]',
    iconChip:
      'bg-gradient-to-br from-brand-orange/35 via-brand-orange/15 to-brand-orange/[0.04] text-brand-orange ring-brand-orange/25 shadow-sm shadow-brand-orange/25',
    hoverBorder: 'hover:border-brand-orange/60',
    hoverText: 'group-hover:text-brand-orange',
  },
];

/** Two tiles per tone, cycling. */
const toneFor = (index: number): TileTone => TILE_TONES[Math.floor(index / 2) % TILE_TONES.length];

/* The position is taken from the FULL tool list (every section, every item), not
   from the tiles this user can see — so each tool keeps one colour for everyone.
   An Owner sees the same blue/cyan/orange pairs as before; a role with fewer
   tools no longer has every colour shift along when one tile is hidden. */
const CANONICAL_TOOL_ORDER: string[] = buildMenuSections(true)
  .filter((s) => !HIDDEN_SECTIONS.has(s.id))
  .flatMap((s) => s.items.map((i) => i.id))
  .filter((id) => id !== 'dashboard')
  .concat('teams'); // the Teams tile, always appended last

const toneForTool = (id: string, fallbackIndex: number): TileTone => {
  const index = CANONICAL_TOOL_ORDER.indexOf(id);
  return toneFor(index === -1 ? fallbackIndex : index);
};

function TileCard({ item, tone }: { item: NavItem; tone: TileTone }) {
  const Icon = item.icon;
  const href = item.href || '#';
  const subtitle = ITEM_SUBTITLE[item.id];
  const disabled = item.disabled === true;

  const inner = (
    <>
      <span
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[14px] ring-1 backdrop-blur-sm transition-transform sm:h-11 sm:w-11 ${
          disabled
            ? 'bg-slate-100 text-slate-400 ring-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:ring-slate-700'
            : `${tone.iconChip} group-hover:scale-105`
        }`}
      >
        {!disabled && (
          <>
            {/* Specular highlight across the top-left — the "wet" edge of the bead. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/70 via-white/15 to-transparent dark:from-transparent dark:via-transparent"
            />
            {/* Light pooling under the glass, offset so it reads as depth rather
                than a second gradient. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-3 -right-2 h-8 w-8 rounded-full bg-white/40 blur-lg dark:bg-transparent"
            />
            {/* Inner rim: a hairline of white along the top edge, catching the light. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-[14px] shadow-[inset_0_1px_0_rgba(255,255,255,0.75),inset_0_-6px_12px_-8px_rgba(15,23,42,0.25)] dark:shadow-[inset_0_1px_0_rgba(148,163,184,0.18),inset_0_-6px_12px_-8px_rgba(0,0,0,0.45)]"
            />
          </>
        )}
        <Icon className="relative h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`tf-wrap text-sm font-semibold ${
            disabled ? 'text-slate-400 dark:text-slate-500' : `text-slate-900 dark:text-slate-50 ${tone.hoverText}`
          }`}
        >
          {item.label}
        </p>
        {disabled ? (
          <p className="tf-wrap mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            {DISABLED_SHORT_REASON[item.disabledReason ?? 'permission']}
          </p>
        ) : (
          subtitle && <p className="tf-wrap mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        )}
      </div>
      {disabled ? (
        <Lock aria-hidden="true" className="hidden h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500 sm:block" />
      ) : (
        <ArrowUpRight
          className={`hidden h-4 w-4 shrink-0 text-slate-300 dark:text-slate-500 transition-all sm:block group-hover:-translate-y-0.5 group-hover:translate-x-0.5 ${tone.hoverText}`}
        />
      )}
    </>
  );

  // Plan status not known yet: same footprint, not clickable, no tooltip —
  // resolves straight to clickable or greyed, never one then the other.
  if (item.pending) {
    return (
      <div
        aria-busy="true"
        className="group relative flex h-full cursor-default items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700/60 dark:bg-slate-800/40 sm:gap-3 sm:p-4"
      >
        <span className="h-10 w-10 shrink-0 animate-pulse rounded-[14px] bg-slate-200 dark:bg-slate-700 sm:h-11 sm:w-11" />
        <div className="min-w-0 flex-1">
          <p className="tf-wrap text-sm font-semibold text-slate-400 dark:text-slate-500">{item.label}</p>
          {subtitle && <p className="tf-wrap mt-0.5 text-xs text-slate-400 dark:text-slate-600">{subtitle}</p>}
        </div>
      </div>
    );
  }

  if (disabled) {
    const message = DISABLED_REASON_MESSAGE[item.disabledReason ?? 'permission'];
    // A focusable button (aria-disabled, not `disabled`) so a tap or Enter can
    // explain the lock in a toast — `title` alone only ever shows on mouse hover.
    return (
      <button
        type="button"
        aria-disabled="true"
        title={message}
        onClick={() => toast.info(message)}
        className="group relative flex h-full w-full cursor-not-allowed items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left opacity-70 dark:border-slate-700/60 dark:bg-slate-800/40 sm:gap-3 sm:p-4"
      >
        {inner}
      </button>
    );
  }

  return (
    <Link
      href={href}
      className={`group relative flex h-full items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-700/80 p-3 transition-[border-color,box-shadow,color,background-color] hover:shadow-[0_10px_28px_-14px_rgba(15,23,42,0.28)] dark:hover:shadow-[0_10px_28px_-18px_rgba(0,0,0,0.45)] sm:gap-3 sm:p-4 ${tone.card} ${tone.hoverBorder}`}
    >
      {inner}
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
    [isTenantAdmin, user?.permissions, planFeaturesLoading, hasPlanFeature],
  );

  /* Teams, as a tile at the end. It follows the Teams page and the backend
     (the plan's Teams feature + View Teams; the owner always) and greys out
     with the reason otherwise. Chat is not a tile: it's in the profile menu
     (above Support Tickets) and behind the header's chat icon. */
  const teamsTile: NavItem = useMemo(() => {
    const planAllows = hasPlanFeature('teams');
    const permAllows = hasPerm('canViewTeams');
    return {
      id: 'teams',
      label: 'Teams',
      icon: UsersRound,
      href: '/organization/team-management',
      pending: planFeaturesLoading,
      disabled: !planAllows || !permAllows,
      disabledReason: !planAllows ? 'plan' : 'permission',
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTenantAdmin, user?.permissions, planFeaturesLoading, hasPlanFeature]);
  const tiles = [...sections.flatMap((section) => section.items), teamsTile];

  const totalItems = tiles.length;


  return (
    <section
      aria-label="Dashboard"
      className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_4px_12px_rgba(15,23,42,0.06),0_20px_40px_-16px_rgba(15,23,42,0.18)] dark:border-slate-700 dark:bg-slate-900 dark:shadow-[0_18px_42px_-28px_rgba(0,0,0,0.75)]"
    >
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-white px-3 py-3 dark:bg-slate-900 sm:px-4 sm:py-4 md:px-8">
        <div className="flex items-center gap-2.5">
          <Rocket className="h-5 w-5 text-slate-900 dark:text-slate-50" />
          <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50 sm:text-lg">Dashboard</h2>
        </div>
        <span className="tf-badge gap-1.5 bg-white text-2xs text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800/70 dark:text-slate-300 dark:ring-slate-700 sm:px-3 sm:py-1.5 sm:text-2xs">
          <LayoutGrid className="h-3 w-3 text-slate-500 dark:text-slate-400" />
          {totalItems} {totalItems === 1 ? 'tool' : 'tools'}
        </span>
      </header>

      {/* No tools for this role/plan: say so, instead of the section vanishing
          and leaving the dashboard with just the banner. */}
      {totalItems === 0 && (
        <div className="px-3 pb-4 sm:px-4 sm:pb-5 md:px-8 md:pb-6">
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center dark:border-slate-700 dark:bg-slate-800/40">
            <Lock className="mx-auto h-6 w-6 text-slate-400 dark:text-slate-500" />
            <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">No tools are enabled for your role</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Contact your workspace admin to get access.</p>
          </div>
        </div>
      )}

      {/* Tiles — single continuous grid across all categories */}
      {totalItems > 0 && (
      <div className="@container px-3 pb-4 pt-0 sm:px-4 sm:pb-5 sm:pt-0 md:px-8 md:pb-6 md:pt-0">
        {/* Flattened first so the colour run counts tiles as they appear on
            screen, not as they are grouped by section.
            Columns follow the card's own width (the sidebar takes a share of
            the screen), 1 → 2 → 4: a tile never gets so narrow that a label
            breaks mid-word ("User Manageme/nt") and lifts its icon out of line
            with the row, and the usual 8 tiles always fill whole rows. */}
        <ul className="grid grid-cols-1 gap-3 sm:gap-4 @lg:grid-cols-2 @5xl:grid-cols-4">
          {tiles.map((item, index) => (
            <li key={item.id}>
              <TileCard item={item} tone={toneForTool(item.id, index)} />
            </li>
          ))}
        </ul>
      </div>
      )}
    </section>
  );
}
