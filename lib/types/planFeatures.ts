// The plan features
export type PlanFeatureKey =
  | 'seats'           // Always included
  | 'resume_upload'   // Resume Storage (RU)
  | 'resume_scoring'  // Resume Scoring (RS)
  | 'assessment'      // Assessment (AS)
  | 'ai_interview'    // AI Interview (AIU)
  | 'api_access'      // API Access
  | 'sso'             // SSO
  | 'priority_support' // Priority Support
  | 'ai_talent_match' // AI Talent Match
  | 'teams';          // Teams

// Mapping: feature -> quota code (for quota-based features)
export const FEATURE_QUOTA_MAP: Partial<Record<PlanFeatureKey, string>> = {
  resume_upload: 'RU',
  resume_scoring: 'RS',
  assessment: 'AS',
  ai_interview: 'AIU',
};

// Metadata for display
export const PLAN_FEATURE_METADATA: Record<PlanFeatureKey, { name: string; description: string; icon: string }> = {
  seats: { name: 'Seats', description: 'User seats management', icon: 'Users' },
  resume_upload: { name: 'Resume Storage', description: 'Upload and manage resumes', icon: 'Upload' },
  resume_scoring: { name: 'Resume Scoring', description: 'AI-powered resume scoring', icon: 'ClipboardList' },
  assessment: { name: 'Assessments', description: 'Create and manage assessments', icon: 'BarChart3' },
  ai_interview: { name: 'AI Interview', description: 'AI-powered interviews', icon: 'Video' },
  api_access: { name: 'API Access', description: 'Platform API access', icon: 'Key' },
  sso: { name: 'SSO', description: 'Single Sign-On integration', icon: 'Shield' },
  priority_support: { name: 'Priority Support', description: 'Priority support access', icon: 'Headphones' },
  ai_talent_match: { name: 'AI Talent Match', description: 'AI-powered candidate matching', icon: 'Sparkles' },
  teams: { name: 'Teams', description: 'Team management and collaboration', icon: 'UserCog' },
};

/** Hover text for anything greyed out because the tenant's plan lacks the
 *  feature — the plan-tier counterpart of RBAC's "You do not have permission
 *  to access this". Plan-gated UI stays VISIBLE but disabled with this
 *  message; it is never hidden (hiding made it flash in, then vanish once
 *  /quota-status resolved). */
export const PLAN_LOCKED_MESSAGE = 'Your current plan does not have access to this feature';
