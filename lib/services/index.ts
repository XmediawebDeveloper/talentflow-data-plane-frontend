/**
 * TalentFlow API Services
 * Export all services for easy imports
 */

// Base API
export {
  default as api,
  setTokens,
  getTokens,
  clearTokens,
  handleApiError,
  // Permission version helpers
  getPermissionVersion,
  setPermissionVersion,
  clearPermissionVersion,
} from './api';

// Auth
export { authService, isTwoFactorRequired } from './authService';
export type { User, LoginRequest, LoginResponse, TwoFactorRequiredResponse, LoginResult } from './authService';

// Job Descriptions
export { jdService } from './jdService';
export type {
  JDCreate,
  JDResponse,
  JDListResponse,
  JDExtractedParams,
  JDGenerateResponse,
  JDLocation,
} from './jdService';

// Resumes & Folders
export { resumeService, folderService } from './resumeService';
export type {
  Resume,
  ResumeListResponse,
  UploadBatchResponse,
  UploadItemStatus,
  Folder,
} from './resumeService';

// AI Talent Match
export { aiMatchService } from './aiMatchService';
export type {
  // AIMatchResponse removed: no such type is declared in ./aiMatchService (the closest is
  // AIMatchSessionResponse) and nothing imported it from this barrel. Type-only export,
  // so dropping it emits no runtime change.
  AIMatchResultItem,
  AIMatchSessionListResponse,
} from './aiMatchService';

// Resume Scoring
export { scoringService } from './scoringService';
export type {
  ScoringResponse,
  ScoreDetailResponse,
  ScoreBreakdownItem,
  ScoredResumeListResponse,
  BulkScoringResponse,
  BulkScoringItemStatus,
} from './scoringService';

// Assessments
export { assessmentService, candidateAssessmentService } from './assessmentService';
export type {
  AssessmentCreate,
  AssessmentResponse,
  AssessmentListResponse,
  InvitationCreate,
  InvitationResponse,
  AssessmentAttemptResponse,
  AssessmentResultsListResponse,
  // New API types
  AssessmentStatsResponse,
  AssessmentCloneRequest,
  AssessmentCloneResponse,
  ExportFormat,
  AuditLogResponse,
  AuditTrailListResponse,
  // Combined Audit Trail types
  AuditActivityCategory,
  AuditActivityType,
  CombinedAuditActivity,
  CombinedAuditTrailResponse,
  RefundRequestCreate,
  RefundRequestResponse,
  RefundAction,
  RefundProcessRequest,
  RefundProcessResponse,
  // Detailed Result types
  DetailedResultResponse,
  ProctoringStats,
} from './assessmentService';

// User Management
export { userService } from './userService';
export type {
  ApiUser,
  UserPermissions,
  CreateUserRequest,
  UpdateUserRequest,
} from './userService';

// Team Management
export { default as teamService } from './teamService';
export type {
  Team,
  TeamMember,
  TeamStats,
  CreateTeamRequest,
  UpdateTeamRequest,
} from './teamService';

// Master Data
export { masterDataService } from './masterDataService';
export type {
  ExperienceLevel,
  EducationLevel,
  IndustryType,
  MasterDataResponse,
  ExperienceLevelCreate,
  EducationLevelCreate,
  IndustryTypeCreate,
} from './masterDataService';

// RBAC & Feature Permissions (RBAC01-07)
export { featurePermissionService } from './featurePermissionService';
export type {
  FeatureFlagCode,
  UserFeatureFlagsResponse,
  AvailableFeaturesResponse,
  FeatureFlagAssignRequest,
  BulkFeatureFlagRequest,
  DependencyValidationRequest,
  DependencyValidationResponse,
  DependencyMatrixResponse,
  UserDependencyStatusResponse,
  UserLimitsResponse,
  BillingAccessResponse,
  ViewerAccessResponse,
} from './featurePermissionService';

// RBAC Service
export { default as rbacService } from './rbacService';

// Unit Pool Service (UN01)
export { unitPoolService, getUnitTypeName, formatUsagePercentage, getUsageStatus, getStatusColor } from './unitPoolService';
export type {
  UnitType,
  UnitPoolStatus,
  AllPoolsResponse,
  ConsumptionLogEntry,
  AdjustmentLogEntry,
  UsageSummaryResponse,
  CheckAvailabilityResponse,
  ConsumeUnitsRequest,
  ConsumeUnitsResponse,
  AdjustUnitsRequest,
  SetUnitsRequest,
  InitializePoolRequest,
} from './unitPoolService';

// Internal Support Tickets
export { internalTicketService } from './internalTicketService';
export type {
  InternalTicket,
  InternalTicketCategory,
  InternalTicketPriority,
  InternalTicketStatus,
  InternalTicketListResponse,
  InternalTicketStats,
  InternalTicketAdminStats,
  InternalTicketResponseItem,
  CreateInternalTicketRequest,
  UpdateInternalTicketRequest,
  InternalTicketFilterParams,
} from './internalTicketService';

// Audit Verification
export { auditVerificationService } from './auditVerificationService';
export type {
  VerificationStatus,
  ExpectedAuditEntry,
  FieldMismatch,
  ActualAuditLog,
  VerificationResult,
  ReconciliationReport,
  PendingVerification,
} from './auditVerificationService';

// Candidate Assessment (Public)
export { candidateService } from './candidateService';
export type {
  AssessmentInfo,
  ConsentResponse,
  SystemCheckResult,
  SystemCheckResponse,
  CurrentQuestion,
  QuestionOption,
  QuestionStatusInfo,
  StartAssessmentResponse,
  AssessmentProctoringSettings,
  AnswerSubmission,
  SubmitAnswerResponse,
  CompleteAssessmentResponse,
  AssessmentResult,
  QuestionEvaluation,
  RoundScore,
  CandidateInsights,
  TimeAnalysis,
  HeartbeatResponse,
  ProctorEvent,
  ProctorEventResponse,
} from './candidateService';

// AI Interview
export { aiInterviewService } from './aiInterviewService';
export type {
  AIInterviewCreate,
  AIInterviewUpdate,
  AIInterviewResponse,
  AIInterviewListResponse,
  AIInterviewStatsResponse,
  SendInviteRequest,
  ConsentRequest,
  SystemCheckRequest,
  CompleteInterviewRequest,
  AIInterviewSettingsResponse,
  AIInterviewSettingsUpdate,
} from './aiInterviewService';
