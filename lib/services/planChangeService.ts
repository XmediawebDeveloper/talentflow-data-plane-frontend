import api from './api';
import type {
  PlanChangeNotification,
  PlanChangeAcceptResponse,
  PlanChangeRejectResponse,
} from '@/lib/types/planChanges';

export const planChangeService = {
  async getPendingChanges(): Promise<PlanChangeNotification[]> {
    // Background poller — bound the wait so a hung connection surfaces as a
    // retryable timeout instead of an XHR that never settles.
    const response = await api.get('/plan-changes/pending', { timeout: 15000 });
    return response.data?.data ?? response.data;
  },

  async getChangeDetails(notificationId: string): Promise<PlanChangeNotification> {
    const response = await api.get(`/plan-changes/${notificationId}`);
    return response.data;
  },

  async acceptChange(notificationId: string): Promise<PlanChangeAcceptResponse> {
    const response = await api.post(`/plan-changes/${notificationId}/accept`);
    return response.data;
  },

  async rejectChange(notificationId: string, reason: string): Promise<PlanChangeRejectResponse> {
    const response = await api.post(`/plan-changes/${notificationId}/reject`, { reason });
    return response.data;
  },
};
