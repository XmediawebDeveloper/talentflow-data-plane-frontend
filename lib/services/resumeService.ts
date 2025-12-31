/**
 * Resume Service
 */

import api, { handleApiError } from './api';

export interface Resume {
  id: string;
  tenant_id: string;
  uploaded_by: string;
  uploaded_by_name?: string;
  folder_id?: string;
  folder_name?: string;
  candidate_name?: string;
  email?: string;
  phone?: string;
  current_title?: string;
  current_company?: string;
  previous_company?: string;
  skills: string[];
  technical_skills?: string[];
  soft_skills?: string[];
  education: any[];
  experience: any[];
  experience_years?: number;
  certifications: any[];
  languages?: any[];
  location?: string;
  notice_period?: string;
  professional_summary?: string;
  file_name: string;
  file_size_kb?: number;
  file_type?: string;
  source: 'manual_upload' | 'bulk_upload' | 'api_import' | 'ai_match';
  version: number;
  version_count: number;  // Total versions for this candidate
  is_duplicate: boolean;
  created_at: string;
  updated_at: string;
}

export interface ResumeListResponse {
  items: Resume[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface UploadItemStatus {
  file_name: string;
  status: 'pending' | 'processing' | 'completed' | 'duplicated' | 'versioned' | 'error';
  candidate_name?: string;
  error_message?: string;
  existing_location?: string;
  version_info?: string;
  resume_id?: string;
}

export interface UploadBatchResponse {
  id: string;
  batch_name?: string;
  total_files: number;
  completed: number;
  pending: number;
  duplicates: number;
  versions: number;
  errors: number;
  status: string;
  items: UploadItemStatus[];
  created_at: string;
  completed_at?: string;
}

export interface Folder {
  id: string;
  name: string;
  parent_id?: string;
  resume_count: number;
  children: Folder[];
  created_at: string;
}

export const resumeService = {
  /**
   * List resumes with filters
   */
  async list(params?: {
    source?: 'my-resumes' | 'internal-db';
    folder_id?: string;
    search?: string;
    skills?: string;
    experience_min?: number;
    experience_max?: number;
    location?: string;
    page?: number;
    page_size?: number;
  }): Promise<ResumeListResponse> {
    try {
      const response = await api.get<ResumeListResponse>('/resumes', { params });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get single resume by ID
   */
  async get(id: string): Promise<Resume> {
    try {
      const response = await api.get<Resume>(`/resumes/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Upload single resume
   */
  async upload(file: File, folderId?: string): Promise<Resume> {
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (folderId) {
        formData.append('folder_id', folderId);
      }

      const response = await api.post<Resume>('/resumes/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Upload multiple resumes
   */
  async uploadBulk(files: File[], folderId?: string): Promise<UploadBatchResponse> {
    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });
      if (folderId) {
        formData.append('folder_id', folderId);
      }

      const response = await api.post<UploadBatchResponse>('/resumes/upload/bulk', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get upload batch status
   */
  async getBatchStatus(batchId: string): Promise<UploadBatchResponse> {
    try {
      const response = await api.get<UploadBatchResponse>(`/resumes/upload/batch/${batchId}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Resolve duplicate
   */
  async resolveDuplicate(batchItemId: string, action: 'discard' | 'overwrite' | 'version') {
    try {
      const response = await api.post('/resumes/upload/resolve-duplicate', {
        batch_item_id: batchItemId,
        action,
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Move resume to folder
   */
  async move(resumeId: string, folderId?: string): Promise<void> {
    try {
      await api.put(`/resumes/${resumeId}/move`, { folder_id: folderId });
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Delete resume
   */
  async delete(id: string): Promise<void> {
    try {
      await api.delete(`/resumes/${id}`);
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get resume versions
   */
  async getVersions(resumeId: string) {
    try {
      const response = await api.get(`/resumes/${resumeId}/versions`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Download resume
   */
  async download(resumeId: string): Promise<Blob> {
    try {
      const response = await api.get(`/resumes/${resumeId}/download`, {
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },
};

export const folderService = {
  /**
   * List all folders
   */
  async list(): Promise<Folder[]> {
    try {
      const response = await api.get<Folder[]>('/folders');
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get single folder
   */
  async get(id: string): Promise<Folder> {
    try {
      const response = await api.get<Folder>(`/folders/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Create folder
   */
  async create(name: string, parentId?: string): Promise<Folder> {
    try {
      const response = await api.post<Folder>('/folders', { name, parent_id: parentId });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Update folder
   */
  async update(id: string, name: string, parentId?: string): Promise<Folder> {
    try {
      const response = await api.put<Folder>(`/folders/${id}`, { name, parent_id: parentId });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Delete folder
   */
  async delete(id: string, moveResumesTo?: string): Promise<void> {
    try {
      await api.delete(`/folders/${id}`, { params: { move_resumes_to: moveResumesTo } });
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },
};

export default resumeService;
