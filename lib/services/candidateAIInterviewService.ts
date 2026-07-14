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
  // Interview mode: 'fixed' (per-question 2-min timer) | 'flexible' (global timer only)
  interview_mode?: string | null;
  // Proctoring
  copy_paste_blocking?: boolean | null;
  // True once the interview was terminated for a proctoring violation
  // (candidate left the interview screen). Sticky — routes to the terminated page.
  proctoring_terminated?: boolean | null;
  // When true, block starting the interview if the camera/mic is already held by
  // another app (candidate already in a Teams/Zoom/Meet call).
  block_active_meeting?: boolean | null;
  // Expiry timestamp for client-side expiry checks
  expires_at?: string | null;
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
  websocket?: string;
  lighting?: string;
  noise?: string;
  face_detection?: string;
  face_count?: number;
  video_resolution?: string;
  video_brightness?: number;
  audio_level_db?: number;
  network_latency_ms?: number;
  network_latency_variance_ms?: number;
  internet_speed_mbps?: number;
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

  // Records a candidate consent ACKNOWLEDGEMENT to the backend Audit Log.
  // Distinct from recordConsent() above (which posts the video/audio/biometric
  // consent form to /consent). This posts to /consent-ack and is best-effort —
  // never blocks the interview flow. Called for both pre-interview gates:
  // 'rules_acknowledged' (checkbox on the fullscreen prompt) and 'final_accept'
  // (the in-fullscreen "Yes, I accept" gate).
  async recordConsentAck(
    token: string,
    consentType: 'rules_acknowledged' | 'final_accept',
    details?: Record<string, any>,
  ): Promise<void> {
    await candidateApi.post(`/candidate/ai-interview/${token}/consent-ack`, {
      consent_type: consentType,
      timestamp: new Date().toISOString(),
      details: details || {},
    }).catch(() => {});
  },

  /**
   * Enroll the candidate's voiceprint on the server (speaker verification).
   * `pcmBlob` is raw 16 kHz mono Int16 PCM (see lib/utils/pcmEnroll.recordPcm16).
   * `stage` is "system_check" (primary) or "practice" (top-up). Best-effort:
   * returns {enabled, ok} — when the feature is off the backend replies
   * {enabled:false} and the caller can fall back to local behavior.
   */
  async enrollVoice(
    token: string,
    pcmBlob: Blob,
    stage: 'system_check' | 'practice' = 'system_check',
    sampleRate = 16000,
    noiseFloor = 0,
    expectedText = '',
  ): Promise<{ enabled: boolean; ok: boolean; reason?: string; speech_seconds?: number; match_ratio?: number; transcript?: string }> {
    const formData = new FormData();
    formData.append('file', pcmBlob, `${stage}.pcm`);
    formData.append('stage', stage);
    formData.append('sample_rate', String(sampleRate));
    formData.append('noise_floor', String(noiseFloor));
    // Only sent for the read-aloud system-check stage; the backend requires the
    // transcript to match this before accepting (defeats silence/noise).
    formData.append('expected_text', expectedText);
    const url = `${API_BASE_URL}/candidate/ai-interview/${token}/enroll-voice`;
    try {
      const response = await fetch(url, { method: 'POST', body: formData });
      if (!response.ok) return { enabled: true, ok: false, reason: `http_${response.status}` };
      return await response.json();
    } catch {
      return { enabled: false, ok: false, reason: 'network' };
    }
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

  async uploadScreenRecording(
    token: string,
    blob: Blob,
    segmentIndex = 0,
    isFinal = false,
  ): Promise<{ message: string; path: string | null; completed?: boolean }> {
    // Each segment is one S3 multipart-upload part (part_number = segmentIndex + 1).
    // Non-final segments must be >= 5 MiB; the final segment (isFinal) triggers
    // CompleteMultipartUpload on the backend, assembling the single object.
    const formData = new FormData();
    formData.append('file', blob, 'screen.webm');
    formData.append('segment_index', String(segmentIndex));
    formData.append('is_final', isFinal ? 'true' : 'false');
    const uploadUrl = `${API_BASE_URL}/candidate/ai-interview/${token}/upload-screen-recording`;
    const response = await fetch(uploadUrl, { method: 'POST', body: formData });
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Screen recording upload failed (${response.status}): ${errorText}`);
    }
    return response.json();
  },

  async uploadRecording(
    token: string,
    blob: Blob,
    segmentIndex = 0,
    isFinal = false,
  ): Promise<{ message: string; path: string | null; completed?: boolean }> {
    const formData = new FormData();
    formData.append('file', blob, 'recording.webm');
    formData.append('segment_index', String(segmentIndex));
    formData.append('is_final', isFinal ? 'true' : 'false');
    // Use native fetch (not axios) for video upload:
    // - No Content-Type override that could drop the multipart boundary
    // - No default body size limits from axios interceptors
    // - Works reliably with large video files
    const uploadUrl = `${API_BASE_URL}/candidate/ai-interview/${token}/upload-recording`;
    const response = await fetch(uploadUrl, {
      method: 'POST',
      body: formData,
      // No Content-Type header — browser sets multipart/form-data + boundary automatically
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Recording upload failed (${response.status}): ${errorText}`);
    }
    return response.json();
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

  async sendOtp(token: string, email: string): Promise<{ message: string }> {
    const response = await candidateApi.post<{ message: string }>(
      `/candidate/ai-interview/${token}/send-otp`,
      { email },
    );
    return response.data;
  },

  async verifyOtp(token: string, email: string, otp: string): Promise<{ verified: boolean; message: string }> {
    const response = await candidateApi.post<{ verified: boolean; message: string }>(
      `/candidate/ai-interview/${token}/verify-otp`,
      { email, otp },
    );
    return response.data;
  },

  async reportProctorEvent(
    token: string,
    event: { event_type: string; timestamp?: string; severity?: string; details?: Record<string, any> },
  ): Promise<{ success: boolean; violation_count: number; warning_issued: boolean }> {
    const response = await candidateApi.post(
      `/candidate/ai-interview/${token}/proctor-event`,
      {
        event_type: event.event_type,
        timestamp: event.timestamp || new Date().toISOString(),
        severity: event.severity || 'minor',
        details: event.details || {},
      },
    );
    return response.data;
  },
};
