'use client';

import {
  Users,
  UserCheck,
  Plus,
  BarChart3,
  TrendingUp,
  History,
  UserMinus,
  Download,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import FeatureGate from '@/components/shared/FeatureGate';
import teamService, { Team, TeamStats, TeamUsageSummary } from '@/lib/services/teamService';
import { RANGE_PRESETS, rememberRangePreset } from '@/components/teams/reportControls';
import type { TeamStatsCardKey } from '@/components/teams/TeamStatsCards';
import { formatTeamUnits, formatTeamDateTime, type TeamUnits } from '@/components/teams/TeamCard';
import { UNIT_KEYS } from '@/lib/constants/unitColors';
import userService, { ApiUser } from '@/lib/services/userService';
import {
  TeamStatsCards,
  TeamCard,
  TeamManagementSkeleton,
  TeamListTable,
  TeamFormModal,
  TeamDetailsModal,
  DeleteConfirmDialog,
  EmptyState,
  TeamFormData,
  TeamAnalyticsDashboard,
  TeamUsageAnalytics,
} from '@/components/teams';
import TeamHistory from '@/components/teams/TeamHistory';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { useAuth } from '@/components/providers/AuthProvider';
import { toISODateIST } from '@/lib/utils/dateUtils';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import ListToolbar from '@/components/ui/list-toolbar';
import ListViewToggle, { ListDisplayMode } from '@/components/ui/list-view-toggle';
import ToolbarFilterSelect from '@/components/ui/toolbar-filter-select';
import ListCountBadge from '@/components/ui/list-count-badge';
import ListEmptyState from '@/components/ui/list-empty-state';
import FadeIn from '@/components/ui/fade-in';
import ListPagination from '@/components/ListPagination';
import ExportFormatModal from '@/components/ExportFormatModal';
import { exportRows, type ExportFileFormat } from '@/lib/utils/exportUtils';
import NameAvatar from '@/components/ui/name-avatar';
import { MobileRecordList, MobileRecordCard } from '@/components/ui/mobile-record-card';
import { ClearSortChip, SortableHeader, ariaSort, sortRows, useTableSort, type SortDir } from '@/components/ui/sortable-header';
import type { TeamListSortKey } from '@/components/teams/TeamListTable';

// Multiples of 6, so every page size fills whole rows in the 2- and 3-column grid.
const TEAM_PAGE_SIZES = [6, 12, 24, 48];

/** Every active user. The users API returns at most 100 per page (20 by
 *  default), so a single call left everyone past the first page out of the
 *  member picker and the Unassigned count. */
async function fetchAllActiveUsers(): Promise<ApiUser[]> {
  const PAGE = 100;
  const all: ApiUser[] = [];
  for (let page = 1; page <= 50; page++) {
    const batch = await userService.listUsers({ is_active: true, page, page_size: PAGE });
    all.push(...batch);
    if (batch.length < PAGE) break;
  }
  return all;
}

/** Units per team over the last 30 days (all teams for admins, own teams otherwise). */
async function fetchTeamUnits30(isAdmin: boolean): Promise<Record<string, TeamUnits>> {
  const { from, to } = RANGE_PRESETS.find((p) => p.id === '30d')!.range();
  const res = isAdmin ? await teamService.getAllTeamsUsage(from, to) : await teamService.getMyTeamsUsage(from, to);
  const out: Record<string, TeamUnits> = {};
  for (const t of (res.teams ?? []) as TeamUsageSummary[]) {
    const row = { total: 0 } as TeamUnits;
    for (const k of UNIT_KEYS) {
      row[k] = t.by_type?.[k]?.total_consumed ?? 0;
      row.total += row[k];
    }
    out[t.team_id] = row;
  }
  return out;
}

/** Team id → creator's name, from the history's "Team Created" events. The team
 *  API has no created_by field; the history does (it's tenant-admin only). */
async function fetchTeamCreators(): Promise<Record<string, string>> {
  const PAGE = 500;
  const out: Record<string, string> = {};
  for (let offset = 0; offset < PAGE * 5; offset += PAGE) {
    const res = await teamService.getTeamsHistory(PAGE, offset, 'TEAM_CREATED');
    for (const e of res.items) if (e.actor_name && !out[e.team_id]) out[e.team_id] = e.actor_name;
    if (res.items.length < PAGE || offset + PAGE >= res.total) break;
  }
  return out;
}

// Members / Unassigned lists — plain rows, so the usual list sizes.
const PEOPLE_PAGE_SIZES = [10, 25, 50, 100];

type TeamListView = 'teams-all' | 'members' | 'unassigned';
const TEAM_LIST_VIEWS: TeamListView[] = ['teams-all', 'members', 'unassigned'];
// '' = all teams; the other two are the "needs attention" slices.
type TeamAttention = '' | 'no-lead' | 'empty';

const TEAMS_EXPORT_HEADERS = ['Team', 'Description', 'Team Lead', 'Lead Email', 'Members', 'Member Names', 'Units (last 30 days)', 'Created', 'Created By'];
const MEMBERS_EXPORT_HEADERS = ['Member', 'Email', 'Team', 'Role', 'Team Lead'];
const UNASSIGNED_EXPORT_HEADERS = ['Name', 'Email', 'Role'];

const formatRole = (role?: string) => (role ? role.replace(/_/g, ' ').toLowerCase() : '');

type TeamSort = TeamListSortKey;
// Each key's natural direction (what its dropdown option means): names A–Z,
// everything else largest / newest first. `sortDir` holds the true direction.
const naturalTeamSortDir = (key: TeamSort): SortDir => (key === 'name' ? 'asc' : 'desc');
const TEAM_SORTS: { value: TeamSort; label: string }[] = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'newest', label: 'Newest first' },
  { value: 'members', label: 'Most members' },
  { value: 'units', label: 'Most units (30 days)' },
];


const getErrorDetail = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return undefined;
  }
  const response = (error as { response?: { data?: { detail?: string } } }).response;
  return response?.data?.detail;
};

export default function TeamManagementPage() {
  const router = useRouter();
  const { user: authUser, isLoading: authLoading, isTenantAdmin, hasPermission, hasPermissionCode } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [stats, setStats] = useState<TeamStats>({
    total_teams: 0,
    total_members: 0,
    avg_members_per_team: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [availableUsers, setAvailableUsers] = useState<ApiUser[]>([]);
  // Units per team (last 30 days). null = not loaded or no access to usage —
  // the Units column / box is then left out entirely.
  const [unitsByTeam, setUnitsByTeam] = useState<Record<string, TeamUnits> | null>(null);
  // Team id → creator's name (admins only; null = not available → column hidden).
  const [createdBy, setCreatedBy] = useState<Record<string, string> | null>(null);
  // Every active user, for the Unassigned view. null = not loaded / no access to
  // the user list — the Unassigned card and view are then left out.
  const [allUsers, setAllUsers] = useState<ApiUser[] | null>(null);
  // Users for the member picker — popups open first and show this while loading.
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  // One Team popup for view + edit (+ delete): null = closed.
  const [teamModal, setTeamModal] = useState<'view' | 'edit' | null>(null);
  const [isPreparingEdit, setIsPreparingEdit] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [activeTab, setActiveTab] = useState<'teams' | 'usage' | 'analytics' | 'history'>('teams');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTeamLead, setFilterTeamLead] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(12);
  // Drill-in pattern: 'cards' shows only the 3 stat tiles; clicking one expands
  // into a focused list view. Each card maps to its own listView so the panel
  // reflects what was clicked. Mirrors /recruitment/job-openings and
  // /organization/role-management.
  // Opens on the first card (Total Teams) already drilled in.
  const [pageView, setPageView] = useState<'cards' | 'list'>('list');
  const [listView, setListView] = useState<TeamListView>('teams-all');
  const isTeamsView = listView === 'teams-all';
  const [attentionFilter, setAttentionFilter] = useState<TeamAttention>('');
  // Members + Unassigned views: their own team filter and pagination.
  const [memberTeamFilter, setMemberTeamFilter] = useState('');
  const [peoplePageSize, setPeoplePageSize] = useState(PEOPLE_PAGE_SIZES[0]);
  const [showExportModal, setShowExportModal] = useState(false);
  // Team clicked in Analytics — Team Usage opens with it expanded.
  const [usageFocusTeamId, setUsageFocusTeamId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<TeamSort>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  // Dropdown / card drill-in: pick a key in its natural direction.
  const applyTeamSort = (key: TeamSort) => {
    setSortBy(key);
    setSortDir(naturalTeamSortDir(key));
  };
  // List-table header click: the sorted column flips, a new one opens in its natural direction.
  const handleHeaderSort = (key: TeamSort) => {
    if (key === sortBy) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else applyTeamSort(key);
    setCurrentPage(1);
  };
  const [displayMode, setDisplayMode] = useState<ListDisplayMode>('grid');
  const openListView = (card: TeamStatsCardKey) => {
    if (card === 'units') {
      // Same numbers as the card: Team Usage on "Last 30 days".
      rememberRangePreset('30d');
      setActiveTab('usage');
      return;
    }
    setListView(card === 'members' ? 'members' : card === 'unassigned' ? 'unassigned' : 'teams-all');
    if (card === 'total') setAttentionFilter('');
    else if (card === 'no-lead') setAttentionFilter('no-lead');
    setPageView('list');
  };

  // Persist scroll + view state so returning to this page lands where the user
  // left off. Re-detect the scroll container when the tab or two-step view flips
  // (height changes drastically between the cards overview and the list).
  const rootRef = useScrollRestoration<HTMLDivElement>('org-team-management', !isLoading, [pageView, activeTab]);
  // currentPage is intentionally not persisted: the existing
  // `setCurrentPage(1)` effect on [searchQuery, filterTeamLead] resets it on
  // mount, so a restored page would be immediately clobbered.
  useListStatePersistence(
    'org-team-management',
    { activeTab, pageView, listView, searchQuery, filterTeamLead, attentionFilter, memberTeamFilter, sortBy, sortDir, displayMode, itemsPerPage, peoplePageSize },
    (s) => {
      if (s.activeTab === 'teams' || s.activeTab === 'usage' || s.activeTab === 'analytics' || s.activeTab === 'history') {
        setActiveTab(s.activeTab as typeof activeTab);
      }
      // A 'cards' value saved before the list became the default is ignored.
      if (s.pageView === 'list') setPageView(s.pageView);
      if (TEAM_LIST_VIEWS.includes(s.listView as TeamListView)) setListView(s.listView as TeamListView);
      if (s.attentionFilter === '' || s.attentionFilter === 'no-lead' || s.attentionFilter === 'empty') setAttentionFilter(s.attentionFilter);
      if (typeof s.memberTeamFilter === 'string') setMemberTeamFilter(s.memberTeamFilter);
      if (typeof s.peoplePageSize === 'number' && PEOPLE_PAGE_SIZES.includes(s.peoplePageSize)) setPeoplePageSize(s.peoplePageSize);
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
      if (typeof s.filterTeamLead === 'string') setFilterTeamLead(s.filterTeamLead);
      if (TEAM_SORTS.some((o) => o.value === s.sortBy)) {
        const key = s.sortBy as TeamSort;
        setSortBy(key);
        // Snapshots saved before sortDir existed fall back to the key's natural direction.
        setSortDir(s.sortDir === 'asc' || s.sortDir === 'desc' ? s.sortDir : naturalTeamSortDir(key));
      }
      if (s.displayMode === 'grid' || s.displayMode === 'list') setDisplayMode(s.displayMode);
      if (typeof s.itemsPerPage === 'number' && TEAM_PAGE_SIZES.includes(s.itemsPerPage)) setItemsPerPage(s.itemsPerPage);
    },
  );

  useEffect(() => {
    // The signed-in user comes from AuthProvider (already loaded for the app
    // shell) — no second /auth/me call just to read permissions.
    if (authLoading || !authUser) return;
    let isMounted = true;

    const initializePage = async () => {
      // Mirrors routeAccess.ts's rule for this prefix (canViewTeams OR
      // canCreateTeams) — a create-only user must not be let in by the
      // route guard/menu and then bounced back out by this re-check.
      const hasAccess =
        isTenantAdmin ||
        hasPermission('canViewTeams') ||
        hasPermission('canCreateTeams') ||
        hasPermission('canManageUsers');

      if (!hasAccess) {
        toast.error('You do not have permission to access Teams');
        router.push('/dashboard');
        return;
      }

      setIsLoading(true);
      try {
        const [teamsData, statsData] = await Promise.all([
          teamService.getTeams(),
          teamService.getTeamStats(),
        ]);

        if (!isMounted) return;
        setTeams(teamsData);
        setStats(statsData);
        // Units column — only for users who may see team usage; best effort.
        if (isTenantAdmin || hasPermissionCode('teams:view_reports')) {
          fetchTeamUnits30(isTenantAdmin)
            .then((u) => { if (isMounted) setUnitsByTeam(u); })
            .catch(() => { /* column stays hidden */ });
        }
        // "Created by" — read from the team history, which only tenant admins can read.
        if (isTenantAdmin) {
          fetchTeamCreators()
            .then((c) => { if (isMounted) setCreatedBy(c); })
            .catch(() => { /* column stays hidden */ });
        }
        // Unassigned view — optional, so it never blocks or fails the page.
        fetchAllActiveUsers()
          .then((users) => { if (isMounted) setAllUsers(users); })
          .catch(() => { /* no access to the user list: card stays hidden */ });
      } catch (error: unknown) {
        console.error('Error fetching data:', error);
        if (!isMounted) return;
        toast.error('Failed to load teams data');
        setTeams([]);
        setStats({ total_teams: 0, total_members: 0, avg_members_per_team: 0 });
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    void initializePage();
    return () => {
      isMounted = false;
    };
    // Keyed on the user's id, so a background permission refresh doesn't reload the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, authUser?.id, router]);

  const filteredTeams = useMemo(() => {
    let result = teams;

    if (searchQuery) {
      // Also matches the lead and any member, so "which team is Priya in?" works.
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (team) =>
          team.name.toLowerCase().includes(query) ||
          (team.description && team.description.toLowerCase().includes(query)) ||
          team.team_lead?.name?.toLowerCase().includes(query) ||
          (team.members || []).some(
            (m) => m.name?.toLowerCase().includes(query) || m.email?.toLowerCase().includes(query),
          )
      );
    }

    if (filterTeamLead) {
      result = result.filter((team) => team.team_lead?.id === filterTeamLead);
    }

    if (attentionFilter === 'no-lead') result = result.filter((team) => !team.team_lead);
    else if (attentionFilter === 'empty') result = result.filter((team) => (team.member_count || 0) === 0);

    const byName = (a: Team, b: Team) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    const sorters: Record<TeamSort, (a: Team, b: Team) => number> = {
      name: byName,
      newest: (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
      members: (a, b) => (b.member_count || 0) - (a.member_count || 0) || byName(a, b),
      units: (a, b) => (unitsByTeam?.[b.id]?.total ?? -1) - (unitsByTeam?.[a.id]?.total ?? -1) || byName(a, b),
    };
    // sortDir opposite to the key's natural direction reverses the sorter.
    const sign = sortDir === naturalTeamSortDir(sortBy) ? 1 : -1;
    return [...result].sort((a, b) => sign * sorters[sortBy](a, b));
  }, [teams, searchQuery, filterTeamLead, attentionFilter, sortBy, sortDir, unitsByTeam]);

  const attentionCounts = useMemo(() => ({
    noLead: teams.filter((t) => !t.team_lead).length,
    empty: teams.filter((t) => (t.member_count || 0) === 0).length,
  }), [teams]);
  const units30Total = useMemo(
    () => (unitsByTeam ? Object.values(unitsByTeam).reduce((sum, u) => sum + u.total, 0) : null),
    [unitsByTeam],
  );
  const maxMembers = useMemo(() => teams.reduce((max, t) => Math.max(max, t.member_count || 0), 0), [teams]);
  // Teams that exist now — History only links these (a deleted team can't open).
  const existingTeamIds = useMemo(() => new Set(teams.map((t) => t.id)), [teams]);


  // Deleting the last team on the last page used to leave an empty page — the
  // page shown is clamped to the last one that still has rows.
  const lastTeamPage = Math.max(1, Math.ceil(filteredTeams.length / itemsPerPage));
  const teamPage = Math.min(currentPage, lastTeamPage);

  const paginatedTeams = useMemo(() => {
    const start = (teamPage - 1) * itemsPerPage;
    return filteredTeams.slice(start, start + itemsPerPage);
  }, [filteredTeams, teamPage, itemsPerPage]);

  const teamsPagination = (attached: boolean) => (
    <ListPagination
      attached={attached}
      currentPage={teamPage}
      itemsPerPage={itemsPerPage}
      totalItems={filteredTeams.length}
      onPageChange={setCurrentPage}
      onItemsPerPageChange={(size) => {
        setItemsPerPage(size);
        setCurrentPage(1);
      }}
      pageSizeOptions={TEAM_PAGE_SIZES}
      itemLabel="teams"
    />
  );


  // Team Members view: flatten members across all teams, tag each with their team.
  // Search filters by member name/email or the team they belong to.
  const flattenedMembers = useMemo(() => {
    const rows = teams.flatMap((team) =>
      (team.members || []).map((m) => ({
        id: `${team.id}:${m.id}`,
        memberId: m.id,
        name: m.name,
        email: m.email,
        avatar_url: m.avatar_url,
        role: m.role,
        teamId: team.id,
        teamName: team.name,
        isLead: team.team_lead?.id === m.id,
      })),
    );
    const inTeam = memberTeamFilter ? rows.filter((r) => r.teamId === memberTeamFilter) : rows;
    if (!searchQuery) return inTeam;
    const q = searchQuery.toLowerCase();
    return inTeam.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.teamName.toLowerCase().includes(q),
    );
  }, [teams, searchQuery, memberTeamFilter]);

  const memberSort = useTableSort<'name' | 'team' | 'role' | 'lead'>({ descFirst: ['lead'] });
  const sortedMembers = useMemo(
    () =>
      sortRows(flattenedMembers, memberSort.sortKey, memberSort.sortDir, {
        name: (r) => r.name,
        team: (r) => r.teamName,
        role: (r) => r.role,
        lead: (r) => r.isLead,
      }),
    [flattenedMembers, memberSort.sortKey, memberSort.sortDir],
  );

  // Active users who are in no team (one user belongs to at most one team).
  const unassignedUsers = useMemo(() => {
    if (!allUsers) return [];
    const assigned = new Set(teams.flatMap((t) => (t.members || []).map((m) => m.id)));
    return allUsers
      .filter((u) => !assigned.has(u.id))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [allUsers, teams]);
  const filteredUnassigned = useMemo(() => {
    if (!searchQuery) return unassignedUsers;
    const q = searchQuery.toLowerCase();
    return unassignedUsers.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [unassignedUsers, searchQuery]);

  // Members and Unassigned share one pager (only one is on screen at a time).
  const peopleTotal = listView === 'unassigned' ? filteredUnassigned.length : sortedMembers.length;
  const lastPeoplePage = Math.max(1, Math.ceil(peopleTotal / peoplePageSize));
  // The page is remembered with the view/search/filter/sort it was picked under;
  // change any of those and it falls back to page 1. Clamped to the last page.
  const peopleKey = `${listView}|${searchQuery}|${memberTeamFilter}|${memberSort.sortKey}|${memberSort.sortDir}`;
  const [peoplePager, setPeoplePager] = useState({ key: '', page: 1 });
  const peoplePage = Math.min(peoplePager.key === peopleKey ? peoplePager.page : 1, lastPeoplePage);
  const setPeoplePage = (page: number) => setPeoplePager({ key: peopleKey, page });
  const pageSlice = <T,>(rows: T[]) => rows.slice((peoplePage - 1) * peoplePageSize, peoplePage * peoplePageSize);
  const pagedMembers = useMemo(() => pageSlice(sortedMembers), [sortedMembers, peoplePage, peoplePageSize]); // eslint-disable-line react-hooks/exhaustive-deps
  const pagedUnassigned = useMemo(() => pageSlice(filteredUnassigned), [filteredUnassigned, peoplePage, peoplePageSize]); // eslint-disable-line react-hooks/exhaustive-deps
  const peoplePagination = (noun: string) => (
    <ListPagination
      attached
      currentPage={peoplePage}
      itemsPerPage={peoplePageSize}
      totalItems={peopleTotal}
      onPageChange={setPeoplePage}
      onItemsPerPageChange={(size) => {
        setPeoplePageSize(size);
        setPeoplePage(1);
      }}
      pageSizeOptions={PEOPLE_PAGE_SIZES}
      itemLabel={noun}
    />
  );

  // Switching between the Teams / Members / Unassigned views starts on page 1 too.
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterTeamLead, attentionFilter, sortBy, listView]);

  // Two teams with the same name are indistinguishable in every picker and
  // report, so names must be unique (case-insensitive).
  const isDuplicateTeamName = (name: string, excludeId?: string) => {
    const normalized = name.trim().toLowerCase();
    return teams.some((team) => team.id !== excludeId && team.name.trim().toLowerCase() === normalized);
  };

  // Create and Edit share these rules (Edit used to demand a member and skip
  // the length check; Create skipped the member check). A team may be empty —
  // members can be added later from the card's "Add members".
  const validateTeamForm = (data: TeamFormData, excludeId?: string): string | null => {
    const name = data.name.trim();
    if (!name) return 'Please enter a team name';
    if (name.length < 2) return 'Team name must be at least 2 characters';
    if (isDuplicateTeamName(name, excludeId)) return `A team named "${name}" already exists`;
    if (data.teamLeadId && !data.memberIds.includes(data.teamLeadId)) return 'Team lead must be a member of the team';
    return null;
  };

  const teamLeads = useMemo(() => {
    return teams
      .filter((team) => team.team_lead)
      .map((team) => team.team_lead!)
      .filter((lead, index, self) => self.findIndex((item) => item.id === lead.id) === index);
  }, [teams]);

  const fetchAvailableUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const users = await fetchAllActiveUsers();
      setAvailableUsers(users);
      setAllUsers(users);
    } catch (error: unknown) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load available users');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const refreshData = async (): Promise<boolean> => {
    try {
      const [teamsData, statsData] = await Promise.all([
        teamService.getTeams(),
        teamService.getTeamStats(),
      ]);
      setTeams(teamsData);
      setStats(statsData);
      // Keep the Units column in step (members moving changes what a team used).
      if (createdBy !== null) {
        fetchTeamCreators().then(setCreatedBy).catch(() => { /* keep the last names */ });
      }
      if (unitsByTeam !== null) {
        fetchTeamUnits30(isTenantAdmin).then(setUnitsByTeam).catch(() => { /* keep the last numbers */ });
      }
      return true;
    } catch (error) {
      console.error('Error refreshing data:', error);
      // The save itself worked — say the list may be out of date and offer a retry.
      toast.error('Could not refresh the team list', {
        action: { label: 'Retry', onClick: () => { void refreshData(); } },
      });
      return false;
    }
  };

  const canCreateTeams = isTenantAdmin || hasPermission('canCreateTeams');
  const canEditTeams = isTenantAdmin || hasPermission('canUpdateTeams');
  const canDeleteTeams = isTenantAdmin || hasPermission('canDeleteTeams');
  const canViewUsageTab = isTenantAdmin || hasPermissionCode('teams:view_reports');
  const canViewAnalyticsTab = isTenantAdmin || hasPermissionCode('teams:view_reports');

  // Inner view tabs — single source of truth so the mobile pill row and the
  // desktop underline row stay identical (labels, icons, permission gating).
  type InnerTabKey = 'teams' | 'usage' | 'analytics' | 'history';
  const innerTabs: { key: InnerTabKey; label: string; short: string; icon: typeof Users; enabled: boolean; denyMsg?: string }[] = [
    { key: 'teams', label: 'Teams', short: 'Teams', icon: Users, enabled: true },
    { key: 'usage', label: 'Team Usage', short: 'Usage', icon: BarChart3, enabled: canViewUsageTab, denyMsg: 'You do not have permission to view team usage' },
    { key: 'analytics', label: 'Analytics', short: 'Analytics', icon: TrendingUp, enabled: canViewAnalyticsTab, denyMsg: 'You do not have permission to view team analytics' },
    ...(isTenantAdmin ? [{ key: 'history' as const, label: 'Teams History', short: 'History', icon: History, enabled: true }] : []),
  ];
  const shownTab: InnerTabKey = innerTabs.some((t) => t.key === activeTab && t.enabled) ? activeTab : 'teams';
  const selectInnerTab = (t: { key: InnerTabKey; enabled: boolean; denyMsg?: string }) => {
    // Locked tab: greyed with a hover tooltip; click is a no-op.
    if (!t.enabled) return;
    setActiveTab(t.key);
  };

  // Exports what the current list shows (its search and filters applied).
  const exportTitle = listView === 'members' ? 'Export Team Members' : listView === 'unassigned' ? 'Export Unassigned Users' : 'Export Teams';
  const exportHeaders = listView === 'members' ? MEMBERS_EXPORT_HEADERS : listView === 'unassigned' ? UNASSIGNED_EXPORT_HEADERS : TEAMS_EXPORT_HEADERS;
  const exportCount = listView === 'members' ? sortedMembers.length : listView === 'unassigned' ? filteredUnassigned.length : filteredTeams.length;
  const runExport = async (format: ExportFileFormat) => {
    const date = toISODateIST(new Date());
    if (listView === 'members') {
      const rows = sortedMembers.map((r) => [r.name, r.email, r.teamName, formatRole(r.role), r.isLead ? 'Yes' : 'No']);
      await exportRows(format, MEMBERS_EXPORT_HEADERS, rows, `team-members-${date}`, { sheetName: 'Team Members' });
    } else if (listView === 'unassigned') {
      const rows = filteredUnassigned.map((u) => [u.name, u.email, formatRole(u.role)]);
      await exportRows(format, UNASSIGNED_EXPORT_HEADERS, rows, `unassigned-users-${date}`, { sheetName: 'Unassigned Users' });
    } else {
      const rows = filteredTeams.map((t) => [
        t.name,
        t.description || '',
        t.team_lead?.name || '',
        t.team_lead?.email || '',
        t.member_count || 0,
        (t.members || []).map((m) => m.name).join('; '),
        unitsByTeam?.[t.id] ? formatTeamUnits(unitsByTeam[t.id].total) : '',
        formatTeamDateTime(t.created_at),
        createdBy?.[t.id] ?? '',
      ]);
      await exportRows(format, TEAMS_EXPORT_HEADERS, rows, `teams-${date}`, { sheetName: 'Teams' });
    }
    setShowExportModal(false);
  };

  const handleOpenCreateModal = async () => {
    // Locked: the button is greyed with a hover tooltip; click is a no-op.
    if (!canCreateTeams) return;

    setShowCreateModal(true);
    void fetchAvailableUsers();
  };

  const handleCreateTeam = async (data: TeamFormData) => {
    const problem = validateTeamForm(data);
    if (problem) {
      toast.error(problem);
      return;
    }

    setIsCreating(true);
    try {
      const created = await teamService.createTeam({
        name: data.name,
        description: data.description || undefined,
        member_ids: data.memberIds,
        team_lead_id: data.teamLeadId || undefined,
      });

      // "View team" opens the new team straight away.
      toast.success('Team created successfully', created?.id
        ? { action: { label: 'View team', onClick: () => { void handleViewDetails(created.id); } } }
        : undefined);
      setShowCreateModal(false);
      await refreshData();
    } catch (error: unknown) {
      console.error('Error creating team:', error);
      toast.error(friendlyErrorMessage(getErrorDetail(error), "Couldn't create team. Please try again."));
    } finally {
      setIsCreating(false);
    }
  };

  /* Opens the Team popup straight away from the row's data, then swaps in the
     fresh copy from the API (the click used to do nothing until that returned).
     A team not in the list (rare) still waits for the fetch. */
  const openTeamPopup = async (teamId: string, mode: 'view' | 'edit') => {
    const listed = teams.find((t) => t.id === teamId);
    if (listed) {
      setSelectedTeam(listed);
      setTeamModal(mode);
    }
    try {
      const team = await teamService.getTeam(teamId);
      if (listed) setSelectedTeam((prev) => (prev?.id === teamId ? team : prev));
      else {
        setSelectedTeam(team);
        setTeamModal(mode);
      }
    } catch {
      if (!listed) toast.error(mode === 'view' ? 'Failed to load team details' : 'Failed to load team data');
    }
  };

  const handleViewDetails = (teamId: string) => openTeamPopup(teamId, 'view');

  // "Add members" on a card: open the popup straight in edit mode.
  const handleManageTeam = (teamId: string) => {
    if (!canEditTeams) return;
    void fetchAvailableUsers();
    return openTeamPopup(teamId, 'edit');
  };

  // Edit button inside the popup: load the user list, then flip to the form.
  const handleStartEdit = async () => {
    if (!canEditTeams) return;
    setIsPreparingEdit(true);
    try {
      await fetchAvailableUsers();
      setTeamModal('edit');
    } finally {
      setIsPreparingEdit(false);
    }
  };

  const closeTeamModal = () => {
    setTeamModal(null);
    setSelectedTeam(null);
  };

  const handleUpdateTeam = async (data: TeamFormData) => {
    if (!selectedTeam) return;

    const problem = validateTeamForm(data, selectedTeam.id);
    if (problem) {
      toast.error(problem);
      return;
    }

    setIsUpdating(true);
    try {
      await teamService.updateTeam(selectedTeam.id, {
        name: data.name,
        // Sent even when emptied / removed — "undefined" left the old value in place.
        description: data.description,
        member_ids: data.memberIds,
        team_lead_id: data.teamLeadId || null,
      });

      toast.success('Team updated successfully');
      // Back to the details view, showing the saved team. A failed reload must
      // not read as a failed save (it used to say "Failed to update team").
      try {
        const [updatedTeam] = await Promise.all([teamService.getTeam(selectedTeam.id), refreshData()]);
        setSelectedTeam(updatedTeam);
        setTeamModal('view');
      } catch {
        closeTeamModal();
      }
    } catch (error: unknown) {
      console.error('Error updating team:', error);
      toast.error(friendlyErrorMessage(getErrorDetail(error), "Couldn't update team. Please try again."));
    } finally {
      setIsUpdating(false);
    }
  };

  // The Team popup stays in state (just hidden) while the confirm is up, so
  // cancelling the delete lands back where the user was.
  const handleOpenDeleteDialog = () => {
    if (!canDeleteTeams) return;
    setShowDeleteDialog(true);
  };

  const teamActionProps = {
    onViewDetails: handleViewDetails,
    onManageTeam: handleManageTeam,
    canManage: canEditTeams,
    maxMembers,
    unitsByTeam,
    createdBy,
    // Units click → Team Usage on "Last 30 days", that team expanded (same numbers).
    onOpenUsage: canViewUsageTab
      ? (teamId: string) => {
          rememberRangePreset('30d');
          setUsageFocusTeamId(teamId);
          setActiveTab('usage');
        }
      : undefined,
  };

  const handleDeleteTeam = async () => {
    if (!selectedTeam) return;

    setIsDeleting(true);
    try {
      await teamService.deleteTeam(selectedTeam.id);
      toast.success('Team deleted successfully');
      setShowDeleteDialog(false);
      closeTeamModal();
      await refreshData();
    } catch (error: unknown) {
      console.error('Error deleting team:', error);
      toast.error(friendlyErrorMessage(getErrorDetail(error), "Couldn't delete team. Please try again."));
    } finally {
      setIsDeleting(false);
    }
  };

  // Member pickers: a user can be in one team, so others' members are left out.
  const inOtherTeam = (userId: string, exceptTeamId?: string) =>
    teams.some((team) => team.id !== exceptTeamId && team.members?.some((member) => member.id === userId));
  const createPickerUsers = availableUsers.filter((user) => !inOtherTeam(user.id));
  const editPickerUsers = availableUsers.filter((user) => !inOtherTeam(user.id, selectedTeam?.id));
  // Users already in another team — the picker lists them greyed with that team's name.
  const unavailableFor = (exceptTeamId?: string) =>
    availableUsers.flatMap((user) => {
      const team = teams.find((t) => t.id !== exceptTeamId && t.members?.some((m) => m.id === user.id));
      return team ? [{ user, teamName: team.name }] : [];
    });

  if (isLoading) {
    return <TeamManagementSkeleton />;
  }

  return (
    <FeatureGate feature="teams">
      {/* Card, breadcrumb, organization tabs and the tab panel come from
          app/(dashboard)/organization/layout.tsx — this renders the panel's content. */}
      <div ref={rootRef}>
            <PageHeader
              icon={<Users className="h-5 w-5" />}
              title="Teams"
              description="Group users into teams, assign leads, and track each team's hiring activity."
              actions={
                <Button
                  variant="primary"
                  onClick={() => {
                    if (!canCreateTeams) return;
                    handleOpenCreateModal();
                  }}
                  aria-disabled={!canCreateTeams}
                  title={!canCreateTeams ? 'You do not have permission to create teams' : ''}
                  className={`${(!canCreateTeams ? 'opacity-60 cursor-not-allowed' : '')} disabled:opacity-50`}
                  icon={<Plus className="h-4 w-4" />}
                >
                  Create Team
                </Button>
              }
            />

            <div className="tf-card-soft mb-6 overflow-hidden">
              {/* Mobile / tablet (<lg): one segmented control — the sliding
                  white-tile toggle used across the app (same as the organization
                  tabs above). Equal cells on a fixed grid, so it never scrolls;
                  short labels on phones, icons from sm up. */}
              <div className="border-b border-gray-200 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-800/40 px-3 py-2.5 lg:hidden">
                {(() => {
                  const activeIndex = innerTabs.findIndex((t) => t.key === shownTab);
                  return (
                    <div
                      role="tablist"
                      aria-label="Team management views"
                      className="relative grid h-9 rounded-lg bg-brand-blue/5 p-1 ring-1 ring-brand-blue/10"
                      style={{ gridTemplateColumns: `repeat(${innerTabs.length}, minmax(0, 1fr))` }}
                    >
                      {activeIndex >= 0 && (
                        <span
                          aria-hidden
                          style={{
                            width: `calc((100% - 0.5rem) / ${innerTabs.length})`,
                            transform: `translateX(${activeIndex * 100}%)`,
                          }}
                          className="absolute bottom-1 left-1 top-1 rounded-md bg-white shadow-sm shadow-brand-blue/15 ring-1 ring-brand-blue/10 transition-transform duration-300 ease-out motion-reduce:transition-none dark:bg-slate-800"
                        />
                      )}
                      {innerTabs.map((t) => {
                        const Icon = t.icon;
                        const active = shownTab === t.key;
                        return (
                          <button
                            key={t.key}
                            type="button"
                            role="tab"
                            aria-selected={active}
                            aria-disabled={!t.enabled}
                            title={!t.enabled ? t.denyMsg : t.label}
                            onClick={() => selectInnerTab(t)}
                            className={`relative z-10 inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md px-1 text-xs font-medium transition-colors duration-300 sm:text-sm ${
                              !t.enabled
                                ? 'cursor-not-allowed text-gray-300 opacity-60 dark:text-slate-600'
                                : active
                                  ? 'text-brand-blue'
                                  : 'text-gray-600 hover:text-brand-blue dark:text-slate-400'
                            }`}
                          >
                            <Icon className="hidden h-4 w-4 shrink-0 sm:block" />
                            <span className="truncate sm:hidden">{t.short}</span>
                            <span className="hidden truncate sm:inline">{t.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>

              {/* Desktop (lg+): underline tabs */}
              <div
                role="tablist"
                aria-label="Team management views"
                className="hidden overflow-x-auto scrollbar-hide tf-hide-native-scrollbar border-b border-gray-200 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-800/40 px-2 sm:px-3 lg:flex"
              >
                {innerTabs.map((t) => {
                  const Icon = t.icon;
                  const active = shownTab === t.key;
                  return (
                    <button
                      key={t.key}
                      role="tab"
                      aria-selected={active}
                      aria-disabled={!t.enabled}
                      title={!t.enabled ? t.denyMsg : ''}
                      onClick={() => selectInnerTab(t)}
                      className={`tf-tab-line justify-center ${
                        !t.enabled
                          ? 'tf-tab-line-disabled'
                          : active
                            ? 'tf-tab-line-active'
                            : ''
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              <div className="p-3 sm:p-5">
            {shownTab === 'usage' ? (
              <TeamUsageAnalytics focusTeamId={usageFocusTeamId} onFocusHandled={() => setUsageFocusTeamId(null)} />
            ) : shownTab === 'analytics' ? (
              <TeamAnalyticsDashboard
                userRole={authUser?.role || 'standard_user'}
                onOpenTeam={canViewUsageTab ? (teamId) => { setUsageFocusTeamId(teamId); setActiveTab('usage'); } : undefined}
              />
            ) : shownTab === 'history' ? (
              <TeamHistory onOpenTeam={handleViewDetails} openableTeamIds={existingTeamIds} />
            ) : (
              <>
                <TeamStatsCards
                  stats={stats}
                  unassignedUsers={allUsers ? unassignedUsers.length : null}
                  noLeadTeams={attentionCounts.noLead}
                  units30={units30Total}
                  onCardClick={openListView}
                  nonClickable={canViewUsageTab ? [] : ['units']}
                  activeCard={
                    pageView === 'list'
                      ? listView === 'teams-all'
                        ? attentionFilter === 'no-lead' ? 'no-lead' : 'total'
                        : listView === 'members'
                          ? 'members'
                          : 'unassigned'
                      : null
                  }
                />

                {pageView === 'list' && (
                <>

                {/* One toolbar row: search, filters, sort, count, export, grid/list. */}
                {(teams.length > 0 || listView === 'unassigned') && (
                  <ListToolbar
                    className="mb-4"
                    // rounded-lg (8px) +10%
                    searchInputClassName="rounded-[8.8px]"
                    searchValue={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder={
                      listView === 'members'
                        ? 'Search members by name, email, or team...'
                        : listView === 'unassigned'
                          ? 'Search users by name or email...'
                          : 'Search teams, leads or members...'
                    }
                    filtersApplied={(isTeamsView && (!!filterTeamLead || !!attentionFilter)) || (listView === 'members' && !!memberTeamFilter)}
                    onClearFilters={() => {
                      setSearchQuery('');
                      setFilterTeamLead('');
                      setAttentionFilter('');
                      setMemberTeamFilter('');
                    }}
                    countBadge={
                      listView === 'members' ? (
                        <ListCountBadge filtered={flattenedMembers.length} total={teams.reduce((n, t) => n + (t.members?.length || 0), 0)} noun="member" />
                      ) : listView === 'unassigned' ? (
                        <ListCountBadge filtered={filteredUnassigned.length} total={unassignedUsers.length} noun="user" />
                      ) : (
                        <ListCountBadge filtered={filteredTeams.length} total={teams.length} noun="team" />
                      )
                    }
                    trailing={
                      <div className="flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          className="sm:h-9"
                          onClick={() => setShowExportModal(true)}
                          disabled={exportCount === 0}
                          icon={<Download className="h-4 w-4" />}
                          title={exportCount === 0 ? 'Nothing to export' : exportTitle}
                        >
                          <span className="hidden sm:inline">Export</span>
                        </Button>
                        {isTeamsView && <ListViewToggle value={displayMode} onChange={setDisplayMode} className="sm:h-9" />}
                      </div>
                    }
                  >
                    {isTeamsView && teamLeads.length > 0 && (
                      <ToolbarFilterSelect value={filterTeamLead} onChange={setFilterTeamLead} ariaLabel="Filter by team lead">
                        <option value="">All team leads</option>
                        {teamLeads.map((lead) => (
                          <option key={lead.id} value={lead.id}>
                            {lead.name}
                          </option>
                        ))}
                      </ToolbarFilterSelect>
                    )}
                    {/* Needs attention: teams with no lead, or no members. */}
                    {isTeamsView && (attentionCounts.noLead > 0 || attentionCounts.empty > 0 || !!attentionFilter) && (
                      <ToolbarFilterSelect value={attentionFilter} onChange={(v) => setAttentionFilter(v as TeamAttention)} ariaLabel="Filter teams needing attention">
                        <option value="">All teams</option>
                        <option value="no-lead">No lead ({attentionCounts.noLead})</option>
                        <option value="empty">No members ({attentionCounts.empty})</option>
                      </ToolbarFilterSelect>
                    )}
                    {listView === 'members' && teams.length > 1 && (
                      <ToolbarFilterSelect value={memberTeamFilter} onChange={setMemberTeamFilter} ariaLabel="Filter members by team">
                        <option value="">All teams</option>
                        {[...teams]
                          .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
                          .map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                      </ToolbarFilterSelect>
                    )}
                    {isTeamsView && (
                      <ToolbarFilterSelect value={sortBy} onChange={(v) => applyTeamSort(v as TeamSort)} ariaLabel="Sort teams">
                        {TEAM_SORTS.filter((o) => o.value !== 'units' || unitsByTeam).map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </ToolbarFilterSelect>
                    )}
                    {/* Clear sort: shown only away from the default order (Teams: Name A–Z;
                        Members: unsorted). */}
                    {isTeamsView ? (
                      <ClearSortChip
                        sort={{ sortKey: sortBy, sortDir }}
                        labels={{ name: 'Team', newest: 'Created', members: 'Members', units: 'Units' }}
                        isDefault={sortBy === 'name' && sortDir === 'asc'}
                        onClear={() => { applyTeamSort('name'); setCurrentPage(1); }}
                      />
                    ) : listView === 'members' ? (
                      <ClearSortChip
                        sort={memberSort}
                        labels={{ name: 'Member', team: 'Team', role: 'Role', lead: 'Lead' }}
                        onClear={() => memberSort.clearSort?.()}
                      />
                    ) : null}
                  </ListToolbar>
                )}

                {isTeamsView && (
                  teams.length === 0 ? (
                    <EmptyState
                      isTenantAdmin={isTenantAdmin}
                      canCreateTeams={canCreateTeams}
                      onCreateTeam={handleOpenCreateModal}
                    />
                  ) : filteredTeams.length === 0 ? (
                    <div className="tf-panel">
                      <ListEmptyState icon={Users} isNarrowed query={searchQuery} entityLabel="team" emptyTitle="No teams yet" />
                    </div>
                  ) : displayMode === 'list' ? (
                    <FadeIn key={`list-${teamPage}`} duration={0.35} distance={8}>
                      {/* Pagination is the table card's footer, as on the Users page. */}
                      <TeamListTable
                        teams={paginatedTeams}
                        {...teamActionProps}
                        footer={teamsPagination(true)}
                        sortKey={sortBy}
                        sortDir={sortDir}
                        onSort={handleHeaderSort}
                      />
                    </FadeIn>
                  ) : (
                    <>
                      <div className="tf-grid-3">
                        {paginatedTeams.map((team, index) => (
                          // Short stagger on first paint / page change; capped so a full page settles fast.
                          <FadeIn key={team.id} delay={Math.min(index, 8) * 0.04} duration={0.4} distance={10} className="h-full">
                            <TeamCard team={team} {...teamActionProps} />
                          </FadeIn>
                        ))}
                      </div>
                      {/* No table card to attach to in the grid — standalone bar. */}
                      {teamsPagination(false)}
                    </>
                  )
                )}

                {/* Team Members view — every assigned member across all teams.
                    Clicking a member opens their team. */}
                {listView === 'members' && (
                  <section className="overflow-hidden tf-card-soft">
                    {flattenedMembers.length === 0 ? (
                      <div className="px-6 py-16 text-center">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
                          <UserCheck className="h-6 w-6 text-brand-blue" />
                        </div>
                        <h3 className="tf-section-title max-sm:text-sm">No members found</h3>
                        <p className="mt-1 tf-body-muted">Try a different search query or assign users to a team.</p>
                      </div>
                    ) : (
                      <>
                      {/* Phones: one compact row per member. */}
                      <MobileRecordList className="p-3">
                        {pagedMembers.map((row) => (
                          <MobileRecordCard
                            key={row.id}
                            onClick={() => handleViewDetails(row.teamId)}
                            title={
                              <span className="flex min-w-0 items-center gap-2">
                                <NameAvatar name={row.name} fallback={row.email} src={row.avatar_url} userId={row.memberId} size="sm" />
                                <span className="min-w-0 truncate">{row.name}</span>
                              </span>
                            }
                            badges={
                              row.isLead ? (
                                <span className="tf-badge shrink-0 bg-brand-orange/10 text-2xs text-brand-orange-deep ring-1 ring-brand-orange/15">
                                  Lead
                                </span>
                              ) : undefined
                            }
                            meta={[
                              { label: row.email },
                              { icon: <Users className="h-4 w-4" />, label: row.teamName },
                            ]}
                            fields={[
                              { label: 'Role', value: row.role ? <span className="capitalize">{formatRole(row.role)}</span> : null },
                            ]}
                          />
                        ))}
                      </MobileRecordList>
                      <div className="hidden overflow-x-auto tf-table-shell lg:block">
                        <table className="w-full min-w-[640px]">
                          <thead className="bg-white dark:bg-slate-900">
                            <tr className="text-left">
                              <th className="tf-th-cell tf-th" aria-sort={ariaSort(memberSort, 'name')}>
                                <SortableHeader label="Member" column="name" sort={memberSort} />
                              </th>
                              <th className="tf-th-cell tf-th" aria-sort={ariaSort(memberSort, 'team')}>
                                <SortableHeader label="Team" column="team" sort={memberSort} />
                              </th>
                              <th className="tf-th-cell tf-th" aria-sort={ariaSort(memberSort, 'role')}>
                                <SortableHeader label="Role" column="role" sort={memberSort} />
                              </th>
                              <th className="tf-th-cell tf-th text-right" aria-sort={ariaSort(memberSort, 'lead')}>
                                <SortableHeader label="Lead" column="lead" sort={memberSort} align="right" />
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                            {pagedMembers.map((row) => (
                              <tr
                                key={row.id}
                                onClick={() => handleViewDetails(row.teamId)}
                                title={`Open ${row.teamName}`}
                                className="cursor-pointer transition-colors hover:bg-brand-blue/[0.04]"
                              >
                                <td className="tf-td">
                                  <div className="flex items-center gap-3">
                                    <NameAvatar name={row.name} fallback={row.email} src={row.avatar_url} userId={row.memberId} size="md" />
                                    <div className="min-w-0">
                                      <p className="tf-row-title truncate">{row.name}</p>
                                      <p className="tf-meta truncate">{row.email}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="tf-td tf-body">{row.teamName}</td>
                                <td className="tf-td tf-body-secondary">
                                  {row.role ? (
                                    <span className="capitalize">{formatRole(row.role)}</span>
                                  ) : (
                                    <span className="text-gray-400 dark:text-slate-500">—</span>
                                  )}
                                </td>
                                <td className="tf-td text-right">
                                  {row.isLead ? (
                                    <span className="tf-badge bg-brand-orange/10 text-brand-orange-deep ring-1 ring-brand-orange/15">
                                      Team Lead
                                    </span>
                                  ) : (
                                    <span className="tf-hint">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {peoplePagination('members')}
                      </>
                    )}
                  </section>
                )}

                {/* Unassigned users — active users who belong to no team. */}
                {listView === 'unassigned' && (
                  <section className="overflow-hidden tf-card-soft">
                    {filteredUnassigned.length === 0 ? (
                      <div className="px-6 py-16 text-center">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
                          <UserMinus className="h-6 w-6 text-brand-blue" />
                        </div>
                        <h3 className="tf-section-title max-sm:text-sm">
                          {searchQuery ? 'No matching users' : 'Everyone is in a team'}
                        </h3>
                        <p className="mt-1 tf-body-muted">
                          {searchQuery ? 'Try a different search query.' : 'Every active user already belongs to a team.'}
                        </p>
                      </div>
                    ) : (
                      <>
                        <ul className="divide-y divide-gray-100 dark:divide-slate-700/60">
                          {pagedUnassigned.map((u) => (
                            <li key={u.id} className="flex items-center gap-2.5 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3.5">
                              <NameAvatar name={u.name} fallback={u.email} src={u.avatar_url} userId={u.id} size="md" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate tf-row-title">{u.name}</p>
                                <p className="truncate tf-meta">{u.email}</p>
                              </div>
                              {u.role && (
                                <span className="tf-badge hidden shrink-0 bg-gray-100 capitalize text-gray-700 dark:bg-slate-800 dark:text-slate-300 sm:inline">
                                  {formatRole(u.role)}
                                </span>
                              )}
                            </li>
                          ))}
                        </ul>
                        {peoplePagination('users')}
                      </>
                    )}
                  </section>
                )}

                </>
                )}
              </>
            )}
              </div>
            </div>

        <TeamFormModal
          key={`create-${showCreateModal ? 'open' : 'closed'}`}
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSubmit={handleCreateTeam}
          mode="create"
          availableUsers={createPickerUsers}
          unavailableUsers={unavailableFor()}
          isNameTaken={(name) => isDuplicateTeamName(name)}
          isLoadingUsers={isLoadingUsers}
          isSubmitting={isCreating}
        />

        {/* The Team popup — details and edit form are two faces of one popup
            (same size), swapped in place. Hidden while the delete confirm is up. */}
        <TeamDetailsModal
          isOpen={teamModal === 'view' && !showDeleteDialog}
          onClose={closeTeamModal}
          team={selectedTeam}
          userRole={authUser?.role}
          onEdit={handleStartEdit}
          canEdit={canEditTeams}
          isPreparingEdit={isPreparingEdit}
          onDelete={handleOpenDeleteDialog}
          canDelete={canDeleteTeams}
          showUnits={!!unitsByTeam}
          units={selectedTeam ? unitsByTeam?.[selectedTeam.id] : undefined}
          createdByName={selectedTeam ? createdBy?.[selectedTeam.id] : undefined}
        />

        <TeamFormModal
          key={`edit-${selectedTeam?.id || 'none'}-${teamModal === 'edit' ? 'open' : 'closed'}`}
          isOpen={teamModal === 'edit' && !showDeleteDialog}
          // Back returns to the details view rather than closing the popup.
          onClose={() => setTeamModal('view')}
          cancelLabel="Back"
          onSubmit={handleUpdateTeam}
          mode="edit"
          initialData={
            selectedTeam
              ? {
                  name: selectedTeam.name,
                  description: selectedTeam.description || '',
                  memberIds: selectedTeam.members?.map((member) => member.id) || [],
                  teamLeadId: selectedTeam.team_lead?.id || '',
                }
              : undefined
          }
          availableUsers={editPickerUsers}
          unavailableUsers={unavailableFor(selectedTeam?.id)}
          isNameTaken={(name) => isDuplicateTeamName(name, selectedTeam?.id)}
          isLoadingUsers={isLoadingUsers}
          isSubmitting={isUpdating}
          onDelete={handleOpenDeleteDialog}
          canDelete={canDeleteTeams}
          isDeleting={isDeleting}
        />

        <DeleteConfirmDialog
          open={showDeleteDialog}
          // Cancelling re-shows the Team popup underneath.
          onOpenChange={setShowDeleteDialog}
          teamName={selectedTeam?.name || ''}
          memberCount={selectedTeam?.member_count || 0}
          onConfirm={handleDeleteTeam}
          isDeleting={isDeleting}
        />

        <ExportFormatModal
          tone="plain"
          open={showExportModal}
          onClose={() => setShowExportModal(false)}
          title={exportTitle}
          recordCount={exportCount}
          columns={exportHeaders}
          onExport={runExport}
        />
      </div>
    </FeatureGate>
  );
}
