/**
 * Candidate Assessment Service
 * Public API for candidates taking assessments
 */

import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';

// Create a separate axios instance for candidate (no auth interceptors)
const candidateApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

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
  technical_percentage: number;
  coding_percentage: number;
  invitation_status: string;
  consent_accepted: boolean;
  expires_at: string | null;
  attempt_id: string | null;
  attempt_status: string | null;
  can_start: boolean;
  can_resume: boolean;
  message: string;
}

export interface ConsentResponse {
  success: boolean;
  consent_accepted: boolean;
  consent_accepted_at: string;
  consent_ip: string;
  message: string;
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
  } | null;
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
}

export interface AnswerSubmission {
  answer_type?: 'text' | 'video' | 'mcq' | 'code';  // Auto-detected by backend if not provided
  text_response?: string;
  video_response_url?: string;
  selected_options?: string[];
  code_submission?: string;
  language?: string;
  time_taken_seconds?: number;  // Time spent on question
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
  score: number;
  points_earned: number;
  points_possible: number;
  is_correct: boolean;
  feedback: string;
  strengths: string[];
  areas_for_improvement: string[];
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
  event_type: 'tab_switch' | 'copy_attempt' | 'paste_attempt' | 'fullscreen_exit' | 'window_blur' | 'camera_disabled' | 'screen_share_stopped';
  event_data?: Record<string, unknown>;
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

export interface PrepareAssessmentResponse {
  attempt_id: string;
  status: 'pending_system_check' | 'generating' | 'ready';
  message: string;
}

export interface GenerationStatusResponse {
  status: 'not_started' | 'generating' | 'ready' | 'failed';
  questions_ready: boolean;
  total_questions: number;
  message: string;
}

// ===================== API Functions =====================

export const candidateService = {
  /**
   * Get assessment information for a candidate token
   */
  async getAssessmentInfo(token: string): Promise<AssessmentInfo> {
    try {
      const response = await candidateApi.get<AssessmentInfo>(`/candidate/assessment/${token}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.detail || 'Failed to get assessment info');
      }
      throw error;
    }
  },

  /**
   * Accept terms and consent
   */
  async acceptConsent(token: string, termsAccepted: boolean = true, proctoringConsent: boolean = true): Promise<ConsentResponse> {
    try {
      const response = await candidateApi.post<ConsentResponse>(`/candidate/assessment/${token}/consent`, {
        terms_accepted: termsAccepted,
        proctoring_consent: proctoringConsent,
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.detail || 'Failed to accept consent');
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
   */
  async startAssessment(token: string): Promise<StartAssessmentResponse> {
    try {
      const response = await candidateApi.post<StartAssessmentResponse>(
        `/candidate/assessment/${token}/start`
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(error.response?.data?.detail || 'Failed to start assessment');
      }
      throw error;
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
   * Get assessment results
   */
  async getResults(token: string): Promise<AssessmentResult> {
    try {
      const response = await candidateApi.get<AssessmentResult>(
        `/candidate/assessment/${token}/result`
      );
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
          timestamp: new Date().toISOString(),
          details: event.event_data,
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
  async executeCode(language: string, code: string, stdin?: string): Promise<CodeExecutionResult> {
    try {
      const response = await candidateApi.post<CodeExecutionResult>(
        `/candidate/code/run`,
        {
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
};

export default candidateService;
