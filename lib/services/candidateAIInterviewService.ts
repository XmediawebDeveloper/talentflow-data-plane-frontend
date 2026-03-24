/**
 * Candidate AI Interview Service
 * Unauthenticated — uses token-based access for public candidate endpoints.
 */

import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

const candidateApi = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
});

export interface CandidateInterviewInfo {
  id: string;
  candidate_name: string;
  candidate_email: string;
  position: string;
  interview_type: string;
  duration_minutes: number;
  total_questions: number;
  status: string;
  consent_accepted_at?: string;
  system_check_passed: boolean;
  available_languages?: string[];
  selected_language?: string | null;
  // JD info for Step 2 (JD Review)
  jd_title?: string | null;
  jd_experience_level?: string | null;
  jd_description?: string | null;
  jd_department?: string | null;
  jd_location?: string | null;
  jd_employment_type?: string | null;
  jd_remote_type?: string | null;
  jd_must_have_skills?: string[] | null;
  jd_nice_to_have_skills?: string[] | null;
  jd_experience_min?: number | null;
  jd_experience_max?: number | null;
  jd_job_level?: string | null;
  jd_industry_type?: string | null;
  // Introduction video for Step 6
  introduction_video_url?: string | null;
  // Identity verification for Step 3
  identity_verified?: boolean;
  identity_name?: string | null;
}

export interface AvailableLanguagesResponse {
  available_languages: string[];
  selected_language: string | null;
}

export interface LanguageSelectionResponse {
  success: boolean;
  selected_language: string;
  message: string;
}

export interface CandidateConsentRequest {
  consent_video: boolean;
  consent_audio: boolean;
  consent_biometric: boolean;
  consent_ai_analysis: boolean;
  consent_terms: boolean;
}

export interface CandidateSystemCheckRequest {
  camera: string;
  microphone: string;
  network: string;
  ai_engine: string;
  lighting?: string;
  noise?: string;
  face_detection?: string;
  face_count?: number;
  video_resolution?: string;
  video_brightness?: number;
  audio_level_db?: number;
  network_latency_ms?: number;
  network_latency_variance_ms?: number;
  ai_engine_latency_ms?: number;
}

export interface AIHealthResponse {
  status: 'ready' | 'unavailable';
  latency_ms: number;
}

export const candidateAIInterviewService = {
  async checkAIHealth(token: string): Promise<AIHealthResponse> {
    const response = await candidateApi.get<AIHealthResponse>(
      `/candidate/ai-interview/${token}/ai-health`,
    );
    return response.data;
  },

  async getInterviewInfo(token: string): Promise<CandidateInterviewInfo> {
    const response = await candidateApi.get<CandidateInterviewInfo>(
      `/candidate/ai-interview/${token}`,
    );
    return response.data;
  },

  async recordConsent(
    token: string,
    data: CandidateConsentRequest,
  ): Promise<CandidateInterviewInfo> {
    const response = await candidateApi.post<CandidateInterviewInfo>(
      `/candidate/ai-interview/${token}/consent`,
      data,
    );
    return response.data;
  },

  async recordSystemCheck(
    token: string,
    data: CandidateSystemCheckRequest,
  ): Promise<CandidateInterviewInfo> {
    const response = await candidateApi.post<CandidateInterviewInfo>(
      `/candidate/ai-interview/${token}/system-check`,
      data,
    );
    return response.data;
  },

  async recordPracticeComplete(token: string): Promise<void> {
    await candidateApi.post(`/candidate/ai-interview/${token}/practice-complete`).catch(() => {});
  },

  async transcribePracticeAudio(token: string, audioBlob: Blob): Promise<string> {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'practice.webm');
    const response = await candidateApi.post<{ transcript: string }>(
      `/candidate/ai-interview/${token}/transcribe-practice`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return response.data.transcript || '';
  },

  async startInterview(token: string): Promise<CandidateInterviewInfo> {
    const response = await candidateApi.post<CandidateInterviewInfo>(
      `/candidate/ai-interview/${token}/start`,
    );
    return response.data;
  },

  async uploadRecording(token: string, blob: Blob): Promise<{ message: string; path: string }> {
    const formData = new FormData();
    formData.append('file', blob, 'recording.webm');
    // Do NOT set Content-Type manually — axios auto-sets multipart/form-data with the
    // correct boundary when given a FormData object. Overriding it drops the boundary
    // and the server cannot parse the request.
    const response = await candidateApi.post(
      `/candidate/ai-interview/${token}/upload-recording`,
      formData,
    );
    return response.data;
  },

  async getAvailableLanguages(token: string): Promise<AvailableLanguagesResponse> {
    const response = await candidateApi.get<AvailableLanguagesResponse>(
      `/candidate/ai-interview/${token}/languages`,
    );
    return response.data;
  },

  async selectLanguage(token: string, language: string): Promise<LanguageSelectionResponse> {
    const response = await candidateApi.post<LanguageSelectionResponse>(
      `/candidate/ai-interview/${token}/select-language`,
      { language },
    );
    return response.data;
  },

  async verifyIdentity(
    token: string,
    data: { name: string; email: string; candidate_id?: string; photo?: Blob },
  ): Promise<CandidateInterviewInfo> {
    const formData = new FormData();
    formData.append('name', data.name);
    formData.append('email', data.email);
    if (data.candidate_id) formData.append('candidate_id', data.candidate_id);
    if (data.photo) formData.append('photo', data.photo, 'identity.jpg');
    const response = await candidateApi.post<CandidateInterviewInfo>(
      `/candidate/ai-interview/${token}/identity-verify`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return response.data;
  },

  async reportProctorEvent(
    token: string,
    event: { event_type: string; timestamp?: string; details?: Record<string, any> },
  ): Promise<{ success: boolean; violation_count: number; warning_issued: boolean }> {
    const response = await candidateApi.post(
      `/candidate/ai-interview/${token}/proctor-event`,
      {
        event_type: event.event_type,
        timestamp: event.timestamp || new Date().toISOString(),
        details: event.details || {},
      },
    );
    return response.data;
  },
};
