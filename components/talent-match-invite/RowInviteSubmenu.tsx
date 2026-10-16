'use client';

import { ClipboardList, UserPlus, Video } from 'lucide-react';
import { MENU_ITEM_SCALE_CLASS } from '@/lib/constants/menuAnimation';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import { PLAN_LOCKED_MESSAGE } from '@/lib/types/planFeatures';
import { useScoringActionPermissions } from '@/components/ScoredResumesTable';
import type { InviteKind } from './inviteVersions';

/* The Scored Resumes row ⋮ menu's item class — the submenu below is that
   table's Invite (renderInviteSubmenu, the onOpenInviteDialog branch). */
const MENU_ITEM_CLASS = 'group !rounded-none !px-4 !py-2.5 text-sm text-gray-700';

/**
 * Invite ▸ Create / Send Assessment | Create / Send AI Interview — the
 * Scored Resumes row's Invite submenu, for the other Job Details result
 * tables' row ⋮ menus. `onInvite` opens the host's version popup of that
 * type for this row's candidate; gated by the same permission reads.
 */
export default function RowInviteSubmenu({ onInvite }: { onInvite: (kind: InviteKind) => void }) {
  const { canCreateAssessments, assessmentDeniedReason, mayInviteAIInterview, aiInterviewDeniedReason, invitePlanLocked } =
    useScoringActionPermissions(true);
  const inviteDisabled = !canCreateAssessments && !mayInviteAIInterview;
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        className={`${MENU_ITEM_CLASS} ${inviteDisabled ? 'text-gray-400 opacity-60' : ''}`}
        disabled={inviteDisabled}
        title={inviteDisabled ? (invitePlanLocked ? PLAN_LOCKED_MESSAGE : 'You do not have permission to invite candidates') : undefined}
      >
        <UserPlus className="w-4 h-4 text-menu-icon-share" />
        <span className={MENU_ITEM_SCALE_CLASS}>Invite</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-64 !rounded-lg !bg-white !py-1 !px-0 !shadow-xl">
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
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
