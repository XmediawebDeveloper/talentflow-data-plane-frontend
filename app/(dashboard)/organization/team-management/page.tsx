'use client';

import { Users, Plus, Briefcase, FileText, UserCheck, Info, Loader2, X, Search, BarChart3 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import teamService, { Team, TeamStats } from '@/lib/services/teamService';
import authService, { User } from '@/lib/services/authService';
import userService, { ApiUser } from '@/lib/services/userService';
import TeamUsageSummary from '@/components/usage/TeamUsageSummary';

export default function TeamManagementPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<Team[]>([]);
  const [stats, setStats] = useState<TeamStats>({
    total_teams: 0,
    total_members: 0,
    avg_members_per_team: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showViewDetailsModal, setShowViewDetailsModal] = useState(false);
  const [showManageTeamModal, setShowManageTeamModal] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // RBAC02 Task #15: Team limit state
  const [maxTeams, setMaxTeams] = useState<number>(-1); // -1 = unlimited
  const [teamsEnabled, setTeamsEnabled] = useState<boolean>(true);

  // Team-Level Usage Visibility: Tab state
  const [activeTab, setActiveTab] = useState<'teams' | 'usage'>('teams');

  // Form state
  const [teamName, setTeamName] = useState('');
  const [description, setDescription] = useState('');
  const [availableUsers, setAvailableUsers] = useState<ApiUser[]>([]);
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);
  const [teamLeadId, setTeamLeadId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Single useEffect for initial data fetch and permission check
  useEffect(() => {
    let isMounted = true;

    const initializePage = async () => {
      setIsLoading(true);
      try {
        // Fetch all data in parallel - getCurrentUser only once
        const [userData, teamsData, statsData, teamConfig] = await Promise.all([
          authService.getCurrentUser(),
          teamService.getTeams(),
          teamService.getTeamStats(),
          teamService.getTeamConfig(),
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
        setTeamsEnabled(teamConfig.teams_enabled);
        setMaxTeams(teamConfig.max_teams);
      } catch (error: any) {
        console.error('Error fetching data:', error);
        if (!isMounted) return;
        toast.error('Failed to load teams data');
        // Set empty state on error
        setTeams([]);
        setStats({
          total_teams: 0,
          total_members: 0,
          avg_members_per_team: 0,
        });
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    initializePage();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const fetchInitialData = async () => {
    setIsLoading(true);
    try {
      const [teamsData, statsData, teamConfig] = await Promise.all([
        teamService.getTeams(),
        teamService.getTeamStats(),
        teamService.getTeamConfig(),
      ]);

      setTeams(teamsData);
      setStats(statsData);
      setTeamsEnabled(teamConfig.teams_enabled);
      setMaxTeams(teamConfig.max_teams);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load teams data');
      setTeams([]);
      setStats({
        total_teams: 0,
        total_members: 0,
        avg_members_per_team: 0,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAvailableUsers = async () => {
    try {
      const users = await userService.listUsers({ is_active: true });
      setAvailableUsers(users);
    } catch (error: any) {
      console.error('Error fetching users:', error);
      toast.error('Failed to load available users');
    }
  };

  const handleOpenCreateModal = async () => {
    // Check if user is tenant admin
    if (currentUser?.role !== 'tenant_admin') {
      toast.error('Only tenant administrators can create teams');
      return;
    }

    // RBAC02 Task #15: Check team limit
    if (!teamsEnabled) {
      toast.error('Team creation is not available in your current plan. Please upgrade to Professional or higher.');
      return;
    }

    if (isAtTeamLimit) {
      toast.error(`You have reached the maximum number of teams (${maxTeams}) for your plan. Please upgrade to create more teams.`);
      return;
    }

    setShowCreateModal(true);
    await fetchAvailableUsers();
  };

  const handleCloseModal = () => {
    setShowCreateModal(false);
    // Reset form
    setTeamName('');
    setDescription('');
    setSelectedMemberIds([]);
    setTeamLeadId('');
    setSearchQuery('');
  };

  const handleCreateTeam = async () => {
    // Validation
    if (!teamName.trim()) {
      toast.error('Please enter a team name');
      return;
    }

    if (teamName.length < 2) {
      toast.error('Team name must be at least 2 characters');
      return;
    }

    if (teamName.length > 255) {
      toast.error('Team name must be less than 255 characters');
      return;
    }

    if (description.length > 1000) {
      toast.error('Description must be less than 1000 characters');
      return;
    }

    if (teamLeadId && !selectedMemberIds.includes(teamLeadId)) {
      toast.error('Team lead must be a member of the team');
      return;
    }

    setIsCreating(true);
    try {
      await teamService.createTeam({
        name: teamName.trim(),
        description: description.trim() || undefined,
        member_ids: selectedMemberIds,
        team_lead_id: teamLeadId || undefined,
      });

      toast.success('Team created successfully');
      handleCloseModal();

      // Refresh teams data
      const [teamsData, statsData] = await Promise.all([
        teamService.getTeams(),
        teamService.getTeamStats(),
      ]);
      setTeams(teamsData);
      setStats(statsData);
    } catch (error: any) {
      console.error('Error creating team:', error);
      toast.error(error.message || 'Failed to create team');
    } finally {
      setIsCreating(false);
    }
  };

  const toggleMemberSelection = (userId: string) => {
    setSelectedMemberIds((prev) => {
      if (prev.includes(userId)) {
        // If deselecting and this is the team lead, clear team lead
        if (teamLeadId === userId) {
          setTeamLeadId('');
        }
        return prev.filter((id) => id !== userId);
      }
      return [...prev, userId];
    });
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

      // Prefill form with existing team data
      setTeamName(team.name);
      setDescription(team.description || '');
      setSelectedMemberIds(team.members?.map(m => m.id) || []);
      setTeamLeadId(team.team_lead?.id || '');

      // Fetch available users for adding new members
      await fetchAvailableUsers();

      setShowManageTeamModal(true);
    } catch (error) {
      toast.error('Failed to load team data');
    }
  };

  const handleUpdateTeam = async () => {
    if (!selectedTeam) return;

    if (!teamName.trim()) {
      toast.error('Please enter a team name');
      return;
    }

    if (selectedMemberIds.length === 0) {
      toast.error('Please select at least one team member');
      return;
    }

    setIsUpdating(true);
    try {
      await teamService.updateTeam(selectedTeam.id, {
        name: teamName.trim(),
        description: description.trim() || undefined,
        member_ids: selectedMemberIds,
        team_lead_id: teamLeadId || undefined,
      });

      toast.success('Team updated successfully');
      handleCloseManageModal();
      await fetchInitialData();
    } catch (error: any) {
      console.error('Error updating team:', error);
      toast.error(error.response?.data?.detail || 'Failed to update team');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteTeam = async () => {
    if (!selectedTeam) return;

    if (!confirm(`Are you sure you want to delete "${selectedTeam.name}"? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      await teamService.deleteTeam(selectedTeam.id);
      toast.success('Team deleted successfully');
      handleCloseManageModal();
      await fetchInitialData();
    } catch (error: any) {
      console.error('Error deleting team:', error);
      toast.error(error.response?.data?.detail || 'Failed to delete team');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCloseManageModal = () => {
    setShowManageTeamModal(false);
    setSelectedTeam(null);
    setTeamName('');
    setDescription('');
    setSelectedMemberIds([]);
    setTeamLeadId('');
    setSearchQuery('');
  };

  // Filter users based on search query
  const filteredUsers = availableUsers.filter((user) =>
    user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // RBAC02 Task #15: Check if current user is tenant admin and team limit not reached
  const canCreateTeams = currentUser?.role === 'tenant_admin' && teamsEnabled;
  const isAtTeamLimit = maxTeams !== -1 && stats.total_teams >= maxTeams;
  const canAddTeam = canCreateTeams && !isAtTeamLimit;

  if (isLoading) {
    return (
      <main className="flex-1 flex items-center justify-center p-8 bg-gradient-to-br from-gray-50 via-white to-gray-50">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-gray-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading teams...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 p-8 overflow-y-auto bg-gradient-to-br from-gray-50 via-white to-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">Team Management</h1>
              <p className="text-gray-600">Manage teams, members, and view usage</p>
            </div>
            {canCreateTeams && (
              <div className="flex flex-col items-end gap-2">
                <button
                  onClick={handleOpenCreateModal}
                  disabled={isAtTeamLimit}
                  className={`flex items-center gap-2 px-6 py-3 rounded-xl transition-all shadow-lg ${
                    isAtTeamLimit
                      ? 'bg-gray-400 text-white cursor-not-allowed'
                      : 'bg-gray-800 text-white hover:bg-gray-900 hover:shadow-xl'
                  }`}
                  title={isAtTeamLimit ? `Team limit reached (${maxTeams}/${maxTeams})` : 'Create a new team'}
                >
                  <Plus className="w-5 h-5" />
                  Create Team
                </button>
                {maxTeams !== -1 && (
                  <p className={`text-sm ${
                    isAtTeamLimit ? 'text-red-600 font-medium' : 'text-gray-600'
                  }`}>
                    {stats.total_teams}/{maxTeams} teams used
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Team-Level Usage Visibility: Tabs */}
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
        </div>

        {/* Team-Level Usage Visibility: Usage Tab Content */}
        {activeTab === 'usage' ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
            <TeamUsageSummary userRole={currentUser?.role || 'standard_user'} />
          </div>
        ) : (
          <>
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-1">{stats.total_teams}</p>
            <p className="text-sm text-gray-600">Total Teams</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-gray-700 rounded-xl flex items-center justify-center">
                <UserCheck className="w-6 h-6 text-white" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-1">{stats.total_members}</p>
            <p className="text-sm text-gray-600">Team Members</p>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="w-12 h-12 bg-gray-600 rounded-xl flex items-center justify-center">
                <Users className="w-6 h-6 text-white" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-1">
              {stats.avg_members_per_team.toFixed(1)}
            </p>
            <p className="text-sm text-gray-600">Avg Members/Team</p>
          </div>
        </div>

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

        {/* Team Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {teams.map((team) => (
            <div
              key={team.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
            >
                  {/* Team Header */}
                  <div className="bg-gray-800 p-6 text-white">
                    <p className="text-sm font-medium opacity-90 mb-1">{team.description}</p>
                    <h3 className="text-xl font-bold">{team.name}</h3>
                  </div>

                  {/* Team Stats */}
                  <div className="p-6">
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-2 mb-1">
                          <Users className="w-4 h-4 text-gray-500" />
                          <p className="text-2xl font-bold text-gray-900">{team.member_count}</p>
                        </div>
                        <p className="text-xs text-gray-600">Members</p>
                        <p className="text-xs text-gray-500">{team.member_count} users</p>
                      </div>

                      <div className="text-center">
                        <div className="flex items-center justify-center gap-2 mb-1">
                          <Briefcase className="w-4 h-4 text-gray-500" />
                          <p className="text-2xl font-bold text-gray-900">{team.active_jobs_count}</p>
                        </div>
                        <p className="text-xs text-gray-600">Active Jobs</p>
                      </div>

                      <div className="text-center">
                        <div className="flex items-center justify-center gap-2 mb-1">
                          <FileText className="w-4 h-4 text-gray-500" />
                          <p className="text-2xl font-bold text-gray-900">{team.resumes_count}</p>
                        </div>
                        <p className="text-xs text-gray-600">Resumes</p>
                      </div>
                    </div>

                    {/* Member Avatars */}
                    <div className="flex items-center gap-3 mb-6">
                      <div className="flex -space-x-2">
                        {team.members.slice(0, 4).map((member) => (
                          <div
                            key={member.id}
                            className="w-10 h-10 rounded-full bg-gray-700 text-white flex items-center justify-center text-sm font-semibold border-2 border-white"
                            title={member.name}
                          >
                            {member.initials}
                          </div>
                        ))}
                      </div>
                      {team.member_count > 4 && (
                        <span className="text-sm text-gray-600">
                          +{team.member_count - 4} more
                        </span>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleViewDetails(team.id)}
                        className="flex-1 px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all font-medium"
                      >
                        View Details
                      </button>
                      <button
                        onClick={() => handleManageTeam(team.id)}
                        className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all font-medium"
                      >
                        Manage Team
                      </button>
                    </div>
              </div>
            </div>
          ))}

          {/* Empty State if no teams */}
          {teams.length === 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Users className="w-8 h-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No teams yet</h3>
                <p className="text-gray-600 mb-6">
                  {canCreateTeams
                    ? (isAtTeamLimit
                        ? `You have reached the maximum number of teams (${maxTeams}) for your plan. Please upgrade to create teams.`
                        : 'Create your first team to start organizing your recruitment workflow')
                    : 'No teams have been created yet. Contact your administrator to create teams.'}
                </p>
              {canCreateTeams && !isAtTeamLimit && (
                <button
                  onClick={handleOpenCreateModal}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-gray-800 text-white rounded-xl hover:bg-gray-900 transition-all"
                >
                  <Plus className="w-5 h-5" />
                  Create Your First Team
                </button>
              )}
            </div>
          )}
        </div>
          </>
        )}
      </div>

      {/* Create Team Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Create New Team</h2>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Team Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Team Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g., Engineering Recruitment"
                  maxLength={255}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">{teamName.length}/255 characters</p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Briefly describe this team's purpose..."
                  maxLength={1000}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent outline-none resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">{description.length}/1000 characters</p>
              </div>

              {/* Members Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Team Members
                </label>

                {/* Search */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search users by name or email..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent outline-none"
                  />
                </div>

                {/* User List */}
                <div className="border border-gray-300 rounded-lg max-h-60 overflow-y-auto">
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map((user) => (
                      <div
                        key={user.id}
                        onClick={() => toggleMemberSelection(user.id)}
                        className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0 ${
                          selectedMemberIds.includes(user.id) ? 'bg-gray-50' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedMemberIds.includes(user.id)}
                          onChange={() => {}}
                          className="w-4 h-4 text-gray-800 border-gray-300 rounded focus:ring-gray-800"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">{user.name}</p>
                          <p className="text-xs text-gray-500">{user.email}</p>
                        </div>
                        {user.role && (
                          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                            {user.role}
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-center text-gray-500">
                      <p className="text-sm">
                        {searchQuery ? 'No users found matching your search' : 'No users available'}
                      </p>
                    </div>
                  )}
                </div>

                <p className="text-xs text-gray-500 mt-2">
                  {selectedMemberIds.length} member{selectedMemberIds.length !== 1 ? 's' : ''} selected
                </p>
              </div>

              {/* Team Lead Selection */}
              {selectedMemberIds.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Team Lead (Optional)
                  </label>
                  <select
                    value={teamLeadId}
                    onChange={(e) => setTeamLeadId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent outline-none"
                  >
                    <option value="">No team lead</option>
                    {availableUsers
                      .filter((user) => selectedMemberIds.includes(user.id))
                      .map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} ({user.email})
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex gap-3">
              <button
                onClick={handleCloseModal}
                disabled={isCreating}
                className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTeam}
                disabled={isCreating || !teamName.trim()}
                className="flex-1 px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isCreating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Create Team
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {showViewDetailsModal && selectedTeam && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Team Details</h2>
              <button
                onClick={() => setShowViewDetailsModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Team Info */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">{selectedTeam.name}</h3>
                {selectedTeam.description && (
                  <p className="text-gray-600 mb-4">{selectedTeam.description}</p>
                )}

                {/* Stats Grid */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">Members</p>
                    <p className="text-2xl font-bold text-gray-900">{selectedTeam.member_count}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">Active Jobs</p>
                    <p className="text-2xl font-bold text-gray-900">{selectedTeam.active_jobs_count}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-1">Resumes</p>
                    <p className="text-2xl font-bold text-gray-900">{selectedTeam.resumes_count}</p>
                  </div>
                </div>
              </div>

              {/* Team Lead */}
              {selectedTeam.team_lead && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Team Lead</h4>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center text-white font-semibold">
                      {selectedTeam.team_lead.initials || 'TL'}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">{selectedTeam.team_lead.name}</p>
                      <p className="text-sm text-gray-500">{selectedTeam.team_lead.email}</p>
                    </div>
                    <span className="text-xs px-2 py-1 bg-gray-800 text-white rounded">Lead</span>
                  </div>
                </div>
              )}

              {/* Team Members */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-3">
                  Team Members ({selectedTeam.members?.length || 0})
                </h4>
                <div className="space-y-2">
                  {selectedTeam.members && selectedTeam.members.length > 0 ? (
                    selectedTeam.members.map((member) => (
                      <div key={member.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center text-white font-semibold">
                          {member.initials || 'U'}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{member.name}</p>
                          <p className="text-sm text-gray-500">{member.email}</p>
                        </div>
                        {member.role && (
                          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                            {member.role}
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-gray-500">No members</p>
                  )}
                </div>
              </div>

              {/* Timestamps */}
              <div className="pt-4 border-t border-gray-200">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Created</p>
                    <p className="text-gray-900">{new Date(selectedTeam.created_at).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Last Updated</p>
                    <p className="text-gray-900">{new Date(selectedTeam.updated_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
              <button
                onClick={() => setShowViewDetailsModal(false)}
                className="w-full px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Team Modal */}
      {showManageTeamModal && selectedTeam && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Manage Team</h2>
              <button
                onClick={handleCloseManageModal}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Team Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Team Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="e.g., Engineering Recruitment"
                  maxLength={255}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent outline-none"
                />
                <p className="text-xs text-gray-500 mt-1">{teamName.length}/255 characters</p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Briefly describe this team's purpose..."
                  maxLength={1000}
                  rows={3}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent outline-none resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">{description.length}/1000 characters</p>
              </div>

              {/* Members Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Team Members
                </label>

                {/* Search */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search users by name or email..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent outline-none"
                  />
                </div>

                {/* User List */}
                <div className="border border-gray-300 rounded-lg max-h-60 overflow-y-auto">
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map((user) => (
                      <div
                        key={user.id}
                        onClick={() => toggleMemberSelection(user.id)}
                        className={`flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0 ${
                          selectedMemberIds.includes(user.id) ? 'bg-gray-50' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedMemberIds.includes(user.id)}
                          onChange={() => {}}
                          className="w-4 h-4 text-gray-800 border-gray-300 rounded focus:ring-gray-800"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">{user.name}</p>
                          <p className="text-xs text-gray-500">{user.email}</p>
                        </div>
                        {user.role && (
                          <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                            {user.role}
                          </span>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-center text-gray-500">
                      <p className="text-sm">
                        {searchQuery ? 'No users found matching your search' : 'No users available'}
                      </p>
                    </div>
                  )}
                </div>

                <p className="text-xs text-gray-500 mt-2">
                  {selectedMemberIds.length} member{selectedMemberIds.length !== 1 ? 's' : ''} selected
                </p>
              </div>

              {/* Team Lead Selection */}
              {selectedMemberIds.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Team Lead (Optional)
                  </label>
                  <select
                    value={teamLeadId}
                    onChange={(e) => setTeamLeadId(e.target.value)}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-800 focus:border-transparent outline-none"
                  >
                    <option value="">No team lead</option>
                    {availableUsers
                      .filter((user) => selectedMemberIds.includes(user.id))
                      .map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} ({user.email})
                        </option>
                      ))}
                  </select>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 space-y-3">
              <div className="flex gap-3">
                <button
                  onClick={handleCloseManageModal}
                  disabled={isUpdating || isDeleting}
                  className="flex-1 px-4 py-2.5 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUpdateTeam}
                  disabled={isUpdating || isDeleting || !teamName.trim()}
                  className="flex-1 px-4 py-2.5 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isUpdating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>

              {/* Delete Button */}
              <button
                onClick={handleDeleteTeam}
                disabled={isUpdating || isDeleting}
                className="w-full px-4 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete Team'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
