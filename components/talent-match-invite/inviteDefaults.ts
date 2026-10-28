/*
 * The invite popup's defaults — ONE place for every Assessment / AI Interview
 * invite (InvitePopup = VersionInviteDialog). Change a default here and every
 * Invite / Send / Invite More / Share button follows.
 */
import type { InviteKind } from './inviteVersions';

/** Link expiry the popup opens with. */
export const DEFAULT_EXPIRY_DAYS = 1;

export const EXPIRY_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: '1 day' },
  { value: 3, label: '3 days' },
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 0, label: 'No expiry' },
];

/** Replaced with each candidate's name when the email is sent. */
export const CANDIDATE_NAME_PLACEHOLDER = '[Candidate Name]';

/** The editable message the popup opens with (the invitation email's body text). */
export function defaultInviteMessage(
  kind: InviteKind,
  ctx: { jobTitle?: string | null; companyName?: string | null; location?: string | null },
): string {
  const job = (ctx.jobTitle || '').trim() || 'the role';
  const company = (ctx.companyName || '').trim() || 'our company';
  const where = (ctx.location || '').trim() ? ` in ${ctx.location!.trim()}` : '';
  return kind === 'interview'
    ? `You have been invited to complete an AI interview for the ${job} role at ${company}${where}. Please use the secure link below and complete it in one sitting. Before you begin, make sure your camera, microphone, and internet connection are ready.`
    : `You have been invited to take an assessment for the ${job} role at ${company}${where}.\n\nImportant Instructions:\n• Ensure you have a stable internet connection\n• Find a quiet place without distractions\n• Complete the assessment in one sitting\n• Your responses will be automatically saved\n\nGood luck!`;
}
