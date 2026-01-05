import api from './api';

export interface DashboardStats {
  total_resumes: number;
  resumes_this_week: number;
  total_jds: number;
  active_jds: number;
  draft_jds: number;  // JD02A: Draft JDs count
  my_jds: number;     // JD02B: JDs created by current user
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

// JD02A: Unit availability type
export interface UnitAvailability {
  available: number;
  used: number;
  limit: number;
  is_unlimited: boolean;
  percentage_used: number;
}

// JD02A: Subscription units
export interface SubscriptionUnits {
  RS: UnitAvailability;  // Resume Scoring
  AS: UnitAvailability;  // Assessment
  AIU: UnitAvailability; // AI Interview
}

// JD02A: JD-specific activity
export interface JDActivity {
  id: string;
  jd_id: string | null;
  jd_title: string | null;
  action: string;
  action_display: string;
  user_name: string | null;
  time_ago: string;
  created_at: string;
}

export interface DashboardResponse {
  stats: DashboardStats;
  recent_activity: RecentActivity[];
  // JD02A: Additional fields
  subscription_units: SubscriptionUnits | null;
  jd_recent_activity: JDActivity[];
}

export const dashboardService = {
  async getDashboard(): Promise<DashboardResponse> {
    const response = await api.get<DashboardResponse>('/dashboard');
    return response.data;
  },
};

export default dashboardService;
