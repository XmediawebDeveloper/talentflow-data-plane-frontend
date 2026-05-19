'use client';

import { useState } from 'react';
import { X, Loader2, Plus, Users, Layers3 } from 'lucide-react';
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
  'w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm text-gray-900 dark:text-slate-50 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10';

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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/40 bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-black/5">
        <div className="sticky top-0 z-10 overflow-hidden border-b border-white/10 bg-brand-blue px-6 py-5 text-white">
          <div className="pointer-events-none absolute -top-10 right-0 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-white/90 ring-1 ring-white/15">
                  <Layers3 className="h-3 w-3 text-brand-orange" />
                  {mode === 'create' ? 'New team setup' : 'Team configuration'}
                </div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  {mode === 'create' ? 'Create New Team' : 'Edit Team'}
                </h2>
                <p className="mt-1 text-sm text-white/80">
                  Define the team profile, assign members, and optionally choose a lead.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/15 disabled:opacity-50"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-6 p-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <label htmlFor="team-name" className="mb-2 block text-sm font-medium text-gray-700 dark:text-slate-300">
                Team Name <span className="text-brand-orange">*</span>
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

        <div className="sticky bottom-0 space-y-3 border-t border-gray-100 dark:border-slate-700/60 bg-white/95 dark:bg-slate-900 px-6 py-4 backdrop-blur-sm">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isSubmitting || isDeleting}
              className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-300 transition-all hover:border-gray-300 dark:hover:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || isDeleting || !isValid}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-brand-blue px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-blue/25 transition-all hover:-translate-y-0.5 hover:shadow-lg disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {mode === 'create' ? 'Creating...' : 'Saving...'}
                </>
              ) : (
                <>
                  {mode === 'create' && <Plus className="h-4 w-4" />}
                  {mode === 'create' ? 'Create Team' : 'Save Changes'}
                </>
              )}
            </button>
          </div>
          {mode === 'edit' && onDelete && (
            <button
              onClick={onDelete}
              disabled={isSubmitting || isDeleting}
              className="w-full rounded-xl border border-brand-orange/20 bg-brand-orange/[0.08] px-4 py-2.5 text-sm font-medium text-brand-orange-deep transition-all hover:bg-brand-orange/[0.12] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeleting ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </span>
              ) : (
                'Delete Team'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
