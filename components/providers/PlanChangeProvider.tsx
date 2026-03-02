'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { planChangeService } from '@/lib/services/planChangeService';
import { PLAN_CHANGE_PENDING_EVENT } from '@/lib/services/api';
import { toast } from 'sonner';
import type {
  PlanChangeNotification,
  PlanChangeUrgency,
} from '@/lib/types/planChanges';

const DISMISS_KEY = 'tf_plan_change_reminder_dismissed';

interface PlanChangeContextType {
  hasPendingChanges: boolean;
  isSuspendedDueToPlanChange: boolean;
  isInAcceptancePeriod: boolean;
  urgency: PlanChangeUrgency;
  daysRemaining: number | null;
  currentChange: PlanChangeNotification | null;
  pendingChanges: PlanChangeNotification[];
  showReviewModal: boolean;
  openReviewModal: () => void;
  closeReviewModal: () => void;
  acceptChange: () => Promise<boolean>;
  rejectChange: (reason: string) => Promise<boolean>;
  dismissReminder: () => void;
  reminderDismissed: boolean;
  checkStatus: () => Promise<void>;
  loading: boolean;
}

const PlanChangeContext = createContext<PlanChangeContextType>({
  hasPendingChanges: false,
  isSuspendedDueToPlanChange: false,
  isInAcceptancePeriod: false,
  urgency: 'info',
  daysRemaining: null,
  currentChange: null,
  pendingChanges: [],
  showReviewModal: false,
  openReviewModal: () => {},
  closeReviewModal: () => {},
  acceptChange: async () => false,
  rejectChange: async () => false,
  dismissReminder: () => {},
  reminderDismissed: false,
  checkStatus: async () => {},
  loading: true,
});

function deriveUrgency(daysRemaining: number | null): PlanChangeUrgency {
  if (daysRemaining === null) return 'info';
  if (daysRemaining <= 2) return 'critical';
  if (daysRemaining <= 7) return 'warning';
  return 'info';
}

export function PlanChangeProvider({ children }: { children: React.ReactNode }) {
  const [pendingChanges, setPendingChanges] = useState<PlanChangeNotification[]>([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reminderDismissed, setReminderDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSuspendedDueToPlanChange, setIsSuspendedDueToPlanChange] = useState(false);

  useEffect(() => {
    try {
      const dismissed = sessionStorage.getItem(DISMISS_KEY);
      if (dismissed === 'true') setReminderDismissed(true);
    } catch {
      // sessionStorage unavailable
    }
  }, []);

  const fetchPendingChanges = useCallback(async () => {
    try {
      const changes = await planChangeService.getPendingChanges();
      const pending = Array.isArray(changes)
        ? changes.filter((c) => c.status === 'pending')
        : [];
      setPendingChanges(pending);

      // If there are pending changes and we got here from a 403, mark as suspended
      if (pending.length > 0 && isSuspendedDueToPlanChange) {
        // Keep the suspended state
      } else if (pending.length === 0) {
        setIsSuspendedDueToPlanChange(false);
      }
    } catch (error) {
      console.error('[PlanChange] Failed to fetch pending changes:', error);
      setPendingChanges([]);
    } finally {
      setLoading(false);
    }
  }, [isSuspendedDueToPlanChange]);

  // Initial fetch
  useEffect(() => {
    fetchPendingChanges();
  }, [fetchPendingChanges]);

  // Listen for plan change events (from WebSocket or API interceptor)
  useEffect(() => {
    const handlePlanChangeEvent = () => {
      console.log('[PlanChange] Received plan-change-pending event, refetching...');
      // When coming from a 403 SUSPENDED, mark as suspended
      setIsSuspendedDueToPlanChange(true);
      fetchPendingChanges();
    };

    window.addEventListener(PLAN_CHANGE_PENDING_EVENT, handlePlanChangeEvent);
    return () => {
      window.removeEventListener(PLAN_CHANGE_PENDING_EVENT, handlePlanChangeEvent);
    };
  }, [fetchPendingChanges]);

  const hasPendingChanges = pendingChanges.length > 0;

  const currentChange = pendingChanges[0] ?? null;

  const daysRemaining = useMemo(() => {
    if (!currentChange) return null;
    return currentChange.days_remaining ?? null;
  }, [currentChange]);

  const urgency = deriveUrgency(daysRemaining);

  const isInAcceptancePeriod = hasPendingChanges && !isSuspendedDueToPlanChange;

  const openReviewModal = useCallback(() => setShowReviewModal(true), []);
  const closeReviewModal = useCallback(() => setShowReviewModal(false), []);

  const acceptChange = useCallback(async (): Promise<boolean> => {
    if (!currentChange) return false;
    try {
      await planChangeService.acceptChange(currentChange.id);

      // Remove accepted change from list
      setPendingChanges((prev) => {
        const updated = prev.filter((c) => c.id !== currentChange.id);
        if (updated.length === 0) {
          setShowReviewModal(false);
          setIsSuspendedDueToPlanChange(false);
        }
        return updated;
      });

      // Dispatch event so QuotaContext refreshes
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('planChanged'));
      }

      toast.success('Plan changes accepted. Your subscription continues with the updated terms.');
      return true;
    } catch (error) {
      console.error('[PlanChange] Failed to accept change:', error);
      toast.error('Failed to accept plan changes. Please try again.');
      return false;
    }
  }, [currentChange]);

  const rejectChange = useCallback(async (reason: string): Promise<boolean> => {
    if (!currentChange) return false;
    try {
      const result = await planChangeService.rejectChange(currentChange.id, reason);

      setPendingChanges((prev) => {
        const updated = prev.filter((c) => c.id !== currentChange.id);
        if (updated.length === 0) {
          setShowReviewModal(false);
          setIsSuspendedDueToPlanChange(false);
        }
        return updated;
      });

      toast.warning(`Plan changes rejected. Your subscription will end on ${result.subscription_end_date}.`);
      return true;
    } catch (error) {
      console.error('[PlanChange] Failed to reject change:', error);
      toast.error('Failed to reject plan changes. Please try again.');
      return false;
    }
  }, [currentChange]);

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
    await fetchPendingChanges();
  }, [fetchPendingChanges]);

  const value = useMemo<PlanChangeContextType>(() => ({
    hasPendingChanges,
    isSuspendedDueToPlanChange,
    isInAcceptancePeriod,
    urgency,
    daysRemaining,
    currentChange,
    pendingChanges,
    showReviewModal,
    openReviewModal,
    closeReviewModal,
    acceptChange,
    rejectChange,
    dismissReminder,
    reminderDismissed,
    checkStatus,
    loading,
  }), [
    hasPendingChanges, isSuspendedDueToPlanChange, isInAcceptancePeriod,
    urgency, daysRemaining, currentChange, pendingChanges,
    showReviewModal, openReviewModal, closeReviewModal,
    acceptChange, rejectChange, dismissReminder, reminderDismissed,
    checkStatus, loading,
  ]);

  return (
    <PlanChangeContext.Provider value={value}>
      {children}
    </PlanChangeContext.Provider>
  );
}

export function usePlanChange() {
  return useContext(PlanChangeContext);
}

export default PlanChangeContext;
