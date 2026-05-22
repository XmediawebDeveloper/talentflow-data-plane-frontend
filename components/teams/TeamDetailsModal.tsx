'use client';

import { X, Users, Shield, Briefcase, FileText } from 'lucide-react';
import { Team } from '@/lib/services/teamService';
import { formatISTDate } from '@/lib/utils/dateUtils';

interface TeamDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  team: Team | null;
  userRole?: string;
}

export default function TeamDetailsModal({ isOpen, onClose, team }: TeamDetailsModalProps) {
  if (!isOpen || !team) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm sm:p-6">
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-4xl rounded-3xl border border-white/40 bg-white dark:bg-slate-900 shadow-2xl ring-1 ring-black/5 sm:max-h-[calc(100dvh-3rem)] flex flex-col">
        <div className="relative overflow-hidden border-b border-white/10 bg-brand-blue px-6 py-5 text-white shrink-0 rounded-t-3xl">
          <div className="pointer-events-none absolute -top-10 right-0 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/12 ring-1 ring-white/15">
                <Shield className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Team Details</h2>
                <p className="mt-1 text-sm text-white/80">Review team composition, lead ownership, and core activity indicators.</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/15"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-6 p-6 flex-1 overflow-y-auto">
          <div>
            <h3 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-slate-50">{team.name}</h3>
            {team.description && <p className="mt-2 text-sm text-gray-600 dark:text-slate-400">{team.description}</p>}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15 shadow-sm shadow-brand-blue/10">
                <Users className="h-5 w-5 text-brand-blue" />
              </div>
              <p className="text-sm text-gray-500 dark:text-slate-500">Members</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-gray-900 dark:text-slate-50">{team.member_count}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-cyan/10 ring-1 ring-brand-cyan/15 shadow-sm shadow-brand-cyan/10">
                <Briefcase className="h-5 w-5 text-brand-cyan" />
              </div>
              <p className="text-sm text-gray-500 dark:text-slate-500">Active Jobs</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-gray-900 dark:text-slate-50">{team.active_jobs_count}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-4 shadow-sm ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-teal/10 ring-1 ring-brand-teal/15 shadow-sm shadow-brand-teal/10">
                <FileText className="h-5 w-5 text-brand-teal" />
              </div>
              <p className="text-sm text-gray-500 dark:text-slate-500">Resumes</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight text-gray-900 dark:text-slate-50">{team.resumes_count}</p>
            </div>
          </div>

          {team.team_lead && (
            <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-slate-500">Team Lead</h4>
              <div className="flex items-center gap-3 rounded-2xl bg-gray-50 dark:bg-slate-800/50 p-4 ring-1 ring-brand-blue/10">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-brand-blue-2 to-brand-blue text-sm font-semibold text-white shadow-sm">
                  {team.team_lead.initials || 'TL'}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900 dark:text-slate-50">{team.team_lead.name}</p>
                  <p className="text-sm text-gray-500 dark:text-slate-500">{team.team_lead.email}</p>
                </div>
                <span className="rounded-full bg-brand-cyan/10 px-3 py-1 text-xs font-medium text-brand-blue ring-1 ring-brand-cyan/20">
                  Lead
                </span>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-5 shadow-sm ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
            <h4 className="mb-3 text-sm font-semibold uppercase tracking-[0.16em] text-gray-500 dark:text-slate-500">
              Team Members ({team.members?.length || 0})
            </h4>
            <div className="space-y-3 max-h-72 overflow-y-auto">
              {team.members && team.members.length > 0 ? (
                team.members.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 rounded-2xl border border-gray-100 dark:border-slate-700/60 bg-gray-50/70 dark:bg-slate-800/50 p-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-brand-blue-2 to-brand-blue text-sm font-semibold text-white">
                      {member.initials || 'U'}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900 dark:text-slate-50">{member.name}</p>
                      <p className="text-sm text-gray-500 dark:text-slate-500">{member.email}</p>
                    </div>
                    {member.role && (
                      <span className="rounded-full bg-white dark:bg-slate-900 px-3 py-1 text-xs font-medium text-gray-600 dark:text-slate-400 ring-1 ring-gray-200 dark:ring-slate-700">
                        {member.role}
                      </span>
                    )}
                    {team.team_lead?.id === member.id && (
                      <span className="rounded-full bg-brand-blue text-white px-3 py-1 text-xs font-medium">
                        Lead
                      </span>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-center rounded-2xl border border-dashed border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 py-10 text-gray-500 dark:text-slate-500">
                  <Users className="mr-2 h-5 w-5" />
                  <p className="text-sm">No members</p>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 border-t border-gray-100 dark:border-slate-700/60 pt-4 text-sm sm:grid-cols-2">
            <div className="rounded-xl bg-gray-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
              <p className="text-gray-500 dark:text-slate-500">Created</p>
              <p className="mt-1 font-medium text-gray-900 dark:text-slate-50">{formatISTDate(team.created_at)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 dark:bg-slate-800/50 px-4 py-3 ring-1 ring-gray-100 dark:ring-slate-700/60">
              <p className="text-gray-500 dark:text-slate-500">Last Updated</p>
              <p className="mt-1 font-medium text-gray-900 dark:text-slate-50">{formatISTDate(team.updated_at)}</p>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 dark:border-slate-700/60 bg-white/95 dark:bg-slate-900 px-6 py-4 backdrop-blur-sm shrink-0 rounded-b-3xl">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-brand-blue px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-brand-blue/20 transition-all hover:-translate-y-0.5 hover:shadow-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
