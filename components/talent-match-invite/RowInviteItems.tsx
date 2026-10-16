'use client';

import { ClipboardList, Video } from 'lucide-react';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useScoringActionPermissions } from '@/components/ScoredResumesTable';
import type { InviteKind } from './inviteVersions';

/* The Scored Resumes row ⋮ menu's item class — the entries below are that
   table's invite items (renderInviteMenuItems, the onOpenInviteDialog branch). */
const MENU_ITEM_CLASS = 'group !rounded-none !px-4 !py-2.5 text-sm text-gray-700';

/**
 * Create / Send Assessment | Create / Send AI Interview — the Job Details
 * Resume Scoring row's invite entries, straight in the other Job Details
 * result tables' row ⋮ menus (no Invite ▸ submenu). `onInvite` opens the
 * host's version popup of that type for this row's candidate; gated by the
 * same permission reads.
 */
export default function RowInviteItems({ onInvite }: { onInvite: (kind: InviteKind) => void }) {
  const { canCreateAssessments, assessmentDeniedReason, mayInviteAIInterview, aiInterviewDeniedReason } =
    useScoringActionPermissions(true);
  return (
    <>
      <DropdownMenuItem
        className={MENU_ITEM_CLASS}
        disabled={!canCreateAssessments}
        title={!canCreateAssessments ? assessmentDeniedReason : undefined}
        onSelect={() => onInvite('assessment')}
      >
        <ClipboardList className="w-4 h-4 text-menu-icon-view" />
        <span className={MENU_ITEM_SCALE_CLASS}>Create / Send Assessment</span>
      </DropdownMenuItem>
      <DropdownMenuItem
        className={MENU_ITEM_CLASS}
        disabled={!mayInviteAIInterview}
        title={!mayInviteAIInterview ? aiInterviewDeniedReason : undefined}
        onSelect={() => onInvite('interview')}
      >
        <Video className="w-4 h-4 text-menu-icon-ai" />
        <span className={MENU_ITEM_SCALE_CLASS}>Create / Send AI Interview</span>
      </DropdownMenuItem>
    </>
  );
}
