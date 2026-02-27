'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { termsService } from '@/lib/services/termsService';
import type { TermsAndConditions, TermsAcceptanceStatus, TermsUrgency } from '@/lib/types/terms';

const DISMISS_KEY = 'tf_terms_reminder_dismissed';

interface TermsContextType {
  /** Whether the tenant needs to accept current T&C */
  needsAcceptance: boolean;
  /** Whether the grace period has expired (blocks access) */
  isBlocked: boolean;
  /** Whether the tenant is in grace period */
  isInGracePeriod: boolean;
  /** Urgency level based on days remaining */
  urgency: TermsUrgency;
  /** Days remaining in grace period */
  daysRemaining: number | null;
  /** Current T&C content */
  currentTerms: TermsAndConditions | null;
  /** Whether the acceptance modal is visible */
  showAcceptanceModal: boolean;
  /** Open the acceptance modal */
  openAcceptanceModal: () => void;
  /** Close the acceptance modal */
  closeAcceptanceModal: () => void;
  /** Accept the current terms */
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
  const [status, setStatus] = useState<TermsAcceptanceStatus | null>(null);
  const [currentTerms, setCurrentTerms] = useState<TermsAndConditions | null>(null);
  const [showAcceptanceModal, setShowAcceptanceModal] = useState(false);
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check dismiss state from sessionStorage
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
      const [statusData, termsData] = await Promise.all([
        termsService.getAcceptanceStatus(),
        termsService.getCurrentTerms(),
      ]);
      setStatus(statusData);
      setCurrentTerms(termsData);
    } catch (error) {
      // T&C API failure: app loads normally, no blocking
      console.error('[Terms] Failed to fetch T&C status:', error);
      setStatus(null);
      setCurrentTerms(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // If current_terms_id is null, no T&C published yet — proceed normally
  const needsAcceptance = status ? (!status.has_accepted_current && !!status.current_terms_id) : false;

  const isInGracePeriod = useMemo(() => {
    if (!needsAcceptance || !status?.grace_period_end) return false;
    return new Date(status.grace_period_end) > new Date();
  }, [needsAcceptance, status]);

  const isBlocked = needsAcceptance && !isInGracePeriod;

  const daysRemaining = status?.days_remaining ?? null;
  const urgency = deriveUrgency(daysRemaining);

  const openAcceptanceModal = useCallback(() => setShowAcceptanceModal(true), []);
  const closeAcceptanceModal = useCallback(() => setShowAcceptanceModal(false), []);

  const acceptTerms = useCallback(async (): Promise<boolean> => {
    if (!currentTerms) return false;
    try {
      await termsService.acceptTerms(currentTerms.id);
      // Refresh status after acceptance
      const newStatus = await termsService.getAcceptanceStatus(true);
      setStatus(newStatus);
      setShowAcceptanceModal(false);
      return true;
    } catch (error) {
      console.error('[Terms] Failed to accept terms:', error);
      return false;
    }
  }, [currentTerms]);

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
    currentTerms, showAcceptanceModal, openAcceptanceModal, closeAcceptanceModal,
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
