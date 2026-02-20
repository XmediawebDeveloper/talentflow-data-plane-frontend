/**
 * Audit Log Verification Service
 *
 * Verifies that control plane audit entries correctly reflect
 * data plane actions (tenant, user, event type, timestamp).
 *
 * Uses localStorage for pending verification queue.
 * Queries GET /audits to fetch actual audit logs for comparison.
 */

import { handleUnauthorized } from './api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api/v1';
const STORAGE_KEY = 'talentflow_pending_verifications';
const MAX_PENDING = 500;

// --- Types ---

export type VerificationStatus = 'MATCH' | 'MISMATCH' | 'NOT_FOUND' | 'PENDING' | 'ERROR';

export interface ExpectedAuditEntry {
  action: string;
  entity_type: string;
  entity_id?: string;
  user_id?: string;
  user_email?: string;
  timestamp: string; // ISO string
  // Session tracking fields (Audit Logs & Error Codes doc)
  error_origin?: 'TENANT' | 'SYSTEM' | 'NONE';
  error_code?: string;
  module_type?: string;
}

export interface FieldMismatch {
  field: string;
  expected: string | undefined;
  actual: string | undefined;
}

export interface ActualAuditLog {
  id: string;
  tenant_id: string;
  user_id: string | null;
  user_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
  [key: string]: any;
}

export interface VerificationResult {
  status: VerificationStatus;
  expected: ExpectedAuditEntry;
  actual?: ActualAuditLog;
  mismatches: FieldMismatch[];
  verifiedAt: string;
  error?: string;
}

export interface ReconciliationReport {
  results: VerificationResult[];
  summary: {
    total: number;
    match: number;
    mismatch: number;
    notFound: number;
    error: number;
  };
  startedAt: string;
  completedAt: string;
}

export interface PendingVerification {
  id: string;
  expected: ExpectedAuditEntry;
  createdAt: string;
  verified: boolean;
  result?: VerificationResult;
}

// Operation type mapping: data plane action → audit log action
const OPERATION_MAP: Record<string, string> = {
  resume_upload: 'resume_upload',
  resume_scoring: 'scoring_complete',
  talent_match: 'ai_match_run',
  assessment: 'assessment_create',
  ai_interview: 'assessment_start',
  subscription_upgrade: 'subscription_upgrade',
  plan_upgrade: 'plan_upgrade',
  addon_purchase: 'addon_purchase',
  seats_purchase: 'seats_purchase',
  usage_recorded: 'usage_recorded',
  session_start: 'session_start',
  session_complete: 'session_complete',
  session_interrupted: 'session_interrupted',
};

// --- Helpers ---

const getAccessToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('accessToken');
};

const generateId = (): string => {
  return `av_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Service ---

/**
 * Fetch audit logs from GET /audits with filters
 */
async function fetchAuditLogs(params: {
  action?: string;
  entity_type?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  page_size?: number;
}): Promise<{ items: ActualAuditLog[]; total: number }> {
  const token = getAccessToken();
  if (!token) throw new Error('Not authenticated');

  const searchParams = new URLSearchParams();
  if (params.action) searchParams.append('action', params.action);
  if (params.entity_type) searchParams.append('entity_type', params.entity_type);
  if (params.start_date) searchParams.append('start_date', params.start_date);
  if (params.end_date) searchParams.append('end_date', params.end_date);
  searchParams.append('page', String(params.page || 1));
  searchParams.append('page_size', String(params.page_size || 50));

  const response = await fetch(`${API_URL}/audits?${searchParams}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.status === 401) {
    handleUnauthorized();
    throw new Error('Session expired');
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.detail || `Failed to fetch audit logs (${response.status})`);
  }

  const data = await response.json();
  return { items: data.items || [], total: data.total || 0 };
}

/**
 * Compare expected entry against actual audit log entry.
 * Returns list of field mismatches.
 */
function compareEntries(expected: ExpectedAuditEntry, actual: ActualAuditLog): FieldMismatch[] {
  const mismatches: FieldMismatch[] = [];

  // Map the operation type to the expected audit action
  const expectedAction = OPERATION_MAP[expected.action] || expected.action;
  if (expectedAction !== actual.action) {
    mismatches.push({ field: 'action', expected: expectedAction, actual: actual.action });
  }

  if (expected.entity_type && expected.entity_type !== actual.entity_type) {
    mismatches.push({ field: 'entity_type', expected: expected.entity_type, actual: actual.entity_type || undefined });
  }

  if (expected.user_id && actual.user_id && expected.user_id !== actual.user_id) {
    mismatches.push({ field: 'user_id', expected: expected.user_id, actual: actual.user_id });
  }

  // Timestamp proximity check: within 120 seconds
  if (expected.timestamp && actual.created_at) {
    const expectedTime = new Date(expected.timestamp).getTime();
    const actualTime = new Date(actual.created_at).getTime();
    const diffSeconds = Math.abs(expectedTime - actualTime) / 1000;
    if (diffSeconds > 120) {
      mismatches.push({
        field: 'timestamp',
        expected: expected.timestamp,
        actual: `${actual.created_at} (diff: ${Math.round(diffSeconds)}s)`,
      });
    }
  }

  // Compare error_origin if expected
  if (expected.error_origin && actual.error_origin && expected.error_origin !== actual.error_origin) {
    mismatches.push({ field: 'error_origin', expected: expected.error_origin, actual: actual.error_origin });
  }

  // Compare error_code if expected
  if (expected.error_code && actual.error_code && expected.error_code !== actual.error_code) {
    mismatches.push({ field: 'error_code', expected: expected.error_code, actual: actual.error_code });
  }

  return mismatches;
}

/**
 * Verify a single expected audit entry by querying audit logs.
 * Retries up to 3 times with 2s delay.
 */
async function verifySingleEntry(
  expected: ExpectedAuditEntry,
  options?: { maxRetries?: number; retryDelay?: number }
): Promise<VerificationResult> {
  const maxRetries = options?.maxRetries ?? 3;
  const retryDelay = options?.retryDelay ?? 2000;

  const expectedAction = OPERATION_MAP[expected.action] || expected.action;
  const expectedTime = new Date(expected.timestamp).getTime();
  const startDate = new Date(expectedTime - 5000).toISOString(); // -5s
  const endDate = new Date(expectedTime + 60000).toISOString();  // +60s

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { items } = await fetchAuditLogs({
        action: expectedAction,
        entity_type: expected.entity_type,
        start_date: startDate,
        end_date: endDate,
        page_size: 50,
      });

      if (items.length === 0) {
        if (attempt < maxRetries - 1) {
          await delay(retryDelay);
          continue;
        }
        return {
          status: 'NOT_FOUND',
          expected,
          mismatches: [],
          verifiedAt: new Date().toISOString(),
        };
      }

      // Find the best matching entry (closest timestamp, matching fields)
      let bestMatch: ActualAuditLog | null = null;
      let bestMismatches: FieldMismatch[] = [];

      for (const log of items) {
        const mismatches = compareEntries(expected, log);
        if (mismatches.length === 0) {
          return {
            status: 'MATCH',
            expected,
            actual: log,
            mismatches: [],
            verifiedAt: new Date().toISOString(),
          };
        }
        // Track the entry with fewest mismatches
        if (!bestMatch || mismatches.length < bestMismatches.length) {
          bestMatch = log;
          bestMismatches = mismatches;
        }
      }

      // If we found entries but all had mismatches
      if (bestMatch) {
        return {
          status: 'MISMATCH',
          expected,
          actual: bestMatch,
          mismatches: bestMismatches,
          verifiedAt: new Date().toISOString(),
        };
      }
    } catch (err) {
      if (attempt < maxRetries - 1) {
        await delay(retryDelay);
        continue;
      }
      return {
        status: 'ERROR',
        expected,
        mismatches: [],
        verifiedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  return {
    status: 'NOT_FOUND',
    expected,
    mismatches: [],
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * Run batch reconciliation on multiple expected entries.
 */
async function runReconciliation(entries: ExpectedAuditEntry[]): Promise<ReconciliationReport> {
  const startedAt = new Date().toISOString();
  const results: VerificationResult[] = [];

  for (const entry of entries) {
    const result = await verifySingleEntry(entry);
    results.push(result);
  }

  const summary = {
    total: results.length,
    match: results.filter(r => r.status === 'MATCH').length,
    mismatch: results.filter(r => r.status === 'MISMATCH').length,
    notFound: results.filter(r => r.status === 'NOT_FOUND').length,
    error: results.filter(r => r.status === 'ERROR').length,
  };

  return {
    results,
    summary,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

// --- localStorage Management ---

function loadPendingVerifications(): PendingVerification[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function savePendingVerifications(entries: PendingVerification[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

/**
 * Store a new pending verification entry.
 * Auto-prunes oldest entries if exceeding MAX_PENDING.
 */
function storePendingVerification(expected: ExpectedAuditEntry): PendingVerification {
  const entries = loadPendingVerifications();
  const entry: PendingVerification = {
    id: generateId(),
    expected,
    createdAt: new Date().toISOString(),
    verified: false,
  };

  entries.push(entry);

  // Prune oldest if over limit
  if (entries.length > MAX_PENDING) {
    entries.splice(0, entries.length - MAX_PENDING);
  }

  savePendingVerifications(entries);
  return entry;
}

/**
 * Get all pending verifications from localStorage.
 */
function getPendingVerifications(): PendingVerification[] {
  return loadPendingVerifications();
}

/**
 * Verify all pending (unverified) entries.
 * Updates localStorage with results.
 */
async function verifyAllPending(
  onProgress?: (current: number, total: number) => void
): Promise<ReconciliationReport> {
  const entries = loadPendingVerifications();
  const unverified = entries.filter(e => !e.verified);
  const startedAt = new Date().toISOString();
  const results: VerificationResult[] = [];

  for (let i = 0; i < unverified.length; i++) {
    onProgress?.(i + 1, unverified.length);
    const result = await verifySingleEntry(unverified[i].expected);
    results.push(result);

    // Update the entry in-place
    const idx = entries.findIndex(e => e.id === unverified[i].id);
    if (idx !== -1) {
      entries[idx].verified = true;
      entries[idx].result = result;
    }
  }

  savePendingVerifications(entries);

  const summary = {
    total: results.length,
    match: results.filter(r => r.status === 'MATCH').length,
    mismatch: results.filter(r => r.status === 'MISMATCH').length,
    notFound: results.filter(r => r.status === 'NOT_FOUND').length,
    error: results.filter(r => r.status === 'ERROR').length,
  };

  return {
    results,
    summary,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

/**
 * Clear all verified entries from localStorage.
 */
function clearVerifiedEntries(): void {
  const entries = loadPendingVerifications();
  const remaining = entries.filter(e => !e.verified);
  savePendingVerifications(remaining);
}

/**
 * Clear all entries from localStorage.
 */
function clearAllEntries(): void {
  savePendingVerifications([]);
}

/**
 * Re-verify entries that were NOT_FOUND (they may have appeared since last check).
 */
async function retryNotFound(
  onProgress?: (current: number, total: number) => void
): Promise<ReconciliationReport> {
  const entries = loadPendingVerifications();
  const notFound = entries.filter(e => e.verified && e.result?.status === 'NOT_FOUND');
  const startedAt = new Date().toISOString();
  const results: VerificationResult[] = [];

  for (let i = 0; i < notFound.length; i++) {
    onProgress?.(i + 1, notFound.length);
    const result = await verifySingleEntry(notFound[i].expected);
    results.push(result);

    const idx = entries.findIndex(e => e.id === notFound[i].id);
    if (idx !== -1) {
      entries[idx].result = result;
    }
  }

  savePendingVerifications(entries);

  const summary = {
    total: results.length,
    match: results.filter(r => r.status === 'MATCH').length,
    mismatch: results.filter(r => r.status === 'MISMATCH').length,
    notFound: results.filter(r => r.status === 'NOT_FOUND').length,
    error: results.filter(r => r.status === 'ERROR').length,
  };

  return {
    results,
    summary,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

export const auditVerificationService = {
  fetchAuditLogs,
  verifySingleEntry,
  compareEntries,
  runReconciliation,
  storePendingVerification,
  getPendingVerifications,
  verifyAllPending,
  clearVerifiedEntries,
  clearAllEntries,
  retryNotFound,
  OPERATION_MAP,
};

export default auditVerificationService;
