'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Tenant, Permission } from '@/lib/types/tenant';
import { authService, clearTokens } from '@/lib/services';
import { mockTenant } from '@/lib/mockData/tenantData';
import { useRouter } from 'next/navigation';
import type { User as ApiUser } from '@/lib/services/authService';

interface AuthContextType {
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (user: User) => void;
  logout: () => void;
  updateUser: (user: User) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Map API user response (snake_case) to frontend User type (camelCase)
function mapApiUserToUser(apiUser: ApiUser): User {
  return {
    id: apiUser.id,
    email: apiUser.email,
    name: apiUser.name,
    role: apiUser.role,
    tenantId: apiUser.tenant_id,
    permissions: {
      canCreateJD: apiUser.permissions.can_create_jd,
      canManageJD: apiUser.permissions.can_manage_jd,
      canUploadResumes: apiUser.permissions.can_upload_resumes,
      canViewResumes: apiUser.permissions.can_view_resumes,
      canAccessInternalDB: apiUser.permissions.can_access_internal_db,
      canCreateAssessments: apiUser.permissions.can_create_assessments,
      canViewAnalytics: apiUser.permissions.can_view_analytics,
      canManageSettings: apiUser.permissions.can_manage_settings,
      canManageUsers: apiUser.permissions.can_manage_users,
    },
    phone: apiUser.phone,
    avatarUrl: apiUser.avatar_url,
    isActive: apiUser.is_active,
    lastLogin: apiUser.last_login,
    createdAt: apiUser.created_at,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  const isAuthenticated = !!user;

  // Restore session on mount
  useEffect(() => {
    const restoreSession = async () => {
      if (authService.isAuthenticated()) {
        try {
          const apiUserData = await authService.getCurrentUser();
          const userData = mapApiUserToUser(apiUserData);
          setUser(userData);
          setTenant(mockTenant);
        } catch (error) {
          console.error('Session restore failed:', error);
          clearTokens();
        }
      }
      setIsLoading(false);
    };

    restoreSession();
  }, []);

  const login = (userData: User) => {
    setUser(userData);
    setTenant(mockTenant);
  };

  const logout = () => {
    setUser(null);
    setTenant(null);
    clearTokens();
    router.push('/login');
  };

  const updateUser = (userData: User) => {
    setUser(userData);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        isAuthenticated,
        isLoading,
        login,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
