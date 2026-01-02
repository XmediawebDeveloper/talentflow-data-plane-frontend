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
  Briefcase,
  Layers,
  GraduationCap,
  Clock,
  Factory,
  History,
  ScrollText
} from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
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
}

interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
  adminOnly?: boolean;
}

export default function Sidebar({ user, tenant }: SidebarProps) {
  const pathname = usePathname();
  const [expandedSections, setExpandedSections] = useState<string[]>([
    'administration', 'recruitment', 'resume-management', 'evaluation',
    'organization', 'masters', 'subscription', 'settings', 'reports', 'audits'
  ]);

  const roleLabels = {
    tenant_admin: 'Admin',
    recruiter: 'Recruiter',
    viewer: 'Viewer',
  };

  const isTenantAdmin = user?.role === 'tenant_admin';

  // Check if user has a specific permission
  const hasPermission = (permission?: string): boolean => {
    if (!permission) return true;
    if (isTenantAdmin) return true;
    if (!user?.permissions) return false;
    return user.permissions[permission as keyof typeof user.permissions] === true;
  };

  // Define menu sections with grouped items
  const allSections: NavSection[] = [
    // ADMINISTRATION
    {
      id: 'administration',
      label: 'ADMINISTRATION',
      items: [
        { id: 'dashboard', label: 'Admin Dashboard', icon: LayoutDashboard, href: '/dashboard' },
      ]
    },

    // RECRUITMENT
    {
      id: 'recruitment',
      label: 'RECRUITMENT',
      items: [
        { id: 'job-openings', label: 'Job Descriptions', icon: Briefcase, href: '/recruitment/job-openings', permission: 'canCreateJD' },
        { id: 'resume-scoring', label: 'Resume Scoring', icon: Target, href: '/recruitment/resume-scoring', permission: 'canViewResumes' },
        { id: 'ai-talent-match', label: 'AI Talent Match', icon: Sparkles, href: '/recruitment/ai-talent-match', permission: 'canViewResumes' },
      ]
    },

    // RESUME MANAGEMENT
    {
      id: 'resume-management',
      label: 'RESUME MANAGEMENT',
      items: [
        { id: 'my-resumes', label: 'My Resumes', icon: Users, href: '/recruitment/my-resumes', permission: 'canUploadResumes' },
        { id: 'resume-database', label: 'Internal Database', icon: Database, href: '/recruitment/resume-database', permission: 'canAccessInternalDB' },
      ]
    },

    // EVALUATION
    {
      id: 'evaluation',
      label: 'EVALUATION',
      items: [
        { id: 'assessments', label: 'Assessments', icon: ClipboardList, href: '/recruitment/assessments', permission: 'canCreateAssessments' },
        { id: 'ai-interviews', label: 'AI Interviews', icon: Video, href: '/recruitment/ai-interviews', permission: 'canViewResumes' },
      ]
    },

    // ORGANIZATION - Admin only
    {
      id: 'organization',
      label: 'ORGANIZATION',
      adminOnly: true,
      items: [
        { id: 'company-profile', label: 'Company Profile', icon: Building2, href: '/organization/company-profile', adminOnly: true },
        { id: 'team-management', label: 'Team Management', icon: Users, href: '/organization/team-management', adminOnly: true },
        { id: 'user-management', label: 'User Management', icon: UserCog, href: '/organization/user-management', adminOnly: true },
        { id: 'role-management', label: 'Role Management', icon: Shield, href: '/organization/role-management', adminOnly: true },
      ]
    },

    // MASTERS - Admin only
    {
      id: 'masters',
      label: 'MASTERS',
      adminOnly: true,
      items: [
        { id: 'experience-levels', label: 'Experience Levels', icon: Clock, href: '/masters/experience-levels', adminOnly: true },
        { id: 'education-levels', label: 'Education Levels', icon: GraduationCap, href: '/masters/education-levels', adminOnly: true },
        { id: 'industry-types', label: 'Industry Types', icon: Factory, href: '/masters/industry-types', adminOnly: true },
      ]
    },

    // SUBSCRIPTION & BILLING - Admin only
    {
      id: 'subscription',
      label: 'SUBSCRIPTION & BILLING',
      adminOnly: true,
      items: [
        { id: 'current-plan', label: 'Current Plan', icon: CreditCard, href: '/subscription/current-plan', adminOnly: true },
        { id: 'usage-quotas', label: 'Usage & Quotas', icon: BarChart3, href: '/subscription/usage-quotas', adminOnly: true },
        { id: 'payment-methods', label: 'Payment Methods', icon: Wallet, href: '/subscription/payment-methods', adminOnly: true },
        { id: 'billing-history', label: 'Billing History', icon: Receipt, href: '/subscription/billing-history', adminOnly: true },
        { id: 'refund-history', label: 'Refund History', icon: RefreshCw, href: '/subscription/refund-history', adminOnly: true },
        { id: 'dispute-history', label: 'Dispute History', icon: AlertTriangle, href: '/subscription/dispute-history', adminOnly: true },
      ]
    },

    // SETTINGS - Admin only
    {
      id: 'settings',
      label: 'SETTINGS',
      adminOnly: true,
      items: [
        { id: 'general-settings', label: 'General Settings', icon: Settings, href: '/settings/general-settings', adminOnly: true },
        { id: 'permissions', label: 'Permissions & Roles', icon: Shield, href: '/settings/permissions', adminOnly: true },
        { id: 'api-management', label: 'API Management', icon: Key, href: '/settings/api-management', adminOnly: true },
        { id: 'branding', label: 'Branding & White Label', icon: Palette, href: '/settings/branding', adminOnly: true },
        { id: 'integrations', label: 'Integrations', icon: LinkIcon, href: '/settings/integrations', adminOnly: true },
        { id: 'security', label: 'Security Settings', icon: Lock, href: '/settings/security', adminOnly: true },
      ]
    },

    // REPORTS & ANALYTICS
    {
      id: 'reports',
      label: 'REPORTS & ANALYTICS',
      items: [
        { id: 'team-usage', label: 'Team Usage Analytics', icon: Activity, href: '/reports/team-usage', adminOnly: true },
        { id: 'performance-reports', label: 'Performance Reports', icon: TrendingUp, href: '/reports/performance-reports', permission: 'canViewAnalytics' },
      ]
    },

    // AUDITS & TRAIL - Admin only
    {
      id: 'audits',
      label: 'AUDITS & TRAIL',
      adminOnly: true,
      items: [
        { id: 'audit-trail', label: 'Audit Trail', icon: ScrollText, href: '/audits/trail', adminOnly: true },
        { id: 'activity-logs', label: 'Activity Logs', icon: Activity, href: '/audits/activity', adminOnly: true },
      ]
    },

    // SUPPORT
    {
      id: 'support',
      label: 'SUPPORT',
      items: [
        { id: 'support-tickets', label: 'Support Tickets', icon: HelpCircle, href: '/support-tickets' },
      ]
    },
  ];

  // Filter sections and items based on permissions
  const filterSections = (sections: NavSection[]): NavSection[] => {
    return sections.map(section => {
      // Filter items within section
      const filteredItems = section.items.filter(item => {
        if (item.adminOnly && !isTenantAdmin) return false;
        if (item.permission && !hasPermission(item.permission)) return false;
        return true;
      });

      return { ...section, items: filteredItems };
    }).filter(section => {
      // Remove empty sections
      if (section.items.length === 0) return false;
      // Check section-level admin requirement
      if (section.adminOnly && !isTenantAdmin) return false;
      return true;
    });
  };

  const visibleSections = filterSections(allSections);

  const isActive = (href?: string): boolean => {
    if (!href) return false;
    return pathname === href || pathname.startsWith(href + '/');
  };

  return (
    <aside className="w-64 bg-gray-200 border-r border-gray-300 flex flex-col shadow-sm h-screen">
      {/* Logo */}
      <div className="p-4 border-b border-gray-200 bg-white">
        <Link href="/dashboard" className="flex items-center justify-center">
         <img
              src="/logos/talent_flow_logo.png"
              alt="TalentFlow"
              className="h-10 w-auto"
            />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2">
        {visibleSections.map((section) => (
          <div key={section.id} className="mb-2">
            {/* Section Header */}
            <div className="px-4 py-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {section.label}
              </span>
            </div>

            {/* Section Items */}
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <Link
                  key={item.id}
                  href={item.href || '#'}
                  className={`w-full flex items-center gap-3 px-4 py-2 mx-2 rounded-lg text-sm transition-colors ${
                    isActive(item.href)
                      ? 'bg-gray-800 text-white font-medium shadow-sm'
                      : 'text-gray-700 hover:bg-gray-200 hover:text-gray-900'
                  }`}
                  style={{ width: 'calc(100% - 16px)' }}
                >
                  <item.icon className={`w-4 h-4 flex-shrink-0 ${isActive(item.href) ? 'text-white' : 'text-gray-500'}`} />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        <p className="text-xs text-gray-500 text-center">
          {tenant?.name || 'TalentFlow'} v1.0
        </p>
      </div>
    </aside>
  );
}
