'use client';

import {
  Users,
  Plus,
  Info,
  BarChart3,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  TrendingUp,
  History,
  Layers3,
  ArrowUpRight,
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
  TeamCardSkeleton,
  TeamFormModal,
  TeamDetailsModal,
  DeleteConfirmDialog,
  EmptyState,
  TeamFormData,
  TeamAnalyticsDashboard,
  TeamUsageAnalytics,
} from '@/components/teams';
import TeamHistory from '@/components/teams/TeamHistory';

const ITEMS_PER_PAGE = 6;

const getErrorDetail = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return undefined;
  }
  const response = (error as { response?: { data?: { detail?: string } } }).response;
  return response?.data?.detail;
};

export default function TeamManagementPage() {
  const router = useRouter();
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewDetailsModal, setShowViewDetailsModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [activeTab, setActiveTab] = useState<'teams' | 'usage' | 'analytics' | 'history'>('teams');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTeamLead, setFilterTeamLead] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);

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

        const hasPermission =
          userData.role === 'tenant_admin' ||
          userData.permissions?.can_view_teams ||
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

    return result;
  }, [teams, searchQuery, filterTeamLead]);

  const totalPages = Math.ceil(filteredTeams.length / ITEMS_PER_PAGE);
  const paginatedTeams = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTeams.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTeams, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterTeamLead]);

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
  const canViewUsageTab = isTenantAdmin || !!currentUser?.permissions?.can_view_team_usage;
  const canViewAnalyticsTab = isTenantAdmin || !!currentUser?.permissions?.can_view_team_usage;

  const handleOpenCreateModal = async () => {
    if (!canCreateTeams) {
      toast.error('You do not have permission to create teams');
      return;
    }

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
      setShowViewDetailsModal(true);
    } catch {
      toast.error('Failed to load team details');
    }
  };

  const handleManageTeam = async (teamId: string) => {
    try {
      const team = await teamService.getTeam(teamId);
      setSelectedTeam(team);
      await fetchAvailableUsers();
      setShowEditModal(true);
    } catch {
      toast.error('Failed to load team data');
    }
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

    setIsUpdating(true);
    try {
      await teamService.updateTeam(selectedTeam.id, {
        name: data.name,
        description: data.description || undefined,
        member_ids: data.memberIds,
        team_lead_id: data.teamLeadId || undefined,
      });

      toast.success('Team updated successfully');
      setShowEditModal(false);
      setSelectedTeam(null);
      await refreshData();
    } catch (error: unknown) {
      console.error('Error updating team:', error);
      toast.error(getErrorDetail(error) || 'Failed to update team');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleOpenDeleteDialog = () => {
    setShowEditModal(false);
    setShowDeleteDialog(true);
  };

  const handleDeleteTeam = async () => {
    if (!selectedTeam) return;

    setIsDeleting(true);
    try {
      await teamService.deleteTeam(selectedTeam.id);
      toast.success('Team deleted successfully');
      setShowDeleteDialog(false);
      setSelectedTeam(null);
      await refreshData();
    } catch (error: unknown) {
      console.error('Error deleting team:', error);
      toast.error(getErrorDetail(error) || 'Failed to delete team');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <main className="flex-1 bg-slate-50">
        <div className="p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            <section className="relative mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal p-4 text-white shadow-xl shadow-brand-blue/20 ring-1 ring-white/10 sm:p-5 lg:p-6">
              <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-cyan/25 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-brand-orange/15 blur-3xl" />
              <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
              <div className="relative">
                <div className="mb-4 h-6 w-36 animate-pulse rounded-full bg-white/20" />
                <div className="mb-3 h-9 w-64 animate-pulse rounded bg-white/20" />
                <div className="h-5 w-72 animate-pulse rounded bg-white/15" />
              </div>
            </section>

            <TeamStatsCards stats={stats} isLoading={true} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[1, 2, 3, 4].map((index) => (
                <TeamCardSkeleton key={index} />
              ))}
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <FeatureGate feature="teams">
      <main className="flex-1 bg-slate-50">
        <div className="p-4 md:p-8">
          <div className="max-w-7xl mx-auto">
            <section className="relative mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-blue via-brand-blue-2 to-brand-teal p-4 text-white shadow-xl shadow-brand-blue/20 ring-1 ring-white/10 sm:p-5 lg:p-6">
              <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-cyan/25 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 -left-10 h-64 w-64 rounded-full bg-brand-orange/15 blur-3xl" />
              <div className="pointer-events-none absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />

              <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-white/15 backdrop-blur-sm">
                    <Layers3 className="h-3.5 w-3.5 text-brand-orange" />
                    Team operations workspace
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/12 ring-1 ring-white/15 backdrop-blur-sm">
                      <Users className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <h1 className="text-lg sm:text-xl font-semibold tracking-tight">Team Management</h1>
                      <p className="mt-1 max-w-2xl text-xs sm:text-sm text-white/80">
                        Organize departments, assign leads, and monitor team usage with the same polished dashboard language used across the platform.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="grid grid-cols-2 gap-2 text-sm text-white/85 sm:min-w-[260px]">
                    <div className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/10 backdrop-blur-sm">
                      <div className="text-xs text-white/65">Teams</div>
                      <div className="mt-1 font-semibold">{stats.total_teams}</div>
                    </div>
                    <div className="rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/10 backdrop-blur-sm">
                      <div className="text-xs text-white/65">Members</div>
                      <div className="mt-1 font-semibold">{stats.total_members}</div>
                    </div>
                  </div>
                  {canCreateTeams && (
                    <button
                      onClick={handleOpenCreateModal}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-2 text-sm font-medium text-brand-blue shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg"
                    >
                      <Plus className="h-4 w-4" />
                      Create Team
                      <ArrowUpRight className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </section>

            <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-2 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
              <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                <button
                  onClick={() => setActiveTab('teams')}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all whitespace-nowrap ${
                    activeTab === 'teams'
                      ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/25'
                      : 'text-gray-600 hover:bg-brand-blue/[0.04] hover:text-brand-blue'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Teams
                </button>
                {canViewUsageTab && (
                  <button
                    onClick={() => setActiveTab('usage')}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all whitespace-nowrap ${
                      activeTab === 'usage'
                        ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/25'
                        : 'text-gray-600 hover:bg-brand-blue/[0.04] hover:text-brand-blue'
                    }`}
                  >
                    <BarChart3 className="w-4 h-4" />
                    Team Usage
                  </button>
                )}
                {canViewAnalyticsTab && (
                  <button
                    onClick={() => setActiveTab('analytics')}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all whitespace-nowrap ${
                      activeTab === 'analytics'
                        ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/25'
                        : 'text-gray-600 hover:bg-brand-blue/[0.04] hover:text-brand-blue'
                    }`}
                  >
                    <TrendingUp className="w-4 h-4" />
                    Analytics
                  </button>
                )}
                {isTenantAdmin && (
                  <button
                    onClick={() => setActiveTab('history')}
                    className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all whitespace-nowrap ${
                      activeTab === 'history'
                        ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/25'
                        : 'text-gray-600 hover:bg-brand-blue/[0.04] hover:text-brand-blue'
                    }`}
                  >
                    <History className="w-4 h-4" />
                    Teams History
                  </button>
                )}
              </div>
            </div>

            {activeTab === 'usage' ? (
              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] sm:p-6">
                <TeamUsageAnalytics />
              </div>
            ) : activeTab === 'analytics' ? (
              <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] sm:p-6">
                <TeamAnalyticsDashboard userRole={currentUser?.role || 'standard_user'} />
              </div>
            ) : activeTab === 'history' ? (
              <TeamHistory />
            ) : (
              <>
                <TeamStatsCards stats={stats} />

                <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] sm:p-5 lg:p-6">
                  <div className="flex gap-3 sm:gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-orange/10 ring-1 ring-brand-orange/15 shadow-sm shadow-brand-orange/10">
                      <Info className="w-5 h-5 text-brand-orange-deep" />
                    </div>
                    <div>
                      <h3 className="mb-1 text-base font-semibold text-gray-900 sm:mb-2 lg:text-lg">Team Organization</h3>
                      <p className="text-sm leading-relaxed text-gray-600">
                        Teams help organize users by department, project, or function. Assign team leads to manage workflows and track performance metrics like active jobs and resume counts.
                      </p>
                    </div>
                  </div>
                </div>

                {teams.length > 0 && (
                  <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] sm:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search teams by name or description..."
                          className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-4 text-sm text-gray-900 outline-none transition-all placeholder:text-gray-400 focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                        />
                      </div>
                      {teamLeads.length > 0 && (
                        <div className="relative">
                          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <select
                            value={filterTeamLead}
                            onChange={(e) => setFilterTeamLead(e.target.value)}
                            className="min-w-[220px] appearance-none rounded-xl border border-gray-200 bg-white py-3 pl-10 pr-8 text-sm text-gray-900 outline-none transition-all focus:border-brand-blue/30 focus:ring-4 focus:ring-brand-blue/10"
                          >
                            <option value="">All Team Leads</option>
                            {teamLeads.map((lead) => (
                              <option key={lead.id} value={lead.id}>
                                {lead.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {paginatedTeams.map((team) => (
                    <TeamCard
                      key={team.id}
                      team={team}
                      canManage={canEditTeams}
                      onViewDetails={handleViewDetails}
                      onManageTeam={handleManageTeam}
                    />
                  ))}

                  {teams.length === 0 && (
                    <EmptyState
                      isTenantAdmin={isTenantAdmin}
                      canCreateTeams={canCreateTeams}
                      onCreateTeam={handleOpenCreateModal}
                    />
                  )}

                  {teams.length > 0 && filteredTeams.length === 0 && (
                    <div className="col-span-full rounded-2xl border border-gray-100 bg-white p-12 text-center shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02]">
                      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-blue/10 ring-1 ring-brand-blue/15">
                        <Search className="h-6 w-6 text-brand-blue" />
                      </div>
                      <h3 className="mb-2 text-lg font-semibold text-gray-900">No teams found</h3>
                      <p className="text-gray-600">Try adjusting your search or filter criteria.</p>
                      <button
                        onClick={() => {
                          setSearchQuery('');
                          setFilterTeamLead('');
                        }}
                        className="mt-4 inline-flex items-center rounded-full bg-brand-blue/[0.06] px-4 py-2 text-sm font-medium text-brand-blue ring-1 ring-brand-blue/10 hover:bg-brand-blue/[0.1]"
                      >
                        Clear filters
                      </button>
                    </div>
                  )}
                </div>

                {totalPages > 1 && (
                  <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm shadow-brand-blue/5 ring-1 ring-black/[0.02] sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-gray-600">
                      Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredTeams.length)} of {filteredTeams.length} teams
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                        disabled={currentPage === 1}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-600 transition-all hover:bg-brand-blue/[0.04] hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Previous page"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <div className="flex gap-1">
                        {Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page)}
                            className={`h-10 w-10 rounded-xl font-medium transition-all ${
                              currentPage === page
                                ? 'bg-brand-blue text-white shadow-md shadow-brand-blue/25'
                                : 'text-gray-700 hover:bg-brand-blue/[0.04]'
                            }`}
                          >
                            {page}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                        disabled={currentPage === totalPages}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-600 transition-all hover:bg-brand-blue/[0.04] hover:text-brand-blue disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Next page"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
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

        <TeamFormModal
          key={`edit-${selectedTeam?.id || 'none'}-${showEditModal ? 'open' : 'closed'}`}
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setSelectedTeam(null);
          }}
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
          onDelete={canDeleteTeams ? handleOpenDeleteDialog : undefined}
          isDeleting={isDeleting}
        />

        <TeamDetailsModal
          isOpen={showViewDetailsModal}
          onClose={() => {
            setShowViewDetailsModal(false);
            setSelectedTeam(null);
          }}
          team={selectedTeam}
          userRole={currentUser?.role}
        />

        <DeleteConfirmDialog
          open={showDeleteDialog}
          onOpenChange={(open) => {
            setShowDeleteDialog(open);
            if (!open) setSelectedTeam(null);
          }}
          teamName={selectedTeam?.name || ''}
          onConfirm={handleDeleteTeam}
          isDeleting={isDeleting}
        />
      </main>
    </FeatureGate>
  );
}
