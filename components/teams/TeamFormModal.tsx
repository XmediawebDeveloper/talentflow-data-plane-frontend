'use client';

import { useState } from 'react';
import { Plus, Users } from 'lucide-react';
import AppModal, { AppModalAction } from '@/components/ui/app-modal';
import { ApiUser } from '@/lib/services/userService';
import MemberSelector from './MemberSelector';

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
  isSubmitting?: boolean;
  onDelete?: () => void;
  isDeleting?: boolean;
}

export interface TeamFormData {
  name: string;
  description: string;
  memberIds: string[];
  teamLeadId: string;
}

const fieldClassName =
  'w-full rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10';

export default function TeamFormModal({
  isOpen,
  onClose,
  onSubmit,
  mode,
  initialData,
  availableUsers,
  isSubmitting = false,
  onDelete,
  isDeleting = false,
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
      onClick: onDelete,
      variant: 'destructive',
      disabled: isSubmitting || isDeleting,
      loading: isDeleting,
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
      size="md"
      zIndexClass="z-50"
      icon={<Users />}
      title={mode === 'create' ? 'Create New Team' : 'Edit Team'}
      subtitle="Define the team profile, assign members, and optionally choose a lead."
      actions={actions}
    >
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="team-name" className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
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
              <p className="mt-2 text-xs text-gray-500 dark:text-slate-500">{teamName.length}/255 characters</p>
            </div>

            <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-gray-50 dark:bg-slate-800/50 p-4 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
              <div className="text-xs uppercase tracking-[0.16em] text-gray-400 dark:text-slate-500">Selected Members</div>
              <div className="mt-2 text-3xl font-semibold tracking-tight text-gray-900 dark:text-slate-50">{selectedMemberIds.length}</div>
              <p className="mt-1 text-sm text-gray-500 dark:text-slate-500">
                {teamLeadId ? 'Team lead assigned' : 'No lead assigned yet'}
              </p>
            </div>
          </div>

          <div>
            <label htmlFor="team-description" className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
              Description
            </label>
            <textarea
              id="team-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe this team's purpose..."
              maxLength={1000}
              rows={4}
              className={`${fieldClassName} resize-y`}
            />
            <p className="mt-2 text-xs text-gray-500 dark:text-slate-500">{description.length}/1000 characters</p>
          </div>

          <MemberSelector
            availableUsers={availableUsers}
            selectedMemberIds={selectedMemberIds}
            onToggleMember={handleToggleMember}
            teamLeadId={teamLeadId}
            onTeamLeadChange={setTeamLeadId}
            showTeamLeadSelector={true}
          />
        </div>

    </AppModal>
  );
}
