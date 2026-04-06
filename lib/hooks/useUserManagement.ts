/**
 * User Management Hook
 * Provides data fetching for user management with API fallback to mock data
 */

import { useState, useEffect, useCallback } from 'react';
import { handleUnauthorized } from '@/lib/services/api';
import { formatISTDate } from '@/lib/utils/dateUtils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// Types
export interface UserData {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  credits: { ru: number; rs: number };
  status: 'Active' | 'Inactive' | 'Pending';
  lastActive: string;
  avatar?: string;
  invitationStatus?: 'Sent' | 'Pending' | 'Expired' | 'Accepted';
  invitationSentDate?: string;
  invitationExpiryDate?: string;
  phone?: string;
  jobTitle?: string;
}

export interface RoleData {
  id: number;
  name: string;
  displayName: string;
  description: string | null;
  isSystemRole: boolean;
  level: number;
  userCount: number;
  permissions: string[];
}

export interface UserCounts {
  total: number;
  active: number;
  inactive: number;
  pending: number;
}

// Mock data for fallback
const mockUsers: UserData[] = [
  {
    id: '1',
    name: 'Sarah Johnson',
    email: 'sarah.johnson@acme.com',
    role: 'Admin',
    department: 'Engineering',
    credits: { ru: 2500, rs: 150 },
    status: 'Active',
    lastActive: '2 hours ago',
    invitationStatus: 'Accepted',
    invitationSentDate: 'Nov 1, 2025'
  },
  {
    id: '2',
    name: 'John Anderson',
    email: 'john.anderson@acme.com',
    role: 'Admin',
    department: 'Operations',
    credits: { ru: 2200, rs: 120 },
    status: 'Active',
    lastActive: '1 hour ago',
    invitationStatus: 'Accepted',
    invitationSentDate: 'Nov 5, 2025'
  },
  {
    id: '3',
    name: 'Lisa Thompson',
    email: 'lisa.thompson@acme.com',
    role: 'Admin',
    department: 'HR',
    credits: { ru: 1900, rs: 110 },
    status: 'Active',
    lastActive: '3 hours ago',
    invitationStatus: 'Accepted',
    invitationSentDate: 'Nov 10, 2025'
  },
  {
    id: '4',
    name: 'Michael Chen',
    email: 'michael.chen@acme.com',
    role: 'User',
    department: 'Sales',
    credits: { ru: 0, rs: 0 },
    status: 'Pending',
    lastActive: 'Never',
    invitationStatus: 'Pending',
    invitationSentDate: 'Dec 1, 2025',
    invitationExpiryDate: 'Dec 8, 2025'
  },
  {
    id: '5',
    name: 'Emily Rodriguez',
    email: 'emily.rodriguez@acme.com',
    role: 'User',
    department: 'Marketing',
    credits: { ru: 0, rs: 0 },
    status: 'Inactive',
    lastActive: 'Never',
    invitationStatus: 'Expired',
    invitationSentDate: 'Nov 20, 2025',
    invitationExpiryDate: 'Nov 27, 2025'
  },
  {
    id: '6',
    name: 'David Kim',
    email: 'david.kim@acme.com',
    role: 'User',
    department: 'Engineering',
    credits: { ru: 0, rs: 0 },
    status: 'Pending',
    lastActive: 'Never',
    invitationStatus: 'Sent',
    invitationSentDate: 'Dec 4, 2025',
    invitationExpiryDate: 'Dec 11, 2025'
  },
  {
    id: '7',
    name: 'Jessica Taylor',
    email: 'jessica.taylor@acme.com',
    role: 'User',
    department: 'Operations',
    credits: { ru: 1500, rs: 60 },
    status: 'Active',
    lastActive: '2 days ago',
    invitationStatus: 'Accepted',
    invitationSentDate: 'Oct 15, 2025'
  },
  {
    id: '8',
    name: 'Thomas Wilson',
    email: 'thomas.wilson@acme.com',
    role: 'Viewer',
    department: 'Finance',
    credits: { ru: 0, rs: 0 },
    status: 'Active',
    lastActive: '3 hours ago'
  },
];

// Helper to format time ago
function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return '1 day ago';
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatISTDate(dateStr);
}

// Map API status to display status
function mapStatus(status: string, isActive: boolean): 'Active' | 'Inactive' | 'Pending' {
  if (status === 'pending') return 'Pending';
  if (!isActive || status === 'inactive' || status === 'suspended') return 'Inactive';
  return 'Active';
}

// Map API role name to display role
function mapRole(roleName: string): string {
  const roleMap: Record<string, string> = {
    'tenant_admin': 'Admin',
    'Owner': 'Admin',
    'hr_manager': 'Admin',
    'HR Manager': 'Admin',
    'recruiter': 'User',
    'Recruiter': 'User',
    'hiring_manager': 'User',
    'Hiring Manager': 'User',
    'interviewer': 'User',
    'Interviewer': 'User',
    'viewer': 'Viewer',
    'Viewer': 'Viewer',
  };
  return roleMap[roleName] || 'User';
}

// Custom hook for user management
export function useUserManagement() {
  const [users, setUsers] = useState<UserData[]>(mockUsers);
  const [counts, setCounts] = useState<UserCounts>({ total: 8, active: 4, inactive: 1, pending: 3 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [usingMockData, setUsingMockData] = useState(false);

  // Fetch users from API
  const fetchUsers = useCallback(async (params?: {
    page?: number;
    page_size?: number;
    status?: 'active' | 'inactive' | 'pending';
    search?: string;
    role?: string;
  }) => {
    setLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams();
      if (params?.page) query.set('page', params.page.toString());
      if (params?.page_size) query.set('page_size', params.page_size.toString());
      if (params?.status) query.set('status', params.status);
      if (params?.search) query.set('search', params.search);
      if (params?.role) query.set('role', params.role);

      const response = await fetch(`${API_URL}/users?${query}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) throw new Error('Failed to fetch users');

      const data = await response.json();

      // Map API response to UserData format
      const mappedUsers: UserData[] = (data.users || data).map((user: any) => ({
        id: user.id.toString(),
        name: user.name || user.full_name,
        email: user.email,
        role: mapRole(user.role),
        department: user.department || 'Not assigned',
        credits: { ru: user.credits_ru || 0, rs: user.credits_rs || 0 },
        status: mapStatus(user.status, user.is_active),
        lastActive: formatTimeAgo(user.last_login_at),
        avatar: user.avatar_url || undefined,
        jobTitle: user.job_title || undefined,
      }));

      setUsers(mappedUsers);
      setCounts(data.counts || {
        total: mappedUsers.length,
        active: mappedUsers.filter(u => u.status === 'Active').length,
        inactive: mappedUsers.filter(u => u.status === 'Inactive').length,
        pending: mappedUsers.filter(u => u.status === 'Pending').length,
      });
      setUsingMockData(false);
    } catch (err) {
      console.warn('API unavailable, using mock data:', err);
      setUsingMockData(true);

      // Filter mock data based on params
      const filteredUsers = mockUsers.filter(u => {
        if (params?.status) {
          if (params.status === 'active' && u.status !== 'Active') return false;
          if (params.status === 'inactive' && u.status !== 'Inactive') return false;
          if (params.status === 'pending' && u.status !== 'Pending') return false;
        }
        if (params?.search) {
          const searchLower = params.search.toLowerCase();
          if (!u.name.toLowerCase().includes(searchLower) &&
              !u.email.toLowerCase().includes(searchLower)) return false;
        }
        if (params?.role && params.role !== 'All Roles') {
          if (u.role !== params.role) return false;
        }
        return true;
      });
      setUsers(filteredUsers);

      setCounts({
        total: mockUsers.length,
        active: mockUsers.filter(u => u.status === 'Active').length,
        inactive: mockUsers.filter(u => u.status === 'Inactive').length,
        pending: mockUsers.filter(u => u.status === 'Pending').length,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // Invite user
  const inviteUser = useCallback(async (data: {
    email: string;
    firstName: string;
    lastName: string;
    department: string;
    role: string;
  }) => {
    try {
      const response = await fetch(`${API_URL}/users/invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({
          email: data.email,
          name: `${data.firstName} ${data.lastName}`,
          department: data.department,
          role: data.role,
        }),
      });

      if (response.status === 401) {
        handleUnauthorized();
        return { success: false };
      }

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const detail = errData?.detail;
        let message = 'Failed to invite user';
        if (typeof detail === 'string') {
          message = detail;
        } else if (detail?.message) {
          message = detail.message;
        } else if (detail?.error) {
          message = detail.error;
        } else if (Array.isArray(detail) && detail[0]?.msg) {
          message = detail[0].msg;
        }
        throw new Error(message);
      }

      await fetchUsers();
      return { success: true };
    } catch (err) {
      console.warn('API unavailable, simulating invite:', err);
      // Add to mock data
      const newUser: UserData = {
        id: String(Date.now()),
        name: `${data.firstName} ${data.lastName}`,
        email: data.email,
        role: data.role === 'Admin' ? 'Admin' : data.role === 'Viewer' ? 'Viewer' : 'User',
        department: data.department,
        credits: { ru: 0, rs: 0 },
        status: 'Pending',
        lastActive: 'Never',
        invitationStatus: 'Sent',
        invitationSentDate: formatISTDate(new Date().toISOString()),
        invitationExpiryDate: formatISTDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()),
      };
      setUsers(prev => [...prev, newUser]);
      setCounts(prev => ({ ...prev, total: prev.total + 1, pending: prev.pending + 1 }));
      return { success: true, mock: true };
    }
  }, [fetchUsers]);

  // Resend invitation
  const resendInvitation = useCallback(async (userId: string) => {
    try {
      const response = await fetch(`${API_URL}/users/${userId}/resend-invitation`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.status === 401) {
        handleUnauthorized();
        return { success: false };
      }

      if (!response.ok) throw new Error('Failed to resend invitation');

      return { success: true };
    } catch (err) {
      console.warn('API unavailable, simulating resend:', err);
      setUsers(prev => prev.map(u =>
        u.id === userId
          ? {
              ...u,
              invitationStatus: 'Sent' as const,
              invitationSentDate: formatISTDate(new Date().toISOString()),
              invitationExpiryDate: formatISTDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()),
            }
          : u
      ));
      return { success: true, mock: true };
    }
  }, []);

  // Deactivate user
  const deactivateUser = useCallback(async (userId: string) => {
    try {
      const response = await fetch(`${API_URL}/users/${userId}/deactivate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });

      if (response.status === 401) {
        handleUnauthorized();
        return { success: false };
      }

      if (!response.ok) throw new Error('Failed to deactivate user');

      await fetchUsers();
      return { success: true };
    } catch (err) {
      console.warn('API unavailable, simulating deactivation:', err);
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, status: 'Inactive' as const } : u
      ));
      setCounts(prev => ({ ...prev, active: prev.active - 1, inactive: prev.inactive + 1 }));
      return { success: true, mock: true };
    }
  }, [fetchUsers]);

  // Initial fetch
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  return {
    users,
    counts,
    loading,
    error,
    usingMockData,
    fetchUsers,
    inviteUser,
    resendInvitation,
    deactivateUser,
  };
}

export default useUserManagement;
