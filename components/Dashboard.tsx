import {
  Users,
  Briefcase,
  FileText,
  Video,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  Clock,
  CheckCircle,
  AlertCircle,
  Crown,
  Zap,
  BarChart3,
  Calendar,
  MapPin,
  Building2,
  Sparkles,
  Edit2,
  Trash2,
  LogIn,
  LogOut,
  Plus,
  Settings,
  FolderOpen,
  CreditCard,
  Upload,
  Send,
  Activity,
  XCircle
} from 'lucide-react';
import type { IconComponent } from '@/lib/types/icon';
import { useState, useEffect, useCallback } from 'react';
import { jdService, JDResponse } from '@/lib/services/jdService';
import { assessmentService } from '@/lib/services';
import { showErrorToast } from '@/lib/utils/errorToast';
import { handleUnauthorized, getAccessToken } from '@/lib/services/api';

import { User, Tenant, getRemainingUnits } from '@/lib/types/tenant';
import UnitsWarningBanner from './UnitsWarningBanner';
import { useAuth } from '@/lib/hooks/useAuth';
import { usePlanFeatures, usePlanLock } from '@/lib/hooks/usePlanFeature';
import PlanLockedOverlay from '@/components/shared/PlanLockedOverlay';
import { formatISTDate } from '@/lib/utils/dateUtils';
import { PLAN_FEATURE_METADATA, PlanFeatureKey } from '@/lib/types/planFeatures';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { clickableProps } from '@/lib/a11y/clickableProps';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

interface AuditLog {
  id: string;
  user_name: string;
  user_email: string | null;
  action: string;
  action_label: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, any>;
  ip_address: string | null;
  created_at: string;
}

interface DashboardProps {
  onNavigateToJobs?: () => void;
  onAIMatch?: (job: any) => void;
  onNavigateToJDCreation?: () => void;
  onNavigateToMyResumes?: () => void;
  onNavigateToAssessments?: () => void;
  onNavigateToAIInterview?: () => void;
  onNavigateToAnalytics?: () => void;
  onNavigateToUsage?: () => void;
  onViewJobDetails?: (job: any) => void;
  onUpgradePlan?: () => void;
  user?: User;
  tenant?: Tenant;
}

export default function Dashboard({
  onNavigateToJobs,
  onAIMatch,
  onNavigateToJDCreation,
  onNavigateToMyResumes,
  onNavigateToAssessments,
  onNavigateToAIInterview,
  onNavigateToAnalytics,
  onNavigateToUsage,
  onViewJobDetails,
  onUpgradePlan,
  user,
  tenant
}: DashboardProps = {}) {
  // Get permission helpers from auth context
  const { hasPermission, isTenantAdmin } = useAuth();

  // Plan feature gating
  const { hasPlanFeature, features: planFeatures } = usePlanFeatures();
  const { isPlanLocked } = usePlanLock();

  // Get usage data from tenant
  const subscription = tenant?.subscription;
  const usage = subscription?.usage;
  const limits = subscription?.limits;

  // JD State Management
  const [publishedJDs, setPublishedJDs] = useState<JDResponse[]>([]);
  const [draftJDs, setDraftJDs] = useState<JDResponse[]>([]);
  const [loadingJDs, setLoadingJDs] = useState(true);

  // Assessment Stats
  const [assessmentStats, setAssessmentStats] = useState({
    total_assessments: 0,
    active_assessments: 0,
    units_consumed: 0,
  });

  // Recent Activity State
  const [recentActivities, setRecentActivities] = useState<AuditLog[]>([]);
  const [loadingActivities, setLoadingActivities] = useState(true);

  // Permission checks
  const canCreateJD = hasPermission('canCreateJD') || isTenantAdmin;
  const canUpdateJD = hasPermission('canUpdateJD') || isTenantAdmin;

  // Fetch Recent Activities
  const fetchRecentActivities = useCallback(async () => {
    console.log('[Dashboard] fetchRecentActivities called');
    setLoadingActivities(true);
    try {
      const token = getAccessToken();
      console.log('[Dashboard] Token exists:', !!token);
      if (!token) {
        console.log('[Dashboard] No token, skipping fetch');
        setLoadingActivities(false);
        return;
      }

      console.log('[Dashboard] Fetching from:', `${API_URL}/audits/recent?limit=5`);
      const response = await fetch(`${API_URL}/audits/recent?limit=5`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('[Dashboard] Response status:', response.status);
      if (!response.ok) {
        if (response.status === 401) {
          handleUnauthorized();
          return;
        }
        const errorText = await response.text();
        console.error('[Dashboard] Error response:', errorText);
        throw new Error('Failed to fetch activities');
      }

      const data = await response.json();
      console.log('[Dashboard] Recent activities API response:', JSON.stringify(data, null, 2));
      setRecentActivities(data || []);
    } catch (error) {
      console.error('[Dashboard] Failed to fetch recent activities:', error);
    } finally {
      setLoadingActivities(false);
    }
  }, []);

  // Helper function to get activity details
  const getActivityDetails = (log: AuditLog): string => {
    // Debug logging
    console.log('[Dashboard] Processing log:', {
      action: log.action,
      details: log.details,
      user_email: log.user_email,
      ip_address: log.ip_address
    });

    // Parse details if it's a string (sometimes JSON comes as string)
    let details: Record<string, any> = {};
    if (log.details) {
      if (typeof log.details === 'string') {
        try {
          details = JSON.parse(log.details);
        } catch {
          details = {};
        }
      } else {
        details = log.details;
      }
    }

    // Normalize action to lowercase for comparison
    const actionLower = (log.action || '').toLowerCase();

    // For login/logout actions - show email and IP
    if (actionLower.includes('login') || actionLower.includes('logout')) {
      const parts: string[] = [];
      // Try to get email from details or from user_email field
      const email = details.email || log.user_email;
      if (email) parts.push(email);
      if (log.ip_address) parts.push(`IP: ${log.ip_address}`);
      if (parts.length > 0) return parts.join(' • ');
      return 'Session activity';
    }

    // For team actions - show team name
    if (actionLower.includes('team')) {
      if (details.team_name) return `Team: ${details.team_name}`;
      if (details.name) return `Team: ${details.name}`;
    }

    // Check for common detail fields
    if (details.name) return details.name;
    if (details.title) return details.title;
    if (details.email) return details.email;
    if (details.team_name) return `Team: ${details.team_name}`;
    if (details.folder_name) return `Folder: ${details.folder_name}`;
    if (details.role_name) return `Role: ${details.role_name}`;
    if (details.jd_title) return details.jd_title;
    if (details.resume_name) return details.resume_name;
    if (details.assessment_name) return details.assessment_name;
    if (details.plan_name) return `Plan: ${details.plan_name}`;
    if (details.addon_name) return `Add-on: ${details.addon_name}`;
    if (details.reason) return details.reason;

    // Check entity type for context
    if (log.entity_type) {
      const entityLabel = log.entity_type.replace(/_/g, ' ');
      return entityLabel.charAt(0).toUpperCase() + entityLabel.slice(1);
    }

    // Return any key-value from details
    const detailKeys = Object.keys(details);
    if (detailKeys.length > 0) {
      const key = detailKeys[0];
      const value = details[key];
      if (typeof value === 'string' && value.length > 0) return value;
      if (typeof value === 'object' && value?.name) return value.name;
    }

    // Fallback - use user_email if available
    if (log.user_email) return log.user_email;

    // Last resort - extract from action_label
    if (log.action_label) {
      // For "User logged in" type actions, show the user's email from user_name if it looks like email
      if (log.user_name && log.user_name.includes('@')) {
        return log.user_name;
      }
      // Otherwise just indicate the action type
      return log.action_label.includes('logged') ? 'Session' : 'Activity';
    }

    return '-';
  };

  // Helper function to get action icon
  const getActionIcon = (action: string): IconComponent => {
    const actionLower = (action || '').toLowerCase();
    if (actionLower.includes('login')) return LogIn;
    if (actionLower.includes('logout')) return LogOut;
    if (actionLower.includes('create') || actionLower.includes('upload')) return Plus;
    if (actionLower.includes('update') || actionLower.includes('change')) return Edit2;
    if (actionLower.includes('delete') || actionLower.includes('remove')) return Trash2;
    if (actionLower.includes('invite')) return Send;
    if (actionLower.includes('settings')) return Settings;
    if (actionLower.includes('folder')) return FolderOpen;
    if (actionLower.includes('subscription') || actionLower.includes('payment')) return CreditCard;
    if (actionLower.includes('resume')) return FileText;
    if (actionLower.includes('jd') || actionLower.includes('job')) return Briefcase;
    if (actionLower.includes('user') || actionLower.includes('team')) return Users;
    if (actionLower.includes('assessment')) return FileText;
    return Activity;
  };

  // Helper function to get action color
  const getActionColor = (action: string): { bg: string; text: string } => {
    const actionLower = (action || '').toLowerCase();
    if (actionLower.includes('login')) return { bg: 'bg-gray-100', text: 'text-gray-800' };
    if (actionLower.includes('logout')) return { bg: 'bg-gray-100', text: 'text-gray-500' };
    if (actionLower.includes('create') || actionLower.includes('upload')) return { bg: 'bg-success-subtle', text: 'text-success' };
    if (actionLower.includes('update') || actionLower.includes('change')) return { bg: 'bg-gray-100', text: 'text-gray-800' };
    if (actionLower.includes('delete') || actionLower.includes('remove')) return { bg: 'bg-destructive-subtle', text: 'text-destructive' };
    return { bg: 'bg-gray-100', text: 'text-gray-800' };
  };

  // Helper function to format relative time
  const getRelativeTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return formatISTDate(dateStr);
  };

  // Fetch JDs and Assessment Stats from API
  useEffect(() => {
    const fetchData = async () => {
      setLoadingJDs(true);
      try {
        // Fetch all data in parallel (filtered by logged-in user's JDs)
        const [publishedResponse, draftResponse, statsResponse] = await Promise.allSettled([
          jdService.list({ status: 'published', page_size: 5, page: 1, source: 'my-jds' }),
          jdService.list({ status: 'draft', page_size: 5, page: 1, source: 'my-jds' }),
          hasPlanFeature('assessment') ? assessmentService.getStats() : Promise.resolve({ total_assessments: 0, active_assessments: 0, units_consumed: 0 }),
        ]);

        // Check for permission denied errors
        const permissionErrors = [publishedResponse, draftResponse, statsResponse].filter(
          result => result.status === 'rejected' &&
          (result.reason?.message?.includes('403') || result.reason?.message?.includes('Permission'))
        );

        if (permissionErrors.length > 0) {
          showErrorToast(null, "Couldn't load dashboard data", {
            id: 'dashboard-data',
            description: "You don't have permission to view this data. Ask your admin for access.",
          });
          return;
        }

        // Process published JDs
        if (publishedResponse.status === 'fulfilled') {
          setPublishedJDs(publishedResponse.value.items || []);
        }

        // Process draft JDs
        if (draftResponse.status === 'fulfilled') {
          setDraftJDs(draftResponse.value.items || []);
        }

        // Process assessment stats
        if (statsResponse.status === 'fulfilled') {
          setAssessmentStats({
            total_assessments: statsResponse.value.total_assessments || 0,
            active_assessments: statsResponse.value.active_assessments || 0,
            units_consumed: statsResponse.value.units_consumed || 0,
          });
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
        showErrorToast(error, "Couldn't load dashboard data", { id: 'dashboard-data', retry: fetchData });
      } finally {
        setLoadingJDs(false);
      }
    };

    fetchData();
  }, []);

  // Fetch recent activities on mount
  useEffect(() => {
    console.log('[Dashboard] useEffect triggered for fetchRecentActivities');
    fetchRecentActivities();
  }, [fetchRecentActivities]);

  return (
    <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-gray-50">
      <div className="max-w-7xl mx-auto">
        {/* Welcome Section */}
        <div className="mb-6">
          <h1 className="tf-page-title mb-2">Welcome back, {user?.name?.split(' ')[0] || 'there'}! 👋</h1>
          <p className="text-gray-600 text-lg">Here's what's happening with your recruitment today.</p>
        </div>

        {/* Units Warning Banner */}
        {tenant && onUpgradePlan && (
          <UnitsWarningBanner tenant={tenant} onUpgrade={onUpgradePlan} />
        )}

        {/* Main Stats Grid */}
        <div className="tf-grid-4 mb-6">
          <div className="tf-card-soft p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Users className="w-6 h-6 text-gray-800" />
              </div>
              <span className="flex items-center gap-1 text-sm text-success">
                <TrendingUp className="w-4 h-4" />
                +12%
              </span>
            </div>
            <div className="text-3xl text-gray-900 mb-1">1,247</div>
            <div className="tf-body-secondary">Total Candidates</div>
          </div>

          <div className="tf-card-soft p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-success-subtle flex items-center justify-center flex-shrink-0">
                <Briefcase className="w-6 h-6 text-success" />
              </div>
              <span className="flex items-center gap-1 text-sm text-success">
                <TrendingUp className="w-4 h-4" />
                +8%
              </span>
            </div>
            <div className="text-3xl text-gray-900 mb-1">42</div>
            <div className="tf-body-secondary">Active Jobs</div>
          </div>

          <div className="tf-card-soft p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                <Video className="w-6 h-6 text-gray-800" />
              </div>
              <span className="flex items-center gap-1 text-sm text-destructive">
                <TrendingDown className="w-4 h-4" />
                -3%
              </span>
            </div>
            <div className="text-3xl text-gray-900 mb-1">24</div>
            <div className="tf-body-secondary">Scheduled Interviews</div>
          </div>

          <div className="tf-card-soft p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-warning-subtle flex items-center justify-center flex-shrink-0">
                <FileText className="w-6 h-6 text-warning" />
              </div>
            </div>
            <div className="text-3xl text-gray-900 mb-1">{assessmentStats.active_assessments}</div>
            <div className="tf-body-secondary">Active Assessments</div>
          </div>
        </div>

        {/* Active Plan & Available Units Section */}
        <div className="tf-card-soft p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6 pb-6 border-b border-gray-200">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Crown className="w-6 h-6 text-gray-800" />
                <h2 className="text-gray-900 text-2xl">{subscription?.planName || '-'}</h2>
              </div>
              <p className="tf-body-secondary">
                {subscription?.status === 'active'
                  ? 'Your subscription is active and running smoothly'
                  : `Subscription ${subscription?.status || 'status unknown'}`}
              </p>
            </div>
            <div className="text-right bg-gray-50 rounded-lg p-4 border border-gray-200">
              <div className="tf-meta mb-1">Renews on</div>
              <div className="text-gray-900 mb-2">
                {subscription?.renewalDate
                  ? formatISTDate(subscription.renewalDate)
                  : 'Not available'}
              </div>
              {user?.can_upgrade_plan !== false && onUpgradePlan ? (
                <button
                  onClick={onUpgradePlan}
                  className="text-sm text-gray-800 hover:text-gray-900 underline transition-colors"
                >
                  Upgrade Plan
                </button>
              ) : (
                <p className="tf-meta italic">
                  Contact admin to upgrade plan
                </p>
              )}
            </div>
          </div>

          {/* Usage Cards */}
          <div className="tf-grid-stats-5 mb-6">
            {/* Resume Upload Units */}
            {<PlanLockedOverlay locked={isPlanLocked('resume_upload')}>{<div className="bg-gray-50 rounded-lg p-3 sm:p-4 border border-gray-200 hover:border-gray-300 transition-all">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Users className="w-4 h-4 sm:w-5 sm:h-5 text-gray-800" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl text-gray-900 mb-1">{limits?.resumeUploads?.toLocaleString() || '2,450'}</div>
              <div className="tf-meta mb-2 sm:mb-3">Resume Storage</div>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-gray-800 h-2 rounded-full"
                    style={{ width: `${limits?.resumeUploads ? Math.round((usage?.resumeUploads || 0) / limits.resumeUploads * 100) : 65}%` }}
                  ></div>
                </div>
                <span className="tf-meta w-8 sm:w-10 text-right">
                  {limits?.resumeUploads ? Math.round((usage?.resumeUploads || 0) / limits.resumeUploads * 100) : 65}%
                </span>
              </div>
              <div className="tf-meta">
                {usage?.resumeUploads?.toLocaleString() || '1,593'} used of {limits?.resumeUploads?.toLocaleString() || '2,450'}
              </div>
            </div>}</PlanLockedOverlay>}

            {/* Job Posting Units */}
            <div className="bg-gray-50 rounded-lg p-3 sm:p-4 border border-gray-200 hover:border-gray-300 transition-all">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-success-subtle flex items-center justify-center flex-shrink-0">
                  <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-success" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl text-gray-900 mb-1">{limits?.jobPostings || '100'}</div>
              <div className="tf-meta mb-2 sm:mb-3">Job Postings</div>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-success h-2 rounded-full"
                    style={{ width: `${limits?.jobPostings ? Math.round((usage?.jobPostings || 0) / limits.jobPostings * 100) : 42}%` }}
                  ></div>
                </div>
                <span className="tf-meta w-8 sm:w-10 text-right">
                  {limits?.jobPostings ? Math.round((usage?.jobPostings || 0) / limits.jobPostings * 100) : 42}%
                </span>
              </div>
              <div className="tf-meta">
                {usage?.jobPostings || '42'} used of {limits?.jobPostings || '100'}
              </div>
            </div>

            {/* Assessment Units */}
            {<PlanLockedOverlay locked={isPlanLocked('assessment')}>{<div className="bg-gray-50 rounded-lg p-3 sm:p-4 border border-gray-200 hover:border-gray-300 transition-all">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-warning-subtle flex items-center justify-center flex-shrink-0">
                  <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-warning" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl text-gray-900 mb-1">{limits?.assessments || '500'}</div>
              <div className="tf-meta mb-2 sm:mb-3">Assessment Units</div>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-warning h-2 rounded-full"
                    style={{ width: `${limits?.assessments ? Math.round(assessmentStats.units_consumed / (limits.assessments || 1) * 100) : 0}%` }}
                  ></div>
                </div>
                <span className="tf-meta w-8 sm:w-10 text-right">
                  {limits?.assessments ? Math.round(assessmentStats.units_consumed / (limits.assessments || 1) * 100) : 0}%
                </span>
              </div>
              <div className="tf-meta">
                {assessmentStats.units_consumed} used of {limits?.assessments || '500'}
              </div>
            </div>}</PlanLockedOverlay>}

            {/* AI Interview Units */}
            {<PlanLockedOverlay locked={isPlanLocked('ai_interview')}>{<div className="bg-gray-50 rounded-lg p-3 sm:p-4 border border-gray-200 hover:border-gray-300 transition-all">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Video className="w-4 h-4 sm:w-5 sm:h-5 text-gray-800" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl text-gray-900 mb-1">
                {limits?.aiInterviews === 'unlimited' ? 'Unlimited' : limits?.aiInterviews || 'Unlimited'}
              </div>
              <div className="tf-meta mb-2 sm:mb-3">AI Interviews</div>
              <div className="flex items-center gap-2 mb-1">
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-gray-800 h-2 rounded-full"
                    style={{
                      width: limits?.aiInterviews === 'unlimited'
                        ? '100%'
                        : `${typeof limits?.aiInterviews === 'number' ? Math.round((usage?.aiInterviews || 0) / limits.aiInterviews * 100) : 100}%`
                    }}
                  ></div>
                </div>
                <span className="tf-meta w-8 sm:w-10 text-right">
                  {limits?.aiInterviews === 'unlimited' ? '∞' :
                    typeof limits?.aiInterviews === 'number' ? `${Math.round((usage?.aiInterviews || 0) / limits.aiInterviews * 100)}%` : '∞'}
                </span>
              </div>
              <div className="tf-meta">
                {limits?.aiInterviews === 'unlimited'
                  ? `${usage?.aiInterviews || '87'} conducted this month`
                  : `${usage?.aiInterviews || '87'} used of ${limits?.aiInterviews || 'Unlimited'}`}
              </div>
            </div>}</PlanLockedOverlay>}
          </div>

          {/* Plan Features - Dynamic based on actual plan */}
          <div className="pt-4 border-t border-gray-200">
            <div className="tf-grid-3 text-sm">
              {(Object.keys(planFeatures) as PlanFeatureKey[])
                .filter(key => key !== 'seats') // seats is always included, skip display
                .map(key => {
                  const included = planFeatures[key];
                  const meta = PLAN_FEATURE_METADATA[key];
                  return (
                    <div key={key} className="flex items-center gap-2">
                      {included ? (
                        <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-muted-foreground dark:text-gray-300 flex-shrink-0" />
                      )}
                      <span className={included ? 'text-gray-700' : 'text-gray-500'}>{meta.name}</span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Published Job Descriptions Section */}
        <div className="tf-card-soft mb-6">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-gray-900 text-2xl mb-2">Published Job Descriptions</h2>
                <p className="tf-body-secondary">Active job postings accepting applications</p>
              </div>
              {canCreateJD && (
                <Button
                  variant="primary"
                  onClick={() => onNavigateToJDCreation?.()}
                  icon={<Briefcase className="w-4 h-4" />}
                >
                  Create New JD
                </Button>
              )}
            </div>
          </div>
          <div className="p-6">
            {loadingJDs ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="tf-panel p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Skeleton className="h-6 w-48" />
                          <Skeleton className="h-6 w-20 rounded-full" />
                        </div>
                        <div className="flex items-center gap-5 mb-3">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-4 w-32" />
                        </div>
                        <div className="flex items-center gap-4">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-4 w-20" />
                        </div>
                      </div>
                      <div className="ml-4">
                        <Skeleton className="h-9 w-24 rounded-lg" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : publishedJDs.length === 0 ? (
              <div className="text-center py-12">
                <Briefcase className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No published jobs yet</h3>
                <p className="tf-body-secondary mb-4">Create your first job description to start recruiting!</p>
                {canCreateJD && (
                  <Button
                    variant="primary"
                    onClick={() => onNavigateToJDCreation?.()}
                    icon={<Briefcase className="w-4 h-4" />}
                  >
                    Create New JD
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {publishedJDs.map((jd) => (
                  <div {...clickableProps}
                    key={jd.id}
                    className="tf-panel p-5 hover:border-gray-300 hover:shadow-md transition-all cursor-pointer"
                    onClick={() => onViewJobDetails?.(jd)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-medium text-gray-900">{jd.title || 'Untitled'}</h3>
                          <span className="tf-badge bg-success-subtle text-success">
                            Published
                          </span>
                        </div>
                        <div className="flex items-center gap-5 tf-body-secondary mb-3">
                          {jd.department && (
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-gray-500" />
                              {jd.department}
                            </div>
                          )}
                          {jd.location && (
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-gray-500" />
                              {jd.location}
                            </div>
                          )}
                          {jd.published_at && (
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-gray-500" />
                              Published {formatISTDate(jd.published_at)}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-4 tf-body-secondary">
                          <div className="flex items-center gap-1">
                            <Users className="w-4 h-4 text-gray-500" />
                            <span>{jd.applicants_count || 0} applicants</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <FileText className="w-4 h-4 text-gray-500" />
                            <span>{jd.scored_resumes_count || 0} scored</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        {onAIMatch && <PlanLockedOverlay locked={isPlanLocked('ai_talent_match')}>{(
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAIMatch(jd);
                            }}
                            icon={<Sparkles className="w-4 h-4" />}
                          >
                            AI Match
                          </Button>
                        )}</PlanLockedOverlay>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {publishedJDs.length > 0 && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
              <div className="flex items-center justify-between">
                <div className="tf-body-secondary">Showing {publishedJDs.length} published job{publishedJDs.length !== 1 ? 's' : ''}</div>
                <button
                  onClick={onNavigateToJobs}
                  className="text-sm text-gray-800 hover:text-gray-900 flex items-center gap-2 transition-colors font-medium"
                >
                  View All Published
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Draft Job Descriptions Section */}
        <div className="tf-card-soft mb-6">
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-gray-900 text-2xl mb-2">Draft Job Descriptions</h2>
                <p className="tf-body-secondary">Incomplete job postings waiting to be published</p>
              </div>
            </div>
          </div>
          <div className="p-6">
            {loadingJDs ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="tf-panel p-5">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <Skeleton className="h-6 w-48" />
                          <Skeleton className="h-6 w-16 rounded-full" />
                          <Skeleton className="h-4 w-24" />
                        </div>
                        <div className="flex items-center gap-5 mb-3">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-4 w-28" />
                          <Skeleton className="h-4 w-32" />
                        </div>
                      </div>
                      <div className="ml-4">
                        <Skeleton className="h-9 w-36 rounded-lg" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : draftJDs.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No drafts saved</h3>
                <p className="tf-body-secondary">All your job descriptions are published or you haven't started any drafts yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {draftJDs.map((jd) => (
                  <div
                    key={jd.id}
                    className="tf-panel p-5 hover:border-gray-300 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-medium text-gray-900">{jd.title || 'Untitled Draft'}</h3>
                          <span className="tf-badge bg-warning-subtle text-warning">
                            Draft
                          </span>
                          {jd.creation_stage && (
                            <span className="tf-meta">
                              Stage: {jd.creation_stage}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-5 tf-body-secondary mb-3">
                          {jd.department && (
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-gray-500" />
                              {jd.department}
                            </div>
                          )}
                          {jd.location && (
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-gray-500" />
                              {jd.location}
                            </div>
                          )}
                          {jd.created_at && (
                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-gray-500" />
                              Created {formatISTDate(jd.created_at)}
                            </div>
                          )}
                        </div>
                      </div>
                      {canUpdateJD && (
                        <div className="flex items-center gap-2 ml-4">
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => onViewJobDetails?.(jd)}
                            icon={<Edit2 className="w-4 h-4" />}
                          >
                            Continue Editing
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {draftJDs.length > 0 && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
              <div className="flex items-center justify-between">
                <div className="tf-body-secondary">Showing {draftJDs.length} draft{draftJDs.length !== 1 ? 's' : ''}</div>
                <button
                  onClick={onNavigateToJobs}
                  className="text-sm text-gray-800 hover:text-gray-900 flex items-center gap-2 transition-colors font-medium"
                >
                  View All Drafts
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Two Column Layout - Recent Activity & Quick Actions */}
        <div className={`grid gap-6 mb-6 ${user?.is_tenant_admin ? 'grid-cols-1 lg:grid-cols-3' : 'grid-cols-1'}`}>
          {/* Recent Activity - Tenant Admin Only */}
          {user?.is_tenant_admin && (
            <div className="tf-card-soft lg:col-span-2">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h2 className="text-gray-900">Recent Activity</h2>
                  <a href="/audits/activity" className="text-sm text-gray-800 hover:text-gray-900 flex items-center gap-1">
                    View all
                    <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
              </div>
            <div className="p-0">
              {loadingActivities ? (
                <div className="tf-table-shell">
                  <table className="w-full">
                    <thead className="bg-white border-b border-gray-200">
                      <tr>
                        <th className="tf-th-cell text-left"><Skeleton className="h-3 w-20" /></th>
                        <th className="tf-th-cell text-left"><Skeleton className="h-3 w-20" /></th>
                        <th className="tf-th-cell text-left"><Skeleton className="h-3 w-20" /></th>
                        <th className="tf-th-cell text-left"><Skeleton className="h-3 w-20" /></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i}>
                          <td className="tf-td whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <Skeleton className="w-8 h-8 rounded-lg flex-shrink-0" />
                              <Skeleton className="h-4 w-28" />
                            </div>
                          </td>
                          <td className="tf-td"><Skeleton className="h-4 w-40" /></td>
                          <td className="tf-td whitespace-nowrap"><Skeleton className="h-4 w-24" /></td>
                          <td className="tf-td whitespace-nowrap"><Skeleton className="h-4 w-16" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : recentActivities.length === 0 ? (
                <div className="text-center py-8">
                  <Activity className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="tf-body-muted">No recent activity</p>
                </div>
              ) : (
                <div className="tf-table-shell">
                  <table className="w-full">
                    <thead className="bg-white border-b border-gray-200">
                      <tr>
                        <th className="tf-th-cell text-left tf-th">Action</th>
                        <th className="tf-th-cell text-left tf-th">Details</th>
                        <th className="tf-th-cell text-left tf-th">User</th>
                        <th className="tf-th-cell text-left tf-th">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {recentActivities.map((log) => {
                        const Icon = getActionIcon(log.action);
                        const colors = getActionColor(log.action);
                        const details = getActivityDetails(log);
  
                        return (
                          <tr key={log.id} className="hover:bg-gray-50">
                            <td className="tf-td whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <div className={`w-8 h-8 rounded-lg ${colors.bg} flex items-center justify-center flex-shrink-0`}>
                                  <Icon className={`w-4 h-4 ${colors.text}`} />
                                </div>
                                <span className="tf-body">{log.action_label}</span>
                              </div>
                            </td>
                            <td className="tf-td">
                              <span className="tf-body-secondary">{details}</span>
                            </td>
                            <td className="tf-td whitespace-nowrap">
                              <span className="tf-body">{log.user_name}</span>
                            </td>
                            <td className="tf-td whitespace-nowrap">
                              <span className="tf-body-muted">{getRelativeTime(log.created_at)}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
          )}

          {/* Quick Actions */}
          <div className="space-y-6">
            <div className="tf-card-soft p-6">
              <h3 className="text-gray-900 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                {<PlanLockedOverlay locked={isPlanLocked('resume_upload')}>{(
                <button
                  onClick={() => onNavigateToMyResumes?.()}
                  className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                    <Users className="w-4 h-4 text-gray-800" />
                  </div>
                  <span className="tf-body">Upload Resume</span>
                </button>
                )}</PlanLockedOverlay>}
                <button
                  onClick={() => onNavigateToJDCreation?.()}
                  className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-success-subtle flex items-center justify-center">
                    <Briefcase className="w-4 h-4 text-success" />
                  </div>
                  <span className="tf-body">Post New Job</span>
                </button>
                {<PlanLockedOverlay locked={isPlanLocked('ai_interview')}>{(
                <button
                  onClick={() => onNavigateToAIInterview?.()}
                  className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                    <Video className="w-4 h-4 text-gray-800" />
                  </div>
                  <span className="tf-body">Schedule Interview</span>
                </button>
                )}</PlanLockedOverlay>}
                {<PlanLockedOverlay locked={isPlanLocked('assessment')}>{(
                <button
                  onClick={() => onNavigateToAssessments?.()}
                  className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-warning-subtle flex items-center justify-center">
                    <FileText className="w-4 h-4 text-warning" />
                  </div>
                  <span className="tf-body">Create AI Assessment</span>
                </button>
                )}</PlanLockedOverlay>}
                <button 
                  onClick={() => onNavigateToUsage?.()}
                  className="w-full flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-700 to-gray-700 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-white" />
                  </div>
                  <span className="tf-body">View Units Usage</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Job Performance */}
        <div className="tf-grid-split mb-8">
          <div className="tf-card-soft p-6">
            <h2 className="text-gray-900 mb-6">Top Performing Jobs</h2>
            <div className="space-y-4">
              {[
                { title: 'Senior Java Developer', applicants: 45, status: 'Hot', color: 'red' },
                { title: 'Product Manager', applicants: 32, status: 'Active', color: 'green' },
                { title: 'UI/UX Designer', applicants: 28, status: 'Active', color: 'green' },
                { title: 'DevOps Engineer', applicants: 24, status: 'New', color: 'blue' },
              ].map((job, index) => (
                <div key={index} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                  <div>
                    <div className="tf-body mb-1">{job.title}</div>
                    <div className="tf-meta">{job.applicants} applicants</div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs ${
                    job.color === 'red' ? 'bg-destructive-subtle text-destructive' :
                    job.color === 'green' ? 'bg-success-subtle text-success' :
                    'bg-gray-100 text-gray-900'
                  }`}>
                    {job.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="tf-card-soft p-6">
            <h2 className="text-gray-900 mb-6">Recruitment Pipeline</h2>
            <div className="space-y-4">
              {[
                { stage: 'Applied', count: 156, color: 'blue', icon: Users },
                { stage: 'Screening', count: 84, color: 'gray', icon: FileText },
                { stage: 'Interview', count: 42, color: 'yellow', icon: Video },
                { stage: 'Offer', count: 12, color: 'green', icon: CheckCircle },
              ].map((stage, index) => {
                const Icon = stage.icon;
                return (
                  <div key={index} className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-lg bg-${stage.color}-100 flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 text-${stage.color}-600`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="tf-body">{stage.stage}</span>
                        <span className="tf-body">{stage.count}</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`bg-${stage.color}-600 h-2 rounded-full`}
                          style={{ width: `${(stage.count / 156) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="bg-warning-subtle border border-warning-line rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm text-warning-strong mb-1">Action Required</div>
            <div className="text-sm text-warning-strong">
              You have 8 pending candidate reviews and 3 interview feedback forms to complete.
            </div>
          </div>
          <button className="ml-auto text-sm text-warning hover:text-warning whitespace-nowrap">
            View all
          </button>
        </div>
      </div>
    </div>
  );
}
