'use client';

import { Crown, ChevronRight } from 'lucide-react';
import { Team } from '@/lib/services/teamService';
import { SortableHeader, ariaSort, type SortDir, type TableSort } from '@/components/ui/sortable-header';
import { MobileRecordList, MobileRecordCard, MobileStatChip } from '@/components/ui/mobile-record-card';
import { MemberStack, TeamActionHandlers, formatTeamDateTime, AttentionChip, TeamSizeBar, TeamUnitsSummary, formatTeamUnits } from './TeamCard';

/** The page's sort keys ('newest' is the Created column). `sortDir` is the true
 *  direction of the column's values, so newest-first Created is 'desc'. */
export type TeamListSortKey = 'name' | 'newest' | 'members' | 'units';

interface TeamListTableProps extends Pick<TeamActionHandlers, 'onViewDetails' | 'maxMembers' | 'unitsByTeam' | 'unitsPeriod' | 'onOpenUsage' | 'createdBy'> {
  teams: Team[];
  /** Rendered inside the card under the table — e.g. `<ListPagination attached />`. */
  footer?: React.ReactNode;
  /** Active sort, owned by the page (shared with its Sort dropdown and the grid view). */
  sortKey: TeamListSortKey;
  sortDir: SortDir;
  onSort: (key: TeamListSortKey) => void;
}

const TH = 'px-4 py-3 text-xs font-semibold text-gray-600 dark:text-slate-300';

/**
 * List-view counterpart of the TeamCard grid: same data, one row per team.
 * Clicking a row opens the Team popup, like clicking a card.
 */
export default function TeamListTable({ teams, onViewDetails, footer, sortKey, sortDir, onSort, maxMembers = 0, unitsByTeam = null, unitsPeriod = 'last 30 days', onOpenUsage, createdBy = null }: TeamListTableProps) {
  const sort: TableSort<TeamListSortKey> = { sortKey, sortDir, toggleSort: onSort };
  return (
    <section className="tf-card-soft overflow-hidden">
      {/* Phones: compact rows instead of the 820px-wide table. Sorting stays
          on the toolbar's Sort dropdown. */}
      <MobileRecordList className="p-3">
        {teams.map((team) => (
          <MobileRecordCard
            key={team.id}
            onClick={() => onViewDetails(team.id)}
            title={team.name}
            badges={
              <>
                {!team.team_lead && <AttentionChip>No lead</AttentionChip>}
                {team.member_count === 0 && <AttentionChip>No members</AttentionChip>}
              </>
            }
            meta={[
              {
                icon: <Crown className="text-brand-blue/60 dark:text-blue-300/70" />,
                label: team.team_lead ? team.team_lead.name : null,
              },
            ]}
            footer={
              <>
                <MobileStatChip tone="info">{team.member_count} members</MobileStatChip>
                {unitsByTeam?.[team.id] && (
                  <MobileStatChip tone="neutral">{formatTeamUnits(unitsByTeam[team.id].total)} units ({unitsPeriod})</MobileStatChip>
                )}
              </>
            }
            actions={
              <button type="button" onClick={() => onViewDetails(team.id)} aria-label={`Open ${team.name}`} className="tf-icon-btn-outline">
                <ChevronRight aria-hidden />
              </button>
            }
          />
        ))}
      </MobileRecordList>
      <div className="hidden overflow-x-auto tf-table-shell lg:block">
        <table className="w-full min-w-[820px]">
          <thead className="bg-white dark:bg-slate-900">
            <tr className="text-left">
              <th className={`${TH} pl-5`} aria-sort={ariaSort(sort, 'name')}>
                <SortableHeader label="Team" column="name" sort={sort} />
              </th>
              <th className={TH}>Lead</th>
              <th className={TH} aria-sort={ariaSort(sort, 'members')}>
                <SortableHeader label="Members" column="members" sort={sort} />
              </th>
              {unitsByTeam && (
                <th className={TH} aria-sort={ariaSort(sort, 'units')}>
                  <SortableHeader label={`Units (${unitsPeriod})`} column="units" sort={sort} />
                </th>
              )}
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
                <td className="tf-td pl-5 pr-4">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 max-w-xs">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewDetails(team.id);
                        }}
                        // Name only in the row; the description shows on hover and in the Team popup.
                        title={team.description ? `${team.name} — ${team.description}` : team.name}
                        className="block truncate text-left text-sm font-semibold text-gray-900 hover:text-brand-blue focus-visible:outline-none focus-visible:underline dark:text-slate-50"
                      >
                        {team.name}
                      </button>
                    </div>
                  </div>
                </td>
                <td className="tf-td text-sm">
                  {team.team_lead ? (
                    <span className="inline-flex items-center gap-1.5 text-gray-700 dark:text-slate-300">
                      <Crown className="h-3.5 w-3.5 text-brand-blue/60 dark:text-blue-300/70" />
                      {team.team_lead.name}
                    </span>
                  ) : (
                    <AttentionChip>No lead</AttentionChip>
                  )}
                </td>
                <td className="tf-td">
                  {team.member_count > 0 ? (
                    <div className="w-fit">
                      <MemberStack members={team.members} total={team.member_count} max={3} size="sm" />
                      <TeamSizeBar count={team.member_count} max={maxMembers} className="mt-1.5" />
                    </div>
                  ) : (
                    <AttentionChip>No members</AttentionChip>
                  )}
                </td>
                {unitsByTeam && (
                  <td className="tf-td">
                    <TeamUnitsSummary
                      units={unitsByTeam[team.id]}
                      onOpen={onOpenUsage ? () => onOpenUsage(team.id) : undefined}
                    />
                  </td>
                )}
                <td className="tf-td whitespace-nowrap">
                  <p className="tf-body-secondary">{formatTeamDateTime(team.created_at) || '—'}</p>
                  {createdBy?.[team.id] && (
                    <p className="max-w-[12rem] truncate tf-hint" title={`Created by ${createdBy[team.id]}`}>
                      {createdBy[team.id]}
                    </p>
                  )}
                </td>
                <td className="tf-td pl-4 pr-5 text-right">
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
