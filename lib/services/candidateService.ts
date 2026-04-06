/**
 * Candidate Assessment Service
 * Public API for candidates taking assessments
 */

import axios from 'axios';
import { safeLocalStorage, safeSessionStorage } from '@/lib/utils/browserCompat';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// ===================== Session Token Management =====================
// Manages single-session enforcement token with improved persistence

let currentSessionToken: string | null = null;
let currentAssessmentToken: string | null = null;

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
  (response) => response,
  (error) => {
    // Enhanced error logging for debugging browser-specific issues
    if (error.response) {
      // Server responded with error status
      console.error('[CANDIDATE API] Server error:', error.response.status, error.response.data);
    } else if (error.request) {
      // Request was made but no response received (network issues)
      console.error('[CANDIDATE API] Network error - no response received:', error.message);
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
  attempt_id: string | null;
  attempt_status: string | null;
  attempt_started_at: string | null;  // When attempt started - for timer resume on page refresh
  can_start: boolean;
  can_resume: boolean;
  message: string;
  session_token?: string;  // Session token for page refresh support
  proctoring_settings?: AssessmentProctoringSettings | null;
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
  score: number;
  points_earned: number;
  points_possible: number;
  is_correct: boolean;
  feedback: string;
  strengths: string[];
  areas_for_improvement: string[];
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
  elapsed_seconds: number;
  remaining_seconds: number;
}

export interface ProctorEvent {
  event_type:
    | 'tab_switch'
    | 'copy_attempt'
    | 'paste_attempt'
    | 'fullscreen_exit'
    | 'window_blur'
    | 'camera_disabled'
    | 'screen_share_stopped'
    | 'voice_detected'
    | 'multiple_voices'
    | 'microphone_disabled'
    | 'camera_obstructed'
    | 'screenshot_attempt'
    | 'screen_recording_attempt'
    | 'multiple_faces'
    | 'face_missing'
    | 'gaze_away'
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
  status: 'pending_system_check' | 'generating' | 'ready';
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
  status: 'not_started' | 'generating' | 'ready' | 'failed';
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
          throw new Error('Assessment not found. Please verify the link is correct.');
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

  /**
   * Prepare assessment - triggers background question generation
   * Call this when user clicks "Begin Assessment"
   */
  async prepareAssessment(token: string): Promise<PrepareAssessmentResponse> {
    try {
      const response = await candidateApi.post<PrepareAssessmentResponse>(
        `/candidate/assessment/${token}/prepare`
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
  async sendHeartbeat(token: string, options?: { tabVisible?: boolean; cameraActive?: boolean; screenShareActive?: boolean }): Promise<HeartbeatResponse> {
    try {
      const response = await candidateApi.post<HeartbeatResponse>(
        `/candidate/assessment/${token}/heartbeat`,
        {
          timestamp: new Date().toISOString(),
          tab_visible: options?.tabVisible ?? document.visibilityState === 'visible',
          camera_active: options?.cameraActive,
          screen_share_active: options?.screenShareActive,
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
};

export default candidateService;
