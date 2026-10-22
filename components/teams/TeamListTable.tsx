'use client';

import { Crown, ChevronRight } from 'lucide-react';
import { Team } from '@/lib/services/teamService';
import { TeamAvatar, MemberStack, TeamActionHandlers, formatTeamDate } from './TeamCard';

interface TeamListTableProps extends Pick<TeamActionHandlers, 'onViewDetails'> {
  teams: Team[];
}

const TH = 'px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500';

/**
 * List-view counterpart of the TeamCard grid: same data, one row per team.
 * Clicking a row opens the Team popup, like clicking a card.
 */
export default function TeamListTable({ teams, onViewDetails }: TeamListTableProps) {
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm shadow-brand-blue/5 dark:border-slate-700/60 dark:bg-slate-900">
      <div className="overflow-x-auto tf-table-shell">
        <table className="w-full min-w-[820px]">
          <thead className="bg-gray-50/80 dark:bg-slate-800/50">
            <tr className="text-left">
              <th className={`${TH} pl-5`}>Team</th>
              <th className={TH}>Lead</th>
              <th className={TH}>Members</th>
              <th className={`${TH} text-right`}>Active jobs</th>
              <th className={`${TH} text-right`}>Resumes</th>
              <th className={TH}>Created</th>
              <th className={`${TH} w-10 pr-5`}>
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
            {teams.map((team) => (
              <tr
                key={team.id}
                onClick={() => onViewDetails(team.id)}
                className="group cursor-pointer transition-colors hover:bg-brand-blue/[0.04]"
              >
                <td className="py-3 pl-5 pr-4">
                  <div className="flex items-center gap-3">
                    <TeamAvatar team={team} className="h-9 w-9 rounded-lg text-xs" />
                    <div className="min-w-0 max-w-xs">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewDetails(team.id);
                        }}
                        className="block truncate text-left text-sm font-semibold text-gray-900 hover:text-brand-blue focus-visible:outline-none focus-visible:underline dark:text-slate-50"
                      >
                        {team.name}
                      </button>
                      {team.description && (
                        <p className="truncate text-xs text-gray-500 dark:text-slate-400">{team.description}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm">
                  {team.team_lead ? (
                    <span className="inline-flex items-center gap-1.5 text-gray-700 dark:text-slate-300">
                      <Crown className="h-3.5 w-3.5 text-brand-blue/60 dark:text-blue-300/70" />
                      {team.team_lead.name}
                    </span>
                  ) : (
                    <span className="italic text-gray-400 dark:text-slate-500">No lead</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {team.member_count > 0 ? (
                    <MemberStack members={team.members} total={team.member_count} max={3} size="sm" />
                  ) : (
                    <span className="text-sm text-gray-400 dark:text-slate-500">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-sm font-medium tabular-nums text-gray-900 dark:text-slate-100">
                  {team.active_jobs_count.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-sm font-medium tabular-nums text-gray-900 dark:text-slate-100">
                  {team.resumes_count.toLocaleString()}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500 dark:text-slate-400">
                  {formatTeamDate(team.created_at) || '—'}
                </td>
                <td className="py-3 pl-4 pr-5 text-right">
                  <ChevronRight
                    aria-hidden
                    className="ml-auto h-4 w-4 text-gray-300 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-brand-blue dark:text-slate-600"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
