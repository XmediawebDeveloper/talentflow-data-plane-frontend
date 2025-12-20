'use client';

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
  Link as LinkIcon,
  Lock,
  Receipt,
  Wallet,
  RefreshCw,
  AlertTriangle,
  Activity,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Briefcase
} from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User, Tenant } from '@/lib/types/tenant';

interface SidebarProps {
  user?: User;
  tenant?: Tenant;
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  href?: string;
  permission?: string;
  adminOnly?: boolean;
  children?: NavItem[];
}

export default function Sidebar({ user, tenant }: SidebarProps) {
  const pathname = usePathname();
  const [expandedSections, setExpandedSections] = useState<string[]>(['recruitment-tools', 'organization', 'subscription', 'settings', 'reports']);

  const roleLabels = {
    tenant_admin: 'Admin',
    recruiter: 'Recruiter',
    viewer: 'Viewer',
  };

  const roleBadgeColors = {
    tenant_admin: 'bg-purple-100 text-purple-700 border-purple-200',
    recruiter: 'bg-blue-100 text-blue-700 border-blue-200',
    viewer: 'bg-gray-100 text-gray-700 border-gray-200',
  };

  const isTenantAdmin = user?.role === 'tenant_admin';

  // Check if user has a specific permission
  const hasPermission = (permission?: string): boolean => {
    if (!permission) return true;
    if (isTenantAdmin) return true;
    if (!user?.permissions) return false;
    return user.permissions[permission as keyof typeof user.permissions] === true;
  };

  // Define all menu items
  const allNavItems: NavItem[] = [
    // Dashboard - Everyone sees
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      href: '/dashboard'
    },

    // Recruitment Tools - Admin sees ALL, Users see based on permissions
    {
      id: 'recruitment-tools',
      label: 'Recruitment Tools',
      icon: FileText,
      children: [
        { id: 'job-openings', label: 'Job Openings', icon: Briefcase, href: '/recruitment/job-openings', permission: 'canCreateJD' },
        { id: 'jd-creation', label: 'JD Creation', icon: FileText, href: '/recruitment/jd-creation', permission: 'canCreateJD' },
        { id: 'resume-scoring', label: 'Resume Scoring', icon: Target, href: '/recruitment/resume-scoring', permission: 'canViewResumes' },
        { id: 'ai-talent-match', label: 'AI Talent Match', icon: Sparkles, href: '/recruitment/ai-talent-match', permission: 'canViewResumes' },
        { id: 'assessments', label: 'Assessments', icon: ClipboardList, href: '/recruitment/assessments', permission: 'canCreateAssessments' },
        { id: 'ai-interviews', label: 'AI Interviews', icon: Video, href: '/recruitment/ai-interviews', permission: 'canViewResumes' },
        { id: 'my-resumes', label: 'My Resumes', icon: Users, href: '/recruitment/my-resumes', permission: 'canUploadResumes' },
        { id: 'resume-database', label: 'Internal Resume Database', icon: Database, href: '/recruitment/resume-database', permission: 'canAccessInternalDB' },
      ]
    },

    // Organization - Admin only
    {
      id: 'organization',
      label: 'Organization',
      icon: Building2,
      adminOnly: true,
      children: [
        { id: 'company-profile', label: 'Company Profile', icon: Building2, href: '/organization/company-profile', adminOnly: true },
        { id: 'team-management', label: 'Team Management', icon: Users, href: '/organization/team-management', adminOnly: true },
        { id: 'user-management', label: 'User Management', icon: UserCog, href: '/organization/user-management', adminOnly: true },
        { id: 'role-management', label: 'Role Management', icon: Shield, href: '/organization/role-management', adminOnly: true },
      ]
    },

    // Subscription & Billing - Admin only
    {
      id: 'subscription',
      label: 'Subscription & Billing',
      icon: CreditCard,
      adminOnly: true,
      children: [
        { id: 'current-plan', label: 'Current Plan', icon: CreditCard, href: '/subscription/current-plan', adminOnly: true },
        { id: 'usage-quotas', label: 'Usage & Quotas', icon: BarChart3, href: '/subscription/usage-quotas', adminOnly: true },
        { id: 'payment-methods', label: 'Payment Methods', icon: Wallet, href: '/subscription/payment-methods', adminOnly: true },
        { id: 'billing-history', label: 'Billing History', icon: Receipt, href: '/subscription/billing-history', adminOnly: true },
        { id: 'refund-history', label: 'Refund History', icon: RefreshCw, href: '/subscription/refund-history', adminOnly: true },
        { id: 'dispute-history', label: 'Dispute History', icon: AlertTriangle, href: '/subscription/dispute-history', adminOnly: true },
      ]
    },

    // Settings - Admin only
    {
      id: 'settings',
      label: 'Settings',
      icon: Settings,
      adminOnly: true,
      children: [
        { id: 'general-settings', label: 'General Settings', icon: Settings, href: '/settings/general-settings', adminOnly: true },
        { id: 'permissions', label: 'Permissions & Roles', icon: Shield, href: '/settings/permissions', adminOnly: true },
        { id: 'api-management', label: 'API Management', icon: Key, href: '/settings/api-management', adminOnly: true },
        { id: 'branding', label: 'Branding & White Label', icon: Palette, href: '/settings/branding', adminOnly: true },
        { id: 'integrations', label: 'Integrations', icon: LinkIcon, href: '/settings/integrations', adminOnly: true },
        { id: 'security', label: 'Security Settings', icon: Lock, href: '/settings/security', adminOnly: true },
      ]
    },

    // Reports & Analytics
    {
      id: 'reports',
      label: 'Reports & Analytics',
      icon: BarChart3,
      children: [
        { id: 'team-usage', label: 'Team Usage Analytics', icon: Activity, href: '/reports/team-usage', adminOnly: true },
        { id: 'performance-reports', label: 'Performance Reports', icon: TrendingUp, href: '/reports/performance-reports', permission: 'canViewAnalytics' },
        { id: 'activity-logs', label: 'Activity Logs', icon: BarChart3, href: '/reports/activity-logs', adminOnly: true },
      ]
    },

    // Support Tickets - Everyone
    {
      id: 'support-tickets',
      label: 'Support Tickets',
      icon: HelpCircle,
      href: '/support-tickets'
    },
  ];

  // Filter nav items based on permissions
  const filterNavItems = (items: NavItem[]): NavItem[] => {
    return items.filter(item => {
      // Admin only check
      if (item.adminOnly && !isTenantAdmin) return false;

      // Permission check
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

  const visibleNavItems = filterNavItems(allNavItems);

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev =>
      prev.includes(sectionId)
        ? prev.filter(id => id !== sectionId)
        : [...prev, sectionId]
    );
  };

  const isActive = (href?: string): boolean => {
    if (!href) return false;
    return pathname === href || pathname.startsWith(href + '/');
  };

  const isParentActive = (item: NavItem): boolean => {
    if (item.href && isActive(item.href)) return true;
    if (item.children) {
      return item.children.some(child => isActive(child.href));
    }
    return false;
  };

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm h-screen">
      {/* Logo */}
      <div className="p-6 border-b border-gray-200">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-md">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold text-gray-900">TalentFlow</span>
        </Link>
      </div>

      {/* User Info */}
      {user && (
        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-blue-700 text-white flex items-center justify-center shadow-sm">
              <span className="text-sm font-medium">
                {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{user.name}</p>
              <span className={`inline-flex px-2 py-0.5 rounded text-xs border ${roleBadgeColors[user.role]}`}>
                {roleLabels[user.role]}
              </span>
            </div>
          </div>
        </div>
      )}

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
                      ? 'text-blue-600 bg-blue-50'
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
                      <Link
                        key={child.id}
                        href={child.href || '#'}
                        className={`w-full flex items-center gap-3 px-4 py-2 pl-6 text-sm transition-colors ${
                          isActive(child.href)
                            ? 'text-blue-600 bg-blue-50 font-medium border-l-2 border-blue-600 -ml-px'
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <child.icon className="w-4 h-4 flex-shrink-0" />
                        <span>{child.label}</span>
                      </Link>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <Link
                href={item.href || '#'}
                className={`w-full flex items-center gap-3 px-4 py-2.5 transition-colors ${
                  isActive(item.href)
                    ? 'text-blue-600 bg-blue-50 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
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
