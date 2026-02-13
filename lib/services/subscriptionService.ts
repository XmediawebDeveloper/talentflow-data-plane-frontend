import api from './api';

/**
 * Subscription Service
 * Handles subscription and plan-related API calls
 */

/**
 * Get previous plan details for expired users
 * Single source of truth from Control Plane
 * @param tenantId - The tenant UUID
 * @returns Previous plan details (trial or paid)
 */
export const getPreviousPlan = async (tenantId: string) => {
  const response = await api.get(`/subscription/${tenantId}/previous-plan`);
  return response.data;
};

export default {
  getPreviousPlan,
};
