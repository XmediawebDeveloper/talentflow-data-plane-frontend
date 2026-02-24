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
  position: string;
  interview_type: string;
  duration_minutes: number;
  total_questions: number;
  status: string;
  consent_accepted_at?: string;
  system_check_passed: boolean;
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
}

export const candidateAIInterviewService = {
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

  async startInterview(token: string): Promise<CandidateInterviewInfo> {
    const response = await candidateApi.post<CandidateInterviewInfo>(
      `/candidate/ai-interview/${token}/start`,
    );
    return response.data;
  },

  async uploadRecording(token: string, blob: Blob): Promise<{ message: string; path: string }> {
    const formData = new FormData();
    formData.append('file', blob, 'recording.webm');
    const response = await candidateApi.post(
      `/candidate/ai-interview/${token}/upload-recording`,
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
