'use client';

import { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/hooks/useAuth';
import { clearInviteUnitsHandoff, INVITE_UNITS_PARAM, readInviteUnitsHandoff, type InviteUnitsRestore } from '@/lib/utils/inviteUnitsHandoff';
import VersionInviteDialog from './VersionInviteDialog';
import type { InviteCandidate, InviteKind } from './inviteVersions';

/** The job an invite is for. */
export interface InviteDialogJob {
  jdId: string;
  jdTitle: string;
  /** The display ID (JD-133). */
  jdCode?: string;
  /** The job version (V2). */
  versionNumber?: number;
  /** 'Disabled' turns both types off, as on Job Details. */
  status?: string;
}

/** One opening of THE invite popup. */
export interface OpenInviteRequest {
  kind: InviteKind;
  /** Omitted: the popup starts on the list of every published assessment /
   *  AI interview, and the pick names the job and version. */
  job?: InviteDialogJob;
  /** The assessment id / AI interview config id the button is for (a
   *  version row's Invite, Invite More): its version cards are left out. */
  versionId?: string;
  /** Ticked on the page; omitted / [] = none. */
  candidates?: InviteCandidate[];
  /** False = list `candidates` unticked. */
  preselect?: boolean;
  /** Opened from the Resume Database's My Resumes / Shared Database table:
   *  `candidates` are ticked in that list and its tab opens first. */
  pickInto?: 'my-resumes' | 'internal-db';
  /** Opened from the AI Talent Match / Score Resume page: its tab opens first. */
  openOn?: 'talent-match' | 'score-resume';
  /** Back from Usage & Quotas: how far the popup had got. */
  restore?: InviteUnitsRestore;
  /** Host-specific entry-point gate (AI Talent Match's own invite permission). */
  inviteGate?: { allowed: boolean; reason?: string };
  hideDuplicate?: boolean;
  /** Invitations went out (also after the popup closed). */
  onSent?: (kind: InviteKind, sentCount: number) => void;
  /** The popup closed. */
  onClose?: () => void;
}

const InviteDialogContext = createContext<{ open: (req: OpenInviteRequest) => void } | null>(null);

/**
 * Every Assessment / AI Interview invite button in the app opens the one
 * popup through this: `useInviteDialog().open({ kind, job, versionId,
 * candidates, onSent })`. Mounted once in the dashboard layout.
 */
export function InviteDialogProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<OpenInviteRequest | null>(null);
  const open = useCallback((r: OpenInviteRequest) => setReq(r), []);
  /* Back from Usage & Quotas (the popup's Add units): the page carries
     `?invite_units=1`; the popup reopens as it was left, and the marker is
     taken off the address. */
  const pathname = usePathname();
  const reopenFromUnits = useEffectEvent(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get(INVITE_UNITS_PARAM) !== '1') return;
    url.searchParams.delete(INVITE_UNITS_PARAM);
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    const h = readInviteUnitsHandoff();
    clearInviteUnitsHandoff();
    if (h) setReq({ ...h.request, restore: h.restore });
  });
  // The marker and the record live in the address / sessionStorage, read
  // after each navigation — browser-only, so not in render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { reopenFromUnits(); }, [pathname]);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <InviteDialogContext.Provider value={value}>
      {children}
      {req && <InviteDialogMount request={req} onClose={() => { req.onClose?.(); setReq(null); }} />}
    </InviteDialogContext.Provider>
  );
}

export function useInviteDialog() {
  const ctx = useContext(InviteDialogContext);
  if (!ctx) throw new Error('useInviteDialog must be used inside InviteDialogProvider');
  return ctx;
}

/** The popup for one request, with the workspace / job "turned off" reasons. */
export function InviteDialogMount({ request, onClose }: { request: OpenInviteRequest; onClose: () => void }) {
  const { tenant } = useAuth();
  const { kind, job } = request;
  // No tenant flags at all means enabled (Job Details' isFeatureEnabled).
  const features = tenant?.features as Record<string, unknown> | undefined;
  const featureOn = !features || features[kind === 'assessment' ? 'assessment' : 'ai_interview'] === true;
  const disabledReason = !featureOn
    ? `${kind === 'assessment' ? 'Assessments are' : 'AI Interviews are'} not enabled for your workspace.`
    : job?.status === 'Disabled'
      ? 'This job description is disabled, so nothing can be sent for it.'
      : null;
  return (
    <VersionInviteDialog
      kind={kind}
      onClose={onClose}
      jdId={job?.jdId}
      jdCode={job?.jdCode}
      jdTitle={job?.jdTitle}
      jobVersionNumber={job?.versionNumber && job.versionNumber > 0 ? job.versionNumber : undefined}
      candidates={request.candidates ?? []}
      versionId={request.versionId}
      preselect={request.preselect ?? true}
      pickInto={request.pickInto}
      openOn={request.openOn}
      restore={request.restore}
      disabledReason={disabledReason}
      hideDuplicate={request.hideDuplicate}
      inviteAllowed={request.inviteGate ? request.inviteGate.allowed : true}
      inviteDeniedReason={request.inviteGate?.reason}
      onSent={request.onSent}
    />
  );
}
