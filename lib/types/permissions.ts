// Permission Categories and Actions
export type PermissionModule = 
  | 'dashboard'
  | 'jd_creation'
  | 'resume_scoring'
  | 'ai_talent_match'
  | 'resumes'
  | 'database'
  | 'assessments'
  | 'ai_interview'
  | 'teams'
  | 'reports'
  | 'admin'
  | 'activity_monitor'
  | 'credit_usage'
  | 'audit_logs'
  | 'billing'
  | 'analytics'
  | 'org_settings'
  | 'team_chat'
  | 'menu_visibility';

export type PermissionAction = 
  | 'view' 
  | 'create' 
  | 'edit' 
  | 'delete' 
  | 'export' 
  | 'manage'
  | 'manage_users'
  | 'manage_teams'
  | 'manage_settings'
  | 'manage_billing'
  | 'purchase_addons'
  | 'view_activity'
  | 'view_usage'
  | 'view_audit'
  | 'send_messages'
  // Job Description specific actions
  | 'disable'
  | 'archive'
  | 'republish'
  // Resume Management specific actions
  | 'create_folder'
  | 'edit_folder'
  | 'delete_folder'
  | 'apply_to_jobs'
  // Resume Scoring specific actions
  | 'manage_criteria'
  | 'view_analytics'
  // Assessment specific actions
  | 'download_pdf'
  // Menu visibility actions
  | 'menu_dashboard'
  | 'menu_jobs'
  | 'menu_resume_scoring'
  | 'menu_ai_talent_match'
  | 'menu_my_resumes'
  | 'menu_teams'
  | 'menu_internal_db'
  | 'menu_assessments'
  | 'menu_ai_interviews'
  | 'menu_reports_exports'
  | 'menu_support'
  | 'menu_settings'
  | 'menu_admin_dashboard'
  | 'menu_admin_users'
  | 'menu_admin_teams'
  | 'menu_activity_monitor'
  | 'menu_credit_usage'
  | 'menu_audit_logs'
  | 'menu_team_chat'
  | 'menu_billing'
  | 'menu_analytics'
  | 'menu_org_settings';

export interface Permission {
  module: PermissionModule;
  action: PermissionAction;
  label: string;
  description: string;
}

export interface UserPermissions {
  [key: string]: boolean; // key format: "module:action" e.g., "resumes:create"
}

// Module Definitions
export interface ModulePermissions {
  id: PermissionModule;
  name: string;
  icon: string;
  description: string;
  permissions: {
    action: PermissionAction;
    label: string;
    description: string;
  }[];
}

// All available permissions organized by module
export const PERMISSION_MODULES: ModulePermissions[] = [
  {
    id: 'dashboard',
    name: 'Dashboard',
    icon: 'LayoutDashboard',
    description: 'Main dashboard and analytics',
    permissions: [
      {
        action: 'view',
        label: 'View Dashboard',
        description: 'Access to main dashboard and overview metrics',
      },
      {
        action: 'export',
        label: 'Export Reports',
        description: 'Export dashboard data and reports',
      },
    ],
  },
  {
    id: 'jd_creation',
    name: 'Job Descriptions',
    icon: 'FileText',
    description: 'Job description creation and management',
    permissions: [
      {
        action: 'view',
        label: 'View JDs',
        description: 'View job descriptions',
      },
      {
        action: 'create',
        label: 'Create JDs',
        description: 'Create new job descriptions',
      },
      {
        action: 'edit',
        label: 'Edit JDs',
        description: 'Modify existing job descriptions',
      },
      {
        action: 'delete',
        label: 'Delete JDs',
        description: 'Remove job descriptions',
      },
      {
        action: 'export',
        label: 'Export JDs',
        description: 'Export job description data',
      },
      {
        action: 'disable',
        label: 'Disable JDs',
        description: 'Disable job descriptions',
      },
      {
        action: 'archive',
        label: 'Archive JDs',
        description: 'Archive job descriptions',
      },
      {
        action: 'republish',
        label: 'Republish JDs',
        description: 'Republish job descriptions',
      },
    ],
  },
  {
    id: 'resume_scoring',
    name: 'Resume Scoring',
    icon: 'Target',
    description: 'AI-powered resume scoring and candidate evaluation',
    permissions: [
      {
        action: 'view',
        label: 'View Scores',
        description: 'View resume scores and ratings',
      },
      {
        action: 'create',
        label: 'Run Scoring',
        description: 'Run AI scoring on resumes',
      },
      {
        action: 'edit',
        label: 'Edit Scores',
        description: 'Manually adjust or override scores',
      },
      {
        action: 'delete',
        label: 'Delete Scores',
        description: 'Remove scoring results',
      },
      {
        action: 'export',
        label: 'Export Scores',
        description: 'Export scoring reports and analytics',
      },
      {
        action: 'manage_criteria',
        label: 'Manage Criteria',
        description: 'Create and manage scoring criteria/templates',
      },
      {
        action: 'view_analytics',
        label: 'View Analytics',
        description: 'View scoring analytics and insights',
      },
    ],
  },
  {
    id: 'ai_talent_match',
    name: 'AI Talent Match',
    icon: 'Users',
    description: 'AI-powered talent matching',
    permissions: [
      {
        action: 'view',
        label: 'View Matches',
        description: 'Access AI talent match results',
      },
      {
        action: 'create',
        label: 'Create Matches',
        description: 'Initiate AI talent matching',
      },
      {
        action: 'edit',
        label: 'Edit Matches',
        description: 'Modify AI talent match settings',
      },
      {
        action: 'delete',
        label: 'Delete Matches',
        description: 'Remove AI talent match results',
      },
      {
        action: 'export',
        label: 'Export Matches',
        description: 'Export AI talent match data',
      },
    ],
  },
  {
    id: 'resumes',
    name: 'Resume Management',
    icon: 'Users',
    description: 'Resume uploads and candidate management',
    permissions: [
      {
        action: 'view',
        label: 'View Resumes',
        description: 'Access and view resumes',
      },
      {
        action: 'create',
        label: 'Upload Resumes',
        description: 'Upload new resumes',
      },
      {
        action: 'edit',
        label: 'Edit Resumes',
        description: 'Modify resume data and tags',
      },
      {
        action: 'delete',
        label: 'Delete Resumes',
        description: 'Remove resumes from system',
      },
      {
        action: 'export',
        label: 'Export Resumes',
        description: 'Export resume data',
      },
      {
        action: 'create_folder',
        label: 'Create Folder',
        description: 'Create a new folder for resumes',
      },
      {
        action: 'edit_folder',
        label: 'Edit Folder',
        description: 'Edit an existing folder for resumes',
      },
      {
        action: 'delete_folder',
        label: 'Delete Folder',
        description: 'Delete a folder for resumes',
      },
      {
        action: 'apply_to_jobs',
        label: 'Apply to Jobs',
        description: 'Apply resumes to jobs',
      },
    ],
  },
  {
    id: 'database',
    name: 'Internal Database',
    icon: 'Database',
    description: 'Internal candidate database',
    permissions: [
      {
        action: 'view',
        label: 'View Database',
        description: 'Access internal candidate database',
      },
      {
        action: 'create',
        label: 'Add Candidates',
        description: 'Add new candidates to database',
      },
      {
        action: 'edit',
        label: 'Edit Candidates',
        description: 'Modify candidate information',
      },
      {
        action: 'delete',
        label: 'Delete Candidates',
        description: 'Remove candidates from database',
      },
      {
        action: 'export',
        label: 'Export Database',
        description: 'Export candidate data',
      },
    ],
  },
  {
    id: 'assessments',
    name: 'Assessments',
    icon: 'ClipboardCheck',
    description: 'Assessment creation and management',
    permissions: [
      {
        action: 'view',
        label: 'View Assessments',
        description: 'View assessment results',
      },
      {
        action: 'create',
        label: 'Create Assessments',
        description: 'Create new assessments',
      },
      {
        action: 'manage',
        label: 'Manage Assessments',
        description: 'Assign and manage assessments',
      },
      {
        action: 'delete',
        label: 'Delete Assessments',
        description: 'Remove assessments',
      },
      {
        action: 'export',
        label: 'Export Assessments',
        description: 'Export assessment data and results (CSV/Excel)',
      },
      {
        action: 'download_pdf',
        label: 'Download PDF Reports',
        description: 'Download individual and bulk PDF reports for assessment results',
      },
    ],
  },
  {
    id: 'ai_interview',
    name: 'AI Interviews',
    icon: 'Video',
    description: 'AI-powered interview management',
    permissions: [
      {
        action: 'view',
        label: 'View Interviews',
        description: 'View interview recordings and results',
      },
      {
        action: 'create',
        label: 'Schedule Interviews',
        description: 'Create and schedule AI interviews',
      },
      {
        action: 'manage',
        label: 'Manage Interviews',
        description: 'Manage interview settings and invitations',
      },
      {
        action: 'export',
        label: 'Export Interviews',
        description: 'Export interview data and transcripts',
      },
    ],
  },
  {
    id: 'teams',
    name: 'Team Collaboration',
    icon: 'Users',
    description: 'Team features and collaboration',
    permissions: [
      {
        action: 'view',
        label: 'View Team Data',
        description: 'Access team members\' data',
      },
      {
        action: 'manage',
        label: 'Manage Team',
        description: 'Assign tasks and manage team workflow',
      },
    ],
  },
  {
    id: 'reports',
    name: 'Reports & Analytics',
    icon: 'BarChart3',
    description: 'Advanced reporting and analytics',
    permissions: [
      {
        action: 'view',
        label: 'View Reports',
        description: 'Access reports and analytics',
      },
      {
        action: 'create',
        label: 'Create Reports',
        description: 'Generate custom reports',
      },
      {
        action: 'export',
        label: 'Export Reports',
        description: 'Export report data',
      },
    ],
  },
  {
    id: 'admin',
    name: 'Administration',
    icon: 'Settings',
    description: 'Administrative settings and controls',
    permissions: [
      {
        action: 'view',
        label: 'View Admin Panel',
        description: 'Access admin dashboard',
      },
      {
        action: 'manage_users',
        label: 'Manage Users',
        description: 'Create, edit, and delete users',
      },
      {
        action: 'manage_teams',
        label: 'Manage Teams',
        description: 'Create and manage teams',
      },
      {
        action: 'manage_settings',
        label: 'System Settings',
        description: 'Configure system settings',
      },
    ],
  },
  {
    id: 'activity_monitor',
    name: 'Activity Monitor',
    icon: 'Activity',
    description: 'Monitor user activities and actions',
    permissions: [
      {
        action: 'view_activity',
        label: 'View Activity',
        description: 'View user activities and actions',
      },
    ],
  },
  {
    id: 'credit_usage',
    name: 'Credit Usage',
    icon: 'CreditCard',
    description: 'Track credit usage and consumption',
    permissions: [
      {
        action: 'view_usage',
        label: 'View Usage',
        description: 'Track credit usage and consumption',
      },
    ],
  },
  {
    id: 'audit_logs',
    name: 'Activity Logs',
    icon: 'FileText',
    description: 'View activity logs and changes',
    permissions: [
      {
        action: 'view_audit',
        label: 'View Activity',
        description: 'View activity logs and changes',
      },
    ],
  },
  {
    id: 'billing',
    name: 'Billing',
    icon: 'CreditCard',
    description: 'Manage billing and payments',
    permissions: [
      {
        action: 'manage_billing',
        label: 'Manage Billing',
        description: 'Manage billing and payments',
      },
      {
        action: 'purchase_addons',
        label: 'Purchase Add-ons',
        description: 'Purchase additional features and services',
      },
    ],
  },
  {
    id: 'analytics',
    name: 'Analytics',
    icon: 'BarChart3',
    description: 'Advanced analytics and insights',
    permissions: [
      {
        action: 'view',
        label: 'View Analytics',
        description: 'Access advanced analytics and insights',
      },
    ],
  },
  {
    id: 'org_settings',
    name: 'Org Settings',
    icon: 'Settings',
    description: 'Organizational settings and configurations',
    permissions: [
      {
        action: 'manage_settings',
        label: 'Manage Settings',
        description: 'Configure organizational settings and configurations',
      },
    ],
  },
  {
    id: 'team_chat',
    name: 'Team Chat',
    icon: 'MessageCircle',
    description: 'Team communication and collaboration',
    permissions: [
      {
        action: 'send_messages',
        label: 'Send Messages',
        description: 'Send messages and communicate with team members',
      },
    ],
  },
  {
    id: 'menu_visibility',
    name: 'Menu Visibility',
    icon: 'Menu',
    description: 'Visibility of menu items',
    permissions: [
      {
        action: 'menu_dashboard',
        label: 'Menu Dashboard',
        description: 'Visibility of Dashboard menu item',
      },
      {
        action: 'menu_jobs',
        label: 'Menu Jobs',
        description: 'Visibility of Jobs menu item',
      },
      {
        action: 'menu_resume_scoring',
        label: 'Menu Resume Scoring',
        description: 'Visibility of Resume Scoring menu item',
      },
      {
        action: 'menu_ai_talent_match',
        label: 'Menu AI Talent Match',
        description: 'Visibility of AI Talent Match menu item',
      },
      {
        action: 'menu_my_resumes',
        label: 'Menu My Resumes',
        description: 'Visibility of My Resumes menu item',
      },
      {
        action: 'menu_teams',
        label: 'Menu Teams',
        description: 'Visibility of Teams menu item',
      },
      {
        action: 'menu_internal_db',
        label: 'Menu Internal DB',
        description: 'Visibility of Internal DB menu item',
      },
      {
        action: 'menu_assessments',
        label: 'Menu Assessments',
        description: 'Visibility of Assessments menu item',
      },
      {
        action: 'menu_ai_interviews',
        label: 'Menu AI Interviews',
        description: 'Visibility of AI Interviews menu item',
      },
      {
        action: 'menu_reports_exports',
        label: 'Menu Reports Exports',
        description: 'Visibility of Reports Exports menu item',
      },
      {
        action: 'menu_support',
        label: 'Menu Support',
        description: 'Visibility of Support menu item',
      },
      {
        action: 'menu_settings',
        label: 'Menu Settings',
        description: 'Visibility of Settings menu item',
      },
      {
        action: 'menu_admin_dashboard',
        label: 'Menu Admin Dashboard',
        description: 'Visibility of Admin Dashboard menu item',
      },
      {
        action: 'menu_admin_users',
        label: 'Menu Admin Users',
        description: 'Visibility of Admin Users menu item',
      },
      {
        action: 'menu_admin_teams',
        label: 'Menu Admin Teams',
        description: 'Visibility of Admin Teams menu item',
      },
      {
        action: 'menu_activity_monitor',
        label: 'Menu Activity Monitor',
        description: 'Visibility of Activity Monitor menu item',
      },
      {
        action: 'menu_credit_usage',
        label: 'Menu Credit Usage',
        description: 'Visibility of Credit Usage menu item',
      },
      {
        action: 'menu_audit_logs',
        label: 'Menu Audit Logs',
        description: 'Visibility of Audit Logs menu item',
      },
      {
        action: 'menu_team_chat',
        label: 'Menu Team Chat',
        description: 'Visibility of Team Chat menu item',
      },
      {
        action: 'menu_billing',
        label: 'Menu Billing',
        description: 'Visibility of Billing menu item',
      },
      {
        action: 'menu_analytics',
        label: 'Menu Analytics',
        description: 'Visibility of Analytics menu item',
      },
      {
        action: 'menu_org_settings',
        label: 'Menu Org Settings',
        description: 'Visibility of Org Settings menu item',
      },
    ],
  },
];

// Role-based permission presets
export interface RolePreset {
  role: 'tenant_admin' | 'recruiter' | 'viewer';
  name: string;
  description: string;
  permissions: UserPermissions;
}

export const ROLE_PRESETS: RolePreset[] = [
  {
    role: 'tenant_admin',
    name: 'Owner',
    description: 'Full access to all features and administrative controls',
    permissions: {
      // Dashboard
      'dashboard:view': true,
      'dashboard:export': true,
      
      // Job Descriptions
      'jd_creation:view': true,
      'jd_creation:create': true,
      'jd_creation:edit': true,
      'jd_creation:delete': true,
      'jd_creation:export': true,
      'jd_creation:disable': true,
      'jd_creation:archive': true,
      'jd_creation:republish': true,
      
      // Resume Scoring
      'resume_scoring:view': true,
      'resume_scoring:create': true,
      'resume_scoring:edit': true,
      'resume_scoring:delete': true,
      'resume_scoring:export': true,
      'resume_scoring:manage_criteria': true,
      'resume_scoring:view_analytics': true,
      
      // AI Talent Match
      'ai_talent_match:view': true,
      'ai_talent_match:create': true,
      'ai_talent_match:edit': true,
      'ai_talent_match:delete': true,
      'ai_talent_match:export': true,
      
      // Resumes
      'resumes:view': true,
      'resumes:create': true,
      'resumes:edit': true,
      'resumes:delete': true,
      'resumes:export': true,
      'resumes:create_folder': true,
      'resumes:edit_folder': true,
      'resumes:delete_folder': true,
      'resumes:apply_to_jobs': true,
      
      // Database
      'database:view': true,
      'database:create': true,
      'database:edit': true,
      'database:delete': true,
      'database:export': true,
      
      // Assessments
      'assessments:view': true,
      'assessments:create': true,
      'assessments:manage': true,
      'assessments:delete': true,
      'assessments:export': true,
      'assessments:download_pdf': true,

      // AI Interviews
      'ai_interview:view': true,
      'ai_interview:create': true,
      'ai_interview:manage': true,
      'ai_interview:export': true,
      
      // Teams
      'teams:view': true,
      'teams:manage': true,
      
      // Reports
      'reports:view': true,
      'reports:create': true,
      'reports:export': true,
      
      // Admin
      'admin:view': true,
      'admin:manage_users': true,
      'admin:manage_teams': true,
      'admin:manage_settings': true,
      
      // Activity Monitor
      'activity_monitor:view_activity': true,
      
      // Credit Usage
      'credit_usage:view_usage': true,
      
      // Audit Logs
      'audit_logs:view_audit': true,
      
      // Billing
      'billing:manage_billing': true,
      'billing:purchase_addons': true,
      
      // Analytics
      'analytics:view': true,
      
      // Org Settings
      'org_settings:manage_settings': true,
      
      // Team Chat
      'team_chat:send_messages': true,
      
      // Menu Visibility
      'menu_visibility:menu_dashboard': true,
      'menu_visibility:menu_jobs': true,
      'menu_visibility:menu_resume_scoring': true,
      'menu_visibility:menu_ai_talent_match': true,
      'menu_visibility:menu_my_resumes': true,
      'menu_visibility:menu_teams': true,
      'menu_visibility:menu_internal_db': true,
      'menu_visibility:menu_assessments': true,
      'menu_visibility:menu_ai_interviews': true,
      'menu_visibility:menu_reports_exports': true,
      'menu_visibility:menu_support': true,
      'menu_visibility:menu_settings': true,
      'menu_visibility:menu_admin_dashboard': true,
      'menu_visibility:menu_admin_users': true,
      'menu_visibility:menu_admin_teams': true,
      'menu_visibility:menu_activity_monitor': true,
      'menu_visibility:menu_credit_usage': true,
      'menu_visibility:menu_audit_logs': true,
      'menu_visibility:menu_team_chat': true,
      'menu_visibility:menu_billing': true,
      'menu_visibility:menu_analytics': true,
      'menu_visibility:menu_org_settings': true,
    },
  },
  {
    role: 'recruiter',
    name: 'Recruiter',
    description: 'Standard recruiter access with full recruitment workflow',
    permissions: {
      // Dashboard
      'dashboard:view': true,
      'dashboard:export': false,
      
      // Job Descriptions
      'jd_creation:view': true,
      'jd_creation:create': true,
      'jd_creation:edit': true,
      'jd_creation:delete': false,
      'jd_creation:export': true,
      'jd_creation:disable': true,
      'jd_creation:archive': true,
      'jd_creation:republish': true,
      
      // Resume Scoring
      'resume_scoring:view': true,
      'resume_scoring:create': true,
      'resume_scoring:edit': true,
      'resume_scoring:delete': false,
      'resume_scoring:export': true,
      'resume_scoring:manage_criteria': true,
      'resume_scoring:view_analytics': true,
      
      // AI Talent Match
      'ai_talent_match:view': true,
      'ai_talent_match:create': true,
      'ai_talent_match:edit': true,
      'ai_talent_match:delete': false,
      'ai_talent_match:export': true,
      
      // Resumes
      'resumes:view': true,
      'resumes:create': true,
      'resumes:edit': true,
      'resumes:delete': false,
      'resumes:export': true,
      'resumes:create_folder': true,
      'resumes:edit_folder': true,
      'resumes:delete_folder': true,
      'resumes:apply_to_jobs': true,
      
      // Database
      'database:view': true,
      'database:create': true,
      'database:edit': true,
      'database:delete': false,
      'database:export': false,
      
      // Assessments
      'assessments:view': true,
      'assessments:create': true,
      'assessments:manage': true,
      'assessments:delete': false,
      'assessments:export': true,
      'assessments:download_pdf': true,

      // AI Interviews
      'ai_interview:view': true,
      'ai_interview:create': true,
      'ai_interview:manage': true,
      'ai_interview:export': true,
      
      // Teams
      'teams:view': true,
      'teams:manage': false,
      
      // Reports
      'reports:view': true,
      'reports:create': false,
      'reports:export': false,
      
      // Admin
      'admin:view': false,
      'admin:manage_users': false,
      'admin:manage_teams': false,
      'admin:manage_settings': false,
      
      // Activity Monitor
      'activity_monitor:view_activity': false,
      
      // Credit Usage
      'credit_usage:view_usage': false,
      
      // Audit Logs
      'audit_logs:view_audit': false,
      
      // Billing
      'billing:manage_billing': false,
      'billing:purchase_addons': false,
      
      // Analytics
      'analytics:view': false,
      
      // Org Settings
      'org_settings:manage_settings': false,
      
      // Team Chat
      'team_chat:send_messages': false,
      
      // Menu Visibility
      'menu_visibility:menu_dashboard': true,
      'menu_visibility:menu_jobs': true,
      'menu_visibility:menu_resume_scoring': true,
      'menu_visibility:menu_ai_talent_match': true,
      'menu_visibility:menu_my_resumes': true,
      'menu_visibility:menu_teams': true,
      'menu_visibility:menu_internal_db': true,
      'menu_visibility:menu_assessments': true,
      'menu_visibility:menu_ai_interviews': true,
      'menu_visibility:menu_reports_exports': true,
      'menu_visibility:menu_support': true,
      'menu_visibility:menu_settings': true,
      'menu_visibility:menu_admin_dashboard': false,
      'menu_visibility:menu_admin_users': false,
      'menu_visibility:menu_admin_teams': false,
      'menu_visibility:menu_activity_monitor': false,
      'menu_visibility:menu_credit_usage': false,
      'menu_visibility:menu_audit_logs': false,
      'menu_visibility:menu_team_chat': false,
      'menu_visibility:menu_billing': false,
      'menu_visibility:menu_analytics': false,
      'menu_visibility:menu_org_settings': false,
    },
  },
  {
    role: 'viewer',
    name: 'Viewer',
    description: 'Read-only access to view data and reports',
    permissions: {
      // Dashboard
      'dashboard:view': true,
      'dashboard:export': false,
      
      // Job Descriptions
      'jd_creation:view': true,
      'jd_creation:create': false,
      'jd_creation:edit': false,
      'jd_creation:delete': false,
      'jd_creation:export': false,
      'jd_creation:disable': false,
      'jd_creation:archive': false,
      'jd_creation:republish': false,
      
      // Resume Scoring
      'resume_scoring:view': true,
      'resume_scoring:create': false,
      'resume_scoring:edit': false,
      'resume_scoring:delete': false,
      'resume_scoring:export': false,
      'resume_scoring:manage_criteria': false,
      'resume_scoring:view_analytics': false,
      
      // AI Talent Match
      'ai_talent_match:view': true,
      'ai_talent_match:create': false,
      'ai_talent_match:edit': false,
      'ai_talent_match:delete': false,
      'ai_talent_match:export': false,
      
      // Resumes
      'resumes:view': true,
      'resumes:create': false,
      'resumes:edit': false,
      'resumes:delete': false,
      'resumes:export': false,
      'resumes:create_folder': false,
      'resumes:edit_folder': false,
      'resumes:delete_folder': false,
      'resumes:apply_to_jobs': false,
      
      // Database
      'database:view': true,
      'database:create': false,
      'database:edit': false,
      'database:delete': false,
      'database:export': false,
      
      // Assessments
      'assessments:view': true,
      'assessments:create': false,
      'assessments:manage': false,
      'assessments:delete': false,
      'assessments:export': false,
      'assessments:download_pdf': false,

      // AI Interviews
      'ai_interview:view': true,
      'ai_interview:create': false,
      'ai_interview:manage': false,
      'ai_interview:export': false,
      
      // Teams
      'teams:view': true,
      'teams:manage': false,
      
      // Reports
      'reports:view': true,
      'reports:create': false,
      'reports:export': false,
      
      // Admin
      'admin:view': false,
      'admin:manage_users': false,
      'admin:manage_teams': false,
      'admin:manage_settings': false,
      
      // Activity Monitor
      'activity_monitor:view_activity': false,
      
      // Credit Usage
      'credit_usage:view_usage': false,
      
      // Audit Logs
      'audit_logs:view_audit': false,
      
      // Billing
      'billing:manage_billing': false,
      'billing:purchase_addons': false,
      
      // Analytics
      'analytics:view': false,
      
      // Org Settings
      'org_settings:manage_settings': false,
      
      // Team Chat
      'team_chat:send_messages': false,
      
      // Menu Visibility
      'menu_visibility:menu_dashboard': true,
      'menu_visibility:menu_jobs': true,
      'menu_visibility:menu_resume_scoring': true,
      'menu_visibility:menu_ai_talent_match': true,
      'menu_visibility:menu_my_resumes': true,
      'menu_visibility:menu_teams': true,
      'menu_visibility:menu_internal_db': true,
      'menu_visibility:menu_assessments': true,
      'menu_visibility:menu_ai_interviews': true,
      'menu_visibility:menu_reports_exports': true,
      'menu_visibility:menu_support': true,
      'menu_visibility:menu_settings': true,
      'menu_visibility:menu_admin_dashboard': false,
      'menu_visibility:menu_admin_users': false,
      'menu_visibility:menu_admin_teams': false,
      'menu_visibility:menu_activity_monitor': false,
      'menu_visibility:menu_credit_usage': false,
      'menu_visibility:menu_audit_logs': false,
      'menu_visibility:menu_team_chat': false,
      'menu_visibility:menu_billing': false,
      'menu_visibility:menu_analytics': false,
      'menu_visibility:menu_org_settings': false,
    },
  },
];

// Helper function to get role preset
export function getRolePreset(role: 'tenant_admin' | 'recruiter' | 'viewer'): RolePreset {
  return ROLE_PRESETS.find(preset => preset.role === role) || ROLE_PRESETS[1];
}

// Helper function to check if user has permission
export function hasPermission(
  userPermissions: UserPermissions,
  module: PermissionModule,
  action: PermissionAction
): boolean {
  const key = `${module}:${action}`;
  return userPermissions[key] === true;
}

// Helper function to check menu visibility
export function hasMenuVisibility(
  userPermissions: UserPermissions | undefined,
  menuAction: PermissionAction
): boolean {
  // If no custom permissions, allow all menus (default behavior)
  if (!userPermissions) return true;
  
  const key = `menu_visibility:${menuAction}`;
  // If permission is not defined, default to true
  return userPermissions[key] !== false;
}

// Helper function to generate permission key
export function getPermissionKey(module: PermissionModule, action: PermissionAction): string {
  return `${module}:${action}`;
}

// Count permissions
export function countPermissions(permissions: UserPermissions): { granted: number; total: number } {
  const total = PERMISSION_MODULES.reduce((sum, module) => sum + module.permissions.length, 0);
  const granted = Object.values(permissions).filter(Boolean).length;
  return { granted, total };
}