/**
 * Candidate Assessment Service
 * Public API for candidates taking assessments
 */

import axios from 'axios';
import { safeLocalStorage, safeSessionStorage } from '@/lib/utils/browserCompat';
import type { ProctorFrameConfig, ProctorFrameSendResult } from '@/lib/services/candidateAIInterviewService';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// ===================== Session Token Management =====================
// Manages single-session enforcement token with improved persistence

let currentSessionToken: string | null = null;
let currentAssessmentToken: string | null = null;
let lastNetworkFailureEventAt = 0;
// Consecutive "no response" failures. A single timed-out or aborted request
// (e.g. the page was busy, a tab switch cancelled an XHR) is NOT an outage:
// the timer must only pause and the offline banner only show after the
// browser says it is offline or two requests in a row got no response.
let consecutiveNoResponseFailures = 0;
const NETWORK_FAILURE_CONFIRMATIONS = 2;

function dispatchCandidateNetworkEvent(name: 'candidate-network-failure' | 'candidate-network-restored', detail?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export const sessionTokenManager = {
  setToken(token: string, assessmentToken?: string) {
    currentSessionToken = token;
    if (assessmentToken) {
      currentAssessmentToken = assessmentToken;
    }
    // Store in both sessionStorage (tab-specific) and localStorage (persistent)
    if (typeof window !== 'undefined') {
      const storageKey = currentAssessmentToken
        ? `assessment_session_${currentAssessmentToken}`
        : 'assessment_session_token';
      safeSessionStorage.setItem(storageKey, token);
      safeSessionStorage.setItem('assessment_session_token', token); // Fallback key
      // Also store in localStorage for refresh resilience
      safeLocalStorage.setItem(storageKey, token);
      safeLocalStorage.setItem('assessment_session_token', token);
      console.log('[SESSION] Token stored with key:', storageKey);
    }
  },
  getToken(assessmentToken?: string): string | null {
    // First check memory
    if (currentSessionToken) return currentSessionToken;

    if (typeof window !== 'undefined') {
      const token = assessmentToken || currentAssessmentToken;
      const storageKey = token ? `assessment_session_${token}` : 'assessment_session_token';

      // Try sessionStorage first (same tab)
      let stored = safeSessionStorage.getItem(storageKey);
      if (!stored) {
        stored = safeSessionStorage.getItem('assessment_session_token');
      }

      // Fall back to localStorage (survives refresh/browser close)
      if (!stored) {
        stored = safeLocalStorage.getItem(storageKey);
      }
      if (!stored) {
        stored = safeLocalStorage.getItem('assessment_session_token');
      }

      if (stored) {
        currentSessionToken = stored;
        console.log('[SESSION] Token recovered from storage');
        return stored;
      }
    }
    return null;
  },
  setAssessmentToken(token: string) {
    currentAssessmentToken = token;
  },
  clearToken(assessmentToken?: string) {
    currentSessionToken = null;
    if (typeof window !== 'undefined') {
      const token = assessmentToken || currentAssessmentToken;
      const storageKey = token ? `assessment_session_${token}` : 'assessment_session_token';
      safeSessionStorage.removeItem(storageKey);
      safeSessionStorage.removeItem('assessment_session_token');
      safeLocalStorage.removeItem(storageKey);
      safeLocalStorage.removeItem('assessment_session_token');
    }
  }
};

// Create a separate axios instance for candidate (no auth interceptors)
const candidateApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 60000, // 60 second timeout for all requests (handles slow networks in Safari/Firefox)
  withCredentials: false, // Disable credentials for CORS compatibility across all browsers
});

// Add request interceptor to include session token OR invitation token
candidateApi.interceptors.request.use((config) => {
  // Try to get session token - the manager will check memory first, then storage
  let sessionToken = sessionTokenManager.getToken();

  // If no token found and URL contains assessment token, try to extract and recover
  let invitationToken: string | null = null;
  if (config.url) {
    const match = config.url.match(/\/assessment\/([a-zA-Z0-9_-]+)/);
    if (match) {
      invitationToken = match[1];
      // Set the assessment context and try again
      sessionTokenManager.setAssessmentToken(invitationToken);
      sessionToken = sessionTokenManager.getToken(invitationToken);
      if (sessionToken) {
        console.log('[SESSION] Recovered token from URL-based lookup:', invitationToken.substring(0, 10) + '...');
      }
    }
  }

  // Priority: Session token first (for active sessions), then invitation token (for new sessions)
  if (sessionToken) {
    config.headers['X-Session-Token'] = sessionToken;
  } else if (invitationToken) {
    // CROSS-BROWSER FIX: Send invitation token as fallback for browsers without storage
    config.headers['X-Invitation-Token'] = invitationToken;
    console.log('[SESSION] Using invitation token as fallback (cross-browser support)');
  }

  // iOS/Safari FIX: Add cache control to prevent iOS from caching failed requests
  if (typeof navigator !== 'undefined' && /iphone|ipad|ipod/.test(navigator.userAgent.toLowerCase())) {
    config.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
    config.headers['Pragma'] = 'no-cache';
  }

  return config;
});

// Add response interceptor for better cross-browser error handling
candidateApi.interceptors.response.use(
  (response) => {
    consecutiveNoResponseFailures = 0;
    dispatchCandidateNetworkEvent('candidate-network-restored', {
      url: response.config?.url,
      method: response.config?.method,
      timestamp: Date.now(),
    });
    return response;
  },
  (error) => {
    // Enhanced error logging for debugging browser-specific issues
    if (error.response) {
      // Server responded with error status
      console.error('[CANDIDATE API] Server error:', error.response.status, error.response.data);
    } else if (error.request) {
      // Request was made but no response received (network issues)
      console.error('[CANDIDATE API] Network error - no response received:', error.message, error.code);
      const code = String(error.code || '');
      const cancelled = code === 'ERR_CANCELED' || axios.isCancel?.(error) === true;
      const browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
      if (!cancelled) consecutiveNoResponseFailures += 1;
      const confirmed = browserOffline || consecutiveNoResponseFailures >= NETWORK_FAILURE_CONFIRMATIONS;
      const now = Date.now();
      if (confirmed && now - lastNetworkFailureEventAt > 1500) {
        lastNetworkFailureEventAt = now;
        dispatchCandidateNetworkEvent('candidate-network-failure', {
          url: error.config?.url,
          method: error.config?.method,
          message: error.message,
          code,
          consecutive_failures: consecutiveNoResponseFailures,
          browser_offline: browserOffline,
          timestamp: now,
        });
      } else if (!confirmed) {
        console.warn(`[CANDIDATE API] Single no-response failure (${code || 'unknown'}) ignored — waiting for confirmation before pausing the timer`);
      }
    } else {
      // Something else happened (browser security, CORS, etc.)
      console.error('[CANDIDATE API] Request setup error:', error.message);
    }
    return Promise.reject(error);
  }
);

// ===================== Types =====================

export interface AssessmentInfo {
  assessment_id: string;
  assessment_title: string;
  assessment_description: string | null;
  jd_title: string;
  /* The full JD behind the assessment, for the Job Description accordion on
     Step 2. Same names the candidate AI Interview endpoint returns them under.
     A JD with no content at all hides the section. */
  jd_description?: string | null;
  jd_department?: string | null;
  jd_location?: string | null;
  /** Every saved city with its state; `jd_location` is only the first city. */
  jd_locations?: Array<{ city: string; state?: string | null }> | null;
  jd_employment_type?: string | null;
  jd_remote_type?: string | null;
  jd_experience_min?: number | null;
  jd_experience_max?: number | null;
  jd_job_level?: string | null;
  jd_industry_type?: string | null;
  jd_must_have_skills?: string[] | null;
  jd_nice_to_have_skills?: string[] | null;
  /** Recruiter free text about the job — shown verbatim, apart from the description. */
  jd_additional_details?: string | null;
  candidate_name: string;
  candidate_email: string;
  company_name: string | null;
  duration_minutes: number;
  has_hr_round: boolean;
  has_technical_round: boolean;
  has_coding_round: boolean;
  hr_percentage: number;
  hr_topics?: any[];  // Selected HR questions from Question Bank
  technical_percentage: number;
  coding_percentage: number;
  invitation_status: string;
  consent_accepted: boolean;
  expires_at: string | null;
  is_revoked?: boolean;
  attempt_id: string | null;
  attempt_status: string | null;
  attempt_started_at: string | null;  // When attempt started - for timer resume on page refresh
  system_check_passed?: boolean;
  /** True once proctoring terminated this attempt — no resume, in any browser. */
  proctoring_terminated?: boolean;
  /** True once feedback has been stored for this attempt — the form is once-only. */
  feedback_submitted?: boolean;
  can_start: boolean;
  can_resume: boolean;
  message: string;
  session_token?: string;  // Session token for page refresh support
  proctoring_settings?: AssessmentProctoringSettings | null;
  time_remaining_seconds?: number | null;
  is_paused?: boolean;
  pause_reason?: string | null;
}

export interface ConsentResponse {
  success: boolean;
  consent_accepted?: boolean;
  consent_accepted_at?: string;
  consent_ip?: string;
  message: string;
  session_token?: string;  // Session token for single-session enforcement
  consent_log_id?: string;
}

export interface SystemCheckResult {
  camera_available: boolean;
  microphone_available: boolean;
  screen_share_available: boolean;
  browser_compatible: boolean;  // Must match backend field name
  internet_speed_mbps: number | null;
  browser_info?: Record<string, unknown>;
}

export interface SystemCheckResponse {
  success: boolean;
  system_check_passed: boolean;
  message: string;
}

export interface QuestionOption {
  id: string;
  text: string;
}

// Status of a question for progress tracking
export interface QuestionStatusInfo {
  question_number: number;
  has_answer: boolean;  // True if any answer (draft or submitted)
  is_locked: boolean;   // True if submitted (locked)
}

export interface CurrentQuestion {
  question_id: string;
  question_number: number;
  total_questions: number;
  round_type: string;
  round_name: string;
  question_type: string;
  question_text: string;
  points: number;
  time_limit_seconds: number | null;
  difficulty: string;
  options: QuestionOption[] | null;
  problem_title: string | null;
  input_format: string | null;
  output_format: string | null;
  constraints: string[] | null;
  sample_input: string | null;
  sample_output: string | null;
  starter_code: Record<string, string> | null;
  // Compiler configuration (for language filtering)
  coding_enabled?: boolean | null;  // True if compiler is configured for this assessment
  coding_languages?: string[] | null;  // Assigned languages for this assessment
  tags: string[];
  round_progress: {
    current: number;
    total: number;
    round_type: string;
  };
  previous_answer: {
    text_response: string | null;
    selected_options: string[] | null;
    code_submission: string | null;
    language: string | null;  // Coding language used (python, java, etc.)
    code_input: string | null;
    code_execution_status: string | null;
    code_execution_output: string | null;
    code_execution_error: string | null;
    is_locked: boolean;  // True = submitted (not editable), False = draft (editable)
  } | null;
  // All question statuses for progress tracking
  all_question_statuses: QuestionStatusInfo[] | null;
}

export interface AssessmentProctoringSettings {
  proctoring_enabled: boolean;
  webcam_monitoring: boolean;
  screen_recording: boolean;
  screenshot_blocking: boolean;
  tab_switch_detection: boolean;
  copy_paste_blocking: boolean;
  browser_lockdown: boolean;
  ai_cheating_prevention: boolean;
  max_tab_switches: number;
  max_violations_before_flag: number;
}

export interface StartAssessmentResponse {
  attempt_id: string;
  started_at: string;
  total_questions: number;
  rounds: Array<{
    round_type: string;
    round_name: string;
    question_count: number;
    weightage: number;
    order: number;
  }>;
  first_question: CurrentQuestion;
  message: string;
  session_token?: string;  // Unique session token for single-session enforcement
  proctoring_settings?: AssessmentProctoringSettings | null;
  time_remaining_seconds?: number | null;
  is_paused?: boolean;
}

export interface AnswerSubmission {
  answer_type?: 'text' | 'video' | 'mcq' | 'code';  // Auto-detected by backend if not provided
  text_response?: string;
  video_response_url?: string;
  selected_options?: string[];
  code_submission?: string;
  code_input?: string;
  language?: string;
  code_execution_status?: string;
  code_execution_output?: string;
  code_execution_error?: string;
  time_taken_seconds?: number;  // Time spent on question
  is_draft?: boolean;  // True = draft (auto-save, editable), False = submitted (locked)
}

export interface SubmitAnswerResponse {
  success: boolean;
  question_id: string;
  saved: boolean;
  time_taken_seconds: number;
  next_question: CurrentQuestion | null;
  is_last_question: boolean;
  progress: {
    answered: number;
    total: number;
    percent: number;
  };
  message: string;
}

export interface CompleteAssessmentResponse {
  success: boolean;
  attempt_id: string;
  completed_at: string;
  time_spent_seconds: number;
  questions_answered: number;
  total_questions: number;
  scoring_status: string;
  message: string;
}

export interface QuestionEvaluation {
  question_id: string;
  question_text: string;
  round_type: string;
  question_type: string;
  // The recruiter (assessment) view does not populate `score`; only the
  // candidate-facing summary does. Kept optional so both shapes overlap.
  score?: number;
  points_earned: number;
  points_possible: number;
  is_correct: boolean;
  feedback?: string;
  strengths?: string[];
  areas_for_improvement?: string[];
  // Candidate's answer
  candidate_answer_text?: string;
  candidate_selected_options?: string[];
  candidate_code_submission?: string;
  // Correct answer (for MCQ)
  correct_answer?: string[];
  // Options (for MCQ)
  options?: { id: string; text: string }[];
  // Expected answer points (for text questions)
  expected_answer_points?: string[];

  // Additional fields surfaced by the detailed-result endpoint (assessment side)
  // and consumed by CandidateResultDetails / scorecard views. Kept optional so
  // the two shapes overlap structurally and the existing call sites compile.
  problem_title?: string | null;
  input_format?: string | null;
  output_format?: string | null;
  sample_input?: string | null;
  sample_output?: string | null;
  constraints?: string | null;
  explanation?: string | null;
  candidate_code_input?: string;
  candidate_code_execution_status?: string;
  candidate_code_execution_output?: string;
  candidate_code_execution_error?: string;
  candidate_test_results?: {
    passed?: number;
    failed?: number;
    total?: number;
    points_earned?: number;
    points_total?: number;
    testcase_points_earned?: number;
    testcase_points_total?: number;
    question_points_earned?: number;
    question_points_total?: number;
    score_percentage?: number;
    syntax_valid?: boolean;
    execution_status?: string;
    summary?: string;
    strengths?: string[];
    improvements?: string[];
    // Must stay structurally compatible with assessmentService.QuestionEvaluation's
    // marks_breakdown - values of that type are passed to helpers typed against this one.
    // That type carries `output` and a numeric `total_marks`; `total_marks: number`
    // conflicted with the old value-only index signature, so the signature now admits
    // `number` too. Named keys below keep their precise types (TS prefers an explicit
    // property over the index signature), and every consumer reads named keys only.
    marks_breakdown?: {
      syntax?: { earned: number; total: number; status?: string; reason?: string };
      execution?: { earned: number; total: number; status?: string; reason?: string };
      output?: { earned: number; total: number; status?: string; reason?: string };
      total_marks?: number;
      pass_requirement?: string;
      [key: string]: { earned: number; total: number; status?: string; reason?: string } | number | string | undefined;
    };
    [key: string]: any;
  };
}

export interface RoundScore {
  round_type: string;
  raw_score: number;
  weighted_score: number;
  questions_total: number;
  questions_correct: number;
  weightage_percent: number;
}

export interface CandidateInsights {
  strengths: string[];
  improvement_areas: string[];
  skill_assessment: Record<string, string>;
  summary: string;
}

export interface TimeAnalysis {
  total_time_taken_seconds: number;
  average_time_per_question: number;
  time_management_rating: string;
}

export interface AssessmentResult {
  attempt_id: string;
  candidate_name: string;
  assessment_title: string;
  jd_title: string;
  completed_at: string;
  time_spent_seconds: number;
  overall_score: number;
  pass_status: string;
  passing_threshold: number;
  hiring_recommendation: string;
  recommendation_reason: string;
  round_scores: RoundScore[];
  question_evaluations: QuestionEvaluation[];
  candidate_insights: CandidateInsights;
  time_analysis: TimeAnalysis;
}

export interface HeartbeatResponse {
  success: boolean;
  time_remaining_seconds: number;
  tab_switch_count?: number;
  is_paused?: boolean;
  pause_reason?: string | null;
}

export const sendPauseBeacon = (token: string, reason: string): boolean => {
  if (typeof window === 'undefined' || !navigator.sendBeacon) return false;
  const sessionToken = sessionTokenManager.getToken(token);
  const url = `${API_BASE_URL}/candidate/assessment/${token}/pause`;
  const payload = JSON.stringify({
    session_token: sessionToken,
    reason,
  });
  try {
    return navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
  } catch {
    return false;
  }
};

export interface ProctorEvent {
  event_type:
    | 'tab_switch'
    | 'copy_attempt'
    | 'paste_attempt'
    | 'fullscreen_exit'
    | 'window_blur'
    | 'mouse_movement'
    | 'camera_disabled'
    | 'screen_share_stopped'
    | 'voice_detected'
    | 'multiple_voices'
    | 'microphone_disabled'
    | 'camera_obstructed'
    | 'camera_frozen'
    | 'screenshot_attempt'
    | 'screen_recording_attempt'
    | 'multiple_faces'
    | 'face_missing'
    | 'gaze_away'
    | 'identity_mismatch'
    | string; // allow future event types without breaking the type
  event_data?: Record<string, unknown>;
  timestamp?: string;
  details?: Record<string, unknown>;
}

export interface ProctorEventResponse {
  success: boolean;
  violation_count: number;
  warning_issued: boolean;
  message: string;
}

export interface CodeExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  compile_error?: string;
  exit_code: number;
}

export interface TestCaseResult {
  test_number: number;
  passed: boolean;
  input?: string | null;  // Hidden for hidden tests
  expected_output?: string | null;  // Hidden for hidden tests
  actual_output?: string | null;
  error?: string | null;
  is_hidden: boolean;
}

export interface CodeSubmissionResult {
  success: boolean;
  tests_passed: number;
  tests_total: number;
  test_results: TestCaseResult[];
  score_percentage: number;
  syntax_valid?: boolean;
  execution_status?: string;
  message: string;
  error?: string;
}

export interface PrepareAssessmentResponse {
  attempt_id: string;
  // 'pending_lang_choice' fires when the assessment has a multi-language
  // coding round and the candidate hasn't picked a language yet. The
  // backend defers actual question generation until POST /choose-language.
  status: 'pending_system_check' | 'pending_lang_choice' | 'generating' | 'ready';
  message: string;
}

export interface HRAnswerSubmissionItem {
  question_text: string;
  answer_type?: 'text' | 'yes_no';
  answer_text?: string;
}

export interface HRAnswersSubmitResponse {
  success: boolean;
  saved_count: number;
  message: string;
}

export interface GenerationStatusResponse {
  status: 'not_started' | 'pending_lang_choice' | 'generating' | 'ready' | 'failed';
  questions_ready: boolean;
  total_questions: number;
  message: string;
}

// ===================== CROSS-BROWSER RETRY LOGIC =====================

/**
 * Retry wrapper for API calls - handles network failures on iOS/Safari
 * Retries up to 3 times with exponential backoff
 */
async function retryApiCall<T>(
  apiCall: () => Promise<T>,
  maxRetries: number = 3,
  retryDelay: number = 1000
): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      lastError = error;

      // Don't retry on 4xx errors (except 408 timeout and 429 rate limit)
      if (axios.isAxiosError(error) && error.response) {
        const status = error.response.status;
        if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
          throw error; // Don't retry on client errors
        }
      }

      // Only retry network errors or 5xx server errors
      if (attempt < maxRetries) {
        const delay = retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
        console.log(`[RETRY] Attempt ${attempt} failed, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// ===================== API Functions =====================

export const candidateService = {
  /**
   * Get assessment information for a candidate token
   * CROSS-BROWSER: Includes retry logic for iOS/Safari network issues
   */
  async getAssessmentInfo(token: string, candidateName?: string, role?: string): Promise<AssessmentInfo> {
    try {
      const params: Record<string, string> = {};
      if (candidateName) params.c = candidateName;
      if (role) params.r = role;
      const response = await retryApiCall(() =>
        candidateApi.get<AssessmentInfo>(`/candidate/assessment/${token}`, { params })
      );

      // Store session token if returned (for page refresh support)
      if (response.data.session_token) {
        sessionTokenManager.setToken(response.data.session_token, token);
        console.log('[SESSION] Stored session token from assessment info');
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // Check for session conflict (duplicate tab/browser)
        const errorDetail = error.response?.data?.detail;
        if (error.response?.status === 409 || (typeof errorDetail === 'object' && errorDetail?.code === 'DUPLICATE_SESSION')) {
          throw new Error('DUPLICATE_SESSION');
        }

        // CROSS-BROWSER: Better error messages for different scenarios
        if (!error.response) {
          // Network error - no response received
          throw new Error('Unable to connect to server. Please check your internet connection and try again.');
        }

        if (error.response.status === 410) {
          throw new Error('LINK_EXPIRED');
        }

        if (error.response.status === 401 || error.response.status === 403) {
          throw new Error('Invalid or expired assessment link. Please contact your recruiter for a new link.');
        }

        if (error.response.status === 404) {
          // Token no longer resolves — commonly a link that was superseded
          // (recruiter edited the email / resent, which rotates the token) or
          // a mistyped URL. Surface the friendly "expired/updated" screen
          // rather than a bare "not found". Handled in CandidateAssessmentPortal.
          throw new Error('LINK_NOT_VALID');
        }

        if (error.response.status >= 500) {
          throw new Error('Server temporarily unavailable. Please try again.');
        }

        throw new Error(typeof errorDetail === 'string' ? errorDetail : (errorDetail?.message || 'Failed to get assessment info'));
      }
      throw error;
    }
  },

  /**
   * Accept terms and consent
   * CROSS-BROWSER: Includes retry logic for iOS/Safari network issues
   */
  async acceptConsent(token: string, termsAccepted: boolean = true, proctoringConsent: boolean = true): Promise<ConsentResponse> {
    try {
      const response = await retryApiCall(() =>
        candidateApi.post<ConsentResponse>(`/candidate/assessment/${token}/consent`, {
          terms_accepted: termsAccepted,
          proctoring_consent: proctoringConsent,
        })
      );

      // Store session token if returned (for single-session enforcement)
      if (response.data.session_token) {
        sessionTokenManager.setToken(response.data.session_token, token);  // Pass assessment token for better storage key
        console.log('[CONSENT] Session token stored for single-session enforcement');
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // Check for session already active error
        const errorDetail = error.response?.data?.detail;
        if (typeof errorDetail === 'object' && errorDetail?.error === 'SESSION_ALREADY_ACTIVE') {
          throw new Error('SESSION_ALREADY_ACTIVE');
        }
        throw new Error(typeof errorDetail === 'string' ? errorDetail : 'Failed to accept consent');
      }
      throw error;
    }
  },

  async pauseAssessment(token: string, reason: string): Promise<void> {
    try {
      await candidateApi.post(`/candidate/assessment/${token}/pause`, {
        session_token: sessionTokenManager.getToken(token),
        reason,
      });
    } catch (error) {
      console.warn('[RECOVERY] Failed to pause assessment:', error);
    }
  },

  /**
   * Prepare assessment - finds/creates the attempt.
   *
   * At "Begin Assessment" call it WITHOUT options: no question generation (no
   * LLM call) runs before the candidate starts. At the start gate (after system
   * check, HR and fullscreen) pass `{ startGeneration: true }` — only then does
   * the backend dispatch question generation.
   */
  async prepareAssessment(
    token: string,
    options: { startGeneration?: boolean } = {},
  ): Promise<PrepareAssessmentResponse> {
    try {
      const response = await candidateApi.post<PrepareAssessmentResponse>(
        `/candidate/assessment/${token}/prepare`,
        undefined,
        options.startGeneration ? { params: { start_generation: 'true' } } : undefined,
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.detail || 'Failed to prepare assessment');
      }
      throw error;
    }
  },

  async saveHRAnswers(token: string, answers: HRAnswerSubmissionItem[]): Promise<HRAnswersSubmitResponse> {
    try {
      const response = await retryApiCall(() =>
        candidateApi.post<HRAnswersSubmitResponse>(`/candidate/assessment/${token}/hr-answers`, { answers })
      );
      return response.data;
    } catch (error: any) {
      const errorDetail = error?.response?.data?.detail;
      throw new Error(typeof errorDetail === 'string' ? errorDetail : 'Failed to save HR answers');
    }
  },

  /**
   * Check question generation status
   * Poll this during system check to know when questions are ready
   */
  async getGenerationStatus(token: string): Promise<GenerationStatusResponse> {
    try {
      const response = await candidateApi.get<GenerationStatusResponse>(
        `/candidate/assessment/${token}/generation-status`
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          status: 'failed',
          questions_ready: false,
          total_questions: 0,
          message: error.response?.data?.detail || 'Failed to check status'
        };
      }
      throw error;
    }
  },

  /**
   * Submit system check results
   */
  async submitSystemCheck(token: string, results: SystemCheckResult): Promise<SystemCheckResponse> {
    try {
      const response = await candidateApi.post<SystemCheckResponse>(
        `/candidate/assessment/${token}/system-check`,
        results
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.detail || 'System check failed');
      }
      throw error;
    }
  },

  /**
   * Start assessment and get first question
   * CROSS-BROWSER: Includes retry logic for iOS/Safari network issues
   */
  async startAssessment(token: string): Promise<StartAssessmentResponse> {
    // Detect browser for enhanced error logging and messaging
    const getBrowserInfo = () => {
      if (typeof navigator === 'undefined') return { name: 'unknown', userAgent: '' };
      const ua = navigator.userAgent.toLowerCase();
      return {
        name: ua.includes('firefox') ? 'Firefox'
            : ua.includes('safari') && !ua.includes('chrome') ? 'Safari'
            : /iphone|ipad|ipod/.test(ua) ? 'iOS Safari'
            : ua.includes('arc') ? 'Arc'
            : ua.includes('brave') ? 'Brave'
            : ua.includes('edg') ? 'Edge'
            : ua.includes('chrome') ? 'Chrome'
            : 'Unknown',
        userAgent: navigator.userAgent
      };
    };

    const browser = getBrowserInfo();

    try {
      // SECURITY: Get verified email from sessionStorage (stored during identity verification)
      const verifiedEmail = sessionStorage.getItem(`verified_email_${token}`);

      if (!verifiedEmail) {
        console.warn('[SECURITY] ⚠️ No verified email found - identity verification may have been skipped');
      } else {
        console.log('[SECURITY] ✅ Using verified email for start assessment');
      }

      console.log('[CANDIDATE SERVICE] Starting assessment', {
        browser: browser.name,
        timestamp: new Date().toISOString(),
        tokenPrefix: token.substring(0, 8),
        hasVerifiedEmail: !!verifiedEmail
      });

      const response = await retryApiCall(() =>
        candidateApi.post<StartAssessmentResponse>(
          `/candidate/assessment/${token}/start`,
          {
            candidate_email: verifiedEmail,  // SECURITY: Send verified email for validation
            consent_accepted: true
          }
        )
      );

      // Store session token for single-session enforcement
      if (response.data.session_token) {
        sessionTokenManager.setToken(response.data.session_token, token);  // Pass assessment token for better storage key
      }

      console.log('[CANDIDATE SERVICE] Assessment started successfully', {
        browser: browser.name,
        hasSessionToken: !!response.data.session_token,
        totalQuestions: response.data.total_questions
      });

      return response.data;
    } catch (error) {
      console.error('[CANDIDATE SERVICE] Start assessment error:', {
        error,
        browser: browser.name,
        timestamp: new Date().toISOString()
      });

      if (axios.isAxiosError(error)) {
        // Check for session already active error
        const errorDetail = error.response?.data?.detail;
        if (typeof errorDetail === 'object' && errorDetail?.error === 'SESSION_ALREADY_ACTIVE') {
          throw new Error('SESSION_ALREADY_ACTIVE');
        }

        // Handle network errors with browser-specific hints
        if (error.code === 'ERR_NETWORK' || !error.response) {
          let networkError = 'Network error - please check your internet connection and try again';
          if (browser.name === 'Firefox') {
            networkError += ' (Firefox: Check if Enhanced Tracking Protection is blocking the connection)';
          } else if (browser.name === 'Safari' || browser.name === 'iOS Safari') {
            networkError += ' (Safari: Check if "Prevent Cross-Site Tracking" is interfering)';
          }
          throw new Error(networkError);
        }

        // Handle specific HTTP errors with more detail
        if (error.response?.status === 400) {
          const detailMsg = typeof errorDetail === 'string' ? errorDetail
            : errorDetail?.message || 'Invalid assessment or token expired';
          throw new Error(detailMsg);
        } else if (error.response?.status === 404) {
          throw new Error('Assessment not found - the link may have expired or been deleted');
        } else if (error.response?.status === 403) {
          throw new Error('Access denied - this assessment may no longer be available or has already been completed');
        } else if (error.response?.status === 409) {
          throw new Error('This assessment is already open in another browser tab or device. Please close other sessions and try again.');
        } else if (error.response?.status >= 500) {
          throw new Error('Server temporarily unavailable - please wait a moment and try again');
        }

        // Generic error with backend detail if available
        const fallbackMsg = typeof errorDetail === 'string' ? errorDetail
          : errorDetail?.message || 'Failed to start assessment - please refresh and try again';
        throw new Error(fallbackMsg);
      }

      // Handle non-Axios errors (browser-specific issues)
      if (error instanceof Error) {
        // Browser-specific errors (e.g., CORS, CSP violations)
        if (error.message.includes('fetch') || error.message.includes('CORS')) {
          let corsError = 'Connection error - please refresh the page and try again';
          if (browser.name === 'Firefox') {
            corsError += ' (Check Firefox tracking protection settings)';
          }
          throw new Error(corsError);
        }

        // Timeout errors
        if (error.message.includes('timeout')) {
          throw new Error('Request timed out - please check your internet connection and try again');
        }

        throw new Error(error.message);
      }

      throw new Error('Unexpected error - please refresh the page and try again');
    }
  },

  /**
   * Get current question
   */
  /** All questions of the running attempt in one call (palette navigation is then local). */
  async getAllQuestions(token: string): Promise<{ total_questions: number; questions: CurrentQuestion[]; all_question_statuses: QuestionStatusInfo[] }> {
    const response = await candidateApi.get(`/candidate/assessment/${token}/questions`);
    return response.data;
  },

  async getCurrentQuestion(token: string, questionNumber?: number): Promise<CurrentQuestion> {
    try {
      const params = questionNumber ? { question_number: questionNumber } : {};
      const response = await candidateApi.get<CurrentQuestion>(
        `/candidate/assessment/${token}/question`,
        { params }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.detail || 'Failed to get question');
      }
      throw error;
    }
  },

  /**
   * Submit answer for current question
   */
  async submitAnswer(
    token: string,
    questionId: string,
    answer: AnswerSubmission
  ): Promise<SubmitAnswerResponse> {
    try {
      const response = await candidateApi.post<SubmitAnswerResponse>(
        `/candidate/assessment/${token}/answer`,
        {
          question_id: questionId,
          ...answer,
        }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.detail || 'Failed to submit answer');
      }
      throw error;
    }
  },

  /**
   * Save answer as draft (auto-save, editable)
   * This saves the answer without locking it, allowing the candidate to edit later
   */
  async saveDraft(
    token: string,
    questionId: string,
    answer: Omit<AnswerSubmission, 'is_draft'>
  ): Promise<{
    success: boolean;
    message: string;
    auto_saved_at: string;
  }> {
    try {
      const response = await candidateApi.post(
        `/candidate/assessment/${token}/answer`,
        {
          question_id: questionId,
          ...answer,
          is_draft: true, // Always true for draft saves
        }
      );
      return {
        success: true,
        message: 'Draft saved successfully',
        auto_saved_at: new Date().toISOString(),
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // Draft saves should fail silently to not disrupt the user experience
        console.warn('Failed to save draft:', error.response?.data?.detail);
        throw new Error(error.response?.data?.detail || 'Failed to save draft');
      }
      throw error;
    }
  },

  /**
   * Get available languages for a specific assessment attempt
   * Filters out languages that don't have compilers available
   */
  async getAvailableLanguages(
    attemptId: string
  ): Promise<{
    available_languages: Array<{
      code: string;
      display_name: string;
      compiler_info: {
        language: string;
        version: string;
      };
      available: boolean;
    }>;
    unavailable_languages: Array<{
      code: string;
      display_name: string;
      available: boolean;
      reason: string;
    }>;
    total_assigned: number;
    total_available: number;
  }> {
    try {
      const response = await candidateApi.get(
        `/candidate/assessment/${attemptId}/available-languages`
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.warn('Failed to fetch available languages:', error.response?.data?.detail);
        // Return empty arrays if endpoint fails - fallback to showing all languages
        return {
          available_languages: [],
          unavailable_languages: [],
          total_assigned: 0,
          total_available: 0,
        };
      }
      throw error;
    }
  },

  /**
   * Persist the candidate's chosen coding language for this attempt.
   * Used by the pre-assessment language picker (step 2). Server stores the
   * choice on AssessmentAttempt.browser_info and triggers question generation
   * when the attempt is in 'pending_lang_choice' status.
   */
  async chooseCodingLanguage(
    token: string,
    language: string
  ): Promise<{
    success: boolean;
    chosen_coding_language: string;
    already_set: boolean;
    attempt_status: string | null;
  }> {
    try {
      const response = await candidateApi.post(
        `/candidate/assessment/${token}/choose-language`,
        { language }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.detail || 'Failed to save language');
      }
      throw error;
    }
  },

  /**
   * Token-based variant for the pre-assessment coding language picker.
   * The picker doesn't have an attempt id yet (the picker happens at step 2,
   * before the attempt is fully started); the backend resolves the tenant via
   * the invitation token. Same response shape as getAvailableLanguages.
   */
  async getAvailableLanguagesByToken(
    token: string
  ): Promise<{
    available_languages: Array<{
      code: string;
      display_name: string;
      compiler_info: { language: string; version: string };
      available: boolean;
    }>;
    unavailable_languages: Array<{
      code: string;
      display_name: string;
      available: boolean;
      reason: string;
    }>;
    total_assigned: number;
    total_available: number;
  }> {
    try {
      const response = await candidateApi.get(
        `/candidate/assessment/${token}/available-languages-by-token`
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.warn('Failed to fetch available languages by token:', error.response?.data?.detail);
        return {
          available_languages: [],
          unavailable_languages: [],
          total_assigned: 0,
          total_available: 0,
        };
      }
      throw error;
    }
  },

  /**
   * Complete the assessment
   */
  async completeAssessment(token: string): Promise<CompleteAssessmentResponse> {
    try {
      const response = await candidateApi.post<CompleteAssessmentResponse>(
        `/candidate/assessment/${token}/complete`
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.detail || 'Failed to complete assessment');
      }
      throw error;
    }
  },

  /**
   * Record a proctoring termination: the attempt is closed as interrupted
   * (exited_at + termination_code) so the recruiter list shows "Terminated"
   * with the reason, and no further answers are accepted.
   */
  async exitAssessment(
    token: string,
    terminationCode: string,
    exitReason: string,
  ): Promise<{ success: boolean; message?: string; already_completed?: boolean }> {
    try {
      const response = await candidateApi.post(
        `/candidate/assessment/${token}/exit`,
        null,
        { params: { termination_code: terminationCode, exit_reason: exitReason } },
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.detail || 'Failed to record assessment exit');
      }
      throw error;
    }
  },

  /**
   * Upload one webcam-recording segment (S3 multipart part = segmentIndex + 1).
   * Native fetch, not axios: no Content-Type override, no interceptor size caps.
   */
  async uploadRecording(token: string, blob: Blob, segmentIndex = 0, isFinal = false, recorderStartedAt?: string): Promise<{ message: string; path: string | null; completed?: boolean }> {
    const formData = new FormData();
    formData.append('file', blob, 'recording.webm');
    formData.append('segment_index', String(segmentIndex));
    formData.append('is_final', isFinal ? 'true' : 'false');
    // When the recorder started, so a violation's timestamp can be turned into
    // a position in the video. Sent every time; the server keeps the first.
    if (recorderStartedAt) formData.append('recorder_started_at', recorderStartedAt);
    const headers: Record<string, string> = {};
    const sessionToken = sessionTokenManager.getToken?.();
    if (sessionToken) headers['X-Session-Token'] = sessionToken;
    const response = await fetch(`${API_BASE_URL}/candidate/assessment/${token}/upload-recording`, { method: 'POST', body: formData, headers });
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Recording upload failed (${response.status}): ${errorText}`);
    }
    return response.json();
  },

  /** Upload one entire-screen recording segment (same contract as uploadRecording). */
  async uploadScreenRecording(token: string, blob: Blob, segmentIndex = 0, isFinal = false, recorderStartedAt?: string): Promise<{ message: string; path: string | null; completed?: boolean }> {
    const formData = new FormData();
    formData.append('file', blob, 'screen.webm');
    formData.append('segment_index', String(segmentIndex));
    formData.append('is_final', isFinal ? 'true' : 'false');
    if (recorderStartedAt) formData.append('recorder_started_at', recorderStartedAt);
    const headers: Record<string, string> = {};
    const sessionToken = sessionTokenManager.getToken?.();
    if (sessionToken) headers['X-Session-Token'] = sessionToken;
    const response = await fetch(`${API_BASE_URL}/candidate/assessment/${token}/upload-screen-recording`, { method: 'POST', body: formData, headers });
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Screen recording upload failed (${response.status}): ${errorText}`);
    }
    return response.json();
  },

  /** Hide-share-bar vision gate (same verdict shape as the AI interview). */
  async verifyShareBarHidden(token: string, frame: Blob): Promise<{
    enabled: boolean; hidden: boolean; pip_detected: boolean; recorder_overlay_detected: boolean;
    foreign_app_detected: boolean; foreign_app_label?: string; interview_screen_present?: boolean;
    check_unavailable?: boolean; reason?: string;
  }> {
    const formData = new FormData();
    formData.append('file', frame, 'screen.jpg');
    const headers: Record<string, string> = {};
    const sessionToken = sessionTokenManager.getToken?.();
    if (sessionToken) headers['X-Session-Token'] = sessionToken;
    const response = await fetch(`${API_BASE_URL}/candidate/assessment/${token}/verify-share-bar`, { method: 'POST', body: formData, headers });
    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`Share-bar verification failed (${response.status}): ${errorText}`);
    }
    return response.json();
  },

  /**
   * Check time-based unit deduction thresholds
   * Called periodically to automatically deduct units when time thresholds are reached
   * Units are deducted from Control Plane via External API
   */
  async checkTimeBasedDeduction(token: string): Promise<{
    success: boolean;
    message: string;
    units_deducted_now?: number;
    units_deducted_so_far: number;
    threshold_reached?: string;
    time_percentage?: number;
    remaining_units?: number;
    completed?: boolean;
    next_threshold?: string;
  }> {
    try {
      const response = await candidateApi.post(
        `/candidate/assessment/${token}/check-time-deduction`
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.detail || 'Failed to check time deduction');
      }
      throw error;
    }
  },

  /**
   * Get assessment results
   * Returns null if results are still processing (overall_score is null)
   */
  async getResults(token: string): Promise<AssessmentResult> {
    try {
      const response = await candidateApi.get<AssessmentResult & { status?: string }>(
        `/candidate/assessment/${token}/result`
      );

      // Check if results are still processing
      if (response.data.status === 'processing' || response.data.overall_score === null) {
        // Return a partial result that frontend can detect
        return {
          ...response.data,
          overall_score: NaN,  // Frontend checks for NaN to detect incomplete results
        } as AssessmentResult;
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.detail || 'Failed to get results');
      }
      throw error;
    }
  },

  /**
   * Send heartbeat to keep session alive
   */
  async sendHeartbeat(token: string, options?: { tabVisible?: boolean; cameraActive?: boolean; screenShareActive?: boolean; clientRemainingSeconds?: number }): Promise<HeartbeatResponse> {
    try {
      const response = await candidateApi.post<HeartbeatResponse>(
        `/candidate/assessment/${token}/heartbeat`,
        {
          timestamp: new Date().toISOString(),
          tab_visible: options?.tabVisible ?? document.visibilityState === 'visible',
          camera_active: options?.cameraActive,
          screen_share_active: options?.screenShareActive,
          client_remaining_seconds: options?.clientRemainingSeconds,
        }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.detail || 'Heartbeat failed');
      }
      throw error;
    }
  },

  /**
   * Report proctor event (violations)
   */
  async reportProctorEvent(token: string, event: ProctorEvent): Promise<ProctorEventResponse> {
    try {
      const response = await candidateApi.post<ProctorEventResponse>(
        `/candidate/assessment/${token}/proctor-event`,
        {
          event_type: event.event_type,
          timestamp: event.timestamp || new Date().toISOString(),
          details: event.details || event.event_data || {},
        }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.detail || 'Failed to report event');
      }
      throw error;
    }
  },

  // ── Server "proctor frame" pipeline for the ASSESSMENT (flags
  // PROCTOR_VISION_SERVER_ENABLED + PROCTOR_VISION_ASSESSMENT_ENABLED). Same
  // contract as candidateAIInterviewService's; the server persists the events
  // itself. Never throws on HTTP status: callers branch on `status`.
  async getProctorFrameConfig(token: string): Promise<ProctorFrameConfig> {
    const res = await fetch(`${API_BASE_URL}/candidate/assessment/${token}/proctor-frame/config`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`proctor-frame config failed (${res.status})`);
    return res.json();
  },

  async sendProctorFrame(token: string, blob: Blob, ts: number): Promise<ProctorFrameSendResult> {
    const headers: Record<string, string> = { 'Content-Type': 'image/jpeg' };
    // Single-active-session guard: the server rejects frames (403) whose
    // session token doesn't match the attempt's, like /proctor-event.
    const sessionToken = sessionTokenManager.getToken(token);
    if (sessionToken) headers['X-Session-Token'] = sessionToken;
    const res = await fetch(
      `${API_BASE_URL}/candidate/assessment/${token}/proctor-frame?ts=${Math.round(ts)}`,
      { method: 'POST', headers, body: blob },
    );
    let body: any = null;
    try { body = await res.json(); } catch { /* non-JSON error body */ }
    return { status: res.status, body };
  },

  async endProctorFrames(token: string): Promise<void> {
    try {
      const headers: Record<string, string> = {};
      const sessionToken = sessionTokenManager.getToken(token);
      if (sessionToken) headers['X-Session-Token'] = sessionToken;
      // keepalive: this also runs from unmount / page teardown.
      await fetch(
        `${API_BASE_URL}/candidate/assessment/${token}/proctor-frame/end?ts=${Date.now()}`,
        { method: 'POST', keepalive: true, headers },
      );
    } catch { /* best-effort — the session state also expires server-side */ }
  },

  /**
   * Execute code and get results
   */
  async executeCode(
    language: string,
    code: string,
    stdin?: string,
    attemptId?: string,
    questionId?: string
  ): Promise<CodeExecutionResult> {
    try {
      const response = await candidateApi.post<CodeExecutionResult>(
        `/candidate/code/run`,
        {
          attempt_id: attemptId,
          question_id: questionId,
          language,
          code,
          stdin: stdin || '',
        }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          success: false,
          error: error.response?.data?.detail || 'Code execution failed',
          exit_code: 1
        };
      }
      return {
        success: false,
        error: 'Code execution failed',
        exit_code: 1
      };
    }
  },

  /**
   * Submit code solution for evaluation against all test cases
   */
  async submitCodeSolution(
    attemptId: string,
    questionId: string,
    language: string,
    code: string,
    codeInput?: string
  ): Promise<CodeSubmissionResult> {
    try {
      const response = await candidateApi.post<CodeSubmissionResult>(
        `/candidate/code/submit`,
        {
          attempt_id: attemptId,
          question_id: questionId,
          language,
          code,
          code_input: codeInput || '',
        }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        return {
          success: false,
          tests_passed: 0,
          tests_total: 0,
          test_results: [],
          score_percentage: 0,
          message: 'Submission failed',
          error: error.response?.data?.detail || 'Code submission failed',
        };
      }
      return {
        success: false,
        tests_passed: 0,
        tests_total: 0,
        test_results: [],
        score_percentage: 0,
        message: 'Submission failed',
        error: 'Code submission failed',
      };
    }
  },

  /**
   * Post-assessment candidate feedback (whole-star 1-5 ratings + optional
   * comment). Mirrors candidateAIInterviewService.submitFeedback.
   *
   * NOT swallowed like the fire-and-forget calls: the candidate is watching the
   * dialog, so a failure has to reach the UI as a retry rather than a fake
   * "thank you". The endpoint answers HTTP 200 even when it could not save, so
   * success lives in the BODY — a 200 alone does not mean it was stored.
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
    const response = await candidateApi.post<{ success: boolean; message: string }>(
      `/candidate/assessment/${token}/feedback`,
      {
        overall: feedback.overall ?? null,
        question_quality: feedback.question_quality ?? null,
        ai_experience: feedback.ai_experience ?? null,
        comment: (feedback.comment || '').slice(0, 500),
      },
    );
    return response.data;
  },
};

export default candidateService;
