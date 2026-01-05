/**
 * TalentFlow API Services
 * Export all services for easy imports
 */

// Base API
export { default as api, setTokens, getTokens, clearTokens, handleApiError } from './api';

// Auth
export { authService } from './authService';
export type { User, LoginRequest, LoginResponse } from './authService';

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
  AIMatchResponse,
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
  RefundRequestCreate,
  RefundRequestResponse,
  RefundAction,
  RefundProcessRequest,
  RefundProcessResponse,
} from './assessmentService';

// User Management
export { userService } from './userService';
export type {
  ApiUser,
  UserPermissions,
  CreateUserRequest,
  UpdateUserRequest,
} from './userService';

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
