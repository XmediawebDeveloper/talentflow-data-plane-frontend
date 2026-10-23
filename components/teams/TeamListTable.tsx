'use client';

import { Crown, ChevronRight } from 'lucide-react';
import { Team } from '@/lib/services/teamService';
import { SortableHeader, ariaSort, type SortDir, type TableSort } from '@/components/ui/sortable-header';
import { TeamAvatar, MemberStack, TeamActionHandlers, formatTeamDate } from './TeamCard';

/** The page's sort keys ('newest' is the Created column). `sortDir` is the true
 *  direction of the column's values, so newest-first Created is 'desc'. */
export type TeamListSortKey = 'name' | 'newest' | 'members' | 'jobs' | 'resumes';

interface TeamListTableProps extends Pick<TeamActionHandlers, 'onViewDetails'> {
  teams: Team[];
  /** Rendered inside the card under the table — e.g. `<ListPagination attached />`. */
  footer?: React.ReactNode;
  /** Active sort, owned by the page (shared with its Sort dropdown and the grid view). */
  sortKey: TeamListSortKey;
  sortDir: SortDir;
  onSort: (key: TeamListSortKey) => void;
}

const TH = 'px-4 py-3 text-xs font-semibold text-gray-500 dark:text-slate-500';

/**
 * List-view counterpart of the TeamCard grid: same data, one row per team.
 * Clicking a row opens the Team popup, like clicking a card.
 */
export default function TeamListTable({ teams, onViewDetails, footer, sortKey, sortDir, onSort }: TeamListTableProps) {
  const sort: TableSort<TeamListSortKey> = { sortKey, sortDir, toggleSort: onSort };
  return (
    <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm shadow-brand-blue/5 dark:border-slate-700/60 dark:bg-slate-900">
      {/* Phones: compact rows instead of the 820px-wide table. Sorting stays
          on the toolbar's Sort dropdown. */}
      <ul className="divide-y divide-gray-100 dark:divide-slate-700/60 md:hidden">
        {teams.map((team) => (
          <li key={team.id}>
            <button
              type="button"
              onClick={() => onViewDetails(team.id)}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors active:bg-brand-blue/[0.04]"
            >
              <TeamAvatar team={team} className="h-9 w-9 rounded-lg text-xs" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm max-sm:text-[13px] font-semibold text-gray-900 dark:text-slate-50">{team.name}</span>
                <span className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-gray-500 dark:text-slate-400">
                  {team.team_lead ? (
                    <>
                      <Crown className="h-3 w-3 shrink-0 text-brand-blue/60 dark:text-blue-300/70" />
                      <span className="truncate">{team.team_lead.name}</span>
                    </>
                  ) : (
                    <span className="italic text-gray-400 dark:text-slate-500">No lead</span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-2xs text-gray-400 dark:text-slate-500">
                  {team.member_count} members · {team.active_jobs_count.toLocaleString()} jobs · {team.resumes_count.toLocaleString()} resumes
                </span>
              </span>
              <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-gray-300 dark:text-slate-600" />
            </button>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto tf-table-shell md:block">
        <table className="w-full min-w-[820px]">
          <thead className="bg-gray-50/80 dark:bg-slate-800/50">
            <tr className="text-left">
              <th className={`${TH} pl-5`} aria-sort={ariaSort(sort, 'name')}>
                <SortableHeader label="Team" column="name" sort={sort} />
              </th>
              <th className={TH}>Lead</th>
              <th className={TH} aria-sort={ariaSort(sort, 'members')}>
                <SortableHeader label="Members" column="members" sort={sort} />
              </th>
              <th className={`${TH} text-right`} aria-sort={ariaSort(sort, 'jobs')}>
                <SortableHeader label="Active Jobs" column="jobs" sort={sort} align="right" />
              </th>
              <th className={`${TH} text-right`} aria-sort={ariaSort(sort, 'resumes')}>
                <SortableHeader label="Resumes" column="resumes" sort={sort} align="right" />
              </th>
              <th className={TH} aria-sort={ariaSort(sort, 'newest')}>
                <SortableHeader label="Created" column="newest" sort={sort} />
              </th>
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
                        className="block truncate text-left text-sm max-sm:text-[13px] font-semibold text-gray-900 hover:text-brand-blue focus-visible:outline-none focus-visible:underline dark:text-slate-50"
                      >
                        {team.name}
                      </button>
                      {team.description && (
                        <p className="truncate text-xs text-gray-500 dark:text-slate-400">{team.description}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm max-sm:text-[13px]">
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
                    <span className="text-sm max-sm:text-[13px] text-gray-400 dark:text-slate-500">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-sm max-sm:text-[13px] font-medium tabular-nums text-gray-900 dark:text-slate-100">
                  {team.active_jobs_count.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right text-sm max-sm:text-[13px] font-medium tabular-nums text-gray-900 dark:text-slate-100">
                  {team.resumes_count.toLocaleString()}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-sm max-sm:text-[13px] text-gray-500 dark:text-slate-400">
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
      {footer}
    </section>
  );
}
