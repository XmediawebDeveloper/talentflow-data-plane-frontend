'use client';

import { toast } from 'sonner';
import { useAuth } from '@/lib/hooks/useAuth';
import VersionInviteDialog from './VersionInviteDialog';
import type { InviteCandidate, InviteKind } from './inviteVersions';

/** The ONE job a Create / Send popup serves — every opening names it, so a
 *  page whose rows span several jobs passes the job of the row(s) acted on. */
export interface InviteDialogJob {
  jdId: string;
  jdTitle: string;
  /** The display ID (JD-133). */
  jdCode?: string;
  /** The job version (V2) — the popup lists that version's assessments /
   *  AI interviews. */
  versionNumber?: number;
  /** 'Disabled' turns both types off, as on Job Details. */
  status?: string;
}

/** One opening: which popup, for which job, with which candidates ([] = none
 *  ticked; the popup's "Choose candidates in the next step" then applies). */
export interface InviteDialogRequest {
  kind: InviteKind;
  job: InviteDialogJob;
  candidates: InviteCandidate[];
}

/**
 * Create / Send Assessment | AI Interview for any page that is not Job
 * Details — the same VersionInviteDialog Job Details opens (pick a version,
 * or create the next; Next → the Share via Email step, which validates and
 * sends), wired the same way: the same "turned off" reasons, and the email
 * step as the popup's own second step. Render it with the page's open
 * request; null renders nothing. Job Details keeps its own mount because it
 * refreshes its own counts on send.
 */
export default function JobInviteDialogHost({
  request,
  onClose,
  onSent,
  inviteGate,
}: {
  request: InviteDialogRequest | null;
  onClose: () => void;
  /** Invitations went out — the host refreshes whatever it shows. */
  onSent?: (kind: InviteKind) => void;
  /** Host-specific invite permission per kind (AI Talent Match's entry points).
   *  Omitted = no extra gate. */
  inviteGate?: (kind: InviteKind) => { allowed: boolean; reason?: string };
}) {
  const { tenant } = useAuth();
  if (!request) return null;
  const { kind, job, candidates } = request;
  // Job Details' isFeatureEnabled: no tenant flags at all means enabled.
  const featureOn = (feature: 'assessment' | 'ai_interview') => {
    const features = tenant?.features as Record<string, unknown> | undefined;
    return !features || features[feature] === true;
  };
  const disabledReason = !featureOn(kind === 'assessment' ? 'assessment' : 'ai_interview')
    ? `${kind === 'assessment' ? 'Assessments are' : 'AI Interviews are'} not enabled for your workspace.`
    : job.status === 'Disabled'
      ? 'This job description is disabled, so nothing can be sent for it.'
      : null;
  return (
    <VersionInviteDialog
      kind={kind}
      onClose={onClose}
      jdId={job.jdId}
      jdCode={job.jdCode}
      jdTitle={job.jdTitle}
      jobVersionNumber={job.versionNumber && job.versionNumber > 0 ? job.versionNumber : undefined}
      candidates={candidates}
      disabledReason={disabledReason}
      onAssessmentsSent={() => onSent?.('assessment')}
      onInterviewsSent={(sent) => {
        toast.success(`${sent} AI interview invitation${sent === 1 ? '' : 's'} sent`);
        onSent?.('interview');
      }}
      onSent={(sentKind) => onSent?.(sentKind)}
      inviteAllowed={inviteGate ? inviteGate(kind).allowed : true}
      inviteDeniedReason={inviteGate ? inviteGate(kind).reason : undefined}
    />
  );
}
