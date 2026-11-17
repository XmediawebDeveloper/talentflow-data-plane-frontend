import type { PublishedJD } from '@/lib/services/aiInterviewService';
import type { Job } from '@/lib/types/types';

/**
 * A published JD in the shape the Job Openings summary reads — the same row
 * the Assessments "Select Job Description" picker draws.
 *
 * Shared rather than copied per page: the AI Interview flow shows this header
 * on the JD picker AND on Configure, and two mappings would be two answers to
 * "which version is this?" on consecutive screens of one wizard.
 */
export const publishedJdToJob = (jd: PublishedJD): Job => ({
  id: jd.id,
  job_id: jd.job_id,
  title: jd.title,
  status: 'Published',
  location: jd.location || '',
  daysActive: 0,
  requiredMatch: 0,
  department: jd.department,
  industry_type: jd.industry_type,
  experience: jd.experience_min != null
    ? `${jd.experience_min}${jd.experience_max ? `-${jd.experience_max}` : '+'} years`
    : undefined,
  experience_min: jd.experience_min,
  experience_max: jd.experience_max,
  skills: jd.must_have_skills,
  must_have_skills: jd.must_have_skills,
  nice_to_have_skills: jd.nice_to_have_skills,
  postedDate: jd.published_at || jd.created_at,
  postedBy: jd.created_by_name,
  employmentType: jd.employment_type,
  currentVersion: jd.current_version,
  versionNumber: jd.current_version ?? 1,
  created_at: jd.created_at,
});
