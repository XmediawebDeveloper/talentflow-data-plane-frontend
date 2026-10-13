'use client';

import { Users, Briefcase, FileText, ArrowUpRight, Shield } from 'lucide-react';
import { toast } from 'sonner';
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
    <div className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02] transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-brand-blue/30 hover:shadow-md hover:shadow-brand-blue/10">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 dark:border-slate-700/60 p-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-blue/10 text-brand-blue ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
            <Shield className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="line-clamp-1 text-lg font-semibold tracking-tight text-gray-900 dark:text-slate-50">{team.name}</h3>
            <p className="mt-0.5 line-clamp-2 text-sm text-gray-600 dark:text-slate-400">
              {team.description || 'No description provided for this team yet.'}
            </p>
          </div>
        </div>
        <span className="shrink-0 inline-flex items-center rounded-full bg-brand-blue/[0.06] px-2.5 py-1 text-2xs font-medium text-brand-blue ring-1 ring-brand-blue/15">
          Team
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
            <Users className="h-4 w-4 text-gray-500 dark:text-slate-400" />
            <p className="mt-1.5 text-2xl font-semibold tracking-tight text-gray-900 dark:text-slate-50">{team.member_count}</p>
            <p className="text-xs text-gray-600 dark:text-slate-400">Members</p>
          </div>

          <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
            <Briefcase className="h-4 w-4 text-gray-500 dark:text-slate-400" />
            <p className="mt-1.5 text-2xl font-semibold tracking-tight text-gray-900 dark:text-slate-50">{team.active_jobs_count}</p>
            <p className="text-xs text-gray-600 dark:text-slate-400">Active Jobs</p>
          </div>

          <div className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
            <FileText className="h-4 w-4 text-gray-500 dark:text-slate-400" />
            <p className="mt-1.5 text-2xl font-semibold tracking-tight text-gray-900 dark:text-slate-50">{team.resumes_count}</p>
            <p className="text-xs text-gray-600 dark:text-slate-400">Resumes</p>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          {team.member_count > 0 ? (
            <>
              <div className="flex -space-x-2">
                {team.members.slice(0, 4).map((member) => (
                  <div
                    key={member.id}
                    className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-white dark:border-slate-900 bg-gradient-to-br from-brand-blue-2 to-brand-blue text-xs font-semibold text-white shadow-sm"
                    title={member.name}
                  >
                    {member.initials}
                  </div>
                ))}
              </div>
              {team.member_count > 4 && (
                <span className="text-sm text-gray-600 dark:text-slate-400">+{team.member_count - 4} more</span>
              )}
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm text-gray-400 dark:text-slate-500">
              <Users className="h-4 w-4" />
              No members yet
            </span>
          )}
        </div>

        <div className="mt-auto flex gap-2.5 pt-5">
          <button
            onClick={() => onViewDetails(team.id)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-blue px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-blue/20 transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            View Details
            <ArrowUpRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              if (!canManage) {
                toast.error('You do not have permission to manage this team');
                return;
              }
              onManageTeam(team.id);
            }}
            aria-disabled={!canManage}
            title={!canManage ? 'You do not have permission to manage this team' : ''}
            className={`flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium transition-all ${
              canManage
                ? 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-700 dark:text-slate-300 hover:border-brand-cyan/20 hover:bg-brand-cyan/[0.04] hover:text-brand-blue'
                : 'border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-800 text-gray-300 dark:text-slate-600 cursor-not-allowed opacity-60'
            }`}
          >
            Manage Team
          </button>
        </div>
      </div>
    </div>
  );
}

export function TeamCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
      <div className="flex items-start justify-between gap-3 border-b border-gray-100 dark:border-slate-700/60 p-5">
        <div className="flex items-start gap-3">
          <Skeleton className="h-11 w-11 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56 max-w-full" />
          </div>
        </div>
        <Skeleton className="h-6 w-12 rounded-full" />
      </div>
      <div className="p-5">
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((index) => (
            <div key={index} className="rounded-lg bg-gray-50 dark:bg-slate-800/50 p-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
              <Skeleton className="h-4 w-4 rounded" />
              <Skeleton className="mt-1.5 h-7 w-10" />
              <Skeleton className="mt-1 h-3 w-14" />
            </div>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          {[1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-9 w-9 rounded-full" />
          ))}
        </div>
        <div className="mt-5 flex gap-2.5">
          <Skeleton className="h-10 flex-1 rounded-lg" />
          <Skeleton className="h-10 flex-1 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export default TeamCard;
