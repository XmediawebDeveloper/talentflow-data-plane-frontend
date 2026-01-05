import api from './api';

export interface DashboardStats {
  total_resumes: number;
  resumes_this_week: number;
  total_jds: number;
  active_jds: number;
  total_users: number;
  active_users: number;
  total_scorings: number;
  total_assessments: number;
}

export interface RecentActivity {
  id: string;
  action: string;
  action_display: string;
  user_name: string | null;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, any> | null;
  time_ago: string;
  created_at: string;
}

export interface DashboardResponse {
  stats: DashboardStats;
  recent_activity: RecentActivity[];
}

export const dashboardService = {
  async getDashboard(): Promise<DashboardResponse> {
    const response = await api.get<DashboardResponse>('/dashboard');
    return response.data;
  },
};

export default dashboardService;
