'use client';

import { useState, useCallback } from 'react';
import {
  auditVerificationService,
  type ExpectedAuditEntry,
  type PendingVerification,
  type ReconciliationReport,
} from '@/lib/services/auditVerificationService';

interface UseAuditVerificationReturn {
  pending: PendingVerification[];
  isVerifying: boolean;
  progress: { current: number; total: number } | null;
  lastReport: ReconciliationReport | null;
  queueVerification: (expected: ExpectedAuditEntry) => void;
  verifyPending: () => Promise<ReconciliationReport>;
  retryNotFound: () => Promise<ReconciliationReport>;
  clearVerified: () => void;
  clearAll: () => void;
  refresh: () => void;
}

export function useAuditVerification(): UseAuditVerificationReturn {
  const [pending, setPending] = useState<PendingVerification[]>(() =>
    auditVerificationService.getPendingVerifications()
  );
  const [isVerifying, setIsVerifying] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [lastReport, setLastReport] = useState<ReconciliationReport | null>(null);

  const refresh = useCallback(() => {
    setPending(auditVerificationService.getPendingVerifications());
  }, []);

  const queueVerification = useCallback((expected: ExpectedAuditEntry) => {
    auditVerificationService.storePendingVerification(expected);
    refresh();
  }, [refresh]);

  const verifyPending = useCallback(async () => {
    setIsVerifying(true);
    setProgress({ current: 0, total: 0 });
    try {
      const report = await auditVerificationService.verifyAllPending(
        (current, total) => setProgress({ current, total })
      );
      setLastReport(report);
      refresh();
      return report;
    } finally {
      setIsVerifying(false);
      setProgress(null);
    }
  }, [refresh]);

  const retryNotFound = useCallback(async () => {
    setIsVerifying(true);
    setProgress({ current: 0, total: 0 });
    try {
      const report = await auditVerificationService.retryNotFound(
        (current, total) => setProgress({ current, total })
      );
      setLastReport(report);
      refresh();
      return report;
    } finally {
      setIsVerifying(false);
      setProgress(null);
    }
  }, [refresh]);

  const clearVerified = useCallback(() => {
    auditVerificationService.clearVerifiedEntries();
    refresh();
  }, [refresh]);

  const clearAll = useCallback(() => {
    auditVerificationService.clearAllEntries();
    refresh();
    setLastReport(null);
  }, [refresh]);

  return {
    pending,
    isVerifying,
    progress,
    lastReport,
    queueVerification,
    verifyPending,
    retryNotFound,
    clearVerified,
    clearAll,
    refresh,
  };
}
