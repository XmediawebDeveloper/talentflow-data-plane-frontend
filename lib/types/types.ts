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
  assignedTo?: string; // Team member ID
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
  title: string;
  status: 'Published' | 'Draft' | 'Closed' | 'Archived' | 'Disabled';
  location: string;
  daysActive: number;
  requiredMatch: number;
  department?: string;
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
}