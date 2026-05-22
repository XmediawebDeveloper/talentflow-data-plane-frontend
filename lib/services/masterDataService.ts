/**
 * Master Data Service
 * API client for experience levels, education levels, and industry types
 */

import api from './api';

// Types
export interface ExperienceLevel {
  id: number;
  code: string;
  label: string;
  min_years: number | null;
  max_years: number | null;
  sort_order: number;
  is_active: boolean;
  // Optional because static fallback constants (used before master data loads)
  // do not carry persistence timestamps.
  created_at?: string;
  updated_at?: string;
}

export interface EducationLevel {
  id: number;
  code: string;
  label: string;
  level: number | null;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface IndustryType {
  id: number;
  code: string;
  label: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MasterDataResponse {
  experience_levels: ExperienceLevel[];
  education_levels: EducationLevel[];
  industry_types: IndustryType[];
}

export interface ExperienceLevelCreate {
  code: string;
  label: string;
  min_years?: number;
  max_years?: number;
  sort_order?: number;
}

export interface EducationLevelCreate {
  code: string;
  label: string;
  level?: number;
  sort_order?: number;
}

export interface IndustryTypeCreate {
  code: string;
  label: string;
  description?: string;
  sort_order?: number;
}

export interface ListResponse<T> {
  items: T[];
  total: number;
}

// Master Data Service
export const masterDataService = {
  // Get all master data (for dropdowns)
  async getAll(): Promise<MasterDataResponse> {
    const response = await api.get<MasterDataResponse>('/master-data/all');
    return response.data;
  },

  // Experience Levels
  async listExperienceLevels(includeInactive = false): Promise<ListResponse<ExperienceLevel>> {
    const response = await api.get<ListResponse<ExperienceLevel>>('/master-data/experience-levels', {
      params: { include_inactive: includeInactive },
    });
    return response.data;
  },

  async createExperienceLevel(data: ExperienceLevelCreate): Promise<ExperienceLevel> {
    const response = await api.post<ExperienceLevel>('/master-data/experience-levels', data);
    return response.data;
  },

  async updateExperienceLevel(id: number, data: Partial<ExperienceLevelCreate>): Promise<ExperienceLevel> {
    const response = await api.put<ExperienceLevel>(`/master-data/experience-levels/${id}`, data);
    return response.data;
  },

  async deleteExperienceLevel(id: number): Promise<void> {
    await api.delete(`/master-data/experience-levels/${id}`);
  },

  // Education Levels
  async listEducationLevels(includeInactive = false): Promise<ListResponse<EducationLevel>> {
    const response = await api.get<ListResponse<EducationLevel>>('/master-data/education-levels', {
      params: { include_inactive: includeInactive },
    });
    return response.data;
  },

  async createEducationLevel(data: EducationLevelCreate): Promise<EducationLevel> {
    const response = await api.post<EducationLevel>('/master-data/education-levels', data);
    return response.data;
  },

  async updateEducationLevel(id: number, data: Partial<EducationLevelCreate>): Promise<EducationLevel> {
    const response = await api.put<EducationLevel>(`/master-data/education-levels/${id}`, data);
    return response.data;
  },

  async deleteEducationLevel(id: number): Promise<void> {
    await api.delete(`/master-data/education-levels/${id}`);
  },

  // Industry Types
  async listIndustryTypes(includeInactive = false): Promise<ListResponse<IndustryType>> {
    const response = await api.get<ListResponse<IndustryType>>('/master-data/industry-types', {
      params: { include_inactive: includeInactive },
    });
    return response.data;
  },

  async createIndustryType(data: IndustryTypeCreate): Promise<IndustryType> {
    const response = await api.post<IndustryType>('/master-data/industry-types', data);
    return response.data;
  },

  async updateIndustryType(id: number, data: Partial<IndustryTypeCreate>): Promise<IndustryType> {
    const response = await api.put<IndustryType>(`/master-data/industry-types/${id}`, data);
    return response.data;
  },

  async deleteIndustryType(id: number): Promise<void> {
    await api.delete(`/master-data/industry-types/${id}`);
  },
};
