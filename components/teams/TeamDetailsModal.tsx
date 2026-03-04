'use client';

import { X, Users } from 'lucide-react';
import { Team } from '@/lib/services/teamService';

interface TeamDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  team: Team | null;
  userRole?: string;
}

export default function TeamDetailsModal({ isOpen, onClose, team }: TeamDetailsModalProps) {
  if (!isOpen || !team) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 z-10">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">Team Details</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {/* Team Info */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{team.name}</h3>
            {team.description && (
              <p className="text-gray-600 mb-4">{team.description}</p>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Members</p>
                <p className="text-2xl font-bold text-gray-900">{team.member_count}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Active Jobs</p>
                <p className="text-2xl font-bold text-gray-900">{team.active_jobs_count}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Resumes</p>
                <p className="text-2xl font-bold text-gray-900">{team.resumes_count}</p>
              </div>
            </div>
          </div>

          {/* Team Lead */}
          {team.team_lead && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Team Lead</h4>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-white font-semibold">
                  {team.team_lead.initials || 'TL'}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{team.team_lead.name}</p>
                  <p className="text-sm text-gray-500">{team.team_lead.email}</p>
                </div>
                <span className="text-xs px-2 py-1 bg-gray-800 text-white rounded">Lead</span>
              </div>
            </div>
          )}

          {/* Team Members */}
          <div>
            <h4 className="text-sm font-medium text-gray-700 mb-3">
              Team Members ({team.members?.length || 0})
            </h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {team.members && team.members.length > 0 ? (
                team.members.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center text-white font-semibold">
                      {member.initials || 'U'}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{member.name}</p>
                      <p className="text-sm text-gray-500">{member.email}</p>
                    </div>
                    {member.role && (
                      <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                        {member.role}
                      </span>
                    )}
                    {team.team_lead?.id === member.id && (
                      <span className="text-xs px-2 py-1 bg-gray-800 text-white rounded ml-1">
                        Lead
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-center py-8 text-gray-500">
                  <Users className="w-6 h-6 mr-2" />
                  <p className="text-sm">No members</p>
                </div>
              )}
            </div>
          </div>

          {/* Timestamps */}
          <div className="pt-4 border-t border-gray-200">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Created</p>
                <p className="text-gray-900">{new Date(team.created_at).toLocaleDateString()}</p>
              </div>
              <div>
                <p className="text-gray-500">Last Updated</p>
                <p className="text-gray-900">{new Date(team.updated_at).toLocaleDateString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
