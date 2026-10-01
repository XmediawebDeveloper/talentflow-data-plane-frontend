// Resume / ResumeVersion are owned by the API layer — the service interface
// is the single source of truth, matching backend snake_case payloads.
// Re-exported here so existing import paths keep working.
export type { Resume, ResumeVersion } from '@/lib/services/resumeService';

// Education / experience / certification / language detail shapes returned by
// the candidate detail endpoint. Backend uses snake_case for keys.
export interface EducationDetail {
  degree: string;
  school: string;
  location?: string;
  year?: string;
  gpa?: string;
  honors?: string;
}

export interface ExperienceDetail {
  title: string;
  company: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  duration?: string;
  description?: string;
  achievements?: string[];
}

export interface CertificationDetail {
  name: string;
  issuer?: string;
  date?: string;
  credential_id?: string;
}

export interface LanguageDetail {
  name: string;
  proficiency: string;
}

export interface Folder {
  id: string;
  name: string;
  count: number;
  parentId?: string;
  children?: Folder[];
}

export interface JobSnapshot {
  version: number;
  publishedAt: string;
  publishedBy: string;
  snapshotData: {
    title: string;
    location: string;
    department?: string;
    experience?: string;
    description?: string;
    skills?: string[];
    requiredMatch: number;
    assessmentGuidance?: string;
    employmentType?: string;
  };
}

export interface Job {
  id: string;
  job_id?: string;  // Human-readable ID like JD-001
  title: string;
  status: 'Published' | 'Draft' | 'Closed' | 'Archived' | 'Disabled';
  location: string;
  daysActive: number;
  requiredMatch: number;
  department?: string;
  industry_type?: string;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string;
  compensation_type?: string; // hourly, daily, monthly, yearly
  experience?: string;
  experience_min?: number; // Minimum years of experience
  experience_max?: number; // Maximum years of experience
  applicants?: number;
  /** Candidates who completed an assessment / AI interview for this job —
   *  set only by the Job Openings list (see useJobCandidateCounts). */
  assessed?: number;
  interviewed?: number;
  description?: string;
  /**
   * The JD's skills as ONE list — historically `must_have_skills`, which is
   * what every list and card that shows "skills" on a job has always read.
   * Kept as it is; the two fields below are the same data unflattened, added
   * for the surfaces that need the distinction rather than replacing this.
   */
  skills?: string[];
  /** The JD's must-have / nice-to-have skills, kept apart as the JD states
   *  them. `skills` above collapses to must-have only, so a surface that has
   *  to show the two groups separately reads these. */
  must_have_skills?: string[];
  nice_to_have_skills?: string[];
  postedDate?: string;
  postedBy?: string;
  internalRecruiterComments?: string[];
  assessmentGuidance?: string;
  /** JD22 - recruiter free text about the job (shift timings, WFO/WFH, anything the
   *  extraction missed). Shown to candidates and in every JD view; deliberately not an
   *  input to resume scoring, assessment generation or the AI interview. */
  additionalDetails?: string;
  employmentType?: string;
  workMode?: string; // Remote type: onsite, hybrid, remote
  education?: string; // Education requirement: bachelors, masters, doctorate, etc.
  experience_level?: string; // Experience level: entry, junior, mid, senior, architect, management
  currentVersion?: number;   // republish counter on this row (drives the "Republished" label)
  versionNumber?: number;    // lineage version for the v1/v2 badge (same JD-ID across versions)
  versionHistory?: JobSnapshot[];
  assignedTo?: string; // Team member ID
  created_at?: string; // ISO timestamp for sorting
  updated_at?: string; // ISO timestamp for last update
  creation_method?: 'manual' | 'ai_generated'; // JD creation method
  creation_stage?: string; // Stage where draft JD was left off (create, skills, assessment, review)
  coding_required?: boolean; // Whether JD requires coding assessment
  supported_languages?: string[]; // Programming languages for coding assessment
}