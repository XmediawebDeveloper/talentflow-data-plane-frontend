'use client';

import { Users, Briefcase, FileText } from 'lucide-react';
import { Team } from '@/lib/services/teamService';
import { Skeleton } from '@/components/ui/skeleton';

interface TeamCardProps {
  team: Team;
  onViewDetails: (teamId: string) => void;
  onManageTeam: (teamId: string) => void;
  canManage?: boolean;
}

export function TeamCard({ team, onViewDetails, onManageTeam, canManage = false }: TeamCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
      {/* Team Header */}
      <div className="bg-gray-800 p-6 text-white">
        <p className="text-sm font-medium opacity-90 mb-1 line-clamp-1">{team.description || 'No description'}</p>
        <h3 className="text-xl font-bold line-clamp-1">{team.name}</h3>
      </div>

      {/* Team Stats */}
      <div className="p-6">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Users className="w-4 h-4 text-gray-500" />
              <p className="text-2xl font-bold text-gray-900">{team.member_count}</p>
            </div>
            <p className="text-xs text-gray-600">Members</p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <Briefcase className="w-4 h-4 text-gray-500" />
              <p className="text-2xl font-bold text-gray-900">{team.active_jobs_count}</p>
            </div>
            <p className="text-xs text-gray-600">Active Jobs</p>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-1">
              <FileText className="w-4 h-4 text-gray-500" />
              <p className="text-2xl font-bold text-gray-900">{team.resumes_count}</p>
            </div>
            <p className="text-xs text-gray-600">Resumes</p>
          </div>
        </div>

        {/* Member Avatars */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex -space-x-2">
            {team.members.slice(0, 4).map((member) => (
              <div
                key={member.id}
                className="w-10 h-10 rounded-full bg-gray-700 text-white flex items-center justify-center text-sm font-semibold border-2 border-white"
                title={member.name}
              >
                {member.initials}
              </div>
            ))}
          </div>
          {team.member_count > 4 && (
            <span className="text-sm text-gray-600">
              +{team.member_count - 4} more
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => onViewDetails(team.id)}
            className="flex-1 px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all font-medium"
          >
            View Details
          </button>
          {canManage && (
            <button
              onClick={() => onManageTeam(team.id)}
              className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all font-medium"
            >
              Manage Team
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function TeamCardSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      <div className="bg-gray-800 p-6">
        <Skeleton className="h-4 w-32 mb-2 bg-gray-700" />
        <Skeleton className="h-6 w-48 bg-gray-700" />
      </div>
      <div className="p-6">
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="text-center">
              <Skeleton className="h-8 w-12 mx-auto mb-1" />
              <Skeleton className="h-3 w-16 mx-auto" />
            </div>
          ))}
        </div>
        <div className="flex gap-2 mb-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="w-10 h-10 rounded-full" />
          ))}
        </div>
        <div className="flex gap-3">
          <Skeleton className="flex-1 h-10 rounded-lg" />
          <Skeleton className="flex-1 h-10 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export default TeamCard;
