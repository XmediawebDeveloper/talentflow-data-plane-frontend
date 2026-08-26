/**
 * Shared API → table-row mappers for resume lists.
 *
 * `ResumeTable` and `FolderTree` read the legacy camelCase shape (`name`,
 * `title`, `uploadDate`, `folderId`, `isArchived`, folder `count`/`parentId`),
 * while the API returns snake_case. These two functions are the single place
 * that translation lives, so every surface that renders `ResumeTable` — the My
 * Resumes page and the job-details "Select Applicants to Score" popup — shows
 * identical columns from identical data. Changing a column's source here
 * updates both rather than letting a per-page copy drift.
 */

import type {
  Resume as ApiResume,
  Folder as ApiFolder,
} from '@/lib/services/resumeService';
import type { Resume, Folder as FolderType } from '@/lib/types/types';

/**
 * One API resume in the shape `ResumeTable`'s columns read.
 *
 * The API record is spread in first so the record keeps its snake_case fields
 * (several are required by the `Resume` type, and callers still read them);
 * the keys below then layer the display-ready camelCase aliases on top.
 */
export const convertApiResumeToRow = (r: ApiResume): Resume => ({
  ...r,
  id: r.id,
  name: r.candidate_name || r.file_name?.replace(/\.[^/.]+$/, '') || 'Unknown',
  email: r.email || 'No email',
  phone: r.phone || 'No phone',
  title: r.current_title || 'N/A',
  experience: r.experience_years ? `${r.experience_years} years` : 'N/A',
  education: (r.education as any)?.[0]?.degree || 'N/A',
  location: r.location || 'N/A',
  skills: r.skills || [],
  source: (r.source === 'ai_match' ? 'TalentFlow' : 'Manual') as 'Manual' | 'TalentFlow',
  folderId: r.folder_id || '',
  uploadDate: r.created_at,
  attachments: r.version_count || r.version || 1,
  uploadedBy: r.uploaded_by_name || 'Unknown',
  currentCompany: r.current_company,
  previousCompany: r.previous_company,
  noticePeriod: r.notice_period,
  lastUpdated: r.updated_at,
  // Extended fields for detailed view
  professionalSummary: r.professional_summary,
  technicalSkills: r.technical_skills,
  softSkills: r.soft_skills,
  educationDetails: (r.education as any)?.map((edu: any) => ({
    degree: edu.degree || '',
    school: edu.school || edu.institution || '',
    location: edu.location || '',
    year: edu.year || edu.graduation_year || '',
    gpa: edu.gpa || '',
    honors: edu.honors || '',
  })),
  experienceDetails: (r.experience as any)?.map((exp: any) => ({
    title: exp.title || exp.position || '',
    company: exp.company || '',
    location: exp.location || '',
    startDate: exp.start_date || '',
    endDate: exp.end_date || 'Present',
    duration: exp.duration || '',
    description: exp.description || '',
    achievements: exp.achievements || exp.responsibilities || [],
  })),
  certifications: r.certifications?.map((cert: any) => ({
    name: cert.name || cert.title || '',
    issuer: cert.issuer || cert.organization || '',
    date: cert.date || cert.issued_date || '',
    credentialId: cert.credential_id || cert.credentialId || '',
  })),
  languages: r.languages?.map((lang: any) => ({
    name: typeof lang === 'string' ? lang : (lang.name || lang.language || ''),
    proficiency: typeof lang === 'string' ? 'Fluent' : (lang.proficiency || lang.level || 'Fluent'),
  })),
  fileName: r.file_name, // Original file name with extension
  fileType: r.file_type, // File type (pdf, doc, docx)
  // Version info
  version: r.version || 1,
  versionCount: r.version_count || 1,
  // Archive status
  isArchived: r.is_archived || false,
  archivedAt: r.archived_at,
});

/** One API folder (and its subtree) in the shape the folder UI reads. */
export const convertApiFolderToTree = (f: ApiFolder): FolderType => ({
  id: f.id,
  name: f.name,
  count: f.resume_count || 0,
  parentId: f.parent_id,
  children: f.children?.map(convertApiFolderToTree),
});
