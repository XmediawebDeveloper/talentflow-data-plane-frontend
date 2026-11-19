import api from './api';
import { cachedList, listCacheKey, listReadOptions, type ListReadOptions } from '@/lib/utils/listCache';

export interface DashboardStats {
  total_resumes: number;
  my_resumes: number;
  internal_db_resumes: number;
  resumes_this_week: number;
  total_jds: number;
  active_jds: number;
  draft_jds: number;  // JD02A: Draft JDs count
  my_jds: number;     // JD02B: JDs created by current user
  total_users: number;
  active_users: number;
  total_scorings: number;
  total_assessments: number;
  // Assessment stats from actual data
  assessment_completed_count: number;
  assessment_average_score: number | null;  // Overall average score
}

export interface RecentActivity {
  id: string;
  action: string;
  action_display: string;
  user_name: string | null;
  user_email?: string | null;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, any> | null;
  ip_address?: string | null;
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
  RU?: UnitAvailability;  // Resume Upload
  RS?: UnitAvailability;  // Resume Scoring
  AS?: UnitAvailability;  // Assessment
  AIU?: UnitAvailability; // AI Interview
  max_seats?: UnitAvailability; // Max Users
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
  user_recent_activity: RecentActivity[];  // Current user's own activities
}

export const dashboardService = {
  /* Through the shared list cache: `reuseRecent` (screens that only display it
     on arrival — Dashboard, Usage history) reuses a read from the last 30 s, so
     going back to the Dashboard does not ask again. Any write clears it. */
  async getDashboard(opts?: ListReadOptions): Promise<DashboardResponse> {
    return cachedList(
      listCacheKey('dashboard'),
      async () => (await api.get<DashboardResponse>('/dashboard')).data,
      listReadOptions(opts),
    );
  },
};

export default dashboardService;
