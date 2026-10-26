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
 *   Invite Candidates     a module's own invite (Assessment, AI Interview)
 *   Invite to Assessment / Invite to AI Interview
 *                         inviting from another module (Job Description, Resume
 *                         Scoring, My Resumes, Shared Database) — one per target
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
      { code: 'jd:invite_assessment', label: 'Invite to Assessment' },
      { code: 'jd:invite_ai_interview', label: 'Invite to AI Interview' },
      { code: 'jd:add_applicants', label: 'Score Resume' },
      { code: 'jd:ai_match', label: 'Run AI Talent Match' },
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
      { code: 'scoring:invite_assessment', label: 'Invite to Assessment' },
      { code: 'scoring:invite_ai_interview', label: 'Invite to AI Interview' },
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
      // Score Resume needs a job to score against and resumes to read (the
      // server checks jd:read + resumes:read). Where else scoring can be started
      // from (JD, My Resumes, Shared Database, AI Talent Match) is an ENTRY POINT
      // of this permission — see ENTRY_POINT_GROUPS, not a dependency.
      'scoring:score': ['jd:read', 'my_resumes:read'],
      // 2026-10-20: the whole module needs JD access — turning View Job
      // Description off turns Resume Scoring off (like Assessment / AI Interview).
      'scoring:read': ['jd:read'],
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
      { code: 'ai_match:invite_assessment', label: 'Invite to Assessment' },
      { code: 'ai_match:invite_ai_interview', label: 'Invite to AI Interview' },
    ],
    // Rule: Run AI Match requires both Job Description and Shared Database
    // access (app/services/permission_dependencies.py: ai_match:run ->
    // internal_db:read, jd:read) — matching a candidate against a JD needs
    // both sides of the match. Previously undeclared here, so disabling Job
    // Description or Shared Database gave no warning that it breaks AI
    // Talent Match too.
    dependencies: {
      'ai_match:run': ['internal_db:read', 'jd:read'],
      // 2026-10-20: the whole module needs JD access (see scoring:read).
      'ai_match:read': ['jd:read'],
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
      { code: 'my_resumes:invite_ai_interview', label: 'Invite to AI Interview' },
      { code: 'my_resumes:ai_match', label: 'Run AI Talent Match' },
      { code: 'my_resumes:score', label: 'Score Resume' },
      { code: 'my_resumes:share', label: 'Share Resume' },
    ],
    // Rule: Assessment invite from My Resumes requires Assessment Invite
    // (see jd:invite above for why this points at 'assessments:invite')
    dependencies: {
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
      { code: 'internal_db:invite_ai_interview', label: 'Invite to AI Interview' },
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
      'internal_db:delete': ['internal_db:read'],
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
      // CSV / Excel exports on the Assessments page (lists, results, invitations,
      // activity logs). Enforced server-side; it was a seeded code no role editor
      // could switch, mapped to a legacy flag shared with Internal DB export.
      { code: 'assessments:export', label: 'Export' },
      { code: 'assessments:view_question_bank', label: 'HR Question Bank View' },
      { code: 'assessments:add_question', label: 'HR Question Bank Add' },
      { code: 'assessments:edit_question', label: 'HR Question Bank Edit' },
      { code: 'assessments:delete_question', label: 'HR Question Bank Delete' },
    ],
    // Rule: Create and Edit both require Job Description access — every
    // assessment is tied to a JD (app/services/permission_dependencies.py
    // enforces assessments:create -> jd:read and assessments:update ->
    // assessments:read, jd:read server-side; assessments:read is this
    // category's own view code, already auto-enabled whenever any of its
    // actions are). Declared here so disabling a role's Job Description
    // access warns about breaking Assessment creation and editing, not just
    // Resume Scoring.
    // Add Question requires Edit (app/services/permission_dependencies.py:
    // assessments:add_question -> assessments:update) — adding a question edits
    // the assessment, so ticking it without Edit left a combination the
    // server rejects.
    //
    // Rule (2026-10-20, like AI Interview): viewing Assessments requires Job
    // Description access — turning View Job Description off turns the whole
    // Assessment section off (and HR Question Bank, which needs Assessment View).
    dependencies: {
      'assessments:read': ['jd:read'],
      // Creating picks the HR questions from the bank, so Create needs
      // HR Question Bank View (2026-10-20).
      'assessments:create': ['jd:read', 'assessments:view_question_bank'],
      'assessments:update': ['jd:read'],
      'assessments:add_question': ['assessments:update', 'assessments:view_question_bank'],
      // HR Question Bank Add / Edit / Delete need HR Question Bank View — you
      // can't change questions you can't see.
      'assessments:edit_question': ['assessments:view_question_bank'],
      'assessments:delete_question': ['assessments:view_question_bank'],
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
      // CSV / Excel exports on the AI Interviews page (lists, results,
      // invitations, activity logs) — enforced server-side, audit-logged.
      { code: 'ai_interview:export', label: 'Export' },
      // Candidate evaluation / coverage report PDFs (single, bulk ZIP) —
      // enforced on /reports endpoints, audit-logged per download.
      { code: 'ai_interview:download_report', label: 'Download Report' },
      // HR questions picked from / added to the HR Question Bank inside the
      // AI Interview builder — same three as Assessment's.
      { code: 'ai_interview:view_question_bank', label: 'HR Question Bank View' },
      { code: 'ai_interview:add_question', label: 'HR Question Bank Add' },
      { code: 'ai_interview:edit_question', label: 'HR Question Bank Edit' },
      { code: 'ai_interview:delete_question', label: 'HR Question Bank Delete' },
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
      // Creating picks the HR questions from the bank (2026-10-20).
      'ai_interview:create': ['jd:read', 'my_resumes:read', 'ai_interview:view_question_bank'],
      'ai_interview:update': ['my_resumes:read'],
      'ai_interview:invite': ['my_resumes:read'],
      'ai_interview:publish': ['my_resumes:read'],
      'ai_interview:archive': ['my_resumes:read'],
      'ai_interview:delete': ['my_resumes:read'],
      'ai_interview:export': ['my_resumes:read'],
      'ai_interview:download_report': ['my_resumes:read'],
      // Adding a question edits the interview (mirrors assessments:add_question).
      'ai_interview:add_question': ['ai_interview:update', 'ai_interview:view_question_bank'],
      'ai_interview:edit_question': ['ai_interview:view_question_bank'],
      'ai_interview:delete_question': ['ai_interview:view_question_bank'],
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
    // No longer needs View Assessment (2026-10-20): the bank is shared by
    // Assessment AND AI Interview, and each of those has its own "HR Question
    // Bank View/Add/Edit/Delete". Turning Assessment off must not take the
    // shared bank (and AI Interview's use of it) with it.
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

/** Screen label for any catalogue code, with its section for actions:
 *  "View Job Description", "Score Resume (Resume Scoring)", "Manage (General Settings)". */
export const getPermissionLabel = (code: string): string => {
  for (const cat of CUSTOM_PERMISSION_CATEGORIES) {
    if (cat.viewCode === code) return `View ${cat.name}`;
    const action = cat.actions?.find((a) => a.code === code);
    if (action) return `${action.label} (${cat.name})`;
    for (const sub of cat.subCategories || []) {
      if (sub.viewCode === code) return `View ${sub.name}`;
      const subAction = sub.actions.find((a) => a.code === code);
      if (subAction) return subAction.label === 'View' ? `View ${sub.name}` : `${subAction.label} (${sub.name})`;
    }
  }
  return code;
};

/**
 * The permission dependency rules exactly as the Edit User / Edit Role screens
 * apply them (each category's `dependencies` above, which mirror the server's
 * app/services/permission_dependencies.py). The Feature Dependency Matrix popup
 * renders THIS, so it always shows the rules that are really enforced. Implicit
 * "every action needs its section's View" rules are not listed.
 */
export const getCatalogDependencyMatrix = () => {
  const dependencies: Record<string, string[]> = {};
  CUSTOM_PERMISSION_CATEGORIES.forEach((cat) => {
    Object.entries(cat.dependencies || {}).forEach(([code, deps]) => {
      dependencies[code] = Array.from(new Set([...(dependencies[code] || []), ...deps]));
    });
  });
  const reverse_dependencies: Record<string, string[]> = {};
  Object.entries(dependencies).forEach(([code, deps]) =>
    deps.forEach((d) => (reverse_dependencies[d] ||= []).push(code)),
  );
  const features = Array.from(new Set([...Object.keys(dependencies), ...Object.keys(reverse_dependencies)]));
  const feature_names = Object.fromEntries(features.map((c) => [c, getPermissionLabel(c)]));
  return { features, dependencies, reverse_dependencies, feature_names };
};


/**
 * MAIN permission → its ENTRY POINTS in other sections (client rule 2026-10-17).
 * An entry point lets someone start the main action from another section (e.g.
 * Score Resume from the Job Description page). Rules everywhere permissions are
 * edited:
 *   - an entry point can only be on while its main is on (greyed out otherwise);
 *     turning an entry point off never touches the main;
 *   - turning the main ON offers to turn its entry points on too;
 *   - turning the main OFF turns its entry points off.
 * These are NOT "needs" dependencies, so they are not in `dependencies` above and
 * never grant the main permission to anyone.
 */
export const ENTRY_POINT_GROUPS: { main: string; entries: string[] }[] = [
  { main: 'scoring:score', entries: ['jd:add_applicants', 'my_resumes:score', 'internal_db:score', 'ai_match:score'] },
  { main: 'ai_match:run', entries: ['jd:ai_match', 'my_resumes:ai_match', 'internal_db:ai_match'] },
  {
    main: 'assessments:invite',
    entries: ['jd:invite_assessment', 'scoring:invite_assessment', 'my_resumes:assessment', 'internal_db:assessment', 'ai_match:invite_assessment'],
  },
  {
    main: 'ai_interview:invite',
    entries: ['jd:invite_ai_interview', 'scoring:invite_ai_interview', 'my_resumes:invite_ai_interview', 'internal_db:invite_ai_interview', 'ai_match:invite_ai_interview'],
  },
];

/** Entry points of a main permission ([] if it has none). */
export const getEntryPoints = (main: string): string[] =>
  ENTRY_POINT_GROUPS.find((g) => g.main === main)?.entries ?? [];

/** The main permission an entry point belongs to, or null. */
export const getMainPermission = (entry: string): string | null =>
  ENTRY_POINT_GROUPS.find((g) => g.entries.includes(entry))?.main ?? null;

/** A code's tile label and the section it lives in — e.g. { label: 'Score Resume',
 *  section: 'Job Description' }, { label: 'View My Resumes', section: 'My Resumes' }. */
export const getPermissionParts = (code: string): { label: string; section: string } => {
  for (const cat of CUSTOM_PERMISSION_CATEGORIES) {
    if (cat.viewCode === code) return { label: `View ${cat.name}`, section: cat.name };
    const action = cat.actions?.find((a) => a.code === code);
    if (action) return { label: action.label, section: cat.name };
    for (const sub of cat.subCategories || []) {
      if (sub.viewCode === code) return { label: `View ${sub.name}`, section: cat.name };
      const subAction = sub.actions.find((a) => a.code === code);
      if (subAction) return { label: subAction.label === 'View' ? `View ${sub.name}` : subAction.label, section: sub.name };
    }
  }
  return { label: code, section: '' };
};
