'use client';

import { InviteDialogMount, type InviteDialogJob } from './InviteDialogProvider';
import type { InviteCandidate, InviteKind } from './inviteVersions';

export type { InviteDialogJob };

/** One opening: which popup, for which job, with which candidates. */
export interface InviteDialogRequest {
  kind: InviteKind;
  job: InviteDialogJob;
  candidates: InviteCandidate[];
}

/**
 * Older host API for THE invite popup (pages that keep the request in their
 * own state). Renders the same popup `useInviteDialog().open()` does.
 */
export default function JobInviteDialogHost({
  request,
  onClose,
  onSent,
  inviteGate,
  openOn,
}: {
  request: InviteDialogRequest | null;
  onClose: () => void;
  onSent?: (kind: InviteKind) => void;
  inviteGate?: (kind: InviteKind) => { allowed: boolean; reason?: string };
  /** The page's own list tab, opened first (AI Talent Match / Score Resume). */
  openOn?: 'talent-match' | 'score-resume';
}) {
  if (!request) return null;
  return (
    <InviteDialogMount
      request={{
        kind: request.kind,
        job: request.job,
        candidates: request.candidates,
        inviteGate: inviteGate?.(request.kind),
        onSent: (k) => onSent?.(k),
        openOn,
      }}
      onClose={onClose}
    />
  );
}
