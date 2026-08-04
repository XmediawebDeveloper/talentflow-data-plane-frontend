import { Resume } from '@/lib/types/types';

/**
 * Map a raw resume record from the API (snake_case) to the camelCase `Resume`
 * shape the UI components expect.
 *
 * `resumeService.get()` is typed as `Resume` but actually returns the API
 * record, so every caller must convert before handing it to a view component —
 * `ResumeDetailView` reads `resume.name`, which is `candidate_name` on the wire.
 */
// NOTE: `Resume` is re-exported from resumeService, i.e. the snake_case API
// record — while every view component reads the camelCase fields produced here.
// The cast reconciles the two without changing what callers receive.
export const convertApiResume = (r: any, versionsData: any[] = []): Resume => (({
  id: r.id,
  name: r.candidate_name || r.file_name?.replace(/\.[^/.]+$/, '') || 'Unknown',
  email: r.email || 'No email',
  phone: r.phone || 'No phone',
  title: r.current_title || 'N/A',
  experience: r.experience_years ? `${r.experience_years} years` : 'N/A',
  education: r.education?.[0]?.degree || 'N/A',
  location: r.location || 'N/A',
  skills: r.skills || [],
  source: (r.source === 'ai_match' ? 'TalentFlow' : 'Manual') as 'Manual' | 'TalentFlow',
  folderId: r.folder_id || '',
  uploadDate: r.created_at,
  attachments: r.version_count || versionsData.length || 1,
  uploadedBy: r.uploaded_by_name || 'Unknown',
  fileName: r.file_name,
  fileType: r.file_type,
  fileSizeKb: r.file_size_kb || undefined,
  currentCompany: r.current_company,
  previousCompany: r.previous_company,
  noticePeriod: r.notice_period,
  lastUpdated: r.updated_at,
  professionalSummary: r.professional_summary,
  technicalSkills: r.technical_skills,
  softSkills: r.soft_skills,
  educationDetails: r.education?.map((edu: any) => ({
    degree: edu.degree || '',
    field: edu.field || '',
    school: edu.school || edu.institution || '',
    location: edu.location || '',
    year: edu.year || edu.graduation_year || '',
    gpa: edu.gpa || '',
    honors: edu.honors || '',
  })),
  experienceDetails: r.experience?.map((exp: any) => ({
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
  versions: versionsData.map((v: any) => ({
    id: v.id,
    name: v.file_name || v.name,
    uploadDate: v.created_at || v.upload_date,
    size: v.file_size_kb ? `${v.file_size_kb} KB` : 'Unknown',
    uploadedBy: v.uploaded_by_name || 'Unknown',
    version: v.version || 1,
    fileName: v.file_name,
    skills: v.skills || [],
    technicalSkills: v.technical_skills || [],
    experience: v.experience || [],
    education: v.education || [],
    certifications: v.certifications || [],
    currentTitle: v.current_title,
    currentCompany: v.current_company,
    location: v.location,
    professionalSummary: v.professional_summary,
    extractedText: v.extracted_text || '',
  })),
  versionCount: r.version_count || versionsData.length || 1,
  extractedText: r.extracted_text,
  projects: r.projects || [],
  awards: r.awards || [],
  hobbies: r.hobbies || [],
  achievements: r.achievements || [],
  volunteerExperience: r.volunteer_experience || [],
  references: r.references || [],
  linkedinUrl: r.linkedin_url,
  githubUrl: r.github_url,
  portfolioUrl: r.portfolio_url,
  objective: r.objective,
  additionalInfo: r.additional_info,
}) as unknown as Resume);
