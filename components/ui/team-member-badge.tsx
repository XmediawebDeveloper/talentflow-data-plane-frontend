import { UserX } from 'lucide-react';

/** Shown on a resume whose candidate_email matches an existing team member's
 *  login — uploads are blocked at the source now, but rows stored before that
 *  restriction existed (and matches AI Talent Match finds against them still)
 *  need to flag themselves as locked out. Shared across Resume Database and
 *  AI Talent Match. */
export const TeamMemberEmailBadge = () => (
  <span
    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-red-50 text-red-700 ring-1 ring-red-200 flex-shrink-0"
    title="This email belongs to an existing team member. It cannot be selected or used for any action."
  >
    <UserX className="w-3 h-3" />
    Existing Team Member
  </span>
);
