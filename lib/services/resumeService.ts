/**
 * Resume Service
 */

import api, { handleApiError, dispatchUnitsConsumed } from './api';

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
  extracted_text?: string;  // Full extracted content from resume
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

export interface ResumeSearchParams {
  source?: 'my-resumes' | 'internal-db';
  folder_id?: string;
  search?: string;
  skills?: string;
  experience_min?: number;
  experience_max?: number;
  location?: string;
  education?: string;
  current_company?: string;
  previous_company?: string;
  notice_period?: string;
  upload_date_from?: string;
  upload_date_to?: string;
  source_type?: string;
  page?: number;
  page_size?: number;
}

export const resumeService = {
  /**
   * List resumes with filters
   */
  async list(params?: ResumeSearchParams): Promise<ResumeListResponse> {
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
   * Consumes 1 Resume Upload Unit
   */
  async upload(file: File, folderId?: string): Promise<Resume> {
    const formData = new FormData();
    formData.append('file', file);
    // Only append folder_id if it's provided and not an empty string
    if (folderId && folderId.trim() !== '') {
      formData.append('folder_id', folderId);
    }

    const response = await api.post<Resume>('/resumes/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    // Dispatch event to refresh header quota display
    dispatchUnitsConsumed();
    return response.data;
  },

  /**
   * Upload multiple resumes
   * Consumes 1 Resume Upload Unit per file
   */
  async uploadBulk(files: File[], folderId?: string): Promise<UploadBatchResponse> {
    try {
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });
      // Only append folder_id if it's provided and not an empty string
      if (folderId && folderId.trim() !== '') {
        formData.append('folder_id', folderId);
      }

      const response = await api.post<UploadBatchResponse>('/resumes/upload/bulk', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      // Dispatch event to refresh header quota display
      dispatchUnitsConsumed();
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
   * List all upload batches
   */
  async listUploadBatches(limit: number = 20, onlyProcessing: boolean = false): Promise<any> {
    try {
      const response = await api.get(`/resumes/upload/batches?limit=${limit}&only_processing=${onlyProcessing}`);
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Delete all completed upload batches (where pending = 0)
   */
  async deleteCompletedBatches(): Promise<any> {
    try {
      const response = await api.delete('/resumes/upload/batches/completed');
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Resolve duplicate (for batch uploads)
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
   * Resolve duplicate and upload (for single file uploads)
   */
  async resolveDuplicateAndUpload(
    file: File,
    existingResumeId: string,
    action: 'discard' | 'overwrite' | 'version',
    folderId?: string
  ): Promise<Resume> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('existing_resume_id', existingResumeId);
    formData.append('action', action);
    // Only append folder_id if it's provided and not an empty string
    if (folderId && folderId.trim() !== '') {
      formData.append('folder_id', folderId);
    }

    const response = await api.post<Resume>('/resumes/upload/resolve-duplicate-upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
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

  /**
   * Preview resume (converts DOCX to PDF for viewing)
   */
  async preview(resumeId: string): Promise<Blob> {
    try {
      const response = await api.get(`/resumes/${resumeId}/preview`, {
        responseType: 'blob',
      });
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Download a specific version of a resume
   */
  async downloadVersion(resumeId: string, versionId: string): Promise<Blob> {
    try {
      const response = await api.get(`/resumes/${resumeId}/versions/${versionId}/download`, {
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
      console.log('[folderService] Creating folder:', { name, parent_id: parentId });
      const response = await api.post<Folder>('/folders', { name, parent_id: parentId });
      console.log('[folderService] Folder created:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('[folderService] Error creating folder:', error?.response?.data || error);
      throw error; // Re-throw original error to preserve response data
    }
  },

  /**
   * Update folder
   */
  async update(id: string, data: { name?: string; parent_id?: string }): Promise<Folder> {
    try {
      const response = await api.put<Folder>(`/folders/${id}`, data);
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
