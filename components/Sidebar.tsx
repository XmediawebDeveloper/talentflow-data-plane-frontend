import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Settings,
  BarChart3,
  HelpCircle,
  BrainCircuit,
  FileSearch,
  FileSignature,
  FileText,
  FolderOpen,
  Sparkles,
  ClipboardList,
  Video,
  Users,
  Database,
  UserCog,
  Shield,
  Key,
  Palette,
  Link,
  Lock,
  Receipt,
  Wallet,
  RefreshCw,
  AlertTriangle,
  Activity,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Eye,
  DollarSign,
  MessageCircle
} from 'lucide-react';
import type { IconComponent } from '@/lib/types/icon';
import { useState, useMemo } from 'react';
import { User, Tenant, UserRole, FeatureFlags } from '@/lib/types/tenant';

interface SidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  user?: User;
  tenant?: Tenant;
}

interface NavItem {
  id: string;
  label: string;
  icon: IconComponent;
  permission?: string;
  feature?: keyof FeatureFlags;
  adminOnly?: boolean;
  billingAccess?: boolean;  // RBAC03: For billing manager access
  viewerAccess?: boolean;   // RBAC05: For viewer read-only access
  children?: NavItem[];
}

export default function Sidebar({ activeSection, onSectionChange, user, tenant }: SidebarProps) {
  const [expandedSections, setExpandedSections] = useState<string[]>(['recruitment-tools', 'organization', 'user-management-section', 'subscription', 'settings', 'reports']);

  // RBAC01-07: Extended role labels
  const roleLabels: Record<UserRole, string> = {
    tenant_admin: 'Owner',
    recruiter: 'Recruiter',
    viewer: 'Viewer',
    billing_manager: 'Billing',
  };

  // RBAC01-07: Extended role badge colors
  const roleBadgeColors: Record<UserRole, string> = {
    tenant_admin: 'bg-brand-blue text-white',
    recruiter: 'bg-brand-blue/10 text-brand-blue',
    viewer: 'bg-gray-100 text-gray-600',
    billing_manager: 'bg-brand-teal/10 text-brand-teal',
  };

  // RBAC role checks
  const isTenantAdmin = user?.role === 'tenant_admin';
  const isRecruiter = user?.role === 'recruiter';
  const isViewer = user?.role === 'viewer';
  const isBillingManager = user?.role === 'billing_manager';

  // Check if user has a specific permission (supports both legacy and granular)
  const hasPermission = (permission?: string): boolean => {
    if (!permission) return true;
    if (isTenantAdmin) return true;
    if (!user?.permissions) return false;

    // Check the specific permission
    const hasSpecificPerm = user.permissions[permission as keyof typeof user.permissions] === true;

    // Fallback checks for common permission patterns
    if (hasSpecificPerm) return true;

    // For read permissions, also check if user has the legacy "manage" permission
    if (permission === 'canViewJD' || permission === 'canReadJD') {
      return user.permissions.canManageJD === true;
    }
    if (permission === 'canViewResumes') {
      return user.permissions.canUploadResumes === true || user.permissions.canManageResumes === true || user.permissions.canViewResumes === true;
    }
    if (permission === 'canViewInternalDB' || permission === 'canAccessInternalDB') {
      return user.permissions.canAccessInternalDB === true || user.permissions.canViewInternalDB === true;
    }
    // New granular permissions - Show menu if user has EITHER view OR run permission
    // Hide menu only if BOTH view and run permissions are false
    if (permission === 'canViewScoring') {
      return user.permissions.canViewScoring === true || user.permissions.canRunScoring === true;
    }
    if (permission === 'canViewAiMatch') {
      return user.permissions.canViewAiMatch === true || user.permissions.canRunAiMatch === true;
    }

    return false;
  };

  // RBAC06: Check if user has a specific feature enabled
  const hasFeature = (feature?: keyof FeatureFlags): boolean => {
    if (!feature) return true;
    if (isTenantAdmin) return true;  // Admin has all features
    if (isViewer) return false;       // Viewer has no features
    // Check feature flags
    if (user?.featureFlags) {
      return user.featureFlags[feature] ?? false;
    }
    // Check enabled features list
    if (user?.enabledFeatures) {
      return user.enabledFeatures.includes(feature);
    }
    return false;
  };

  // Define all menu items with RBAC01-07 support
  const allNavItems: NavItem[] = [
    // Dashboard - Everyone sees
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      viewerAccess: true  // RBAC05: Viewers can see dashboard
    },

    // Recruitment Tools - Admin sees ALL, Users see based on permissions/features
    {
      id: 'recruitment-tools',
      label: 'Recruitment Tools',
      icon: FileText,
      children: [
        // JD Creation - requires create permission
        { id: 'jd-creation', label: 'JD Creation', icon: FileText, permission: 'canCreateJD', feature: 'jd_create' },
        // Job Openings - requires view permission (will show if user can view JDs)
        { id: 'job-openings', label: 'Job Openings', icon: FileSignature, permission: 'canViewJD', feature: 'jd_manage' },
        // Resume Scoring - requires scoring view permission
        { id: 'resume-scoring', label: 'Resume Scoring', icon: FileSearch, permission: 'canViewScoring', feature: 'resume_scoring' },
        // AI Talent Match - requires AI match view permission
        { id: 'ai-talent-match', label: 'AI Talent Match', icon: BrainCircuit, permission: 'canViewAiMatch', feature: 'ai_talent_match' },
        // Assessments - requires create assessment permission (or view for viewing results)
        { id: 'assessments', label: 'Assessments', icon: ClipboardList, permission: 'canViewAssessments', feature: 'assessment' },
        // AI Interviews - requires AI interview view permission
        { id: 'ai-interviews', label: 'AI Interviews', icon: Video, permission: 'canViewAIInterviews', feature: 'ai_interview' },
        // HR Question Bank - separate evaluation page
        { id: 'hr-question-bank', label: 'HR Question Bank', icon: ClipboardList, permission: 'canViewHRQuestionBank', feature: 'assessment' },
        // My Resumes - requires resume view permission (upload button hidden separately inside the page)
        { id: 'my-resumes', label: 'My Resumes', icon: FolderOpen, permission: 'canViewResumes', feature: 'resume_upload' },
        // Internal Resume Database - requires internal DB access
        { id: 'resume-database', label: 'Internal Resume Database', icon: Database, permission: 'canViewInternalDB', feature: 'resume_database_access' },
      ]
    },

    // Organization - Admin only
    {
      id: 'organization',
      label: 'Organization',
      icon: Building2,
      adminOnly: true,
      children: [
        { id: 'company-profile', label: 'Company Profile', icon: Building2, adminOnly: true },
      ]
    },

    // User Management
    {
      id: 'user-management-section',
      label: 'User Management',
      icon: UserCog,
      children: [
        { id: 'user-management', label: 'User Management', icon: Users, adminOnly: true },
        { id: 'role-management', label: 'Roles & Permissions', icon: Shield, adminOnly: true },
        { id: 'team-management', label: 'Teams', icon: Users, permission: 'canViewTeams' },
        { id: 'team-chat', label: 'Chat', icon: MessageCircle },  // ✅ Available to ALL users
      ]
    },

    // Subscription & Billing - Admin and Billing Manager (RBAC03)
    {
      id: 'subscription',
      label: 'Subscription & Billing',
      icon: CreditCard,
      billingAccess: true,  // RBAC03: Accessible by billing_manager
      children: [
        { id: 'current-plan', label: 'Current Plan', icon: CreditCard, billingAccess: true },
        { id: 'usage-quotas', label: 'Usage & Quotas', icon: BarChart3, billingAccess: true },
        { id: 'payment-methods', label: 'Payment Methods', icon: Wallet, adminOnly: true },  // Admin only - can modify
        { id: 'billing-history', label: 'Billing History', icon: Receipt, billingAccess: true },
        { id: 'refund-history', label: 'Refund History', icon: RefreshCw, billingAccess: true },
        { id: 'dispute-history', label: 'Payment Disputes', icon: AlertTriangle, billingAccess: true },
      ]
    },

    // Settings - Admin only
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      adminOnly: true,
      children: [
        { id: 'general-settings', label: 'General Settings', icon: Settings, adminOnly: true },
        { id: 'permissions', label: 'Permissions & Roles', icon: Shield, adminOnly: true },
        { id: 'api-management', label: 'API Management', icon: Key, adminOnly: true, feature: 'api_access' },
        { id: 'branding', label: 'Branding & White Label', icon: Palette, adminOnly: true },
        // { id: 'integrations', label: 'Integrations', icon: Link, adminOnly: true }, // Hidden for demo
        { id: 'security', label: 'Security Settings', icon: Lock, adminOnly: true },
      ]
    },

    // Reports & Analytics - Hidden for demo, will be enabled in future
    // {
    //   id: 'reports',
    //   label: 'Reports & Analytics',
    //   icon: BarChart3,
    //   viewerAccess: true,  // RBAC05: Viewers can see reports
    //   children: [
    //     { id: 'team-usage', label: 'Team Usage Analytics', icon: Activity, adminOnly: true },
    //     { id: 'performance-reports', label: 'Performance Reports', icon: TrendingUp, permission: 'canViewAnalytics', viewerAccess: true, feature: 'reporting' },
    //     { id: 'activity-logs', label: 'Activity Logs', icon: BarChart3, adminOnly: true },
    //   ]
    // },

    // Support Tickets - Everyone
    {
      id: 'support-tickets',
      label: 'Support Tickets',
      icon: HelpCircle,
      viewerAccess: true
    },
  ];

  // Default menus that should ALWAYS be visible for all users (except role restrictions)
  const defaultMenuIds = ['dashboard', 'support-tickets', 'job-openings', 'my-resumes'];

  // Filter nav items based on RBAC01-07 roles, permissions, and features
  const filterNavItems = (items: NavItem[]): NavItem[] => {
    return items.filter(item => {
      // Owner has access to everything
      if (isTenantAdmin) return true;

      // RBAC03: Billing Manager access check
      if (item.billingAccess && isBillingManager) return true;

      // RBAC05: Viewer access check - only items marked as viewerAccess
      if (isViewer) {
        return item.viewerAccess === true;
      }

      // Admin only check - non-admins can't see these
      if (item.adminOnly) return false;

      // RBAC03: Billing access items are only for admin/billing_manager
      if (item.billingAccess && !isBillingManager) return false;

      // ✅ DEFAULT MENUS: These 4 menus are always visible (bypass permission/feature checks)
      // - View Dashboard, View JD (Job Openings), View My Resumes, View Support
      if (defaultMenuIds.includes(item.id)) return true;

      // RBAC06: Feature flag check - if feature is specified, user must have it
      if (item.feature && !hasFeature(item.feature)) return false;

      // Permission check - if permission is specified, user must have it
      if (item.permission && !hasPermission(item.permission)) return false;

      return true;
    }).map(item => {
      if (item.children) {
        const filteredChildren = filterNavItems(item.children);
        if (filteredChildren.length === 0) return null;
        return { ...item, children: filteredChildren };
      }
      return item;
    }).filter(Boolean) as NavItem[];
  };

  const visibleNavItems = useMemo(() => {
    const filtered = filterNavItems(allNavItems);
    console.log('[SIDEBAR] Role:', user?.role);
    console.log('[SIDEBAR] Permissions:', user?.permissions);
    console.log('[SIDEBAR] 🔍 canViewScoring:', user?.permissions?.canViewScoring);
    console.log('[SIDEBAR] 🔍 canViewAiMatch:', user?.permissions?.canViewAiMatch);
    console.log('[SIDEBAR] Visible menu items:', filtered.map(item => ({
      id: item.id,
      label: item.label,
      childrenCount: item.children?.length || 0
    })));
    return filtered;
  }, [user, allNavItems]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const isActive = (itemId: string): boolean => {
    return activeSection === itemId;
  };

  const isParentActive = (item: NavItem): boolean => {
    if (isActive(item.id)) return true;
    if (item.children) {
      return item.children.some(child => isActive(child.id));
    }
    return false;
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col h-[100dvh]">
      {/* Logo - matches header height h-[72px] */}
      <div className="h-[72px] px-6 border-b border-gray-200 flex items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-brand-blue rounded-lg flex items-center justify-center">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">TalentFlow</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {visibleNavItems.map((item) => (
          <div key={item.id} className="mb-1 px-2">
            {item.children ? (
              <>
                <button
                  onClick={() => toggleSection(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    isParentActive(item)
                      ? 'text-brand-blue bg-brand-blue/10'
                      : 'text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue'
                  }`}
                >
                  <item.icon className={`w-5 h-5 flex-shrink-0 ${isParentActive(item) ? 'text-brand-blue' : ''}`} />
                  <span className="flex-1 text-sm font-medium">{item.label}</span>
                  {expandedSections.includes(item.id) ? (
                    <ChevronDown className={`w-4 h-4 ${isParentActive(item) ? 'text-brand-blue' : 'text-gray-400'}`} />
                  ) : (
                    <ChevronRight className={`w-4 h-4 ${isParentActive(item) ? 'text-brand-blue' : 'text-gray-400'}`} />
                  )}
                </button>

                {expandedSections.includes(item.id) && (
                  <div className="mt-1 ml-4 border-l border-gray-200">
                    {item.children.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => onSectionChange(child.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 pl-5 ml-1 rounded-md text-sm transition-colors ${
                          isActive(child.id)
                            ? 'text-brand-blue bg-brand-blue/10 font-medium'
                            : 'text-gray-600 hover:bg-brand-blue/5 hover:text-brand-blue'
                        }`}
                      >
                        <child.icon className={`w-4 h-4 flex-shrink-0 ${isActive(child.id) ? 'text-brand-blue' : ''}`} />
                        <span>{child.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <button
                onClick={() => onSectionChange(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  isActive(item.id)
                    ? 'text-brand-blue bg-brand-blue/10 font-medium'
                    : 'text-gray-700 hover:bg-brand-blue/5 hover:text-brand-blue'
                }`}
              >
                <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive(item.id) ? 'text-brand-blue' : ''}`} />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <p className="tf-hint text-center">
          {tenant?.name || 'TalentFlow'} v1.0
        </p>
      </div>
    </aside>
  );
}
