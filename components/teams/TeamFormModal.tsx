'use client';

import { useState } from 'react';
import { Plus, Users } from 'lucide-react';
import AppModal, { AppModalAction } from '@/components/ui/app-modal';
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog';
import { ApiUser } from '@/lib/services/userService';
import MemberSelector, { type UnavailableUser } from './MemberSelector';
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
  /** Users already in another team — listed greyed with that team's name. */
  unavailableUsers?: UnavailableUser[];
  /** True when another team already has this name (checked while typing). */
  isNameTaken?: (name: string) => boolean;
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

const NAME_MAX = 255;
const DESCRIPTION_MAX = 1000;
// Character counters only appear near the limit.
const COUNTER_FROM = 0.8;

const fieldClassName =
  'w-full rounded-lg border bg-white dark:bg-slate-900 px-3 py-2.5 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:ring-4';
const fieldOk = 'border-gray-200 dark:border-slate-700 focus:border-brand-blue/30 focus:ring-brand-blue/10';
const fieldError = 'border-destructive/60 focus:border-destructive focus:ring-destructive/10';

const sameMembers = (a: string[], b: string[]) => a.length === b.length && a.every((id) => b.includes(id));

export default function TeamFormModal({
  isOpen,
  onClose,
  onSubmit,
  mode,
  initialData,
  availableUsers,
  isLoadingUsers = false,
  unavailableUsers = [],
  isNameTaken,
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
  // Name errors show once the field has been left (or a submit was tried) —
  // except "already taken", which shows as soon as it's true.
  const [nameTouched, setNameTouched] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const handleToggleMember = (userId: string) => {
    setSelectedMemberIds((prev) => {
      if (prev.includes(userId)) {
        if (teamLeadId === userId) setTeamLeadId('');
        return prev.filter((id) => id !== userId);
      }
      return [...prev, userId];
    });
  };

  const handleSetMembers = (ids: string[]) => {
    setSelectedMemberIds(ids);
    if (teamLeadId && !ids.includes(teamLeadId)) setTeamLeadId('');
  };

  // ── Inline validation (was toast-only, after clicking Create) ──
  const trimmedName = teamName.trim();
  const nameTaken = trimmedName.length >= 2 && !!isNameTaken?.(trimmedName);
  const nameError = !trimmedName
    ? 'Enter a team name'
    : trimmedName.length < 2
      ? 'Team name must be at least 2 characters'
      : nameTaken
        ? `A team named “${trimmedName}” already exists`
        : null;
  const showNameError = !!nameError && (nameTouched || nameTaken);
  const isValid = !nameError;

  // ── Unsaved changes (closing used to drop them silently) ──
  const isDirty =
    teamName !== (initialData?.name || '') ||
    description !== (initialData?.description || '') ||
    !sameMembers(selectedMemberIds, initialData?.memberIds || []) ||
    teamLeadId !== (initialData?.teamLeadId || '');

  const requestClose = () => {
    if (isSubmitting) return;
    if (isDirty) setConfirmDiscard(true);
    else onClose();
  };

  const handleSubmit = async () => {
    setNameTouched(true);
    if (!isValid || isSubmitting) return;
    await onSubmit({
      name: trimmedName,
      description: description.trim(),
      memberIds: selectedMemberIds,
      teamLeadId,
    });
  };

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
    title: !isValid && nameError ? nameError : undefined,
  });

  return (
    <>
      <AppModal
        open={isOpen && !confirmDiscard}
        onCancel={requestClose}
        cancelDisabled={isSubmitting}
        cancelLabel={cancelLabel}
        // Same width as Team Details, so switching modes doesn't resize the popup.
        widthClassName={TEAM_MODAL_WIDTH}
        // Phones: full-screen sheet with the Cancel / Create buttons pinned at the bottom.
        mobileSheet
        zIndexClass="z-50"
        icon={<Users />}
        title={mode === 'create' ? 'Create New Team' : 'Edit Team'}
        subtitle="Define the team profile, assign members, and optionally choose a lead."
        actions={actions}
      >
        {/* Two columns on the wider popup: profile left, members right — keeps
            the form short instead of stacking everything. */}
        <div className="tf-grid-split">
          <div className="space-y-5">
            <div>
              <label htmlFor="team-name" className="mb-2 block tf-label">
                Team Name <span className="text-brand-blue">*</span>
              </label>
              <input
                id="team-name"
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                onBlur={() => setNameTouched(true)}
                onKeyDown={(e) => {
                  // Enter saves when the form is valid.
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void handleSubmit();
                  }
                }}
                placeholder="e.g., Engineering Recruitment"
                maxLength={NAME_MAX}
                autoFocus
                aria-invalid={showNameError}
                aria-describedby={showNameError ? 'team-name-error' : undefined}
                className={`${fieldClassName} ${showNameError ? fieldError : fieldOk}`}
              />
              <div className="mt-1.5 flex items-start justify-between gap-2 text-xs">
                {showNameError ? (
                  <p id="team-name-error" className="font-medium text-destructive">{nameError}</p>
                ) : (
                  <span />
                )}
                {teamName.length >= NAME_MAX * COUNTER_FROM && (
                  <span className="shrink-0 tabular-nums text-gray-500 dark:text-slate-500">{teamName.length}/{NAME_MAX}</span>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="team-description" className="mb-2 block tf-label">
                Description
              </label>
              <textarea
                id="team-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Briefly describe this team's purpose..."
                maxLength={DESCRIPTION_MAX}
                rows={5}
                className={`${fieldClassName} ${fieldOk} resize-y`}
              />
              {description.length >= DESCRIPTION_MAX * COUNTER_FROM && (
                <p className="mt-1.5 text-right tf-meta tabular-nums">
                  {description.length}/{DESCRIPTION_MAX}
                </p>
              )}
            </div>
          </div>

          <MemberSelector
            availableUsers={availableUsers}
            isLoading={isLoadingUsers}
            selectedMemberIds={selectedMemberIds}
            onToggleMember={handleToggleMember}
            onSetMembers={handleSetMembers}
            teamLeadId={teamLeadId}
            onTeamLeadChange={setTeamLeadId}
            showTeamLeadSelector
            unavailableUsers={isLoadingUsers ? [] : unavailableUsers}
          />
        </div>
      </AppModal>

      <ConfirmationDialog
        isOpen={isOpen && confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
        title="Discard changes?"
        description={mode === 'create' ? 'The team you started won’t be created.' : 'Your changes to this team won’t be saved.'}
        confirmText="Discard"
        cancelText="Keep editing"
        variant="warning"
      />
    </>
  );
}
