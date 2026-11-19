'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { termsService } from '@/lib/services/termsService';
import type { DocumentType } from '@/lib/services/termsService';
import type { TermsAndConditions, TermsAcceptanceStatus, TermsUrgency } from '@/lib/types/terms';

const DISMISS_KEY = 'tf_terms_reminder_dismissed';

const ALL_DOCUMENT_TYPES: DocumentType[] = ['TERMS_AND_CONDITIONS', 'PRIVACY_POLICY', 'COOKIES_POLICY'];

interface PendingDocument {
  documentType: DocumentType;
  content: TermsAndConditions;
  status: TermsAcceptanceStatus;
}

interface TermsContextType {
  /** Whether any document needs acceptance */
  needsAcceptance: boolean;
  /** Whether any document's grace period has expired (blocks access) */
  isBlocked: boolean;
  /** Whether documents need acceptance but all are still in grace period */
  isInGracePeriod: boolean;
  /** Urgency level based on minimum days remaining */
  urgency: TermsUrgency;
  /** Minimum days remaining across all pending documents */
  daysRemaining: number | null;
  /** Content of the document currently being shown */
  currentTerms: TermsAndConditions | null;
  /** Document type of the document currently being shown */
  currentDocumentType: DocumentType | null;
  /** Step number for sequential acceptance (1, 2, 3…) */
  currentDocStep: number;
  /** Total number of documents requiring acceptance at load time */
  totalDocsRequired: number;
  /** Whether the acceptance modal is visible */
  showAcceptanceModal: boolean;
  /** Open the acceptance modal */
  openAcceptanceModal: () => void;
  /** Close the acceptance modal */
  closeAcceptanceModal: () => void;
  /** Accept the current document and advance to the next */
  acceptTerms: () => Promise<boolean>;
  /** Dismiss the reminder banner for this session */
  dismissReminder: () => void;
  /** Whether the reminder has been dismissed this session */
  reminderDismissed: boolean;
  /** Re-check status from API */
  checkStatus: () => Promise<void>;
  /** Loading state */
  loading: boolean;
}

const TermsContext = createContext<TermsContextType>({
  needsAcceptance: false,
  isBlocked: false,
  isInGracePeriod: false,
  urgency: 'info',
  daysRemaining: null,
  currentTerms: null,
  currentDocumentType: null,
  currentDocStep: 0,
  totalDocsRequired: 0,
  showAcceptanceModal: false,
  openAcceptanceModal: () => {},
  closeAcceptanceModal: () => {},
  acceptTerms: async () => false,
  dismissReminder: () => {},
  reminderDismissed: false,
  checkStatus: async () => {},
  loading: true,
});

function deriveUrgency(daysRemaining: number | null): TermsUrgency {
  if (daysRemaining === null) return 'info';
  if (daysRemaining <= 2) return 'critical';
  if (daysRemaining <= 7) return 'warning';
  return 'info';
}

export function TermsProvider({ children }: { children: React.ReactNode }) {
  const [pendingDocuments, setPendingDocuments] = useState<PendingDocument[]>([]);
  const [initialPendingCount, setInitialPendingCount] = useState(0);
  const [showAcceptanceModal, setShowAcceptanceModal] = useState(false);
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const dismissed = sessionStorage.getItem(DISMISS_KEY);
      if (dismissed === 'true') setReminderDismissed(true);
    } catch {
      // sessionStorage unavailable
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const results = await Promise.allSettled(
        ALL_DOCUMENT_TYPES.map(async (docType) => {
          const status = await termsService.getAcceptanceStatus(false, docType);
          // Only fetch content if acceptance is actually needed
          if (!status.has_accepted_current && status.current_terms_id) {
            const content = await termsService.getCurrentTerms(docType);
            return { documentType: docType, status, content };
          }
          return { documentType: docType, status, content: null };
        })
      );

      const pending: PendingDocument[] = [];
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value.content !== null) {
          pending.push(result.value as PendingDocument);
        } else if (result.status === 'rejected') {
          console.error('[Terms] Failed to fetch document status:', result.reason);
        }
      }

      setPendingDocuments(pending);
      setInitialPendingCount(pending.length);
    } catch (error) {
      console.error('[Terms] Failed to fetch T&C statuses:', error);
      setPendingDocuments([]);
      setInitialPendingCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const needsAcceptance = pendingDocuments.length > 0;

  // Blocked if ANY pending document has no grace period or its grace period has expired
  const isBlocked = useMemo(() => {
    if (!needsAcceptance) return false;
    return pendingDocuments.some((doc) => {
      if (!doc.status.grace_period_end) return true;
      return new Date(doc.status.grace_period_end) <= new Date();
    });
  }, [needsAcceptance, pendingDocuments]);

  // In grace period only if NOT blocked but some docs still need acceptance
  const isInGracePeriod = useMemo(() => {
    if (!needsAcceptance || isBlocked) return false;
    return pendingDocuments.some((doc) => {
      return !!doc.status.grace_period_end && new Date(doc.status.grace_period_end) > new Date();
    });
  }, [needsAcceptance, isBlocked, pendingDocuments]);

  // Minimum days remaining across all pending docs
  const daysRemaining = useMemo(() => {
    const values = pendingDocuments
      .map((d) => d.status.days_remaining)
      .filter((v): v is number => v !== null);
    if (values.length === 0) return null;
    return Math.min(...values);
  }, [pendingDocuments]);

  const urgency = deriveUrgency(daysRemaining);

  // Always show the first pending document
  const currentDoc = pendingDocuments[0] ?? null;
  const currentTerms = currentDoc?.content ?? null;
  const currentDocumentType = currentDoc?.documentType ?? null;
  const currentDocStep = initialPendingCount > 0
    ? initialPendingCount - pendingDocuments.length + 1
    : 0;

  const openAcceptanceModal = useCallback(() => setShowAcceptanceModal(true), []);
  const closeAcceptanceModal = useCallback(() => setShowAcceptanceModal(false), []);

  const acceptTerms = useCallback(async (): Promise<boolean> => {
    if (!currentDoc) return false;
    try {
      await termsService.acceptTerms(currentDoc.content.id, currentDoc.documentType);
      // Invalidate cache for this doc type
      await termsService.getAcceptanceStatus(true, currentDoc.documentType);

      setPendingDocuments((prev) => {
        const updated = prev.filter((d) => d.documentType !== currentDoc.documentType);
        if (updated.length === 0) {
          setShowAcceptanceModal(false);
        }
        return updated;
      });

      return true;
    } catch (error) {
      console.error('[Terms] Failed to accept document:', error);
      return false;
    }
  }, [currentDoc]);

  const dismissReminder = useCallback(() => {
    setReminderDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      // sessionStorage unavailable
    }
  }, []);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    await fetchStatus();
  }, [fetchStatus]);

  const value = useMemo<TermsContextType>(() => ({
    needsAcceptance,
    isBlocked,
    isInGracePeriod,
    urgency,
    daysRemaining,
    currentTerms,
    currentDocumentType,
    currentDocStep,
    totalDocsRequired: initialPendingCount,
    showAcceptanceModal,
    openAcceptanceModal,
    closeAcceptanceModal,
    acceptTerms,
    dismissReminder,
    reminderDismissed,
    checkStatus,
    loading,
  }), [
    needsAcceptance, isBlocked, isInGracePeriod, urgency, daysRemaining,
    currentTerms, currentDocumentType, currentDocStep, initialPendingCount,
    showAcceptanceModal, openAcceptanceModal, closeAcceptanceModal,
    acceptTerms, dismissReminder, reminderDismissed, checkStatus, loading,
  ]);

  return (
    <TermsContext.Provider value={value}>
      {children}
    </TermsContext.Provider>
  );
}

export function useTerms() {
  return useContext(TermsContext);
}

export default TermsContext;
