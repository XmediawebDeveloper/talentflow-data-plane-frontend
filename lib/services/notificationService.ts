/**
 * Notification Service
 * Handles notification API calls
 */

import api from './api';

// Types
export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  category: string;
  title: string;
  message: string;
  action_label: string | null;
  action_url: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  read_at: string | null;
  extra_data: Record<string, any> | null;
  created_at: string;
  time_ago: string;
}

export interface NotificationListResponse {
  notifications: Notification[];
  total: number;
  unread_count: number;
  has_more: boolean;
}

export interface NotificationCountResponse {
  total: number;
  unread: number;
  by_category: Record<string, number>;
}

export interface MarkReadResponse {
  marked_count: number;
  unread_remaining: number;
}

class NotificationService {
  /**
   * Get notifications for the current user
   */
  async getNotifications(
    limit: number = 20,
    offset: number = 0,
    unreadOnly: boolean = false,
    category?: string
  ): Promise<NotificationListResponse> {
    try {
      const params: any = { limit, offset };
      if (unreadOnly) params.unread_only = true;
      if (category) params.category = category;

      const response = await api.get('/notifications', { params });
      return response.data;
    } catch (error) {
      /* warn, not error: this read fails soft (empty list) and the caller
         refetches — a transient network drop here is routine, and
         console.error made Next.js dev raise its overlay on every one. */
      console.warn('Could not load notifications (will retry):', error);
      // Return empty response on error
      return {
        notifications: [],
        total: 0,
        unread_count: 0,
        has_more: false,
      };
    }
  }

  /**
   * Get notification counts
   */
  async getNotificationCounts(): Promise<NotificationCountResponse> {
    try {
      const response = await api.get('/notifications/count');
      return response.data;
    } catch (error) {
      /* warn, not error: the badge count is polled and fails soft to zeros —
         the next poll heals it, so a dropped request is not overlay-worthy. */
      console.warn('Could not load notification counts (will retry):', error);
      return { total: 0, unread: 0, by_category: {} };
    }
  }

  /**
   * Mark specific notifications as read
   */
  async markAsRead(notificationIds: string[]): Promise<MarkReadResponse> {
    try {
      const response = await api.post('/notifications/mark-read', {
        notification_ids: notificationIds,
      });
      return response.data;
    } catch (error) {
      console.error('Error marking notifications as read:', error);
      throw error;
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<{ marked_count: number; message: string }> {
    try {
      const response = await api.post('/notifications/mark-all-read');
      return response.data;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  }

  /**
   * Ensure welcome notification exists (idempotent, called on first dashboard login)
   */
  async ensureWelcomeNotification(params: {
    plan_name?: string;
    is_trial: boolean;
    days_remaining?: number;
    plan_tier?: string;
    billing_period?: string;
  }): Promise<{ status: 'created' | 'already_exists' }> {
    try {
      const response = await api.post('/notifications/welcome', params);
      return response.data;
    } catch (error) {
      console.error('Error ensuring welcome notification:', error);
      return { status: 'already_exists' };
    }
  }

  /**
   * Check subscription/quota status and create notifications as needed (idempotent)
   */
  async checkStatusNotifications(params: {
    plan_name?: string;
    is_trial: boolean;
    subscription_status?: string;
    plan_expiry_date?: string;
    trial_end_date?: string;
    quotas?: Record<string, { total_remaining: number; total_limit: number; is_unlimited: boolean }>;
  }): Promise<{ status: string; created: any[]; count: number }> {
    try {
      const response = await api.post('/notifications/check-status', params);
      return response.data;
    } catch (error: any) {
      console.error('Error checking status notifications:', error?.response?.status, error?.response?.data?.detail || error?.response?.data, 'payload:', JSON.stringify(params));
      return { status: 'error', created: [], count: 0 };
    }
  }

  /**
   * Delete a notification
   */
  async deleteNotification(notificationId: string): Promise<void> {
    try {
      await api.delete(`/notifications/${notificationId}`);
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw error;
    }
  }
}

const notificationService = new NotificationService();
export default notificationService;
