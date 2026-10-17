/**
 * SINGLE SOURCE OF TRUTH for permission categories shown in:
 *   1. Edit User popup        — components/users/UserManagement.tsx
 *   2. Edit Role form         — components/roles/EditRoleForm.tsx
 *   3. Create Role form       — components/roles/CreateRoleForm.tsx
 *
 * ⚠️  Edit THIS file only. All three UIs will automatically reflect your changes.
 *     Do NOT duplicate this list in any of the three files above.
 *
 * The read-only views (Role details popup, Permissions Catalog in
 * components/roles/RoleManagement.tsx) render through getPermissionDisplaySections()
 * below, so they show these same section names and labels — never raw DB
 * names or codes like "JD:CREATE".
 *
 * NAMING RULE — one capability, one label, in every section:
 *   Score Resume          scoring a resume against a JD, whatever the entry point
 *                         (JD page, Resume Scoring, AI Talent Match, My Resumes,
 *                         Shared Database). 'my_resumes:apply_job' /
 *                         'internal_db:apply_job' were a second checkbox for the
 *                         same thing and are no longer listed — the resume-list
 *                         "Score Resume" button checks '<source>:score'.
 *   Invite Candidates     sending invitations from a module
 *   Invite to Assessment  sending a resume to an assessment from a resume list
 *   Run AI Talent Match   running AI Talent Match
 *   Upgrade Plan          plan upgrade from Current Plan / Usage
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
      { code: 'jd:invite', label: 'Invite Candidates' },
      { code: 'jd:add_applicants', label: 'Score Resume' },
    ],
    // Rule: JD Invite requires Assessment Invite (this is what actually sends
    // the invitation server-side — see app/routers/assessments.py's
    // invite/bulk-invite endpoints, gated by 'assessments:invite', not
    // 'assessments:share'. 'Share' is a separate, real permission that only
    // controls generating a shareable assessment link from the Assessments
    // list page).
    //
    // Rule: Edit and Delete both require View (app/services/
    // permission_dependencies.py: jd:update -> jd:read, jd:delete ->
    // jd:read). Enabling Edit/Delete already auto-enables View via this
    // category's own view-code mechanism, but nothing previously stopped the
    // reverse: unchecking "View Job Description" on its own row while Edit
    // or Delete stayed checked, leaving a combination the backend would
    // reject the next time either ran.
    dependencies: {
      'jd:invite': ['assessments:invite'],
      'jd:update': ['jd:read'],
      'jd:delete': ['jd:read'],
    },
  },
  {
    id: 'resume_scoring',
    name: 'Resume Scoring',
    description: 'Resume scoring permissions (auto-enables Resume Upload)',
    viewCode: 'scoring:read',
    actions: [
      { code: 'scoring:score', label: 'Score Resume' },
      { code: 'scoring:export', label: 'Export' },
      { code: 'scoring:invite', label: 'Invite Candidates' },
      { code: 'scoring:download', label: 'Download Scorecard' },
    ],
    // Rule: Enable Score Resumes → auto-enable Job Description view + My
    // Resumes view + upload + JD Add Applicants.
    // 'jd:read' and 'my_resumes:read' are the two the backend actually
    // requires to run scoring (app/services/permission_dependencies.py:
    // scoring:score → jd:read, resumes:read — 'my_resumes:read' satisfies
    // the 'resumes:read' alias). 'my_resumes:upload' is kept as an
    // additional, deliberate UX auto-enable (scoring flow lets you upload
    // resumes directly), not a substitute for view access.
    // Internal DB deliberately NOT listed here: Shared Database is an
    // independent module — an optional extra resume SOURCE for scoring, not
    // a requirement for Score Resumes to work at all. That source is its own
    // combo of 'internal_db:read' + 'internal_db:score' (see
    // SelectSourceModal.tsx's Internal Database tab), granted separately.
    // Bundling it in here previously meant enabling Score Resumes always
    // force-granted tenant-wide Shared Database read access, and disabling
    // Shared Database was blocked as "required by Score Resumes" even when
    // My Resumes access alone already satisfied scoring's real requirement.
    // Rule: Scoring Invite also requires Assessment Invite (see jd:invite above
    // for why this points at 'assessments:invite' rather than 'assessments:share')
    // NOTE: Export, Invite, Download Scorecard do NOT block disabling Score Resumes
    dependencies: {
      // 'my_resumes:score' added so enabling Score Resumes always leaves the
      // user with at least one usable scoring SOURCE — SelectSourceModal.tsx
      // gates the "My Resumes" source tab on this exact code independently of
      // my_resumes:read/upload (see its own comment: "now gated by its own
      // Score Resume sub-action"). Without it, a user could have Score
      // Resumes enabled with no tab available to actually pick a resume from.
      'scoring:score': ['jd:read', 'my_resumes:read', 'my_resumes:upload', 'my_resumes:score', 'jd:add_applicants'],
      'scoring:invite': ['assessments:invite'],
    },
  },
  {
    id: 'ai_talent_match',
    name: 'AI Talent Match',
    description: 'AI-powered talent matching permissions',
    viewCode: 'ai_match:read',
    actions: [
      { code: 'ai_match:run', label: 'Run AI Talent Match' },
      { code: 'ai_match:score', label: 'Score Resume' },
      { code: 'ai_match:export', label: 'Export' },
    ],
    // Rule: Run AI Match requires both Job Description and Shared Database
    // access (app/services/permission_dependencies.py: ai_match:run ->
    // internal_db:read, jd:read) — matching a candidate against a JD needs
    // both sides of the match. Previously undeclared here, so disabling Job
    // Description or Shared Database gave no warning that it breaks AI
    // Talent Match too.
    dependencies: {
      'ai_match:run': ['internal_db:read', 'jd:read'],
    },
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
      { code: 'my_resumes:assessment', label: 'Invite to Assessment' },
      { code: 'my_resumes:ai_match', label: 'Run AI Talent Match' },
      { code: 'my_resumes:score', label: 'Score Resume' },
      { code: 'my_resumes:share', label: 'Share Resume' },
    ],
    // Rule: Assessment invite from My Resumes requires Assessment Invite
    // (see jd:invite above for why this points at 'assessments:invite')
    dependencies: {
      'my_resumes:assessment': ['assessments:invite'],
    },
  },
  {
    id: 'internal_database',
    name: 'Shared Database',
    description: 'Shared resume database permissions',
    viewCode: 'internal_db:read',
    actions: [
      { code: 'internal_db:archive', label: 'Archive' },
      { code: 'internal_db:delete', label: 'Delete' },
      { code: 'internal_db:assessment', label: 'Invite to Assessment' },
      { code: 'internal_db:ai_match', label: 'Run AI Talent Match' },
      { code: 'internal_db:score', label: 'Score Resume' },
      { code: 'internal_db:share', label: 'Share Resume' },
    ],
    // Rule: Assessment invite from Internal DB requires Assessment Invite
    // (see jd:invite above for why this points at 'assessments:invite')
    //
    // Rule: Delete requires View (app/services/permission_dependencies.py:
    // internal_db:delete -> internal_db:read). No 'Create'/'Edit' checkbox
    // exists in this category to mirror internal_db:create/update — those
    // backend codes have no corresponding frontend action at all.
    //
    // Rule: AI Talent Match from Internal DB requires the real backend
    // permission that endpoint checks (app/services/permission_dependencies.py:
    // internal_db:ai_match -> ai_match:run) — otherwise the button here could
    // be enabled while every click 403s server-side.
    dependencies: {
      'internal_db:assessment': ['assessments:invite'],
      'internal_db:delete': ['internal_db:read'],
      'internal_db:ai_match': ['ai_match:run'],
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
      // The permission the actual invite/bulk-invite backend endpoints check
      // (app/routers/assessments.py). Previously missing from this catalog —
      // there was no checkbox for it anywhere in the Roles & Permissions UI,
      // so admins could not grant or revoke it, and 'jd:invite' /
      // 'scoring:invite' etc. above were pointed at 'assessments:share' (a
      // different, real permission that only gates the "Share" link action)
      // instead.
      { code: 'assessments:invite', label: 'Invite Candidates' },
      { code: 'assessments:share', label: 'Share' },
      { code: 'assessments:download_report', label: 'Download Report' },
      { code: 'assessments:batch_download', label: 'Batch Download' },
      { code: 'assessments:add_question', label: 'Add Question' },
      { code: 'assessments:edit_question', label: 'Edit Question' },
      { code: 'assessments:delete_question', label: 'Delete Question' },
    ],
    // Rule: Create and Edit both require Job Description access — every
    // assessment is tied to a JD (app/services/permission_dependencies.py
    // enforces assessments:create -> jd:read and assessments:update ->
    // assessments:read, jd:read server-side; assessments:read is this
    // category's own view code, already auto-enabled whenever any of its
    // actions are). Declared here so disabling a role's Job Description
    // access warns about breaking Assessment creation and editing, not just
    // Resume Scoring.
    dependencies: {
      'assessments:create': ['jd:read'],
      'assessments:update': ['jd:read'],
    },
  },
  {
    id: 'ai_interviews',
    name: 'AI Interview',
    description: 'AI interview management permissions',
    viewCode: 'ai_interview:read',
    actions: [
      { code: 'ai_interview:create', label: 'Create' },
      { code: 'ai_interview:update', label: 'Edit' },
      { code: 'ai_interview:invite', label: 'Invite Candidates' },
      { code: 'ai_interview:publish', label: 'Publish' },
      { code: 'ai_interview:archive', label: 'Archive' },
      { code: 'ai_interview:delete', label: 'Delete' },
    ],
    // Rule: viewing or creating an AI interview requires Job Description
    // access — every AI interview is tied to a JD
    // (app/services/permission_dependencies.py: ai_interview:read and
    // ai_interview:create -> resumes:read, jd:read), matching the same
    // JD-scoping Assessments already declares. 'jd:read' is declared on both
    // the view code and Create individually, since a role can hold View
    // without Create.
    //
    // Rule: every AI interview action requires Resume access
    // (ai_interview:read/create/update/invite/publish/archive/delete all ->
    // resumes:read server-side). 'my_resumes:read' is the real, UI-tracked
    // permission that satisfies the legacy 'resumes:read' alias (see
    // app/services/permission_dependencies.py's _RESUME_READ_SATISFIED_BY;
    // 'internal_db:read' would satisfy it too, but a single canonical choice
    // is used here since this dependency system has no OR-group support —
    // a role granted only Shared Database access will see this warning name
    // My Resumes even though the backend would also accept it via Shared
    // Database).
    //
    // 'ai_interview:share' has no checkbox here and is never actually
    // enforced by any endpoint (confirmed: no require_rbac_permission call
    // references it) — it's vestigial in the backend's dependency dict, so
    // there is nothing to declare a dependency against.
    //
    // Previously only ai_interview:create -> jd:read was declared; the rest
    // of this module's real dependencies were undeclared, so disabling Job
    // Description or My Resumes gave no warning that it breaks AI Interview
    // viewing, editing, inviting, publishing, archiving, or deleting.
    dependencies: {
      'ai_interview:read': ['jd:read', 'my_resumes:read'],
      'ai_interview:create': ['jd:read', 'my_resumes:read'],
      'ai_interview:update': ['my_resumes:read'],
      'ai_interview:invite': ['my_resumes:read'],
      'ai_interview:publish': ['my_resumes:read'],
      'ai_interview:archive': ['my_resumes:read'],
      'ai_interview:delete': ['my_resumes:read'],
    },
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
    // Rule: HR Question Bank requires Assessment view access
    // (app/services/permission_dependencies.py: hr_question_bank:read ->
    // assessments:read) — the bank's questions are reused when building
    // assessments, so viewing it without Assessment access makes no sense.
    // Keyed on this category's own view code (dependency lookups work the
    // same for a view code as for any action code), since the requirement
    // applies the moment the module is viewed at all, not just on a
    // particular action within it. Previously undeclared, so disabling
    // Assessment view access gave no warning that it breaks HR Question
    // Bank too.
    dependencies: {
      'hr_question_bank:read': ['assessments:read'],
    },
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
          { code: 'billing:upgrade', label: 'Upgrade Plan' },
        ],
      },
      {
        name: 'Usage & Quotas',
        viewCode: 'usage:read',
        actions: [
          { code: 'usage:upgrade', label: 'Upgrade Plan' },
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
    // Rule: every sensitive user-management action requires View
    // (app/services/permission_dependencies.py: users:create/update/delete/
    // disable/reset_password/force_password_change/assign_role all ->
    // users:read). Enabling any of these already auto-enables View via this
    // category's own view-code mechanism; this closes the reverse gap —
    // unchecking "View" on its own while one of these stayed checked.
    dependencies: {
      'users:create': ['users:read'],
      'users:update': ['users:read'],
      'users:delete': ['users:read'],
      'users:disable': ['users:read'],
      'users:assign_role': ['users:read'],
      'users:reset_password': ['users:read'],
      'users:force_password_change': ['users:read'],
    },
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

/**
 * Granted to EVERY user regardless of role — the backend re-adds them on every
 * save (app/config/mandatory_permissions.py BASELINE_PERMISSIONS) and the Edit
 * User popup shows them as "(always on)". Role popups include them so a role's
 * count matches what its users actually get (Standard User = 2, not 0).
 */
export const ALWAYS_ON_PERMISSION_CODES = ['analytics:read', 'support:read'] as const;

export interface PermissionDisplayItem {
  code: string;
  label: string;
}

export interface PermissionDisplaySection {
  id: string;
  name: string;
  items: PermissionDisplayItem[];
}

const subActionLabel = (label: string, subName: string): string =>
  label === 'View' ? `View ${subName}` : `${label} (${subName})`;

/**
 * Every permission the UI exposes, grouped and labelled exactly as the Edit User
 * popup shows them (section name, "View <section>" for the view code, action labels).
 */
export const getPermissionDisplaySections = (): PermissionDisplaySection[] =>
  CUSTOM_PERMISSION_CATEGORIES.map((category) => {
    const items: PermissionDisplayItem[] = [];
    if (category.viewCode) items.push({ code: category.viewCode, label: `View ${category.name}` });
    category.actions?.forEach((action) => items.push({ code: action.code, label: action.label }));
    category.subCategories?.forEach((sub) => {
      if (sub.viewCode) items.push({ code: sub.viewCode, label: `View ${sub.name}` });
      sub.actions.forEach((action) => items.push({ code: action.code, label: subActionLabel(action.label, sub.name) }));
    });
    return { id: category.id, name: category.name, items };
  });
