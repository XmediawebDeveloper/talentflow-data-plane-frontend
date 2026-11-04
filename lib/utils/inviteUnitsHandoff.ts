import { useMemo, useSyncExternalStore } from 'react';
import type { BreadcrumbCrumb } from '@/components/PageBreadcrumb';
import type { OpenInviteRequest } from '@/components/talent-match-invite/InviteDialogProvider';
import type { PickerSelection } from '@/components/talent-match-invite/ServerCandidatePicker';
import type { ExtraMode } from '@/components/talent-match-invite/ExtraCandidatesInput';
import type { BulkExtraCandidate } from '@/lib/services/bulkInviteService';

/**
 * The invite popup → "Add units" → Usage & Quotas → back to the popup.
 *
 * With no units left the popup offers Add units. Before leaving it saves
 * itself here — what it was opened with, and how far the recruiter got (the
 * version, the list picks, the rows typed in or uploaded, the open tab) —
 * with the page it was on and that page's breadcrumb. Usage & Quotas
 * (`?from=invite`) reads it for its breadcrumb (the page's own crumbs, then
 * Usage & Quotas) and its "Back to invite" banner; going back lands on the
 * page with `?invite_units=1`, and the invite provider reopens the popup
 * from this record, as it was.
 *
 * The host's own callbacks (onSent, onClose) cannot travel: the reopened
 * popup sends the same way, but the page under it does not hear of it.
 * sessionStorage: per tab, gone with the tab.
 */

/** How far the popup had got. */
export interface InviteUnitsRestore {
  step: 'version' | 'candidates';
  versionId: string | null;
  selection: PickerSelection;
  extras: BulkExtraCandidate[];
  addTab: ExtraMode | null;
  /** Only when the recruiter had typed in it. */
  message?: string;
  expiryDays?: number;
}

/** What the popup was opened with — its callbacks left out. */
export type InviteUnitsRequest = Omit<OpenInviteRequest, 'onSent' | 'onClose'>;

export interface InviteUnitsHandoff {
  request: InviteUnitsRequest;
  restore: InviteUnitsRestore;
  /** The page the popup was on (path + query), to go back to. */
  returnUrl: string;
  /** That page's breadcrumb, as it showed it. */
  crumbs: BreadcrumbCrumb[];
  /** "Assessment" / "AI interview" — the units being bought. */
  noun: string;
  /** Everyone selected when Add units was pressed. */
  candidateCount: number;
  createdAt: number;
}

const KEY = 'inviteUnitsHandoff';
/** Older than this is a forgotten tab, not a purchase. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export const INVITE_UNITS_PARAM = 'invite_units';
export const USAGE_QUOTAS_FROM_INVITE_URL = '/subscription/usage-quotas?from=invite';

/* The page's breadcrumb as it is drawn (PageBreadcrumb → nav[data-slot]):
   each crumb's text and link. The last one is the page itself. */
const readPageCrumbs = (): BreadcrumbCrumb[] => {
  const nav = document.querySelector('nav[data-slot="breadcrumb"]');
  if (!nav) return [];
  return Array.from(nav.querySelectorAll('[data-slot="breadcrumb-item"]'))
    .map((item) => {
      const label = (item.textContent || '').trim();
      const href = item.querySelector('a')?.getAttribute('href') || undefined;
      return { label, href };
    })
    .filter((c) => c.label);
};

/** The page's URL without the return marker. */
const currentUrl = (): string => {
  const url = new URL(window.location.href);
  url.searchParams.delete(INVITE_UNITS_PARAM);
  return `${url.pathname}${url.search}`;
};

export function saveInviteUnitsHandoff(h: Omit<InviteUnitsHandoff, 'createdAt' | 'returnUrl' | 'crumbs'>): void {
  const returnUrl = currentUrl();
  const crumbs = readPageCrumbs();
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...h, returnUrl, crumbs, createdAt: Date.now() }));
  } catch {
    /* storage blocked: Usage & Quotas still opens, the popup is not reopened */
  }
}

export function readInviteUnitsHandoff(): InviteUnitsHandoff | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const h = JSON.parse(raw) as InviteUnitsHandoff;
    // Only a same-app path is followed back.
    if (!h?.request?.kind || !h.returnUrl?.startsWith('/') || h.returnUrl.startsWith('//')
      || Date.now() - (h.createdAt || 0) > MAX_AGE_MS) {
      sessionStorage.removeItem(KEY);
      return null;
    }
    return h;
  } catch {
    return null;
  }
}

export function clearInviteUnitsHandoff(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** The page to go back to, marked so the popup reopens there. */
export function inviteUnitsReturnUrl(h: InviteUnitsHandoff): string {
  const [path, query = ''] = h.returnUrl.split('?');
  const p = new URLSearchParams(query);
  p.set(INVITE_UNITS_PARAM, '1');
  return `${path}?${p.toString()}`;
}

/**
 * Usage & Quotas, opened from the popup: the hand-off — or null (opened any
 * other way). Read after mount (sessionStorage is client-only), so the server
 * render and the first client render agree.
 */
export function useInviteUnitsHandoff(): InviteUnitsHandoff | null {
  const raw = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return new URLSearchParams(window.location.search).get('from') === 'invite' ? sessionStorage.getItem(KEY) : null;
      } catch {
        return null;
      }
    },
    () => null,
  );
  return useMemo(() => (raw ? readInviteUnitsHandoff() : null), [raw]);
}
