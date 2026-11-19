'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import {
  adminAssignedPlanService,
  type AdminAssignedPlan,
} from '@/lib/services/adminAssignedPlanService';
import { isOnline, isTransientNetworkError, withNetworkRetry } from '@/lib/utils/networkRetry';
import { takeBootstrapPart } from '@/lib/services/shellBootstrap';

const DISMISS_KEY = 'tf_admin_assigned_plan_banner_dismissed';

interface AdminAssignedPlanContextType {
  pendingPlan: AdminAssignedPlan | null;
  hasPendingPlan: boolean;
  loading: boolean;
  showPaymentModal: boolean;
  openPaymentModal: () => void;
  closePaymentModal: () => void;
  reminderDismissed: boolean;
  dismissReminder: () => void;
  refresh: () => Promise<void>;
  clearAfterPayment: () => void;
}

const AdminAssignedPlanContext = createContext<AdminAssignedPlanContextType>({
  pendingPlan: null,
  hasPendingPlan: false,
  loading: true,
  showPaymentModal: false,
  openPaymentModal: () => {},
  closePaymentModal: () => {},
  reminderDismissed: false,
  dismissReminder: () => {},
  refresh: async () => {},
  clearAfterPayment: () => {},
});

export function AdminAssignedPlanProvider({ children }: { children: React.ReactNode }) {
  const [pendingPlan, setPendingPlan] = useState<AdminAssignedPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [reminderDismissed, setReminderDismissed] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === 'true') {
        setReminderDismissed(true);
      }
    } catch {
      // sessionStorage unavailable — fine
    }
  }, []);

  const fetchPending = useCallback(async () => {
    // Offline (sleep/wake, VPN drop, dead WiFi) — skip the request entirely.
    // The `online` listener below re-runs this as soon as the browser reconnects.
    if (!isOnline()) {
      setLoading(false);
      return;
    }

    try {
      // First load: the app-shell /bootstrap response, if it carried this part.
      const boot = await takeBootstrapPart<{ data?: AdminAssignedPlan | null }>('admin_assigned_plan');
      const plan = boot.hit
        ? ((boot.data?.data as AdminAssignedPlan | null) ?? null)
        : await withNetworkRetry(() => adminAssignedPlanService.getPendingPlan());
      setPendingPlan(plan);
    } catch (err) {
      if (isTransientNetworkError(err)) {
        // Never reached the server. Keep the previously-loaded plan instead of
        // clearing it, so a connection blip can't hide a real payment banner.
        console.warn('[AdminAssignedPlan] Pending-plan check skipped (network unavailable), will retry');
      } else {
        // Detection is non-critical — never block the app on CP being unreachable.
        console.error('[AdminAssignedPlan] Failed to fetch pending plan:', err);
        setPendingPlan(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  // Polling fallback — matches PlanChangeProvider cadence
  useEffect(() => {
    const POLL_INTERVAL = 5 * 60 * 1000;
    const timer = setInterval(fetchPending, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [fetchPending]);

  // Re-check when the tab regains focus (Firefox private-mode safety)
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') fetchPending();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [fetchPending]);

  // Re-fetch as soon as connectivity returns — covers the fetches that were
  // skipped or failed transiently while the browser was offline.
  useEffect(() => {
    const handleOnline = () => fetchPending();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [fetchPending]);

  const openPaymentModal = useCallback(() => setShowPaymentModal(true), []);
  const closePaymentModal = useCallback(() => setShowPaymentModal(false), []);

  const dismissReminder = useCallback(() => {
    setReminderDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, 'true');
    } catch {
      // ignore
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    await fetchPending();
  }, [fetchPending]);

  // Optimistic clear after a successful payment, before the next poll lands
  const clearAfterPayment = useCallback(() => {
    setPendingPlan(null);
    setShowPaymentModal(false);
    try {
      sessionStorage.removeItem(DISMISS_KEY);
    } catch {
      // ignore
    }
    setReminderDismissed(false);
  }, []);

  const value = useMemo<AdminAssignedPlanContextType>(
    () => ({
      pendingPlan,
      hasPendingPlan: Boolean(pendingPlan),
      loading,
      showPaymentModal,
      openPaymentModal,
      closePaymentModal,
      reminderDismissed,
      dismissReminder,
      refresh,
      clearAfterPayment,
    }),
    [
      pendingPlan,
      loading,
      showPaymentModal,
      openPaymentModal,
      closePaymentModal,
      reminderDismissed,
      dismissReminder,
      refresh,
      clearAfterPayment,
    ],
  );

  return (
    <AdminAssignedPlanContext.Provider value={value}>
      {children}
    </AdminAssignedPlanContext.Provider>
  );
}

export function useAdminAssignedPlan() {
  return useContext(AdminAssignedPlanContext);
}

export default AdminAssignedPlanContext;
