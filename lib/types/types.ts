export interface Resume {
  id: string;
  name: string;
  email: string;
  phone: string;
  title: string;
  skills: string[];
  experience: string;
  source: 'Manual' | 'TalentFlow';
  uploadDate: string;
  attachments: number;
  uploadedBy: string;
  folderId: string;
  education?: string;
  location?: string;
  currentCompany?: string;
  previousCompany?: string;
  noticePeriod?: string;
  lastUpdated?: string;
  versions?: ResumeVersion[];
  versionCount?: number; // Total number of versions
  assignedTo?: string; // Team member ID
  fileName?: string; // Original file name
  fileType?: string; // File type (pdf, doc, docx)
  fileSizeKb?: number; // File size in KB

  // Extended fields for detailed view
  professionalSummary?: string;
  technicalSkills?: string[];
  softSkills?: string[];
  educationDetails?: EducationDetail[];
  experienceDetails?: ExperienceDetail[];
  certifications?: CertificationDetail[];
  languages?: LanguageDetail[];
  projects?: string[];
  awards?: string[];
  publications?: string[];
  references?: string[];
}

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
  startDate?: string;
  endDate?: string;
  duration?: string;
  description?: string;
  achievements?: string[];
}

export interface CertificationDetail {
  name: string;
  issuer?: string;
  date?: string;
  credentialId?: string;
}

export interface LanguageDetail {
  name: string;
  proficiency: string;
}

export interface ResumeVersion {
  id: string;
  name: string;
  uploadDate: string;
  size: string;
  uploadedBy: string;
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
  experience?: string;
  applicants?: number;
  description?: string;
  skills?: string[];
  postedDate?: string;
  postedBy?: string;
  internalRecruiterComments?: string[];
  assessmentGuidance?: string;
  employmentType?: string;
  currentVersion?: number;
  versionHistory?: JobSnapshot[];
  assignedTo?: string; // Team member ID
  created_at?: string; // ISO timestamp for sorting
  creation_method?: 'manual' | 'ai_generated'; // JD creation method
}