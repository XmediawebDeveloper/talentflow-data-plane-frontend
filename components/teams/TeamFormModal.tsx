'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, Plus } from 'lucide-react';
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
  const [teamName, setTeamName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [teamLeadId, setTeamLeadId] = useState('');

  // Reset form when modal opens/closes or initialData changes
  useEffect(() => {
    if (isOpen && initialData) {
      setTeamName(initialData.name);
      setDescription(initialData.description);
      setSelectedMemberIds(initialData.memberIds);
      setTeamLeadId(initialData.teamLeadId);
    } else if (isOpen && !initialData) {
      setTeamName('');
      setDescription('');
      setSelectedMemberIds([]);
      setTeamLeadId('');
    }
  }, [isOpen, initialData]);

  const handleToggleMember = (userId: string) => {
    setSelectedMemberIds((prev) => {
      if (prev.includes(userId)) {
        // If deselecting and this is the team lead, clear team lead
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-2xl font-bold text-gray-900">
            {mode === 'create' ? 'Create New Team' : 'Edit Team'}
          </h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Close modal"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {/* Team Name */}
          <div>
            <label htmlFor="team-name" className="block text-sm font-medium text-gray-700 mb-2">
              Team Name <span className="text-red-500">*</span>
            </label>
            <input
              id="team-name"
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g., Engineering Recruitment"
              maxLength={255}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent outline-none"
            />
            <p className="text-xs text-gray-500 mt-1">{teamName.length}/255 characters</p>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="team-description" className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              id="team-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Briefly describe this team's purpose..."
              maxLength={1000}
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent outline-none resize-none"
            />
            <p className="text-xs text-gray-500 mt-1">{description.length}/1000 characters</p>
          </div>

          {/* Member Selector */}
          <MemberSelector
            availableUsers={availableUsers}
            selectedMemberIds={selectedMemberIds}
            onToggleMember={handleToggleMember}
            teamLeadId={teamLeadId}
            onTeamLeadChange={setTeamLeadId}
            showTeamLeadSelector={true}
          />
        </div>

        {/* Modal Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 space-y-3">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isSubmitting || isDeleting}
              className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || isDeleting || !isValid}
              className="flex-1 px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {mode === 'create' ? 'Creating...' : 'Saving...'}
                </>
              ) : (
                <>
                  {mode === 'create' && <Plus className="w-4 h-4" />}
                  {mode === 'create' ? 'Create Team' : 'Save Changes'}
                </>
              )}
            </button>
          </div>
          {mode === 'edit' && onDelete && (
            <button
              onClick={onDelete}
              disabled={isSubmitting || isDeleting}
              className="w-full px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Deleting...
                </>
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
