'use client';

import { useState } from 'react';
import { Plus, Users, Crown, Check, ArrowLeft, ArrowRight, Pencil } from 'lucide-react';
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

type Step = 1 | 2;

const STEPS: { step: Step; label: string; hint: string }[] = [
  { step: 1, label: 'Profile', hint: 'Name and purpose' },
  { step: 2, label: 'Members & lead', hint: 'Who is on the team' },
];

/**
 * Create / Edit Team as a two-step wizard: 1) name + description,
 * 2) members + lead. Create walks the steps in order (Next needs a valid
 * name); Edit can jump between them and save from either.
 */
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
  const [step, setStep] = useState<Step>(1);
  // Name errors show once the field has been left (or Next / a submit was tried) —
  // except "already taken", which shows as soon as it's true.
  const [nameTouched, setNameTouched] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const isEdit = mode === 'edit';

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

  // ── Inline validation ──
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

  const leadUser = teamLeadId ? availableUsers.find((u) => u.id === teamLeadId) : undefined;
  const initials = trimmedName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

  // ── Unsaved changes ──
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

  /** Step 2 needs a valid name first — otherwise stay and show why. */
  const goTo = (next: Step) => {
    if (next === 2) {
      setNameTouched(true);
      if (!isValid) return;
    }
    setStep(next);
  };

  const handleSubmit = async () => {
    setNameTouched(true);
    if (!isValid) {
      setStep(1);
      return;
    }
    if (isSubmitting) return;
    await onSubmit({
      name: trimmedName,
      description: description.trim(),
      memberIds: selectedMemberIds,
      teamLeadId,
    });
  };

  // ── Footer, left → right: Back · Next · Delete Team · Save Changes / Create Team ──
  const busy = isSubmitting || isDeleting;
  const backAction: AppModalAction = {
    label: 'Back',
    onClick: () => goTo(1),
    variant: 'secondary',
    disabled: busy || step === 1,
    icon: <ArrowLeft className="h-4 w-4" />,
  };
  const nextAction: AppModalAction = {
    label: 'Next',
    onClick: () => goTo(2),
    // Create's main step-1 action; in Edit, Save is always the primary.
    variant: isEdit ? 'secondary' : 'primary',
    disabled: busy || step === 2,
    icon: <ArrowRight className="h-4 w-4" />,
    title: step === 1 && nameError && nameTouched ? nameError : undefined,
  };
  const submitAction: AppModalAction = {
    label: isSubmitting ? (isEdit ? 'Saving...' : 'Creating...') : isEdit ? 'Save Changes' : 'Create Team',
    onClick: handleSubmit,
    disabled: busy || !isValid,
    loading: isSubmitting,
    icon: isEdit ? undefined : <Plus className="h-4 w-4" />,
    title: !isValid && nameError ? nameError : undefined,
  };
  const actions: AppModalAction[] = [];
  if (isEdit) {
    // Edit: all four, always in the same place — Back / Next grey out on the step
    // where they don't apply, and Save works from either step.
    actions.push(backAction, nextAction);
    if (onDelete) {
      actions.push({
        label: isDeleting ? 'Deleting...' : 'Delete Team',
        onClick: canDelete ? onDelete : () => {},
        variant: 'destructive',
        disabled: busy || !canDelete,
        loading: isDeleting,
        title: !canDelete ? 'You do not have permission to delete teams' : undefined,
      });
    }
    actions.push(submitAction);
  } else {
    // Create walks the steps: step 1 → Next, step 2 → Back + Create Team.
    actions.push(...(step === 1 ? [nextAction] : [backAction, submitAction]));
  }

  return (
    <>
      <AppModal
        tone="plain"
        open={isOpen && !confirmDiscard}
        onCancel={requestClose}
        cancelDisabled={isSubmitting}
        cancelLabel={cancelLabel}
        // ✕ in the header instead of the footer Cancel / Back — same handler, so
        // unsaved edits still ask "Discard changes?" first.
        closeButton
        // Same width as Team Details, so switching modes doesn't resize the popup.
        widthClassName={TEAM_MODAL_WIDTH}
        // Phones: full-screen sheet with the buttons pinned at the bottom.
        mobileSheet
        zIndexClass="z-50"
        icon={<Users />}
        title={isEdit ? 'Edit Team' : 'Create New Team'}
        subtitle={`Step ${step} of 2 · ${STEPS[step - 1].label}`}
        actions={actions}
        footerStart={
          step === 2 ? (
            <span className="text-xs">
              {selectedMemberIds.length === 0
                ? 'No members selected — you can add them later'
                : `${selectedMemberIds.length} ${selectedMemberIds.length === 1 ? 'member' : 'members'}${leadUser ? ` · Lead: ${leadUser.name}` : ' · No lead'}`}
            </span>
          ) : undefined
        }
      >
        {/* Progress — two segments; a step is clickable once it can be reached. */}
        <ol className="mb-6 grid grid-cols-2 gap-3" aria-label="Steps">
          {STEPS.map((s) => {
            const active = step === s.step;
            const done = step > s.step;
            const reachable = s.step === 1 || isValid;
            return (
              <li key={s.step}>
                <button
                  type="button"
                  onClick={() => goTo(s.step)}
                  disabled={busy || (!reachable && !active)}
                  aria-current={active ? 'step' : undefined}
                  className="group w-full text-left disabled:cursor-not-allowed"
                >
                  <span
                    className={`block h-1.5 rounded-full transition-colors ${
                      step >= s.step ? 'bg-brand-blue' : 'bg-gray-200 dark:bg-slate-700'
                    }`}
                  />
                  <span className="mt-2.5 flex items-center gap-2.5">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                        done
                          ? 'bg-brand-blue text-white'
                          : active
                            ? 'bg-brand-blue/10 text-brand-blue ring-2 ring-brand-blue dark:bg-brand-blue/20 dark:text-blue-300'
                            : 'bg-gray-100 text-gray-400 dark:bg-slate-800 dark:text-slate-500'
                      }`}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : s.step}
                    </span>
                    <span className="min-w-0">
                      <span
                        className={`block truncate text-sm font-semibold ${
                          active || done ? 'text-gray-900 dark:text-slate-50' : 'text-gray-400 dark:text-slate-500'
                        } ${reachable && !active ? 'group-hover:text-brand-blue' : ''}`}
                      >
                        {s.label}
                      </span>
                      <span className="block truncate text-xs text-gray-500 dark:text-slate-400">{s.hint}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {step === 1 ? (
          /* ── Step 1: a focused, single column ── */
          <div className="mx-auto max-w-xl space-y-6 pb-2">
            <div>
              <label htmlFor="team-name" className="mb-2 block text-base font-semibold text-gray-900 dark:text-slate-50">
                What should we call this team? <span className="text-brand-blue">*</span>
              </label>
              <div className="relative">
                <span
                  aria-hidden
                  className={`pointer-events-none absolute left-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-xs font-bold tracking-wide transition-colors ${
                    initials ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-400 dark:bg-slate-800 dark:text-slate-500'
                  }`}
                >
                  {initials || <Users className="h-4 w-4" />}
                </span>
                <input
                  id="team-name"
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  onBlur={() => setNameTouched(true)}
                  onKeyDown={(e) => {
                    // Enter: Create → next step; Edit → save.
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (isEdit) void handleSubmit();
                      else goTo(2);
                    }
                  }}
                  placeholder="e.g., Engineering Recruitment"
                  maxLength={NAME_MAX}
                  autoFocus
                  aria-invalid={showNameError}
                  aria-describedby={showNameError ? 'team-name-error' : undefined}
                  className={`${fieldClassName} py-3.5 pl-14 text-base max-sm:text-sm ${showNameError ? fieldError : fieldOk}`}
                />
              </div>
              <div className="mt-1.5 flex min-h-[1rem] items-start justify-between gap-2 text-xs">
                {showNameError ? (
                  <p id="team-name-error" className="font-medium text-destructive">{nameError}</p>
                ) : (
                  <span className="text-gray-400 dark:text-slate-500">Team names must be unique.</span>
                )}
                {teamName.length >= NAME_MAX * COUNTER_FROM && (
                  <span className="shrink-0 tabular-nums text-gray-500 dark:text-slate-500">{teamName.length}/{NAME_MAX}</span>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="team-description" className="mb-2 block text-base font-semibold text-gray-900 dark:text-slate-50">
                What does it do? <span className="text-sm font-normal text-gray-400 dark:text-slate-500">(optional)</span>
              </label>
              <textarea
                id="team-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Hires engineers for the platform and data teams."
                maxLength={DESCRIPTION_MAX}
                rows={4}
                className={`${fieldClassName} ${fieldOk} resize-y py-3 text-sm`}
              />
              {description.length >= DESCRIPTION_MAX * COUNTER_FROM && (
                <p className="mt-1.5 text-right tf-meta tabular-nums">
                  {description.length}/{DESCRIPTION_MAX}
                </p>
              )}
            </div>

            <p className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400">
              <ArrowRight className="h-3.5 w-3.5 shrink-0 text-brand-blue" />
              Next, you&rsquo;ll pick the members and, optionally, a team lead.
            </p>
          </div>
        ) : (
          /* ── Step 2: who's on the team ── */
          <div className="space-y-4">
            {/* The team being built, with a quick way back to its profile. */}
            <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/70 px-3 py-2.5 dark:border-slate-700/60 dark:bg-slate-800/40">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-blue text-xs font-bold tracking-wide text-white">
                {initials || <Users className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-900 dark:text-slate-50">{trimmedName}</p>
                <p className="truncate text-xs text-gray-500 dark:text-slate-400">{description.trim() || 'No description'}</p>
              </div>
              {leadUser && (
                <span className="hidden shrink-0 items-center gap-1 rounded-full bg-brand-orange/10 px-2 py-0.5 text-xs font-medium text-brand-orange-deep ring-1 ring-brand-orange/20 sm:inline-flex">
                  <Crown className="h-3 w-3" />
                  {leadUser.name}
                </span>
              )}
              <button
                type="button"
                onClick={() => goTo(1)}
                disabled={busy}
                className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-blue hover:bg-brand-blue/5 disabled:opacity-50"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
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
        )}
      </AppModal>

      <ConfirmationDialog
        isOpen={isOpen && confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
        title="Discard changes?"
        description={isEdit ? 'Your changes to this team won’t be saved.' : 'The team you started won’t be created.'}
        confirmText="Discard"
        cancelText="Keep editing"
        variant="warning"
      />
    </>
  );
}
