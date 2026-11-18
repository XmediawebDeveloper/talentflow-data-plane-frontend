'use client';

/* Resume Scoring job page — which version's scored resumes the list shows.

   VersionScopeSwitch: one two-way switch, [● Version vN ▾ | ≋ All
   versions N], selected side filled brand-blue; the left side's menu jumps
   to another version's own page.
   VersionScopeStrip: the line under it — "Showing vN only · 22 candidates
   scored" / "Showing all versions (v1, v2) · 38 …" — which flashes whenever
   the scope changes, so the change is seen. */

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Clock, Eye, Info, Layers, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';

export interface ScopeVersion {
  id: string;
  versionNumber?: number | null;
  isLatest?: boolean;
  title?: string;
  /** Candidates scored against this version, when known. */
  scored?: number;
}

const SEG = 'inline-flex h-6 items-center gap-1 px-2 text-xs font-medium whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-blue/40';
const segTone = (on: boolean) => (on
  ? 'bg-brand-blue text-white'
  : 'bg-[var(--card)] text-[var(--muted-foreground)] hover:bg-[var(--surface-hover)] hover:text-brand-blue');

export function VersionScopeSwitch({
  versionNumber,
  versions,
  currentId,
  onPickVersion,
  canShowAll,
  showingAll,
  loadingAll,
  onShowAll,
  onShowThis,
  onViewJob,
}: {
  versionNumber?: number | null;
  /** Every version the menu lists (published / scored ones). */
  versions: ScopeVersion[];
  currentId: string;
  onPickVersion: (v: ScopeVersion) => void;
  canShowAll: boolean;
  showingAll: boolean;
  loadingAll: boolean;
  onShowAll: () => void;
  onShowThis: () => void;
  onViewJob: () => void;
}) {
  /* The eye follows the switch: this version's JD, or every version. */
  const viewJobLabel = showingAll ? 'View all versions of this JD' : versionNumber ? `View v${versionNumber} JD` : 'View Job Detail';
  const label = (
    <>
      <span className={`h-1.5 w-1.5 rounded-full ${showingAll ? 'bg-[var(--secondary)]' : 'bg-white'}`} />
      Version{versionNumber ? <b>v{versionNumber}</b> : null}
    </>
  );
  /* Left side: under All versions, a click comes back to this version; on
     this version, it opens the version menu (when there is another one). */
  const left = showingAll ? (
    <button type="button" role="radio" aria-checked={false} onClick={onShowThis} className={`${SEG} ${segTone(false)}`}
      title={`Show v${versionNumber ?? ''} only`}>
      {label}
    </button>
  ) : versions.length > 1 ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" role="radio" aria-checked className={`${SEG} ${segTone(true)}`} title="Switch version">
          {label}<ChevronDown className="h-3 w-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {versions.map(v => (
          <DropdownMenuItem key={v.id} className="group" disabled={v.id === currentId} onSelect={() => onPickVersion(v)}>
            <span className={`${MENU_ITEM_SCALE_CLASS} flex w-full items-center justify-between gap-3`}>
              <span className="flex items-center gap-1.5">
                <b>v{v.versionNumber}</b>
                {v.isLatest && <span className="tf-stat-chip tf-stat-chip-info !py-0">Latest</span>}
              </span>
              <span className="flex items-center gap-2 tf-meta">
                {v.scored != null && <span className="tabular-nums">{v.scored} scored</span>}
                {v.id === currentId ? <Check className="h-3.5 w-3.5 text-brand-blue" /> : <span className="w-3.5" />}
              </span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  ) : (
    <span role="radio" aria-checked className={`${SEG} ${segTone(true)} cursor-default hover:!bg-brand-blue hover:!text-white`}>{label}</span>
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div role="radiogroup" aria-label="Which versions to show" className="inline-flex max-w-full overflow-hidden rounded-md border border-brand-blue/30 shadow-sm">
        {left}
        {canShowAll && (
          <button type="button" role="radio" aria-checked={showingAll} onClick={showingAll ? undefined : onShowAll}
            className={`${SEG} ${segTone(showingAll)} border-l border-brand-blue/30`}
            title="Show candidates from every version of this job">
            {loadingAll ? <Loader2 className="h-3 w-3 animate-spin" /> : <Layers className="h-3 w-3" />}
            All versions
            <span className={`rounded-full px-1 text-[10px] leading-4 tabular-nums ${showingAll ? 'bg-white/20' : 'bg-[var(--muted)]'}`}>{versions.length}</span>
          </button>
        )}
      </div>
      <Button variant="secondary" size="sm" className="!h-6 !w-6 !px-0 !rounded-md" onClick={onViewJob} title={viewJobLabel} aria-label={viewJobLabel}>
        <Eye className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/** Flash for ~1.2s whenever `key` changes (not on the first render). */
function useFlash(key: string) {
  const [on, setOn] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOn(true);
    const t = setTimeout(() => setOn(false), 1200);
    return () => clearTimeout(t);
  }, [key]);
  return on;
}

export function VersionScopeStrip({
  scopeKey,
  showingAll,
  versionNumber,
  allVersionsLabel,
  count,
  scoredAtLabel,
}: {
  /** Changes whenever the scope changes — drives the flash. */
  scopeKey: string;
  showingAll: boolean;
  versionNumber?: number | null;
  /** "v1, v2" — the versions folded in under All versions. */
  allVersionsLabel: string;
  count: number;
  scoredAtLabel: string;
}) {
  const flash = useFlash(scopeKey);
  return (
    <div
      aria-live="polite"
      className={`inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-md border px-2 py-1 text-xs text-[var(--info-strong)] transition-[background-color,box-shadow,border-color] duration-700 motion-reduce:transition-none ${flash
        ? 'border-brand-blue/50 bg-brand-blue/15 shadow-[0_0_0_3px_color-mix(in_srgb,var(--brand-blue)_15%,transparent)]'
        : 'border-[var(--info-line)] bg-[var(--info-subtle)]'}`}
    >
      {showingAll ? <Layers className="h-3.5 w-3.5 shrink-0" /> : <Info className="h-3.5 w-3.5 shrink-0" />}
      <span>
        Showing <b>{showingAll ? `all versions (${allVersionsLabel})` : versionNumber ? `v${versionNumber} only` : 'this version'}</b>
        {' · '}
        <b className={`inline-block tabular-nums transition-transform duration-300 motion-reduce:transition-none ${flash ? 'scale-110' : ''}`}>{count}</b>
        {' '}candidate{count === 1 ? '' : 's'} scored
      </span>
      <span className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]"><Clock className="h-3 w-3" />{scoredAtLabel}</span>
    </div>
  );
}
