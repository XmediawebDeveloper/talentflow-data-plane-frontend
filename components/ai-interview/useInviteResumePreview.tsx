'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import ResumeTextPreviewModal from '@/components/ResumeTextPreviewModal';
import {
  RESUME_EMAIL_MISMATCH_MESSAGE,
  emailsMatch,
  normalizeEmail,
  pickResumeByEmail,
  resumeEmailOf,
  verifyResumeBelongsToInvite,
} from '@/lib/utils/resumeEmailMatch';

/** The invite / session fields the resume lookup reads. */
export interface InviteResumeTarget {
  id: string;
  resume_id?: string | null;
  candidate_email?: string | null;
  candidate_name?: string | null;
  invite_source?: string | null;
}

/** Row ⋮ menus offer View Resume only for candidates invited from a resume ("Via Resume"). */
export const invitedViaResume = (inv: { invite_source?: string | null } | null | undefined): boolean =>
  inv?.invite_source === 'resume';

/**
 * The resume to show for an AI Interview invite / session — the result page's
 * rule, shared so every View Resume agrees:
 *
 * A linked resume_id is honoured only when that resume still exists and its
 * email is the invite's email (verifyResumeBelongsToInvite). Otherwise the
 * resume library is searched by exact email, with the name only breaking a tie
 * (pickResumeByEmail), so a reused address can't surface a stranger's resume.
 * `mismatch` is set when a linked resume exists but belongs to another email.
 */
export async function resolveInviteResumeId(target: {
  resumeId?: string | null;
  email?: string | null;
  name?: string | null;
}): Promise<{ id: string | null; mismatch: boolean }> {
  const email = normalizeEmail(target.email);
  if (!email) return { id: null, mismatch: false };
  const { resumeService } = await import('@/lib/services/resumeService');

  let mismatch = false;
  if (target.resumeId) {
    try {
      // get(id) without logView — an availability check, not a view.
      const verified = await verifyResumeBelongsToInvite(target.resumeId, email, (id) => resumeService.get(id));
      if (verified) return { id: verified, mismatch: false };
      mismatch = true;
    } catch (err) {
      // Couldn't verify the link — never show it unverified; the email
      // search below can still find the same resume.
      console.warn('[resolveInviteResumeId] Linked resume check failed:', err);
    }
  }

  try {
    // include_archived: an archived resume still exists — the resume_id path
    // opens it, so the email path must find it too.
    const results = await resumeService.list({ search: email, page_size: 50, include_archived: true });
    const match = pickResumeByEmail((results.items || []) as { id?: string; candidate_name?: string | null }[], email, target.name);
    return match?.id ? { id: match.id, mismatch: false } : { id: null, mismatch };
  } catch (err) {
    console.warn('[resolveInviteResumeId] Resume search failed:', err);
    return { id: null, mismatch };
  }
}

/**
 * View Resume for a row ⋮ menu: resolves the row's resume, records the view,
 * re-checks the email on the record actually shown, and opens it in the
 * shared preview popup (ResumeTextPreviewModal) — the AI Interview result
 * page's View Resume, from a table row. Render `modal` once in the table.
 */
export function useInviteResumePreview() {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ resumeId: string; title: string; subtitle?: string } | null>(null);

  const openResume = useCallback(async (inv: InviteResumeTarget) => {
    setLoadingId(inv.id);
    try {
      const { id, mismatch } = await resolveInviteResumeId({
        resumeId: inv.resume_id,
        email: inv.candidate_email,
        name: inv.candidate_name,
      });
      if (!id) {
        if (mismatch) toast.info(RESUME_EMAIL_MISMATCH_MESSAGE);
        else toast.info('Resume not available for this candidate.');
        return;
      }
      const { resumeService } = await import('@/lib/services/resumeService');
      // A genuine user view (logged); the email is re-checked on the record shown.
      const data = await resumeService.get(id, true);
      if (!emailsMatch(resumeEmailOf(data), inv.candidate_email)) {
        toast.info(RESUME_EMAIL_MISMATCH_MESSAGE);
        return;
      }
      setPreview({ resumeId: id, title: inv.candidate_name || 'Resume', subtitle: inv.candidate_email || undefined });
    } catch (err) {
      const e = err as { response?: { status?: number }; message?: string };
      // A linked resume deleted since the invite 404s — "not available", not a retry.
      if (e?.response?.status === 404 || /not found/i.test(e?.message || '')) {
        toast.info('Resume not available for this candidate.');
      } else {
        console.error('[useInviteResumePreview] Failed to load resume:', err);
        toast.error('Could not load the resume. Please try again.');
      }
    } finally {
      setLoadingId(null);
    }
  }, []);

  // z-[70]: opened from a row inside the Track popup (z-50) or one of its
  // dialogs (z-[60]), so it has to clear both.
  const modal: ReactNode = preview ? (
    <ResumeTextPreviewModal
      resumeId={preview.resumeId}
      title={preview.title}
      subtitle={preview.subtitle}
      zIndexClassName="z-[70]"
      onClose={() => setPreview(null)}
    />
  ) : null;

  return { openResume, loadingId, modal };
}
