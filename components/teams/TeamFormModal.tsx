'use client';

import { useState } from 'react';
import { Plus, Users } from 'lucide-react';
import AppModal, { AppModalAction } from '@/components/ui/app-modal';
import { ApiUser } from '@/lib/services/userService';
import MemberSelector from './MemberSelector';
import { TEAM_MODAL_WIDTH } from './TeamDetailsModal';

interface TeamFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: TeamFormData) => Promise<void>;
  mode: 'create' | 'edit';
  initialData?: {
    name: string;
    description: string;
    memberIds: string[];
    teamLeadId: string;
  };
  availableUsers: ApiUser[];
  /** The user list is still loading — the picker shows a loader, not "No users available". */
  isLoadingUsers?: boolean;
  /** Active users left out of the picker because they already belong to another team. */
  hiddenUsersCount?: number;
  isSubmitting?: boolean;
  onDelete?: () => void;
  /** false = user lacks teams:delete — Delete stays visible but greyed with a tooltip. */
  canDelete?: boolean;
  isDeleting?: boolean;
  /** Footer Cancel label — "Back" when the form was opened from Team Details. */
  cancelLabel?: string;
}

export interface TeamFormData {
  name: string;
  description: string;
  memberIds: string[];
  teamLeadId: string;
}

const fieldClassName =
  'w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm max-sm:text-[13px] text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10';

export default function TeamFormModal({
  isOpen,
  onClose,
  onSubmit,
  mode,
  initialData,
  availableUsers,
  isLoadingUsers = false,
  hiddenUsersCount = 0,
  isSubmitting = false,
  onDelete,
  canDelete = true,
  isDeleting = false,
  cancelLabel,
}: TeamFormModalProps) {
  const [teamName, setTeamName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>(initialData?.memberIds || []);
  const [teamLeadId, setTeamLeadId] = useState(initialData?.teamLeadId || '');

  const handleToggleMember = (userId: string) => {
    setSelectedMemberIds((prev) => {
      if (prev.includes(userId)) {
        if (teamLeadId === userId) {
          setTeamLeadId('');
        }
        return prev.filter((id) => id !== userId);
      }
      return [...prev, userId];
    });
  };

  const handleSubmit = async () => {
    await onSubmit({
      name: teamName.trim(),
      description: description.trim(),
      memberIds: selectedMemberIds,
      teamLeadId,
    });
  };

  const isValid = teamName.trim().length >= 2;

  const actions: AppModalAction[] = [];
  if (mode === 'edit' && onDelete) {
    actions.push({
      label: isDeleting ? 'Deleting...' : 'Delete Team',
      onClick: canDelete ? onDelete : () => {},
      variant: 'destructive',
      disabled: isSubmitting || isDeleting || !canDelete,
      loading: isDeleting,
      title: !canDelete ? 'You do not have permission to delete teams' : undefined,
    });
  }
  actions.push({
    label: isSubmitting ? (mode === 'create' ? 'Creating...' : 'Saving...') : mode === 'create' ? 'Create Team' : 'Save Changes',
    onClick: handleSubmit,
    disabled: isSubmitting || isDeleting || !isValid,
    loading: isSubmitting,
    icon: mode === 'create' ? <Plus className="h-4 w-4" /> : undefined,
  });

  return (
    <AppModal
      open={isOpen}
      onCancel={onClose}
      cancelDisabled={isSubmitting}
      cancelLabel={cancelLabel}
      // Same width as Team Details, so switching modes doesn't resize the popup.
      widthClassName={TEAM_MODAL_WIDTH}
      zIndexClass="z-50"
      icon={<Users />}
      title={mode === 'create' ? 'Create New Team' : 'Edit Team'}
      subtitle="Define the team profile, assign members, and optionally choose a lead."
      actions={actions}
    >
        {/* Two columns on the wider popup: profile left, members right — keeps
            the form short instead of stacking everything. The member count and
            lead status live in MemberSelector, so no separate summary box. */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-5">
            <div>
              <label htmlFor="team-name" className="mb-2 block text-sm max-sm:text-[13px] font-medium text-gray-700 dark:text-slate-300">
                Team Name <span className="text-brand-blue">*</span>
              </label>
              <input
                id="team-name"
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g., Engineering Recruitment"
                maxLength={255}
                className={fieldClassName}
              />
              <p className="mt-1.5 text-xs text-gray-500 dark:text-slate-500">{teamName.length}/255 characters</p>
            </div>

            <div>
              <label htmlFor="team-description" className="mb-2 block text-sm max-sm:text-[13px] font-medium text-gray-700 dark:text-slate-300">
                Description
              </label>
              <textarea
                id="team-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Briefly describe this team's purpose..."
                maxLength={1000}
                rows={5}
                className={`${fieldClassName} resize-y`}
              />
              <p className="mt-1.5 text-xs text-gray-500 dark:text-slate-500">{description.length}/1000 characters</p>
            </div>
          </div>

          <MemberSelector
            availableUsers={availableUsers}
            isLoading={isLoadingUsers}
            selectedMemberIds={selectedMemberIds}
            onToggleMember={handleToggleMember}
            teamLeadId={teamLeadId}
            onTeamLeadChange={setTeamLeadId}
            showTeamLeadSelector={true}
            footnote={
              !isLoadingUsers && hiddenUsersCount > 0
                ? `${hiddenUsersCount} ${hiddenUsersCount === 1 ? 'user is' : 'users are'} already in another team, so not listed — a user can belong to one team.`
                : undefined
            }
          />
        </div>

    </AppModal>
  );
}
