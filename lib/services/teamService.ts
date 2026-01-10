/**
 * Team Service
 * Handles team management API calls
 */

import api from './api';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  initials: string;
  avatar_url?: string;
  role?: string;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  members: TeamMember[];
  member_count: number;
  active_jobs_count: number;
  resumes_count: number;
  created_at: string;
  updated_at: string;
  created_by?: string;
  team_lead?: TeamMember;
}

export interface TeamStats {
  total_teams: number;
  total_members: number;
  avg_members_per_team: number;
}

export interface TeamConfig {
  teams_enabled: boolean;
  max_teams: number;
  max_team_size: number;
}

// Team-Level Usage Visibility interfaces
export interface TeamUsageByType {
  total_consumed: number;
  consumption_count: number;
}

export interface TeamUsageSummary {
  team_id: string;
  team_name: string | null;
  reporting_scope: string;
  period: {
    start: string | null;
    end: string | null;
  };
  by_type: {
    RS?: TeamUsageByType;
    AS?: TeamUsageByType;
    AIU?: TeamUsageByType;
  };
  note: string;
}

export interface AllTeamsUsageSummary {
  tenant_id: string;
  reporting_scope: string;
  period: {
    start: string;
    end: string;
  };
  teams: TeamUsageSummary[];
  total_teams: number;
}

export interface MyTeamsUsageSummary {
  tenant_id: string;
  reporting_scope: string;
  period: {
    start: string | null;
    end: string | null;
  };
  teams: TeamUsageSummary[];
  total_teams: number;
  note?: string;
}

export interface CreateTeamRequest {
  name: string;
  description?: string;
  member_ids?: string[];
  team_lead_id?: string;
}

export interface UpdateTeamRequest {
  name?: string;
  description?: string;
  member_ids?: string[];
  team_lead_id?: string;
}

class TeamService {
  /**
   * Get all teams
   */
  async getTeams(): Promise<Team[]> {
    try {
      const response = await api.get('/teams');
      return response.data.data || response.data;
    } catch (error) {
      console.error('Error fetching teams:', error);
      throw error;
    }
  }

  /**
   * Get team by ID
   */
  async getTeamById(teamId: string): Promise<Team> {
    try {
      const response = await api.get(`/teams/${teamId}`);
      return response.data.data || response.data;
    } catch (error) {
      console.error(`Error fetching team ${teamId}:`, error);
      throw error;
    }
  }

  /**
   * Get team (alias for getTeamById)
   */
  async getTeam(teamId: string): Promise<Team> {
    return this.getTeamById(teamId);
  }

  /**
   * Get team statistics
   */
  async getTeamStats(): Promise<TeamStats> {
    try {
      const response = await api.get('/teams/stats');
      return response.data.data || response.data;
    } catch (error) {
      console.error('Error fetching team stats:', error);
      throw error;
    }
  }

  /**
   * Get team configuration (limits) from plan
   * RBAC02 Task #15
   */
  async getTeamConfig(): Promise<TeamConfig> {
    try {
      const response = await api.get('/tenant-admin/plan-features');
      const data = response.data.data || response.data;
      return {
        teams_enabled: data.teams_enabled || false,
        max_teams: data.max_teams || 0,
        max_team_size: data.max_team_size || 0,
      };
    } catch (error) {
      console.error('Error fetching team config:', error);
      // Return defaults on error
      return {
        teams_enabled: false,
        max_teams: 0,
        max_team_size: 0,
      };
    }
  }

  /**
   * Create a new team
   */
  async createTeam(data: CreateTeamRequest): Promise<Team> {
    try {
      const response = await api.post('/teams', data);
      return response.data.data || response.data;
    } catch (error) {
      console.error('Error creating team:', error);
      throw error;
    }
  }

  /**
   * Update a team
   */
  async updateTeam(teamId: string, data: UpdateTeamRequest): Promise<Team> {
    try {
      const response = await api.put(`/teams/${teamId}`, data);
      return response.data.data || response.data;
    } catch (error) {
      console.error(`Error updating team ${teamId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a team
   */
  async deleteTeam(teamId: string): Promise<void> {
    try {
      await api.delete(`/teams/${teamId}`);
    } catch (error) {
      console.error(`Error deleting team ${teamId}:`, error);
      throw error;
    }
  }

  /**
   * Add members to a team
   */
  async addTeamMembers(teamId: string, memberIds: string[]): Promise<Team> {
    try {
      const response = await api.post(`/teams/${teamId}/members`, { member_ids: memberIds });
      return response.data.data || response.data;
    } catch (error) {
      console.error(`Error adding members to team ${teamId}:`, error);
      throw error;
    }
  }

  /**
   * Remove member from a team
   */
  async removeTeamMember(teamId: string, memberId: string): Promise<void> {
    try {
      await api.delete(`/teams/${teamId}/members/${memberId}`);
    } catch (error) {
      console.error(`Error removing member from team ${teamId}:`, error);
      throw error;
    }
  }

  // =========================================================================
  // TEAM-LEVEL USAGE VISIBILITY
  // =========================================================================

  /**
   * Get usage summary for a specific team
   * Role-Based Access:
   * - Tenant Admin: Can view any team's usage
   * - Standard User/Viewer: Can only view their own team's usage
   * - Billing Manager: No access
   */
  async getTeamUsage(teamId: string, days: number = 30): Promise<TeamUsageSummary> {
    try {
      const response = await api.get(`/unit-pool/teams/${teamId}/usage`, {
        params: { days },
      });
      return response.data.data || response.data;
    } catch (error: any) {
      console.error(`Error fetching team ${teamId} usage:`, error);
      throw error;
    }
  }

  /**
   * Get usage summary for all teams (Tenant Admin only)
   */
  async getAllTeamsUsage(days: number = 30): Promise<AllTeamsUsageSummary> {
    try {
      const response = await api.get('/unit-pool/teams/usage', {
        params: { days },
      });
      return response.data.data || response.data;
    } catch (error: any) {
      console.error('Error fetching all teams usage:', error);
      throw error;
    }
  }

  /**
   * Get usage summary for current user's teams
   * Available for Standard Users and Viewers
   */
  async getMyTeamsUsage(days: number = 30): Promise<MyTeamsUsageSummary> {
    try {
      const response = await api.get('/unit-pool/my-teams/usage', {
        params: { days },
      });
      return response.data.data || response.data;
    } catch (error: any) {
      console.error('Error fetching my teams usage:', error);
      throw error;
    }
  }
}

const teamService = new TeamService();
export default teamService;
