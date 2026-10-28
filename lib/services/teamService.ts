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
  /** Returned by /teams/stats; optional so older responses still type-check. */
  pending_invitations?: number;
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
    RU?: TeamUsageByType;
  };
  jds_created: number;
  assessments_created: number;
  seats_used: number;
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

export interface TeamMemberUsage {
  user_id: string;
  user_email: string;
  user_name: string;
  by_type: {
    RS?: TeamUsageByType;
    AS?: TeamUsageByType;
    AIU?: TeamUsageByType;
    RU?: TeamUsageByType;
  };
  total_consumed: number;
  total_actions: number;
  last_activity: string | null;
  jds_created: number;
  assessments_created: number;
  seats_used: number;
}

export interface TeamMembersUsageSummary {
  team_id: string;
  team_name: string;
  reporting_scope: string;
  period: {
    start: string;
    end: string;
  };
  members: TeamMemberUsage[];
  total_members: number;
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
  /** null removes the lead. */
  team_lead_id?: string | null;
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
   * - Owner: Can view any team's usage
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
   * Get usage summary for all teams (Owner only)
   */
  async getAllTeamsUsage(fromDate?: string, toDate?: string): Promise<AllTeamsUsageSummary> {
    try {
      const params: Record<string, string> = {};
      if (fromDate) params.start_date = fromDate;
      if (toDate) params.end_date = toDate;
      if (!fromDate && !toDate) params.days = '30';
      const response = await api.get('/unit-pool/teams/usage', { params });
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
  async getMyTeamsUsage(fromDate?: string, toDate?: string): Promise<MyTeamsUsageSummary> {
    try {
      const params: Record<string, string> = {};
      if (fromDate) params.start_date = fromDate;
      if (toDate) params.end_date = toDate;
      if (!fromDate && !toDate) params.days = '30';
      const response = await api.get('/unit-pool/my-teams/usage', { params });
      return response.data.data || response.data;
    } catch (error: any) {
      console.error('Error fetching my teams usage:', error);
      throw error;
    }
  }

  /**
   * Get individual member usage within a team
   * Only available for Tenant Admin
   */
  async getTeamMembersUsage(teamId: string, fromDate?: string, toDate?: string): Promise<TeamMembersUsageSummary> {
    try {
      const params: Record<string, string> = {};
      if (fromDate) params.start_date = fromDate;
      if (toDate) params.end_date = toDate;
      if (!fromDate && !toDate) params.days = '30';
      const response = await api.get(`/unit-pool/teams/${teamId}/members/usage`, { params });
      return response.data.data || response.data;
    } catch (error: any) {
      console.error(`Error fetching team ${teamId} members usage:`, error);
      throw error;
    }
  }

  async getTeamsHistory(limit: number = 20, offset: number = 0, eventType?: string): Promise<{ items: TeamHistoryEntry[]; total: number }> {
    const params: Record<string, any> = { limit, offset };
    if (eventType && eventType !== 'ALL') params.event_type = eventType;
    const response = await api.get('/teams/history', { params });
    return response.data;
  }
}

export interface TeamHistoryEntry {
  id: string;
  team_id: string;
  team_name: string;
  event_type: string;
  actor_id?: string;
  actor_name?: string;
  target_user_id?: string;
  target_user_name?: string;
  details?: Record<string, any>;
  event_at: string;
}

const teamService = new TeamService();
export default teamService;
