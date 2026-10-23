'use client';

import {
  Users,
  UserCheck,
  Plus,
  BarChart3,
  TrendingUp,
  History,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import FeatureGate from '@/components/shared/FeatureGate';
import teamService, { Team, TeamStats } from '@/lib/services/teamService';
import authService, { User } from '@/lib/services/authService';
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
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import ListToolbar from '@/components/ui/list-toolbar';
import ListViewToggle, { ListDisplayMode } from '@/components/ui/list-view-toggle';
import ToolbarFilterSelect from '@/components/ui/toolbar-filter-select';
import ListCountBadge from '@/components/ui/list-count-badge';
import ListEmptyState from '@/components/ui/list-empty-state';
import FadeIn from '@/components/ui/fade-in';
import ListPagination from '@/components/ListPagination';
import NameAvatar from '@/components/ui/name-avatar';
import { ClearSortChip, SortableHeader, ariaSort, sortRows, useTableSort, type SortDir } from '@/components/ui/sortable-header';
import type { TeamListSortKey } from '@/components/teams/TeamListTable';

// Multiples of 6, so every page size fills whole rows in the 2- and 3-column grid.
const TEAM_PAGE_SIZES = [6, 12, 24, 48];

type TeamSort = TeamListSortKey;
// Each key's natural direction (what its dropdown option means): names A–Z,
// everything else largest / newest first. `sortDir` holds the true direction.
const naturalTeamSortDir = (key: TeamSort): SortDir => (key === 'name' ? 'asc' : 'desc');
const TEAM_SORTS: { value: TeamSort; label: string }[] = [
  { value: 'name', label: 'Name (A–Z)' },
  { value: 'newest', label: 'Newest first' },
  { value: 'members', label: 'Most members' },
  { value: 'jobs', label: 'Most active jobs' },
  { value: 'resumes', label: 'Most resumes' },
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
  const { hasPermissionCode } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [stats, setStats] = useState<TeamStats>({
    total_teams: 0,
    total_members: 0,
    avg_members_per_team: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [availableUsers, setAvailableUsers] = useState<ApiUser[]>([]);

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
  const [listView, setListView] = useState<'teams-all' | 'members' | 'teams-by-jobs'>('teams-all');
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
  const openListView = (card: 'total' | 'members' | 'jobs') => {
    setListView(card === 'total' ? 'teams-all' : card === 'members' ? 'members' : 'teams-by-jobs');
    // The Active Jobs card lands on the busiest teams first.
    if (card === 'jobs') applyTeamSort('jobs');
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
    { activeTab, pageView, listView, searchQuery, filterTeamLead, sortBy, sortDir, displayMode, itemsPerPage },
    (s) => {
      if (s.activeTab === 'teams' || s.activeTab === 'usage' || s.activeTab === 'analytics' || s.activeTab === 'history') {
        setActiveTab(s.activeTab as typeof activeTab);
      }
      // A 'cards' value saved before the list became the default is ignored.
      if (s.pageView === 'list') setPageView(s.pageView);
      if (s.listView === 'teams-all' || s.listView === 'members' || s.listView === 'teams-by-jobs') {
        setListView(s.listView as typeof listView);
      }
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
    let isMounted = true;

    const initializePage = async () => {
      setIsLoading(true);
      try {
        const [userData, teamsData, statsData] = await Promise.all([
          authService.getCurrentUser(),
          teamService.getTeams(),
          teamService.getTeamStats(),
        ]);

        if (!isMounted) return;

        // Mirrors routeAccess.ts's rule for this prefix (canViewTeams OR
        // canCreateTeams) — a create-only user must not be let in by the
        // route guard/menu and then bounced back out by this re-check.
        const hasPermission =
          userData.role === 'tenant_admin' ||
          userData.permissions?.can_view_teams ||
          userData.permissions?.can_create_teams ||
          userData.permissions?.can_manage_users;

        if (!hasPermission) {
          toast.error('You do not have permission to access Team Management');
          router.push('/dashboard');
          return;
        }

        setCurrentUser(userData);
        setTeams(teamsData);
        setStats(statsData);
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
  }, [router]);

  const filteredTeams = useMemo(() => {
    let result = teams;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (team) =>
          team.name.toLowerCase().includes(query) ||
          (team.description && team.description.toLowerCase().includes(query))
      );
    }

    if (filterTeamLead) {
      result = result.filter((team) => team.team_lead?.id === filterTeamLead);
    }

    const byName = (a: Team, b: Team) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    const sorters: Record<TeamSort, (a: Team, b: Team) => number> = {
      name: byName,
      newest: (a, b) => (b.created_at || '').localeCompare(a.created_at || ''),
      members: (a, b) => (b.member_count || 0) - (a.member_count || 0) || byName(a, b),
      jobs: (a, b) => (b.active_jobs_count || 0) - (a.active_jobs_count || 0) || byName(a, b),
      resumes: (a, b) => (b.resumes_count || 0) - (a.resumes_count || 0) || byName(a, b),
    };
    // sortDir opposite to the key's natural direction reverses the sorter.
    const sign = sortDir === naturalTeamSortDir(sortBy) ? 1 : -1;
    return [...result].sort((a, b) => sign * sorters[sortBy](a, b));
  }, [teams, searchQuery, filterTeamLead, sortBy, sortDir]);

  const activeJobsTotal = useMemo(
    () => teams.reduce((sum, team) => sum + (team.active_jobs_count || 0), 0),
    [teams],
  );

  const paginatedTeams = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredTeams.slice(start, start + itemsPerPage);
  }, [filteredTeams, currentPage, itemsPerPage]);

  const teamsPagination = (attached: boolean) => (
    <ListPagination
      attached={attached}
      currentPage={currentPage}
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
    if (!searchQuery) return rows;
    const q = searchQuery.toLowerCase();
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.teamName.toLowerCase().includes(q),
    );
  }, [teams, searchQuery]);

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

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterTeamLead, sortBy]);

  // Two teams with the same name are indistinguishable in every picker and
  // report, so names must be unique (case-insensitive).
  const isDuplicateTeamName = (name: string, excludeId?: string) => {
    const normalized = name.trim().toLowerCase();
    return teams.some((team) => team.id !== excludeId && team.name.trim().toLowerCase() === normalized);
  };

  const teamLeads = useMemo(() => {
    return teams
      .filter((team) => team.team_lead)
      .map((team) => team.team_lead!)
      .filter((lead, index, self) => self.findIndex((item) => item.id === lead.id) === index);
  }, [teams]);

  const fetchAvailableUsers = async () => {
    try {
      const users = await userService.listUsers({ is_active: true });
      setAvailableUsers(users);
    } catch (error: unknown) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load available users');
    }
  };

  const refreshData = async () => {
    try {
      const [teamsData, statsData] = await Promise.all([
        teamService.getTeams(),
        teamService.getTeamStats(),
      ]);
      setTeams(teamsData);
      setStats(statsData);
    } catch (error) {
      console.error('Error refreshing data:', error);
    }
  };

  const isTenantAdmin = currentUser?.role === 'tenant_admin';
  const canCreateTeams = isTenantAdmin || !!currentUser?.permissions?.can_create_teams;
  const canEditTeams = isTenantAdmin || !!currentUser?.permissions?.can_update_teams;
  const canDeleteTeams = isTenantAdmin || !!currentUser?.permissions?.can_delete_teams;
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
  const selectInnerTab = (t: { key: InnerTabKey; enabled: boolean; denyMsg?: string }) => {
    // Locked tab: greyed with a hover tooltip; click is a no-op.
    if (!t.enabled) return;
    setActiveTab(t.key);
  };

  const handleOpenCreateModal = async () => {
    // Locked: the button is greyed with a hover tooltip; click is a no-op.
    if (!canCreateTeams) return;

    await fetchAvailableUsers();
    setShowCreateModal(true);
  };

  const handleCreateTeam = async (data: TeamFormData) => {
    if (!data.name.trim()) {
      toast.error('Please enter a team name');
      return;
    }

    if (data.name.length < 2) {
      toast.error('Team name must be at least 2 characters');
      return;
    }

    if (isDuplicateTeamName(data.name)) {
      toast.error(`A team named "${data.name.trim()}" already exists`);
      return;
    }

    if (data.teamLeadId && !data.memberIds.includes(data.teamLeadId)) {
      toast.error('Team lead must be a member of the team');
      return;
    }

    setIsCreating(true);
    try {
      await teamService.createTeam({
        name: data.name,
        description: data.description || undefined,
        member_ids: data.memberIds,
        team_lead_id: data.teamLeadId || undefined,
      });

      toast.success('Team created successfully');
      setShowCreateModal(false);
      await refreshData();
    } catch (error: unknown) {
      console.error('Error creating team:', error);
      toast.error(getErrorDetail(error) || 'Failed to create team');
    } finally {
      setIsCreating(false);
    }
  };

  const handleViewDetails = async (teamId: string) => {
    try {
      const team = await teamService.getTeam(teamId);
      setSelectedTeam(team);
      setTeamModal('view');
    } catch {
      toast.error('Failed to load team details');
    }
  };

  // "Add members" on a card: open the popup straight in edit mode.
  const handleManageTeam = async (teamId: string) => {
    if (!canEditTeams) return;
    try {
      const team = await teamService.getTeam(teamId);
      setSelectedTeam(team);
      await fetchAvailableUsers();
      setTeamModal('edit');
    } catch {
      toast.error('Failed to load team data');
    }
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

    if (!data.name.trim()) {
      toast.error('Please enter a team name');
      return;
    }

    if (data.memberIds.length === 0) {
      toast.error('Please select at least one team member');
      return;
    }

    if (isDuplicateTeamName(data.name, selectedTeam.id)) {
      toast.error(`A team named "${data.name.trim()}" already exists`);
      return;
    }

    setIsUpdating(true);
    try {
      await teamService.updateTeam(selectedTeam.id, {
        name: data.name,
        description: data.description || undefined,
        member_ids: data.memberIds,
        team_lead_id: data.teamLeadId || undefined,
      });

      toast.success('Team updated successfully');
      // Back to the details view, showing the saved team.
      const [updatedTeam] = await Promise.all([teamService.getTeam(selectedTeam.id), refreshData()]);
      setSelectedTeam(updatedTeam);
      setTeamModal('view');
    } catch (error: unknown) {
      console.error('Error updating team:', error);
      toast.error(getErrorDetail(error) || 'Failed to update team');
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
      toast.error(getErrorDetail(error) || 'Failed to delete team');
    } finally {
      setIsDeleting(false);
    }
  };

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
              title="Team Management"
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
                  className={!canCreateTeams ? 'opacity-60 cursor-not-allowed' : ''}
                  icon={<Plus className="h-4 w-4" />}
                >
                  Create Team
                </Button>
              }
            />

            <div className="mb-6 overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
              {/* Mobile / tablet (<lg): one segmented control — the sliding
                  white-tile toggle used across the app (same as the organization
                  tabs above). Equal cells on a fixed grid, so it never scrolls;
                  short labels on phones, icons from sm up. */}
              <div className="border-b border-gray-200 dark:border-slate-700 bg-gray-50/60 dark:bg-slate-800/40 px-3 py-2.5 lg:hidden">
                {(() => {
                  const activeIndex = innerTabs.findIndex((t) => t.key === activeTab);
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
                        const active = activeTab === t.key;
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
                  const active = activeTab === t.key;
                  return (
                    <button
                      key={t.key}
                      role="tab"
                      aria-selected={active}
                      aria-disabled={!t.enabled}
                      title={!t.enabled ? t.denyMsg : ''}
                      onClick={() => selectInnerTab(t)}
                      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-3 text-sm font-medium transition-all ${
                        !t.enabled
                          ? 'cursor-not-allowed border-transparent text-gray-300 opacity-60 dark:text-slate-600'
                          : active
                            ? 'border-brand-blue text-brand-blue'
                            : 'border-transparent text-gray-600 hover:text-brand-blue dark:text-slate-400'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              <div className="p-3 sm:p-5">
            {activeTab === 'usage' ? (
              <TeamUsageAnalytics />
            ) : activeTab === 'analytics' ? (
              <TeamAnalyticsDashboard userRole={currentUser?.role || 'standard_user'} />
            ) : activeTab === 'history' ? (
              <TeamHistory />
            ) : (
              <>
                <TeamStatsCards
                  stats={stats}
                  activeJobs={activeJobsTotal}
                  onCardClick={openListView}
                  activeCard={
                    pageView === 'list'
                      ? listView === 'teams-all'
                        ? 'total'
                        : listView === 'members'
                          ? 'members'
                          : 'jobs'
                      : null
                  }
                />

                {pageView === 'list' && (
                <>

                {/* One toolbar row: search, lead filter, sort, count, grid/list. */}
                {teams.length > 0 && (
                  <ListToolbar
                    className="mb-4"
                    // rounded-lg (8px) +10%
                    searchInputClassName="rounded-[8.8px]"
                    searchValue={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder={listView === 'members' ? 'Search members by name, email, or team...' : 'Search teams by name or description...'}
                    filtersApplied={listView !== 'members' && !!filterTeamLead}
                    onClearFilters={() => {
                      setSearchQuery('');
                      setFilterTeamLead('');
                    }}
                    countBadge={
                      listView === 'members' ? (
                        <ListCountBadge filtered={flattenedMembers.length} total={stats.total_members} noun="member" />
                      ) : (
                        <ListCountBadge filtered={filteredTeams.length} total={teams.length} noun="team" />
                      )
                    }
                    trailing={
                      listView !== 'members' ? (
                        <ListViewToggle value={displayMode} onChange={setDisplayMode} className="sm:h-9" />
                      ) : undefined
                    }
                  >
                    {listView !== 'members' && teamLeads.length > 0 && (
                      <ToolbarFilterSelect value={filterTeamLead} onChange={setFilterTeamLead} ariaLabel="Filter by team lead">
                        <option value="">All team leads</option>
                        {teamLeads.map((lead) => (
                          <option key={lead.id} value={lead.id}>
                            {lead.name}
                          </option>
                        ))}
                      </ToolbarFilterSelect>
                    )}
                    {listView !== 'members' && (
                      <ToolbarFilterSelect value={sortBy} onChange={(v) => applyTeamSort(v as TeamSort)} ariaLabel="Sort teams">
                        {TEAM_SORTS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </ToolbarFilterSelect>
                    )}
                    {/* Clear sort: shown only away from the default order (Teams: Name A–Z;
                        Members: unsorted). */}
                    {listView !== 'members' ? (
                      <ClearSortChip
                        sort={{ sortKey: sortBy, sortDir }}
                        labels={{ name: 'Team', newest: 'Created', members: 'Members', jobs: 'Active Jobs', resumes: 'Resumes' }}
                        isDefault={sortBy === 'name' && sortDir === 'asc'}
                        onClear={() => { applyTeamSort('name'); setCurrentPage(1); }}
                      />
                    ) : (
                      <ClearSortChip
                        sort={memberSort}
                        labels={{ name: 'Member', team: 'Team', role: 'Role', lead: 'Lead' }}
                        onClear={() => memberSort.clearSort?.()}
                      />
                    )}
                  </ListToolbar>
                )}

                {listView !== 'members' && (
                  teams.length === 0 ? (
                    <EmptyState
                      isTenantAdmin={isTenantAdmin}
                      canCreateTeams={canCreateTeams}
                      onCreateTeam={handleOpenCreateModal}
                    />
                  ) : filteredTeams.length === 0 ? (
                    <div className="rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                      <ListEmptyState icon={Users} isNarrowed query={searchQuery} entityLabel="team" emptyTitle="No teams yet" />
                    </div>
                  ) : displayMode === 'list' ? (
                    <FadeIn key={`list-${currentPage}`} duration={0.35} distance={8}>
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
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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

                {/* Team Members view — flat list of every assigned member across all teams. */}
                {listView === 'members' && (
                  <section className="overflow-hidden rounded-xl border border-gray-100 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] dark:ring-white/[0.02]">
                    {flattenedMembers.length === 0 ? (
                      <div className="px-6 py-16 text-center">
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
                          <UserCheck className="h-6 w-6 text-brand-blue" />
                        </div>
                        <h3 className="text-base max-sm:text-sm font-semibold text-gray-900 dark:text-slate-50">No members found</h3>
                        <p className="mt-1 text-sm max-sm:text-[13px] text-gray-500 dark:text-slate-500">Try a different search query or assign users to a team.</p>
                      </div>
                    ) : (
                      <>
                      {/* Phones: one compact row per member. */}
                      <ul className="divide-y divide-gray-100 dark:divide-slate-700/60 md:hidden">
                        {sortedMembers.map((row) => (
                          <li key={row.id} className="flex items-center gap-2.5 px-3 py-2.5">
                            <NameAvatar name={row.name} fallback={row.email} size="sm" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm max-sm:text-[13px] font-semibold text-gray-900 dark:text-slate-50">{row.name}</p>
                              <p className="truncate text-xs text-gray-500 dark:text-slate-500">{row.email}</p>
                              <p className="mt-0.5 truncate text-2xs text-gray-400 dark:text-slate-500">
                                {row.teamName}
                                {row.role && <span className="capitalize"> · {row.role.replace(/_/g, ' ').toLowerCase()}</span>}
                              </p>
                            </div>
                            {row.isLead && (
                              <span className="shrink-0 rounded-full bg-brand-orange/10 px-2 py-0.5 text-2xs font-medium text-brand-orange-deep ring-1 ring-brand-orange/15">
                                Lead
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                      <div className="hidden overflow-x-auto tf-table-shell md:block">
                        <table className="w-full min-w-[640px]">
                          <thead className="bg-gray-50/80 dark:bg-slate-800/50">
                            <tr className="text-left">
                              <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-500" aria-sort={ariaSort(memberSort, 'name')}>
                                <SortableHeader label="Member" column="name" sort={memberSort} />
                              </th>
                              <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-500" aria-sort={ariaSort(memberSort, 'team')}>
                                <SortableHeader label="Team" column="team" sort={memberSort} />
                              </th>
                              <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-500" aria-sort={ariaSort(memberSort, 'role')}>
                                <SortableHeader label="Role" column="role" sort={memberSort} />
                              </th>
                              <th className="px-6 py-4 text-xs font-semibold text-gray-500 dark:text-slate-500 text-right" aria-sort={ariaSort(memberSort, 'lead')}>
                                <SortableHeader label="Lead" column="lead" sort={memberSort} align="right" />
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                            {sortedMembers.map((row) => (
                              <tr key={row.id} className="transition-colors hover:bg-brand-blue/[0.04]">
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                    <NameAvatar name={row.name} fallback={row.email} size="md" />
                                    <div className="min-w-0">
                                      <p className="text-sm max-sm:text-[13px] font-semibold text-gray-900 dark:text-slate-50 truncate">{row.name}</p>
                                      <p className="text-xs text-gray-500 dark:text-slate-500 truncate">{row.email}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-sm max-sm:text-[13px] text-gray-700 dark:text-slate-300">{row.teamName}</td>
                                <td className="px-6 py-4 text-sm max-sm:text-[13px] text-gray-600 dark:text-slate-400">
                                  {row.role ? (
                                    <span className="capitalize">{row.role.replace(/_/g, ' ').toLowerCase()}</span>
                                  ) : (
                                    <span className="text-gray-400 dark:text-slate-500">—</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-right">
                                  {row.isLead ? (
                                    <span className="inline-flex items-center rounded-full bg-brand-orange/10 px-3 py-1 text-xs font-medium text-brand-orange-deep ring-1 ring-brand-orange/15">
                                      Team Lead
                                    </span>
                                  ) : (
                                    <span className="text-xs text-gray-400 dark:text-slate-500">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
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
          availableUsers={availableUsers.filter((user) => !teams.some((team) => team.members?.some((member) => member.id === user.id)))}
          isSubmitting={isCreating}
        />

        {/* The Team popup — details and edit form are two faces of one popup
            (same size), swapped in place. Hidden while the delete confirm is up. */}
        <TeamDetailsModal
          isOpen={teamModal === 'view' && !showDeleteDialog}
          onClose={closeTeamModal}
          team={selectedTeam}
          userRole={currentUser?.role}
          onEdit={handleStartEdit}
          canEdit={canEditTeams}
          isPreparingEdit={isPreparingEdit}
          onDelete={handleOpenDeleteDialog}
          canDelete={canDeleteTeams}
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
          availableUsers={availableUsers.filter((user) => !teams.filter((team) => team.id !== selectedTeam?.id).some((team) => team.members?.some((member) => member.id === user.id)))}
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
          onConfirm={handleDeleteTeam}
          isDeleting={isDeleting}
        />
      </div>
    </FeatureGate>
  );
}
