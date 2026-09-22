'use client';

import { Users, Briefcase, FileText, ArrowUpRight, Shield } from 'lucide-react';
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
    <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-[border-color,box-shadow,color,background-color] hover:border-brand-blue/20 hover:shadow-md hover:shadow-brand-blue/10">
      <div className="border-b border-gray-100 dark:border-slate-700/60 bg-gradient-to-r from-brand-blue/[0.05] via-brand-cyan/[0.04] to-transparent p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
            <Shield className="h-5 w-5 text-brand-blue" />
          </div>
          <span className="inline-flex items-center rounded-full bg-brand-cyan/10 px-2.5 py-1 text-2xs font-medium text-brand-blue ring-1 ring-brand-cyan/20">
            Team
          </span>
        </div>
        <h3 className="line-clamp-1 text-xl font-semibold tracking-tight text-gray-900 dark:text-slate-50">{team.name}</h3>
        <p className="mt-2 line-clamp-2 text-sm text-gray-600 dark:text-slate-400">
          {team.description || 'No description provided for this team yet.'}
        </p>
      </div>

      <div className="p-6">
        <div className="mb-6 grid grid-cols-3 gap-4">
          <div className="rounded-xl bg-gray-50 dark:bg-slate-800/50 p-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
            <div className="mb-1 flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-blue" />
              <p className="text-2xl font-semibold text-gray-900 dark:text-slate-50">{team.member_count}</p>
            </div>
            <p className="text-xs text-gray-600 dark:text-slate-400">Members</p>
          </div>

          <div className="rounded-xl bg-gray-50 dark:bg-slate-800/50 p-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
            <div className="mb-1 flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-brand-cyan" />
              <p className="text-2xl font-semibold text-gray-900 dark:text-slate-50">{team.active_jobs_count}</p>
            </div>
            <p className="text-xs text-gray-600 dark:text-slate-400">Active Jobs</p>
          </div>

          <div className="rounded-xl bg-gray-50 dark:bg-slate-800/50 p-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
            <div className="mb-1 flex items-center gap-2">
              <FileText className="w-4 h-4 text-brand-teal" />
              <p className="text-2xl font-semibold text-gray-900 dark:text-slate-50">{team.resumes_count}</p>
            </div>
            <p className="text-xs text-gray-600 dark:text-slate-400">Resumes</p>
          </div>
        </div>

        <div className="mb-6 flex items-center gap-3">
          <div className="flex -space-x-2">
            {team.members.slice(0, 4).map((member) => (
              <div
                key={member.id}
                className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-white bg-gradient-to-br from-brand-blue-2 to-brand-blue text-sm font-semibold text-white shadow-sm"
                title={member.name}
              >
                {member.initials}
              </div>
            ))}
          </div>
          {team.member_count > 4 && (
            <span className="text-sm text-gray-600 dark:text-slate-400">+{team.member_count - 4} more</span>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => onViewDetails(team.id)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-blue px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-blue/20 transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            View Details
            <ArrowUpRight className="h-4 w-4" />
          </button>
          {canManage && (
            <button
              onClick={() => onManageTeam(team.id)}
              className="flex-1 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-slate-300 transition-all hover:border-brand-cyan/20 hover:bg-brand-cyan/[0.04] hover:text-brand-blue"
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
    <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
      <div className="border-b border-gray-100 dark:border-slate-700/60 bg-gradient-to-r from-brand-blue/[0.05] via-brand-cyan/[0.04] to-transparent p-6">
        <Skeleton className="mb-3 h-10 w-10 rounded-xl" />
        <Skeleton className="mb-2 h-6 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="p-6">
        <div className="mb-6 grid grid-cols-3 gap-4">
          {[1, 2, 3].map((index) => (
            <div key={index} className="text-center">
              <Skeleton className="mx-auto mb-1 h-8 w-12" />
              <Skeleton className="mx-auto h-3 w-16" />
            </div>
          ))}
        </div>
        <div className="mb-6 flex gap-2">
          {[1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-10 w-10 rounded-full" />
          ))}
        </div>
        <div className="flex gap-3">
          <Skeleton className="h-10 flex-1 rounded-xl" />
          <Skeleton className="h-10 flex-1 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export default TeamCard;
