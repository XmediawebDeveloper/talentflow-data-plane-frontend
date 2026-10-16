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
  /** JD22 - recruiter free text about the job (shift timings, WFO/WFH, ...) shown to the
   *  candidate on the JD screen. Display only: it is not part of jd_description and is
   *  never sent to the interview engine, so it cannot steer the questions or scoring. */
  jd_additional_details?: string | null;
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
  // When true, show the "hide the screen-share bar" (vision-LLM verified) step
  // between the final consent and interview start.
  verify_share_bar_hidden?: boolean | null;
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

/** Stable per-browser id for the single-active-session lease. Persisted in
 *  localStorage so it survives refresh and is shared across tabs of the SAME
 *  browser (same person), but differs for another person's browser (blocked).
 *  The interview WebSocket sends the same value as ?cid=…. */
export function getAiClientSessionId(token: string): string {
  if (typeof window === 'undefined') return 'ssr';
  const key = `tf_ai_client_${token}`;
  try {
    let v = localStorage.getItem(key);
    if (!v) {
      v = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(key, v);
    }
    return v;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

export const candidateAIInterviewService = {
  /** Claim/refresh ('acquire') or drop ('release') the pre-interview
   *  single-active-session lease. held=true → this browser owns the session;
   *  blocked=true → another live browser holds it. */
  async sessionLease(
    token: string,
    clientId: string,
    action: 'acquire' | 'release' = 'acquire',
  ): Promise<{
    held: boolean;
    blocked: boolean;
    /** Seconds until the current holder's lease goes stale and this browser can
     *  take over. Only meaningful when blocked=true. Server-computed — the
     *  client cannot know the other holder's last heartbeat. */
    retry_after_seconds?: number;
    /** The full stale window, for rendering progress. */
    stale_window_seconds?: number;
  }> {
    const response = await candidateApi.post<{
      held: boolean;
      blocked: boolean;
      retry_after_seconds?: number;
      stale_window_seconds?: number;
    }>(
      `/candidate/ai-interview/${token}/session-lease`,
      { client_id: clientId, action },
    );
    return response.data;
  },

  /**
   * Drop the lease during page teardown (tab close / navigate away / mobile
   * background), so a candidate who reopens the link in another browser is NOT
   * blocked for the full 90s stale window.
   *
   * A normal axios POST is useless here — the browser cancels in-flight XHR as
   * the page unloads, so the release never reaches the server and the lease sits
   * there looking alive until it goes stale.
   *
   * `keepalive: true` outlives the page. Deliberately NOT navigator.sendBeacon:
   * the spec forces credentials mode "include", and this API answers
   * `Access-Control-Allow-Origin: *`, which a credentialed request may never
   * accept — every beacon dies at preflight. See flushClientLogBeacon() for the
   * same trap and the same fix.
   */
  releaseSessionLeaseBeacon(token: string, clientId: string): void {
    try {
      if (typeof fetch !== 'function') return;
      void fetch(`${API_BASE_URL}/candidate/ai-interview/${token}/session-lease`, {
        method: 'POST',
        keepalive: true,
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, action: 'release' }),
      }).catch(() => { /* stale-timeout backstops it */ });
    } catch {
      /* never let teardown throw */
    }
  },

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

  /** Fallback poll for the laptop side of mobile QR environment verification
   *  (InterviewUI.tsx) — recovers state when a WS push (opened/
   *  recording_started/submitted) never arrives, e.g. because the phone's
   *  request landed on a different backend worker than the one holding this
   *  laptop's socket. Never returns challenge_color/id/colors — those stay
   *  laptop-only via the original WS trigger payload. */
  async getEnvironmentVerificationStatus(verificationToken: string): Promise<{
    status: string;
    analysis_status: string | null;
    expires_at: string | null;
    recording_started_at: string | null;
    verification_id: string | null;
  }> {
    const response = await candidateApi.get(
      `/candidate/environment-verify/${verificationToken}/status`,
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

  /** Send a frame of the shared screen; the backend vision-LLM says whether
   *  Chrome's "sharing your screen" bar is hidden/collapsed, whether a floating
   *  Picture-in-Picture window is visible, whether a third-party screen
   *  recorder's own overlay (toolbar/border/REC timer) is visible, whether any
   *  other application / AI-assistant tool is open besides the interview tab,
   *  and whether the interview browser itself is actually the screen being
   *  shared. */
  async verifyShareBarHidden(
    token: string,
    blob: Blob,
  ): Promise<{ enabled: boolean; hidden: boolean; pip_detected?: boolean; recorder_overlay_detected?: boolean; foreign_app_detected?: boolean; foreign_app_label?: string; interview_screen_present?: boolean; check_unavailable?: boolean; reason?: string }> {
    const fd = new FormData();
    fd.append('file', blob, 'screen.jpg');
    const url = `${API_BASE_URL}/candidate/ai-interview/${token}/verify-share-bar`;
    const res = await fetch(url, { method: 'POST', body: fd });
    if (!res.ok) {
      const t = await res.text().catch(() => res.statusText);
      throw new Error(`Share-bar verify failed (${res.status}): ${t}`);
    }
    return res.json();
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

  /**
   * The candidate's own identity photo (captured at the Identity step), served
   * back so the face-identity reference survives a page reload. null when there
   * is none / the interview is over.
   */
  async getIdentityPhoto(token: string): Promise<Blob | null> {
    try {
      const response = await candidateApi.get<Blob>(
        `/candidate/ai-interview/${token}/identity-photo`,
        { responseType: 'blob' },
      );
      return response.data && response.data.size > 0 ? response.data : null;
    } catch {
      return null;
    }
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

  // Best-effort evidence capture for an OBJECT-DETECTION proctoring violation
  // (phone_detected / unauthorized_object — never focus-loss/window-blur
  // types). Called ONCE per distinct violation type per session (caller
  // dedupes), never on repeated re-triggers. Fire-and-forget: swallows its own
  // errors so a network blip or missing frame never affects the main
  // /proctor-event pipeline above.
  async uploadProctorEventScreenshot(
    token: string,
    eventType: string,
    objectClass: string | undefined,
    frame: Blob,
  ): Promise<void> {
    try {
      const fd = new FormData();
      fd.append('event_type', eventType);
      if (objectClass) fd.append('object_class', objectClass);
      fd.append('timestamp', new Date().toISOString());
      fd.append('frame', frame, 'proctor-event.jpg');
      await candidateApi.post(
        `/candidate/ai-interview/${token}/proctor-event-screenshot`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
    } catch (err) {
      // Best-effort — never surface to the candidate or block the interview.
      console.warn('[PROCTOR-SCREENSHOT] upload failed (non-blocking):', err);
    }
  },

  // Forward a batch of browser-side diagnostic lines to the backend so they
  // land in journald tagged by session id (grep "ai-<token8>"). Fire-and-forget.
  async reportClientLog(token: string, lines: string[]): Promise<void> {
    if (!lines || lines.length === 0) return;
    try {
      await candidateApi.post(`/candidate/ai-interview/${token}/client-log`, { lines });
    } catch {
      /* best-effort logging channel — never surface errors to the candidate */
    }
  },

  /**
   * AII17 — submit the candidate's post-interview feedback (whole-star 1-5
   * ratings + an optional comment). Unlike the fire-and-forget calls above,
   * this one is NOT swallowed: the candidate is watching the dialog, so a
   * failure has to reach the UI as a retry rather than a fake "thank you".
   * The backend only ever writes the feedback column, so this can never
   * affect the interview result.
   */
  async submitFeedback(
    token: string,
    feedback: {
      overall?: number | null;
      question_quality?: number | null;
      ai_experience?: number | null;
      comment?: string;
    },
  ): Promise<{ success: boolean; message: string }> {
    const response = await candidateApi.post(
      `/candidate/ai-interview/${token}/feedback`,
      {
        overall: feedback.overall ?? null,
        question_quality: feedback.question_quality ?? null,
        ai_experience: feedback.ai_experience ?? null,
        comment: (feedback.comment || '').slice(0, 500),
      },
    );
    return response.data;
  },

  // Absolute URL for the unload-time keepalive fetch in clientLogForwarder
  // (used on disconnect/unload, when the axios instance / page may be tearing
  // down). NOT sendBeacon — see that file for why it can't be used here.
  clientLogBeaconUrl(token: string): string {
    return `${API_BASE_URL}/candidate/ai-interview/${token}/client-log`;
  },
};
