'use client';

import { Users, Plus, Info, Loader2, BarChart3, Search, ChevronLeft, ChevronRight, Filter, TrendingUp } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import FeatureGate from '@/components/shared/FeatureGate';
import teamService, { Team, TeamStats } from '@/lib/services/teamService';
import authService, { User } from '@/lib/services/authService';
import userService, { ApiUser } from '@/lib/services/userService';
import TeamUsageSummary from '@/components/usage/TeamUsageSummary';
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
} from '@/components/teams';

const ITEMS_PER_PAGE = 6;

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

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewDetailsModal, setShowViewDetailsModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);

  // Loading states
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Tab state
  const [activeTab, setActiveTab] = useState<'teams' | 'usage' | 'analytics'>('teams');

  // Search, filter, and pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTeamLead, setFilterTeamLead] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch initial data
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

        // Check permission
        const hasPermission = userData.role === 'tenant_admin' || userData.permissions?.can_manage_users;
        if (!hasPermission) {
          toast.error('You do not have permission to access Team Management');
          router.push('/dashboard');
          return;
        }

        setCurrentUser(userData);
        setTeams(teamsData);
        setStats(statsData);
      } catch (error: any) {
        console.error('Error fetching data:', error);
        if (!isMounted) return;
        toast.error('Failed to load teams data');
        setTeams([]);
        setStats({ total_teams: 0, total_members: 0, avg_members_per_team: 0 });
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    initializePage();
    return () => { isMounted = false; };
  }, [router]);

  // Filter and search teams
  const filteredTeams = useMemo(() => {
    let result = teams;

    // Search by name or description
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (team) =>
          team.name.toLowerCase().includes(query) ||
          (team.description && team.description.toLowerCase().includes(query))
      );
    }

    // Filter by team lead
    if (filterTeamLead) {
      result = result.filter((team) => team.team_lead?.id === filterTeamLead);
    }

    return result;
  }, [teams, searchQuery, filterTeamLead]);

  // Pagination
  const totalPages = Math.ceil(filteredTeams.length / ITEMS_PER_PAGE);
  const paginatedTeams = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredTeams.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredTeams, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, filterTeamLead]);

  // Get unique team leads for filter dropdown
  const teamLeads = useMemo(() => {
    const leads = teams
      .filter((team) => team.team_lead)
      .map((team) => team.team_lead!)
      .filter((lead, index, self) => self.findIndex((l) => l.id === lead.id) === index);
    return leads;
  }, [teams]);

  const fetchAvailableUsers = async () => {
    try {
      const users = await userService.listUsers({ is_active: true });
      setAvailableUsers(users);
    } catch (error: any) {
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

  // Handlers
  const handleOpenCreateModal = async () => {
    if (currentUser?.role !== 'tenant_admin') {
      toast.error('Only tenant administrators can create teams');
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
    } catch (error: any) {
      console.error('Error creating team:', error);
      toast.error(error.message || 'Failed to create team');
    } finally {
      setIsCreating(false);
    }
  };

  const handleViewDetails = async (teamId: string) => {
    try {
      const team = await teamService.getTeam(teamId);
      setSelectedTeam(team);
      setShowViewDetailsModal(true);
    } catch (error) {
      toast.error('Failed to load team details');
    }
  };

  const handleManageTeam = async (teamId: string) => {
    try {
      const team = await teamService.getTeam(teamId);
      setSelectedTeam(team);
      await fetchAvailableUsers();
      setShowEditModal(true);
    } catch (error) {
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
    } catch (error: any) {
      console.error('Error updating team:', error);
      toast.error(error.response?.data?.detail || 'Failed to update team');
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
    } catch (error: any) {
      console.error('Error deleting team:', error);
      toast.error(error.response?.data?.detail || 'Failed to delete team');
    } finally {
      setIsDeleting(false);
    }
  };

  // Computed values
  const isTenantAdmin = currentUser?.role === 'tenant_admin';
  const canCreateTeams = isTenantAdmin;

  if (isLoading) {
    return (
      <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
        <div className="max-w-7xl mx-auto">
          {/* Header Skeleton */}
          <div className="mb-8">
            <div className="h-8 w-64 bg-gray-200 rounded animate-pulse mb-2" />
            <div className="h-5 w-48 bg-gray-200 rounded animate-pulse" />
          </div>

          {/* Stats Skeleton */}
          <TeamStatsCards stats={stats} isLoading={true} />

          {/* Cards Skeleton */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <TeamCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <FeatureGate feature="teams">
    <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 mb-2">Team Management</h1>
              <p className="text-gray-600">Manage teams, members, and view usage</p>
            </div>
            {isTenantAdmin && (
              <button
                onClick={handleOpenCreateModal}
                className="flex items-center gap-2 px-6 py-3 rounded-xl transition-all shadow-lg bg-gray-800 text-white hover:bg-gray-900 hover:shadow-xl"
              >
                <Plus className="w-5 h-5" />
                Create Team
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('teams')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'teams'
                ? 'bg-gray-800 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            <Users className="w-4 h-4" />
            Teams
          </button>
          <button
            onClick={() => setActiveTab('usage')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'usage'
                ? 'bg-gray-800 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            Team Usage
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all ${
              activeTab === 'analytics'
                ? 'bg-gray-800 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Analytics
          </button>
        </div>

        {/* Usage Tab Content */}
        {activeTab === 'usage' ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <TeamUsageSummary userRole={currentUser?.role || 'standard_user'} />
          </div>
        ) : activeTab === 'analytics' ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <TeamAnalyticsDashboard userRole={currentUser?.role || 'standard_user'} />
          </div>
        ) : (
          <>
            {/* Stats Cards */}
            <TeamStatsCards stats={stats} />

            {/* Team Organization Info */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 mb-8">
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Info className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Team Organization</h3>
                  <p className="text-gray-700 leading-relaxed">
                    Teams help organize users by department, project, or function. Assign team leads to manage
                    workflows and track team performance metrics like active jobs and resume counts.
                  </p>
                </div>
              </div>
            </div>

            {/* Search and Filter */}
            {teams.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search teams by name or description..."
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent outline-none"
                  />
                </div>
                {teamLeads.length > 0 && (
                  <div className="relative">
                    <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <select
                      value={filterTeamLead}
                      onChange={(e) => setFilterTeamLead(e.target.value)}
                      className="pl-10 pr-8 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent outline-none appearance-none bg-white min-w-[200px]"
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
            )}

            {/* Team Cards Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {paginatedTeams.map((team) => (
                <TeamCard
                  key={team.id}
                  team={team}
                  onViewDetails={handleViewDetails}
                  onManageTeam={handleManageTeam}
                />
              ))}

              {/* Empty State */}
              {teams.length === 0 && (
                <EmptyState
                  isTenantAdmin={isTenantAdmin}
                  canCreateTeams={canCreateTeams}
                  onCreateTeam={handleOpenCreateModal}
                />
              )}

              {/* No results from search/filter */}
              {teams.length > 0 && filteredTeams.length === 0 && (
                <div className="col-span-full bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                  <Search className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">No teams found</h3>
                  <p className="text-gray-600">
                    Try adjusting your search or filter criteria
                  </p>
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setFilterTeamLead('');
                    }}
                    className="mt-4 text-gray-800 hover:underline font-medium"
                  >
                    Clear filters
                  </button>
                </div>
              )}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-8 px-2">
                <p className="text-sm text-gray-600">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to{' '}
                  {Math.min(currentPage * ITEMS_PER_PAGE, filteredTeams.length)} of {filteredTeams.length} teams
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <div className="flex gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className={`w-10 h-10 rounded-lg font-medium transition-all ${
                          currentPage === page
                            ? 'bg-gray-800 text-white'
                            : 'hover:bg-gray-100 text-gray-700'
                        }`}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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

      {/* Create Team Modal */}
      <TeamFormModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSubmit={handleCreateTeam}
        mode="create"
        availableUsers={availableUsers}
        isSubmitting={isCreating}
      />

      {/* Edit Team Modal */}
      <TeamFormModal
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
                memberIds: selectedTeam.members?.map((m) => m.id) || [],
                teamLeadId: selectedTeam.team_lead?.id || '',
              }
            : undefined
        }
        availableUsers={availableUsers}
        isSubmitting={isUpdating}
        onDelete={handleOpenDeleteDialog}
        isDeleting={isDeleting}
      />

      {/* View Details Modal */}
      <TeamDetailsModal
        isOpen={showViewDetailsModal}
        onClose={() => {
          setShowViewDetailsModal(false);
          setSelectedTeam(null);
        }}
        team={selectedTeam}
        userRole={currentUser?.role}
      />

      {/* Delete Confirmation Dialog */}
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
