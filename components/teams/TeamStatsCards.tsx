'use client';

import { Users, UserCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface TeamStats {
  total_teams: number;
  total_members: number;
  avg_members_per_team: number;
}

interface TeamStatsCardsProps {
  stats: TeamStats;
  isLoading?: boolean;
}

export default function TeamStatsCards({ stats, isLoading }: TeamStatsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <Skeleton className="w-12 h-12 rounded-xl" />
            </div>
            <Skeleton className="h-9 w-16 mb-1" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center">
            <Users className="w-6 h-6 text-white" />
          </div>
        </div>
        <p className="text-3xl font-bold text-gray-900 mb-1">{stats.total_teams}</p>
        <p className="text-sm text-gray-600">Total Teams</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="w-12 h-12 bg-gray-700 rounded-xl flex items-center justify-center">
            <UserCheck className="w-6 h-6 text-white" />
          </div>
        </div>
        <p className="text-3xl font-bold text-gray-900 mb-1">{stats.total_members}</p>
        <p className="text-sm text-gray-600">Team Members</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-3">
          <div className="w-12 h-12 bg-gray-600 rounded-xl flex items-center justify-center">
            <Users className="w-6 h-6 text-white" />
          </div>
        </div>
        <p className="text-3xl font-bold text-gray-900 mb-1">
          {stats.avg_members_per_team.toFixed(1)}
        </p>
        <p className="text-sm text-gray-600">Avg Members/Team</p>
      </div>
    </div>
  );
}
