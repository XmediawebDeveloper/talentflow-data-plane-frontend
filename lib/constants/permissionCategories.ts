/**
 * SINGLE SOURCE OF TRUTH for permission categories shown in:
 *   1. Edit User popup        — components/users/UserManagement.tsx
 *   2. Edit Role form         — components/roles/EditRoleForm.tsx
 *   3. Create Role form       — components/roles/CreateRoleForm.tsx
 *
 * ⚠️  Edit THIS file only. All three UIs will automatically reflect your changes.
 *     Do NOT duplicate this list in any of the three files above.
 */

export interface CustomPermissionAction {
  code: string;
  label: string;
  description?: string;
}

export interface CustomPermissionSubCategory {
  name: string;
  viewCode?: string;
  actions: CustomPermissionAction[];
}

export interface CustomPermissionCategory {
  id: string;
  name: string;
  icon?: string;
  description?: string;
  isMenuToggle?: boolean;
  viewCode?: string;
  subCategories?: CustomPermissionSubCategory[];
  actions?: CustomPermissionAction[];
  dependencies?: {
    [actionCode: string]: string[];
  };
}

export const CUSTOM_PERMISSION_CATEGORIES: CustomPermissionCategory[] = [
  {
    id: 'job_description',
    name: 'Job Description',
    description: 'Job description management permissions',
    viewCode: 'jd:read',
    actions: [
      { code: 'jd:create', label: 'Create' },
      { code: 'jd:update', label: 'Edit' },
      { code: 'jd:delete', label: 'Delete' },
      { code: 'jd:archive', label: 'Archive' },
      { code: 'jd:disable', label: 'Disable' },
      { code: 'jd:export', label: 'Export' },
      { code: 'jd:invite', label: 'Invite' },
      { code: 'jd:add_applicants', label: 'Add Applicants' },
    ],
    // Rule: JD Invite requires Assessment Share (invite uses assessment links)
    dependencies: {
      'jd:invite': ['assessments:share'],
    },
  },
  {
    id: 'resume_scoring',
    name: 'Resume Scoring',
    description: 'Resume scoring permissions (auto-enables Resume Upload)',
    viewCode: 'scoring:read',
    actions: [
      { code: 'scoring:score', label: 'Score Resumes' },
      { code: 'scoring:export', label: 'Export' },
      { code: 'scoring:invite', label: 'Invite' },
      { code: 'scoring:download', label: 'Download Scorecard' },
    ],
    // Rule: Enable Score Resumes → auto-enable My Resumes upload + Internal DB view + JD Add Applicants
    // Rule: Scoring Invite also requires Assessment Share
    // NOTE: Export, Invite, Download Scorecard do NOT block disabling Score Resumes
    dependencies: {
      'scoring:score': ['my_resumes:upload', 'internal_db:read', 'jd:add_applicants'],
      'scoring:invite': ['assessments:share'],
    },
  },
  {
    id: 'ai_talent_match',
    name: 'AI Talent Match',
    description: 'AI-powered talent matching permissions',
    viewCode: 'ai_match:read',
    actions: [
      { code: 'ai_match:run', label: 'Run AI Match' },
      { code: 'ai_match:score', label: 'Score Resumes' },
      { code: 'ai_match:export', label: 'Export' },
    ],
  },
  {
    id: 'my_resumes',
    name: 'My Resumes',
    description: 'Personal resume management permissions',
    viewCode: 'my_resumes:read',
    actions: [
      { code: 'my_resumes:upload', label: 'Upload' },
      { code: 'my_resumes:delete', label: 'Delete' },
      { code: 'my_resumes:archive', label: 'Archive' },
      { code: 'my_resumes:apply_job', label: 'Apply to Job' },
      { code: 'my_resumes:assessment', label: 'Assessment' },
      { code: 'my_resumes:ai_match', label: 'AI Talent Match' },
      { code: 'my_resumes:share', label: 'Share Resume' },
    ],
    // Rule: Assessment invite from My Resumes requires Assessment Share
    dependencies: {
      'my_resumes:assessment': ['assessments:share'],
    },
  },
  {
    id: 'internal_database',
    name: 'Internal Database',
    description: 'Shared resume database permissions',
    viewCode: 'internal_db:read',
    actions: [
      { code: 'internal_db:archive', label: 'Archive' },
      { code: 'internal_db:delete', label: 'Delete' },
      { code: 'internal_db:apply_job', label: 'Apply to Job' },
      { code: 'internal_db:assessment', label: 'Assessment' },
      { code: 'internal_db:ai_match', label: 'AI Talent Match' },
      { code: 'internal_db:share', label: 'Share Resume' },
    ],
    // Rule: Assessment invite from Internal DB requires Assessment Share
    dependencies: {
      'internal_db:assessment': ['assessments:share'],
    },
  },
  {
    id: 'assessments',
    name: 'Assessment',
    description: 'Assessment management permissions',
    viewCode: 'assessments:read',
    actions: [
      { code: 'assessments:create', label: 'Create' },
      { code: 'assessments:update', label: 'Edit' },
      { code: 'assessments:share', label: 'Share' },
      { code: 'assessments:download_report', label: 'Download Report' },
      { code: 'assessments:batch_download', label: 'Batch Download' },
      { code: 'assessments:add_question', label: 'Add Question' },
      { code: 'assessments:edit_question', label: 'Edit Question' },
      { code: 'assessments:delete_question', label: 'Delete Question' },
    ],
  },
  {
    id: 'ai_interviews',
    name: 'AI Interview',
    description: 'AI interview management permissions',
    viewCode: 'ai_interview:read',
    actions: [
      { code: 'ai_interview:create', label: 'Create' },
      { code: 'ai_interview:update', label: 'Edit' },
      { code: 'ai_interview:share', label: 'Share' },
      { code: 'ai_interview:invite', label: 'Invite' },
      { code: 'ai_interview:publish', label: 'Publish' },
      { code: 'ai_interview:archive', label: 'Archive' },
      { code: 'ai_interview:delete', label: 'Delete' },
    ],
  },
  {
    id: 'hr_question_bank',
    name: 'HR Question Bank',
    description: 'Reusable HR question bank permissions',
    viewCode: 'hr_question_bank:read',
    actions: [
      { code: 'hr_question_bank:create', label: 'Create' },
      { code: 'hr_question_bank:update', label: 'Edit' },
      { code: 'hr_question_bank:delete', label: 'Delete' },
    ],
  },
  {
    id: 'analytics',
    name: 'Analytics',
    description: 'Dashboard and analytics permissions',
    isMenuToggle: true,
    viewCode: 'analytics:read',
    actions: [
      { code: 'analytics:export', label: 'Export' },
      { code: 'analytics:custom_reports', label: 'Custom Reports' },
    ],
  },
  {
    id: 'subscription_billing',
    name: 'Subscription & Billing',
    description: 'Billing and subscription management',
    isMenuToggle: true,
    viewCode: 'billing:read',
    subCategories: [
      {
        name: 'Current Plan',
        viewCode: 'current_plan:read',
        actions: [
          { code: 'billing:upgrade', label: 'Upgrade' },
        ],
      },
      {
        name: 'Usage & Quotas',
        viewCode: 'usage:read',
        actions: [
          { code: 'usage:upgrade', label: 'Upgrade' },
          { code: 'usage:export', label: 'Export' },
        ],
      },
      {
        name: 'Payment Methods',
        viewCode: 'payment_methods:read',
        actions: [
          { code: 'payment_methods:create', label: 'Add' },
          { code: 'payment_methods:update', label: 'Edit' },
          { code: 'payment_methods:delete', label: 'Delete' },
        ],
      },
      {
        name: 'Billing History',
        actions: [
          { code: 'billing_history:read', label: 'View' },
        ],
      },
      {
        name: 'Refund History',
        actions: [
          { code: 'refund_history:read', label: 'View' },
        ],
      },
      {
        name: 'Dispute History',
        actions: [
          { code: 'dispute_history:read', label: 'View' },
        ],
      },
    ],
  },
  {
    id: 'settings',
    name: 'Settings',
    description: 'System settings and configuration',
    isMenuToggle: true,
    viewCode: 'settings:read',
    subCategories: [
      {
        name: 'General Settings',
        viewCode: 'general_settings:read',
        actions: [
          { code: 'settings:general', label: 'Manage' },
        ],
      },
      {
        name: 'Permissions & Roles',
        viewCode: 'permissions_roles:read',
        actions: [
          { code: 'settings:permissions_roles', label: 'Manage' },
        ],
      },
      {
        name: 'API Management',
        viewCode: 'api_management:read',
        actions: [
          { code: 'settings:api_management', label: 'Manage' },
        ],
      },
      {
        name: 'Branding & White Label',
        viewCode: 'branding:read',
        actions: [
          { code: 'settings:branding', label: 'Manage' },
        ],
      },
    ],
  },
  {
    id: 'support',
    name: 'Support',
    description: 'Support and security settings',
    isMenuToggle: true,
    viewCode: 'support:read',
    subCategories: [
      {
        name: 'Security Settings',
        viewCode: 'security_settings:read',
        actions: [
          { code: 'support:security_settings', label: 'Manage' },
        ],
      },
    ],
  },
  {
    id: 'user_management',
    name: 'User Management',
    description: 'Create, edit, and manage users. Each sensitive action is independently grantable.',
    viewCode: 'users:read',
    actions: [
      { code: 'users:create', label: 'Create User' },
      { code: 'users:update', label: 'Edit User' },
      { code: 'users:delete', label: 'Delete User' },
      { code: 'users:disable', label: 'Disable / Enable User' },
      { code: 'users:assign_role', label: 'Assign Roles' },
      { code: 'users:reset_password', label: 'Reset Password', description: 'Email the user a temporary password and force a reset on next login' },
      { code: 'users:force_password_change', label: 'Force Password Change', description: 'Require the user to change their password on next login' },
    ],
  },
  {
    id: 'teams',
    name: 'Teams',
    description: 'Team management permissions',
    isMenuToggle: true,
    viewCode: 'teams:view',
    actions: [
      { code: 'teams:create', label: 'Create' },
      { code: 'teams:update', label: 'Edit' },
      { code: 'teams:delete', label: 'Delete' },
      { code: 'teams:view_reports', label: 'View Reports' },
      { code: 'teams:export', label: 'Export' },
    ],
  },
];
