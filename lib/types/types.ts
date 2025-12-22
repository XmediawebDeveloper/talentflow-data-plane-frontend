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
}

export interface Folder {
  id: string;
  name: string;
  count: number;
  parentId?: string;
  children?: Folder[];
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
    employmentType?: 'Full-time' | 'Part-time' | 'Contract' | 'Internship';
}


