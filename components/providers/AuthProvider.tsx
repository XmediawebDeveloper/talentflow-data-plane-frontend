'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Tenant, Permission } from '@/lib/types/tenant';
import { authService, clearTokens } from '@/lib/services';
import { mockTenant } from '@/lib/mockData/tenantData';
import { useRouter } from 'next/navigation';
import type { User as ApiUser } from '@/lib/services/authService';

// Helper to store/retrieve user from localStorage
const USER_STORAGE_KEY = 'talentflow_user';

const saveUserToStorage = (user: User) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  }
};

const getUserFromStorage = (): User | null => {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(USER_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const clearUserFromStorage = () => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(USER_STORAGE_KEY);
  }
};

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
      console.log('[AUTH] Restoring session...');
      console.log('[AUTH] Has token:', authService.isAuthenticated());

      // First, try to restore from localStorage (fast path)
      const storedUser = getUserFromStorage();
      if (storedUser && authService.isAuthenticated()) {
        console.log('[AUTH] Restored user from localStorage:', storedUser.email);
        setUser(storedUser);
        setTenant(mockTenant);
        setIsLoading(false);

        // Optionally validate with API in background (don't block UI)
        try {
          const apiUserData = await authService.getCurrentUser();
          const userData = mapApiUserToUser(apiUserData);
          setUser(userData);
          saveUserToStorage(userData);
          console.log('[AUTH] User validated with API');
        } catch (error) {
          console.warn('[AUTH] API validation failed, using cached user:', error);
          // Keep using cached user - don't clear tokens for temporary API issues
        }
        return;
      }

      // Fallback: Try to fetch from API
      if (authService.isAuthenticated()) {
        try {
          console.log('[AUTH] Fetching current user from API...');
          const apiUserData = await authService.getCurrentUser();
          console.log('[AUTH] Got user data:', apiUserData);
          const userData = mapApiUserToUser(apiUserData);
          setUser(userData);
          setTenant(mockTenant);
          saveUserToStorage(userData);
          console.log('[AUTH] Session restored successfully');
        } catch (error) {
          console.error('[AUTH] Session restore failed:', error);
          clearTokens();
          clearUserFromStorage();
        }
      } else {
        console.log('[AUTH] No token found, skipping session restore');
      }
      setIsLoading(false);
    };

    restoreSession();
  }, []);

  const login = (userData: User) => {
    console.log('[AUTH] Login called for:', userData.email);
    setUser(userData);
    setTenant(mockTenant);
    saveUserToStorage(userData);
  };

  const logout = () => {
    console.log('[AUTH] Logout called');
    setUser(null);
    setTenant(null);
    clearTokens();
    clearUserFromStorage();
    router.push('/login');
  };

  const updateUser = (userData: User) => {
    setUser(userData);
    saveUserToStorage(userData);
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
