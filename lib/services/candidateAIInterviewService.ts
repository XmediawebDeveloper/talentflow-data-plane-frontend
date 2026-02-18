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
};
