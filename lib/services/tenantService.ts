/**
 * Tenant Service
 * Handles tenant-related API calls
 */

import api, { handleApiError } from './api';

export interface TenantInfo {
  id: string;
  name: string;
  subdomain: string | null;
  custom_domain: string | null;
  status?: string;
  admin_email?: string;
  phone_number?: string;
  company_size?: string;
  display_name?: string;
  created_at?: string;
  activated_at?: string;
  user_limit?: number;
  storage_limit_gb?: number;
}

export const tenantService = {
  /**
   * Get current tenant information
   */
  async getCurrentTenant(): Promise<TenantInfo> {
    try {
      const response = await api.get<TenantInfo>('/tenants/current');
      return response.data;
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },

  /**
   * Get tenant's email domain
   * Returns custom_domain if set, otherwise subdomain.com
   */
  async getTenantEmailDomain(): Promise<string> {
    try {
      const tenant = await this.getCurrentTenant();

      // Prefer custom_domain if available
      if (tenant.custom_domain) {
        return tenant.custom_domain;
      }

      // Otherwise use subdomain.com
      if (tenant.subdomain) {
        return `${tenant.subdomain}.com`;
      }

      throw new Error('No domain configured for tenant');
    } catch (error) {
      throw new Error(handleApiError(error));
    }
  },
};
