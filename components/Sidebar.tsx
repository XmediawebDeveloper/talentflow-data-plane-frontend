import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Settings,
  BarChart3,
  HelpCircle,
  FileText,
  Target,
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
  Briefcase,
  Eye,
  DollarSign,
  MessageCircle
} from 'lucide-react';
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
  icon: React.ElementType;
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
    standard_user: 'User',
  };

  // RBAC01-07: Extended role badge colors
  const roleBadgeColors: Record<UserRole, string> = {
    tenant_admin: 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white border-purple-600',
    recruiter: 'bg-blue-100 text-blue-800 border-blue-200',
    viewer: 'bg-gray-100 text-gray-600 border-gray-200',
    billing_manager: 'bg-green-100 text-green-800 border-green-200',
    standard_user: 'bg-gray-100 text-gray-700 border-gray-200',
  };

  // RBAC role checks
  const isTenantAdmin = user?.role === 'tenant_admin';
  const isRecruiter = user?.role === 'recruiter';
  const isViewer = user?.role === 'viewer';
  const isBillingManager = user?.role === 'billing_manager';
  const isStandardUser = user?.role === 'standard_user';

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
      return user.permissions.canUploadResumes === true || user.permissions.canManageResumes === true;
    }
    if (permission === 'canViewInternalDB' || permission === 'canAccessInternalDB') {
      return user.permissions.canAccessInternalDB === true || user.permissions.canViewInternalDB === true;
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
        { id: 'job-openings', label: 'Job Openings', icon: Briefcase, permission: 'canViewJD', feature: 'jd_manage' },
        // Resume Scoring - requires resume view permission
        { id: 'resume-scoring', label: 'Resume Scoring', icon: Target, permission: 'canViewResumes', feature: 'resume_scoring' },
        // AI Talent Match - requires resume view permission
        { id: 'ai-talent-match', label: 'AI Talent Match', icon: Sparkles, permission: 'canViewResumes', feature: 'ai_talent_match' },
        // Assessments - requires create assessment permission (or view for viewing results)
        { id: 'assessments', label: 'Assessments', icon: ClipboardList, permission: 'canViewAssessments', feature: 'assessment' },
        // AI Interviews - requires resume view permission
        { id: 'ai-interviews', label: 'AI Interviews', icon: Video, permission: 'canViewResumes', feature: 'ai_interview' },
        // My Resumes - requires resume upload/create permission
        { id: 'my-resumes', label: 'My Resumes', icon: Users, permission: 'canCreateResumes', feature: 'resume_upload' },
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

    // User Management - Admin only
    {
      id: 'user-management-section',
      label: 'User Management',
      icon: UserCog,
      adminOnly: true,
      children: [
        { id: 'user-management', label: 'Users', icon: Users, adminOnly: true },
        { id: 'role-management', label: 'Roles & Permissions', icon: Shield, adminOnly: true },
        { id: 'team-management', label: 'Teams', icon: Users, adminOnly: true },
        { id: 'team-chat', label: 'Team Chat', icon: MessageCircle, adminOnly: true },
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
        { id: 'dispute-history', label: 'Dispute History', icon: AlertTriangle, billingAccess: true },
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
    console.log('[SIDEBAR] User:', user?.email, 'Role:', user?.role);
    console.log('[SIDEBAR] Permissions:', user?.permissions);
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
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm h-screen">
      {/* Logo - matches header height h-[72px] */}
      <div className="h-[72px] px-6 border-b border-gray-200 flex items-center">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl flex items-center justify-center shadow-md">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">TalentFlow</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        {visibleNavItems.map((item) => (
          <div key={item.id} className="mb-1">
            {item.children ? (
              <>
                <button
                  onClick={() => toggleSection(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isParentActive(item)
                      ? 'text-gray-800 bg-gray-50'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <item.icon className="w-5 h-5 flex-shrink-0" />
                  <span className="flex-1 text-sm font-medium">{item.label}</span>
                  {expandedSections.includes(item.id) ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                </button>

                {expandedSections.includes(item.id) && (
                  <div className="mt-1 ml-4 border-l border-gray-200">
                    {item.children.map((child) => (
                      <button
                        key={child.id}
                        onClick={() => onSectionChange(child.id)}
                        className={`w-full flex items-center gap-3 px-4 py-2 pl-6 text-sm transition-colors ${
                          isActive(child.id)
                            ? 'text-gray-800 bg-gray-50 font-medium border-l-2 border-gray-800 -ml-px'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <child.icon className="w-4 h-4 flex-shrink-0" />
                        <span>{child.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <button
                onClick={() => onSectionChange(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors ${
                  isActive(item.id)
                    ? 'text-gray-800 bg-gray-50 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200">
        <p className="text-xs text-gray-500 text-center">
          {tenant?.name || 'TalentFlow'} v1.0
        </p>
      </div>
    </aside>
  );
}
