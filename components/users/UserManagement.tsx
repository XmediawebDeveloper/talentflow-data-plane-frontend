'use client';

import { PageHeader } from '@/components/ui/page-header';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft,
  Search,
  Plus,
  Pencil,
  Mail,
  Calendar,
  Clock,
  Loader2,
  UserCog,
  Check,
  Link2,
  AlertCircle,
  Eye,
  Lock,
  KeyRound,
  Users as UsersIcon,
  UserCheck,
  UserX,
  Sparkles,
  Info,
  ChevronRight,
  Shield,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { friendlyErrorMessage } from '@/lib/utils/friendlyError';
import { handleUnauthorized } from '@/lib/services/api';
import rbacService, { formatRoleName } from '@/lib/services/rbacService';
import userService from '@/lib/services/userService';
import { RoleListItem } from '@/lib/types/rbac';
import DependencyMatrix from './DependencyMatrix';
import { useUserLimits } from './UserLimits';
import SeatQuotaCard from './SeatQuotaCard';
import AddSeatsModal from './AddSeatsModal';
import FilterSelect from '@/components/ui/filter-select';
import ListPagination from '@/components/ListPagination';
import { useAuth } from '@/components/providers/AuthProvider';
import { useQuota } from '@/contexts/QuotaContext';
import { useGlobalDialog } from '@/components/providers/GlobalDialogProvider';
import { formatIST } from '@/lib/utils/dateUtils';
import { useScrollRestoration, useListStatePersistence } from '@/lib/hooks/useListViewPersistence';
import { Skeleton } from '@/components/ui/skeleton';
import AppModal from '@/components/ui/app-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { TABLE_EMPTY_PANEL_CLASS } from '@/lib/constants/tableEmptyPanel';
import { Tooltip } from '@/components/ui/tooltip';
import NameAvatar from '@/components/ui/name-avatar';
import { MobileRecordList, MobileRecordCard } from '@/components/ui/mobile-record-card';
import { useTableSort, sortRows, ariaSort, SortableHeader, ClearSortChip } from '@/components/ui/sortable-header';
import RoleAccessSummary from '@/components/roles/access/RoleAccessSummary';
import RoleEditorModal, { roleCodes } from '@/components/roles/access/RoleEditorModal';
import { AccessInline, AccessLegend } from '@/components/roles/access/AccessDots';

// Access is ROLE-ONLY: a user has exactly one role and everything they can do
// comes from it. There is no per-user permission editing on this page; to give
// someone different access, create (or pick) a role with that access.

/** Max roles per tenant (system roles included) when GET /rbac/roles omits it. */
const DEFAULT_ROLE_LIMIT = 25;

interface ApiUser {
  id: string;
  user_display_id?: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  role: string;  // Role code from RBAC
  role_id?: number | null;
  is_active: boolean;
  last_login?: string;
  created_at?: string;
}
// Default role labels for known roles - RBAC01-07
const defaultRoleLabels: Record<string, string> = {
  tenant_admin: 'Owner',
  admin: 'Admin',
  recruiter: 'Recruiter',
  viewer: 'Viewer',
  billing_manager: 'Billing',
  standard_user: 'User',
};

// Default badge colors for known roles - RBAC01-07
const defaultRoleBadgeColors: Record<string, string> = {
  tenant_admin: 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25',
  admin: 'bg-brand-blue/10 text-brand-blue',
  recruiter: 'bg-brand-cyan/10 text-brand-cyan',
  viewer: 'bg-gray-100 text-gray-600',
  billing_manager: 'bg-success-subtle text-success',
  standard_user: 'bg-gray-100 text-gray-600',
};

// Color palette for custom roles - each custom role gets a distinct color
const customRoleColors = [
  'bg-blue-100 text-blue-700',
  'bg-purple-100 text-purple-700',
  'bg-pink-100 text-pink-700',
  'bg-indigo-100 text-indigo-700',
  'bg-cyan-100 text-cyan-700',
  'bg-teal-100 text-teal-700',
  'bg-success-subtle text-success',
  'bg-lime-100 text-lime-700',
  'bg-warning-subtle text-warning',
  'bg-orange-100 text-orange-700',
  'bg-rose-100 text-rose-700',
  'bg-fuchsia-100 text-fuchsia-700',
];

// Simple hash function for consistent color assignment based on role code
const hashString = (str: string): number => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
};

// Get role label - use RBAC name or fallback to defaults
type UserSortKey = 'id' | 'user' | 'role' | 'status' | 'created';

/** "just now" / "5 minutes ago" / "3 days ago" for the last 30 days; null when
 *  older (or unparseable) so the caller shows the full date instead. */
const relativeTimeFromNow = (iso: string): string | null => {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return null;
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const units: [number, string][] = [
    [60, 'minute'],
    [3600, 'hour'],
    [86400, 'day'],
  ];
  if (seconds >= 30 * 86400) return null;
  for (let i = units.length - 1; i >= 0; i--) {
    const [size, name] = units[i];
    if (seconds >= size) {
      const n = Math.floor(seconds / size);
      return `${n} ${name}${n === 1 ? '' : 's'} ago`;
    }
  }
  return null;
};

const getRoleLabel =(role: string, availableRoles: RoleListItem[]): string => {
  const rbacRole = availableRoles.find(r => (r.code || '').toLowerCase() === (role || '').toLowerCase());
  // Role names are always shown in CAPITALS (see formatRoleName in rbacService).
  if (rbacRole) return formatRoleName(rbacRole.name);
  return formatRoleName(defaultRoleLabels[(role || '').toLowerCase()] || role || '');
};

// Get role badge color - system roles use default colors, custom roles get distinct colors from palette
const getRoleBadgeColor = (role: string, availableRoles: RoleListItem[]): string => {
  const roleCode = (role || '').toLowerCase();

  // Check if it's a known system role with predefined color
  if (defaultRoleBadgeColors[roleCode]) {
    return defaultRoleBadgeColors[roleCode];
  }

  // For custom roles, check if it exists in availableRoles
  const customRole = availableRoles.find(r => r.code.toLowerCase() === roleCode);
  if (customRole && !customRole.is_system) {
    // Generate consistent color based on role code using hash
    const colorIndex = hashString(roleCode) % customRoleColors.length;
    return customRoleColors[colorIndex];
  }

  // Fallback for unknown roles
  return 'bg-gray-100 text-gray-700';
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

/* POST /users/sync (seat-count reconcile with the Admin API) used to run on
   every mount of this page. It now runs at most once per USER_SYNC_INTERVAL_MS
   per tab — but any user-list reload after mount (create / edit / activate /
   deactivate / delete / manual refresh all call loadUsers) clears the stamp,
   so the next visit after a change always syncs, as before. */
const USER_SYNC_INTERVAL_MS = 5 * 60 * 1000;
const USER_SYNC_STAMP_KEY = 'tf:usersSync:lastRun';

function userSyncDue(): boolean {
  try {
    const last = Number(sessionStorage.getItem(USER_SYNC_STAMP_KEY));
    return !last || Date.now() - last > USER_SYNC_INTERVAL_MS;
  } catch {
    return true;
  }
}

function markUserSyncRan(): void {
  try { sessionStorage.setItem(USER_SYNC_STAMP_KEY, String(Date.now())); } catch { /* storage unavailable: sync runs every mount */ }
}

function resetUserSyncThrottle(): void {
  try { sessionStorage.removeItem(USER_SYNC_STAMP_KEY); } catch { /* ignore */ }
}

export default function UserManagement() {
  const router = useRouter();
  const { user: currentUser, refreshUser, isLoading: authLoading, canManageUsers: authCanManageUsers, hasPermissionCode } = useAuth();
  const dialog = useGlobalDialog();

  // Granular action gates. Tenant admins always pass; delegated admins pass when
  // they hold the matching users:* permission. Accept both snake_case (API) and
  // camelCase (AuthProvider) shapes for resilience.
  const _isTenantAdmin = currentUser?.role === 'tenant_admin';
  const _perms: any = currentUser?.permissions || {};
  const canDisableUser = _isTenantAdmin || !!_perms.can_disable_users || !!_perms.canDisableUsers;
  const canUpdateUser = _isTenantAdmin || !!_perms.can_update_users || !!_perms.canUpdateUsers;
  const canCreateUser = _isTenantAdmin || !!_perms.can_create_users || !!_perms.canCreateUsers;
  const canResetPassword = _isTenantAdmin || !!_perms.can_reset_user_password || !!_perms.canResetUserPassword;
  const canForcePwChange = _isTenantAdmin || !!_perms.can_force_password_change || !!_perms.canForcePasswordChange;
  const canAssignRole = _isTenantAdmin || !!_perms.can_assign_roles || !!_perms.canAssignRoles;
  const [users, setUsers] = useState<ApiUser[]>([]);
  // Tenant-wide active/inactive counts from a dedicated fast COUNT query
  // (GET /users/count), used by the Active/Inactive stat cards below instead
  // of `users.filter(...)` — `users` only ever holds the current page of
  // `GET /users` (default page_size=20), so filtering it undercounts any
  // tenant with more users than one page. All three cards (Total too) read
  // only this — `null` until the call resolves, during which they show a
  // placeholder rather than a provisional client tally that then jumps.
  const [userCounts, setUserCounts] = useState<{ active_users: number; inactive_users: number; total_users: number } | null>(null);
  // Total = active + inactive (every account), so the three cards always add up.
  // Active is what counts against the plan's seat limit, so the limit sits on that card.
  const activeUsersCount = userCounts ? userCounts.active_users : users.filter(u => u.is_active).length;
  const inactiveUsersCount = userCounts ? userCounts.inactive_users : users.filter(u => !u.is_active).length;
  const totalUsersCount = activeUsersCount + inactiveUsersCount;
  // The last /users/count call failed — the cards show '—', not a guess.
  const [userCountsFailed, setUserCountsFailed] = useState(false);
  // Bumped per loadUsers, so an older /users/count response can't land last.
  const userCountsSeqRef = useRef(0);
  const [isLoading, setIsLoading] = useState(true);
  // Users whose Active toggle request is in flight — their switch is locked.
  const [togglingUserIds, setTogglingUserIds] = useState<Set<string>>(() => new Set());
  const [searchQuery, setSearchQuery] = useState('');
  // The page always opens on the Total Users list (client request 2026-10-17);
  // clicking a stat card re-filters it. `statusFilter` carries the card that was
  // clicked so the list is pre-filtered.
  const [pageView, setPageView] = useState<'cards' | 'list'>('list');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  // Role filter (client-side, over the already-loaded users). 'all' or a role code (lowercase).
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const isOverviewCardActive = (filter: typeof statusFilter) => pageView === 'list' && statusFilter === filter;
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  // Click-to-sort table headings. No default sort — the list keeps its server
  // order until a heading is clicked; a sort change jumps back to page 1.
  const userSort = useTableSort<UserSortKey>({ descFirst: ['status', 'created'] });
  const userSortWithReset = {
    ...userSort,
    toggleSort: (key: UserSortKey) => {
      userSort.toggleSort(key);
      setCurrentPage(1);
    },
  };
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ApiUser | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Every tenant role with its effective access (permission_codes), loaded once.
  const [availableRoles, setAvailableRoles] = useState<RoleListItem[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [roleLimit, setRoleLimit] = useState(DEFAULT_ROLE_LIMIT);
  // Normalised access per role id — computed once per roles load, not per row.
  const roleCodesById = useMemo(
    () => new Map(availableRoles.map((r) => [r.id, roleCodes(r)] as const)),
    [availableRoles],
  );
  const codesOfRole = (role: RoleListItem) => roleCodesById.get(role.id) ?? roleCodes(role);
  // The user's role: by role_id when the API sends it, else by role code.
  const roleOfUser = (u: { role?: string; role_id?: number | null }): RoleListItem | undefined =>
    (u.role_id != null ? availableRoles.find((r) => r.id === u.role_id) : undefined)
    ?? availableRoles.find((r) => (r.code || '').toLowerCase() === (u.role || '').toLowerCase());
  // Add User starts with NO role: the picker is empty until one is chosen.
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [editSelectedRoleId, setEditSelectedRoleId] = useState<number | null>(null);
  const [editOriginalRoleId, setEditOriginalRoleId] = useState<number | null>(null);

  // "Create a role based on <role>" — Role editor (Duplicate) stacked over Add / Edit User.
  const [dupRoleFrom, setDupRoleFrom] = useState<RoleListItem | null>(null);
  const [dupTarget, setDupTarget] = useState<'create' | 'edit'>('create');
  const canCreateRole = hasPermissionCode('roles:create');
  const roleLimitReached = availableRoles.length >= roleLimit;

  const [isDependencyMatrixOpen, setIsDependencyMatrixOpen] = useState(false);

  // RBAC01: User limits hook
  const { limits, isAtLimit, refresh: refreshLimits } = useUserLimits();
  const { quotaData } = useQuota();
  const isTrial = quotaData?.is_trial ?? false;

  // Refresh trigger for SeatQuotaCard
  const [seatQuotaRefreshTrigger, setSeatQuotaRefreshTrigger] = useState(0);
  const [showAddSeatsModal, setShowAddSeatsModal] = useState(false);

  // User details popup (read only): identity, role, status, last login and the role's access.
  const [viewingUser, setViewingUser] = useState<ApiUser | null>(null);

  // Reset Password modal — offers BOTH "email a temp password" and "set directly".
  const [resetPwUser, setResetPwUser] = useState<ApiUser | null>(null);
  const [resetPwMode, setResetPwMode] = useState<'choose' | 'direct'>('choose');
  const [directPw, setDirectPw] = useState('');
  const [directPwConfirm, setDirectPwConfirm] = useState('');
  const [directPwForceChange, setDirectPwForceChange] = useState(false); // default OFF
  const [directPwShow, setDirectPwShow] = useState(false);
  const [resetPwSubmitting, setResetPwSubmitting] = useState(false);

  const closeResetPwModal = () => {
    setResetPwUser(null);
    setResetPwMode('choose');
    setDirectPw('');
    setDirectPwConfirm('');
    setDirectPwForceChange(false);
    setDirectPwShow(false);
    setResetPwSubmitting(false);
  };

  const [newUser, setNewUser] = useState({ name: '', email: '' });


  // Email validation states
  const [emailCheckResult, setEmailCheckResult] = useState<{
    error: string | null;
    available: boolean;
  }>({
    error: null,
    available: true,
  });
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const emailCheckTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Current user state (for hiding Edit/Delete buttons on self)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Prevent duplicate fetches in development mode
  const hasFetched = useRef(false);

  // Persist scroll + view state so returning to User Management lands the user
  // where they left off. Re-detect the scroll container when the two-step view
  // flips (cards overview vs. list). currentPage is intentionally not persisted:
  // the existing `setCurrentPage(1)` effect on [searchQuery] resets it on mount,
  // so a restored page would be immediately clobbered.
  const rootRef = useScrollRestoration<HTMLDivElement>('org-user-management', !isLoading, [pageView]);
  useListStatePersistence(
    'org-user-management',
    { searchQuery, itemsPerPage },
    (s) => {
      // statusFilter is deliberately NOT restored — the page always opens on
      // Total Users.
      if (typeof s.searchQuery === 'string') setSearchQuery(s.searchQuery);
      if (typeof s.itemsPerPage === 'number') setItemsPerPage(s.itemsPerPage);
    },
  );

  // Permission guard - check if user has access to User Management.
  // Reads the AuthProvider's user (already loaded from /auth/me by the app
  // shell, and refreshed there on permission changes) instead of a second
  // /auth/me round trip. Mirrors the canManageUsers mapping in AuthProvider
  // (which the route guard/menu use): view-only users (can_view_users) may
  // land here too, with reduced capabilities gated further down.
  useEffect(() => {
    // No user once auth settles = signed out; the dashboard layout handles that redirect.
    if (authLoading || !currentUser) return;
    // Store current user ID for hiding Edit/Delete buttons on self
    setCurrentUserId(String(currentUser.id));
    const hasPermission = currentUser.role === 'tenant_admin' || !!authCanManageUsers;
    if (!hasPermission) {
      toast.error('You do not have permission to access User Management');
      router.push('/dashboard');
    }
  }, [authLoading, currentUser?.id, currentUser?.role, authCanManageUsers, router]);

  // Load users and roles
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    // These don't depend on the Admin API sync below in any way — each
    // fetches straight from this tenant's own DB — so they fire immediately
    // instead of waiting on it. They're what the Users/Active/Inactive count
    // cards actually read; the sync result itself is never rendered anywhere.
    loadUsers({ fromMount: true }); // also refreshes userCounts (see loadUsers)
    loadRoles();

    // Reconciles this tenant's user count against the external Admin API
    // (two possible remote round trips, each up to 10s) and only ever
    // produces a toast warning on a plan-limit mismatch — it used to be
    // awaited BEFORE the three loads above even started, so the count cards
    // sat on a blank/loading state for as long as that remote call took, for
    // a side effect they don't display. Run concurrently instead.
    const syncWithAdminApi = async () => {
      try {
        const syncResult = await userService.syncUsers();
        // A failed or unconfirmed sync doesn't count: retry on the next visit.
        if (!syncResult.success) resetUserSyncThrottle();
        if (syncResult.synced) {
          console.log(`[USER-SYNC] Tenant ${syncResult.tenant_id}: Local=${syncResult.local_count}, Admin=${syncResult.admin_count}, Synced=${syncResult.synced_users || 0} users`);
        } else if (syncResult.error === 'USER_LIMIT_EXCEEDED' && syncResult.upgrade_required) {
          console.warn(`[USER-SYNC] Plan limit exceeded: ${syncResult.message}`);
          toast.warning(
            `User count mismatch: You have ${syncResult.local_count} users but your plan allows ${syncResult.max_seats}. Please upgrade your plan.`,
            { duration: 8000 }
          );
        }
      } catch (error) {
        console.warn('Failed to sync users with Admin API:', error);
        resetUserSyncThrottle();
      }
    };

    if (userSyncDue()) {
      markUserSyncRan();
      syncWithAdminApi();
    }
  }, []);

  // GET /rbac/roles: every role with its effective access (permission_codes),
  // holders and the tenant's role limit. Returns the list so callers can act on
  // the fresh data (e.g. select a role created a moment ago).
  const loadRoles = async (): Promise<RoleListItem[]> => {
    try {
      const data = await rbacService.getRoles();
      setAvailableRoles(data.roles);
      if (typeof data.role_limit === 'number' && data.role_limit > 0) setRoleLimit(data.role_limit);
      return data.roles;
    } catch (error) {
      // View-only users may lack roles:read; the table then shows roles by name only.
      console.warn('Failed to load roles:', error);
      return [];
    } finally {
      setRolesLoaded(true);
    }
  };

  // A role made from "Create a role based on …": reload roles, pick the new one
  // in the open Add / Edit User popup. Nothing is assigned until Save.
  const handleDupRoleSaved = async (created?: { id: number; name: string }) => {
    setDupRoleFrom(null);
    await loadRoles();
    if (!created) return;
    if (dupTarget === 'edit') setEditSelectedRoleId(created.id);
    else setSelectedRoleId(created.id);
    toast.success(`Role "${formatRoleName(created.name)}" created. Save to assign it.`);
  };
  // Email validation with debounce (500ms)
  const checkEmailAvailability = async (email: string) => {
    // Clear previous timeout
    if (emailCheckTimeoutRef.current) {
      clearTimeout(emailCheckTimeoutRef.current);
    }

    // Reset validation state
    setEmailCheckResult({ error: null, available: true });

    // Skip validation if email is empty or not a valid-looking email
    if (!email || !email.includes('@')) {
      return;
    }

    // Set loading state
    setIsCheckingEmail(true);

    // Debounce - wait 500ms after user stops typing
    emailCheckTimeoutRef.current = setTimeout(async () => {
      try {
        const result = await userService.checkEmailAvailability(email);

        // Update validation result
        setEmailCheckResult({
          error: result.error,
          available: result.available,
        });
      } catch (error) {
        console.error('Error checking email:', error);
        // Show error to user
        setEmailCheckResult({
          error: 'Failed to validate email. Please try again.',
          available: false,
        });
      } finally {
        setIsCheckingEmail(false);
      }
    }, 500);
  };

  // `silent`: refetch in the background without swapping the table for the
  // skeleton — for quick in-place edits like the Active toggle.
  const loadUsers = async ({ silent = false, fromMount = false }: { silent?: boolean; fromMount?: boolean } = {}) => {
    if (!silent) setIsLoading(true);
    // Any reload after mount follows a change or a manual refresh: let the next
    // visit run the Admin API user sync again (see USER_SYNC_INTERVAL_MS).
    if (!fromMount) resetUserSyncThrottle();
    // Keep the Active / Inactive / Total count cards in sync on every reload —
    // mount, manual refresh, and after mutations (activate/deactivate/delete/
    // create) that call loadUsers(). Previously userCounts loaded only once on
    // mount, so toggling a user's status left the Inactive/Active cards stale
    // until a manual page refresh. Fired in parallel and independent of the
    // list fetch so it still updates even if the list request fails.
    const countsSeq = ++userCountsSeqRef.current;
    userService.getUserCounts({ fresh: !fromMount }).then((counts) => {
      if (countsSeq !== userCountsSeqRef.current) return;
      setUserCounts(counts);
      setUserCountsFailed(false);
    }).catch((error) => {
      if (countsSeq !== userCountsSeqRef.current) return;
      console.warn('Failed to load user counts:', error);
      setUserCountsFailed(true);
    });
    try {
      // One GET /users/paged call through the shared api client (page_size up
      // to 1000, with the matching total) instead of walking GET /users 100 at
      // a time with raw fetch. Search / filters / sort / pagination on this
      // page run client-side over `users` (role-label + permission-pill sorts,
      // excess-seat deactivation and the edit existence check all need every
      // account), so all users are still loaded — seat limits keep this small.
      // Older backend without /users/paged: fall back to the legacy walk.
      const USERS_PAGE_SIZE = 1000;
      const rawUsers: any[] = [];
      try {
        for (let page = 1; page <= 20; page++) {
          const res = await userService.listUsersPaged(
            { page, page_size: USERS_PAGE_SIZE },
            { fresh: !fromMount },
          );
          const pageUsers: any[] = res.items || [];
          rawUsers.push(...pageUsers);
          if (rawUsers.length >= (res.total ?? 0) || pageUsers.length < USERS_PAGE_SIZE) break;
        }
      } catch (pagedError: any) {
        // Old backend: /users/paged falls into /users/{user_id} -> 422 (not a UUID) or 404.
        if (pagedError?.status !== 404 && pagedError?.status !== 422) throw pagedError;
        rawUsers.length = 0;
        for (let page = 1; page <= 50; page++) {
          const pageUsers: any[] = await userService.listUsers({ page, page_size: 100 });
          rawUsers.push(...pageUsers);
          if (pageUsers.length < 100) break;
        }
      }

      const mappedUsers: ApiUser[] = rawUsers.map((user: any) => ({
        id: user.id.toString(),
        user_display_id: user.user_display_id,
        name: user.name || user.full_name,
        email: user.email,
        avatar_url: user.avatar_url || null,
        role: user.role || 'viewer',
        role_id: typeof user.role_id === 'number' ? user.role_id : null,
        is_active: user.is_active ?? true,
        last_login: user.last_login,
        created_at: user.created_at,
      }));

      setUsers(mappedUsers);
    } catch (error: any) {
      console.error('Error loading users:', error);
      toast.error(friendlyErrorMessage(error, "Couldn't load users. Please try again."));
      // A failed background refresh keeps the list on screen.
      if (!silent) setUsers([]); // Show empty state instead of mock data
    } finally {
      setIsLoading(false);
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch =
      (user.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (user.email || '').toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && user.is_active) ||
      (statusFilter === 'inactive' && !user.is_active);
    const matchesRole = roleFilter === 'all' || (user.role || '').toLowerCase() === roleFilter;
    return matchesSearch && matchesStatus && matchesRole;
  });

  // Role filter options — only roles that some loaded user actually has.
  const roleFilterOptions = Array.from(
    new Map(
      users
        .filter((u) => u.role)
        .map((u) => [(u.role || '').toLowerCase(), getRoleLabel(u.role, availableRoles)] as const),
    ).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));

  // Anything narrowing the list (search, status pill, role) — drives "N of M" + Clear.
  const isUserListNarrowed = searchQuery.trim() !== '' || statusFilter !== 'all' || roleFilter !== 'all';
  const clearUserFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setRoleFilter('all');
    userSort.clearSort?.();
    setCurrentPage(1);
  };
  const hasRoleFilter = roleFilterOptions.length > 1;
  // Role filter dropdown — rendered in two spots (beside search from sm up, on a
  // second line on phones) so the phone search box keeps its full width.
  const renderRoleFilter = (className: string) =>
    hasRoleFilter ? (
      <FilterSelect
        value={roleFilter}
        onChange={(v) => setRoleFilter(v)}
        ariaLabel="Filter by role"
        options={[
          { value: 'all', label: 'All roles' },
          ...roleFilterOptions.map(([code, label]) => ({ value: code, label })),
        ]}
        className={`h-9 data-[size=default]:h-9 sm:data-[size=default]:h-9 py-0 sm:py-0 w-36 shrink-0 rounded-[6.6px] sm:rounded-[6.6px] px-2 sm:px-2 text-sm transition-colors hover:border-brand-blue/40 sm:w-40 ${
          roleFilter === 'all'
            ? 'border-gray-200 text-gray-700 dark:border-slate-700 dark:text-slate-300'
            : 'border-brand-blue/40 text-brand-blue dark:border-brand-blue/40 dark:text-brand-blue'
        } ${className}`}
      />
    ) : null;

  const sortedUsers = sortRows(filteredUsers, userSort.sortKey, userSort.sortDir, {
    id: (user) => user.user_display_id,
    user: (user) => user.name || user.email,
    role: (user) => getRoleLabel(user.role, availableRoles),
    status: (user) => (user.is_active ? 1 : 0),
    created: (user) => (user.created_at ? new Date(user.created_at).getTime() : null),
  });

  const paginatedUsers = sortedUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Active/Inactive toggle (or badge when the viewer can't change it). `compact`
  // hides the word next to the switch on tablet widths so the table fits.
  const renderUserStatus = (user: (typeof users)[number], compact = false) => (
    <>
    {/* Toggle Switch for Active/Inactive — requires users:disable. Without
        it the switch stays visible but greyed (hover tooltip, no-op click). */}
    {(user.role || '').toLowerCase() !== 'tenant_admin' && user.id !== currentUserId ? (
      <div className="flex items-center gap-2">
        <button
          onClick={() => { if (canDisableUser) handleToggleActive(user); }}
          aria-disabled={!canDisableUser}
          aria-busy={togglingUserIds.has(user.id)}
          disabled={togglingUserIds.has(user.id)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:ring-offset-2 ring-1 ring-inset ${
            user.is_active
              ? 'bg-brand-blue ring-brand-blue/30 shadow-sm shadow-brand-blue/25'
              : 'bg-gray-300 ring-black/5'
          } ${!canDisableUser ? 'cursor-not-allowed opacity-60 grayscale' : ''}`}
          title={!canDisableUser ? 'You do not have permission to activate or deactivate users' : user.is_active ? 'Active - Click to deactivate' : 'Inactive - Click to activate'}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
              user.is_active ? 'translate-x-6' : 'translate-x-1'
            }`}
          />
        </button>
        <span className={`${compact ? 'hidden lg:inline' : ''} text-xs font-semibold ${user.is_active ? 'text-brand-blue dark:text-blue-300' : 'text-gray-500 dark:text-slate-500'}`}>
          {user.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>
    ) : (
      <Badge variant={user.is_active ? 'success' : 'destructive'}>
        {user.is_active ? 'Active' : 'Inactive'}
      </Badge>
    )}
    </>
  );

  // Row actions — shared by the table (md+) and the phone card list.
  const renderUserActions = (user: (typeof users)[number]) => (
    <div className="flex items-center justify-center gap-1 sm:gap-2">
      {/* User details (read only) — every row, incl. the owner and yourself. */}
      <Tooltip content="View details">
        <button
          type="button"
          onClick={() => setViewingUser(user)}
          aria-label="View user details"
          className="p-2 rounded-lg transition-all text-gray-500 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/10 cursor-pointer"
        >
          <Eye className="w-4 h-4" />
        </button>
      </Tooltip>

      {/* Edit button - requires users:update, disabled when user is inactive.
          Icon stays visible (never removed from the DOM) when the permission
          is off, matching the is_active disabled treatment right below it —
          and reacts live to a permission change because canUpdateUser is
          derived from currentUser?.permissions on every render. */}
      {(user.role || '').toLowerCase() !== 'tenant_admin' && user.id !== currentUserId && (
        <Tooltip content={!canUpdateUser ? 'You do not have permission to edit users' : user.is_active ? 'Edit User' : 'Cannot edit inactive user'}>
          <button
            onClick={() => canUpdateUser && user.is_active && openEditModal(user)}
            aria-disabled={!canUpdateUser || !user.is_active}
            aria-label="Edit user"
            className={`p-2 rounded-lg transition-all ${
              canUpdateUser && user.is_active
                ? 'text-gray-500 dark:text-slate-500 hover:text-brand-blue hover:bg-brand-blue/10 cursor-pointer'
                : 'text-gray-300 dark:text-slate-500 cursor-not-allowed'
            }`}
          >
            <Pencil className="w-4 h-4" />
          </button>
        </Tooltip>
      )}

      {/* Reset Password — requires users:reset_password. Icon stays visible; see Edit button above. */}
      {(user.role || '').toLowerCase() !== 'tenant_admin' && user.id !== currentUserId && (
        <Tooltip content={!canResetPassword ? 'You do not have permission to reset passwords' : user.is_active ? 'Reset Password' : 'Cannot reset password for inactive user'}>
          <button
            onClick={() => { if (canResetPassword && user.is_active) { setResetPwMode('choose'); setResetPwUser(user); } }}
            aria-disabled={!canResetPassword || !user.is_active}
            aria-label="Reset password"
            className={`p-2 rounded-lg transition-all ${
              canResetPassword && user.is_active
                ? 'text-gray-500 dark:text-slate-500 hover:text-warning hover:bg-warning-subtle cursor-pointer'
                : 'text-gray-300 dark:text-slate-500 cursor-not-allowed'
            }`}
          >
            <KeyRound className="w-4 h-4" />
          </button>
        </Tooltip>
      )}

      {/* Force Password Change — requires users:force_password_change. Icon stays visible; see Edit button above. */}
      {(user.role || '').toLowerCase() !== 'tenant_admin' && user.id !== currentUserId && (
        <Tooltip content={!canForcePwChange ? 'You do not have permission to force a password change' : user.is_active ? 'Force password change on next login' : 'Cannot update inactive user'}>
          <button
            onClick={() => canForcePwChange && user.is_active && handleForcePasswordChange(user)}
            aria-disabled={!canForcePwChange || !user.is_active}
            aria-label="Force password change"
            className={`p-2 rounded-lg transition-all ${
              canForcePwChange && user.is_active
                ? 'text-gray-500 dark:text-slate-500 hover:text-brand-orange hover:bg-brand-orange/10 cursor-pointer'
                : 'text-gray-300 dark:text-slate-500 cursor-not-allowed'
            }`}
          >
            <Lock className="w-4 h-4" />
          </button>
        </Tooltip>
      )}
    </div>
  );

  // Created + Last Login as two lines — icon-only in the xl+ table column
  // (the header names them), labelled under the email / on the phone cards.
  const renderUserDates = (user: (typeof users)[number], labels = true) => (
    <div className="space-y-0.5 tf-meta">
      <div className="flex items-center gap-1.5" title="Created">
        <Calendar className="w-3.5 h-3.5 shrink-0 text-gray-400 dark:text-slate-500" />
        {labels && <span className="w-14 shrink-0 text-gray-400 dark:text-slate-500">Created</span>}
        <span className="text-gray-700 dark:text-slate-300">{formatIST(user.created_at)}</span>
      </div>
      {/* Last login reads relative ("2 days ago"); the exact time is on hover. */}
      <div className="flex items-center gap-1.5" title={user.last_login ? `Last login: ${formatIST(user.last_login)}` : 'Last login'}>
        <Clock className="w-3.5 h-3.5 shrink-0 text-gray-400 dark:text-slate-500" />
        {labels && <span className="w-14 shrink-0 text-gray-400 dark:text-slate-500">Last login</span>}
        {user.last_login ? (
          <span className="text-gray-700 dark:text-slate-300">{relativeTimeFromNow(user.last_login) ?? formatIST(user.last_login)}</span>
        ) : (
          <span className="italic text-gray-400 dark:text-slate-500">Not logged in yet</span>
        )}
      </div>
    </div>
  );

  // Click-to-copy for emails and user IDs.
  const copyText = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied`, { description: text });
    } catch {
      toast.error(`Couldn't copy ${what.toLowerCase()}`);
    }
  };

  // "You" marker on the signed-in user's own row/card.
  const renderYouTag = (user: (typeof users)[number]) =>
    user.id === currentUserId ? (
      <span className="shrink-0 rounded px-1.5 py-px text-2xs font-semibold bg-gray-100 text-gray-600 ring-1 ring-gray-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
        You
      </span>
    ) : null;

  // Reset to first page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, roleFilter]);

  const handleCreateUser = async () => {
    if (!newUser.name || !newUser.email) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!newUser.email.includes('@')) {
      toast.error('Please enter a valid email address');
      return;
    }

    if (!selectedRoleId) {
      toast.error('Please select a role');
      return;
    }

    // Check email validation
    if (!emailCheckResult.available) {
      toast.error(emailCheckResult.error || 'Email validation failed');
      return;
    }

    const selectedRole = availableRoles.find(r => r.id === selectedRoleId);
    const roleCode = selectedRole?.code || 'viewer';

    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          name: newUser.name,
          email: newUser.email,
          // No password — backend generates a temp password and emails the user
          role: roleCode,
          role_id: selectedRoleId,
        }),
      });

      // Handle 401 - logout and redirect
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Handle user limit exceeded error
        if (errorData.detail?.error === 'USER_LIMIT_EXCEEDED') {
          toast.error(friendlyErrorMessage(errorData, "User limit exceeded. Please upgrade your plan."));
          return;
        }

        // Handle Pydantic validation errors (array format)
        if (Array.isArray(errorData.detail)) {
          const validationError = errorData.detail[0];
          if (validationError?.msg) {
            // Show user-friendly error message
            if (validationError.msg.includes('email')) {
              toast.error('Invalid email format. Please check the username.');
            } else {
              toast.error(validationError.msg);
            }
          } else {
            toast.error('Validation error. Please check all fields.');
          }
          return;
        }

        // Handle other error formats
        if (typeof errorData.detail === 'string') {
          toast.error(friendlyErrorMessage(errorData, "Couldn't create user. Please try again."));
        } else if (errorData.detail?.message) {
          toast.error(friendlyErrorMessage(errorData, "Couldn't create user. Please try again."));
        } else {
          toast.error('Failed to create user. Please try again.');
        }
        return;
      }

      toast.success('User created! An invite email has been sent with their login details.');

      // RBAC02 AC3: surface any dependency the backend force-enabled on top of
      // what was selected (e.g. granting Resume Scoring also enables Resume
      // Upload + Resume Database Access) — see handleUpdateUser for details.
      try {
        const createdUserData = await response.json();
        if (Array.isArray(createdUserData.dependency_notices)) {
          createdUserData.dependency_notices.forEach((notice: string) => {
            toast.warning(notice);
          });
        }
      } catch {
        // Response body already consumed or not JSON — nothing to surface.
      }

      resetCreateModal();
      refreshLimits(); // Refresh user limits count
      setSeatQuotaRefreshTrigger(prev => prev + 1); // Refresh SeatQuotaCard
      // Small delay to let backend finish RBAC sync before re-fetching
      setTimeout(() => { loadUsers(); refreshUser(); loadRoles(); }, 300);
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast.error(friendlyErrorMessage(error, "Couldn't create user. Please try again."));
    } finally {
      setIsSaving(false);
    }
  };

  const resetCreateModal = () => {
    setNewUser({ name: '', email: '' });
    setSelectedRoleId(null);
    setIsCreateModalOpen(false);
    // Clear email validation state
    setEmailCheckResult({ error: null, available: true });
    setIsCheckingEmail(false);
    if (emailCheckTimeoutRef.current) {
      clearTimeout(emailCheckTimeoutRef.current);
    }
  };

  // Edit User shows the user's role and that role's (read-only) access. Nothing
  // to fetch: access comes only from the role, which is already loaded.
  const openEditModal = (user: ApiUser) => {
    setEditingUser(user);
    const roleId = roleOfUser(user)?.id ?? null;
    setEditSelectedRoleId(roleId);
    setEditOriginalRoleId(roleId);
  };

  const resetEditModal = () => {
    setEditingUser(null);
    setEditSelectedRoleId(null);
    setEditOriginalRoleId(null);
  };
  const handleDeleteUser = async (id: string) => {
    if (!await dialog.confirm({
      title: 'Deactivate User',
      message: 'Are you sure you want to deactivate this user?',
      variant: 'warning',
      confirmText: 'Deactivate',
      cancelText: 'Cancel',
    })) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/users/${id}/deactivate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });

      // Handle 401 - logout and redirect
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Handle last admin deactivation blocked
        if (errorData.detail?.error === 'LAST_ADMIN_DEACTIVATION_BLOCKED') {
          toast.error(friendlyErrorMessage(errorData, "Cannot deactivate the last admin user."));
        } else {
          toast.error(friendlyErrorMessage(errorData, "Couldn't deactivate user. Please try again."));
        }
        return;
      }

      toast.success('User deactivated successfully');
      refreshLimits(); // Refresh user limits count
      setSeatQuotaRefreshTrigger(prev => prev + 1); // Refresh SeatQuotaCard
      loadUsers();
    } catch (error: any) {
      console.error('Error deactivating user:', error);
      toast.error(friendlyErrorMessage(error, "Couldn't deactivate user. Please try again."));
    }
  };

  const handleToggleActive = async (user: ApiUser) => {
    // One request per user at a time — rapid clicks used to fire several.
    if (togglingUserIds.has(user.id)) return;

    // Every toast from this toggle names the user it was about: email · ID underneath.
    const userName = user.name || user.email || 'User';
    const who = { description: [user.email, user.user_display_id || user.id].filter(Boolean).join(' · ') };

    // Pre-check: if activating and already at limit, show clear message
    if (!user.is_active && isAtLimit) {
      toast.error(`Can't activate ${userName}: user limit exceeded. Please upgrade your plan to activate more users.`, who);
      return;
    }

    // Optimistic: flip the switch now, revert if the server says no.
    const setActive = (isActive: boolean) =>
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_active: isActive } : u)));
    const revert = () => setActive(user.is_active);
    setActive(!user.is_active);
    setTogglingUserIds((prev) => new Set(prev).add(user.id));

    try {
      const endpoint = user.is_active ? 'deactivate' : 'activate';
      const response = await fetch(`${API_URL}/users/${user.id}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
      });

      // Handle 401 - logout and redirect
      if (response.status === 401) {
        revert();
        handleUnauthorized();
        return;
      }

      if (!response.ok) {
        revert();
        const errorData = await response.json().catch(() => ({}));
        // Handle specific errors
        if (errorData.detail?.error === 'USER_LIMIT_EXCEEDED') {
          toast.error(friendlyErrorMessage(errorData, "User limit exceeded. Please upgrade your plan."), who);
        } else if (errorData.detail?.error === 'LAST_ADMIN_DEACTIVATION_BLOCKED') {
          toast.error(friendlyErrorMessage(errorData, "Cannot deactivate the last admin user."), who);
        } else {
          toast.error(friendlyErrorMessage(errorData, `Couldn't update ${userName}'s status. Please try again.`), who);
        }
        return;
      }

      toast.success(`${userName} ${user.is_active ? 'deactivated' : 'activated'}`, who);
      refreshLimits(); // Refresh user limits count
      setSeatQuotaRefreshTrigger(prev => prev + 1); // Refresh SeatQuotaCard
      // Background sync (counts + list) — no skeleton, the switch already moved.
      loadUsers({ silent: true });
    } catch (error: any) {
      revert();
      console.error('Error toggling user status:', error);
      const isNetworkError = error.message === 'Failed to fetch' || error.name === 'TypeError';
      toast.error(isNetworkError ? `Unable to update ${userName}'s status. Please check your connection and try again.` : friendlyErrorMessage(error, `Couldn't update ${userName}'s status. Please try again.`), who);
    } finally {
      setTogglingUserIds((prev) => {
        const next = new Set(prev);
        next.delete(user.id);
        return next;
      });
    }
  };

  // Email-a-temp-password flow: rotates a temp password, emails it to the user,
  // and forces a change on next login. No password is ever shown to the admin.
  const handleResetPasswordEmail = async (user: ApiUser) => {
    setResetPwSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/users/${user.id}/reset-password`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
      });
      if (response.status === 401) { handleUnauthorized(); return; }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        toast.error(friendlyErrorMessage(errorData, "Couldn't reset password. Please try again."));
        return;
      }
      toast.success(`Temporary password emailed to ${user.email}`);
      closeResetPwModal();
    } catch (error: any) {
      console.error('Error resetting password:', error);
      toast.error(friendlyErrorMessage(error, "Couldn't reset password. Please try again."));
    } finally {
      setResetPwSubmitting(false);
    }
  };

  // Direct-set flow: admin types a new password; it applies immediately (no email,
  // no OTP). force-change-on-next-login defaults OFF. Admin hands it over out-of-band.
  const handleSetPasswordDirect = async (user: ApiUser) => {
    if (directPw.length < 8) { toast.error('Password must be at least 8 characters long'); return; }
    if (!/[A-Z]/.test(directPw)) { toast.error('Password must contain an uppercase letter'); return; }
    if (!/[a-z]/.test(directPw)) { toast.error('Password must contain a lowercase letter'); return; }
    if (!/[0-9]/.test(directPw)) { toast.error('Password must contain a number'); return; }
    if (!/[!@#$%^&*()_+\-=[\]{}|;:,.<>?]/.test(directPw)) { toast.error('Password must contain a special character'); return; }
    if (directPw !== directPwConfirm) { toast.error('Passwords do not match'); return; }

    setResetPwSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/users/${user.id}/set-password`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          new_password: directPw,
          require_change_on_next_login: directPwForceChange,
        }),
      });
      if (response.status === 401) { handleUnauthorized(); return; }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        toast.error(friendlyErrorMessage(errorData, "Couldn't set password. Please try again."));
        return;
      }
      toast.success(`Password updated for ${user.email}`);
      closeResetPwModal();
    } catch (error: any) {
      console.error('Error setting password:', error);
      toast.error(friendlyErrorMessage(error, "Couldn't set password. Please try again."));
    } finally {
      setResetPwSubmitting(false);
    }
  };

  // Force the user to change their password on next login (no rotation, no email).
  const handleForcePasswordChange = async (user: ApiUser) => {
    if (!await dialog.confirm({
      title: 'Force Password Change',
      message: `Require ${user.email} to change their password on next login? Their active sessions will be signed out immediately.`,
      variant: 'warning',
      confirmText: 'Force Change',
      cancelText: 'Cancel',
    })) {
      return;
    }
    try {
      const response = await fetch(`${API_URL}/users/${user.id}/force-password-change`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
      });
      if (response.status === 401) { handleUnauthorized(); return; }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        toast.error(friendlyErrorMessage(errorData, "Couldn't force password change. Please try again."));
        return;
      }
      toast.success('User will be required to change their password on next login');
    } catch (error: any) {
      console.error('Error forcing password change:', error);
      toast.error(friendlyErrorMessage(error, "Couldn't force password change. Please try again."));
    }
  };

  const handleDeactivateExcessUsers = async (countToDeactivate: number) => {
    if (!await dialog.confirm({
      title: 'User Limit Exceeded',
      message: `This will deactivate the last created ${countToDeactivate} user(s) to bring your account back within the plan limit.`,
      variant: 'warning',
      confirmText: 'Deactivate Users',
      cancelText: 'Cancel',
    })) return;

    // Exclude owners and the currently logged-in user from auto-deactivation
    const eligible = users.filter(u =>
      u.is_active &&
      u.role !== 'tenant_admin' &&
      u.email !== currentUser?.email
    );

    // Sort descending by numeric part of user_display_id so the most recently created
    // users are deactivated first (e.g. US-004 is newer than US-003).
    const sorted = [...eligible].sort((a, b) => {
      const numA = parseInt(a.user_display_id?.replace(/\D/g, '') || '0', 10);
      const numB = parseInt(b.user_display_id?.replace(/\D/g, '') || '0', 10);
      return numB - numA;
    });

    const toDeactivate = sorted.slice(0, countToDeactivate);

    if (toDeactivate.length === 0) {
      toast.error('No eligible users to deactivate automatically. Please deactivate users manually.');
      return;
    }

    const loadingId = 'deactivate-excess';
    toast.loading(`Deactivating ${toDeactivate.length} user(s)...`, { id: loadingId });

    let succeeded = 0;
    let failed = 0;

    for (const u of toDeactivate) {
      try {
        const res = await fetch(`${API_URL}/users/${u.id}/deactivate`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
        });
        if (res.ok) {
          succeeded++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    toast.dismiss(loadingId);
    if (succeeded > 0) toast.success(`${succeeded} user(s) deactivated successfully`);
    if (failed > 0) toast.error(`${failed} user(s) could not be deactivated`);

    loadUsers();
    refreshLimits();
    setSeatQuotaRefreshTrigger(prev => prev + 1);
  };

  // Name / email / phone edits are confirmed with a code mailed to the user's
  // CURRENT email (backend: app/services/identity_change.py). The first Save
  // returns 202 + requires_otp and applies NOTHING (not even permissions) —
  // this popup collects the code and re-submits the same save with it.
  const [identityOtp, setIdentityOtp] = useState<{ requestId: string; sentTo: string; alreadySent: boolean } | null>(null);
  const [identityOtpCode, setIdentityOtpCode] = useState('');
  const [identityOtpError, setIdentityOtpError] = useState('');
  const [identityOtpBusy, setIdentityOtpBusy] = useState(false);

  // Name / email edits vs the saved user — drives the in-form notice, the
  // Save button label and the "what will change" list in the code popup.
  const editingSavedUser = editingUser ? users.find(u => u.id.toString() === editingUser.id.toString()) : undefined;
  const identityChanges: { field: string; from: string; to: string }[] = [];
  if (editingUser && editingSavedUser) {
    if ((editingUser.name || '').trim() !== (editingSavedUser.name || '').trim()) {
      identityChanges.push({ field: 'Name', from: editingSavedUser.name || '—', to: editingUser.name || '—' });
    }
    if ((editingUser.email || '').trim().toLowerCase() !== (editingSavedUser.email || '').trim().toLowerCase()) {
      identityChanges.push({ field: 'Email', from: editingSavedUser.email || '—', to: editingUser.email || '—' });
    }
  }

  const closeIdentityOtp = () => {
    setIdentityOtp(null);
    setIdentityOtpCode('');
    setIdentityOtpError('');
  };

  // Cancel = abandon the change; drop the pending request so it can't block a later save.
  const cancelIdentityOtp = async () => {
    const userId = editingUser?.id;
    closeIdentityOtp();
    if (!userId) return;
    try {
      await fetch(`${API_URL}/users/${userId}/identity-change`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
      });
    } catch { /* best effort — a stale request is replaced on the next save anyway */ }
  };

  const resendIdentityOtp = async () => {
    if (!editingUser || !identityOtp) return;
    setIdentityOtpBusy(true);
    setIdentityOtpError('');
    try {
      const res = await fetch(`${API_URL}/users/${editingUser.id}/identity-change/resend`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setIdentityOtp({ requestId: data.request_id, sentTo: data.sent_to || identityOtp.sentTo, alreadySent: false });
        setIdentityOtpCode('');
        toast.success(`New code sent to ${data.sent_to || identityOtp.sentTo}`);
      } else if (data.detail?.error === 'NO_PENDING') {
        // Expired / used up — start a fresh verification with the same changes.
        await handleUpdateUser();
      } else {
        setIdentityOtpError(data.detail?.message || 'Could not resend the code');
      }
    } finally {
      setIdentityOtpBusy(false);
    }
  };

  const handleUpdateUser = async (otp?: { code: string; requestId: string }, staleRetried = false): Promise<void> => {

    if (!editingUser) {
      console.error('[UPDATE USER] editingUser is null/undefined!');
      toast.error('No user selected for editing. Please try again.');
      return;
    }

    if (!editingUser.id) {
      console.error('[UPDATE USER] editingUser.id is missing!', editingUser);
      toast.error('Invalid user data. Please close and reopen the edit dialog.');
      return;
    }

    // Verify the user still exists in the list before attempting update
    // Use toString() comparison to guard against numeric vs string id type mismatch
    const userStillExists = users.some(u => u.id.toString() === editingUser.id.toString());
    if (!userStillExists) {
      console.error('[UPDATE USER] User no longer exists in the current list!', {
        editingUserId: editingUser.id,
        editingUserEmail: editingUser.email,
        currentUserIds: users.map(u => u.id)
      });
      toast.error('This user no longer exists or has been removed. Refreshing list...');
      resetEditModal();
      loadUsers();
      return;
    }

    if (!editSelectedRoleId) {
      toast.error('Please select a role');
      return;
    }

    const selectedRole = availableRoles.find(r => r.id === editSelectedRoleId);
    const roleCode = selectedRole?.code || editingUser.role;

    // Access is role-only: the save sends the role, never per-user permissions.
    const selectedRoleIdForSave = editSelectedRoleId;

    // Build request body
    const requestBody: any = {
      name: editingUser.name,
      email: editingUser.email,
      role: roleCode,
      role_id: editSelectedRoleId,
    };
    if (otp) {
      requestBody.otp = otp.code;
      requestBody.request_id = otp.requestId;
    }

    console.log('[UPDATE USER] PUT', `${API_URL}/users/${editingUser.id}`, { role: roleCode, role_id: editSelectedRoleId, withOtp: !!otp });

    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify(requestBody),
      });

      // Handle 401 - logout and redirect
      if (response.status === 401) {
        handleUnauthorized();
        return;
      }

      // Name/email changed: a code was mailed and NOTHING was saved yet.
      if (response.status === 202) {
        const pending = await response.json().catch(() => ({}));
        if (pending.requires_otp) {
          setIdentityOtp({
            requestId: pending.request_id,
            sentTo: pending.sent_to || editingUser.email,
            alreadySent: !!pending.already_sent,
          });
          setIdentityOtpCode('');
          setIdentityOtpError('');
          return;
        }
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // A leftover unfinished verification (older backends never cleared
        // one, so it blocked every later save): drop it and retry once.
        if (errorData.detail?.error === 'VERIFICATION_PENDING' && !otp && !staleRetried) {
          await fetch(`${API_URL}/users/${editingUser.id}/identity-change`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
          }).catch(() => undefined);
          setIsSaving(false);
          return await handleUpdateUser(undefined, true);
        }

        // Wrong / expired code: keep the code popup open and say why.
        const otpErr = errorData.detail?.error;
        if (otp && (otpErr === 'OTP_INVALID' || otpErr === 'OTP_EXPIRED' || otpErr === 'NO_PENDING' || otpErr === 'REQUEST_MISMATCH')) {
          setIdentityOtpError(
            otpErr === 'OTP_INVALID' && errorData.detail?.attempts_left > 0
              ? errorData.detail.message
              : 'This code can no longer be used. Click "Send new code".'
          );
          return;
        }

        // DEBUG: Log error details
        console.error('='.repeat(80));
        console.error('[UPDATE USER ERROR] Update failed!');
        console.error('[UPDATE USER ERROR] Status:', response.status);
        console.error('[UPDATE USER ERROR] Status Text:', response.statusText);
        console.error('[UPDATE USER ERROR] Error Data:', JSON.stringify(errorData, null, 2));
        console.error('[UPDATE USER ERROR] User ID that failed:', editingUser.id);
        console.error('[UPDATE USER ERROR] User Email that failed:', editingUser.email);
        console.error('='.repeat(80));

        if (errorData.detail?.error === 'LAST_ADMIN_ROLE_CHANGE_BLOCKED') {
          toast.error(friendlyErrorMessage(errorData, "Cannot change role of the last admin user."));
        } else {
          toast.error(friendlyErrorMessage(errorData, "Couldn't update user. Please try again."));
        }
        return;
      }

      // ✅ CRITICAL FIX: Parse response and update user in state immediately
      const updatedUserData = await response.json();
      console.log('[UPDATE USER] ✅ Response received:', updatedUserData);
      console.log('[UPDATE USER] ✅ Updated role:', updatedUserData.role);

      // Update the user in local state immediately (don't wait for loadUsers)
      setUsers(prevUsers => {
        const updated = prevUsers.map(user =>
          user.id === editingUser.id
            ? {
                ...user,
                ...updatedUserData,
                id: user.id, // ⚠️ PRESERVE string id — API returns numeric id which would cause type mismatch in userStillExists check
                // Keep the old value when the response lacks a field — an
                // undefined role/name/email crashed the list (.toLowerCase()).
                role: updatedUserData.role ?? user.role,
                name: updatedUserData.name ?? user.name,
                email: updatedUserData.email ?? user.email,
                role_id: typeof updatedUserData.role_id === 'number' ? updatedUserData.role_id : (selectedRoleIdForSave ?? user.role_id),
              }
            : user
        );
        console.log('[UPDATE USER] 🔄 State updated, user role is now:', updated.find(u => u.id === editingUser.id)?.role);
        return updated;
      });

      closeIdentityOtp();
      toast.success('User updated successfully');

      if (Array.isArray(updatedUserData.dependency_notices)) {
        updatedUserData.dependency_notices.forEach((notice: string) => {
          toast.warning(notice);
        });
      }

      resetEditModal();

      // Refresh current user's session unconditionally — handles WebSocket failures
      // where the permission-updated push never reached the affected user's browser.
      // Small delay lets the backend finish RBAC sync before we re-fetch.
      // Roles reload too: their user counts / holders change with a role move.
      setTimeout(() => {
        Promise.all([refreshUser(), loadUsers(), loadRoles()]);
      }, 300);
    } catch (error: any) {
      console.error('Error updating user:', error);

      // Handle 404 - user not found (deleted or wrong tenant)
      if (error.response?.status === 404) {
        toast.error('User not found. The user may have been deleted or belongs to a different organization. Refreshing list...');
        resetEditModal();
        loadUsers(); // Refresh the list to remove stale data
      } else {
        toast.error(friendlyErrorMessage(error, "Couldn't update user. Please try again."));
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Read-only access line for a user's role (users table + phone cards).
  const renderUserAccess = (user: ApiUser, max = 3) => {
    const role = roleOfUser(user);
    if (role) return <AccessInline codes={codesOfRole(role)} max={max} />;
    if ((user.role || '').toLowerCase() === 'tenant_admin') {
      return <span className="text-xs text-gray-500 dark:text-slate-400">Full access (account owner)</span>;
    }
    if (!rolesLoaded) return <Skeleton className="h-4 w-32" />;
    return <span className="tf-hint">—</span>;
  };

  /** Add User / Edit User body (prototype `.ux`): details + role on the left,
   *  the chosen role's read-only access on the right. Access is never edited
   *  per person: "Create a role based on …" makes a new role to assign. */
  const renderRoleAccessForm = ({
    fields,
    roleId,
    onRoleChange,
    target,
    personName,
    originalRoleId,
    roleLockedReason,
  }: {
    fields: React.ReactNode;
    roleId: number | null;
    onRoleChange: (id: number) => void;
    target: 'create' | 'edit';
    personName?: string;
    originalRoleId?: number | null;
    /** Set when the viewer may not change the role: picker greyed with this tooltip. */
    roleLockedReason?: string;
  }) => {
    const role = roleId != null ? availableRoles.find((r) => r.id === roleId) ?? null : null;
    const original = originalRoleId != null ? availableRoles.find((r) => r.id === originalRoleId) : undefined;
    const moving = !!(role && original && role.id !== original.id);
    const dupBlockedReason = !canCreateRole
      ? 'You do not have permission to create roles'
      : roleLimitReached
        ? `Role limit reached (${roleLimit}). Delete an unused role first.`
        : !role
          ? 'Choose a role first'
          : '';
    return (
      <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-[280px_minmax(0,1fr)] md:gap-7">
        <div className="min-w-0 space-y-4">
          {fields}
          <div>
            <Label className="mb-1.5">
              Role <span className="text-destructive">*</span>
            </Label>
            <div title={roleLockedReason || undefined} className={roleLockedReason ? 'cursor-not-allowed' : ''}>
              <FilterSelect
                value={role ? String(role.id) : ''}
                onChange={(v) => { if (v && !roleLockedReason) onRoleChange(Number(v)); }}
                options={availableRoles.map((r) => ({ value: String(r.id), label: r.name }))}
                placeholder={rolesLoaded ? 'Choose a role' : 'Loading roles…'}
                ariaLabel="Role"
                disabled={!rolesLoaded || !!roleLockedReason}
                className="w-full sm:w-full"
              />
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-gray-500 dark:text-slate-400">
              {moving ? (
                <>
                  <b className="font-semibold text-gray-900 dark:text-slate-100">{personName || 'This user'}</b> moves from {original!.name} to{' '}
                  <b className="font-semibold text-gray-900 dark:text-slate-100">{role!.name}</b> when you save.
                </>
              ) : role ? (
                'To change what this role can do, edit it in Role Management.'
              ) : (
                'What this person can do comes only from their role.'
              )}
            </p>
            {rolesLoaded && availableRoles.length === 0 && (
              <p className="mt-1.5 text-xs text-destructive">No roles available. Create roles in Role Management first.</p>
            )}
          </div>
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-3.5 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-900 dark:text-slate-100">
              <Info className="h-4 w-4 shrink-0 text-brand-blue" />
              Need different access?
            </div>
            <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-slate-400">
              Access is set by roles, not per person. Create a role with the access this person needs, then assign it here.
            </p>
            <button
              type="button"
              aria-disabled={!!dupBlockedReason}
              title={dupBlockedReason || undefined}
              onClick={() => {
                if (dupBlockedReason || !role) return;
                setDupTarget(target);
                setDupRoleFrom(role);
              }}
              className={`mt-2 inline-flex max-w-full items-center gap-1 text-left text-[13px] font-medium ${
                dupBlockedReason
                  ? 'cursor-not-allowed text-gray-400 dark:text-slate-500'
                  : 'text-brand-blue hover:underline dark:text-blue-300'
              }`}
            >
              <span className="min-w-0 truncate">Create a role based on {role ? role.name : 'a role'}</span>
              <ChevronRight className="h-3.5 w-3.5 shrink-0" />
            </button>
          </div>
        </div>
        <div className="min-w-0 rounded-2xl border border-gray-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40 sm:p-5">
          {role ? (
            <RoleAccessSummary codes={codesOfRole(role)} roleName={role.name} description={role.description} />
          ) : (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center">
              <Shield className="h-6 w-6 text-gray-300 dark:text-slate-600" />
              <p className="text-sm font-medium text-gray-700 dark:text-slate-300">Choose a role</p>
              <p className="max-w-xs text-xs text-gray-500 dark:text-slate-400">The role&apos;s access shows here. What a person can do comes only from their role.</p>
            </div>
          )}
        </div>
      </div>
    );
  };
  return (
    // Card, breadcrumb, organization tabs and the tab panel come from
    // app/(dashboard)/organization/layout.tsx — this renders the panel's content.
    <div ref={rootRef}>
      {/* Header */}
      <PageHeader
        icon={<UserCog className="h-5 w-5" />}
        title="User Management"
        // Hidden on phones — the title is enough there and the line costs a row.
        description={<span className="hidden sm:inline">Add people and give each one a role. What a person can do comes only from their role.</span>}
        actions={
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* RBAC07: Dependency Matrix button */}
            <Button
              variant="secondary"
              onClick={() => setIsDependencyMatrixOpen(true)}
              icon={<Link2 className="w-4 h-4" />}
              aria-label="View Feature Dependencies" title="View Feature Dependencies"
              className="max-sm:h-8 max-sm:gap-0 max-sm:px-2"
            >
              {/* Icon-only on phones so it sits beside Invite User on one row */}
              <span className="hidden sm:inline">Dependencies</span>
            </Button>
            {/* RBAC01: Check user limits before showing Add User button — also
                requires users:create (greyed with a hover tooltip, never hidden). */}
            <Button
              variant="primary"
              icon={<Plus className="w-4 h-4" />}
              aria-disabled={!canCreateUser}
              title={!canCreateUser ? 'You do not have permission to invite users' : undefined}
              className={`${!canCreateUser ? 'opacity-60 cursor-not-allowed' : ''}`}
              onClick={() => {
                if (!canCreateUser) return;
                if (isAtLimit) {
                  if (isTrial) {
                    toast.error('User limit reached. Add-on seat purchases are only available for paid subscriptions. Please upgrade your plan.');
                  } else {
                    setShowAddSeatsModal(true);
                  }
                  return;
                }
                setIsCreateModalOpen(true);
              }}
            >
              {isAtLimit && !isTrial ? 'Buy More Seats' : 'Invite User'}
            </Button>
          </div>
        }
      />

      {/* Addon card - only shows when quota exhausted, hidden for trial users */}
      {!isTrial && (
        <div className="mb-5">
          <SeatQuotaCard
            onRefresh={() => { loadUsers(); refreshLimits(); }}
            onDeactivateExcess={handleDeactivateExcessUsers}
            compact
            refreshTrigger={seatQuotaRefreshTrigger}
          />
        </div>
      )}

      {/* One section for the list's controls. Top row: status pills (these were
          the Total / Active / Inactive stat cards — same counts, same filter on
          click) and seat usage. Bottom row: search and the result count. */}
      <div className="tf-card-soft mb-4 sm:mb-5 p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div role="group" aria-label="Filter users by status" className="-mx-1 flex flex-nowrap items-center gap-2 overflow-x-auto scrollbar-hide tf-hide-native-scrollbar px-1 py-0.5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
            {([
              { key: 'all', label: 'All users', Icon: UsersIcon, count: totalUsersCount, of: null },
              { key: 'active', label: 'Active', Icon: UserCheck, count: activeUsersCount, of: limits?.max_users === -1 ? '∞' : (limits?.max_users ?? null) },
              { key: 'inactive', label: 'Inactive', Icon: UserX, count: inactiveUsersCount, of: null },
            ] as const).map(({ key, label, Icon, count, of }) => {
              const active = isOverviewCardActive(key);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setStatusFilter(key);
                    setPageView('list');
                    setCurrentPage(1);
                  }}
                  className={`inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium sm:h-9 sm:gap-2 sm:px-3.5 sm:text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue/40 ${
                    active
                      ? 'bg-brand-blue text-white shadow-sm shadow-brand-blue/25'
                      : 'bg-brand-blue/5 text-gray-700 ring-1 ring-brand-blue/10 hover:bg-brand-blue/10 hover:text-brand-blue dark:bg-brand-blue/10 dark:text-slate-300'
                  }`}
                >
                  <Icon className="hidden h-4 w-4 sm:block" />
                  {key === 'all' ? <><span className="sm:hidden">All</span><span className="hidden sm:inline">{label}</span></> : label}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${
                      active ? 'bg-white/20 text-white' : 'bg-white text-gray-900 ring-1 ring-gray-200 dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700'
                    }`}
                  >
                    {userCountsFailed ? '—' : count}
                    {of !== null && <span className={active ? 'text-white/70' : 'text-gray-400 dark:text-slate-500'}> / {of}</span>}
                  </span>
                </button>
              );
            })}
          </div>

          {limits && limits.max_users > 0 && (
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="tf-caption whitespace-nowrap"><span className="sm:hidden">Seats</span><span className="hidden sm:inline">Seat usage</span></span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-28 sm:w-36 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      isAtLimit
                        ? 'bg-destructive'
                        : limits.approaching_limit
                          ? 'bg-brand-orange'
                          : 'bg-brand-blue'
                    }`}
                    style={{ width: `${Math.min(limits.usage_percentage, 100)}%` }}
                  />
                </div>
                <span className="tf-row-title tabular-nums">
                  {Math.min(limits.usage_percentage, 100)}%
                </span>
              </div>
              <span className="hidden tf-meta whitespace-nowrap sm:inline">
                Plan{' '}
                <span className="font-semibold text-gray-700 dark:text-slate-300">
                  {(() => {
                    const sl = quotaData?.quotas?.max_seats?.subscription?.limit;
                    return sl === 'unlimited' || sl === -1 ? '∞' : (sl ?? limits.max_users);
                  })()}
                </span>
                {' · '}Add-ons{' '}
                {(quotaData?.quotas?.max_seats?.addon?.total_purchased ?? 0) > 0 ? (
                  <span className="font-semibold text-gray-700 dark:text-slate-300">
                    {quotaData?.quotas?.max_seats?.addon?.total_purchased}
                  </span>
                ) : (
                  <span className="italic text-gray-400 dark:text-slate-500">none</span>
                )}
              </span>
            </div>
          )}
        </div>

        {pageView === 'list' && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-slate-700/60 sm:flex-nowrap sm:gap-3">
            {/* Left: search + role filter */}
            <div className={`flex min-w-0 flex-1 items-center gap-2 sm:max-w-xl ${hasRoleFilter ? 'basis-full sm:basis-auto' : ''}`}>
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-slate-500" />
                <Input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9 pl-9 rounded-[6.6px]"
                />
              </div>
              {/* Role filter: here from sm up (one row); phones show it on the second line. */}
              {renderRoleFilter('hidden sm:flex')}
            </div>
            {/* Right: clear-sort chip (desktop) + count. On phones with a role filter this
                becomes the full-width second line: role filter left, count right. */}
            <div className={`flex shrink-0 items-center gap-2 ${hasRoleFilter ? 'w-full justify-between sm:w-auto sm:justify-end' : ''}`}>
              {renderRoleFilter('sm:hidden')}
              {/* Key for the Access (from role) dots — below lg it sits on its own line. */}
              <div className="hidden lg:block">
                <AccessLegend />
              </div>
              {/* Visible only while a column is sorted; restores the server order. Hidden on
                  phones, where the table headings (and so the sort) aren't shown. */}
              <ClearSortChip
                sort={userSort}
                labels={{ id: 'User ID', user: 'User', role: 'Role', status: 'Status', created: 'Created' }}
                onClear={() => { userSort.clearSort?.(); setCurrentPage(1); }}
                className="hidden lg:inline-flex"
              />
              {/* "9 users" — or "3 of 9" with a clear-all ✕ while anything narrows the list */}
              {isUserListNarrowed ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand-blue/5 py-1 pl-2.5 pr-1 text-xs font-medium text-brand-blue ring-1 ring-brand-blue/10 dark:bg-brand-blue/15 dark:text-blue-200">
                  <span className="tabular-nums">{filteredUsers.length} of {users.length}</span>
                  <button
                    type="button"
                    onClick={clearUserFilters}
                    aria-label="Clear search and filters"
                    title="Clear search and filters"
                    className="inline-flex h-4 w-4 items-center justify-center rounded text-brand-blue/70 transition-colors hover:bg-brand-blue/15 hover:text-brand-blue"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ) : (
                <span className="shrink-0 rounded-lg bg-brand-blue/5 px-2.5 py-1 text-xs font-medium text-brand-blue ring-1 ring-brand-blue/10 dark:bg-brand-blue/15 dark:text-blue-200">
                  {filteredUsers.length} {filteredUsers.length === 1 ? 'user' : 'users'}
                </span>
              )}
            </div>
          </div>
        )}
        {pageView === 'list' && (
          <div className="mt-2 lg:hidden">
            <AccessLegend />
          </div>
        )}
      </div>

      {pageView === 'list' && (
      <>
      {/* Users Table */}
      <div className="tf-card tf-round-edges">
        {isLoading ? (
          /* Neutral skeleton matching the users table columns: User ID, User,
             Role, Permissions, Status, Created / Last Login, Actions.
             Column count per breakpoint mirrors the real <thead> below: User ID
             hides below 2xl, Permissions below lg, Created / Last Login below xl
             (both shown under the user's name instead); below lg, cards. */
          <>
          <div className="tf-grid-2 overflow-hidden rounded-xl p-3 lg:hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-slate-700">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-40 max-w-full" />
                  </div>
                  <Skeleton className="h-6 w-11 rounded-full" />
                </div>
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-3 w-44" />
                <div className="flex justify-end gap-1 border-t border-gray-100 pt-2 dark:border-slate-700/60">
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <Skeleton className="h-10 w-10 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
          <div className="hidden lg:block tf-table-shell">
            <div className="grid grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 px-6 py-4">
              <div className="hidden 2xl:block"><Skeleton className="h-3 w-16" /></div>
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-12" />
              <div className="hidden xl:block"><Skeleton className="h-3 w-24" /></div>
              <Skeleton className="h-3 w-14" />
              <div className="hidden xl:block"><Skeleton className="h-3 w-24" /></div>
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="divide-y divide-gray-100 dark:divide-slate-700/60">
              {Array.from({ length: 8 }).map((_, r) => (
                <div key={r} className="grid grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 items-center gap-4 px-6 py-4">
                  <div className="hidden 2xl:block"><Skeleton className="h-5 w-16 rounded" /></div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-28" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <div className="hidden lg:block">
                    <div className="flex flex-wrap gap-1">
                      <Skeleton className="h-5 w-14 rounded" />
                      <Skeleton className="h-5 w-10 rounded" />
                    </div>
                  </div>
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <div className="hidden xl:block space-y-1.5"><Skeleton className="h-3 w-28" /><Skeleton className="h-3 w-28" /></div>
                  <div className="flex items-center justify-center gap-1">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <Skeleton className="h-8 w-8 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          </>
        ) : (
          <>
          {/* Table from lg up — below that the columns get too cramped. */}
          <div className="hidden lg:block tf-table-shell">
            <table className="w-full">
              <thead className="bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700">
                <tr>
                  <th className="tf-th-cell text-left tf-th hidden 2xl:table-cell" aria-sort={ariaSort(userSort, 'id')}>
                    <SortableHeader label="User ID" column="id" sort={userSortWithReset} />
                  </th>
                  <th className="tf-th-cell text-left tf-th" aria-sort={ariaSort(userSort, 'user')}>
                    <SortableHeader label="User" column="user" sort={userSortWithReset} />
                  </th>
                  <th className="tf-th-cell text-left tf-th" aria-sort={ariaSort(userSort, 'role')}>
                    <SortableHeader label="Role" column="role" sort={userSortWithReset} />
                  </th>
                  <th className="tf-th-cell text-left tf-th hidden lg:table-cell">
                    Access (from role)
                  </th>
                  <th className="tf-th-cell text-left tf-th" aria-sort={ariaSort(userSort, 'status')}>
                    <SortableHeader label="Status" column="status" sort={userSortWithReset} />
                  </th>
                  <th className="tf-th-cell text-left tf-th hidden xl:table-cell" aria-sort={ariaSort(userSort, 'created')}>
                    <SortableHeader label="Created / Last Login" column="created" sort={userSortWithReset} />
                  </th>
                  <th className="tf-th-cell text-center tf-th tf-sticky-col">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-slate-700/60">
                {paginatedUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-brand-blue/5 transition-colors">
                    <td className={`px-3 xl:px-4 2xl:px-5 py-2.5 lg:py-3 hidden 2xl:table-cell ${user.is_active ? '' : 'opacity-60'}`}>
                      {user.user_display_id ? (
                        <button
                          type="button"
                          onClick={() => copyText(user.user_display_id!, 'User ID')}
                          title="Copy User ID"
                          className="px-2 py-0.5 text-xs font-mono font-semibold bg-brand-blue/5 text-brand-blue rounded ring-1 ring-brand-blue/15 transition-colors hover:bg-brand-blue/10"
                        >
                          {user.user_display_id}
                        </button>
                      ) : (
                        <span className="tf-hint">—</span>
                      )}
                    </td>
                    <td className="tf-td">
                      {/* Inactive users read faded (identity only — toggle/actions stay full strength). */}
                      <div className={`flex items-center gap-2 sm:gap-3 ${user.is_active ? '' : 'opacity-60'}`}>
                        <NameAvatar name={user.name} fallback={user.email} src={user.avatar_url} userId={user.id} size="md" />
                        <div className="min-w-0 max-w-[180px] lg:max-w-[220px] 2xl:max-w-[260px]">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate tf-row-title" title={user.name || user.email || undefined}>{user.name || user.email || 'Unknown'}</span>
                            {renderYouTag(user)}
                          </div>
                          {user.email && (
                            <button
                              type="button"
                              onClick={() => copyText(user.email, 'Email')}
                              title={`Copy ${user.email}`}
                              className="flex max-w-full items-center gap-1 text-left text-xs text-gray-500 transition-colors hover:text-brand-blue dark:text-slate-500"
                            >
                              <Mail className="w-3 h-3 flex-shrink-0" />
                              <span className="truncate">{user.email}</span>
                            </button>
                          )}
                          {/* User ID / dates columns are hidden on narrower screens — show them here. */}
                          {user.user_display_id && (
                            <button
                              type="button"
                              onClick={() => copyText(user.user_display_id!, 'User ID')}
                              title="Copy User ID"
                              className="2xl:hidden mt-1 inline-block px-1.5 py-0.5 text-2xs font-mono font-semibold bg-brand-blue/5 text-brand-blue rounded ring-1 ring-brand-blue/15 transition-colors hover:bg-brand-blue/10"
                            >
                              {user.user_display_id}
                            </button>
                          )}
                          <div className="mt-1 xl:hidden">{renderUserDates(user)}</div>
                        </div>
                      </div>
                    </td>
                    <td className={`px-3 xl:px-4 2xl:px-5 py-2.5 lg:py-3 ${user.is_active ? '' : 'opacity-60'}`}>
                      <span title={getRoleLabel(user.role, availableRoles)} className={`inline-block max-w-[120px] lg:max-w-[160px] truncate align-middle px-2 sm:px-2.5 py-0.5 sm:py-1 text-[0.675rem] font-semibold rounded-full ring-1 ring-inset ring-black/5 ${getRoleBadgeColor(user.role, availableRoles)}`}>
                        {getRoleLabel(user.role, availableRoles)}
                      </span>
                    </td>
                    <td className="tf-td tf-wrap hidden lg:table-cell">
                      {/* What the user's role can do — read only; the eye action shows it all. */}
                      <div className={`max-w-[220px] xl:max-w-[260px] 2xl:max-w-sm ${user.is_active ? '' : 'opacity-60'}`}>
                        {renderUserAccess(user, 2)}
                      </div>
                    </td>
                    <td className="tf-td">
                      {renderUserStatus(user, true)}
                    </td>
                    <td className="tf-td hidden xl:table-cell">
                      {renderUserDates(user, false)}
                    </td>
                    <td className="tf-td tf-sticky-col">
                      {renderUserActions(user)}
                    </td>
                  </tr>
                ))}
                {/* Empty result: the message fills the shell's reserved height
                    (TABLE_EMPTY_PANEL_CLASS) instead of sitting below a blank
                    400px box. colSpan covers the widest (2xl) column set. */}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-0">
                      <div className={TABLE_EMPTY_PANEL_CLASS}>
                        <EmptyState
                          icon={UserCog}
                          title="No users found"
                          description="Try adjusting your search, or invite a new teammate to get started."
                          action={isUserListNarrowed ? { label: 'Clear filters', onClick: clearUserFilters, variant: 'secondary' } : undefined}
                        />
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {/* Below lg: one card per user. Phones: a compact divided list (no box
              inside the table box). Tablets: 2 boxed cards per row.
              grid-cols-1 = minmax(0,1fr) — without it the implicit column grew
              to the cards' content and pushed them off the right edge. */}
          {/* Own rounded corners: the hidden desktop table is the wrapper's first
              child, so tf-round-edges never rounds this list and its white rows
              squared off the card's corners. Bottom too unless pagination
              (shown above 5 users) closes the card. */}
          <MobileRecordList className={`p-3 ${filteredUsers.length <= 5 ? 'rounded-b-xl' : ''}`}>
            {paginatedUsers.map((user) => {
              // Inactive users read faded (identity only — the toggle stays full strength).
              const fade = user.is_active ? '' : 'opacity-60';
              return (
                <MobileRecordCard
                  key={user.id}
                  idBadge={
                    user.user_display_id ? (
                      <button
                        type="button"
                        onClick={() => copyText(user.user_display_id!, 'User ID')}
                        title="Copy User ID"
                        className={`shrink-0 px-1.5 py-0.5 text-2xs font-mono font-semibold bg-brand-blue/5 text-brand-blue rounded ring-1 ring-brand-blue/15 ${fade}`}
                      >
                        {user.user_display_id}
                      </button>
                    ) : undefined
                  }
                  title={
                    <span className={`flex min-w-0 items-center gap-2 ${fade}`}>
                      <NameAvatar name={user.name} fallback={user.email} src={user.avatar_url} userId={user.id} size="sm" />
                      <span className="min-w-0 truncate">{user.name || user.email || 'Unknown'}</span>
                    </span>
                  }
                  badges={
                    <>
                      {renderYouTag(user)}
                      <span title={getRoleLabel(user.role, availableRoles)} className={`min-w-0 truncate px-2 py-0.5 text-2xs font-semibold rounded-full ring-1 ring-inset ring-black/5 sm:px-2.5 sm:py-1 sm:text-xs ${getRoleBadgeColor(user.role, availableRoles)} ${fade}`}>
                        {getRoleLabel(user.role, availableRoles)}
                      </span>
                    </>
                  }
                  meta={[
                    {
                      label: user.email ? (
                        <button
                          type="button"
                          onClick={() => copyText(user.email, 'Email')}
                          title={`Copy ${user.email}`}
                          className={`flex max-w-full items-center gap-1 text-left transition-colors hover:text-brand-blue ${fade}`}
                        >
                          <Mail className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
                          <span className="truncate">{user.email}</span>
                        </button>
                      ) : null,
                    },
                  ]}
                  actions={
                    <>
                      {/* Toggle only — its colour says Active/Inactive. */}
                      <div className="shrink-0">{renderUserStatus(user, true)}</div>
                      <div className="shrink-0 [&_button]:p-1.5 sm:[&_button]:p-2.5">{renderUserActions(user)}</div>
                    </>
                  }
                >
                  {/* Access from the role (read only), then dates (icons, no labels) */}
                  <div className={`mt-2 ${fade}`}>{renderUserAccess(user, 2)}</div>
                  <div className={`mt-2 ${fade}`}>{renderUserDates(user, false)}</div>
                </MobileRecordCard>
              );
            })}
          </MobileRecordList>
          </>
        )}

        {/* Below lg only — from lg up the message renders inside the table body. */}
        {!isLoading && filteredUsers.length === 0 && (
          <div className="lg:hidden">
            <EmptyState
              icon={UserCog}
              title="No users found"
              description="Try adjusting your search, or invite a new teammate to get started."
              action={isUserListNarrowed ? { label: 'Clear filters', onClick: clearUserFilters, variant: 'secondary' } : undefined}
            />
          </div>
        )}

        {/* Pagination — the table card's footer, not a separate card. */}
        {!isLoading && filteredUsers.length > 0 && (
          <ListPagination
            attached
            minimalOnMobile
            currentPage={currentPage}
            itemsPerPage={itemsPerPage}
            totalItems={filteredUsers.length}
            onPageChange={setCurrentPage}
            onItemsPerPageChange={setItemsPerPage}
            itemLabel="users"
          />
        )}
      </div>
      </>
      )}

      {/* Invite (Add) User Modal — no default role: Invite stays greyed until one is picked. */}
      {isCreateModalOpen && (
        <AppModal
          open
          size="lg"
          mobileSheet
          zIndexClass="z-50"
          onCancel={resetCreateModal}
          cancelDisabled={isSaving}
          icon={<Plus />}
          title="Invite New User"
          subtitle="They get an email invite to set their password."
          actions={[
            {
              label: 'Invite User',
              onClick: handleCreateUser,
              locked: !selectedRoleId,
              title: !selectedRoleId ? 'Choose a role' : undefined,
              disabled: isSaving || !emailCheckResult.available || isCheckingEmail,
              icon: isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />,
            },
          ]}
        >
          {renderRoleAccessForm({
            target: 'create',
            roleId: selectedRoleId,
            onRoleChange: setSelectedRoleId,
            fields: (
              <>
                <div>
                  <Label className="mb-1.5">
                    Full Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="text"
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    placeholder="e.g. Neha Kapoor"
                  />
                </div>
                <div>
                  <Label className="mb-1.5">
                    Email <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => {
                      const value = e.target.value;
                      setNewUser({ ...newUser, email: value });
                      checkEmailAvailability(value);
                    }}
                    placeholder="name@company.com"
                  />
                  {/* Email validation feedback */}
                  {isCheckingEmail && (
                    <div className="mt-2 flex items-center gap-2 tf-body-muted">
                      <Loader2 className="w-4 h-4 animate-spin text-brand-blue" />
                      <span>Validating email...</span>
                    </div>
                  )}
                  {emailCheckResult.error && (
                    <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive-line bg-destructive-subtle p-3 ring-1 ring-destructive-line">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      <p className="text-sm font-medium text-destructive-strong">{emailCheckResult.error}</p>
                    </div>
                  )}
                </div>
                {/* Password is auto-generated — user receives invite email */}
                <p className="flex items-start gap-1.5 tf-meta">
                  <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  A temporary password is emailed to them; they set a new one on first login.
                </p>
              </>
            ),
          })}
        </AppModal>
      )}

      {/* Edit User Modal — details + role; the role's access is read only. */}
      {editingUser && (
        <AppModal
          open
          size="lg"
          mobileSheet
          zIndexClass="z-50"
          onCancel={resetEditModal}
          cancelDisabled={isSaving}
          icon={<Pencil />}
          title="Edit User"
          subtitle={editingSavedUser?.email ?? editingUser.email}
          footerStart={
            editSelectedRoleId !== editOriginalRoleId || identityChanges.length > 0 ? (
              <span className="hidden items-center gap-1.5 text-xs font-medium text-brand-orange sm:inline-flex">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-orange" />
                Unsaved changes
              </span>
            ) : null
          }
          actions={[
            {
              label: identityChanges.length > 0 ? 'Send code & Save' : 'Save Changes',
              onClick: () => handleUpdateUser(),
              locked: !editSelectedRoleId,
              title: !editSelectedRoleId ? 'Choose a role' : undefined,
              disabled: isSaving,
              icon: isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined,
            },
          ]}
        >
          {renderRoleAccessForm({
            target: 'edit',
            roleId: editSelectedRoleId,
            onRoleChange: setEditSelectedRoleId,
            originalRoleId: editOriginalRoleId,
            roleLockedReason: canAssignRole ? undefined : 'You do not have permission to change roles',
            personName: editingSavedUser?.name || editingUser.name,
            fields: (
              <>
                <div>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <Label>Full Name</Label>
                    <span className={`text-xs tabular-nums ${editingUser.name.length >= 50 ? 'text-brand-orange' : 'text-gray-400 dark:text-slate-500'}`}>
                      {editingUser.name.length}/50
                    </span>
                  </div>
                  <Input
                    type="text"
                    value={editingUser.name}
                    maxLength={50}
                    onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value.slice(0, 50) })}
                  />
                </div>
                <div>
                  <Label className="mb-1.5">Email</Label>
                  <Input
                    type="email"
                    value={editingUser.email}
                    onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                    placeholder="name@company.com"
                  />
                </div>
                {identityChanges.length > 0 ? (
                  <div className="flex gap-2.5 rounded-xl border border-brand-orange/30 bg-brand-orange/[0.06] p-3">
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" />
                    <div className="space-y-1 text-xs leading-relaxed text-gray-700 dark:text-slate-300">
                      <p className="font-semibold text-gray-900 dark:text-slate-50">
                        Changing the {identityChanges.map(c => c.field.toLowerCase()).join(' and ')}{' '}needs the user&apos;s confirmation
                      </p>
                      <p>
                        When you click <span className="font-semibold">Send code &amp; Save</span>, a 6-digit code is emailed to{' '}
                        <span className="font-semibold break-all">{editingSavedUser?.email}</span>. Ask the user for that code and enter it
                        in the next step. Nothing is saved until the code is verified.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="flex items-start gap-1.5 tf-meta">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Changing the name or email needs a verification code sent to the user&apos;s current email.
                  </p>
                )}
              </>
            ),
          })}
        </AppModal>
      )}

      {/* Create a role based on … — stacked over Add / Edit User. */}
      <RoleEditorModal
        open={!!dupRoleFrom}
        mode="dup"
        role={dupRoleFrom}
        roles={availableRoles}
        onClose={() => setDupRoleFrom(null)}
        onSaved={(created) => { void handleDupRoleSaved(created); }}
        // Above Add / Edit User (z-50); its own prompts (z-[70]) stay above it.
        zIndexClass="z-[60]"
        quietSuccess
      />
      {/* Reset Password Modal — choose: email a temp password OR set one directly */}
      {resetPwUser && (
        <AppModal
          open
          size="sm"
          onCancel={closeResetPwModal}
          cancelDisabled={resetPwSubmitting}
          icon={<KeyRound />}
          title="Reset Password"
          subtitle={resetPwUser.email}
          actions={resetPwMode === 'choose' ? [] : [
            {
              label: 'Back',
              variant: 'secondary',
              onClick: () => setResetPwMode('choose'),
              disabled: resetPwSubmitting,
              icon: <ArrowLeft className="w-4 h-4" />,
            },
            {
              label: 'Set Password',
              onClick: () => handleSetPasswordDirect(resetPwUser),
              disabled: resetPwSubmitting,
              icon: resetPwSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : undefined,
            },
          ]}
        >
            <div className="space-y-4">
              {resetPwMode === 'choose' ? (
                <>
                  <button
                    onClick={() => handleResetPasswordEmail(resetPwUser)}
                    disabled={resetPwSubmitting}
                    className="w-full text-left p-4 rounded-xl ring-1 ring-gray-200 dark:ring-slate-600 hover:ring-warning-line hover:bg-warning-subtle/50 dark:hover:bg-slate-700/50 transition-all disabled:opacity-60"
                  >
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-warning flex-shrink-0" />
                      <div>
                        <p className="tf-row-name">Email a temporary password</p>
                        <p className="tf-meta mt-0.5">Sends a temp password to the user and forces a reset on next login. You never see it.</p>
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => setResetPwMode('direct')}
                    disabled={resetPwSubmitting}
                    className="w-full text-left p-4 rounded-xl ring-1 ring-gray-200 dark:ring-slate-600 hover:ring-brand-blue/50 hover:bg-brand-blue/5 transition-all disabled:opacity-60"
                  >
                    <div className="flex items-center gap-3">
                      <KeyRound className="w-5 h-5 text-brand-blue flex-shrink-0" />
                      <div>
                        <p className="tf-row-name">Set a password directly</p>
                        <p className="tf-meta mt-0.5">You type a new password and hand it to the user. No email, no OTP.</p>
                      </div>
                    </div>
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <label className="block tf-label mb-1">New password</label>
                    <div className="relative">
                      <Input
                        type={directPwShow ? 'text' : 'password'}
                        value={directPw}
                        onChange={(e) => setDirectPw(e.target.value)}
                        autoComplete="new-password"
                        className="pr-10"
                        placeholder="Min 8 chars, upper, lower, number, special"
                      />
                      <button type="button" onClick={() => setDirectPwShow(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600" aria-label="Toggle visibility">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block tf-label mb-1">Confirm password</label>
                    <Input
                      type={directPwShow ? 'text' : 'password'}
                      value={directPwConfirm}
                      onChange={(e) => setDirectPwConfirm(e.target.value)}
                      autoComplete="new-password"
                      placeholder="Re-enter password"
                    />
                  </div>
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <Checkbox
                      checked={directPwForceChange}
                      onCheckedChange={(v) => setDirectPwForceChange(!!v)}
                      className="mt-0.5"
                    />
                    <span className="tf-body-secondary">Require the user to change this password on next login</span>
                  </label>
                </>
              )}
            </div>
        </AppModal>
      )}

      {/* RBAC07: Dependency Matrix Modal */}
      <DependencyMatrix
        isOpen={isDependencyMatrixOpen}
        onClose={() => setIsDependencyMatrixOpen(false)}
      />

      {/* Add Seats Modal - opens when user limit is exhausted */}
      <AddSeatsModal
        isOpen={showAddSeatsModal}
        onClose={() => setShowAddSeatsModal(false)}
        currentSeats={limits?.current_users ?? users.length}
        maxSeats={limits?.max_users ?? 0}
        planName={limits?.plan_name ?? ''}
        onSuccess={() => {
          setShowAddSeatsModal(false);
          setSeatQuotaRefreshTrigger(t => t + 1);
          loadUsers();
          refreshLimits();
        }}
      />

      {/* User details — read only. This person's access comes from their role. */}
      {viewingUser && (() => {
        const role = roleOfUser(viewingUser);
        const isOwner = (viewingUser.role || '').toLowerCase() === 'tenant_admin';
        return (
          <AppModal
            open
            size="lg"
            mobileSheet
            onCancel={() => setViewingUser(null)}
            cancelLabel="Close"
            icon={<Eye />}
            title="User details"
            subtitle="Read only. This person's access comes from their role."
          >
            <div className="mb-5 flex flex-col gap-4 border-b border-gray-100 pb-5 dark:border-slate-800 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <NameAvatar name={viewingUser.name} fallback={viewingUser.email} src={viewingUser.avatar_url} userId={viewingUser.id} size="lg" />
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-gray-900 dark:text-slate-100">{viewingUser.name || viewingUser.email}</div>
                  <div className="truncate text-[13px] text-gray-500 dark:text-slate-400">{viewingUser.email}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4 sm:flex sm:gap-6">
                <div className="min-w-0">
                  <div className="text-xs text-gray-500 dark:text-slate-400">Role</div>
                  <div className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100">{role?.name ?? getRoleLabel(viewingUser.role, availableRoles)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 dark:text-slate-400">Status</div>
                  <Badge variant={viewingUser.is_active ? 'success' : 'destructive'}>
                    {viewingUser.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-gray-500 dark:text-slate-400">Last login</div>
                  <div
                    className="truncate text-sm font-semibold text-gray-900 dark:text-slate-100"
                    title={viewingUser.last_login ? formatIST(viewingUser.last_login) : undefined}
                  >
                    {viewingUser.last_login ? (relativeTimeFromNow(viewingUser.last_login) ?? formatIST(viewingUser.last_login)) : 'Never'}
                  </div>
                </div>
              </div>
            </div>
            {role ? (
              <RoleAccessSummary codes={codesOfRole(role)} roleName={role.name} description={role.description} />
            ) : (
              <p className="text-sm text-gray-500 dark:text-slate-400">
                {isOwner
                  ? 'The account owner has full access to everything.'
                  : rolesLoaded
                    ? "This user's role could not be found."
                    : 'Loading role…'}
              </p>
            )}
          </AppModal>
        );
      })()}
      <AppModal
        open={!!identityOtp}
        onCancel={cancelIdentityOtp}
        size="sm"
        zIndexClass="z-[70]"
        icon={<Mail />}
        title="Enter verification code"
        subtitle="Step 2 of 2 — confirm the change"
        cancelLabel="Cancel change"
        cancelDisabled={isSaving || identityOtpBusy}
        actions={[
          { label: 'Send new code', variant: 'secondary', onClick: resendIdentityOtp, disabled: isSaving || identityOtpBusy },
          {
            label: 'Verify & Save',
            onClick: () => identityOtp && handleUpdateUser({ code: identityOtpCode.trim(), requestId: identityOtp.requestId }),
            disabled: isSaving || identityOtpBusy || identityOtpCode.trim().length < 6,
            icon: isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : undefined,
          },
        ]}
      >
        <div className="space-y-4 tf-body">
          {identityChanges.length > 0 && (
            <div className="rounded-xl border border-gray-200 dark:border-slate-700 p-3">
              <p className="mb-2 tf-eyebrow tracking-wide">What will change</p>
              <div className="space-y-1.5">
                {identityChanges.map(c => (
                  <div key={c.field} className="grid grid-cols-[3.5rem_1fr] gap-2 text-sm">
                    <span className="font-medium text-gray-500 dark:text-slate-400">{c.field}</span>
                    <span className="min-w-0 break-words">
                      <span className="text-gray-400 line-through dark:text-slate-500">{c.from}</span>
                      <span className="mx-1.5 text-gray-400">→</span>
                      <span className="font-semibold text-gray-900 dark:text-slate-50">{c.to}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <ol className="space-y-2">
            <li className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-success text-white"><Check className="h-3 w-3" /></span>
              <span>
                {identityOtp?.alreadySent ? 'A code was already sent' : 'A 6-digit code was emailed'} to{' '}
                <span className="font-semibold text-gray-900 dark:text-slate-50 break-all">{identityOtp?.sentTo}</span>
              </span>
            </li>
            <li className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-blue text-xs font-semibold text-white">2</span>
              <span>Ask the user to check that inbox and share the code with you</span>
            </li>
            <li className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-blue text-xs font-semibold text-white">3</span>
              <span>Type it below and click <span className="font-semibold">Verify &amp; Save</span></span>
            </li>
          </ol>

          <div>
            <label className="mb-1.5 block tf-label">6-digit code</label>
            <Input
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={identityOtpCode}
              maxLength={6}
              onChange={(e) => { setIdentityOtpCode(e.target.value.replace(/\D/g, '')); setIdentityOtpError(''); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && identityOtp && identityOtpCode.trim().length === 6 && !isSaving) {
                  handleUpdateUser({ code: identityOtpCode.trim(), requestId: identityOtp.requestId });
                }
              }}
              className="text-center tracking-[0.5em] font-mono text-lg max-sm:text-base"
            />
            {identityOtpError && <p className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">{identityOtpError}</p>}
          </div>

          <p className="tf-meta">
            Nothing is saved until the code is verified. The code works for 10 minutes — if it didn&apos;t arrive, ask the
            user to check spam, or click <span className="font-semibold">Send new code</span>. <span className="font-semibold">Cancel change</span> keeps the old {identityChanges.length === 1 ? identityChanges[0].field.toLowerCase() : 'name and email'}.
          </p>
        </div>
      </AppModal>
    </div>
  );
}
