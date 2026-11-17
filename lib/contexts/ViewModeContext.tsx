'use client'

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { UserPermissions } from '@/lib/types/permissions';

export type ViewMode = 'single' | 'team' | 'admin';

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  status: 'active' | 'away' | 'offline';
  teams: string[]; // Team IDs this member belongs to
  isAdmin?: boolean; // Whether this user has admin privileges
  permissions?: UserPermissions; // User's permissions
  customRole?: string; // Custom role if using custom permissions
}

interface ViewModeContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  currentUser: TeamMember;
  teamMembers: TeamMember[]; // All team members
  setTeamMembers: (members: TeamMember[]) => void; // Add ability to update team members
  myTeamMembers: TeamMember[]; // Only members who share teams with current user
  isTeamMode: boolean;
  isAdminMode: boolean;
  canAccessAdmin: boolean; // Whether current user can access admin features
  setOnViewModeChange: (callback: (mode: ViewMode) => void) => void;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

// Mock team members data
const mockTeamMembers: TeamMember[] = [
  {
    id: 'user-1',
    name: 'Sarah Johnson',
    email: 'sarah.johnson@talentflow.com',
    role: 'Senior Recruiter',
    avatar: 'SJ',
    status: 'active',
    teams: ['team-1', 'team-2'],
    isAdmin: true // Current user has admin privileges
  },
  {
    id: 'user-2',
    name: 'Michael Chen',
    email: 'michael.chen@talentflow.com',
    role: 'Technical Recruiter',
    avatar: 'MC',
    status: 'active',
    teams: ['team-1']
  },
  {
    id: 'user-3',
    name: 'Emily Rodriguez',
    email: 'emily.rodriguez@talentflow.com',
    role: 'Recruiter',
    avatar: 'ER',
    status: 'away',
    teams: ['team-2']
  },
  {
    id: 'user-4',
    name: 'David Kim',
    email: 'david.kim@talentflow.com',
    role: 'Senior Technical Recruiter',
    avatar: 'DK',
    status: 'active',
    teams: ['team-1', 'team-2']
  },
  {
    id: 'user-5',
    name: 'Jessica Martinez',
    email: 'jessica.martinez@talentflow.com',
    role: 'Recruitment Lead',
    avatar: 'JM',
    status: 'offline',
    teams: ['team-1'],
    isAdmin: true
  }
];

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewModeState] = useState<ViewMode>('admin');
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>(mockTeamMembers);

  // Use ref to store callback to avoid re-render issues
  const onViewModeChangeRef = useRef<((mode: ViewMode) => void) | null>(null);
  const isInitialMount = useRef(true);

  // Current user is always the first team member
  const currentUser = teamMembers[0];

  // Load initial view mode from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('talentflow_view_mode');
    if (saved && (saved === 'single' || saved === 'team' || saved === 'admin')) {
      setViewModeState(saved as ViewMode);
    }
  }, []);

  useEffect(() => {
    // Save to localStorage whenever view mode changes
    localStorage.setItem('talentflow_view_mode', viewMode);

    // Skip callback on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Call the callback if it exists
    if (onViewModeChangeRef.current) {
      onViewModeChangeRef.current(viewMode);
    }
  }, [viewMode]);

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
  };

  const setOnViewModeChange = (callback: (mode: ViewMode) => void) => {
    onViewModeChangeRef.current = callback;
  };

  const value: ViewModeContextType = {
    viewMode,
    setViewMode,
    currentUser,
    teamMembers,
    setTeamMembers,
    myTeamMembers: teamMembers.filter(member => member.teams.some(teamId => currentUser.teams.includes(teamId))),
    isTeamMode: viewMode === 'team',
    isAdminMode: viewMode === 'admin',
    canAccessAdmin: currentUser.isAdmin || false,
    setOnViewModeChange
  };

  return (
    <ViewModeContext.Provider value={value}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  const context = useContext(ViewModeContext);
  if (context === undefined) {
    throw new Error('useViewMode must be used within a ViewModeProvider');
  }
  return context;
}
